import { createAdminClient } from '@/lib/supabase/admin';
import { distribuerPaiementEquipe } from '@/lib/ground/pricing';

type AdminClient = ReturnType<typeof createAdminClient>;

export interface Team {
  id: string;
  aeroport: string;
  created_by: string;
  created_at: string;
  disbanded_at: string | null;
}

export interface TeamMemberRow {
  id: string;
  team_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
}

export interface InvitationRow {
  id: string;
  team_id: string;
  from_user_id: string;
  to_user_id: string;
  aeroport: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  created_at: string;
  expires_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Récupère l'équipe active d'un GC (null si solo). */
export async function getActiveTeam(
  admin: AdminClient,
  userId: string
): Promise<Team | null> {
  const { data } = await admin
    .from('ground_crew_team_members')
    .select('team_id, ground_crew_teams!inner(id, aeroport, created_by, created_at, disbanded_at)')
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();

  if (!data) return null;
  const team = (data as unknown as { ground_crew_teams: Team }).ground_crew_teams;
  if (!team || team.disbanded_at) return null;
  return team;
}

/**
 * Trouve ou crée une équipe "solo" pour un GC sans équipe.
 * Une équipe solo est une équipe à un seul membre créée automatiquement.
 */
export async function getOrCreateSoloTeam(
  admin: AdminClient,
  userId: string,
  aeroport: string
): Promise<Team> {
  // Vérifier s'il a déjà une équipe active
  const existing = await getActiveTeam(admin, userId);
  if (existing) return existing;

  // Créer une nouvelle équipe solo
  const { data: team, error: teamErr } = await admin
    .from('ground_crew_teams')
    .insert({ aeroport, created_by: userId })
    .select()
    .single();

  if (teamErr || !team) throw new Error(`Impossible de créer l'équipe solo : ${teamErr?.message}`);

  // Rejoindre l'équipe
  await admin
    .from('ground_crew_team_members')
    .insert({ team_id: team.id, user_id: userId });

  return team as Team;
}

// ── Invitations ───────────────────────────────────────────────────────────────

/**
 * Envoie une invitation à un autre GC pour rejoindre l'équipe.
 * Expire les invitations obsolètes avant d'en créer une nouvelle.
 */
export async function inviteToTeam(
  admin: AdminClient,
  fromUserId: string,
  toUserId: string,
  teamId: string
): Promise<InvitationRow> {
  // Expirer les vieilles invitations du même expéditeur vers la même personne
  await admin
    .from('ground_crew_team_invitations')
    .update({ status: 'expired' })
    .eq('from_user_id', fromUserId)
    .eq('to_user_id', toUserId)
    .eq('status', 'pending');

  // Récupérer l'aéroport de l'équipe
  const { data: team } = await admin
    .from('ground_crew_teams')
    .select('aeroport')
    .eq('id', teamId)
    .single();

  if (!team) throw new Error('Équipe introuvable');

  const { data: inv, error } = await admin
    .from('ground_crew_team_invitations')
    .insert({
      team_id: teamId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      aeroport: team.aeroport,
    })
    .select()
    .single();

  if (error || !inv) throw new Error(`Invitation impossible : ${error?.message}`);
  return inv as InvitationRow;
}

/**
 * Accepte une invitation.
 * - Valide l'invitation (non expirée, statut pending)
 * - Fait quitter l'équipe actuelle du GC si nécessaire
 * - Fait rejoindre la nouvelle équipe
 * - Réassigne les plans liés à l'ancienne équipe vers la nouvelle
 */
export async function acceptInvitation(
  admin: AdminClient,
  invitationId: string,
  userId: string
): Promise<void> {
  const { data: inv } = await admin
    .from('ground_crew_team_invitations')
    .select('*')
    .eq('id', invitationId)
    .eq('to_user_id', userId)
    .eq('status', 'pending')
    .single();

  if (!inv) throw new Error('Invitation introuvable ou expirée');

  // Vérifier l'expiration
  if (new Date(inv.expires_at) < new Date()) {
    await admin
      .from('ground_crew_team_invitations')
      .update({ status: 'expired' })
      .eq('id', invitationId);
    throw new Error('Cette invitation a expiré');
  }

  // Quitter l'équipe actuelle si nécessaire (sans dissolution)
  const currentTeam = await getActiveTeam(admin, userId);
  if (currentTeam) {
    await _quitterEquipeSansReasignation(admin, userId, currentTeam.id);
  }

  // Rejoindre la nouvelle équipe
  await admin
    .from('ground_crew_team_members')
    .insert({ team_id: inv.team_id, user_id: userId });

  // Marquer l'invitation comme acceptée
  await admin
    .from('ground_crew_team_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitationId);
}

// ── Leave / Disband ───────────────────────────────────────────────────────────

/**
 * Quitte une équipe.
 * - Si dernier membre → dissout l'équipe et réassigne les avions
 * - Si d'autres membres restent → simple sortie
 */
export async function leaveTeam(
  admin: AdminClient,
  userId: string,
  teamId: string
): Promise<void> {
  await _quitterEquipeSansReasignation(admin, userId, teamId);

  // Vérifier s'il reste des membres actifs
  const { count } = await admin
    .from('ground_crew_team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .is('left_at', null);

  if ((count ?? 0) === 0) {
    await _disbandTeam(admin, teamId);
  }
}

/** Marque le membre comme parti sans dissoudre l'équipe. */
async function _quitterEquipeSansReasignation(
  admin: AdminClient,
  userId: string,
  teamId: string
): Promise<void> {
  await admin
    .from('ground_crew_team_members')
    .update({ left_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .is('left_at', null);
}

/** Dissout une équipe et réassigne les avions actifs. */
async function _disbandTeam(admin: AdminClient, teamId: string): Promise<void> {
  await admin
    .from('ground_crew_teams')
    .update({ disbanded_at: new Date().toISOString() })
    .eq('id', teamId);

  // Récupérer les aéroports des plans encore assignés à cette équipe
  const { data: pendingRequests } = await admin
    .from('ground_service_requests')
    .select('plan_vol_id, aeroport')
    .eq('team_id', teamId)
    .in('statut', ['pending', 'accepted', 'in_progress']);

  if (!pendingRequests || pendingRequests.length === 0) return;

  // Dédupliquer les plan_vol_ids
  const seen = new Set<string>();
  for (const req of pendingRequests) {
    if (!seen.has(req.plan_vol_id)) {
      seen.add(req.plan_vol_id);
      await reassignerAvionSiEquipeVide(admin, req.plan_vol_id, req.aeroport);
    }
  }
}

// ── Assignment ─────────────────────────────────────────────────────────────────

/**
 * Trouve la meilleure équipe/GC disponible pour un service et retourne son team_id.
 * Logique : équipe (ou GC solo via équipe auto) avec le moins de demandes actives.
 * Retourne null si aucun GC n'est disponible.
 */
export async function assignerEquipeADemande(
  admin: AdminClient,
  planVolId: string,
  aeroport: string
): Promise<string | null> {
  // 1. Vérifier si le plan est déjà assigné à une équipe
  const { data: existing } = await admin
    .from('ground_service_requests')
    .select('team_id')
    .eq('plan_vol_id', planVolId)
    .not('team_id', 'is', null)
    .in('statut', ['pending', 'accepted', 'in_progress'])
    .limit(1);

  if (existing && existing.length > 0 && existing[0].team_id) {
    return existing[0].team_id as string;
  }

  // 2. Lister tous les GC actifs sur l'aéroport
  const { data: sessions } = await admin
    .from('ground_sessions')
    .select('user_id')
    .eq('aeroport', aeroport);

  if (!sessions || sessions.length === 0) return null;

  const activeUserIds = sessions.map((s) => s.user_id as string);

  // 3. Trouver les équipes actives dont au moins un membre est en session
  const { data: memberships } = await admin
    .from('ground_crew_team_members')
    .select('user_id, team_id')
    .in('user_id', activeUserIds)
    .is('left_at', null);

  // Map user → team
  const userTeamMap = new Map<string, string>();
  for (const m of memberships ?? []) {
    userTeamMap.set(m.user_id as string, m.team_id as string);
  }

  // Teams représentées + solo GC
  const teamIds = new Set<string>();
  const soloUserIds: string[] = [];
  for (const uid of activeUserIds) {
    if (userTeamMap.has(uid)) {
      teamIds.add(userTeamMap.get(uid)!);
    } else {
      soloUserIds.push(uid);
    }
  }

  // 4. Créer des équipes solo pour les GC sans équipe
  for (const uid of soloUserIds) {
    const team = await getOrCreateSoloTeam(admin, uid, aeroport);
    teamIds.add(team.id);
  }

  if (teamIds.size === 0) return null;

  // 5. Compter les demandes actives par équipe
  type Candidate = { teamId: string; count: number };
  const candidates: Candidate[] = [];

  for (const teamId of teamIds) {
    const { count } = await admin
      .from('ground_service_requests')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .in('statut', ['pending', 'accepted', 'in_progress']);
    candidates.push({ teamId, count: count ?? 0 });
  }

  // 6. Sélectionner l'équipe avec le moins de demandes actives
  candidates.sort((a, b) => a.count - b.count);
  return candidates[0].teamId;
}

/**
 * Crée des entrées de contribution pour chaque membre actif d'une équipe.
 * Appelé lors de la création d'une demande de service.
 */
export async function creerContributions(
  admin: AdminClient,
  serviceRequestId: string,
  teamId: string
): Promise<void> {
  const { data: members } = await admin
    .from('ground_crew_team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .is('left_at', null);

  if (!members || members.length === 0) return;

  await admin.from('ground_crew_service_contributions').insert(
    members.map((m) => ({
      service_request_id: serviceRequestId,
      user_id: m.user_id,
      score_minijeu: 0,
      montant_percu: 0,
    }))
  );
}

/**
 * Finalise les contributions d'un service complété :
 * enregistre le score du membre qui a fait le mini-jeu
 * et distribue le montant proportionnellement.
 */
export async function finaliserContributions(
  admin: AdminClient,
  serviceRequestId: string,
  userId: string,
  scoreMiniJeu: number,
  montantTotal: number
): Promise<void> {
  // Mettre à jour le score du GC actif
  await admin
    .from('ground_crew_service_contributions')
    .update({ score_minijeu: scoreMiniJeu })
    .eq('service_request_id', serviceRequestId)
    .eq('user_id', userId);

  // Récupérer toutes les contributions
  const { data: contributions } = await admin
    .from('ground_crew_service_contributions')
    .select('user_id, score_minijeu')
    .eq('service_request_id', serviceRequestId);

  if (!contributions || contributions.length === 0) return;

  const distribution = distribuerPaiementEquipe(
    contributions as Array<{ user_id: string; score_minijeu: number }>,
    montantTotal
  );

  // Mettre à jour les montants perçus
  for (const { user_id, montant } of distribution) {
    await admin
      .from('ground_crew_service_contributions')
      .update({ montant_percu: montant, completed_at: new Date().toISOString() })
      .eq('service_request_id', serviceRequestId)
      .eq('user_id', user_id);
  }
}

// ── Réassignation ─────────────────────────────────────────────────────────────

/**
 * Réassigne les demandes d'un plan de vol quand l'équipe assignée se vide.
 * - Cherche une autre équipe disponible sur l'aéroport
 * - Si aucune : passe les demandes en 'ground_crew_unavailable'
 */
export async function reassignerAvionSiEquipeVide(
  admin: AdminClient,
  planVolId: string,
  aeroport: string
): Promise<void> {
  // Trouver une nouvelle équipe disponible (hors équipe actuelle dissoute)
  const newTeamId = await assignerEquipeADemande(admin, planVolId, aeroport);

  if (newTeamId) {
    // Réassigner les demandes actives à la nouvelle équipe
    await admin
      .from('ground_service_requests')
      .update({ team_id: newTeamId })
      .eq('plan_vol_id', planVolId)
      .in('statut', ['pending', 'accepted', 'in_progress']);
  } else {
    // Aucun GC disponible → marquer unavailable
    await admin
      .from('ground_service_requests')
      .update({ statut: 'ground_crew_unavailable' })
      .eq('plan_vol_id', planVolId)
      .in('statut', ['pending', 'accepted', 'in_progress']);
  }
}

// ── Calcul salaire ─────────────────────────────────────────────────────────────

/**
 * Calcule le salaire perçu par un membre sur une période (session courante).
 * Formule : sum(score_i × montant_i) / sum_all_members(score_j × montant_j) × montant_total_equipe
 */
export async function calculerSalaireContribution(
  admin: AdminClient,
  teamId: string,
  userId: string
): Promise<{ montantPercu: number; partPourcent: number }> {
  // Récupérer les IDs des services complétés de cette équipe
  const { data: serviceReqs } = await admin
    .from('ground_service_requests')
    .select('id')
    .eq('team_id', teamId)
    .eq('statut', 'completed');

  const reqIds = serviceReqs?.map((r) => r.id as string) ?? [];
  if (reqIds.length === 0) return { montantPercu: 0, partPourcent: 0 };

  const { data: all } = await admin
    .from('ground_crew_service_contributions')
    .select('user_id, score_minijeu, montant_percu')
    .in('service_request_id', reqIds);

  if (!all || all.length === 0) return { montantPercu: 0, partPourcent: 0 };

  const totalMontant = all.reduce((s, c) => s + Number(c.montant_percu), 0);
  const userMontant = all
    .filter((c) => c.user_id === userId)
    .reduce((s, c) => s + Number(c.montant_percu), 0);

  const partPourcent = totalMontant > 0 ? Math.round((userMontant / totalMontant) * 100) : 0;

  return { montantPercu: userMontant, partPourcent };
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Fusionne l'équipe B dans l'équipe A.
 * Les membres de B deviennent membres de A.
 * Les plans assignés à B sont réassignés à A.
 * L'équipe B est dissoute.
 */
export async function fusionnerEquipes(
  admin: AdminClient,
  teamAId: string,
  teamBId: string
): Promise<void> {
  // Récupérer les membres actifs de B
  const { data: membresB } = await admin
    .from('ground_crew_team_members')
    .select('user_id')
    .eq('team_id', teamBId)
    .is('left_at', null);

  const now = new Date().toISOString();

  for (const membre of membresB ?? []) {
    // Faire quitter B
    await admin
      .from('ground_crew_team_members')
      .update({ left_at: now })
      .eq('team_id', teamBId)
      .eq('user_id', membre.user_id)
      .is('left_at', null);

    // Rejoindre A (si pas déjà membre)
    const { data: existing } = await admin
      .from('ground_crew_team_members')
      .select('id')
      .eq('team_id', teamAId)
      .eq('user_id', membre.user_id)
      .is('left_at', null)
      .maybeSingle();

    if (!existing) {
      await admin
        .from('ground_crew_team_members')
        .insert({ team_id: teamAId, user_id: membre.user_id });
    }
  }

  // Réassigner les demandes actives de B vers A
  await admin
    .from('ground_service_requests')
    .update({ team_id: teamAId })
    .eq('team_id', teamBId)
    .in('statut', ['pending', 'accepted', 'in_progress']);

  // Dissoudre B
  await admin
    .from('ground_crew_teams')
    .update({ disbanded_at: now })
    .eq('id', teamBId);
}
