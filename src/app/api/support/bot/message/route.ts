export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import { SUPPORT_IA_SYSTEM_PROMPT } from '@/lib/support/knowledge';
import { aeroschoolBlock, findAeroschoolForms } from '@/lib/support/aeroschool-catalog';
import {
  directoryBlock,
  findDirectoryMatches,
  pickIfsaAgentMention,
  stripIfsaPingMarker,
  ticketAlreadyPingedIfsa,
  wantsIfsaPing,
  withIfsaPingNote,
} from '@/lib/support/annuaire';
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
  isAmbiguousGroundTopic,
  isAtcTopic,
  isAtcTrainingTopic,
  isGroundCrewTopic,
  isTrainingRequest,
  ticketChannelName,
  type SupportStatus,
} from '@/lib/support/motifs';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';
import { llmReply, type LlmResult } from '@/lib/support/llm';
import { buildRequesterContext } from '@/lib/support/requester-context';
import {
  isAffirmativeResolutionAnswer,
  isNegativeResolutionAnswer,
  messageIsQuestion,
  RESOLUTION_PANEL_TEXT,
  shouldOfferResolution,
  stripResoluMarker,
  stripResolutionQuestion,
  TICKET_ACTION_COMPONENTS,
  ticketAlreadyOfferedResolution,
  withResolutionOfferedNote,
} from '@/lib/support/ticket-actions';
import { closeSupportTicket } from '@/lib/support/close-ticket';
import { escalateTicketToStaff, staffPingLine } from '@/lib/support/escalate';
import { isChatter } from '@/lib/support/message-intent';
import {
  authoritativeSupportReply,
  CLARIFICATION_ONBOARDING,
  hasUnresolvedAuthIssue,
  isIfsaSubject,
  sanitizeOfficialSiteUrl,
  shouldHonorIfsaPing,
  updateClarificationMemory,
} from '@/lib/support/guardrails';
import { detectMentionIntent } from '@/lib/support/mention-actions';
import { runMentionCommand } from '@/lib/support/mention-commands';
import { IA_RESUME_PATCH } from '@/lib/support/resume-ia';
import {
  iaIsMuted,
  IA_RESUMED_NOTICE,
  isOtherStaffTakeover,
  isRealStaffIntervention,
  STAFF_TAKEOVER_NOTICE,
} from '@/lib/support/staff-takeover';
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

/**
 * Idempotence : un même message Discord ne doit produire qu'une seule réponse.
 * L'UPDATE conditionnel sert de verrou atomique — deux appels concurrents pour
 * le même `message_id` ne peuvent pas gagner tous les deux la course.
 */
