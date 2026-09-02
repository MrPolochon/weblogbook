import { createAdminClient } from '@/lib/supabase/admin';
import type { AirportGate, GateAssignment, AircraftSize } from '@/lib/types';
import { gateCodesMatch } from '@/lib/ground/gate-code';

type AdminClient = ReturnType<typeof createAdminClient>;

const SIZE_ORDER: AircraftSize[] = ['light', 'medium', 'heavy', 'super_heavy'];
const STATUTS_AU_SOL = ['depose', 'en_attente', 'accepte'];
const STATUTS_INBOUND = ['en_cours', 'automonitoring', 'en_attente_cloture'];

function isSizeCompatible(gateMaxSize: AircraftSize | null, aircraftSize: AircraftSize | null): boolean {
  if (!gateMaxSize) return true;
  if (!aircraftSize) return true;
  return SIZE_ORDER.indexOf(aircraftSize) <= SIZE_ORDER.indexOf(gateMaxSize);
}

function getGateOrder(gate: AirportGate): number {
  return gate.display_order ?? 999;
}

export type GateOccupant = {
  plan_vol_id: string;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  statut: string;
  immatriculation: string | null;
  type_avion: string | null;
  occupancy_type: 'depart' | 'arrivee';
};

/**
 * Occupations réelles d'un aéroport :
 * - départ : avions encore au stand (`plans_vol.porte`, statuts sol)
 * - arrivée : `gate_assignments` reserved/occupied
 */
export async function loadAirportOccupancy(
  admin: AdminClient,
  aeroport: string,
  gates: AirportGate[],
): Promise<Map<string, GateOccupant>> {
  const occupied = new Map<string, GateOccupant>();
  if (gates.length === 0) return occupied;

  const [{ data: onStand }, { data: assignments }] = await Promise.all([
    admin
      .from('plans_vol')
      .select('id, numero_vol, porte, statut, aeroport_depart, aeroport_arrivee, compagnie_avion_id, inventaire_avion_id, siavi_avion_id')
      .eq('aeroport_depart', aeroport)
      .not('porte', 'is', null)
      .in('statut', STATUTS_AU_SOL),
    admin
      .from('gate_assignments')
      .select('gate_id, plan_vol_id, assignment_type, status, plan_vol:plans_vol(id, numero_vol, statut, aeroport_depart, aeroport_arrivee)')
      .eq('aeroport', aeroport)
      .in('status', ['reserved', 'occupied']),
  ]);

  for (const plan of onStand ?? []) {
    const gate = gates.find((g) => gateCodesMatch(plan.porte, g.gate_code));
    if (!gate || occupied.has(gate.id)) continue;
    occupied.set(gate.id, {
      plan_vol_id: plan.id,
      numero_vol: plan.numero_vol || '',
      aeroport_depart: plan.aeroport_depart,
      aeroport_arrivee: plan.aeroport_arrivee,
      statut: plan.statut,
      immatriculation: null,
      type_avion: null,
      occupancy_type: 'depart',
    });
  }

  for (const row of assignments ?? []) {
    const plan = Array.isArray(row.plan_vol) ? row.plan_vol[0] : row.plan_vol;
    if (!row.gate_id || occupied.has(row.gate_id)) continue;
    occupied.set(row.gate_id, {
      plan_vol_id: (plan?.id as string) || row.plan_vol_id,
      numero_vol: (plan?.numero_vol as string) || '',
      aeroport_depart: (plan?.aeroport_depart as string) || '',
      aeroport_arrivee: (plan?.aeroport_arrivee as string) || aeroport,
      statut: (plan?.statut as string) || '',
      immatriculation: null,
      type_avion: null,
      occupancy_type: row.assignment_type === 'arrivee' ? 'arrivee' : 'depart',
    });
  }

  return occupied;
}

async function checkSeparationRule(
  gate: AirportGate,
  allGates: AirportGate[],
  occupiedIds: Set<string>,
): Promise<boolean> {
  const currentOrder = getGateOrder(gate);
  const adjacentOccupied = allGates.some(
    (g) => g.id !== gate.id && Math.abs(getGateOrder(g) - currentOrder) === 1 && occupiedIds.has(g.id),
  );
  return !adjacentOccupied;
}

