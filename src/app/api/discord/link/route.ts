import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDiscordLinkForUser, refreshDiscordLinkState } from '@/lib/discord-link-service';
import { hasDiscordOAuthConfig, isDiscordLinkRequired } from '@/lib/discord-link';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const link = await getDiscordLinkForUser(user.id);
    return NextResponse.json({
      required: isDiscordLinkRequired(),
      configured: hasDiscordOAuthConfig(),
      link,
    });
  } catch (error) {
    console.error('Discord link GET error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    await admin.from('discord_links').delete().eq('user_id', user.id);

    const { data: profile } = await admin
      .from('profiles')
      .select('block_reason')
      .eq('id', user.id)
      .maybeSingle();

    if ((profile?.block_reason ?? '').startsWith('DISCORD:')) {
      await admin
        .from('profiles')
        .update({ blocked_until: null, block_reason: null })
        .eq('id', user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Discord link DELETE error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const link = await refreshDiscordLinkState(user.id);
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    console.error('Discord link POST error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
