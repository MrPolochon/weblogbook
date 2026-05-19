import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { getTypeWake } from '@/lib/wake-turbulence';
import type { StripData } from '@/components/FlightStrip';

export const dynamic = 'force-dynamic';

/**
 * GET /api/atc/strips
 *
 * Retourne les strips de l'ATC connecté sous forme de StripData[].
 * Utilise une requête unique avec joins au lieu de N+1 pour chaque plan.
 * Appelé par FlightStripBoardWrapper pour des mises à jour rapides
 * sans router.refresh() (rechargement SSR complet).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();

    // Une seule requête avec tous les joins nécessaires
    const { data: plans, error } = await admin
      .from('plans_vol')
      .select(`
        *,
        compagnie_avion:compagnie_avion_id (
          immatriculation,
          type_avion_id,
          type_avion:types_avion ( nom, code_oaci )
        ),
        inventaire_avion:inventaire_avion_id (
          immatriculation,
          type_avion_id,
          type_avion:types_avion ( nom, code_oaci )
        ),
        siavi_avion:siavi_avion_id (
          immatriculation,
          type_avion_id,
          type_avion:types_avion ( nom, code_oaci )
        ),
        pilote:profiles!plans_vol_pilote_id_fkey ( identifiant ),
        compagnie:compagnies!plans_vol_compagnie_id_fkey ( code_oaci, callsign_telephonie )
      `)
      .eq('current_holder_user_id', user.id)
      .is('pending_transfer_aeroport', null)
      .in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente'])
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback : si les joins échouent (schema différent), on fait sans
      console.warn('GET /api/atc/strips join error, falling back:', error.message);
      return await getStripsLegacy(user.id, admin);
    }

    const strips: StripData[] = (plans ?? []).map((plan) => {
      // Résolution de l'avion (priorité : compagnie > inventaire > siavi)
      const compAvion = (plan as any).compagnie_avion;
      const invAvion = (plan as any).inventaire_avion;
      const siaviAvion = (plan as any).siavi_avion;

      let immatriculation: string | null = null;
      let typeAvionCodeOaci: string | null = null;
      let typeAvionNom: string | null = null;

      if (compAvion) {
        immatriculation = compAvion.immatriculation ?? null;
        typeAvionCodeOaci = compAvion.type_avion?.code_oaci ?? null;
        typeAvionNom = compAvion.type_avion?.nom ?? null;
      } else if (invAvion) {
        immatriculation = invAvion.immatriculation ?? null;
        typeAvionCodeOaci = invAvion.type_avion?.code_oaci ?? null;
        typeAvionNom = invAvion.type_avion?.nom ?? null;
      } else if (siaviAvion) {
        immatriculation = siaviAvion.immatriculation ?? null;
        typeAvionCodeOaci = siaviAvion.type_avion?.code_oaci ?? null;
        typeAvionNom = siaviAvion.type_avion?.nom ?? null;
      }

      // Dernier filet : code depuis strip_type_wake saisi manuellement
      if (!typeAvionCodeOaci && plan.strip_type_wake) {
        const code = String(plan.strip_type_wake).split('/')[0]?.trim();
        if (code) typeAvionCodeOaci = code.toUpperCase();
      }

      const pilote = (plan as any).pilote;
      const compagnie = (plan as any).compagnie;
      let callsignTelephonie: string | null = null;
      if (compagnie?.callsign_telephonie && compagnie?.code_oaci) {
        const nv = (plan.numero_vol || '').toUpperCase();
        if (nv.startsWith(compagnie.code_oaci.toUpperCase())) {
          callsignTelephonie = compagnie.callsign_telephonie;
        }
      }

      return {
        id: plan.id,
        numero_vol: plan.numero_vol || '',
        aeroport_depart: plan.aeroport_depart || '',
        aeroport_arrivee: plan.aeroport_arrivee || '',
        type_vol: plan.type_vol || '',
        statut: plan.statut || '',
        created_at: plan.created_at || '',
        accepted_at: plan.accepted_at || null,
        immatriculation,
        type_avion_code_oaci: typeAvionCodeOaci,
        type_avion_nom: typeAvionNom,
        type_wake: getTypeWake(typeAvionCodeOaci),
        code_transpondeur: plan.code_transpondeur || null,
        mode_transpondeur: plan.mode_transpondeur || 'C',
        squawk_attendu: null,
        sid_depart: plan.sid_depart || null,
        star_arrivee: plan.star_arrivee || null,
        route_ifr: plan.route_ifr || null,
        strip_atd: plan.strip_atd || null,
        strip_rwy: plan.strip_rwy || null,
        strip_fl: plan.strip_fl || null,
        strip_fl_unit: plan.strip_fl_unit || null,
        strip_sid_atc: plan.strip_sid_atc || null,
        strip_note_1: plan.strip_note_1 || null,
        strip_note_2: plan.strip_note_2 || null,
        strip_note_3: plan.strip_note_3 || null,
        strip_star: plan.strip_star || null,
        strip_route: plan.strip_route || null,
        strip_pilote_text: plan.strip_pilote_text || null,
        strip_type_wake: plan.strip_type_wake || null,
        strip_zone: plan.strip_zone || null,
        strip_order: plan.strip_order ?? 0,
        pilote_identifiant: pilote?.identifiant || null,
        intentions_vol: plan.intentions_vol || null,
        niveau_croisiere: plan.niveau_croisiere || null,
        heure_depart_estimee: plan.heure_depart_estimee || null,
        instructions_atc: plan.note_atc || null,
        automonitoring: plan.automonitoring ?? false,
        isManual: !plan.pilote_id && Boolean(plan.created_by_atc),
        callsign_telephonie: callsignTelephonie,
        bria_conversation: plan.bria_conversation || null,
        current_holder_user_id: plan.current_holder_user_id || null,
      } as StripData;
    });

    return NextResponse.json({ strips });
  } catch (e) {
    console.error('GET /api/atc/strips:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * Fallback N+1 si les joins Supabase échouent (clé étrangère manquante dans le schema).
 * Même logique qu'atc/page.tsx.
 */
