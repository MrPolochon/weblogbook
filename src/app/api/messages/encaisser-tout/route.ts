import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getComptePersonnelCanonique, ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';
import {
  CHEQUE_MESSAGE_TYPES,
  encaisserChequeMessage,
  type FelitzChequeMessage,
} from '@/lib/felitz/encaisser-cheque';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const rl = rateLimit(`encaisser:${user.id}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Trop de requêtes, réessayez dans une minute' }, { status: 429 });
    }

    const admin = createAdminClient();

    const { data: cheques, error: fetchErr } = await admin
      .from('messages')
      .select(
        'id, destinataire_id, type_message, cheque_montant, cheque_encaisse, cheque_destinataire_compte_id, cheque_libelle, cheque_numero_vol, metadata'
      )
      .eq('destinataire_id', user.id)
      .eq('cheque_encaisse', false)
      .in('type_message', [...CHEQUE_MESSAGE_TYPES])
      .gt('cheque_montant', 0)
      .order('created_at', { ascending: true });

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!cheques || cheques.length === 0) {
      return NextResponse.json({ error: 'Aucun cheque a encaisser' }, { status: 400 });
    }

    let comptePerso = await getComptePersonnelCanonique(admin, user.id);
    if (!comptePerso) comptePerso = await ensureComptePersonnel(admin, user.id);
    if (!comptePerso) {
      return NextResponse.json({ error: 'Compte Felitz personnel introuvable' }, { status: 404 });
    }

    const erreurs: string[] = [];
    let totalNet = 0;
    let nbOk = 0;
    const parCompte = new Map<string, { nb: number; total: number }>();

    for (const ch of cheques) {
      const row = ch as FelitzChequeMessage;
      const r = await encaisserChequeMessage(admin, user.id, row);
      if (!r.ok) {
        erreurs.push(`${row.cheque_numero_vol || row.id.slice(0, 8)} : ${r.error}`);
        continue;
      }
      nbOk++;
      totalNet += r.montantNet;
      const cid = row.cheque_destinataire_compte_id || comptePerso.id;
      const cur = parCompte.get(cid) || { nb: 0, total: 0 };
      cur.nb += 1;
      cur.total += r.montantNet;
      parCompte.set(cid, cur);
    }

    const uniqueCompteIds = Array.from(parCompte.keys());
    const compteLabels: Record<string, string> = {};
    if (uniqueCompteIds.length > 0) {
      const { data: comptes } = await admin
        .from('felitz_comptes')
        .select('id, type, compagnie_id')
        .in('id', uniqueCompteIds);
      if (comptes) {
        const compagnieIds = comptes.filter((c) => c.compagnie_id).map((c) => c.compagnie_id!);
        const compagnieNoms: Record<string, string> = {};
        if (compagnieIds.length > 0) {
          const { data: comps } = await admin.from('compagnies').select('id, nom').in('id', compagnieIds);
          if (comps) comps.forEach((c) => { compagnieNoms[c.id] = c.nom; });
        }
        for (const c of comptes) {
          compteLabels[c.id] =
            c.type === 'entreprise' && c.compagnie_id
              ? compagnieNoms[c.compagnie_id] || 'Compte entreprise'
              : 'Compte personnel';
        }
      }
    }

    const recap = uniqueCompteIds.map((compteId) => {
      const g = parCompte.get(compteId)!;
      return { label: compteLabels[compteId] || 'Compte', nb: g.nb, total: g.total };
    });

    return NextResponse.json({
      ok: true,
      nb_cheques: nbOk,
      total: totalNet,
      par_compte: recap,
      erreurs_partielles: erreurs.length > 0 ? erreurs : undefined,
    });
  } catch (e) {
    console.error('encaisser-tout:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
