import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DELAI_DECOUVERT_JOURS, PRIX_VENTE_HUB_FORCE, STATUTS_AVION_COMPAGNIE_AU_SOL } from '@/lib/compagnie-utils';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace('Bearer ', '');
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date();
    const logs: string[] = [];

    // The database collects cumulative daily amounts and final balances atomically.
    const { data: collections, error: collectionError } = await admin.rpc('collect_due_company_loans');
    if (collectionError || !collections) {
      console.error('Loan collection unavailable:', collectionError);
      return NextResponse.json({ error: 'Prélèvements bancaires indisponibles.' }, { status: 503 });
    }
    for (const result of collections.results ?? []) logs.push(JSON.stringify(result));
    if (Number(collections.failures) > 0) {
      return NextResponse.json({ error: 'Certains prélèvements ont échoué et seront réessayés.', logs }, { status: 503 });
    }

    // ================================================================
    // ETAPE 2 : Compagnies en decouvert > 7 jours — vente forcee
    // ================================================================
    const depasseDate = new Date(now.getTime() - DELAI_DECOUVERT_JOURS * 86_400_000).toISOString();

    const { data: pretsDecouvert } = await admin
      .from('prets_bancaires')
      .select('id, compagnie_id, demandeur_id, decouvert_depuis')
      .eq('statut', 'rembourse')
      .not('decouvert_depuis', 'is', null)
      .lt('decouvert_depuis', depasseDate);

    const compagniesTraitees = new Set<string>();

    for (const pret of pretsDecouvert ?? []) {
      if (compagniesTraitees.has(pret.compagnie_id)) continue;
      compagniesTraitees.add(pret.compagnie_id);

      const { data: compte } = await admin.from('felitz_comptes')
        .select('id, solde')
        .eq('compagnie_id', pret.compagnie_id)
        .eq('type', 'entreprise')
        .single();

      if (!compte || compte.solde >= 0) {
        await admin.from('prets_bancaires')
          .update({ decouvert_depuis: null })
          .eq('compagnie_id', pret.compagnie_id)
          .not('decouvert_depuis', 'is', null);
        logs.push(`Compagnie ${pret.compagnie_id}: solde positif, decouvert nettoye`);
        continue;
      }

      let soldeActuel = compte.solde;

      // VENDRE LES AVIONS (50% du prix catalogue)
      const { data: avions } = await admin.from('compagnie_avions')
        .select('id, type_avion_id, types_avion:type_avion_id(prix)')
        .eq('compagnie_id', pret.compagnie_id)
        .in('statut', [...STATUTS_AVION_COMPAGNIE_AU_SOL])
        .or('detruit.is.null,detruit.eq.false');

      for (const avion of avions ?? []) {
        if (soldeActuel >= 0) break;
        const rawType = avion.types_avion as unknown;
        const typeAvion = (Array.isArray(rawType) ? rawType[0] : rawType) as { prix?: number } | null;
        const prixVente = Math.round((typeAvion?.prix || 100_000) * 0.5);

        await admin.from('compagnie_avions').delete().eq('id', avion.id);
        soldeActuel += prixVente;

        await admin.from('felitz_comptes').update({ solde: soldeActuel }).eq('id', compte.id);
        await admin.from('felitz_transactions').insert({
          compte_id: compte.id,
          type: 'credit',
          montant: prixVente,
          libelle: `Vente forcee avion (decouvert) — ${prixVente.toLocaleString('fr-FR')} F$`,
        });

        logs.push(`Avion ${avion.id} vendu pour ${prixVente} F$`);
      }

      // VENDRE LES HUBS
      if (soldeActuel < 0) {
        const { data: hubs } = await admin.from('compagnie_hubs')
          .select('id, code_oaci, principal')
          .eq('compagnie_id', pret.compagnie_id)
          .order('principal', { ascending: true });

        for (const hub of hubs ?? []) {
          if (soldeActuel >= 0) break;
          await admin.from('compagnie_hubs').delete().eq('id', hub.id);
          soldeActuel += PRIX_VENTE_HUB_FORCE;

          await admin.from('felitz_comptes').update({ solde: soldeActuel }).eq('id', compte.id);
          await admin.from('felitz_transactions').insert({
            compte_id: compte.id,
            type: 'credit',
            montant: PRIX_VENTE_HUB_FORCE,
            libelle: `Vente forcee hub ${hub.code_oaci} (decouvert) — ${PRIX_VENTE_HUB_FORCE.toLocaleString('fr-FR')} F$`,
          });

          logs.push(`Hub ${hub.code_oaci} vendu pour ${PRIX_VENTE_HUB_FORCE} F$`);
        }
      }

      // AVIS DE FERMETURE si toujours en decouvert
      if (soldeActuel < 0 && pret.demandeur_id) {
        const { data: comp } = await admin.from('compagnies').select('nom').eq('id', pret.compagnie_id).single();
        await admin.from('messages').insert({
          destinataire_id: pret.demandeur_id,
          titre: `AVIS D'OBLIGATION DE FERMETURE — ${comp?.nom || 'Votre compagnie'}`,
          contenu: `Malgre la vente de tous vos actifs, le compte de ${comp?.nom || 'votre compagnie'} reste en decouvert (${soldeActuel.toLocaleString('fr-FR')} F$).\n\nVous etes dans l'obligation de fermer votre compagnie ou de la renflouer immediatement.\n\nContactez un administrateur pour regulariser votre situation.`,
          type_message: 'systeme',
        });
        logs.push(`Compagnie ${pret.compagnie_id}: avis fermeture envoye (solde=${soldeActuel})`);
      }

      // Nettoyer le flag decouvert si solde >= 0
      if (soldeActuel >= 0) {
        await admin.from('prets_bancaires')
          .update({ decouvert_depuis: null })
          .eq('compagnie_id', pret.compagnie_id)
          .not('decouvert_depuis', 'is', null);

        if (pret.demandeur_id) {
          await admin.from('messages').insert({
            destinataire_id: pret.demandeur_id,
            titre: `Decouvert resorbe — Ventes automatiques effectuees`,
            contenu: `Des actifs de votre compagnie ont ete vendus automatiquement pour couvrir le decouvert.\n\nNouveau solde : ${soldeActuel.toLocaleString('fr-FR')} F$.`,
            type_message: 'systeme',
          });
        }
      }
    }

    return NextResponse.json({ ok: true, logs, pretsTraites: Number(collections.processed), compagniesTraitees: compagniesTraitees.size });
  } catch (err) {
    console.error('CRON prets error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
