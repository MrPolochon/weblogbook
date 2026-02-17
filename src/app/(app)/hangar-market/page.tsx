import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Store } from 'lucide-react';
import HangarMarketClient from './HangarMarketClient';

export default async function HangarMarketPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Profil et solde personnel
  const { data: profile } = await supabase.from('profiles').select('role, identifiant').eq('id', user.id).single();
  
  const { data: comptePerso } = await admin.from('felitz_comptes')
    .select('solde')
    .eq('proprietaire_id', user.id)
    .eq('type', 'personnel')
    .single();

  // Compagnies dont l'utilisateur est PDG
  const { data: compagniesPdg } = await admin.from('compagnies')
    .select('id, nom')
    .eq('pdg_id', user.id);

  // Soldes des compagnies
  let compagniesWithSolde: Array<{ id: string; nom: string; solde: number }> = [];
  if (compagniesPdg && compagniesPdg.length > 0) {
    compagniesWithSolde = await Promise.all(compagniesPdg.map(async (c) => {
      const { data: compte } = await admin.from('felitz_comptes')
        .select('solde')
        .eq('compagnie_id', c.id)
        .eq('type', 'entreprise')
        .single();
      return { ...c, solde: compte?.solde || 0 };
    }));
  }

  // Inventaire personnel (avions pouvant être vendus)
  const { data: inventaire } = await admin.from('inventaire_avions')
    .select('id, nom_personnalise, types_avion:type_avion_id(id, nom, code_oaci, prix)')
    .eq('proprietaire_id', user.id);

  // Vérifier quels avions sont en vol ou déjà en vente
  const inventaireDisponible = await Promise.all((inventaire || []).map(async (item) => {
    const { count: enVol } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('inventaire_avion_id', item.id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);

    const { data: enVente } = await admin.from('hangar_market')
      .select('id')
      .eq('inventaire_avion_id', item.id)
      .eq('statut', 'en_vente')
      .single();

    // Normaliser types_avion (peut être un tableau ou un objet)
    const typesAvionRaw = Array.isArray(item.types_avion) 
      ? item.types_avion[0] 
      : item.types_avion;
    
    const typesAvion = typesAvionRaw as { id: string; nom: string; code_oaci: string; prix?: number } | null;
    const prixAchat = typesAvion?.prix || 0;
    // Prix de revente suggéré = 50% du prix d'achat initial
    const prixRevente = Math.floor(prixAchat * 0.5);

    return {
      id: item.id,
      nom_personnalise: item.nom_personnalise,
      types_avion: typesAvion ? { id: typesAvion.id, nom: typesAvion.nom, code_oaci: typesAvion.code_oaci } : null,
      en_vol: (enVol || 0) > 0,
      en_vente: !!enVente,
      disponible: (enVol || 0) === 0 && !enVente,
      prixAchat,
      prixRevente
    };
  }));

  // Avions de flotte que les PDG peuvent mettre en vente (au sol, non loués, non détruits, pas déjà en vente)
  let flotteDisponible: Array<{
    id: string;
    immatriculation: string;
    nom_bapteme: string | null;
    usure_percent: number;
    aeroport_actuel: string;
    compagnie_id: string;
    compagnie_nom: string;
    type_avion: { id: string; nom: string; code_oaci: string | null };
  }> = [];
  if (compagniesPdg && compagniesPdg.length > 0) {
    const compagnieIds = compagniesPdg.map((c) => c.id);
    const { data: avionsFlotte } = await admin.from('compagnie_avions')
      .select(`
        id,
        immatriculation,
        nom_bapteme,
        usure_percent,
        aeroport_actuel,
        compagnie_id,
        compagnies(id, nom),
        types_avion:type_avion_id(id, nom, code_oaci)
      `)
      .in('compagnie_id', compagnieIds)
      .eq('statut', 'ground')
      .or('detruit.is.null,detruit.eq.false');

    const avionsAvecCompagnie = (avionsFlotte || []).filter((a) => a.compagnie_id);
    const idsAvions = avionsAvecCompagnie.map((a) => a.id);

    const { data: dejaEnVente } = await admin.from('hangar_market')
      .select('compagnie_avion_id')
      .in('compagnie_avion_id', idsAvions)
      .eq('statut', 'en_vente');
    const idsEnVente = new Set((dejaEnVente || []).map((r) => r.compagnie_avion_id).filter(Boolean));

    const { data: locationsActives } = await admin.from('compagnie_locations')
      .select('avion_id')
      .in('avion_id', idsAvions)
      .in('statut', ['active', 'en_attente']);
    const idsLoues = new Set((locationsActives || []).map((l) => l.avion_id));

    flotteDisponible = avionsAvecCompagnie
      .filter((a) => !idsEnVente.has(a.id) && !idsLoues.has(a.id))
      .map((a) => {
        const comp = Array.isArray(a.compagnies) ? a.compagnies[0] : a.compagnies;
        const type = Array.isArray(a.types_avion) ? a.types_avion[0] : a.types_avion;
        return {
          id: a.id,
          immatriculation: a.immatriculation,
          nom_bapteme: a.nom_bapteme,
          usure_percent: a.usure_percent ?? 100,
          aeroport_actuel: a.aeroport_actuel,
          compagnie_id: a.compagnie_id,
          compagnie_nom: (comp as { nom: string } | null)?.nom || '',
          type_avion: type ? { id: (type as { id: string }).id, nom: (type as { nom: string }).nom, code_oaci: (type as { code_oaci: string | null }).code_oaci } : { id: '', nom: '', code_oaci: null }
        };
      });
  }

  // Annonces en vente
  const { data: annoncesBrutes } = await admin.from('hangar_market')
    .select(`
      *,
      types_avion:type_avion_id(id, nom, code_oaci, constructeur, capacite_pax, capacite_cargo_kg),
      vendeur:vendeur_id(id, identifiant),
      compagnie_vendeur:compagnie_vendeur_id(id, nom)
    `)
    .eq('statut', 'en_vente')
    .order('created_at', { ascending: false });

  // Cacher les annonces "PDG uniquement" aux non-PDG
  const isPdg = (compagniesPdg?.length ?? 0) > 0;
  const annonces = (annoncesBrutes || []).filter(
    (a: { vente_pdg_seulement?: boolean }) => !a.vente_pdg_seulement || isPdg
  );

  // Config taxe
  const { data: config } = await admin.from('hangar_market_config')
    .select('taxe_vente_pourcent')
    .single();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Store className="h-8 w-8 text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Hangar Market</h1>
          <p className="text-sm text-slate-400">Achetez et vendez des avions d&apos;occasion</p>
        </div>
      </div>

      {/* Soldes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card bg-emerald-500/10 border-emerald-500/30">
          <p className="text-sm text-emerald-400">Mon solde personnel</p>
          <p className="text-2xl font-bold text-emerald-300">
            {(comptePerso?.solde || 0).toLocaleString('fr-FR')} F$
          </p>
        </div>
        {compagniesWithSolde.map((c) => (
          <div key={c.id} className="card bg-sky-500/10 border-sky-500/30">
            <p className="text-sm text-sky-400">{c.nom}</p>
            <p className="text-2xl font-bold text-sky-300">
              {c.solde.toLocaleString('fr-FR')} F$
            </p>
          </div>
        ))}
      </div>

      {/* Info taxe */}
      <div className="card bg-amber-500/10 border-amber-500/30">
        <p className="text-sm text-amber-300">
          Taxe de vente : <span className="font-bold">{config?.taxe_vente_pourcent || 5}%</span> prélevée sur le prix d&apos;achat (à la charge de l&apos;acheteur)
        </p>
      </div>

      <HangarMarketClient
        userId={user.id}
        soldePerso={comptePerso?.solde || 0}
        compagnies={compagniesWithSolde}
        inventaire={inventaireDisponible}
        flotteDisponible={flotteDisponible}
        isPdg={isPdg}
        annonces={annonces}
        taxePourcent={config?.taxe_vente_pourcent || 5}
      />
    </div>
  );
}
