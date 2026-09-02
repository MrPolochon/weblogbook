export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLAN_VOL_SOL_SELECT, mapPlanVolSol, type PlanVolSol, type PlanVolSolRow } from '@/lib/ground/plans-vol';
import { loadAirportOccupancy, STATUTS_INBOUND } from '@/lib/ground/gate-assignment';
import type { AirportGate } from '@/lib/types';

type InboundRow = PlanVolSolRow & { current_holder_aeroport?: string | null };

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

  const { data: gates, error: gatesError } = await admin
    .from('airport_gates')
    .select('*')
    .eq('aeroport', aeroport)
    .order('display_order');

  if (gatesError) return NextResponse.json({ error: gatesError.message }, { status: 500 });
  if (!gates || gates.length === 0) {
    return NextResponse.json({ gates: [], inbound: [] });
  }

  const typedGates = gates as AirportGate[];
  const occupancy = await loadAirportOccupancy(admin, aeroport, typedGates);

  const occPlanIds = [...new Set([...occupancy.values()].map((o) => o.plan_vol_id).filter(Boolean))];

  const [{ data: inboundRows }, { data: assignedArrival }, { data: occPlanRows }] = await Promise.all([
    admin
      .from('plans_vol')
      .select(`${PLAN_VOL_SOL_SELECT}, current_holder_aeroport`)
      .eq('aeroport_arrivee', aeroport)
      .in('statut', [...STATUTS_INBOUND, 'accepte']),
    admin
      .from('gate_assignments')
      .select('plan_vol_id')
      .eq('aeroport', aeroport)
      .eq('assignment_type', 'arrivee')
      .in('status', ['reserved', 'occupied']),
    occPlanIds.length > 0
      ? admin.from('plans_vol').select(PLAN_VOL_SOL_SELECT).in('id', occPlanIds)
      : Promise.resolve({ data: [] as PlanVolSolRow[] }),
  ]);

  const occByPlanId = new Map(
    ((occPlanRows ?? []) as unknown as PlanVolSolRow[]).map((row) => {
      const mapped = mapPlanVolSol(row);
      return [mapped.id, mapped] as const;
    }),
  );

  const assignedIds = new Set((assignedArrival ?? []).map((r: { plan_vol_id: string }) => r.plan_vol_id));
  const inbound: PlanVolSol[] = ((inboundRows ?? []) as unknown as InboundRow[])
    .filter((row) => {
      if (assignedIds.has(row.id)) return false;
      if (row.statut === 'accepte') {
        return row.current_holder_aeroport === aeroport && row.aeroport_depart !== aeroport;
      }
      return true;
    })
    .map(mapPlanVolSol);

  const gatesWithStatus = typedGates.map((g) => {
    const occ = occupancy.get(g.id) ?? null;
    const details = occ ? occByPlanId.get(occ.plan_vol_id) : null;
    return {
      ...g,
      available: occ == null,
      occupancy_type: occ?.occupancy_type ?? null,
      plan_vol: occ
        ? {
            id: occ.plan_vol_id,
            callsign: details?.callsign ?? occ.numero_vol,
            numero_vol: details?.numero_vol ?? occ.numero_vol,
            immatriculation: details?.immatriculation ?? occ.immatriculation,
            porte: g.gate_code,
            statut: occ.statut,
            aeroport_depart: occ.aeroport_depart,
            aeroport_arrivee: occ.aeroport_arrivee,
            type_avion: details?.type_avion ?? occ.type_avion,
          }
        : null,
      assignment: occ?.occupancy_type === 'arrivee'
        ? { assignment_type: 'arrivee', status: 'reserved', plan_vol: { numero_vol: occ.numero_vol, aeroport_depart: occ.aeroport_depart, aeroport_arrivee: occ.aeroport_arrivee } }
        : occ?.occupancy_type === 'depart'
          ? { assignment_type: 'depart', status: 'occupied', plan_vol: { numero_vol: occ.numero_vol, aeroport_depart: occ.aeroport_depart, aeroport_arrivee: occ.aeroport_arrivee } }
          : null,
    };
  });

  return NextResponse.json({ gates: gatesWithStatus, inbound });
}
