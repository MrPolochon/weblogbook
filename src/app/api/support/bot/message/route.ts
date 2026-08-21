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
import {
  extractFacts,
  mergeMemory,
  ticketContextBlock,
  toLlmMessages,
  trimConversation,
  type TicketTurn,
} from '@/lib/support/ticket-memory';

export const maxDuration = 60;

function needsStaff(text: string, iaText: string): boolean {
  const blob = `${text}\n${iaText}`.toLowerCase();
  if (/appeler un staff|je ne (peux|sais) pas|staff va être/.test(iaText.toLowerCase())) return true;
  if (/mot de passe|virement|solde d.un autre|heberge|héberg|github|supabase|vercel/.test(blob)) return true;
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

async function llmReply(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY || process.env.SUPPORT_LLM_API_KEY;
  const key = groqKey || process.env.OPENAI_API_KEY;
  const useGroq = Boolean(process.env.SUPPORT_LLM_BASE_URL?.includes('groq') || (!process.env.SUPPORT_LLM_BASE_URL && groqKey));
  const base = (process.env.SUPPORT_LLM_BASE_URL || (useGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
  const model =
    process.env.SUPPORT_LLM_MODEL ||
    (useGroq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');
  if (!key) {
    console.warn('[support-message] pas de GROQ_API_KEY / OPENAI_API_KEY — fallback texte');
    return 'Je prends en compte ta demande. Peux-tu préciser ce que tu as déjà essayé sur le site (menu, page) ? Si je ne peux pas conclure, j’appellerai un staff.\n\nC’est résolu ?';
  }
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 450,
        messages,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[support-message] LLM HTTP', res.status, JSON.stringify(data).slice(0, 400));
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string' && content.trim()) return content.trim().slice(0, 1800);
  } catch (e) {
    console.error('[support-message] LLM fetch', e);
  }
  return 'Je n’ai pas pu formuler une réponse fiable. J’appelle un staff.';
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
  const fromStaff = Boolean(body.from_staff);
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

  console.info('[support-message]', {
    channelId,
    shortId: ticket.short_id,
    fromStaff,
    contentLen: content.length,
  });

  const turns = parseTurns(ticket.conversation);
  let memory = mergeMemory(ticket.memory_notes || '', extractFacts(content));

  if (fromStaff) {
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
    return NextResponse.json({ ok: true, statut: 'staff', reply: null });
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

  let rawReply: string;
  try {
    rawReply = await llmReply(messages);
  } catch (e) {
    console.error('[support-message] llmReply', e);
    rawReply = 'Je n’ai pas pu formuler une réponse fiable. J’appelle un staff.';
  }

  const escalate = needsStaff(content, rawReply) || /j’appelle un staff|j'appelle un staff/i.test(rawReply);
  const alreadyOffered = ticketAlreadyOfferedResolution(ticket);
  const offerPanel = iaOffersResolution(rawReply, escalate) && !alreadyOffered;
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
