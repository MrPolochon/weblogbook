import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

// Ordre de priorité pour recevoir un nouveau plan de vol (par aéroport) :
// Delivery et Clairance d’abord ; si les deux sont hors ligne, Ground peut accepter ;
// si Ground est hors ligne, Tower ; puis DEP, APP, Center.
const ORDRE_ACCEPTATION_PLANS = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role === 'atc') return NextResponse.json({ error: 'Compte ATC uniquement : dépôt de plan depuis l\'espace pilote impossible.' }, { status: 403 });

    const body = await request.json();
    const {
      aeroport_depart,
      aeroport_arrivee,
      numero_vol,
      porte,
      temps_prev_min,
      type_vol,
      intentions_vol,
      sid_depart,
      star_arrivee,
      route_ifr,
      note_atc,
      vol_commercial,
      nature_cargo,
      compagnie_avion_id,
      inventaire_avion_id,
      type_avion_id,
    } = body;
    const ad = String(aeroport_depart || '').toUpperCase();
    const aa = String(aeroport_arrivee || '').toUpperCase();
    if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) return NextResponse.json({ error: 'Aéroports invalides.' }, { status: 400 });
    if (!numero_vol || typeof numero_vol !== 'string' || !String(numero_vol).trim()) return NextResponse.json({ error: 'Numéro de vol requis.' }, { status: 400 });
    const t = parseInt(String(temps_prev_min), 10);
    if (isNaN(t) || t < 1) return NextResponse.json({ error: 'Temps prévu invalide (minutes ≥ 1).' }, { status: 400 });
    if (!type_vol || !['VFR', 'IFR'].includes(String(type_vol))) return NextResponse.json({ error: 'Type de vol VFR ou IFR requis.' }, { status: 400 });
    if (String(type_vol) === 'VFR' && (!intentions_vol || !String(intentions_vol).trim())) return NextResponse.json({ error: 'Intentions de vol requises pour VFR.' }, { status: 400 });
    if (String(type_vol) === 'IFR') {
      if (!sid_depart || !String(sid_depart).trim()) return NextResponse.json({ error: 'SID de départ requise pour IFR.' }, { status: 400 });
      if (!star_arrivee || !String(star_arrivee).trim()) return NextResponse.json({ error: 'STAR d\'arrivée requise pour IFR.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const airportsToCheck = ad === aa ? [ad] : [ad, aa];
    let holder: { user_id: string; position: string; aeroport: string } | null = null;
    for (const apt of airportsToCheck) {
      for (const pos of ORDRE_ACCEPTATION_PLANS) {
        const { data: s } = await admin.from('atc_sessions').select('user_id').eq('aeroport', apt).eq('position', pos).single();
        if (s?.user_id) { holder = { user_id: s.user_id, position: pos, aeroport: apt }; break; }
      }
      if (holder) break;
    }

    if (!holder) {
      return NextResponse.json({ error: 'Aucune fréquence ATC de votre aéroport de départ ou d\'arrivée est en ligne, votre vol doit être effectué sans plan de vol.' }, { status: 400 });
    }

    let compagnieAvionId: string | null = null;
    let inventaireAvionId: string | null = null;
    let typeAvionIdFinal: string | null = null;

    if (compagnie_avion_id) {
      const { data: avionComp } = await admin.from('compagnies_avions').select('id, quantite').eq('id', compagnie_avion_id).single();
      if (!avionComp) return NextResponse.json({ error: 'Avion compagnie introuvable' }, { status: 400 });

      const { count } = await admin
        .from('avions_utilisation')
        .select('*', { count: 'exact', head: true })
        .eq('compagnie_avion_id', compagnie_avion_id);
      if ((count || 0) >= avionComp.quantite) {
        return NextResponse.json({ error: 'Tous les avions de ce type sont déjà en utilisation' }, { status: 400 });
      }

      compagnieAvionId = compagnie_avion_id;
    } else if (inventaire_avion_id) {
      const { data: avionInv } = await supabase.from('inventaire_pilote').select('id').eq('id', inventaire_avion_id).eq('user_id', user.id).single();
      if (!avionInv) return NextResponse.json({ error: 'Avion inventaire introuvable' }, { status: 400 });
      inventaireAvionId = inventaire_avion_id;
    } else if (type_avion_id) {
      typeAvionIdFinal = type_avion_id;
    } else {
      return NextResponse.json({ error: 'Sélectionnez un avion' }, { status: 400 });
    }

    if (vol_commercial) {
      const { data: employe } = await supabase.from('compagnies_employes').select('compagnie_id').eq('user_id', user.id).single();
      if (!employe) return NextResponse.json({ error: 'Vous devez appartenir à une compagnie pour un vol commercial' }, { status: 400 });
    }

    const row: any = {
      pilote_id: user.id,
      aeroport_depart: ad,
      aeroport_arrivee: aa,
      numero_vol: String(numero_vol).trim(),
      porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
      temps_prev_min: t,
      type_vol: String(type_vol),
      intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
      sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
      star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
      route_ifr: type_vol === 'IFR' && route_ifr ? String(route_ifr).trim() : null,
      note_atc: note_atc ? String(note_atc).trim() : null,
      vol_commercial: Boolean(vol_commercial),
      nature_cargo: vol_commercial && nature_cargo ? String(nature_cargo).trim() : null,
      compagnie_avion_id: compagnieAvionId,
      inventaire_avion_id: inventaireAvionId,
      statut: 'en_attente',
      current_holder_user_id: holder.user_id,
      current_holder_position: holder.position,
      current_holder_aeroport: holder.aeroport,
    };

    const { data, error } = await supabase.from('plans_vol').insert(row).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (compagnieAvionId) {
      await admin.from('avions_utilisation').insert({
        compagnie_avion_id: compagnieAvionId,
        plan_vol_id: data.id,
      });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('plans-vol POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
