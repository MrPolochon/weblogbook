import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
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

  // Soldes des compagnies (une requête, plus un N+1 par PDG)
  let compagniesWithSolde: Array<{ id: string; nom: string; solde: number }> = [];
  if (compagniesPdg && compagniesPdg.length > 0) {
    const compagnieIds = compagniesPdg.map((c) => c.id);
    const { data: comptesCie } = await admin.from('felitz_comptes')
      .select('compagnie_id, solde, created_at')
      .in('compagnie_id', compagnieIds)
      .eq('type', 'entreprise')
      .order('created_at', { ascending: true });
    const soldeByCie = new Map<string, number>();
    for (const row of comptesCie ?? []) {
      if (!row.compagnie_id || soldeByCie.has(row.compagnie_id)) continue;
      soldeByCie.set(row.compagnie_id, Number(row.solde ?? 0));
    }
    compagniesWithSolde = compagniesPdg.map((c) => ({
      ...c,
      solde: soldeByCie.get(c.id) ?? 0,
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
  const { data: avions, error: catalogueError } = await admin.from('types_avion')
    .select('*')
    .gt('prix', 0)
    .order('prix', { ascending: true });

  const soldePerso = Number(comptePerso?.solde ?? 0);
  const totalAvions = avions?.length ?? 0;
  const prixMin = avions && avions.length > 0 ? Math.min(...avions.map(a => a.prix)) : 0;
  const prixMax = avions && avions.length > 0 ? Math.max(...avions.map(a => a.prix)) : 0;

  if (catalogueError) return <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-6"><h1 className="text-2xl font-semibold text-slate-100">Catalogue des appareils</h1><p role="alert" className="text-sm text-amber-200">Le catalogue n’a pas pu être chargé. Les modèles ne sont pas considérés comme retirés de la vente.</p><Link href="/marketplace" className="inline-flex min-h-11 items-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500">Réessayer</Link></section>;

  return (
    <div className="space-y-6">
      {/* === HERO HEADER === */}
      <header className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900/70">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
                <Package className="h-6 w-6 text-sky-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Acquisition</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Catalogue des appareils</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  Comparez les modèles, leurs capacités et les comptes autorisés avant de confirmer une acquisition.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5" /> Catalogue
              </p>
              <p className="text-2xl font-semibold text-slate-100 tabular-nums">{totalAvions}</p>
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
