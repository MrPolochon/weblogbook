import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const CHEQUE_TYPES = ['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc', 'cheque_siavi_intervention', 'cheque_siavi_taxes'];

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();

    const { data: cheques, error: fetchErr } = await admin.from('messages')
      .select('id, cheque_montant, cheque_encaisse, cheque_destinataire_compte_id, cheque_libelle, cheque_numero_vol, cheque_compagnie_nom, cheque_pour_compagnie, type_message, metadata')
      .eq('destinataire_id', user.id)
      .eq('cheque_encaisse', false)
      .in('type_message', CHEQUE_TYPES)
      .gt('cheque_montant', 0);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!cheques || cheques.length === 0) return NextResponse.json({ error: 'Aucun cheque a encaisser' }, { status: 400 });

    const { data: comptePerso } = await admin.from('felitz_comptes')
      .select('id')
      .eq('proprietaire_id', user.id)
      .eq('type', 'personnel')
      .single();

    if (!comptePerso) return NextResponse.json({ error: 'Compte Felitz personnel introuvable' }, { status: 404 });

    const compteLabels: Record<string, string> = {};
    const uniqueCompteIds = new Set<string>();
    for (const ch of cheques) {
      const cid = ch.cheque_destinataire_compte_id || comptePerso.id;
      uniqueCompteIds.add(cid);
    }
    if (uniqueCompteIds.size > 0) {
      const { data: comptes } = await admin.from('felitz_comptes')
        .select('id, type, vban, compagnie_id')
        .in('id', Array.from(uniqueCompteIds));
      if (comptes) {
        const compagnieIds = comptes.filter(c => c.compagnie_id).map(c => c.compagnie_id!);
        let compagnieNoms: Record<string, string> = {};
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

    const recap: Record<string, { label: string; nb: number; total: number }> = {};
    let totalEncaisse = 0;
    let nbEncaisse = 0;
    const errors: string[] = [];

    for (const ch of cheques) {
      const compteId = ch.cheque_destinataire_compte_id || comptePerso.id;

      const { data: upd, error: updErr } = await admin.from('messages')
        .update({ cheque_encaisse: true, cheque_encaisse_at: new Date().toISOString(), lu: true })
        .eq('id', ch.id)
        .eq('cheque_encaisse', false)
        .select('id');

      if (updErr || !upd || upd.length === 0) {
        errors.push(`Cheque ${ch.id.slice(0, 8)} deja encaisse`);
        continue;
      }

      const { data: creditOk } = await admin.rpc('crediter_compte_safe', { p_compte_id: compteId, p_montant: ch.cheque_montant });
      if (!creditOk) {
        await admin.from('messages').update({ cheque_encaisse: false, cheque_encaisse_at: null }).eq('id', ch.id);
        errors.push(`Erreur credit cheque ${ch.id.slice(0, 8)}`);
        continue;
      }

      const meta = (ch.metadata || {}) as { taxe_alliance?: number; codeshare?: number; numero_vol?: string };
      const numVol = meta.numero_vol || ch.cheque_numero_vol || '';

      await admin.from('felitz_transactions').insert({
        compte_id: compteId,
        type: 'credit',
        montant: ch.cheque_montant,
        libelle: ch.cheque_libelle || `Encaissement cheque vol ${numVol}`,
      });

      const taxeAlliance = meta.taxe_alliance ?? 0;
      const codeshareAmt = meta.codeshare ?? 0;

      if (taxeAlliance > 0) {
        const ok = await admin.rpc('debiter_compte_safe', { p_compte_id: compteId, p_montant: taxeAlliance });
        if (ok) {
          await admin.from('felitz_transactions').insert({
            compte_id: compteId, type: 'debit', montant: taxeAlliance,
            libelle: `Taxe alliance - Vol ${numVol}`,
          });
        }
      }
      if (codeshareAmt > 0) {
        const ok = await admin.rpc('debiter_compte_safe', { p_compte_id: compteId, p_montant: codeshareAmt });
        if (ok) {
          await admin.from('felitz_transactions').insert({
            compte_id: compteId, type: 'debit', montant: codeshareAmt,
            libelle: `Codeshare alliance - Vol ${numVol}`,
          });
        }
      }

      const montantNet = ch.cheque_montant - taxeAlliance - codeshareAmt;

      if (!recap[compteId]) {
        recap[compteId] = { label: compteLabels[compteId] || 'Compte', nb: 0, total: 0 };
      }
      recap[compteId].nb++;
      recap[compteId].total += montantNet;
      totalEncaisse += montantNet;
      nbEncaisse++;
    }

    return NextResponse.json({
      ok: true,
      nb_cheques: nbEncaisse,
      total: totalEncaisse,
      par_compte: Object.values(recap),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error('encaisser-tout:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
