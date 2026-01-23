import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const compteId = searchParams.get('compte_id');

    if (!compteId) {
      const { data: comptes } = await supabase.from('felitz_comptes').select('id').or(`user_id.eq.${user.id},compagnie_id.in.(SELECT id FROM compagnies WHERE pdg_id.eq.${user.id})`);
      const compteIds = (comptes || []).map((c) => c.id);
      if (compteIds.length === 0) return NextResponse.json({ data: [] });

      const { data, error } = await supabase
        .from('felitz_virements')
        .select('id, compte_emetteur_id, compte_destinataire_id, montant, libelle, statut, created_at, felitz_comptes!felitz_virements_compte_emetteur_id_fkey(vban), felitz_comptes!felitz_virements_compte_destinataire_id_fkey(vban)')
        .or(`compte_emetteur_id.in.(${compteIds.join(',')}),compte_destinataire_id.in.(${compteIds.join(',')})`)
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ data: data || [] });
    }

    const { data: compte } = await supabase.from('felitz_comptes').select('user_id, compagnie_id, compagnies(pdg_id)').eq('id', compteId).single();
    if (!compte) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });

    const canAccess = compte.user_id === user.id || (compte.compagnie_id && (compte as any).compagnies?.pdg_id === user.id);
    if (!canAccess) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('felitz_virements')
      .select('id, compte_emetteur_id, compte_destinataire_id, montant, libelle, statut, created_at, felitz_comptes!felitz_virements_compte_emetteur_id_fkey(vban), felitz_comptes!felitz_virements_compte_destinataire_id_fkey(vban)')
      .or(`compte_emetteur_id.eq.${compteId},compte_destinataire_id.eq.${compteId}`)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Felitz virements GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compte_emetteur_id, vban_destinataire, montant, libelle } = body;

    if (!compte_emetteur_id || !vban_destinataire || !montant || montant <= 0) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
    }

    const { data: compteEmetteur } = await supabase.from('felitz_comptes').select('user_id, compagnie_id, solde, compagnies(pdg_id)').eq('id', compte_emetteur_id).single();
    if (!compteEmetteur) return NextResponse.json({ error: 'Compte émetteur introuvable' }, { status: 404 });

    const canAccess = compteEmetteur.user_id === user.id || (compteEmetteur.compagnie_id && (compteEmetteur as any).compagnies?.pdg_id === user.id);
    if (!canAccess) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    if (Number(compteEmetteur.solde) < montant) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }

    const { data: compteDest } = await supabase.from('felitz_comptes').select('id').eq('vban', vban_destinataire).single();
    if (!compteDest) return NextResponse.json({ error: 'VBAN destinataire introuvable' }, { status: 400 });

    if (compteDest.id === compte_emetteur_id) {
      return NextResponse.json({ error: 'Impossible de virer vers le même compte' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: virement, error: errVirement } = await admin.from('felitz_virements').insert({
      compte_emetteur_id,
      compte_destinataire_id: compteDest.id,
      montant,
      libelle: libelle || null,
      statut: 'effectue',
    }).select('id').single();

    if (errVirement) return NextResponse.json({ error: errVirement.message }, { status: 400 });

    await admin.from('felitz_comptes').update({ solde: Number(compteEmetteur.solde) - montant }).eq('id', compte_emetteur_id);
    const { data: dest } = await admin.from('felitz_comptes').select('solde').eq('id', compteDest.id).single();
    await admin.from('felitz_comptes').update({ solde: Number(dest?.solde || 0) + montant }).eq('id', compteDest.id);

    await admin.from('felitz_transactions').insert([
      { compte_id: compte_emetteur_id, type: 'virement', montant: -montant, titre: 'Virement sortant', libelle, compte_destinataire_id: compteDest.id },
      { compte_id: compteDest.id, type: 'virement', montant, titre: 'Virement entrant', libelle, compte_destinataire_id: compteDest.id },
    ]);

    return NextResponse.json({ ok: true, id: virement.id });
  } catch (e) {
    console.error('Felitz virements POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
