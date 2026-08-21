export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSupportBotSecret, getSupportConfig } from '@/lib/support/bot-auth';
import {
  classifyMotifFromText,
  SUPPORT_MOTIFS,
  ticketChannelName,
  type SupportMotifId,
} from '@/lib/support/motifs';
import { discordCreateTextChannel, discordSendMessage } from '@/lib/support/discord-api';

function shortId(): string {
  return Math.random().toString(36).slice(2, 6);
}

export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const discordUserId = String(body.discord_user_id || '');
  const discordUsername = String(body.discord_username || '');
  const reason = String(body.reason || '').trim();
  if (!discordUserId || !reason) {
    return NextResponse.json({ error: 'discord_user_id et reason requis' }, { status: 400 });
  }

  const cfg = await getSupportConfig();
  if (!cfg?.guild_id || !cfg.staff_role_id) {
    return NextResponse.json({ error: 'Bot non configuré sur le site' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('support_tickets')
    .select('channel_id, short_id, motif')
    .eq('discord_user_id', discordUserId)
    .is('closed_at', null)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      error: 'already_open',
      channel_id: existing.channel_id,
      message: 'Vous avez déjà un ticket ouvert.',
    }, { status: 409 });
  }

  const motif = classifyMotifFromText(reason) as SupportMotifId;
  const categoryIds = (cfg.category_ids || {}) as Record<string, string>;
  const parentId = categoryIds[motif] || categoryIds.assistance;
  if (!parentId) {
    return NextResponse.json({ error: 'Sections Discord manquantes — re-provisionnez la config' }, { status: 400 });
  }

  const sid = shortId();
  const everyone = cfg.guild_id;
  const overwrites = [
    { id: everyone, type: 0, deny: '1024' },
    { id: discordUserId, type: 1, allow: '3072' },
    { id: cfg.staff_role_id, type: 0, allow: '3072' },
  ];

  try {
    const ch = await discordCreateTextChannel({
      guildId: cfg.guild_id,
      name: ticketChannelName('ia', sid),
      parentId,
      topic: reason.slice(0, 200),
      overwrites,
    });

    const { data: link } = await admin
      .from('discord_links')
      .select('user_id')
      .eq('discord_user_id', discordUserId)
      .eq('status', 'active')
      .maybeSingle();

    await admin.from('support_tickets').insert({
      short_id: sid,
      discord_user_id: discordUserId,
      discord_username: discordUsername,
      channel_id: ch.id,
      motif,
      statut: 'ia',
      reason_text: reason,
      user_id: link?.user_id ?? null,
    });

    const motifLabel = SUPPORT_MOTIFS.find((m) => m.id === motif)?.label || motif;
    const intro =
      motif === 'nouveau'
        ? `Bienvenue ! Je t’accompagne pour démarrer (compte, Discord lié, logbook). Raison indiquée : *${reason.slice(0, 300)}*`
        : `Ticket classé **${motifLabel}**. Raison : *${reason.slice(0, 400)}*\nJe m’en occupe. Si je ne peux pas conclure, j’appellerai un staff.`;

    await discordSendMessage(ch.id, `<@${discordUserId}>\n${intro}`);

    return NextResponse.json({ ok: true, channel_id: ch.id, motif, short_id: sid });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Création salon impossible' },
      { status: 502 }
    );
  }
}
