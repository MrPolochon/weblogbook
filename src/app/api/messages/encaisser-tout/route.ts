import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { ensureComptePersonnel, getComptePersonnelCanonique } from '@/lib/felitz/ensure-comptes';

const CHEQUE_TYPES = ['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc', 'cheque_siavi_intervention', 'cheque_siavi_taxes'];

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const rl = rateLimit(`encaisser:${user.id}`, 5, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop de requêtes, réessayez dans une minute' }, { status: 429 });

    const admin = createAdminClient();

    const { data: cheques, error: fetchErr } = await admin.from('messages')
      .select('id, cheque_montant, cheque_encaisse, cheque_destinataire_compte_id, cheque_libelle, cheque_numero_vol, cheque_compagnie_nom, cheque_pour_compagnie, type_message, metadata')
      .eq('destinataire_id', user.id)
      .eq('cheque_encaisse', false)
      .in('type_message', CHEQUE_TYPES)
      .gt('cheque_montant', 0);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!cheques || cheques.length === 0) return NextResponse.json({ error: 'Aucun cheque a encaisser' }, { status: 400 });

    let comptePerso = await getComptePersonnelCanonique(admin, user.id);
    if (!comptePerso) comptePerso = await ensureComptePersonnel(admin, user.id);
    if (!comptePerso) return NextResponse.json({ error: 'Compte Felitz personnel introuvable' }, { status: 404 });

    // 1) Marquer TOUS les chèques comme encaissés en une seule requête
    const chequeIds = cheques.map(c => c.id);
    const now = new Date().toISOString();
    await admin.from('messages')
      .update({ cheque_encaisse: true, cheque_encaisse_at: now, lu: true })
      .in('id', chequeIds)
      .eq('cheque_encaisse', false);

    // 2) Regrouper par compte destination
    type GroupedAccount = {
      credit: number;
      taxeAlliance: number;
      codeshare: number;
      transactions: { compte_id: string; type: string; montant: number; libelle: string }[];
      nb: number;
    };
    const grouped = new Map<string, GroupedAccount>();

    for (const ch of cheques) {
      const compteId = ch.cheque_destinataire_compte_id || comptePerso.id;
      const meta = (ch.metadata || {}) as { taxe_alliance?: number; codeshare?: number; numero_vol?: string };
      const numVol = meta.numero_vol || ch.cheque_numero_vol || '';
      const taxeAlliance = meta.taxe_alliance ?? 0;
      const codeshareAmt = meta.codeshare ?? 0;

      if (!grouped.has(compteId)) {
        grouped.set(compteId, { credit: 0, taxeAlliance: 0, codeshare: 0, transactions: [], nb: 0 });
      }
      const g = grouped.get(compteId)!;
      g.credit += ch.cheque_montant;
      g.taxeAlliance += taxeAlliance;
      g.codeshare += codeshareAmt;
      g.nb++;

      g.transactions.push({
        compte_id: compteId, type: 'credit', montant: ch.cheque_montant,
        libelle: ch.cheque_libelle || `Encaissement cheque vol ${numVol}`,
      });
      if (taxeAlliance > 0) {
        g.transactions.push({
          compte_id: compteId, type: 'debit', montant: taxeAlliance,
          libelle: `Taxe alliance - Vol ${numVol}`,
        });
      }
      if (codeshareAmt > 0) {
        g.transactions.push({
          compte_id: compteId, type: 'debit', montant: codeshareAmt,
          libelle: `Codeshare alliance - Vol ${numVol}`,
        });
      }
    }

    // 3) Créditer/débiter par compte (1 appel RPC par compte au lieu de 1 par chèque)
    const allTransactions: { compte_id: string; type: string; montant: number; libelle: string }[] = [];
    const errors: string[] = [];

    const groupedEntries = Array.from(grouped.entries());
    const creditPromises = groupedEntries.map(async ([compteId, g]) => {
      const { data: creditOk } = await admin.rpc('crediter_compte_safe', { p_compte_id: compteId, p_montant: g.credit });
      if (!creditOk) {
        errors.push(`Erreur credit compte ${compteId.slice(0, 8)}`);
        return;
      }

      if (g.taxeAlliance > 0) {
        await admin.rpc('debiter_compte_safe', { p_compte_id: compteId, p_montant: g.taxeAlliance });
      }
      if (g.codeshare > 0) {
        await admin.rpc('debiter_compte_safe', { p_compte_id: compteId, p_montant: g.codeshare });
      }

      allTransactions.push(...g.transactions);
    });

    await Promise.all(creditPromises);

    // 4) Insérer TOUTES les transactions en une seule requête
    if (allTransactions.length > 0) {
      await admin.from('felitz_transactions').insert(allTransactions);
    }

    // 5) Calculer le récap
    const uniqueCompteIds = Array.from(grouped.keys());
    const compteLabels: Record<string, string> = {};
    if (uniqueCompteIds.length > 0) {
      const { data: comptes } = await admin.from('felitz_comptes')
        .select('id, type, compagnie_id')
        .in('id', uniqueCompteIds);
      if (comptes) {
        const compagnieIds = comptes.filter(c => c.compagnie_id).map(c => c.compagnie_id!);
        const compagnieNoms: Record<string, string> = {};
        if (compagnieIds.length > 0) {
          const { data: comps } = await admin.from('compagnies').select('id, nom').in('id', compagnieIds);
          if (comps) comps.forEach(c => { compagnieNoms[c.id] = c.nom; });
        }
        for (const c of comptes) {
          compteLabels[c.id] = c.type === 'entreprise' && c.compagnie_id
            ? compagnieNoms[c.compagnie_id] || 'Compte entreprise'
            : 'Compte personnel';
        }
      }
    }

    let totalEncaisse = 0;
    let nbEncaisse = 0;
    const recap: { label: string; nb: number; total: number }[] = [];

    for (const [compteId, g] of groupedEntries) {
      const montantNet = g.credit - g.taxeAlliance - g.codeshare;
      recap.push({ label: compteLabels[compteId] || 'Compte', nb: g.nb, total: montantNet });
      totalEncaisse += montantNet;
      nbEncaisse += g.nb;
    }

    return NextResponse.json({
      ok: true,
      nb_cheques: nbEncaisse,
      total: totalEncaisse,
      par_compte: recap,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error('encaisser-tout:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
