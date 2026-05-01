import type { SupabaseClient } from '@supabase/supabase-js';
import { COUT_VOL_FERRY } from '@/lib/compagnie-utils';
import { resolveAeroportBaseRetour } from '@/lib/reparation-after-ferry';

const TRANSIT_MIN_MS = 20 * 60 * 1000;
const TRANSIT_MAX_MS = 4 * 60 * 60 * 1000;

/** Délai aléatoire entre 20 min et 4 h pour simuler transit routier / acheminement. */
export function randomReparationTransitDelayMs(): number {
  return TRANSIT_MIN_MS + Math.floor(Math.random() * (TRANSIT_MAX_MS - TRANSIT_MIN_MS + 1));
}

export function isoReparationTransitEtaFromNow(): string {
  return new Date(Date.now() + randomReparationTransitDelayMs()).toISOString();
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

  const taxesDataRes = await admin.from('taxes_aeroport')
    .select('taxe_pourcent')
    .eq('code_oaci', hangarAeroport)
    .single();
  const tauxTaxe = taxesDataRes.data?.taxe_pourcent || 2;
  const taxesTransfert = Math.round(COUT_VOL_FERRY * tauxTaxe / 100);
  const coutTransfert = COUT_VOL_FERRY + taxesTransfert;

  const { data: compteComp } = await admin.from('felitz_comptes')
    .select('id, solde')
    .eq('compagnie_id', demande.compagnie_id)
    .eq('type', 'entreprise')
    .single();
  if (!compteComp) return { ok: false, error: 'Compte entreprise introuvable' };
  if (compteComp.solde < coutTransfert) {
    return {
      ok: false,
      error: `Solde insuffisant pour le transfert vers le hangar (${coutTransfert.toLocaleString('fr-FR')} F$).`,
    };
  }

  const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
    p_compte_id: compteComp.id,
    p_montant: coutTransfert,
  });
  if (!debitOk) return { ok: false, error: 'Solde insuffisant (transaction concurrente)' };

  const compteRepId = (
    await admin.from('felitz_comptes')
      .select('id')
      .eq('entreprise_reparation_id', demande.entreprise_id)
      .eq('type', 'reparation')
      .maybeSingle()
  ).data?.id;
  let repairCredited = false;

  await admin.from('felitz_transactions').insert({
    compte_id: compteComp.id,
    type: 'debit',
    montant: COUT_VOL_FERRY,
    libelle: `Transfert réparation ${avionCurrent.immatriculation} vers ${hangarAeroport}`,
  });
  if (taxesTransfert > 0) {
    await admin.from('felitz_transactions').insert({
      compte_id: compteComp.id,
      type: 'debit',
      montant: taxesTransfert,
      libelle: `Taxes aéroportuaires ${hangarAeroport} (transfert réparation)`,
    });
  }

  if (compteRepId) {
    await admin.rpc('crediter_compte_safe', { p_compte_id: compteRepId, p_montant: coutTransfert });
    repairCredited = true;
    await admin.from('felitz_transactions').insert({
      compte_id: compteRepId,
      type: 'credit',
      montant: coutTransfert,
      libelle: `Transfert pris en charge pour ${avionCurrent.immatriculation}`,
    });
  }

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
    await admin.rpc('crediter_compte_safe', { p_compte_id: compteComp.id, p_montant: coutTransfert });
    if (repairCredited && compteRepId) {
      await admin.rpc('debiter_compte_safe', { p_compte_id: compteRepId, p_montant: coutTransfert });
    }
    return {
      ok: false,
      error: 'Transit déjà traité ou statut incompatible (réessayez plus tard ou contactez un admin si le solde a bougé).',
    };
  }

  await admin.from('compagnie_avions').update({
    aeroport_actuel: hangarAeroport,
    statut: 'en_reparation',
  }).eq('id', demande.avion_id);

  return { ok: true };
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
    const baseCible = await resolveAeroportBaseRetour(admin, {
      compagnie_id: d.compagnie_id,
      aeroport_depart_client: d.aeroport_depart_client ?? null,
    });
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
      statut: 'disponible',
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
