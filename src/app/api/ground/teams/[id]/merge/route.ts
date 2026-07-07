import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fusionnerEquipes, getActiveTeam } from '@/lib/ground/teams';

/**
 * POST /api/ground/teams/[id]/merge
 * Fusionne l'équipe [id] (équipe B) dans l'équipe de l'appelant (équipe A).
 * Body : { team_b_id: string }
 * Seul un membre de l'équipe A peut initier la fusion.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: teamBId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // L'appelant doit être dans une équipe A distincte
  const teamA = await getActiveTeam(admin, user.id);
  if (!teamA) {
    return NextResponse.json({ error: 'Vous n\'êtes dans aucune équipe' }, { status: 403 });
  }
  if (teamA.id === teamBId) {
    return NextResponse.json({ error: 'Impossible de fusionner une équipe avec elle-même' }, { status: 400 });
  }

  // Vérifier que l'équipe B existe et est active
  const { data: teamB } = await admin
    .from('ground_crew_teams')
    .select('id, aeroport, disbanded_at')
    .eq('id', teamBId)
    .single();

  if (!teamB || teamB.disbanded_at) {
    return NextResponse.json({ error: 'Équipe B introuvable ou déjà dissoute' }, { status: 404 });
  }

  if (teamA.aeroport !== teamB.aeroport) {
    return NextResponse.json({ error: 'Les deux équipes doivent être sur le même aéroport' }, { status: 422 });
  }

  try {
    await fusionnerEquipes(admin, teamA.id, teamBId);
    return NextResponse.json({ success: true, teamId: teamA.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
