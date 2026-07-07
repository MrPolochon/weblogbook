import { createAdminClient } from '@/lib/supabase/admin';
import type { AirportGate, GateAssignment, AircraftSize } from '@/lib/types';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Taille d'avion → tailles compatibles (une porte "heavy" accepte les avions light, medium, heavy) */
const SIZE_ORDER: AircraftSize[] = ['light', 'medium', 'heavy', 'super_heavy'];

function isSizeCompatible(gateMaxSize: AircraftSize | null, aircraftSize: AircraftSize | null): boolean {
  if (!gateMaxSize) return true; // unrestricted
  if (!aircraftSize) return true; // taille inconnue = compatible
  const gateIdx = SIZE_ORDER.indexOf(gateMaxSize);
  const aircraftIdx = SIZE_ORDER.indexOf(aircraftSize);
  return aircraftIdx <= gateIdx;
}

/**
 * Récupère l'index d'une porte dans la liste ordonnée de l'aéroport (pour la règle de séparation).
 */
function getGateOrder(gate: AirportGate): number {
  return gate.display_order ?? 999;
}

/**
 * Vérifie si les portes adjacentes (N-1 et N+1 selon display_order) sont libres.
 * Utilisé pour les portes avec `requires_separation = true`.
 */
async function checkSeparationRule(
  admin: AdminClient,
  gate: AirportGate,
  allGates: AirportGate[]
): Promise<boolean> {
  const currentOrder = getGateOrder(gate);

  // Portes adjacentes (display_order ± 1)
  const adjacentGates = allGates.filter(
    (g) => g.id !== gate.id && Math.abs(getGateOrder(g) - currentOrder) === 1
  );
  if (adjacentGates.length === 0) return true;

  const adjacentIds = adjacentGates.map((g) => g.id);
  const { data: occupiedAssignments } = await admin
    .from('gate_assignments')
    .select('id')
    .in('gate_id', adjacentIds)
    .in('status', ['reserved', 'occupied']);

  return (occupiedAssignments?.length ?? 0) === 0;
}

/**
 * Charge les portes disponibles d'un aéroport compatibles avec la taille de l'avion.
 * Exclut les portes 'special' (attribution manuelle uniquement).
 */
async function getAvailableGates(
  admin: AdminClient,
  aeroport: string,
  aircraftSize: AircraftSize | null
): Promise<AirportGate[]> {
  const { data: gates } = await admin
    .from('airport_gates')
    .select('*')
    .eq('aeroport', aeroport)
    .neq('gate_type', 'special')
    .order('display_order');

  if (!gates) return [];

  // Filtrer par compatibilité taille
  const compatible = gates.filter((g: AirportGate) => isSizeCompatible(g.max_aircraft_size, aircraftSize));

  // Récupérer les portes déjà occupées ou réservées
  const gateIds = compatible.map((g: AirportGate) => g.id);
  if (gateIds.length === 0) return [];

  const { data: occupied } = await admin
    .from('gate_assignments')
    .select('gate_id')
    .in('gate_id', gateIds)
    .in('status', ['reserved', 'occupied']);

  const occupiedSet = new Set((occupied ?? []).map((r: { gate_id: string }) => r.gate_id));

  return compatible.filter((g: AirportGate) => !occupiedSet.has(g.id));
}

/**
 * Sélectionne la meilleure porte pour un vol d'arrivée selon :
 * 1. Priorités compagnies actives
 * 2. Taille avion (la plus adaptée)
 * 3. ETA le plus tôt
 * 4. Règle de séparation
 */
async function selectBestGate(
  admin: AdminClient,
  availableGates: AirportGate[],
  compagnieId: string | null,
  aircraftSize: AircraftSize | null,
  allGates: AirportGate[]
): Promise<AirportGate | null> {
  if (availableGates.length === 0) return null;

  // Vérifier les priorités compagnies actives
  let priorityGates: AirportGate[] = [];
  if (compagnieId) {
    const now = new Date().toISOString();
    const { data: priorities } = await admin
      .from('company_gate_priority')
      .select('gate_id, priority_level')
      .eq('compagnie_id', compagnieId)
      .gt('expires_at', now)
      .order('priority_level');

    if (priorities && priorities.length > 0) {
      const priorityGateIds = new Set(priorities.map((p: { gate_id: string }) => p.gate_id));
      priorityGates = availableGates.filter((g) => priorityGateIds.has(g.id));
    }
  }

  // Pool de portes à considérer (prioritaires en premier)
  const candidatePool = priorityGates.length > 0 ? priorityGates : availableGates;

  // Vérifier la règle de séparation pour chaque candidate
  const validCandidates: AirportGate[] = [];
  for (const gate of candidatePool) {
    if (gate.requires_separation) {
      const ok = await checkSeparationRule(admin, gate, allGates);
      if (ok) validCandidates.push(gate);
    } else {
      validCandidates.push(gate);
    }
  }

  if (validCandidates.length === 0) return null;

  // Choisir la porte dont la taille max est la plus proche de la taille de l'avion
  if (aircraftSize) {
    const aircraftIdx = SIZE_ORDER.indexOf(aircraftSize);
    validCandidates.sort((a, b) => {
      const aIdx = a.max_aircraft_size ? SIZE_ORDER.indexOf(a.max_aircraft_size) : SIZE_ORDER.length;
      const bIdx = b.max_aircraft_size ? SIZE_ORDER.indexOf(b.max_aircraft_size) : SIZE_ORDER.length;
      return Math.abs(aIdx - aircraftIdx) - Math.abs(bIdx - aircraftIdx);
    });
  }

  return validCandidates[0] ?? null;
}

