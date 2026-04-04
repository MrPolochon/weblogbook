import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureComptePersonnel, getComptePersonnelCanonique } from '@/lib/felitz/ensure-comptes';

export const CHEQUE_MESSAGE_TYPES = [
  'cheque_salaire',
  'cheque_revenu_compagnie',
  'cheque_taxes_atc',
  'cheque_siavi_intervention',
  'cheque_siavi_taxes',
] as const;

export type FelitzChequeMessage = {
  id: string;
  destinataire_id: string;
  type_message: string;
  cheque_encaisse: boolean | null;
  cheque_montant: number | null;
  cheque_destinataire_compte_id: string | null;
  cheque_libelle: string | null;
  cheque_numero_vol: string | null;
  metadata: unknown;
};

/**
 * Encaissement atomique d’un chèque (même logique que PATCH messages action=encaisser).
 * Ne marque le chèque comme encaissé qu’après verrouillage conditionnel, puis crédit + relèves alliance.
 */
export async function encaisserChequeMessage(
  admin: SupabaseClient,
  userId: string,
  message: FelitzChequeMessage
): Promise<{ ok: true; montantNet: number } | { ok: false; error: string; status: number }> {
  if (message.destinataire_id !== userId) {
    return { ok: false, error: 'Non autorisé', status: 403 };
  }
  if (!(CHEQUE_MESSAGE_TYPES as readonly string[]).includes(message.type_message)) {
    return { ok: false, error: "Ce message n'est pas un chèque", status: 400 };
  }
  if (message.cheque_encaisse) {
    return { ok: false, error: 'Ce chèque a déjà été encaissé', status: 400 };
  }
  if (!message.cheque_montant || message.cheque_montant <= 0) {
    return { ok: false, error: 'Montant du chèque invalide', status: 400 };
  }

  let compteId = message.cheque_destinataire_compte_id;
  if (!compteId) {
    let compte = await getComptePersonnelCanonique(admin, userId);
    if (!compte) compte = await ensureComptePersonnel(admin, userId);
    if (!compte) return { ok: false, error: 'Compte Felitz introuvable', status: 404 };
    compteId = compte.id;
  }

  const { data: updateResult, error: updateError } = await admin
    .from('messages')
    .update({
      cheque_encaisse: true,
      cheque_encaisse_at: new Date().toISOString(),
      lu: true,
    })
    .eq('id', message.id)
    .eq('cheque_encaisse', false)
    .select('id');

  if (updateError || !updateResult || updateResult.length === 0) {
    return { ok: false, error: 'Ce chèque a déjà été encaissé', status: 400 };
  }

  const { data: compteData, error: compteError } = await admin
    .from('felitz_comptes')
    .select('id, solde')
    .eq('id', compteId)
    .single();

  if (compteError || !compteData) {
    await admin.from('messages').update({ cheque_encaisse: false, cheque_encaisse_at: null }).eq('id', message.id);
    return { ok: false, error: 'Compte introuvable', status: 404 };
  }

  const metadata = (message.metadata || {}) as { taxe_alliance?: number; codeshare?: number; numero_vol?: string };
  const taxeAlliance = metadata.taxe_alliance ?? 0;
  const codeshare = metadata.codeshare ?? 0;
  const numeroVol = metadata.numero_vol || message.cheque_numero_vol || '';

  const { data: creditOk } = await admin.rpc('crediter_compte_safe', {
    p_compte_id: compteId,
    p_montant: message.cheque_montant,
  });
  if (!creditOk) {
    await admin.from('messages').update({ cheque_encaisse: false, cheque_encaisse_at: null }).eq('id', message.id);
    return { ok: false, error: 'Erreur lors du crédit', status: 500 };
  }

  await admin.from('felitz_transactions').insert({
    compte_id: compteId,
    type: 'credit',
    montant: message.cheque_montant,
    libelle: message.cheque_libelle || `Encaissement chèque vol ${numeroVol}`,
  });

  if (taxeAlliance > 0) {
    const { data: taxeOk } = await admin.rpc('debiter_compte_safe', {
      p_compte_id: compteId,
      p_montant: taxeAlliance,
    });
    if (taxeOk) {
      await admin.from('felitz_transactions').insert({
        compte_id: compteId,
        type: 'debit',
        montant: taxeAlliance,
        libelle: `Taxe alliance - Vol ${numeroVol}`,
      });
    }
  }
  if (codeshare > 0) {
    const { data: codeshareOk } = await admin.rpc('debiter_compte_safe', {
      p_compte_id: compteId,
      p_montant: codeshare,
    });
    if (codeshareOk) {
      await admin.from('felitz_transactions').insert({
        compte_id: compteId,
        type: 'debit',
        montant: codeshare,
        libelle: `Codeshare alliance - Vol ${numeroVol}`,
      });
    }
  }

  const montantNet = message.cheque_montant - taxeAlliance - codeshare;
  return { ok: true, montantNet };
}
