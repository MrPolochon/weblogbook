export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import { SUPPORT_IA_SYSTEM_PROMPT } from '@/lib/support/knowledge';
import { ticketChannelName, type SupportStatus } from '@/lib/support/motifs';
import { discordRenameChannel, discordSendMessage } from '@/lib/support/discord-api';

function needsStaff(text: string, iaText: string): boolean {
  const blob = `${text}\n${iaText}`.toLowerCase();
  if (/appeler un staff|je ne (peux|sais) pas|staff va être/.test(iaText.toLowerCase())) return true;
  if (/mot de passe|virement|solde d.un autre|heberge|héberg|github|supabase|vercel/.test(blob)) return true;
  return false;
}

async function llmReply(userMsg: string, history: string): Promise<string> {
  const key = process.env.SUPPORT_LLM_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.SUPPORT_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.SUPPORT_LLM_MODEL || 'gpt-4o-mini';
  if (!key) {
    return 'Je prends en compte ta demande. Peux-tu préciser ce que tu as déjà essayé sur le site (menu, page) ? Si je ne peux pas conclure, j’appellerai un staff.\n\nC’est résolu ?';
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SUPPORT_IA_SYSTEM_PROMPT },
        { role: 'user', content: `${history}\n\nMessage du membre : ${userMsg}` },
      ],
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

  if (fromStaff) {
    await admin.from('support_tickets').update({ statut: 'staff', updated_at: new Date().toISOString() }).eq('id', ticket.id);
    try {
      await discordRenameChannel(channelId, ticketChannelName('staff', ticket.short_id));
    } catch { /* ignore */ }
    return NextResponse.json({ ok: true, statut: 'staff', reply: null });
  }

  const history = `Motif: ${ticket.motif}\nRaison ouverture: ${ticket.reason_text || ''}`;
  const reply = await llmReply(content, history);
  const escalate = needsStaff(content, reply) || /j’appelle un staff|j'appelle un staff/i.test(reply);

  const statut: SupportStatus = escalate ? 'staff_needed' : 'waiting';
  await admin.from('support_tickets').update({ statut, updated_at: new Date().toISOString() }).eq('id', ticket.id);
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