/**
 * Résout la taille d'avion à partir du plan de vol (via compagnie_avion_id ou inventaire_avion_id).
 */
async function resolveAircraftSize(
  admin: AdminClient,
  planVolId: string
): Promise<AircraftSize | null> {
  const { data: plan } = await admin
    .from('plans_vol')
    .select('compagnie_avion_id, inventaire_avion_id, siavi_avion_id')
    .eq('id', planVolId)
    .single();

  if (!plan) return null;

  let typeAvionId: string | null = null;

  if (plan.compagnie_avion_id) {
    const { data: ca } = await admin.from('compagnie_avions').select('type_avion_id').eq('id', plan.compagnie_avion_id).single();
    typeAvionId = ca?.type_avion_id ?? null;
  }
  if (!typeAvionId && plan.inventaire_avion_id) {
    const { data: ia } = await admin.from('inventaire_avions').select('type_avion_id').eq('id', plan.inventaire_avion_id).single();
    typeAvionId = ia?.type_avion_id ?? null;
  }
  if (!typeAvionId && plan.siavi_avion_id) {
    const { data: sa } = await admin.from('siavi_avions').select('type_avion_id').eq('id', plan.siavi_avion_id).single();
    typeAvionId = sa?.type_avion_id ?? null;
  }

  if (!typeAvionId) return null;

  const { data: ta } = await admin.from('types_avion').select('capacite_pax').eq('id', typeAvionId).single();
  if (!ta) return null;

  // Approximation taille via capacité pax
  const cap = ta.capacite_pax as number;
  if (cap <= 19) return 'light';
  if (cap <= 100) return 'medium';
  if (cap <= 300) return 'heavy';
  return 'super_heavy';
}

/**
 * Assigne automatiquement une porte d'arrivée à un plan de vol.
 */
export async function assignGateArrival(
  planVolId: string,
  aeroportArrivee: string,
  compagnieId?: string | null
): Promise<{ gate: AirportGate; assignment: GateAssignment } | { error: string }> {
  const admin = createAdminClient();

  const aircraftSize = await resolveAircraftSize(admin, planVolId);

  // Récupérer toutes les portes de l'aéroport pour la règle de séparation
  const { data: allGates } = await admin
    .from('airport_gates')
    .select('*')
    .eq('aeroport', aeroportArrivee)
    .order('display_order');

  const available = await getAvailableGates(admin, aeroportArrivee, aircraftSize);
  const selectedGate = await selectBestGate(admin, available, compagnieId ?? null, aircraftSize, allGates ?? []);

  if (!selectedGate) {
    return { error: 'Aucune porte disponible compatible pour ce vol.' };
  }

  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6h

  const { data: assignment, error } = await admin
    .from('gate_assignments')
    .insert({
      plan_vol_id: planVolId,
      aeroport: aeroportArrivee,
      gate_id: selectedGate.id,
      assignment_type: 'arrivee',
      expires_at: expiresAt,
      status: 'reserved',
    })
    .select('*')
    .single();

  if (error || !assignment) {
    return { error: error?.message ?? 'Erreur lors de la création de l\'assignation.' };
  }

  return { gate: selectedGate, assignment: assignment as GateAssignment };
}

/**
 * Assigne manuellement une porte spécifique.
 */
export async function assignGateManual(
  planVolId: string,
  gateId: string,
  assignmentType: 'depart' | 'arrivee',
  aeroport: string
): Promise<{ assignment: GateAssignment } | { error: string }> {
  const admin = createAdminClient();

  // Vérifier que la porte est libre
  const { data: existing } = await admin
    .from('gate_assignments')
    .select('id')
    .eq('gate_id', gateId)
    .in('status', ['reserved', 'occupied'])
    .limit(1);

  if (existing && existing.length > 0) {
    return { error: 'Cette porte est déjà occupée.' };
  }

  const { data: assignment, error } = await admin
    .from('gate_assignments')
    .insert({
      plan_vol_id: planVolId,
      aeroport,
      gate_id: gateId,
      assignment_type: assignmentType,
      status: 'reserved',
    })
    .select('*')
    .single();

  if (error || !assignment) {
    return { error: error?.message ?? 'Erreur lors de l\'assignation manuelle.' };
  }

  return { assignment: assignment as GateAssignment };
}
