export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { discordSendMessage } from '@/lib/support/discord-api';
import { closeSupportTicket } from '@/lib/support/close-ticket';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const NUDGES = [
  (mention: string) =>
    `${mention} Pas de nouvelle depuis **6 heures**. Tu as encore besoin d’aide ? Réponds ici.\nSans réponse : nouvelle relance dans 6 h, puis une dernière, puis fermeture du ticket.`,
  (mention: string) =>
    `${mention} **2e relance** — toujours aucune réponse depuis 6 h. Le ticket sera fermé s’il reste inactif.\nDernière relance dans 6 h, puis suppression du salon.`,
  (mention: string) =>
    `${mention} **Dernière relance.** Sans message dans **6 heures**, ce ticket sera **fermé** et le salon **supprimé** (un transcript sera conservé).`,
];

function cronOk(request: NextRequest): boolean {
  const secret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return Boolean(secret && secret === process.env.CRON_SECRET);
}

async function run() {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: tickets, error } = await admin
    .from('support_tickets')
    .select('id, short_id, channel_id, discord_user_id, last_human_at, last_nudge_at, inactivity_nudge')
    .is('closed_at', null)
    .limit(200);

  if (error) throw new Error(error.message);

  const nudged: string[] = [];
  const closed: string[] = [];

  for (const t of tickets || []) {
    const nudge = Number(t.inactivity_nudge || 0);
    const lastHuman = new Date(t.last_human_at || 0).getTime();
    const lastNudge = t.last_nudge_at ? new Date(t.last_nudge_at).getTime() : 0;
    const mention = `<@${t.discord_user_id}>`;

    try {
      if (nudge >= 3) {
        if (lastNudge && now - lastNudge >= SIX_HOURS_MS) {
          await closeSupportTicket({ channelId: t.channel_id, closedBy: 'inactivite' });
          closed.push(t.short_id);
        }
        continue;
      }

      const anchor = nudge === 0 ? lastHuman : lastNudge;
      if (!anchor || now - anchor < SIX_HOURS_MS) continue;

      const next = nudge + 1;
      const text = NUDGES[nudge](mention);
      await discordSendMessage(t.channel_id, text);
      await admin
        .from('support_tickets')
        .update({
          inactivity_nudge: next,
          last_nudge_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
      nudged.push(`${t.short_id}:${next}`);
    } catch (e) {
      console.error('[support inactivity]', t.short_id, e);
    }
  }

  return { ok: true, scanned: tickets?.length ?? 0, nudged, closed };
}

export async function GET(request: NextRequest) {
  if (!cronOk(request)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    return NextResponse.json(await run());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
