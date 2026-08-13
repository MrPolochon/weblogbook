import type { SupabaseClient } from '@supabase/supabase-js';
import { COUT_VOL_FERRY } from '@/lib/compagnie-utils';
import { resolveAeroportBaseRetour } from '@/lib/reparation-after-ferry';

const TRANSIT_MIN_MS = 20 * 60 * 1000;
const TRANSIT_MAX_MS = 4 * 60 * 60 * 1000;

/** Demandes encore « ouvertes » (avion engagé côté flotte). */
export const REPARATION_STATUTS_ACTIFS = [
  'demandee',
  'acceptee',
  'en_transit',
  'en_reparation',
  'mini_jeux',
  'terminee',
  'facturee',
  'payee',
  'retour_transit',
] as const;

/** Statuts demande où l’avion doit être `en_reparation` au hangar. */
const STATUTS_AVION_EN_REPARATION = [
  'en_reparation',
  'mini_jeux',
  'terminee',
  'facturee',
  'payee',
] as const;

/** Statuts demande où l’avion doit être `en_transit`. */
const STATUTS_AVION_EN_TRANSIT = ['en_transit', 'retour_transit'] as const;

/** Délai aléatoire entre 20 min et 4 h pour simuler transit routier / acheminement. */
export function randomReparationTransitDelayMs(): number {
  return TRANSIT_MIN_MS + Math.floor(Math.random() * (TRANSIT_MAX_MS - TRANSIT_MIN_MS + 1));
}

export function isoReparationTransitEtaFromNow(): string {
  return new Date(Date.now() + randomReparationTransitDelayMs()).toISOString();
}

export function formatReparationTransitDuration(ms: number): string {
  const minutesTotal = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(minutesTotal / 60);
  const m = minutesTotal % 60;
  if (h <= 0) return `${m} min`;
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
}

export async function calculerCoutTransfertReparation(
  admin: SupabaseClient,
  aeroportArrivee: string
): Promise<{ coutBase: number; taxes: number; total: number; tauxTaxe: number }> {
  const { data: taxesData } = await admin.from('taxes_aeroport')
    .select('taxe_pourcent')
    .eq('code_oaci', aeroportArrivee)
    .single();
  const tauxTaxe = taxesData?.taxe_pourcent || 2;
  const taxes = Math.round(COUT_VOL_FERRY * tauxTaxe / 100);
  return { coutBase: COUT_VOL_FERRY, taxes, total: COUT_VOL_FERRY + taxes, tauxTaxe };
}

type HangarLite = { aeroport_code?: string | null };

function hangarCodeFromJoined(row: { reparation_hangars?: HangarLite | HangarLite[] | null }): string | null {
  const joined = Array.isArray(row.reparation_hangars) ? row.reparation_hangars[0] : row.reparation_hangars;
  const code = joined?.aeroport_code;
  return code ? String(code).trim().toUpperCase() : null;
}

/**
 * Exécute l’arrivée au hangar pour une demande en `en_transit` (même logique que PATCH ferry_arrive, cas transfert entreprise).
 * Ne pas appeler deux fois sans garde statut ; le cron passe par une mise à jour conditionnelle.
 */
export async function applyEntrepriseTransfertArriveeHangar(
  admin: SupabaseClient,
  demande: {
    id: string;
    avion_id: string;
    compagnie_id: string;
    entreprise_id: string;
    hangar_id: string;
    reparation_hangars?: HangarLite | HangarLite[] | null;
  },
  hangarAeroport: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: avionCurrent } = await admin
    .from('compagnie_avions')
    .select('id, immatriculation, aeroport_actuel')
    .eq('id', demande.avion_id)
    .single();
  if (!avionCurrent) return { ok: false, error: 'Avion introuvable' };

  const nowIso = new Date().toISOString();

  const { data: demandeLiee } = await admin
    .from('reparation_demandes')
    .update({
      statut: 'en_reparation',
      debut_reparation_at: nowIso,
      entreprise_transit_eta_at: null,
    })
    .eq('id', demande.id)
    .eq('statut', 'en_transit')
    .select('id');

  if (!demandeLiee?.length) {
    return {
      ok: false,
      error: 'Transit déjà traité ou statut incompatible.',
    };
  }

  const { error: avionErr } = await admin.from('compagnie_avions').update({
    aeroport_actuel: hangarAeroport,
    statut: 'en_reparation',
  }).eq('id', demande.avion_id);

  if (avionErr) {
    console.error('[reparation] applyEntrepriseTransfertArriveeHangar maj avion:', avionErr);
    // Rollback demande pour éviter demande en_reparation + avion bloqué en_transit
    await admin.from('reparation_demandes').update({
      statut: 'en_transit',
      debut_reparation_at: null,
      entreprise_transit_eta_at: new Date().toISOString(),
    }).eq('id', demande.id).eq('statut', 'en_reparation');
    return {
      ok: false,
      error: `Impossible de mettre l'avion en réparation (${avionErr.message}). Vérifiez la contrainte statut (supabase/fix_compagnie_avions_statut_check_reparation.sql).`,
    };
  }

  return { ok: true };
}

