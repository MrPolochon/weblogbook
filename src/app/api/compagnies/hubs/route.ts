import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { calculerPrixHub } from '@/lib/compagnie-utils';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const compagnie_id = searchParams.get('compagnie_id');
    const all = searchParams.get('all');

    const supabase = await createClient();

    // Mode "all" : retourner tous les hubs avec le nom de la compagnie (pour la carte marketplace)
    if (all === '1') {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('compagnie_hubs')
        .select('id, aeroport_code, est_hub_principal, compagnie_id, compagnies!compagnie_hubs_compagnie_id_fkey(nom)')
        .order('aeroport_code')
        .order('est_hub_principal', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    }

    // Mode classique : hubs d'une compagnie spécifique
    if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

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

/**
 * DELETE — Supprimer un hub
 * Body: { compagnie_id, hub_id }
 * Règles :
 *  - Seul le PDG ou un admin peut supprimer
 *  - Impossible de supprimer le DERNIER hub (il doit toujours y en avoir au moins un)
 *  - Si le hub supprimé est le principal → auto-assignation d'un autre hub aléatoirement
 *  - Si des avions de la compagnie sont en maintenance sur ce hub → taxe aéroportuaire par avion
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compagnie_id, hub_id } = body;

    if (!compagnie_id || !hub_id) {
      return NextResponse.json({ error: 'compagnie_id et hub_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier PDG ou admin
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

    // Récupérer le hub à supprimer
    const { data: hub } = await admin
      .from('compagnie_hubs')
      .select('id, aeroport_code, est_hub_principal')
      .eq('id', hub_id)
      .eq('compagnie_id', compagnie_id)
      .single();

    if (!hub) return NextResponse.json({ error: 'Hub introuvable' }, { status: 404 });

    // Récupérer tous les autres hubs de la compagnie
    const { data: autresHubs } = await admin
      .from('compagnie_hubs')
      .select('id, aeroport_code')
      .eq('compagnie_id', compagnie_id)
      .neq('id', hub_id);

    // Impossible de supprimer le dernier hub
    if (!autresHubs || autresHubs.length === 0) {
      return NextResponse.json({
        error: 'Impossible de supprimer votre dernier hub. Vous devez avoir au moins un hub.'
      }, { status: 400 });
    }

    // Vérifier les avions en maintenance sur ce hub → appliquer les taxes
    let taxesPayees = 0;
    const { data: avionsEnMaintenance } = await admin
      .from('compagnie_avions')
      .select('id, immatriculation')
      .eq('compagnie_id', compagnie_id)
      .eq('aeroport_actuel', hub.aeroport_code)
      .eq('statut', 'maintenance');

    if (avionsEnMaintenance && avionsEnMaintenance.length > 0) {
      // Récupérer le taux de taxe de l'aéroport
      const { data: taxesData } = await admin.from('taxes_aeroport')
        .select('taxe_pourcent')
        .eq('code_oaci', hub.aeroport_code)
        .single();
      
      const TAXE_PAR_AVION = 25000; // Taxe fixe par avion en maintenance lors du retrait d'un hub
      const tauxMultiplicateur = taxesData?.taxe_pourcent ? (taxesData.taxe_pourcent / 2) : 1;
      const taxeParAvion = Math.round(TAXE_PAR_AVION * tauxMultiplicateur);
      const totalTaxes = taxeParAvion * avionsEnMaintenance.length;

      // Débiter la compagnie
      const { data: compte } = await admin
        .from('felitz_comptes')
        .select('id, solde')
        .eq('compagnie_id', compagnie_id)
        .eq('type', 'entreprise')
        .single();

      if (compte) {
        const nouveauSolde = compte.solde - totalTaxes;
        await admin.from('felitz_comptes')
          .update({ solde: nouveauSolde })
          .eq('id', compte.id);

        await admin.from('felitz_transactions').insert({
          compte_id: compte.id,
          type: 'debit',
          montant: totalTaxes,
          libelle: `Taxes aéroportuaires retrait hub ${hub.aeroport_code} (${avionsEnMaintenance.length} avion(s) en maintenance)`,
        });

        taxesPayees = totalTaxes;
      }
    }

    // Si c'était le hub principal → auto-assignation d'un autre hub aléatoirement
    let nouveauPrincipal: string | null = null;
    if (hub.est_hub_principal && autresHubs.length > 0) {
      const hubAleatoire = autresHubs[Math.floor(Math.random() * autresHubs.length)];
      await admin
        .from('compagnie_hubs')
        .update({ est_hub_principal: true })
        .eq('id', hubAleatoire.id);
      nouveauPrincipal = hubAleatoire.aeroport_code;
    }

    // Supprimer le hub
    const { error } = await admin
      .from('compagnie_hubs')
      .delete()
      .eq('id', hub_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      taxes_payees: taxesPayees,
      avions_en_maintenance: avionsEnMaintenance?.length || 0,
      nouveau_principal: nouveauPrincipal,
    });
  } catch (e) {
    console.error('DELETE compagnies/hubs:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * PATCH — Modifier le hub principal
 * Body: { compagnie_id, hub_id }
 * Le hub désigné devient le hub principal, l'ancien perd son statut.
 * Cooldown : 1 changement par semaine maximum.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { compagnie_id, hub_id } = body;

    if (!compagnie_id || !hub_id) {
      return NextResponse.json({ error: 'compagnie_id et hub_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Vérifier PDG ou admin
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id, dernier_changement_principal_at')
      .eq('id', compagnie_id)
      .single();

    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    if (compagnie.pdg_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Seul le PDG peut gérer les hubs' }, { status: 403 });
    }

    // Cooldown : 1 changement par semaine (sauf admin)
    if (!isAdmin && compagnie.dernier_changement_principal_at) {
      const dernierChangement = new Date(compagnie.dernier_changement_principal_at);
      const maintenant = new Date();
      const uneSemaine = 7 * 24 * 60 * 60 * 1000;
      const tempsEcoule = maintenant.getTime() - dernierChangement.getTime();

      if (tempsEcoule < uneSemaine) {
        const joursRestants = Math.ceil((uneSemaine - tempsEcoule) / (24 * 60 * 60 * 1000));
        return NextResponse.json({
          error: `Vous ne pouvez changer de hub principal qu'une fois par semaine. Réessayez dans ${joursRestants} jour(s).`
        }, { status: 400 });
      }
    }

    // Vérifier que le hub cible existe et appartient à la compagnie
    const { data: hub } = await admin
      .from('compagnie_hubs')
      .select('id, est_hub_principal')
      .eq('id', hub_id)
      .eq('compagnie_id', compagnie_id)
      .single();

    if (!hub) return NextResponse.json({ error: 'Hub introuvable' }, { status: 404 });
    if (hub.est_hub_principal) {
      return NextResponse.json({ error: 'Ce hub est déjà le hub principal.' }, { status: 400 });
    }

    // Retirer le statut principal de l'ancien hub
    await admin
      .from('compagnie_hubs')
      .update({ est_hub_principal: false })
      .eq('compagnie_id', compagnie_id)
      .eq('est_hub_principal', true);

    // Définir le nouveau hub principal
    const { error } = await admin
      .from('compagnie_hubs')
      .update({ est_hub_principal: true })
      .eq('id', hub_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Enregistrer la date du changement (cooldown)
    await admin
      .from('compagnies')
      .update({ dernier_changement_principal_at: new Date().toISOString() })
      .eq('id', compagnie_id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PATCH compagnies/hubs:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
