export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import { SUPPORT_IA_SYSTEM_PROMPT } from '@/lib/support/knowledge';
import { ticketChannelName, type SupportStatus } from '@/lib/support/motifs';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';
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
    return 'Je prends en compte ta demande. Peux-tu préciser ce que tu as déjà essayé sur le site (menu, page) ? Si je ne peux pas conclure, j’appellerai un staff.\n\nC’est résolu ?';
  }
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
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim().slice(0, 1800);
  return 'Je n’ai pas pu formuler une réponse fiable. J’appelle un staff.';
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

  const turns = parseTurns(ticket.conversation);
  const memory = mergeMemory(ticket.memory_notes || '', extractFacts(content));

  if (fromStaff) {
    const nextTurns = trimConversation([...turns, { role: 'staff', content }]);
    await admin
      .from('support_tickets')
      .update({
        statut: 'staff',
        conversation: nextTurns,
        memory_notes: memory,
        last_human_at: new Date().toISOString(),
        last_nudge_at: null,
        inactivity_nudge: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id);
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

  const reply = await llmReply(messages);
  const escalate = needsStaff(content, reply) || /j’appelle un staff|j'appelle un staff/i.test(reply);

  const statut: SupportStatus = escalate ? 'staff_needed' : 'waiting';
  const nextTurns = trimConversation([
    ...turns,
    { role: 'user', content },
    { role: 'assistant', content: reply },
  ]);

  await admin
    .from('support_tickets')
    .update({
      statut,
      conversation: nextTurns,
      memory_notes: memory,
      last_human_at: new Date().toISOString(),
      last_nudge_at: null,
      inactivity_nudge: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id);

  try {
    await discordRenameChannel(channelId, ticketChannelName(statut, ticket.short_id));
  } catch { /* ignore */ }

  const cfg = await getSupportConfig();
  let out = reply;
  if (escalate && cfg?.staff_role_id) {
    out = `${reply}\n\n<@&${cfg.staff_role_id}> **Un staff est requis.**`;
  }

  await discordSendMessage(channelId, out);
  return NextResponse.json({ ok: true, statut, escalate });
}
