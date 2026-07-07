import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inviteToTeam, getActiveTeam } from '@/lib/ground/teams';

/**
 * GET /api/ground/invitations
 * Retourne les invitations reçues en attente pour l'utilisateur courant.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // Expirer les invitations périmées
  await admin
    .from('ground_crew_team_invitations')
    .update({ status: 'expired' })
    .eq('to_user_id', user.id)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const { data: invitations } = await admin
    .from('ground_crew_team_invitations')
    .select(`
      id, team_id, from_user_id, to_user_id, aeroport, status, created_at, expires_at,
      from_profile:profiles!ground_crew_team_invitations_from_user_id_fkey(identifiant),
      team:ground_crew_teams!ground_crew_team_invitations_team_id_fkey(id, aeroport)
    `)
    .eq('to_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return NextResponse.json({ invitations: invitations ?? [] });
}

/**
 * POST /api/ground/invitations
 * Envoie une invitation à un GC.
 * Body : { to_user_id: string }
 * L'équipe est celle de l'expéditeur (crée une équipe solo si besoin).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  const body = await request.json() as { to_user_id?: string };
  if (!body.to_user_id) {
    return NextResponse.json({ error: 'to_user_id requis' }, { status: 400 });
  }
  if (body.to_user_id === user.id) {
    return NextResponse.json({ error: 'Impossible de s\'inviter soi-même' }, { status: 400 });
  }

  // Vérifier que la cible est un GC en ligne sur le même aéroport
  const { data: mySession } = await admin
    .from('ground_sessions')
    .select('aeroport')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!mySession) {
    return NextResponse.json({ error: 'Aucune session ground active' }, { status: 422 });
  }

  const { data: targetSession } = await admin
    .from('ground_sessions')
    .select('user_id')
    .eq('user_id', body.to_user_id)
    .eq('aeroport', mySession.aeroport)
    .maybeSingle();

  if (!targetSession) {
    return NextResponse.json({ error: 'Ce GC n\'est pas en ligne sur cet aéroport' }, { status: 422 });
  }

  // Vérifier que la cible n'est pas déjà dans une équipe
  const { data: existingMembership } = await admin
    .from('ground_crew_team_members')
    .select('id')
    .eq('user_id', body.to_user_id)
    .is('left_at', null)
    .maybeSingle();

  if (existingMembership) {
    return NextResponse.json({ error: 'Ce GC est déjà dans une équipe' }, { status: 409 });
  }

  // Récupérer ou créer l'équipe de l'expéditeur
  let myTeam = await getActiveTeam(admin, user.id);
  if (!myTeam) {
    const { data: newTeam } = await admin
      .from('ground_crew_teams')
      .insert({ aeroport: mySession.aeroport, created_by: user.id })
      .select()
      .single();
    if (!newTeam) return NextResponse.json({ error: 'Impossible de créer l\'équipe' }, { status: 500 });
    await admin
      .from('ground_crew_team_members')
      .insert({ team_id: newTeam.id, user_id: user.id });
    myTeam = newTeam as typeof myTeam;
  }

  try {
    const invitation = await inviteToTeam(admin, user.id, body.to_user_id, myTeam!.id);
    return NextResponse.json({ invitation }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