async function claimDiscordMessage(
  admin: ReturnType<typeof createAdminClient>,
  ticketId: string,
  messageId: string
): Promise<boolean> {
  const id = messageId.replace(/\D/g, '');
  if (!id) return true;
  const { data, error } = await admin
    .from('support_tickets')
    .update({ last_discord_message_id: id })
    .eq('id', ticketId)
    .or(`last_discord_message_id.is.null,last_discord_message_id.neq.${id}`)
    .select('id');
  // Colonne absente (migration pas encore passée) : on ne bloque pas le bot.
  if (error) return true;
  return (data?.length ?? 0) > 0;
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
  const messageId = String(body.message_id || '').trim();
  const mentionsBot = Boolean(body.mentions_bot);
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

  if (messageId && !(await claimDiscordMessage(admin, ticket.id, messageId))) {
    console.info('[support-message] message Discord déjà traité', {
      shortId: ticket.short_id,
      messageId,
    });
    return NextResponse.json({ ok: true, duplicate: true, reply: null });
  }

  const openerDiscordId = String(ticket.discord_user_id || '').trim();
  const requesterSpeaking =
    Boolean(authorDiscordId) && Boolean(openerDiscordId) && authorDiscordId === openerDiscordId;
  const staffSpeaking = isOtherStaffTakeover(fromStaffRole, authorDiscordId, openerDiscordId);
  // Ni le demandeur, ni un staff : un curieux de passage. Il ne pilote rien et
  // ses messages ne comptent pas comme activité du ticket (délais d'inactivité).
  const thirdParty = Boolean(authorDiscordId) && !requesterSpeaking && !fromStaffRole;
  const muted = iaIsMuted(ticket);
  const nowIso = new Date().toISOString();

  console.info('[support-message]', {
    channelId,
    shortId: ticket.short_id,
    fromStaffRole,
    staffSpeaking,
    requesterSpeaking,
    thirdParty,
    muted,
    mentionsBot,
    authorDiscordId,
    statut: ticket.statut,
    contentLen: content.length,
  });

  if (thirdParty) {
    return NextResponse.json({ ok: true, ignored: 'membre_tiers', reply: null });
  }

  const turns = parseTurns(ticket.conversation);
  let memory = mergeMemory(ticket.memory_notes || '', extractFacts(content));
  const clarification = requesterSpeaking
    ? updateClarificationMemory(memory, content)
    : { memory, count: 0, showOnboarding: false };
  memory = clarification.memory;

  /** Le message est archivé dans le fil, mais le bot ne répond pas. */
  const recordSilently = async (role: 'user' | 'staff', patch: Record<string, unknown> = {}) => {
    await updateTicketRow(admin, ticket.id, {
      conversation: trimConversation([...turns, { role, content }]),
      memory_notes: memory,
      last_human_at: nowIso,
      last_nudge_at: null,
      inactivity_nudge: 0,
      updated_at: nowIso,
      ...patch,
    });
  };

  // ---------------------------------------------------------------------
  // Relais staff : état PERSISTANT du ticket, pas une décision par message.
  // Un staff qui plaisante (« trop styleee ») ne coupe plus l'IA ; un staff qui
  // intervient vraiment la coupe une fois pour toutes, avec une seule annonce.
  // ---------------------------------------------------------------------
  if (staffSpeaking && !mentionsBot) {
    const startsTakeover = !muted && isRealStaffIntervention(content);
    const announce = startsTakeover && !ticket.staff_takeover_notified;
    await recordSilently(
      'staff',
      startsTakeover
        ? {
            statut: 'staff',
            staff_takeover_at: nowIso,
            staff_takeover_notified: true,
            staff_pinged_at: null,
          }
        : {},
    );
    if (startsTakeover) {
      try {
        await discordRenameChannel(channelId, ticketChannelName('staff', ticket.short_id));
      } catch { /* ignore */ }
    }
    if (announce) {
      try {
        await discordSendMessage(channelId, STAFF_TAKEOVER_NOTICE);
      } catch (e) {
        console.error('[support-message] takeover notice', e);
      }
    }
    return NextResponse.json({
      ok: true,
      statut: startsTakeover || muted ? 'staff' : String(ticket.statut || ''),
      reply: null,
      handed_over: startsTakeover || muted,
    });
  }

  // Silence persistant : tant que le staff tient le ticket, l'IA ne répond à
  // personne, pas même au demandeur. Aucun appel LLM, aucun token dépensé.
  if (muted && !mentionsBot) {
    await recordSilently('user');
    return NextResponse.json({ ok: true, statut: 'staff', muted: true, reply: null });
  }

  // Protocole de commande : [mention du bot] + [demande]. La mention réactive
  // l'IA ET porte l'instruction. Sans mention, aucune action n'est exécutée.
  const mentionIntent = mentionsBot ? detectMentionIntent(content) : null;
  // Un staff qui donne un ordre d'administration (renommer, déplacer) continue
  // de gérer le ticket : on exécute sans relancer l'IA par-dessus lui.
  const adminOrder =
    fromStaffRole &&
    (mentionIntent?.id === 'rename' ||
      mentionIntent?.id === 'move' ||
      (mentionIntent?.id === 'unsure' && mentionIntent.about !== 'close'));
  const resumed = muted && mentionsBot && !adminOrder;
  if (mentionsBot) {
    const intent = mentionIntent;
    if (intent) {
      const result = await runMentionCommand({
        intent,
        actor: fromStaffRole ? 'staff' : 'requester',
        channelId,
        ticket: {
          id: String(ticket.id),
          short_id: String(ticket.short_id),
          statut: ticket.statut,
          motif: ticket.motif,
          discord_username: ticket.discord_username,
          discord_user_id: ticket.discord_user_id,
        },
        authorDiscordId,
      });
      console.info('[support-message] commande par mention', {
        shortId: ticket.short_id,
        action: result.action,
        closed: Boolean(result.closed),
      });
      if (result.closed) {
        return NextResponse.json({ ok: true, statut: 'ferme', closed: true, reply: null });
      }
      await recordSilently(fromStaffRole && !requesterSpeaking ? 'staff' : 'user', {
        ...(adminOrder ? {} : IA_RESUME_PATCH),
        ...(result.escalated || adminOrder || muted ? {} : { statut: 'waiting' }),
        ...(result.offeredResolution
          ? { memory_notes: withResolutionOfferedNote(memory, true), resolution_offered: true }
          : {}),
      });
      return NextResponse.json({
        ok: true,
        action: result.action,
        escalate: Boolean(result.escalated),
        resolution_offered: Boolean(result.offeredResolution),
        reply: null,
      });
    }
  }

  // Deux réponses vagues consécutives suffisent : le serveur fournit des choix
  // concrets sans redemander au modèle de reformuler la même clarification.
  if (requesterSpeaking && clarification.showOnboarding) {
    const nextTurns = trimConversation([
      ...turns,
      { role: 'user', content },
      { role: 'assistant', content: CLARIFICATION_ONBOARDING },
    ]);
    await updateTicketRow(admin, ticket.id, {
      statut: 'waiting',
      conversation: nextTurns,
      memory_notes: memory,
      last_human_at: nowIso,
      last_nudge_at: null,
      inactivity_nudge: 0,
      updated_at: nowIso,
      resolution_offered: false,
    });
    try {
      await discordSendMessage(channelId, CLARIFICATION_ONBOARDING);
    } catch (e) {
      console.error('[support-message] onboarding clarification', e);
      return NextResponse.json({ error: 'discord_send_failed', statut: 'waiting' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, statut: 'waiting', onboarding: true });
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

  // Bavardage : « MDR », « XD », « merci », une vanne entre membres. Le bot
  // répondait par une phrase creuse suivie d'une proposition de clôture ; il se
  // tait désormais. Une mention explicite du bot passe outre : on l'a appelé.
  if (!mentionsBot && isChatter(content)) {
    console.info('[support-message] message sans demande — silence', {
      shortId: ticket.short_id,
      contentLen: content.length,
    });
    await recordSilently('user');
    return NextResponse.json({ ok: true, ignored: 'hors_demande', reply: null });
  }

  // Sujet du ticket = motif + demande initiale + message courant. Il pilote à la
  // fois le choix des documents injectés et la recherche de questionnaires.
  const topicText = `${ticket.motif || ''} ${ticket.reason_text || ''} ${content}`;
  const hasAccount = Boolean(ticket.user_id);

  // Le dossier vient de la base à chaque message : les licences, QCM et
  // demandes d'instruction bougent pendant la vie du ticket.
  const [requesterContext, aeroschoolMatches, directoryLookup] = await Promise.all([
    buildRequesterContext(admin, ticket.user_id as string | null),
    findAeroschoolForms(admin, topicText, { hasAccount }).catch((e) => {
      console.error('[support-message] recherche AeroSchool', e);
      return [];
    }),
    // Annuaire : n'interroge la base que si le message cherche vraiment à
    // identifier quelqu'un, et ne rend que ce que le demandeur a le droit de voir.
    findDirectoryMatches(admin, content, { requesterId: ticket.user_id as string | null }),
  ]);

  // Filets contre les confusions de vocabulaire observées en production.
  const focusText = `${ticket.reason_text || ''} ${content}`;
  const isGroundCrewTopicHere = isGroundCrewTopic(focusText);
  const isAtcSubject = isAtcTopic(focusText);
  const isIfsaTopic = isIfsaSubject(focusText);
  const groundAmbiguous = isAmbiguousGroundTopic(content);

  const hints = [
    isAtcSubject
      ? 'Sujet détecté : CONTRÔLE AÉRIEN (ATC). Réponds avec la documentation ATC, jamais avec le parcours CAT pilote.'
      : '',
    isAtcTrainingTopic(focusText)
      ? 'Il veut progresser côté ATC : utilise son dossier puis le parcours humain « Instruction → Mon Espace → Session de training (ATC) ». Un QCM ne donne jamais automatiquement un grade.'
      : '',
    isGroundCrewTopicHere
      ? 'Sujet détecté : GROUND CREW (personnel de piste). Ce n’est PAS le contrôle Ground ATC : ne parle ni de test ATC, ni de grade, ni de fréquence.'
      : '',
    groundAmbiguous
      ? 'Le mot « ground » est ambigu ici : pose UNE question pour savoir s’il parle du personnel de piste (ground crew) ou de la position de contrôle sol (ATC), et n’explique aucune procédure avant sa réponse.'
      : '',
  ].filter(Boolean);

  // Recherche documentaire : seuls les extraits utiles partent au modèle.
  const isPilotCatTopic =
    !isAtcSubject && !isGroundCrewTopicHere && /\bcat ?[1-5]\b|categorie|catégorie/i.test(topicText);
  let prefer: DocSourceId[] = [];
  // Le bug d'origine : « training Approach » ramenait le livret CAT pilote.
  let penalize: DocSourceId[] = [];
  if (isGroundCrewTopicHere || groundAmbiguous) {
    prefer = ['ground'];
    penalize = groundAmbiguous ? ['pilote', 'ifsa'] : ['pilote', 'manuel', 'atc', 'ifsa'];
  } else if (isIfsaTopic) {
    prefer = ['ifsa'];
    penalize = ['pilote', 'manuel', 'ground'];
  } else if (isAtcSubject) {
    prefer = ['atc', 'manuel'];
    penalize = ['pilote', 'site', 'ground', 'ifsa'];
  } else if (isPilotCatTopic) {
    prefer = ['pilote'];
    penalize = ['atc', 'manuel', 'site', 'ground', 'ifsa'];
  }

  const docChunks = isAccountCreationTopic(content)
    ? chunksFromSource('site', 2)
    : isGroundCrewTopicHere || groundAmbiguous
      ? chunksFromSource('ground', 3)
      : isIfsaTopic
        ? chunksFromSource('ifsa', 3)
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
        directoryBlock(directoryLookup),
        docsBlock(chunks),
        ...hints,
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
    rawReply = authoritativeSupportReply(content) || llm.text;
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

  // Appel d'un agent IFSA : le modèle a seulement posé un marqueur, c'est le
  // serveur qui choisit la personne et écrit la mention. Une seule fois par
  // ticket, et retour au ping staff s'il n'y a aucun agent joignable.
  let ifsaMention = '';
  if (llm.ok && wantsIfsaPing(rawReply)) {
    const ticketIfsaTopic = `${ticket.motif || ''} ${ticket.reason_text || ''}`;
    if (!shouldHonorIfsaPing(content, ticketIfsaTopic)) {
      console.warn('[support-message] marqueur IFSA rejeté hors sujet', {
        shortId: ticket.short_id,
        motif: ticket.motif,
      });
    } else if (ticketAlreadyPingedIfsa(memory)) {
      console.info('[support-message] agent IFSA déjà appelé sur ce ticket', { shortId: ticket.short_id });
    } else {
      ifsaMention = await pickIfsaAgentMention(admin, { excludeUserId: ticket.user_id as string | null });
      if (ifsaMention) memory = withIfsaPingNote(memory);
      else escalate = true;
    }
  }

  // Le marqueur seul déclenche la proposition, et elle part TOUJOURS avec les
  // boutons — mais elle est refusée tant que la conversation est manifestement
  // en cours (premiers échanges, étape à accomplir, nouvelle question).
  const offerPanel =
    llm.ok &&
    shouldOfferResolution(rawReply, {
      // On vient d'appeler quelqu'un : le ticket attend une réponse humaine.
      escalate: escalate || Boolean(ifsaMention),
      memberMessages: turns.filter((t) => t.role === 'user').length + 1,
      memberAsked: messageIsQuestion(content),
      alreadyOffered: offerPending,
      unresolvedAuthIssue: hasUnresolvedAuthIssue(content, turns),
    });
  const userSaysNotResolved = /pas r[eé]solu|n['’]est pas r[eé]solu|appeler un staff/i.test(content);
  const clearOffer = (escalate || userSaysNotResolved) && !offerPanel;
  const reply = sanitizeOfficialSiteUrl(
    stripResolutionQuestion(stripIfsaPingMarker(stripDocMarker(stripResoluMarker(rawReply)))),
  );

  const statut: SupportStatus = escalate ? 'staff_needed' : 'waiting';
  const nextTurns = trimConversation([
    ...turns,
    { role: 'user', content },
    // Une réponse vide ne rentre pas dans l'historique : elle n'a jamais existé.
    ...(reply ? [{ role: 'assistant' as const, content: reply }] : []),
  ]);

  if (offerPanel) {
    memory = withResolutionOfferedNote(memory, true);
  } else if (clearOffer) {
    memory = withResolutionOfferedNote(memory, false);
  }

  // Le ping staff ne part qu'une fois par situation : tant que le ticket reste
  // en attente d'un humain, on ne le réveille pas à chaque message.
  const cfg = await getSupportConfig();
  const alreadyPinged = Boolean(ticket.staff_pinged_at);
  const ping = escalate && !alreadyPinged ? staffPingLine(cfg, String(ticket.motif)) : '';

  await updateTicketRow(admin, ticket.id, {
    statut,
    conversation: nextTurns,
    memory_notes: memory,
    last_human_at: new Date().toISOString(),
    last_nudge_at: null,
    inactivity_nudge: 0,
    updated_at: new Date().toISOString(),
    staff_pinged_at: escalate ? ticket.staff_pinged_at || new Date().toISOString() : null,
    ...(resumed ? IA_RESUME_PATCH : {}),
    ...(offerPanel ? { resolution_offered: true } : clearOffer ? { resolution_offered: false } : {}),
  });

  try {
    await discordRenameChannel(channelId, ticketChannelName(statut, ticket.short_id));
  } catch { /* ignore */ }

  // Un seul message Discord, assemblé dans cet ordre : reprise éventuelle,
  // contenu utile, puis SOIT le ping staff SOIT la proposition de clôture avec
  // ses boutons — jamais les deux, et jamais de texte après les boutons.
  const blocks = [
    resumed ? IA_RESUMED_NOTICE : '',
    reply,
    ifsaMention,
    escalate ? ping : offerPanel ? RESOLUTION_PANEL_TEXT : '',
  ];
  const out = blocks.filter(Boolean).join('\n\n').trim();

  try {
    // Rien d'utile à dire : on n'envoie rien. Le « … » d'avant était pire que le silence.
    if (out) {
      await discordSendMessage(
        channelId,
        out,
        offerPanel && !escalate ? { components: TICKET_ACTION_COMPONENTS } : undefined,
      );
    }
  } catch (e) {
    console.error('[support-message] discordSendMessage', e);
    return NextResponse.json({ error: 'discord_send_failed', statut, escalate }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    statut,
    escalate,
    sent: Boolean(out),
    resolution_offered: offerPanel || (offerPending && !clearOffer),
  });
}
