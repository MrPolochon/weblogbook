import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { COUT_AFFRETER_TECHNICIENS } from '@/lib/compagnie-utils';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, statut, usure_percent, aeroport_actuel')
      .eq('id', id)
      .single();
    if (!avion) return NextResponse.json({ error: 'Avion introuvable.' }, { status: 404 });

    if (avion.statut !== 'bloque' && avion.usure_percent !== 0) {
      return NextResponse.json({ error: 'L\'avion n\'est pas bloqué à 0% d\'usure.' }, { status: 400 });
    }

    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id')
      .eq('id', avion.compagnie_id)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    
    if (compagnie?.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut affréter des techniciens.' }, { status: 403 });
    }

    // Vérifier le solde
    const { data: compte } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', avion.compagnie_id)
      .eq('type', 'entreprise')
      .single();
    
    if (!compte) {
      return NextResponse.json({ error: 'Compte entreprise introuvable.' }, { status: 500 });
    }
    if (compte.solde < COUT_AFFRETER_TECHNICIENS) {
      return NextResponse.json({ 
        error: `Solde insuffisant. Coût : ${COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$.` 
      }, { status: 400 });
    }

    // Débiter le compte
    const nouveauSolde = compte.solde - COUT_AFFRETER_TECHNICIENS;
    const { error: debitErr } = await admin
      .from('felitz_comptes')
      .update({ solde: nouveauSolde })
      .eq('id', compte.id);
    
    if (debitErr) {
      return NextResponse.json({ error: 'Erreur lors du débit.' }, { status: 500 });
    }

    // Créer une transaction
    await admin.from('felitz_transactions').insert({
      compte_id: compte.id,
      type: 'debit',
      montant: COUT_AFFRETER_TECHNICIENS,
      libelle: `Affrètement techniciens pour ${avion.aeroport_actuel}`,
    });

    // Réparer l'avion (remettre à 100% et débloquer)
    const { error: avionErr } = await admin
      .from('compagnie_avions')
      .update({
        usure_percent: 100,
        statut: 'ground',
      })
      .eq('id', id);

    if (avionErr) {
      // Rollback : rembourser
      await admin.from('felitz_comptes').update({ solde: compte.solde }).eq('id', compte.id);
      return NextResponse.json({ error: 'Erreur lors de la réparation.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cout: COUT_AFFRETER_TECHNICIENS });
  } catch (e) {
    console.error('POST compagnies/avions/affreter-techniciens:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
