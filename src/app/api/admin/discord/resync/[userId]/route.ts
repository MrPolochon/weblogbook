import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { refreshDiscordLinkState } from '@/lib/discord-link-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/discord/resync/[userId]
 * Force la re-vérification du statut Discord pour un utilisateur.
 * Réservé aux admins.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin requis.' }, { status: 403 });

    const updatedLink = await refreshDiscordLinkState(userId);

    return NextResponse.json({
      ok: true,
      status: updatedLink?.status ?? null,
      guild_member: updatedLink?.guild_member ?? null,
      has_required_role: updatedLink?.has_required_role ?? null,
    });
  } catch (e) {
    console.error('Discord resync:', e);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
