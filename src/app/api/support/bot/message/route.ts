export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import { SUPPORT_IA_SYSTEM_PROMPT } from '@/lib/support/knowledge';
import { aeroschoolBlock, findAeroschoolForms } from '@/lib/support/aeroschool-catalog';
import {
  chunksFromSource,
  docsBlock,
  extractDocRequest,
  searchDocs,
  stripDocMarker,
  type DocChunk,
  type DocSourceId,
} from '@/lib/support/doc-index';
import {
  isAccountCreationTopic,
  isAtcTrainingTopic,
  isTrainingRequest,
  motifUsesInstructor,
  ticketChannelName,
  type SupportStatus,
} from '@/lib/support/motifs';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';
import { finalizeReply } from '@/lib/support/reply-format';
import { buildRequesterContext } from '@/lib/support/requester-context';
import {
  iaOffersResolution,
  isAffirmativeResolutionAnswer,
  isNegativeResolutionAnswer,
  RESOLUTION_PANEL_TEXT,
  stripResoluMarker,
  stripResolutionQuestion,
  TICKET_ACTION_COMPONENTS,
  ticketAlreadyOfferedResolution,
  withResolutionOfferedNote,
} from '@/lib/support/ticket-actions';
import { closeSupportTicket } from '@/lib/support/close-ticket';
import { escalateTicketToStaff } from '@/lib/support/escalate';
import { isOtherStaffTakeover, STAFF_TAKEOVER_NOTICE } from '@/lib/support/staff-takeover';
import {
  extractFacts,
  mergeMemory,
  ticketContextBlock,
  toLlmMessages,
  trimConversation,
  type TicketTurn,
} from '@/lib/support/ticket-memory';

export const maxDuration = 60;

/** 1er échec LLM : on reste honnête et on relance la personne, sans mobiliser le staff. */
const LLM_SOFT_FALLBACK =
  'Je n’ai pas réussi à traiter ta demande à l’instant — c’est un souci technique de mon côté, pas de ta faute. Peux-tu la reformuler en une phrase, ou me dire sur quelle page du site tu bloques ? Je réessaie tout de suite.';

/** 2e échec consécutif : là, le staff est légitime. */
const LLM_HARD_FALLBACK =
  'Je n’arrive toujours pas à te répondre correctement. Je passe la main à un staff.';

/**
 * Sujets réservés au staff. Évalué UNIQUEMENT sur le message du membre : évaluer
 * aussi la réponse IA faisait escalader un refus poli (« je ne peux pas parler de
 * l’hébergement ») ou le texte de repli du bot lui-même.
 */
function memberNeedsStaff(text: string): boolean {
  const t = text.toLowerCase();
  if (/virement|solde d.un autre|(mot de passe|compte|sanction)s? d.un autre/.test(t)) return true;
  if (/h[ée]berg|github|supabase|vercel|code source|nom de domaine|dns/.test(t)) return true;
  return false;
}

/** L’IA demande explicitement un staff — à n’évaluer que sur une vraie réponse du modèle. */
function iaCallsStaff(iaText: string): boolean {
  return /appeler un staff|j['’]appelle un staff|un staff (va|sera) (être |etre )?(appel|contact|pr[ée]venu)|je passe la main à un staff/i.test(
    iaText
  );
}

/** Le tour précédent était déjà un échec LLM → on n’insiste pas une deuxième fois pour rien. */
function lastAssistantWasLlmFailure(turns: TicketTurn[]): boolean {
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role !== 'assistant') continue;
    return turns[i].content.trim() === LLM_SOFT_FALLBACK;
  }
  return false;
}

function parseTurns(raw: unknown): TicketTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: TicketTurn[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const role = (t as TicketTurn).role;
    const content = String((t as TicketTurn).content || '').trim();
    if (!content) continue;
    if (role === 'user' || role === 'assistant' || role === 'staff') {
      out.push({ role, content });
    }
  }
  return out;
}

/** Modèle Groq de production courant (llama-3.3-70b-versatile a été retiré le 16/08/2026). */
const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
/** Repli si le modèle principal disparaît à son tour ou sature son quota (limites par modèle). */
const GROQ_BACKUP_MODEL = 'openai/gpt-oss-20b';

type LlmResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Erreurs qui disparaissent en changeant de modèle : modèle retiré du catalogue,
 * ou quota atteint (Groq compte le débit par modèle, pas par compte).
 */
function worthRetryingOnAnotherModel(status: number, data: unknown): boolean {
  if (status === 429) return true;
  if (status !== 404 && status !== 400) return false;
  const blob = JSON.stringify(data ?? {});
  return /model_not_found|model_decommissioned|does not exist|decommissioned/i.test(blob);
}

function isBadParamError(status: number, data: unknown): boolean {
  if (status !== 400) return false;
  return /unsupported|unrecognized|not supported|invalid.*(parameter|argument)|reasoning_effort/i.test(
    JSON.stringify(data ?? {})
  );
}

async function callLlm(
  base: string,
  key: string,
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  withExtras = true,
  budget?: number
): Promise<{ text: string | null; status: number; data: unknown }> {
  const reasoning = /gpt-oss|qwen3/i.test(model);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // Plafond partagé avec les tokens de raisonnement. Le style imposé par le
      // prompt garde la réponse courte ; ce plafond n'est qu'un garde-fou, et
      // `finalizeReply` recoupe proprement si le modèle le touche quand même.
      max_tokens: budget ?? (reasoning ? 1100 : 500),
      ...(reasoning && withExtras ? { reasoning_effort: 'low' } : {}),
      messages,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[support-message] LLM HTTP', res.status, model, JSON.stringify(data).slice(0, 600));
    if (withExtras && isBadParamError(res.status, data)) {
      console.warn('[support-message] paramètre refusé, nouvel essai sans options', model);
      return callLlm(base, key, model, messages, false, budget);
    }
    return { text: null, status: res.status, data };
  }
  const choice = (data as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> })
    ?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    const truncated = choice?.finish_reason === 'length';
    if (truncated) {
      console.warn('[support-message] réponse plafonnée par max_tokens, recoupe propre', model);
    }
    return { text: finalizeReply(content, truncated), status: res.status, data };
  }
  console.error(
    '[support-message] LLM 200 sans contenu',
    model,
    'finish_reason=',
    choice?.finish_reason,
    JSON.stringify(data).slice(0, 600)
  );
  return { text: null, status: res.status, data };
}

