import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { FRACTION_REPARATION_HUB } from '@/lib/compagnie-utils';
import { isCoPdg } from '@/lib/co-pdg-utils';

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
      .select('id, compagnie_id, aeroport_actuel, statut, usure_percent, type_avion_id')
      .eq('id', id)
      .single();
    if (!avion) return NextResponse.json({ error: 'Avion introuvable.' }, { status: 404 });

    const { data: typeAvion } = await admin
      .from('types_avion')
      .select('prix')
      .eq('id', avion.type_avion_id)
      .single();
    const prixAvion = typeAvion?.prix || 0;
    const cout = Math.round(prixAvion * FRACTION_REPARATION_HUB);

    const nowIso = new Date().toISOString();
    const { data: locationActive } = await admin
      .from('compagnie_locations')
      .select('id, loueur_compagnie_id, locataire_compagnie_id, start_at, end_at, statut')
      .eq('avion_id', id)
      .eq('statut', 'active')
      .lte('start_at', nowIso)
      .gte('end_at', nowIso)
      .maybeSingle();

    const compagnieCibleId = locationActive?.locataire_compagnie_id || avion.compagnie_id;
    const { data: compagnie } = await admin
      .from('compagnies')
      .select('id, pdg_id')
      .eq('id', compagnieCibleId)
      .single();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    
    const isLeader =
      compagnie?.pdg_id === user.id ||
      (await isCoPdg(user.id, compagnieCibleId, admin));
    if (!isLeader && profile?.role !== 'admin') {
      if (locationActive) {
        return NextResponse.json({ error: 'Avion en location : le PDG locataire gère la maintenance.' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Seul le PDG peut réparer les avions.' }, { status: 403 });
    }

    // Vérifier que l'avion est à un hub (propre ou alliance si partage activé)
    const { data: hub } = await admin
      .from('compagnie_hubs')
      .select('id')
      .eq('compagnie_id', compagnieCibleId)
      .eq('aeroport_code', avion.aeroport_actuel)
      .maybeSingle();
    
    if (!hub) {
      let hubAlliance = false;
      const { data: compAllianceData } = await admin.from('compagnies')
        .select('alliance_id').eq('id', compagnieCibleId).single();

      if (compAllianceData?.alliance_id) {
        const { data: allianceParams } = await admin.from('alliance_parametres')
          .select('partage_hubs_actif')
          .eq('alliance_id', compAllianceData.alliance_id).single();

        if (allianceParams?.partage_hubs_actif) {
          const { data: allianceMembres } = await admin.from('alliance_membres')
            .select('compagnie_id')
            .eq('alliance_id', compAllianceData.alliance_id)
            .neq('compagnie_id', compagnieCibleId);

          if (allianceMembres && allianceMembres.length > 0) {
            const memberIds = allianceMembres.map(m => m.compagnie_id);
            const { data: hubMembre } = await admin.from('compagnie_hubs')
              .select('id')
              .in('compagnie_id', memberIds)
              .eq('aeroport_code', avion.aeroport_actuel)
              .limit(1)
              .maybeSingle();
            if (hubMembre) hubAlliance = true;
          }
        }
      }

      if (!hubAlliance) {
        return NextResponse.json({ error: 'L\'avion doit être à un hub pour être réparé.' }, { status: 400 });
      }
    }

    if (avion.statut === 'in_flight') {
      return NextResponse.json({ error: 'Impossible de réparer un avion en vol.' }, { status: 400 });
    }
    if (avion.usure_percent >= 100) {
      return NextResponse.json({ error: 'L\'avion est déjà à 100% de santé.' }, { status: 400 });
    }

    // Débiter le compte de la compagnie
    if (cout > 0) {
      const { data: compte } = await admin
        .from('felitz_comptes')
        .select('id, solde, vban')
        .eq('compagnie_id', compagnieCibleId)
        .eq('type', 'entreprise')
        .single();
      if (!compte) return NextResponse.json({ error: 'Compte Felitz de la compagnie introuvable.' }, { status: 400 });
      if (compte.solde < cout) {
        return NextResponse.json({ error: `Fonds insuffisants. Coût : ${cout.toLocaleString('fr-FR')} F$, solde : ${compte.solde.toLocaleString('fr-FR')} F$.` }, { status: 400 });
      }

      const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
        p_compte_id: compte.id,
        p_montant: cout,
      });
      if (!debitOk) {
        return NextResponse.json({ error: 'Échec du débit (fonds insuffisants ou erreur).' }, { status: 400 });
      }

      await admin.from('felitz_transactions').insert({
        compte_id: compte.id,
        type: 'debit',
        montant: cout,
        libelle: `Réparation au hub — ${avion.aeroport_actuel}`,
        reference: `repair-hub-${id}`,
      });
    }

    // Réparer : remettre à 100% et débloquer si nécessaire
    const { error } = await admin
      .from('compagnie_avions')
      .update({
        usure_percent: 100,
        statut: avion.statut === 'maintenance' || avion.statut === 'bloque' ? 'ground' : avion.statut,
      })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, cout });
  } catch (e) {
    console.error('POST compagnies/avions/reparer:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
