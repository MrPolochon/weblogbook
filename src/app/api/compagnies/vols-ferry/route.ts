import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { COUT_VOL_FERRY } from '@/lib/compagnie-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const compagnie_id = searchParams.get('compagnie_id');
    if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('vols_ferry')
      .select(`
        *,
        avion:compagnie_avions(id, immatriculation, nom_bapteme),
        pilote:profiles(id, identifiant)
      `)
      .eq('compagnie_id', compagnie_id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('GET compagnies/vols-ferry:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compagnie_id, avion_id, aeroport_arrivee } = body;
    const aa = String(aeroport_arrivee || '').trim().toUpperCase();

    if (!compagnie_id || !avion_id || !aa) {
      return NextResponse.json({ error: 'compagnie_id, avion_id et aeroport_arrivee requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier que l'utilisateur est PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id')
      .eq('id', compagnie_id)
      .single();
    
    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (compagnie.pdg_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul le PDG peut créer des vols ferry' }, { status: 403 });
    }

    // Vérifier que l'arrivée est un hub
    const { data: hub } = await admin
      .from('compagnie_hubs')
      .select('id')
      .eq('compagnie_id', compagnie_id)
      .eq('aeroport_code', aa)
      .maybeSingle();
    
    if (!hub) {
      return NextResponse.json({ error: 'L\'aéroport d\'arrivée doit être un hub de la compagnie.' }, { status: 400 });
    }

    // Vérifier l'avion
    const { data: avion } = await admin
      .from('compagnie_avions')
      .select('id, compagnie_id, aeroport_actuel, statut, usure_percent')
      .eq('id', avion_id)
      .single();
    
    if (!avion || avion.compagnie_id !== compagnie_id) {
      return NextResponse.json({ error: 'Avion invalide.' }, { status: 400 });
    }
    if (avion.statut === 'in_flight') {
      return NextResponse.json({ error: 'L\'avion est déjà en vol.' }, { status: 400 });
    }
    if (avion.aeroport_actuel === aa) {
      return NextResponse.json({ error: 'L\'avion est déjà à cet aéroport.' }, { status: 400 });
    }

    // Si l'avion est bloqué à 0%, il doit être débloqué pour un vol ferry
    const debloquePourFerry = avion.statut === 'bloque' && avion.usure_percent === 0;
    if (avion.statut === 'bloque' && !debloquePourFerry) {
      return NextResponse.json({ error: 'L\'avion est bloqué. Débloquez-le d\'abord ou affrétez des techniciens.' }, { status: 400 });
    }

    // Vérifier le solde
    const { data: compte } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('compagnie_id', compagnie_id)
      .eq('type', 'entreprise')
      .single();
    
    if (!compte) {
      return NextResponse.json({ error: 'Compte entreprise introuvable.' }, { status: 500 });
    }
    if (compte.solde < COUT_VOL_FERRY) {
      return NextResponse.json({ 
        error: `Solde insuffisant. Coût du vol ferry : ${COUT_VOL_FERRY.toLocaleString('fr-FR')} F$.` 
      }, { status: 400 });
    }

    // Créer le vol ferry
    const { data: vol, error } = await admin
      .from('vols_ferry')
      .insert({
        compagnie_id,
        avion_id,
        aeroport_depart: avion.aeroport_actuel,
        aeroport_arrivee: aa,
        pilote_id: user.id,
        statut: 'planned',
        cout_ferry: COUT_VOL_FERRY,
        debloque_pour_ferry: debloquePourFerry,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Débiter le compte
    const nouveauSolde = compte.solde - COUT_VOL_FERRY;
    const { error: debitErr } = await admin
      .from('felitz_comptes')
      .update({ solde: nouveauSolde })
      .eq('id', compte.id);
    
    if (debitErr) {
      await admin.from('vols_ferry').delete().eq('id', vol.id);
      return NextResponse.json({ error: 'Erreur lors du débit.' }, { status: 500 });
    }

    // Créer une transaction
    await admin.from('felitz_transactions').insert({
      compte_id: compte.id,
      type: 'debit',
      montant: COUT_VOL_FERRY,
      libelle: `Vol ferry ${avion.aeroport_actuel} → ${aa}`,
    });

    // Mettre l'avion en vol
    await admin.from('compagnie_avions').update({ statut: 'in_flight' }).eq('id', avion_id);

    return NextResponse.json({ ok: true, id: vol.id, cout: COUT_VOL_FERRY });
  } catch (e) {
    console.error('POST compagnies/vols-ferry:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
