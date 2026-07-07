export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // Récupérer les portes avec leur statut actuel
  const { data: gates, error: gatesError } = await admin
    .from('airport_gates')
    .select('*')
    .eq('aeroport', aeroport)
    .order('display_order');

  if (gatesError) return NextResponse.json({ error: gatesError.message }, { status: 500 });

  if (!gates || gates.length === 0) {
    return NextResponse.json({ gates: [] });
  }

  // Récupérer les assignations actives
  const gateIds = gates.map((g: { id: string }) => g.id);
  const { data: assignments } = await admin
    .from('gate_assignments')
    .select(`
      id, gate_id, assignment_type, status, assigned_at, expires_at,
      plan_vol:plans_vol!gate_assignments_plan_vol_id_fkey(
        id, numero_vol, aeroport_depart, aeroport_arrivee, statut, callsign,
        pilote:profiles!plans_vol_pilote_id_fkey(identifiant)
      )
    `)
    .in('gate_id', gateIds)
    .in('status', ['reserved', 'occupied']);

  const assignmentMap = new Map<string, unknown>();
  for (const a of assignments ?? []) {
    assignmentMap.set((a as { gate_id: string }).gate_id, a);
  }

  const gatesWithStatus = gates.map((g: { id: string }) => ({
    ...g,
    assignment: assignmentMap.get(g.id) ?? null,
    available: !assignmentMap.has(g.id),
  }));

  return NextResponse.json({ gates: gatesWithStatus });
}
