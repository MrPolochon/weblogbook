import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Briefcase } from 'lucide-react';
import FelitzComptePDG from './FelitzComptePDG';

export default async function FelitzComptePDGPage({ searchParams }: { searchParams: { compagnie_id?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: compagnies } = await supabase
    .from('compagnies')
    .select('id, nom, pdg_id')
    .eq('pdg_id', user.id);

  if (!compagnies || compagnies.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/felitz" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-slate-100">Compte PDG</h1>
        </div>
        <div className="card">
          <p className="text-slate-400">Vous n&apos;êtes PDG d&apos;aucune compagnie.</p>
        </div>
      </div>
    );
  }

  // Si une compagnie est sélectionnée via le paramètre de requête
  const compagnieIdParam = searchParams?.compagnie_id;
  let compagnieSelectionnee = null;
  
  if (compagnieIdParam) {
    compagnieSelectionnee = compagnies.find((c) => c.id === compagnieIdParam);
    if (!compagnieSelectionnee) {
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Link href="/felitz" className="text-slate-400 hover:text-slate-200">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-semibold text-slate-100">Compte PDG</h1>
          </div>
          <div className="card">
            <p className="text-slate-400">Compagnie introuvable ou vous n&apos;êtes pas PDG de cette compagnie.</p>
          </div>
        </div>
      );
    }
  } else if (compagnies.length === 1) {
    compagnieSelectionnee = compagnies[0];
  }

  // Si une compagnie est sélectionnée, afficher son compte
  if (compagnieSelectionnee) {
    const { data: compte, error: compteError } = await supabase
      .from('felitz_comptes')
      .select('id, vban, solde')
      .eq('compagnie_id', compagnieSelectionnee.id)
      .maybeSingle();

    if (!compte || compteError) {
      // Créer le compte s'il n'existe pas
      const admin = await import('@/lib/supabase/admin').then((m) => m.createAdminClient());
      const vban = await admin.rpc('generate_vban_entreprise');
      const { data: nouveauCompte, error: insertError } = await admin.from('felitz_comptes').insert({
        compagnie_id: compagnieSelectionnee.id,
        type_compte: 'compagnie',
        vban: vban.data || vban,
        solde: 0,
      }).select('id, vban, solde').single();
      
      if (insertError && insertError.code !== '23505') {
        // Erreur autre que "déjà existant"
        console.error('Erreur création compte:', insertError);
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Link href="/felitz" className="text-slate-400 hover:text-slate-200">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-2xl font-semibold text-slate-100">Compte PDG</h1>
            </div>
            <div className="card">
              <p className="text-slate-400">Erreur lors de la création du compte. Veuillez réessayer.</p>
            </div>
          </div>
        );
      }
      
      // Si le compte a été créé ou existe déjà, récupérer ses données
      const { data: compteFinal } = await admin
        .from('felitz_comptes')
        .select('id, vban, solde')
        .eq('compagnie_id', compagnieSelectionnee.id)
        .single();
      
      if (compteFinal) {
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Link href="/felitz" className="text-slate-400 hover:text-slate-200">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
                <Briefcase className="h-6 w-6" />
                Compte PDG - {compagnieSelectionnee.nom}
              </h1>
            </div>
            <FelitzComptePDG 
              compagnieId={compagnieSelectionnee.id} 
              compagnieNom={compagnieSelectionnee.nom} 
              compteId={compteFinal.id} 
              vban={compteFinal.vban} 
              solde={Number(compteFinal.solde)} 
            />
          </div>
        );
      }
    } else {
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Link href="/felitz" className="text-slate-400 hover:text-slate-200">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
              <Briefcase className="h-6 w-6" />
              Compte PDG - {compagnieSelectionnee.nom}
            </h1>
          </div>
          <FelitzComptePDG 
            compagnieId={compagnieSelectionnee.id} 
            compagnieNom={compagnieSelectionnee.nom} 
            compteId={compte.id} 
            vban={compte.vban} 
            solde={Number(compte.solde)} 
          />
        </div>
      );
    }
  }

  // Si plusieurs compagnies, afficher la liste de sélection
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/felitz" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Compte PDG</h1>
      </div>
      <div className="card">
        <h2 className="text-lg font-medium text-slate-200 mb-4">Sélectionner une compagnie</h2>
        <div className="space-y-2">
          {compagnies.map((c) => (
            <Link
              key={c.id}
              href={`/felitz/compte-pdg?compagnie_id=${c.id}`}
              className="block p-3 border border-slate-700/50 rounded-lg hover:border-sky-500/50 transition-colors"
            >
              <p className="text-slate-200 font-medium">{c.nom}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
