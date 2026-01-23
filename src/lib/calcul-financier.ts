import { createAdminClient } from '@/lib/supabase/admin';

type PlanVol = {
  id: string;
  pilote_id: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  temps_prev_min: number;
  vol_commercial: boolean;
  nature_cargo: string | null;
  compagnie_avion_id: string | null;
  nombre_passagers: number | null;
  cargo_kg: number | null;
};

type Vol = {
  id: string;
  duree_minutes: number;
  depart_utc: string;
  arrivee_utc: string;
};

export async function calculerFinances(plan: PlanVol, vol: Vol | null) {
  const admin = createAdminClient();

  if (!plan.vol_commercial) {
    return {
      revenue_total: 0,
      taxes_aeroportuaires: 0,
      revenue_effectif: 0,
      salaire_pilote: 0,
      revenue_compagnie: 0,
    };
  }

  let nombrePassagers = plan.nombre_passagers || 0;
  let cargoKg = plan.cargo_kg || 0;
  let prixBillet = 0;
  let prixCargo = 0;

  if (plan.compagnie_avion_id) {
    const { data: avionComp } = await admin
      .from('compagnies_avions')
      .select('prix_billet_base, prix_cargo_kg, capacite_passagers, compagnie_id, compagnies(pourcentage_paie)')
      .eq('id', plan.compagnie_avion_id)
      .single();

    if (!avionComp) {
      throw new Error('Avion compagnie introuvable');
    }

    prixBillet = Number(avionComp.prix_billet_base || 0);
    prixCargo = Number(avionComp.prix_cargo_kg || 0);

    if (nombrePassagers === 0 && cargoKg === 0) {
      const capacite = avionComp.capacite_passagers || 0;
      if (capacite > 0) {
        nombrePassagers = Math.floor(Math.random() * capacite * 0.8) + Math.floor(capacite * 0.2);
      }
    }

    if (cargoKg === 0 && plan.nature_cargo && plan.nature_cargo.toLowerCase().includes('cargo')) {
      const { data: avionType } = await admin.from('compagnies_avions').select('type_avion_id').eq('id', plan.compagnie_avion_id).single();
      if (avionType) {
        const { data: marketplace } = await admin
          .from('marketplace_avions')
          .select('capacite_cargo_kg')
          .eq('type_avion_id', avionType.type_avion_id)
          .single();
        const capaciteCargo = marketplace?.capacite_cargo_kg || 0;
        if (capaciteCargo > 0) {
          cargoKg = Math.floor(Math.random() * capaciteCargo * 0.8) + Math.floor(capaciteCargo * 0.2);
        }
      }
    }

    const revenue_total = nombrePassagers * prixBillet + cargoKg * prixCargo;

    const [{ data: taxeDep }, { data: taxeArr }] = await Promise.all([
      admin.from('taxes_aeroports').select('taxe_base_pourcent, taxe_vfr_pourcent').eq('code_aeroport', plan.aeroport_depart).single(),
      admin.from('taxes_aeroports').select('taxe_base_pourcent, taxe_vfr_pourcent').eq('code_aeroport', plan.aeroport_arrivee).single(),
    ]);

    const taxeBase = plan.type_vol === 'VFR' ? 5.0 : 2.0;
    const taxeDepPct = plan.type_vol === 'VFR' ? Number(taxeDep?.taxe_vfr_pourcent || 5.0) : Number(taxeDep?.taxe_base_pourcent || 2.0);
    const taxeArrPct = plan.type_vol === 'VFR' ? Number(taxeArr?.taxe_vfr_pourcent || 5.0) : Number(taxeArr?.taxe_base_pourcent || 2.0);

    let taxes_aeroportuaires = (revenue_total * taxeDepPct) / 100 + (revenue_total * taxeArrPct) / 100;

    if (vol) {
      const tempsReel = vol.duree_minutes;
      const tempsPrev = plan.temps_prev_min;
      if (tempsReel > tempsPrev) {
        const diff = tempsReel - tempsPrev;
        const penaliteParMinute = (revenue_total * 0.01) / 100;
        taxes_aeroportuaires += diff * penaliteParMinute;
      }
    }

    const revenue_effectif = revenue_total - taxes_aeroportuaires;
    const pourcentagePaie = Number((avionComp.compagnies as any).pourcentage_paie || 50);
    const salaire_pilote = (revenue_effectif * pourcentagePaie) / 100;
    const revenue_compagnie = revenue_effectif - salaire_pilote;

    return {
      revenue_total,
      taxes_aeroportuaires,
      revenue_effectif,
      salaire_pilote,
      revenue_compagnie,
      nombre_passagers: nombrePassagers,
      cargo_kg: cargoKg,
    };
  }

  return {
    revenue_total: 0,
    taxes_aeroportuaires: 0,
    revenue_effectif: 0,
    salaire_pilote: 0,
    revenue_compagnie: 0,
  };
}
