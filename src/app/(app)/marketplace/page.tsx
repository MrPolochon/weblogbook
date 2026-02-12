import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Package } from 'lucide-react';
import MarketplaceList from './MarketplaceList';
import HubsMapSection from './HubsMapSection';

export default async function MarketplacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Profil et solde
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  
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

  // Compte militaire (si l'utilisateur est PDG)
  const { data: compteMilitaire } = await admin.from('felitz_comptes')
    .select('id, solde, proprietaire_id')
    .eq('type', 'militaire')
    .single();
  const armeeCompte = compteMilitaire?.proprietaire_id === user.id
    ? { id: compteMilitaire.id, solde: compteMilitaire.solde }
    : null;

  // Liste des avions à vendre
  const { data: avions } = await admin.from('types_avion')
    .select('*')
    .gt('prix', 0)
    .order('prix', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-8 w-8 text-purple-400" />
        <h1 className="text-2xl font-bold text-slate-100">Marketplace</h1>
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
        {armeeCompte && (
          <div className="card bg-red-500/10 border-red-500/30">
            <p className="text-sm text-red-400">Compte Armée</p>
            <p className="text-2xl font-bold text-red-300">
              {armeeCompte.solde.toLocaleString('fr-FR')} F$
            </p>
          </div>
        )}
      </div>

      {/* Carte des hubs par aéroport */}
      <HubsMapSection />

      {/* Liste des avions avec recherche */}
      <MarketplaceList 
        avions={avions || []} 
        soldePerso={comptePerso?.solde || 0} 
        compagnies={compagniesWithSolde}
        armeeCompte={armeeCompte}
      />
    </div>
  );
}