async function resolveAircraftSize(
  admin: AdminClient,
  planVolId: string,
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
  const cap = ta.capacite_pax as number;
  if (cap <= 19) return 'light';
  if (cap <= 100) return 'medium';
  if (cap <= 300) return 'heavy';
  return 'super_heavy';
}

async function selectBestGate(
  admin: AdminClient,
  availableGates: AirportGate[],
  compagnieId: string | null,
  aircraftSize: AircraftSize | null,
  allGates: AirportGate[],
  occupiedIds: Set<string>,
): Promise<AirportGate | null> {
  if (availableGates.length === 0) return null;

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

  const pools = [
    priorityGates,
    availableGates.filter((g) => !g.reserved_for),
    availableGates,
  ].filter((p) => p.length > 0);

  for (const pool of pools) {
    const valid: AirportGate[] = [];
    for (const gate of pool) {
      if (gate.requires_separation) {
        const ok = await checkSeparationRule(gate, allGates, occupiedIds);
        if (ok) valid.push(gate);
      } else {
        valid.push(gate);
      }
    }
    if (valid.length === 0) continue;

    if (aircraftSize) {
      const aircraftIdx = SIZE_ORDER.indexOf(aircraftSize);
      valid.sort((a, b) => {
        const aIdx = a.max_aircraft_size ? SIZE_ORDER.indexOf(a.max_aircraft_size) : SIZE_ORDER.length;
        const bIdx = b.max_aircraft_size ? SIZE_ORDER.indexOf(b.max_aircraft_size) : SIZE_ORDER.length;
        const fit = Math.abs(aIdx - aircraftIdx) - Math.abs(bIdx - aircraftIdx);
        if (fit !== 0) return fit;
        return getGateOrder(a) - getGateOrder(b);
      });
    } else {
      valid.sort((a, b) => getGateOrder(a) - getGateOrder(b));
    }
    return valid[0] ?? null;
  }

  return null;
}

async function getExistingArrival(
  admin: AdminClient,
  planVolId: string,
): Promise<{ gate: AirportGate; assignment: GateAssignment } | null> {
  const { data: existing } = await admin
    .from('gate_assignments')
    .select('*, gate:airport_gates(*)')
    .eq('plan_vol_id', planVolId)
    .eq('assignment_type', 'arrivee')
    .in('status', ['reserved', 'occupied'])
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) return null;
  const gate = (Array.isArray(existing.gate) ? existing.gate[0] : existing.gate) as AirportGate | null;
  if (!gate) return null;
  return { gate, assignment: existing as GateAssignment };
}

/**
 * Assigne automatiquement une porte d'arrivée (idempotent si déjà attribuée).
 */
export async function assignGateArrival(
  planVolId: string,
  aeroportArrivee: string,
  compagnieId?: string | null,
): Promise<{ gate: AirportGate; assignment: GateAssignment } | { error: string }> {
  const admin = createAdminClient();

  const existing = await getExistingArrival(admin, planVolId);
  if (existing) return existing;

  const aircraftSize = await resolveAircraftSize(admin, planVolId);

  const { data: allGates } = await admin
    .from('airport_gates')
    .select('*')
    .eq('aeroport', aeroportArrivee)
    .order('display_order');

  const gates = (allGates ?? []) as AirportGate[];
  if (gates.length === 0) {
    return { error: 'Aucune porte configurée pour cet aéroport.' };
  }

  const occupancy = await loadAirportOccupancy(admin, aeroportArrivee, gates);
  const occupiedIds = new Set(occupancy.keys());

  const candidates = gates.filter((g) => {
    if (g.gate_type === 'special') return false;
    if (occupiedIds.has(g.id)) return false;
    return isSizeCompatible(g.max_aircraft_size, aircraftSize);
  });

  const selectedGate = await selectBestGate(
    admin,
    candidates,
    compagnieId ?? null,
    aircraftSize,
    gates,
    occupiedIds,
  );

  if (!selectedGate) {
    return { error: 'Aucune porte disponible compatible pour ce vol.' };
  }

  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
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
    const raced = await getExistingArrival(admin, planVolId);
    if (raced) return raced;
    return { error: error?.message ?? 'Erreur lors de la création de l\'assignation.' };
  }

  return { gate: selectedGate, assignment: assignment as GateAssignment };
}

