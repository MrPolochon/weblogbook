import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Briefcase } from 'lucide-react';
import FelitzComptePDG from './FelitzComptePDG';

export default async function FelitzComptePDGPage() {
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

  if (compagnies.length === 1) {
    const { data: compte } = await supabase
      .from('felitz_comptes')
      .select('id, vban, solde')
      .eq('compagnie_id', compagnies[0].id)
      .single();

    if (!compte) {
      const admin = await import('@/lib/supabase/admin').then((m) => m.createAdminClient());
      const vban = await admin.rpc('generate_vban_entreprise');
      await admin.from('felitz_comptes').insert({
        compagnie_id: compagnies[0].id,
        vban: vban.data || vban,
        solde: 0,
      });
      redirect('/felitz/compte-pdg');
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/felitz" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <Briefcase className="h-6 w-6" />
            Compte PDG - {compagnies[0].nom}
          </h1>
        </div>
        <FelitzComptePDG compagnieId={compagnies[0].id} compagnieNom={compagnies[0].nom} compteId={compte.id} vban={compte.vban} solde={Number(compte.solde)} />
      </div>
    );
  }

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