/**
 * Remet au sol un avion bloqué `en_reparation` / `en_transit` sans demande active,
 * et resynchronise le statut flotte avec les demandes encore ouvertes.
 * Idempotent — à appeler depuis GET flotte / cron.
 */
export async function healCompagnieAvionsReparationStatuts(
  admin: SupabaseClient,
  compagnieId?: string
): Promise<{ orphansHealed: number; syncedRepair: number; syncedTransit: number }> {
  let orphansHealed = 0;
  let syncedRepair = 0;
  let syncedTransit = 0;

  let demandesQuery = admin
    .from('reparation_demandes')
    .select('avion_id, statut')
    .in('statut', [...REPARATION_STATUTS_ACTIFS]);
  if (compagnieId) demandesQuery = demandesQuery.eq('compagnie_id', compagnieId);

  const { data: actives } = await demandesQuery;
  const repairIds = new Set<string>();
  const transitIds = new Set<string>();
  for (const d of actives || []) {
    if (!d.avion_id) continue;
    if ((STATUTS_AVION_EN_TRANSIT as readonly string[]).includes(d.statut)) {
      transitIds.add(d.avion_id);
    } else if ((STATUTS_AVION_EN_REPARATION as readonly string[]).includes(d.statut)) {
      repairIds.add(d.avion_id);
    }
    // demandee / acceptee : ne forcent pas un statut flotte spécial
  }

  // Priorité transit > réparation si conflit (ne devrait pas arriver)
  for (const id of transitIds) repairIds.delete(id);

  if (transitIds.size > 0) {
    const { data: updated } = await admin
      .from('compagnie_avions')
      .update({ statut: 'en_transit' })
      .in('id', Array.from(transitIds))
      .neq('statut', 'en_transit')
      .select('id');
    syncedTransit = updated?.length ?? 0;
  }

  if (repairIds.size > 0) {
    const { data: updated } = await admin
      .from('compagnie_avions')
      .update({ statut: 'en_reparation' })
      .in('id', Array.from(repairIds))
      .neq('statut', 'en_reparation')
      .select('id');
    syncedRepair = updated?.length ?? 0;
  }

  // Orphelins : statut réparation/transit sans demande qui justifie ce verrouillage
  // (ex. hangar supprimé → CASCADE a effacé reparation_demandes).
  // demandee/acceptee ne verrouillent pas encore le statut flotte.
  const lockedIds = new Set([...Array.from(transitIds), ...Array.from(repairIds)]);

  let orphanQuery = admin
    .from('compagnie_avions')
    .select('id')
    .in('statut', ['en_reparation', 'en_transit']);
  if (compagnieId) orphanQuery = orphanQuery.eq('compagnie_id', compagnieId);

  const { data: candidates } = await orphanQuery;
  const orphanIds = (candidates || [])
    .map((a) => a.id)
    .filter((id) => !lockedIds.has(id));

  if (orphanIds.length > 0) {
    const { data: healed } = await admin
      .from('compagnie_avions')
      .update({ statut: 'ground' })
      .in('id', orphanIds)
      .select('id');
    orphansHealed = healed?.length ?? 0;
  }

  return { orphansHealed, syncedRepair, syncedTransit };
}

/**
 * Force la fin d’une réparation côté flotte : 100 % santé, au sol, demandes actives annulées.
 * Réservé admin / outils de récupération.
 */
