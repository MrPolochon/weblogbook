import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import VolFormMilitaire from './VolFormMilitaire';

export default async function NouveauVolMilitairePage({ searchParams }: { searchParams?: { mission?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('armee, role, blocked_until').eq('id', user.id).single();
  if (!profile?.armee && profile?.role !== 'admin') redirect('/militaire');
  if (profile?.blocked_until && new Date(profile.blocked_until) > new Date()) redirect('/militaire');

  const { data: pilotesArmee } = await supabase
    .from('profiles')
    .select('id, identifiant')
    .eq('armee', true)
    .order('identifiant');

  const list = (pilotesArmee || []).filter((p) => p.id !== user.id);

  // Récupérer les avions possédés par l'armée
  const admin = createAdminClient();
  const { data: inventaireMilitaire } = await admin.from('armee_avions')
    .select('id, nom_personnalise, types_avion(id, nom, code_oaci)')
    .order('created_at', { ascending: false });

  const missionId = searchParams?.mission || '';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/militaire" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Nouveau vol militaire</h1>
      </div>
      <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100/95">
        <p className="font-medium text-sky-200">Carnet militaire ≠ plan de vol ATC</p>
        <p className="mt-1 text-sky-100/80 text-xs leading-relaxed">
          Ce formulaire crée une demande dans <strong className="text-sky-100">Vols militaires</strong> (tableau sur /militaire), à valider par un admin.
          Pour un <strong className="text-sky-100">plan de vol</strong> classique (ATC), utilisez{' '}
          <Link href={missionId ? `/logbook/depot-plan-vol?mission=${missionId}` : '/logbook/depot-plan-vol'} className="underline underline-offset-2 hover:text-white">
            Déposer un plan de vol
          </Link>{' '}
          dans le logbook — vous pouvez y choisir la flotte armée en vol non commercial.
        </p>
      </div>
      <VolFormMilitaire pilotesArmee={list} inventaireMilitaire={inventaireMilitaire || []} missionId={missionId} />
    </div>
  );
}
