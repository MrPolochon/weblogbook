import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { calculerPrixHub } from '@/lib/compagnie-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const compagnie_id = searchParams.get('compagnie_id');
    if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('compagnie_hubs')
      .select('*')
      .eq('compagnie_id', compagnie_id)
      .order('est_hub_principal', { ascending: false })
      .order('created_at');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('GET compagnies/hubs:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compagnie_id, aeroport_code } = body;
    const ac = String(aeroport_code || '').trim().toUpperCase();

    if (!compagnie_id || !ac) {
      return NextResponse.json({ error: 'compagnie_id et aeroport_code requis' }, { status: 400 });
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
      return NextResponse.json({ error: 'Seul le PDG peut gérer les hubs' }, { status: 403 });
    }

    // Vérifier si ce hub existe déjà
    const { data: existingHub } = await admin
      .from('compagnie_hubs')
      .select('id')
      .eq('compagnie_id', compagnie_id)
      .eq('aeroport_code', ac)
      .maybeSingle();
    
    if (existingHub) {
      return NextResponse.json({ error: 'Ce hub existe déjà.' }, { status: 400 });
    }

    // Compter les hubs existants
    const { count } = await admin
      .from('compagnie_hubs')
      .select('*', { count: 'exact', head: true })
      .eq('compagnie_id', compagnie_id);
    
    const numHub = (count ?? 0) + 1;
    const prix = calculerPrixHub(numHub);
    const estPrincipal = numHub === 1;

    // Si le hub n'est pas gratuit, débiter le compte Felitz
    if (prix > 0) {
      const { data: compte } = await admin
        .from('felitz_comptes')
        .select('id, solde')
        .eq('compagnie_id', compagnie_id)
        .eq('type', 'entreprise')
        .single();
      
      if (!compte || compte.solde < prix) {
        return NextResponse.json({ 
          error: `Solde insuffisant. Prix : ${prix.toLocaleString('fr-FR')} F$.` 
        }, { status: 400 });
      }

      // Débiter
      const nouveauSolde = compte.solde - prix;
      const { error: debitErr } = await admin
        .from('felitz_comptes')
        .update({ solde: nouveauSolde })
        .eq('id', compte.id);
      
      if (debitErr) {
        return NextResponse.json({ error: 'Erreur lors du débit.' }, { status: 500 });
      }

      // Transaction
      await admin.from('felitz_transactions').insert({
        compte_id: compte.id,
        type: 'debit',
        montant: prix,
        libelle: `Achat hub ${ac}`,
      });
    }

    // Insérer le hub
    const { data: hub, error } = await admin
      .from('compagnie_hubs')
      .insert({
        compagnie_id,
        aeroport_code: ac,
        est_hub_principal: estPrincipal,
        prix_achat: prix,
        achat_le: prix > 0 ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: hub.id, prix });
  } catch (e) {
    console.error('POST compagnies/hubs:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
