import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { canAccessEspaceMilitaire, isBlocked } from '@/lib/armee';
import VolFormMilitaire from './VolFormMilitaire';

export default async function NouveauVolMilitairePage({
  searchParams,
}: {
  searchParams?: Promise<{ mission?: string }> | { mission?: string };
}) {
  const sp = searchParams instanceof Promise ? await searchParams : searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('armee, role, blocked_until')
    .eq('id', user.id)
    .single();

  if (!canAccessEspaceMilitaire(profile)) redirect('/militaire');
  if (isBlocked(profile)) redirect('/militaire');

  const { data: pilotesArmee } = await supabase
    .from('profiles')
    .select('id, identifiant')
    .eq('armee', true)
    .order('identifiant');

  const list = (pilotesArmee || []).filter((p) => p.id !== user.id);

  const admin = createAdminClient();
  const { data: inventaireMilitaire } = await admin
    .from('armee_avions')
    .select('id, nom_personnalise, types_avion(id, nom, code_oaci)')
    .eq('detruit', false)
    .order('created_at', { ascending: false });

  const missionId = sp?.mission || '';

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-page-reveal">
      <div className="flex items-center gap-4">
        <Link href="/militaire" className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Nouveau vol militaire</h1>
          <p className="text-sm text-slate-500 mt-0.5">Carnet armée — validation administrateur</p>
        </div>
      </div>

      <div className="rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-3 text-sm text-sky-100/95">
        <p className="font-medium text-sky-200">Carnet militaire ≠ plan de vol ATC</p>
        <p className="mt-1 text-sky-100/75 text-xs leading-relaxed">
          Ce formulaire crée une demande dans le carnet militaire, à valider par un admin.
          Pour un plan de vol ATC, utilisez{' '}
          <Link
            href={missionId ? `/logbook/depot-plan-vol?mission=${missionId}` : '/logbook/depot-plan-vol'}
            className="underline underline-offset-2 hover:text-white"
          >
            Déposer un plan de vol
          </Link>
          .
        </p>
      </div>

      <VolFormMilitaire
        pilotesArmee={list}
        inventaireMilitaire={inventaireMilitaire || []}
        missionId={missionId}
      />
    </div>
  );
}
