export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculerPaiementService } from '@/lib/ground/pricing';
import { finaliserContributions, getActiveTeam } from '@/lib/ground/teams';
import type { ServiceStatut, ServiceType } from '@/lib/types';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin.from('profiles').select('role, ground_crew, identifiant').eq('id', user.id).single();
  const isGroundCrew = Boolean(profile?.ground_crew) || profile?.role === 'admin';
  const isPilote = profile?.role === 'pilote' || profile?.role === 'instructeur' || profile?.role === 'admin';

  const body = await request.json() as {
    statut?: ServiceStatut;
    score_minijeu?: number;
    notes?: string;
    pilote_confirme?: boolean;
  };

  // Permettre au pilote de confirmer sans changer le statut
  if (!body.statut && body.pilote_confirme !== true) {
    return NextResponse.json({ error: 'statut ou pilote_confirme requis' }, { status: 400 });
  }

  const { data: existingRequest } = await admin
    .from('ground_service_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (!existingRequest) {
    return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
  }

  // Cas pilote_confirme : seul le pilote propriétaire peut confirmer
  if (body.pilote_confirme === true && !body.statut) {
    if (!isPilote && existingRequest.pilote_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    const { data: updated, error } = await admin
      .from('ground_service_requests')
      .update({ pilote_confirme: true })
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ request: updated });
  }

  if (!isGroundCrew) {
    return NextResponse.json(
      { error: 'Accès refusé — rôle ground_crew requis pour modifier le statut' },
      { status: 403 }
    );
  }

  // Vérifier l'exclusivité d'équipe : seul un membre de l'équipe assignée peut agir
  if (existingRequest.team_id) {
    const myTeam = await getActiveTeam(admin, user.id);
    if (!myTeam || myTeam.id !== existingRequest.team_id) {
      return NextResponse.json(
        { error: 'Cet avion est assigné à une autre équipe' },
        { status: 403 }
      );
    }
  }

  const updates: Record<string, unknown> = { statut: body.statut };

  if (body.statut === 'accepted' && isGroundCrew) {
    updates.accepted_by = user.id;
    updates.accepted_at = new Date().toISOString();
  }

  if (body.statut === 'completed') {
    updates.completed_at = new Date().toISOString();

    // Services sans mini-jeu (marshalling/repoussage) : score fixe à 1.0
    const noMinigameTypes: ServiceType[] = ['marshalling', 'repoussage'];
    const isNoMinigame = noMinigameTypes.includes(existingRequest.service_type as ServiceType);
    const score = isNoMinigame ? 1.0 : (body.score_minijeu ?? 0.75);
    updates.score_minijeu = score;

    const montant = calculerPaiementService(
      existingRequest.service_type as ServiceType,
      score,
      existingRequest.pax_count ?? undefined
    );
    updates.montant_paye = montant;
  }

  if (body.notes) updates.notes = body.notes;
  if (body.pilote_confirme !== undefined) updates.pilote_confirme = body.pilote_confirme;

  const { data: updated, error } = await admin
    .from('ground_service_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Finaliser les contributions si le service est complété et l'équipe est connue
  if (body.statut === 'completed' && existingRequest.team_id && updated) {
    try {
      await finaliserContributions(
        admin,
        id,
        user.id,
        updated.score_minijeu ?? 0.75,
        updated.montant_paye ?? 0
      );
    } catch {
      // Non bloquant
    }
  }

  return NextResponse.json({ request: updated });
}
