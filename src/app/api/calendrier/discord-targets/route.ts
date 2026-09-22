import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireSiteAdmin } from '@/lib/calendrier/staff';
import { listDiscordCalendarTargets } from '@/lib/calendrier/discord-targets';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const staff = await requireSiteAdmin(user.id);
  if (!staff) return NextResponse.json({ error: 'Administrateur site uniquement.' }, { status: 403 });

  try {
    const targets = await listDiscordCalendarTargets();
    return NextResponse.json(targets);
  } catch (e) {
    console.error('[calendrier] discord-targets', e);
    return NextResponse.json({ error: 'Impossible de lister les salons / rôles Discord.' }, { status: 502 });
  }
}
