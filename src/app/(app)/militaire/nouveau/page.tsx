import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import VolFormMilitaire from './VolFormMilitaire';

export default async function NouveauVolMilitairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('armee, blocked_until').eq('id', user.id).single();
  if (!profile?.armee) redirect('/militaire');
  if (profile?.blocked_until && new Date(profile.blocked_until) > new Date()) redirect('/militaire');

  const { data: pilotesArmee } = await supabase
    .from('profiles')
    .select('id, identifiant')
    .eq('armee', true)
    .order('identifiant');

  const list = (pilotesArmee || []).filter((p) => p.id !== user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/militaire" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Nouveau vol militaire</h1>
      </div>
      <VolFormMilitaire pilotesArmee={list} />
    </div>
  );
}
