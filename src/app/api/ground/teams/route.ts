export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOrCreateSoloTeam, getActiveTeam } from '@/lib/ground/teams';

/**
 * GET /api/ground/teams?aeroport=XXX
 * Retourne :
 * - myTeam : équipe active du GC avec membres + statut en ligne
 * - gcDisponibles : GC en ligne sur l'aéroport sans équipe (invitables)
 * - scoreEquipe : score moyen de l'équipe
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const aeroport = searchParams.get('aeroport');

  if (!aeroport) {
    return NextResponse.json({ error: 'aeroport requis' }, { status: 400 });
  }

  // Équipe active du GC
  const myTeam = await getActiveTeam(admin, user.id);

  let teamData: {
    id: string;
    aeroport: string;
    created_by: string;
    members: Array<{
      user_id: string;
      identifiant: string;
      online: boolean;
      score_moyen: number;
      montant_total: number;
    }>;
    score_equipe: number;
    nb_services_completes: number;
  } | null = null;

  if (myTeam) {
    // Membres actifs
    const { data: membres } = await admin
      .from('ground_crew_team_members')
      .select('user_id, joined_at, profiles!inner(identifiant)')
      .eq('team_id', myTeam.id)
      .is('left_at', null);

    // Sessions actives sur l'aéroport
    const { data: sessions } = await admin
      .from('ground_sessions')
      .select('user_id')
      .eq('aeroport', aeroport);

    const onlineSet = new Set((sessions ?? []).map((s) => s.user_id as string));

    // Contributions de cette équipe
    const { data: contributions } = await admin
      .from('ground_crew_service_contributions')
      .select('user_id, score_minijeu, montant_percu')
      .in(
        'service_request_id',
        (
          await admin
            .from('ground_service_requests')
            .select('id')
            .eq('team_id', myTeam.id)
            .eq('statut', 'completed')
        ).data?.map((r) => r.id) ?? []
      );

    const nbCompletes = contributions
      ? new Set(contributions.map((c) => c.user_id)).size
      : 0;

    const membresAvecStats = (membres ?? []).map((m) => {
      const userContribs = (contributions ?? []).filter((c) => c.user_id === m.user_id);
      const score_moyen =
        userContribs.length > 0
          ? userContribs.reduce((sum, c) => sum + Number(c.score_minijeu), 0) /
            userContribs.length
          : 0;
      const montant_total = userContribs.reduce(
        (sum, c) => sum + Number(c.montant_percu),
        0
      );
      return {
        user_id: m.user_id as string,
        identifiant: (m.profiles as unknown as { identifiant: string }).identifiant,
        online: onlineSet.has(m.user_id as string),
        score_moyen: Math.round(score_moyen * 100) / 100,
        montant_total: Math.round(montant_total),
      };
    });

    const allScores = membresAvecStats.filter((m) => m.score_moyen > 0);
    const score_equipe =
      allScores.length > 0
        ? Math.round(
            (allScores.reduce((s, m) => s + m.score_moyen, 0) / allScores.length) * 100
          ) / 100
        : 0;

    teamData = {
      id: myTeam.id,
      aeroport: myTeam.aeroport,
      created_by: myTeam.created_by,
      members: membresAvecStats,
      score_equipe,
      nb_services_completes: nbCompletes,
    };
  }

  // GC disponibles à inviter : en ligne sur l'aéroport, sans équipe
  const { data: allSessions } = await admin
    .from('ground_sessions')
    .select('user_id, profiles!inner(identifiant, role)')
    .eq('aeroport', aeroport)
    .neq('user_id', user.id);

  const invitablesRaw = (allSessions ?? []).filter((s) => {
    const profile = s.profiles as unknown as { identifiant: string; role: string };
    return profile.role === 'ground_crew' || profile.role === 'admin';
  });

  const invitableUserIds = invitablesRaw.map((s) => s.user_id as string);

  // Exclure ceux déjà dans une équipe
  const { data: enEquipe } = invitableUserIds.length > 0
    ? await admin
        .from('ground_crew_team_members')
        .select('user_id')
        .in('user_id', invitableUserIds)
        .is('left_at', null)
    : { data: [] };

  const enEquipeSet = new Set((enEquipe ?? []).map((m) => m.user_id as string));

  const gcDisponibles = invitablesRaw
    .filter((s) => !enEquipeSet.has(s.user_id as string))
    .map((s) => ({
      user_id: s.user_id as string,
      identifiant: (s.profiles as unknown as { identifiant: string }).identifiant,
    }));

  return NextResponse.json({ myTeam: teamData, gcDisponibles });
}

/**
 * POST /api/ground/teams
 * Crée ou récupère l'équipe solo du GC sur son aéroport actuel.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // Vérifier le rôle
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'ground_crew' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Rôle ground_crew requis' }, { status: 403 });
  }

  // Vérifier qu'une session est active
  const { data: session } = await admin
    .from('ground_sessions')
    .select('aeroport')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'Aucune session ground active' }, { status: 422 });
  }

  const team = await getOrCreateSoloTeam(admin, user.id, session.aeroport);
  return NextResponse.json({ team }, { status: 201 });
}
