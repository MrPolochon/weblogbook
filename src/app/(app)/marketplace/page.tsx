import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Package, Plane, Users, Weight } from 'lucide-react';
import MarketplaceClient from './MarketplaceClient';

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
      </div>

      {/* Liste des avions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-purple-400" />
          Avions disponibles
        </h2>
        
        {avions && avions.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {avions.map((avion) => (
              <div 
                key={avion.id} 
                className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-purple-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-200">{avion.nom}</h3>
                    {avion.code_oaci && (
                      <p className="text-xs text-slate-500 font-mono">{avion.code_oaci}</p>
                    )}
                  </div>
                  <Plane className="h-8 w-8 text-slate-600" />
                </div>
                
                <div className="space-y-1.5 mb-4">
                  {avion.capacite_pax > 0 && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Users className="h-4 w-4" />
                      <span>{avion.capacite_pax} passagers</span>
                    </div>
                  )}
                  {avion.capacite_cargo_kg > 0 && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Weight className="h-4 w-4" />
                      <span>{avion.capacite_cargo_kg.toLocaleString('fr-FR')} kg cargo</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-purple-300">
                    {avion.prix.toLocaleString('fr-FR')} F$
                  </p>
                  <MarketplaceClient 
                    avionId={avion.id}
                    avionNom={avion.nom}
                    prix={avion.prix}
                    soldePerso={comptePerso?.solde || 0}
                    compagnies={compagniesWithSolde}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400">Aucun avion disponible à la vente pour le moment.</p>
        )}
      </div>
    </div>
  );
}
