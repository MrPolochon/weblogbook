import { NextRequest, NextResponse } from 'next/server';
import { assertSupportBotSecret } from '@/lib/support/bot-auth';
import { findSiteAdminByDiscordId } from '@/lib/calendrier/staff';
import { attachCalendarAnnounceFromDiscord, createCalendarEventFromDiscord } from '@/lib/calendrier/create';
import { WEBSTAFF_HINT } from '@/lib/calendrier/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = assertSupportBotSecret(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const discordId = String(body.discord_id || body.discord_user_id || '');
  const action = String(body.action || 'check').toLowerCase();

  if (action === 'check') {
    const staff = await findSiteAdminByDiscordId(discordId);
    return NextResponse.json({
      admin: Boolean(staff),
      hint: staff ? null : WEBSTAFF_HINT,
    });
  }

  if (action === 'create') {
    const result = await createCalendarEventFromDiscord({
      discordId,
      title: String(body.title || ''),
      description: String(body.description || ''),
      startRaw: String(body.start || body.starts_at || ''),
      endRaw: String(body.end || body.ends_at || ''),
      announceRaw: String(body.announce || ''),
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.status === 403 ? WEBSTAFF_HINT : result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({
      ok: true,
      event: result.event,
      pick_targets: Boolean(result.pickTargets),
    });
  }

  if (action === 'announce') {
    const result = await attachCalendarAnnounceFromDiscord({
      discordId,
      eventId: String(body.event_id || ''),
      channelId: body.channel_id != null && body.channel_id !== '' ? String(body.channel_id) : null,
      roleId: body.role_id !== undefined ? (body.role_id ? String(body.role_id) : null) : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.status === 403 ? WEBSTAFF_HINT : result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({ ok: true, event: result.event });
  }

  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
}