/**
 * Attribue une arrivée si le vol est réellement inbound sur la destination.
 * Ne bloque jamais le flux ATC (erreurs silencieuses).
 */
export async function maybeAssignArrivalGate(
  planVolId: string,
  opts?: { aeroportHint?: string | null; stripZone?: string | null },
): Promise<{ gate: AirportGate; assignment: GateAssignment } | null> {
  const admin = createAdminClient();
  const { data: plan } = await admin
    .from('plans_vol')
    .select('id, statut, aeroport_arrivee, aeroport_depart, compagnie_id, strip_zone, current_holder_aeroport')
    .eq('id', planVolId)
    .single();

  if (!plan?.aeroport_arrivee) return null;
  if (['depose', 'en_attente', 'refuse', 'cloture', 'annule'].includes(plan.statut)) return null;

  const dest = plan.aeroport_arrivee;
  const zone = opts?.stripZone ?? plan.strip_zone;
  const hint = opts?.aeroportHint ?? null;
  const inboundHere =
    hint === dest ||
    plan.current_holder_aeroport === dest ||
    zone === 'arrivee' ||
    plan.statut === 'en_attente_cloture';

  if (!inboundHere) return null;

  const stillOnOriginStand =
    STATUTS_AU_SOL.includes(plan.statut) &&
    plan.aeroport_depart === dest &&
    zone !== 'arrivee';
  if (stillOnOriginStand) return null;

  const result = await assignGateArrival(planVolId, dest, plan.compagnie_id);
  if ('error' in result) {
    console.warn(`[gate-arrival] ${planVolId}: ${result.error}`);
    return null;
  }
  return result;
}

export async function assignGateManual(
  planVolId: string,
  gateId: string,
  assignmentType: 'depart' | 'arrivee',
  aeroport: string,
): Promise<{ assignment: GateAssignment; gate: AirportGate } | { error: string }> {
  const admin = createAdminClient();

  const { data: gate } = await admin.from('airport_gates').select('*').eq('id', gateId).single();
  if (!gate) return { error: 'Porte introuvable.' };
  if (gate.aeroport !== aeroport) return { error: 'Cette porte n\'appartient pas à cet aéroport.' };

  const { data: plan } = await admin
    .from('plans_vol')
    .select('id, aeroport_depart, aeroport_arrivee')
    .eq('id', planVolId)
    .maybeSingle();
  if (!plan) return { error: 'Plan de vol introuvable.' };
  if (assignmentType === 'arrivee' && plan.aeroport_arrivee !== aeroport) {
    return { error: 'Ce vol n\'arrive pas à cet aéroport.' };
  }
  if (assignmentType === 'depart' && plan.aeroport_depart !== aeroport) {
    return { error: 'Ce vol ne part pas de cet aéroport.' };
  }

  const { data: allGates } = await admin
    .from('airport_gates')
    .select('*')
    .eq('aeroport', aeroport)
    .order('display_order');
  const occupancy = await loadAirportOccupancy(admin, aeroport, (allGates ?? []) as AirportGate[]);
  const current = occupancy.get(gateId);
  if (current && current.plan_vol_id !== planVolId) {
    return { error: `Porte occupée par ${current.numero_vol || 'un autre vol'}.` };
  }

  if (assignmentType === 'arrivee') {
    const aircraftSize = await resolveAircraftSize(admin, planVolId);
    if (!isSizeCompatible((gate as AirportGate).max_aircraft_size, aircraftSize)) {
      return { error: 'Porte trop petite pour cet appareil.' };
    }
    const occupiedIds = new Set(
      [...occupancy.entries()].filter(([, occ]) => occ.plan_vol_id !== planVolId).map(([id]) => id),
    );
    if (gate.requires_separation) {
      const ok = await checkSeparationRule(gate as AirportGate, (allGates ?? []) as AirportGate[], occupiedIds);
      if (!ok) return { error: 'Séparation requise : un stand adjacent est occupé.' };
    }

    await admin
      .from('gate_assignments')
      .update({ status: 'released' })
      .eq('plan_vol_id', planVolId)
      .eq('assignment_type', 'arrivee')
      .in('status', ['reserved', 'occupied']);
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

  return { assignment: assignment as GateAssignment, gate: gate as AirportGate };
}

export { STATUTS_INBOUND, STATUTS_AU_SOL };
