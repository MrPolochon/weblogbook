export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { leaveTeam } from '@/lib/ground/teams';

/**
 * POST /api/ground/teams/[id]/leave
 * Quitter une équipe.
 * Si dernier membre → dissolution + réassignation des avions.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // Vérifier l'appartenance
  const { data: membership } = await admin
    .from('ground_crew_team_members')
    .select('id')
    .eq('team_id', id)
    .eq('user_id', user.id)
    .is('left_at', null)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Vous n\'êtes pas membre de cette équipe' }, { status: 403 });
  }

  try {
    await leaveTeam(admin, user.id, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
