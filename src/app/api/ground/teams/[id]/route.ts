import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/ground/teams/[id]
 * Détails d'une équipe (membres, avions assignés, demandes en cours).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  const { data: team } = await admin
    .from('ground_crew_teams')
    .select('id, aeroport, created_by, created_at, disbanded_at')
    .eq('id', id)
    .single();

  if (!team) return NextResponse.json({ error: 'Équipe introuvable' }, { status: 404 });

  const [{ data: membres }, { data: requests }] = await Promise.all([
    admin
      .from('ground_crew_team_members')
      .select('user_id, joined_at, left_at, profiles!inner(identifiant)')
      .eq('team_id', id)
      .is('left_at', null),
    admin
      .from('ground_service_requests')
      .select('id, plan_vol_id, service_type, statut, requested_at, pax_count')
      .eq('team_id', id)
      .in('statut', ['pending', 'accepted', 'in_progress']),
  ]);

  // Plans distincts assignés à cette équipe
  const plansAssignes = [...new Set((requests ?? []).map((r) => r.plan_vol_id))];

  return NextResponse.json({ team, membres: membres ?? [], requests: requests ?? [], plansAssignes });
}

/**
 * DELETE /api/ground/teams/[id]
 * Dissout une équipe (créateur ou admin uniquement).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  const { data: team } = await admin
    .from('ground_crew_teams')
    .select('created_by, aeroport, disbanded_at')
    .eq('id', id)
    .single();

  if (!team) return NextResponse.json({ error: 'Équipe introuvable' }, { status: 404 });
  if (team.disbanded_at) return NextResponse.json({ error: 'Équipe déjà dissoute' }, { status: 409 });

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (team.created_by !== user.id && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Seul le créateur ou un admin peut dissoudre l\'équipe' }, { status: 403 });
  }

  const now = new Date().toISOString();

  // Marquer tous les membres comme partis
  await admin
    .from('ground_crew_team_members')
    .update({ left_at: now })
    .eq('team_id', id)
    .is('left_at', null);

  // Dissoudre l'équipe
  await admin
    .from('ground_crew_teams')
    .update({ disbanded_at: now })
    .eq('id', id);

  // Marquer les demandes en attente comme unavailable
  await admin
    .from('ground_service_requests')
    .update({ statut: 'ground_crew_unavailable' })
    .eq('team_id', id)
    .in('statut', ['pending', 'accepted', 'in_progress']);

  return NextResponse.json({ success: true });
}
