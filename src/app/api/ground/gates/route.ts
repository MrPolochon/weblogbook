export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Normalise un code de porte pour comparaison robuste.
 * Gère : casse, espaces multiples, espaces insécables Unicode (U+00A0, U+202F, etc.),
 * et caractères de contrôle invisibles.
 */
function normalizeGateCode(s: string): string {
  return s
    .replace(/[\u00A0\u202F\u2009\u2007\u2008\u200B\s]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extrait la partie purement numérique d'un code de porte.
 * Ex : "Gate 9" → "9", "Parking 12" → "12", "9" → "9".
 * Retourne null si aucun numéro isolé.
 */
function extractNumeric(normalized: string): string | null {
  const m = normalized.match(/^(?:gate|porte|parking|fato|apron)\s+(\d+)$/) ?? normalized.match(/^(\d+)$/);
  return m ? m[1] : null;
}

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

  // Source de vérité : plans_vol.porte (renseigné lors du dépôt du plan).
  // La table gate_assignments peut rester pour des extensions futures (arrivées).
  const { data: plansAvecPorte, error: plansError } = await admin
    .from('plans_vol')
    .select('id, callsign, immatriculation, numero_vol, porte, statut, aeroport_depart, aeroport_arrivee, type_avion')
    .eq('aeroport_depart', aeroport)
    .not('porte', 'is', null)
    .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);

  if (plansError) {
    console.error(`[ground/gates] Erreur requête plans_vol (aeroport=${aeroport}):`, plansError.message);
  }

  // Construire un map multi-clés gate_code → plan_vol pour une correspondance
  // robuste quel que soit le format stocké dans plans_vol.porte :
  //   - casse différente ("GATE 9" vs "Gate 9")
  //   - espaces insécables Unicode
  //   - format legacy purement numérique ("9" ↔ "Gate 9")
  //   - format sans espace ("gate9" ↔ "Gate 9")
  const planMap = new Map<string, unknown>();

  for (const plan of plansAvecPorte ?? []) {
    const raw = (plan as { porte: string | null }).porte;
    if (!raw) continue;
    const norm = normalizeGateCode(raw);
    if (!norm) continue;

    // Clé normalisée principale : "gate 9"
    planMap.set(norm, plan);
    // Clé sans espace : "gate9"
    planMap.set(norm.replace(/\s/g, ''), plan);

    const num = extractNumeric(norm);
    if (num) {
      // Clé numérique seule : "9" (pour porte stockée comme "9" → retrouver "Gate 9")
      planMap.set(num, plan);
      // Clés avec préfixes courants : "gate 9", "parking 9", "fato 9"
      for (const prefix of ['gate', 'parking', 'porte', 'fato']) {
        planMap.set(`${prefix} ${num}`, plan);
        planMap.set(`${prefix}${num}`, plan);
      }
    }
  }

  const gatesWithStatus = gates.map((g: { gate_code: string }) => {
    const norm = normalizeGateCode(g.gate_code);
    const noSpace = norm.replace(/\s/g, '');

    // Lookup multi-stratégie : normalisé → sans espace → numérique seul
    const found =
      planMap.get(norm) ??
      planMap.get(noSpace) ??
      (() => { const n = extractNumeric(norm); return n ? planMap.get(n) : undefined; })() ??
      null;

    return {
      ...g,
      plan_vol: found ?? null,
      available: found == null,
    };
  });

  return NextResponse.json({ gates: gatesWithStatus });
}
