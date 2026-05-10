import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Package, User, Building2, Shield, Plane, Tag } from 'lucide-react';
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
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      return { ...c, solde: Number(compte?.solde ?? 0) };
    }));
  }

  // Compte militaire (limit 1 pour éviter erreur si doublons)
  const { data: compteMilitaire } = await admin.from('felitz_comptes')
    .select('id, solde, proprietaire_id')
    .eq('type', 'militaire')
    .limit(1)
    .maybeSingle();
  const armeeCompte = compteMilitaire?.proprietaire_id === user.id
    ? { id: compteMilitaire.id, solde: Number(compteMilitaire.solde ?? 0) }
    : null;

  // Liste des avions à vendre
  const { data: avions } = await admin.from('types_avion')
    .select('*')
    .gt('prix', 0)
    .order('prix', { ascending: true });

  const soldePerso = Number(comptePerso?.solde ?? 0);
  const totalAvions = avions?.length ?? 0;
  const prixMin = avions && avions.length > 0 ? Math.min(...avions.map(a => a.prix)) : 0;
  const prixMax = avions && avions.length > 0 ? Math.max(...avions.map(a => a.prix)) : 0;

  return (
    <div className="space-y-6 animate-fade-in stagger-enter">
      {/* === HERO HEADER === */}
      <header className="card overflow-hidden p-0 border-purple-700/40 transition-shadow hover:shadow-xl hover:shadow-purple-500/10">
        <div className="bg-gradient-to-br from-purple-500/15 via-slate-800/10 to-fuchsia-500/10 p-5 sm:p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-14 w-14 rounded-xl bg-purple-500/20 ring-2 ring-purple-500/40 flex items-center justify-center shrink-0">
                <Package className="h-7 w-7 text-purple-300 animate-pulse-soft" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">Marketplace</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  Achetez des avions pour votre flotte personnelle, votre compagnie ou l&apos;armée.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5" /> Catalogue
              </p>
              <p className="text-2xl font-bold text-purple-300 tabular-nums">{totalAvions}</p>
              <p className="text-[10px] text-slate-500">avion{totalAvions > 1 ? 's' : ''} disponible{totalAvions > 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Strip des soldes */}
        <div className="grid border-t border-slate-700/40 divide-x divide-slate-700/40 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <div className="p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Personnel
            </p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${soldePerso > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {soldePerso.toLocaleString('fr-FR')} <span className="text-sm font-medium">F$</span>
            </p>
            <p className="text-[10px] text-slate-500">
              {prixMin > 0 && soldePerso < prixMin ? 'insuffisant pour le moins cher' : 'mon compte'}
            </p>
          </div>
          {compagniesWithSolde.map((c) => (
            <div key={c.id} className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5 truncate">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{c.nom}</span>
              </p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${c.solde > 0 ? 'text-sky-300' : 'text-red-400'}`}>
                {c.solde.toLocaleString('fr-FR')} <span className="text-sm font-medium">F$</span>
              </p>
              <p className="text-[10px] text-slate-500">entreprise</p>
            </div>
          ))}
          {armeeCompte && (
            <div className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Armée
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-red-300">
                {armeeCompte.solde.toLocaleString('fr-FR')} <span className="text-sm font-medium">F$</span>
              </p>
              <p className="text-[10px] text-slate-500">militaire</p>
            </div>
          )}
        </div>

        {/* Plage de prix */}
        {totalAvions > 0 && (
          <div className="px-4 sm:px-6 py-2.5 border-t border-slate-700/40 bg-slate-900/40 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
            <Tag className="h-3.5 w-3.5 text-slate-600" />
            <span>De <span className="text-emerald-300 font-semibold tabular-nums">{prixMin.toLocaleString('fr-FR')} F$</span></span>
            <span className="text-slate-600">→</span>
            <span><span className="text-purple-300 font-semibold tabular-nums">{prixMax.toLocaleString('fr-FR')} F$</span></span>
          </div>
        )}
      </header>

      {/* Carte des hubs par aéroport */}
      <HubsMapSection />

      {/* Liste des avions avec recherche */}
      <MarketplaceList
        avions={avions || []}
        soldePerso={soldePerso}
        compagnies={compagniesWithSolde}
        armeeCompte={armeeCompte}
      />
    </div>
  );
}
