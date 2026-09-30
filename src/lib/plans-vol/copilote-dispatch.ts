import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyUser } from '@/lib/notifications';

const ORDRE_DEPART = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

const POSITION_LABELS: Record<string, string> = {
  Delivery: 'Livraison',
  Clairance: 'Clairance',
  Ground: 'Sol',
  Tower: 'Tour',
  DEP: 'Départs',
  APP: 'Approche',
  Center: 'Centre',
  AFIS: 'AFIS',
};

export type PlanForCopiloteDispatch = {
  id: string;
  pilote_id: string;
  copilote_id: string | null;
  numero_vol: string | null;
  aeroport_depart: string;
  aeroport_arrivee: string | null;
  vol_commercial: boolean | null;
  vol_ferry: boolean | null;
  nature_transport: string | null;
  nb_pax_genere: number | null;
  cargo_kg_genere: number | null;
  compagnie_avion_id: string | null;
  copilote_vol_sans_atc: boolean | null;
};

export type DispatchResult =
  | { kind: 'sans_atc' }
  | {
      kind: 'atc';
      atc_contact: { nom: string; position: string; aeroport: string; frequence: string };
    };

async function consumeCommercialLoads(
  admin: SupabaseClient,
  plan: PlanForCopiloteDispatch,
): Promise<void> {
  const ad = plan.aeroport_depart;
  const nbPax = plan.nb_pax_genere ?? 0;
  const cargo = plan.cargo_kg_genere ?? 0;
  if (plan.vol_commercial && nbPax > 0) {
    try {
      await admin.rpc('consommer_passagers_aeroport', { p_code_oaci: ad, p_passagers: nbPax });
    } catch {
      const { data: current } = await admin.from('aeroport_passagers').select('passagers_disponibles').eq('code_oaci', ad).single();
      if (current) {
        const newValue = Math.max(0, current.passagers_disponibles - nbPax);
        await admin.from('aeroport_passagers').update({ passagers_disponibles: newValue, updated_at: new Date().toISOString() }).eq('code_oaci', ad);
      }
    }
  }
  if (plan.vol_commercial && cargo > 0 && (plan.nature_transport === 'cargo' || plan.nature_transport === 'passagers')) {
    try {
      await admin.rpc('consommer_cargo', { p_code_oaci: ad, p_quantite: cargo });
    } catch {
      const { data: currentCargo } = await admin.from('aeroport_cargo').select('cargo_disponible').eq('code_oaci', ad).single();
      if (currentCargo) {
        const newValue = Math.max(0, currentCargo.cargo_disponible - cargo);
        await admin.from('aeroport_cargo').update({ cargo_disponible: newValue, updated_at: new Date().toISOString() }).eq('code_oaci', ad);
      }
    }
  }
  if (plan.compagnie_avion_id) {
    await admin.from('compagnie_avions').update({ statut: 'in_flight' }).eq('id', plan.compagnie_avion_id);
  }
}

async function applySansAtc(
  admin: SupabaseClient,
  plan: PlanForCopiloteDispatch,
  nowIso: string,
): Promise<DispatchResult> {
  const { data: locked, error } = await admin
    .from('plans_vol')
    .update({
      statut: 'accepte',
      accepted_at: nowIso,
      automonitoring: true,
      vol_sans_atc: true,
      current_holder_user_id: null,
      current_holder_position: null,
      current_holder_aeroport: null,
      copilote_valide_at: nowIso,
    })
    .eq('id', plan.id)
    .eq('statut', 'en_attente_copilote')
    .select('id');
  if (error || !locked?.length) {
    throw new Error('Ce plan n’est plus en attente de validation copilote.');
  }
  await consumeCommercialLoads(admin, plan);
  return { kind: 'sans_atc' };
}

