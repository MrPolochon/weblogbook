import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const admin = createAdminClient();
    
    // Vérifier s'il y a des dépendances avant de supprimer
    const { count: employes } = await admin
      .from('compagnie_employes')
      .select('*', { count: 'exact', head: true })
      .eq('compagnie_id', id);
    
    if (employes && employes > 0) {
      // Supprimer d'abord les employés
      await admin.from('compagnie_employes').delete().eq('compagnie_id', id);
    }

    // Supprimer les hubs
    await admin.from('compagnie_hubs').delete().eq('compagnie_id', id);
    
    // Supprimer les tarifs de liaisons
    await admin.from('tarifs_liaisons').delete().eq('compagnie_id', id);
    
    // Supprimer les avions de la compagnie (ils retournent à l'inventaire ou sont supprimés)
    await admin.from('compagnie_avions').delete().eq('compagnie_id', id);
    
    // Supprimer les vols ferry
    await admin.from('vols_ferry').delete().eq('compagnie_id', id);
    
    // Supprimer les invitations de recrutement
    await admin.from('compagnie_invitations').delete().eq('compagnie_id', id);
    
    // Supprimer les annonces du marché (hangar_market)
    await admin.from('hangar_market').delete().eq('compagnie_vendeur_id', id);
    await admin.from('hangar_market').update({ compagnie_acheteur_id: null }).eq('compagnie_acheteur_id', id);
    
    // Supprimer les prêts bancaires
    await admin.from('prets_bancaires').delete().eq('compagnie_id', id);
    
    // Supprimer les plans de vol de la compagnie
    await admin.from('plans_vol').delete().eq('compagnie_id', id);
    
    // Récupérer le compte Felitz de l'entreprise pour nettoyer les références
    const { data: compteEntreprise } = await admin
      .from('felitz_comptes')
      .select('id')
      .eq('compagnie_id', id)
      .eq('type', 'entreprise')
      .single();
    
    if (compteEntreprise) {
      // Supprimer/Mettre à null les sanctions IFSA qui référencent ce compte
      await admin
        .from('ifsa_sanctions')
        .update({ compte_destination_id: null })
        .eq('compte_destination_id', compteEntreprise.id);
      
      // Supprimer les transactions Felitz liées à ce compte
      await admin.from('felitz_transactions').delete().eq('compte_id', compteEntreprise.id);
      
      // Supprimer les messages/chèques destinés à ce compte
      await admin
        .from('messages')
        .update({ cheque_destinataire_compte_id: null })
        .eq('cheque_destinataire_compte_id', compteEntreprise.id);
    }
    
    // Supprimer le compte Felitz de l'entreprise
    await admin.from('felitz_comptes').delete().eq('compagnie_id', id).eq('type', 'entreprise');
    
    // Enfin, supprimer la compagnie
    const { error } = await admin.from('compagnies').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnie delete error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    
    // Vérifier si l'utilisateur est PDG de cette compagnie
    const admin = createAdminClient();
    const { data: compagnie } = await admin.from('compagnies').select('pdg_id').eq('id', id).single();
    const isPdg = compagnie?.pdg_id === user.id;
    
    if (!isAdmin && !isPdg) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const { pdg_id, prix_billet_pax, prix_kg_cargo, pourcentage_salaire } = body;

    const updates: Record<string, unknown> = {};
    
    // Seuls les admins peuvent changer le PDG
    if (pdg_id !== undefined && isAdmin) updates.pdg_id = pdg_id;
    
    // Le PDG et les admins peuvent modifier ces paramètres
    if (prix_billet_pax !== undefined) updates.prix_billet_pax = prix_billet_pax;
    if (prix_kg_cargo !== undefined) updates.prix_kg_cargo = prix_kg_cargo;
    if (pourcentage_salaire !== undefined) updates.pourcentage_salaire = pourcentage_salaire;

    const { data, error } = await admin.from('compagnies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnie update error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data, error } = await supabase.from('compagnies')
      .select('*, profiles!compagnies_pdg_id_fkey(identifiant)')
      .eq('id', id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Compagnie GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
