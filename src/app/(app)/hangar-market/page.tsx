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
    .select('id, nom_personnalise, types_avion:type_avion_id(id, nom, code_oaci)')
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

    return {
      ...item,
      en_vol: (enVol || 0) > 0,
      en_vente: !!enVente,
      disponible: (enVol || 0) === 0 && !enVente
    };
  }));

  // Flottes des compagnies (PDG uniquement)
  let flotteCompagnies: Array<{
    compagnie_id: string;
    compagnie_nom: string;
    avions: Array<{
      id: string;
      type_avion_id: string;
      nom: string;
      quantite: number;
      en_vente: boolean;
    }>;
  }> = [];

  if (compagniesPdg && compagniesPdg.length > 0) {
    flotteCompagnies = await Promise.all(compagniesPdg.map(async (c) => {
      const { data: flotte } = await admin.from('compagnie_flotte')
        .select('id, type_avion_id, quantite, nom_personnalise, types_avion:type_avion_id(nom)')
        .eq('compagnie_id', c.id)
        .gt('quantite', 0);

      const avionsWithStatus = await Promise.all((flotte || []).map(async (f) => {
        const { data: enVente } = await admin.from('hangar_market')
          .select('id')
          .eq('flotte_avion_id', f.id)
          .eq('statut', 'en_vente')
          .single();

        return {
          id: f.id,
          type_avion_id: f.type_avion_id,
          nom: f.nom_personnalise || (f.types_avion as any)?.nom || 'Avion',
          quantite: f.quantite,
          en_vente: !!enVente
        };
      }));

      return {
        compagnie_id: c.id,
        compagnie_nom: c.nom,
        avions: avionsWithStatus
      };
    }));
  }

  // Annonces en vente
  const { data: annonces } = await admin.from('hangar_market')
    .select(`
      *,
      types_avion:type_avion_id(id, nom, code_oaci, constructeur, capacite_pax, capacite_cargo_kg),
      vendeur:vendeur_id(id, identifiant),
      compagnie_vendeur:compagnie_vendeur_id(id, nom)
    `)
    .eq('statut', 'en_vente')
    .order('created_at', { ascending: false });

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
        flotteCompagnies={flotteCompagnies}
        annonces={annonces || []}
        taxePourcent={config?.taxe_vente_pourcent || 5}
      />
    </div>
  );
}
