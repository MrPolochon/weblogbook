import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { solde, montant_ajout, montant_retrait } = body;

    const admin = createAdminClient();
    const { data: compte } = await admin.from('felitz_comptes').select('solde').eq('id', params.id).single();
    if (!compte) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });

    let nouveauSolde = Number(compte.solde);
    let typeTransaction = '';
    let montantTransaction = 0;

    if (solde !== undefined) {
      nouveauSolde = Number(solde);
      typeTransaction = nouveauSolde > Number(compte.solde) ? 'admin_ajout' : 'admin_retrait';
      montantTransaction = Math.abs(nouveauSolde - Number(compte.solde));
    } else if (montant_ajout !== undefined) {
      nouveauSolde = Number(compte.solde) + Number(montant_ajout);
      typeTransaction = 'admin_ajout';
      montantTransaction = Number(montant_ajout);
    } else if (montant_retrait !== undefined) {
      nouveauSolde = Number(compte.solde) - Number(montant_retrait);
      if (nouveauSolde < 0) return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
      typeTransaction = 'admin_retrait';
      montantTransaction = Number(montant_retrait);
    } else {
      return NextResponse.json({ error: 'Aucune modification spécifiée' }, { status: 400 });
    }

    const { error: errUpdate } = await admin.from('felitz_comptes').update({ solde: nouveauSolde }).eq('id', params.id);
    if (errUpdate) return NextResponse.json({ error: errUpdate.message }, { status: 400 });

    if (montantTransaction > 0) {
      // Créer une transaction pour le compte modifié
      // Note: L'argent provient du compte système (solde infini), donc on ne le débite pas
      await admin.from('felitz_transactions').insert({
        compte_id: params.id,
        type: typeTransaction,
        montant: typeTransaction === 'admin_ajout' ? montantTransaction : -montantTransaction,
        titre: typeTransaction === 'admin_ajout' ? 'Ajout administrateur' : 'Retrait administrateur',
        libelle: `Opération administrative - ${typeTransaction === 'admin_ajout' ? 'Ajout' : 'Retrait'} de ${montantTransaction.toFixed(2)} €`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Felitz comptes PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
