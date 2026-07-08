export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { leaveTeam, getActiveTeam, reassignerAvionSiEquipeVide } from '@/lib/ground/teams';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const aeroport = searchParams.get('aeroport');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  if (aeroport) {
    // Vérifie si un GC quelconque est disponible sur cet aéroport (usage panel pilote)
    const { data: session } = await admin
      .from('ground_sessions')
      .select('id, user_id, aeroport, started_at')
      .eq('aeroport', aeroport)
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ session });
  }

  // Retourne la session de l'utilisateur courant (usage GC connecté)
  const { data: session } = await admin
    .from('ground_sessions')
    .select('id, user_id, aeroport, started_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('role, ground_crew')
    .eq('id', user.id)
    .single();

  if (!profile || (!profile.ground_crew && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Accès refusé — accès Ground Crew requis' }, { status: 403 });
  }

  const body = await request.json() as { aeroport?: string };
  if (!body.aeroport) {
    return NextResponse.json({ error: 'aeroport requis' }, { status: 400 });
  }

  await admin.from('ground_sessions').delete().eq('user_id', user.id);

  const { data: session, error } = await admin
    .from('ground_sessions')
    .insert({ user_id: user.id, aeroport: body.aeroport })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  // Récupérer la session avant suppression
  const { data: session } = await admin
    .from('ground_sessions')
    .select('aeroport')
    .eq('user_id', user.id)
    .maybeSingle();

  const aeroport = session?.aeroport;

  // Supprimer la session
  await admin.from('ground_sessions').delete().eq('user_id', user.id);

  if (!aeroport) return NextResponse.json({ success: true });

  // Gestion de l'équipe : quitter et réassigner si nécessaire
  try {
    const myTeam = await getActiveTeam(admin, user.id);
    if (myTeam) {
      // Quitter l'équipe (dissolution si dernier membre)
      await leaveTeam(admin, user.id, myTeam.id);

      // Vérifier s'il reste des membres actifs
      const { count: membresRestants } = await admin
        .from('ground_crew_team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', myTeam.id)
        .is('left_at', null);

      if ((membresRestants ?? 0) === 0) {
        // Équipe vide : réassigner les avions
        const { data: plansConcernes } = await admin
          .from('ground_service_requests')
          .select('plan_vol_id, aeroport')
          .eq('team_id', myTeam.id)
          .in('statut', ['pending', 'accepted', 'in_progress']);

        const seenPlans = new Set<string>();
        for (const req of plansConcernes ?? []) {
          if (!seenPlans.has(req.plan_vol_id)) {
            seenPlans.add(req.plan_vol_id);
            await reassignerAvionSiEquipeVide(admin, req.plan_vol_id, req.aeroport);
          }
        }
      }
    }
  } catch {
    // Non bloquant : la déconnexion reste valide même si la gestion d'équipe échoue
  }

  return NextResponse.json({ success: true });
}