export async function forceLibererAvionReparation(
  admin: SupabaseClient,
  avionId: string,
  opts?: { usurePercent?: number }
): Promise<{ ok: true; demandesAnnulees: number } | { ok: false; error: string }> {
  const usure = Math.max(0, Math.min(100, opts?.usurePercent ?? 100));

  const { data: avion } = await admin
    .from('compagnie_avions')
    .select('id')
    .eq('id', avionId)
    .maybeSingle();
  if (!avion) return { ok: false, error: 'Avion introuvable' };

  const { data: actives } = await admin
    .from('reparation_demandes')
    .select('id')
    .eq('avion_id', avionId)
    .in('statut', [...REPARATION_STATUTS_ACTIFS]);

  if (actives?.length) {
    await admin
      .from('reparation_demandes')
      .update({ statut: 'annulee' })
      .in('id', actives.map((d) => d.id));
  }

  const { error } = await admin
    .from('compagnie_avions')
    .update({ usure_percent: usure, statut: 'ground' })
    .eq('id', avionId);

  if (error) {
    return { ok: false, error: error.message || 'Mise à jour avion impossible' };
  }

  return { ok: true, demandesAnnulees: actives?.length ?? 0 };
}

/** Une demande en entreprise transfert dont l’échéance est passée → hangar + en réparation. */
export async function processDueEntrepriseTransits(admin: SupabaseClient): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await admin
    .from('reparation_demandes')
    .select('id, avion_id, compagnie_id, entreprise_id, hangar_id, reparation_hangars(aeroport_code)')
    .eq('statut', 'en_transit')
    .not('entreprise_transit_eta_at', 'is', null)
    .lte('entreprise_transit_eta_at', nowIso)
    .limit(50);

  let n = 0;
  for (const raw of rows || []) {
    const row = raw as typeof raw & { reparation_hangars?: HangarLite | HangarLite[] | null };
    const code = hangarCodeFromJoined(row);
    if (!code) continue;
    const res = await applyEntrepriseTransfertArriveeHangar(admin, row as Parameters<typeof applyEntrepriseTransfertArriveeHangar>[1], code);
    if (res.ok) n += 1;
  }
  return n;
}

/** Retour automatique : avion ramené à l’aéroport d’origine (déjà dans resolveAeroportBaseRetour). */
export async function processDueRetourTransits(admin: SupabaseClient): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await admin
    .from('reparation_demandes')
    .select('id, avion_id, compagnie_id, aeroport_depart_client')
    .eq('statut', 'retour_transit')
    .not('retour_transit_eta_at', 'is', null)
    .lte('retour_transit_eta_at', nowIso)
    .limit(50);

  let n = 0;
  for (const d of rows || []) {
    let baseCible = await resolveAeroportBaseRetour(admin, {
      compagnie_id: d.compagnie_id,
      aeroport_depart_client: d.aeroport_depart_client ?? null,
    });
    // Filet : sans hub / aéroport d'origine, ne pas laisser l'avion bloqué en transit.
    if (!baseCible) {
      const { data: av } = await admin
        .from('compagnie_avions')
        .select('aeroport_actuel')
        .eq('id', d.avion_id)
        .maybeSingle();
      baseCible = av?.aeroport_actuel
        ? String(av.aeroport_actuel).trim().toUpperCase()
        : null;
    }
    if (!baseCible) continue;
    /** Mise à jour atomique : si un ferry a déjà clôturé, aucune ligne ne matche. */
    const { data: gated, error } = await admin
      .from('reparation_demandes')
      .update({
        statut: 'completee',
        completee_at: nowIso,
        retour_transit_eta_at: null,
      })
      .lte('retour_transit_eta_at', nowIso)
      .eq('id', d.id)
      .eq('statut', 'retour_transit')
      .select('compagnie_id')
      .maybeSingle();

    if (error || !gated) continue;

    await admin.from('compagnie_avions').update({
      aeroport_actuel: baseCible,
      statut: 'ground',
    }).eq('id', d.avion_id);

    const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', d.compagnie_id).single();
    if (comp?.pdg_id) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `✅ Réparation — avion au parking`,
        contenu: `Votre avion est arrivé après transit automatique (${baseCible}). Il est disponible au parking.`,
        type_message: 'normal',
      });
    }
    n += 1;
  }
  return n;
}