export async function dispatchAfterCopiloteValidation(
  admin: SupabaseClient,
  plan: PlanForCopiloteDispatch,
): Promise<DispatchResult> {
  const nowIso = new Date().toISOString();
  const wantSansAtc = Boolean(plan.copilote_vol_sans_atc);
  if (wantSansAtc) {
    return applySansAtc(admin, plan, nowIso);
  }

  const ad = plan.aeroport_depart;
  const { data: allSessions } = await admin.from('atc_sessions').select('user_id, position, aeroport').eq('aeroport', ad);
  let holder: { user_id: string; position: string; aeroport: string } | null = null;
  if (allSessions?.length) {
    for (const pos of ORDRE_DEPART) {
      const session = allSessions.find((s) => s.aeroport === ad && s.position === pos);
      if (session?.user_id) {
        holder = { user_id: session.user_id, position: pos, aeroport: ad };
        break;
      }
    }
  }

  if (!holder) {
    return applySansAtc(admin, plan, nowIso);
  }

  const { data: locked, error } = await admin
    .from('plans_vol')
    .update({
      statut: 'en_attente',
      vol_sans_atc: false,
      automonitoring: false,
      current_holder_user_id: holder.user_id,
      current_holder_position: holder.position,
      current_holder_aeroport: holder.aeroport,
      copilote_valide_at: nowIso,
    })
    .eq('id', plan.id)
    .eq('statut', 'en_attente_copilote')
    .select('id');
  if (error || !locked?.length) {
    throw new Error('Ce plan n’est plus en attente de validation copilote.');
  }

  await consumeCommercialLoads(admin, plan);

  try {
    await admin.from('atc_plans_controles').upsert(
      {
        plan_vol_id: plan.id,
        user_id: holder.user_id,
        aeroport: holder.aeroport,
        position: holder.position,
      },
      { onConflict: 'plan_vol_id,user_id,aeroport,position' },
    );
  } catch (e) {
    console.error('Erreur enregistrement controle ATC (copilote):', e);
  }

  const { data: holderProfile } = await admin.from('profiles').select('identifiant').eq('id', holder.user_id).single();
  const { data: vhfFreq } = await admin
    .from('vhf_position_frequencies')
    .select('frequency')
    .eq('aeroport', holder.aeroport)
    .eq('position', holder.position)
    .maybeSingle();
  const posLabel = POSITION_LABELS[holder.position] || holder.position;
  return {
    kind: 'atc',
    atc_contact: {
      nom: holderProfile?.identifiant || 'Contrôleur',
      position: `${holder.aeroport} ${posLabel}`,
      aeroport: holder.aeroport,
      frequence: vhfFreq?.frequency ? String(vhfFreq.frequency).replace('.', ' décimal ') : '',
    },
  };
}

export async function notifyCrewAfterDispatch(
  plan: PlanForCopiloteDispatch,
  result: DispatchResult,
): Promise<void> {
  const vol = plan.numero_vol || 'plan';
  const route = `${plan.aeroport_depart} → ${plan.aeroport_arrivee ?? '?'}`;
  const sansAtc = result.kind === 'sans_atc';
  const atcDetail = !sansAtc && result.kind === 'atc'
    ? ` Contactez ${result.atc_contact.nom} — ${result.atc_contact.position}${result.atc_contact.frequence ? ` sur ${result.atc_contact.frequence}` : ''}.`
    : '';
  const title = sansAtc ? `Vol ${vol} confirmé sans ATC` : `Vol ${vol} envoyé à l’ATC`;
  await notifyUser(plan.pilote_id, {
    type: 'plan_copilote',
    title,
    body: sansAtc
      ? `Le copilote a validé ${vol} (${route}). Le vol est en autosurveillance.`
      : `Le copilote a validé ${vol} (${route}).${atcDetail}`,
    link: '/logbook/plans-vol',
  });
  if (plan.copilote_id) {
    await notifyUser(plan.copilote_id, {
      type: 'plan_copilote',
      title,
      body: sansAtc
        ? `Vous avez validé ${vol} (${route}). Le vol est en autosurveillance.`
        : `Vous avez validé ${vol} (${route}).${atcDetail}`,
      link: '/logbook/plans-vol',
    });
  }
}
