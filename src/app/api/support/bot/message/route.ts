export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import { SUPPORT_IA_SYSTEM_PROMPT } from '@/lib/support/knowledge';
import { motifUsesInstructor, ticketChannelName, type SupportStatus } from '@/lib/support/motifs';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';
import {
  iaOffersResolution,
  RESOLUTION_PANEL_TEXT,
  stripResoluMarker,
  TICKET_ACTION_COMPONENTS,
  ticketAlreadyOfferedResolution,
  withResolutionOfferedNote,
} from '@/lib/support/ticket-actions';
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
  withExtras = true
): Promise<{ text: string | null; status: number; data: unknown }> {
  const reasoning = /gpt-oss|qwen3/i.test(model);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // Plafond partagé avec les tokens de raisonnement, et compté dans le quota
      // de 8K tokens/minute : assez pour une réponse de support, pas plus.
      max_tokens: reasoning ? 900 : 450,
      ...(reasoning && withExtras ? { reasoning_effort: 'low' } : {}),
      messages,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[support-message] LLM HTTP', res.status, model, JSON.stringify(data).slice(0, 600));
    if (withExtras && isBadParamError(res.status, data)) {
      console.warn('[support-message] paramètre refusé, nouvel essai sans options', model);
      return callLlm(base, key, model, messages, false);
    }
    return { text: null, status: res.status, data };
  }
  const choice = (data as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> })
    ?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    return { text: content.trim().slice(0, 1800), status: res.status, data };
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
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
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
      const { text, status, data } = await callLlm(base, key, model, messages);
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

  // Demandeur (même staff/owner) : l’IA répond toujours, y compris si un faux
  // relais a déjà mis statut=staff / salon 🟢 (ticket déjà cassé).
  if (String(ticket.statut || '') === 'staff' && (requesterSpeaking || !staffTakeover)) {
    console.info('[support-message] reprise IA malgré statut staff (demandeur, pas un autre staff)', {
      shortId: ticket.short_id,
      requesterSpeaking,
    });
  }

  const messages = toLlmMessages(
    SUPPORT_IA_SYSTEM_PROMPT,
    ticketContextBlock({
      short_id: ticket.short_id,
      motif: ticket.motif,
      reason_text: ticket.reason_text,
      discord_username: ticket.discord_username,
      memory_notes: memory,
    }),
    turns,
    content
  );

  let llm: LlmResult;
  try {
    llm = await llmReply(messages);
  } catch (e) {
    console.error('[support-message] llmReply', e);
    llm = { ok: false, reason: 'exception' };
  }

  let rawReply: string;
  let escalate: boolean;
  if (llm.ok) {
    rawReply = llm.text;
    escalate = memberNeedsStaff(content) || iaCallsStaff(rawReply);
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

  const alreadyOffered = ticketAlreadyOfferedResolution(ticket);
  const offerPanel = llm.ok && iaOffersResolution(rawReply, escalate) && !alreadyOffered;
  const userSaysNotResolved = /pas r[eé]solu|n['’]est pas r[eé]solu|appeler un staff/i.test(content);
  const clearOffer = (escalate || userSaysNotResolved) && !offerPanel;
  const reply = stripResoluMarker(rawReply);

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

  return NextResponse.json({ ok: true, statut, escalate, resolution_offered: offerPanel || alreadyOffered });
}