async function llmReply(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  budget?: number
): Promise<LlmResult> {
  const groqKey = process.env.GROQ_API_KEY || process.env.SUPPORT_LLM_API_KEY;
  const key = groqKey || process.env.OPENAI_API_KEY;
  const useGroq = Boolean(process.env.SUPPORT_LLM_BASE_URL?.includes('groq') || (!process.env.SUPPORT_LLM_BASE_URL && groqKey));
  const base = (process.env.SUPPORT_LLM_BASE_URL || (useGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
  const configured = process.env.SUPPORT_LLM_MODEL || (useGroq ? GROQ_DEFAULT_MODEL : 'gpt-4o-mini');
  const candidates = useGroq
    ? Array.from(new Set([configured, GROQ_DEFAULT_MODEL, GROQ_BACKUP_MODEL]))
    : [configured];
  if (!key) {
    console.error('[support-message] aucune clé LLM (GROQ_API_KEY / OPENAI_API_KEY)');
    return { ok: false, reason: 'no_api_key' };
  }
  let reason = 'unknown';
  for (const model of candidates) {
    try {
      const { text, status, data } = await callLlm(base, key, model, messages, true, budget);
      if (text) {
        if (model !== configured) {
          console.warn('[support-message] modèle de secours utilisé', model, '(configuré:', configured, ')');
        }
        return { ok: true, text };
      }
      reason = `http_${status}`;
      // Un 401 ou un 500 se reproduira à l'identique sur les autres candidats.
      if (!worthRetryingOnAnotherModel(status, data)) break;
    } catch (e) {
      console.error('[support-message] LLM fetch', model, e);
      reason = 'fetch_error';
      break;
    }
  }
  return { ok: false, reason };
}

async function updateTicketRow(
  admin: ReturnType<typeof createAdminClient>,
  ticketId: string,
  patch: Record<string, unknown>
) {
  const { error } = await admin.from('support_tickets').update(patch).eq('id', ticketId);
  if (error && /resolution_offered/i.test(error.message || '')) {
    const fallback = { ...patch };
    delete fallback.resolution_offered;
    const { error: err2 } = await admin.from('support_tickets').update(fallback).eq('id', ticketId);
    if (err2) throw new Error(err2.message);
    return;
  }
  if (error) throw new Error(error.message);
}

export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const channelId = String(body.channel_id || '');
  const content = String(body.content || '').trim();
  const fromStaffRole = Boolean(body.from_staff);
  const authorDiscordId = String(body.discord_user_id || '').trim();
  if (!channelId || !content) {
    return NextResponse.json({ error: 'channel_id et content requis' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('*')
    .eq('channel_id', channelId)
    .is('closed_at', null)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Ticket introuvable' }, { status: 404 });

  const openerDiscordId = String(ticket.discord_user_id || '').trim();
  const staffTakeover = isOtherStaffTakeover(fromStaffRole, authorDiscordId, openerDiscordId);
  const requesterSpeaking =
    Boolean(authorDiscordId) && Boolean(openerDiscordId) && authorDiscordId === openerDiscordId;

  console.info('[support-message]', {
    channelId,
    shortId: ticket.short_id,
    fromStaffRole,
    staffTakeover,
    requesterSpeaking,
    authorDiscordId,
    statut: ticket.statut,
    contentLen: content.length,
  });

  const turns = parseTurns(ticket.conversation);
  let memory = mergeMemory(ticket.memory_notes || '', extractFacts(content));

  if (staffTakeover) {
    const alreadyHandedOver = String(ticket.statut || '') === 'staff';
    const nextTurns = trimConversation([...turns, { role: 'staff', content }]);
    await updateTicketRow(admin, ticket.id, {
      statut: 'staff',
      conversation: nextTurns,
      memory_notes: memory,
      last_human_at: new Date().toISOString(),
      last_nudge_at: null,
      inactivity_nudge: 0,
      updated_at: new Date().toISOString(),
    });
    try {
      await discordRenameChannel(channelId, ticketChannelName('staff', ticket.short_id));
    } catch { /* ignore */ }
    if (!alreadyHandedOver) {
      try {
        await discordSendMessage(channelId, STAFF_TAKEOVER_NOTICE);
      } catch (e) {
        console.error('[support-message] takeover notice', e);
      }
    }
    return NextResponse.json({ ok: true, statut: 'staff', reply: null, handed_over: true });
  }

  // Une proposition de clôture est en attente : « oui » écrit doit suffire à
  // fermer, « non » doit appeler le staff. Personne n'est obligé de cliquer.
  const offerPending = ticketAlreadyOfferedResolution(ticket);
  if (offerPending) {
    if (requesterSpeaking && isAffirmativeResolutionAnswer(content)) {
      try {
        await discordSendMessage(channelId, 'Parfait, je ferme le ticket. Bons vols !');
      } catch { /* le salon disparaît juste après, ce n'est pas bloquant */ }
      const closed = await closeSupportTicket({
        channelId,
        closedBy: `user:${openerDiscordId || 'unknown'}`,
      });
      console.info('[support-message] clôture sur réponse affirmative', {
        shortId: ticket.short_id,
        ok: closed.ok,
      });
      return NextResponse.json({ ok: true, statut: 'ferme', closed: true, reply: null });
    }
    if (isNegativeResolutionAnswer(content)) {
      await updateTicketRow(admin, ticket.id, {
        statut: 'staff_needed',
        conversation: trimConversation([...turns, { role: 'user', content }]),
        memory_notes: withResolutionOfferedNote(memory, false),
        resolution_offered: false,
        last_human_at: new Date().toISOString(),
        last_nudge_at: null,
        inactivity_nudge: 0,
        updated_at: new Date().toISOString(),
      });
      await escalateTicketToStaff(channelId, "L'utilisateur indique que ce n'est pas résolu.");
      return NextResponse.json({ ok: true, statut: 'staff_needed', escalate: true, reply: null });
    }
  }

  // Demandeur (même staff/owner) : l’IA répond toujours, y compris si un faux
  // relais a déjà mis statut=staff / salon 🟢 (ticket déjà cassé).
  if (String(ticket.statut || '') === 'staff' && (requesterSpeaking || !staffTakeover)) {
    console.info('[support-message] reprise IA malgré statut staff (demandeur, pas un autre staff)', {
      shortId: ticket.short_id,
      requesterSpeaking,
    });
  }

  // Sujet du ticket = motif + demande initiale + message courant. Il pilote à la
  // fois le choix des documents injectés et la recherche de questionnaires.
  const topicText = `${ticket.motif || ''} ${ticket.reason_text || ''} ${content}`;
  const hasAccount = Boolean(ticket.user_id);

  // Le dossier vient de la base à chaque message : les licences, QCM et
  // demandes d'instruction bougent pendant la vie du ticket.
  const [requesterContext, aeroschoolMatches] = await Promise.all([
    buildRequesterContext(admin, ticket.user_id as string | null),
    findAeroschoolForms(admin, topicText, { hasAccount }).catch((e) => {
      console.error('[support-message] recherche AeroSchool', e);
      return [];
    }),
  ]);

  // Filet supplémentaire contre la confusion « training Approach » → CAT pilote.
  const isAtcTopic = isAtcTrainingTopic(`${ticket.reason_text || ''} ${content}`);
  const atcHint = isAtcTopic
    ? 'Sujet détecté : formation ou position de CONTRÔLE AÉRIEN (ATC). Réponds avec la documentation ATC, jamais avec le parcours CAT pilote.'
    : '';

  // Recherche documentaire : seuls les extraits utiles partent au modèle.
  const isPilotCatTopic = !isAtcTopic && /\bcat ?[1-5]\b|categorie|catégorie/i.test(topicText);
  const prefer: DocSourceId[] = isAtcTopic ? ['atc', 'manuel'] : isPilotCatTopic ? ['pilote'] : [];
  // Le bug d'origine : « training Approach » ramenait le livret CAT pilote.
  const penalize: DocSourceId[] = isAtcTopic
    ? ['pilote', 'site']
    : isPilotCatTopic
      ? ['atc', 'manuel', 'site']
      : [];
  const docChunks = isAccountCreationTopic(content)
    ? chunksFromSource('site', 2)
    : searchDocs(topicText, { limit: 3, prefer, penalize });

  const buildMessages = (chunks: DocChunk[], history: TicketTurn[] = turns) =>
    toLlmMessages(
      SUPPORT_IA_SYSTEM_PROMPT,
      [
        ticketContextBlock({
          short_id: ticket.short_id,
          motif: ticket.motif,
          reason_text: ticket.reason_text,
          memory_notes: memory,
        }),
        requesterContext,
        aeroschoolBlock(aeroschoolMatches, { hasAccount }),
        docsBlock(chunks),
        atcHint,
      ]
        .filter(Boolean)
        .join('\n\n'),
      history,
      content
    );

  let llm: LlmResult;
  try {
    llm = await llmReply(buildMessages(docChunks));
  } catch (e) {
    console.error('[support-message] llmReply', e);
    llm = { ok: false, reason: 'exception' };
  }

  // Le modèle réclame de la documentation : une seule recherche supplémentaire,
  // jamais de boucle (latence + quota Groq de 8K tokens/minute).
  let docLookupFailed = false;
  if (llm.ok) {
    const wanted = extractDocRequest(llm.text);
    if (wanted) {
      const extra = searchDocs(wanted, {
        limit: 4,
        prefer,
        penalize,
        excludeIds: docChunks.map((chunk) => chunk.id),
      });
      console.info('[support-message] second passage documentaire', {
        shortId: ticket.short_id,
        wanted,
        found: extra.length,
      });
      if (extra.length > 0) {
        try {
          // Second appel volontairement compact : mêmes consignes, plus d'extraits,
          // mais historique réduit pour rester dans les 8K tokens/minute de Groq.
          const retry = await llmReply(buildMessages([...docChunks, ...extra], turns.slice(-4)), 800);
          // Un modèle qui redemande de la doc au second tour n'obtiendra rien de
          // plus : on bascule sur le staff plutôt que de renvoyer un marqueur.
          llm = retry.ok && !extractDocRequest(retry.text) ? retry : llm;
          docLookupFailed = !retry.ok || Boolean(retry.ok && extractDocRequest(retry.text));
        } catch (e) {
          console.error('[support-message] second passage', e);
          docLookupFailed = true;
        }
      } else {
        docLookupFailed = true;
      }
      if (docLookupFailed) {
        llm = {
          ok: true,
          text: `Je ne trouve pas cette information dans la documentation du site (${wanted}). Je préfère ne rien inventer : je passe la main à un staff qui va te répondre précisément.`,
        };
      }
    }
  }

  let rawReply: string;
  let escalate: boolean;
  if (llm.ok) {
    rawReply = llm.text;
    // Une demande de training se planifie avec un humain : l'IA donne la marche
    // à suivre, l'instructeur prend le relais pour poser le créneau.
    const needsInstructor = isTrainingRequest(content) && String(ticket.statut || '') !== 'staff_needed';
    escalate = docLookupFailed || memberNeedsStaff(content) || iaCallsStaff(rawReply) || needsInstructor;
  } else {
    // Un échec technique isolé ne justifie pas de réveiller le staff : on le dit
    // honnêtement et on n'escalade qu'au deuxième échec d'affilée.
    const secondFailure = lastAssistantWasLlmFailure(turns);
    rawReply = secondFailure ? LLM_HARD_FALLBACK : LLM_SOFT_FALLBACK;
    escalate = secondFailure || memberNeedsStaff(content);
    console.error('[support-message] réponse IA indisponible', {
      shortId: ticket.short_id,
      reason: llm.reason,
      secondFailure,
      escalate,
    });
  }

  // Le marqueur seul déclenche la proposition, et elle part TOUJOURS avec les
  // boutons — y compris si une proposition avait déjà été faite plus tôt.
  const offerPanel = llm.ok && iaOffersResolution(rawReply, escalate);
  const userSaysNotResolved = /pas r[eé]solu|n['’]est pas r[eé]solu|appeler un staff/i.test(content);
  const clearOffer = (escalate || userSaysNotResolved) && !offerPanel;
  const reply = stripResolutionQuestion(stripDocMarker(stripResoluMarker(rawReply)));

  const statut: SupportStatus = escalate ? 'staff_needed' : 'waiting';
  const nextTurns = trimConversation([
    ...turns,
    { role: 'user', content },
    { role: 'assistant', content: reply },
  ]);

  if (offerPanel) {
    memory = withResolutionOfferedNote(memory, true);
  } else if (clearOffer) {
    memory = withResolutionOfferedNote(memory, false);
  }

  await updateTicketRow(admin, ticket.id, {
    statut,
    conversation: nextTurns,
    memory_notes: memory,
    last_human_at: new Date().toISOString(),
    last_nudge_at: null,
    inactivity_nudge: 0,
    updated_at: new Date().toISOString(),
    ...(offerPanel ? { resolution_offered: true } : clearOffer ? { resolution_offered: false } : {}),
  });

  try {
    await discordRenameChannel(channelId, ticketChannelName(statut, ticket.short_id));
  } catch { /* ignore */ }

  const cfg = await getSupportConfig();
  let out = reply;
  if (escalate) {
    const pings: string[] = [];
    if (cfg?.staff_role_id) pings.push(`<@&${cfg.staff_role_id}>`);
    if (
      cfg?.instructor_role_id &&
      motifUsesInstructor(String(ticket.motif), cfg.instructor_motifs as string[] | null)
    ) {
      pings.push(`<@&${cfg.instructor_role_id}>`);
    }
    if (pings.length) {
      const who = cfg?.instructor_role_id && motifUsesInstructor(String(ticket.motif), cfg.instructor_motifs as string[] | null)
        ? 'Un staff / instructeur est requis.'
        : 'Un staff est requis.';
      out = `${reply}\n\n${[...new Set(pings)].join(' ')} **${who}**`;
    }
  }

  try {
    await discordSendMessage(channelId, out || '…');
    if (offerPanel) {
      await discordSendMessage(channelId, RESOLUTION_PANEL_TEXT, {
        components: TICKET_ACTION_COMPONENTS,
      });
    }
  } catch (e) {
    console.error('[support-message] discordSendMessage', e);
    return NextResponse.json({ error: 'discord_send_failed', statut, escalate }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    statut,
    escalate,
    resolution_offered: offerPanel || (offerPending && !clearOffer),
  });
}