async function getStripsLegacy(userId: string, admin: ReturnType<typeof createAdminClient>): Promise<Response> {
  const { data: plansRaw } = await admin
    .from('plans_vol')
    .select('*')
    .eq('current_holder_user_id', userId)
    .is('pending_transfer_aeroport', null)
    .in('statut', ['en_cours', 'accepte', 'en_attente_cloture', 'depose', 'en_attente'])
    .order('created_at', { ascending: false });

  const strips: StripData[] = await Promise.all((plansRaw ?? []).map(async (plan) => {
    let immatriculation: string | null = null;
    let typeAvionCodeOaci: string | null = null;
    let typeAvionNom: string | null = null;
    let piloteIdentifiant: string | null = null;
    let callsignTelephonie: string | null = null;
    let typeAvionId: string | null = null;

    if (plan.compagnie_avion_id) {
      const { data: d } = await admin.from('compagnie_avions').select('immatriculation, type_avion_id').eq('id', plan.compagnie_avion_id).single();
      if (d) { immatriculation = d.immatriculation; typeAvionId = d.type_avion_id ?? null; }
    }
    if (!typeAvionId && plan.inventaire_avion_id) {
      const { data: d } = await admin.from('inventaire_avions').select('immatriculation, type_avion_id').eq('id', plan.inventaire_avion_id).single();
      if (d) { if (!immatriculation) immatriculation = d.immatriculation ?? null; typeAvionId = d.type_avion_id ?? null; }
    }
    if (!typeAvionId && plan.siavi_avion_id) {
      const { data: d } = await admin.from('siavi_avions').select('immatriculation, type_avion_id').eq('id', plan.siavi_avion_id).single();
      if (d) { if (!immatriculation) immatriculation = d.immatriculation ?? null; typeAvionId = d.type_avion_id ?? null; }
    }
    if (typeAvionId) {
      const { data: d } = await admin.from('types_avion').select('nom, code_oaci').eq('id', typeAvionId).single();
      if (d) { typeAvionCodeOaci = d.code_oaci; typeAvionNom = d.nom; }
    }
    if (!typeAvionCodeOaci && plan.strip_type_wake) {
      const code = String(plan.strip_type_wake).split('/')[0]?.trim();
      if (code) typeAvionCodeOaci = code.toUpperCase();
    }
    if (plan.pilote_id) {
      const { data: d } = await admin.from('profiles').select('identifiant').eq('id', plan.pilote_id).single();
      if (d) piloteIdentifiant = d.identifiant;
    }
    if (plan.compagnie_id) {
      const { data: d } = await admin.from('compagnies').select('code_oaci, callsign_telephonie').eq('id', plan.compagnie_id).single();
      if (d?.callsign_telephonie && d?.code_oaci && (plan.numero_vol || '').toUpperCase().startsWith(d.code_oaci.toUpperCase())) {
        callsignTelephonie = d.callsign_telephonie;
      }
    }

    return {
      id: plan.id, numero_vol: plan.numero_vol || '', aeroport_depart: plan.aeroport_depart || '',
      aeroport_arrivee: plan.aeroport_arrivee || '', type_vol: plan.type_vol || '', statut: plan.statut || '',
      created_at: plan.created_at || '', accepted_at: plan.accepted_at || null, immatriculation,
      type_avion_code_oaci: typeAvionCodeOaci, type_avion_nom: typeAvionNom, type_wake: getTypeWake(typeAvionCodeOaci),
      code_transpondeur: plan.code_transpondeur || null, mode_transpondeur: plan.mode_transpondeur || 'C',
      squawk_attendu: null, sid_depart: plan.sid_depart || null, star_arrivee: plan.star_arrivee || null,
      route_ifr: plan.route_ifr || null, strip_atd: plan.strip_atd || null, strip_rwy: plan.strip_rwy || null,
      strip_fl: plan.strip_fl || null, strip_fl_unit: plan.strip_fl_unit || null, strip_sid_atc: plan.strip_sid_atc || null,
      strip_note_1: plan.strip_note_1 || null, strip_note_2: plan.strip_note_2 || null, strip_note_3: plan.strip_note_3 || null,
      strip_star: plan.strip_star || null, strip_route: plan.strip_route || null, strip_pilote_text: plan.strip_pilote_text || null,
      strip_type_wake: plan.strip_type_wake || null, strip_zone: plan.strip_zone || null, strip_order: plan.strip_order ?? 0,
      pilote_identifiant: piloteIdentifiant, intentions_vol: plan.intentions_vol || null, niveau_croisiere: plan.niveau_croisiere || null,
      heure_depart_estimee: plan.heure_depart_estimee || null, instructions_atc: plan.note_atc || null,
      automonitoring: plan.automonitoring ?? false, isManual: !plan.pilote_id && Boolean(plan.created_by_atc),
      callsign_telephonie: callsignTelephonie, bria_conversation: plan.bria_conversation || null,
      current_holder_user_id: plan.current_holder_user_id || null,
    } as StripData;
  }));

  return NextResponse.json({ strips });
}
