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

  // Récupérer les portes configurées pour l'aéroport
  const { data: gates, error: gatesError } = await admin
    .from('airport_gates')
    .select('*')
    .eq('aeroport', aeroport)
    .order('display_order');

  if (gatesError) return NextResponse.json({ error: gatesError.message }, { status: 500 });

  if (!gates || gates.length === 0) {
    return NextResponse.json({ gates: [] });
  }

  // Source de vérité : plans_vol.porte (renseigné lors du dépôt du plan)
  // La table gate_assignments peut rester pour les arrivées futures.
  const { data: plansAvecPorte } = await admin
    .from('plans_vol')
    .select('id, callsign, immatriculation, porte, statut, aeroport_depart, aeroport_arrivee, type_avion')
    .eq('aeroport_depart', aeroport)
    .not('porte', 'is', null)
    .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'en_attente_cloture']);

  // Construire un map gate_code → plan_vol
  const planMap = new Map<string, unknown>();
  for (const plan of plansAvecPorte ?? []) {
    const porte = (plan as { porte: string | null }).porte;
    if (porte) planMap.set(porte, plan);
  }

  const gatesWithStatus = gates.map((g: { gate_code: string }) => ({
    ...g,
    plan_vol: planMap.get(g.gate_code) ?? null,
    available: !planMap.has(g.gate_code),
  }));

  return NextResponse.json({ gates: gatesWithStatus });
}
