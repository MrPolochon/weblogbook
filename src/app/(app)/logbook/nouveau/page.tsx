import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import VolForm from './VolForm';

export default async function NouveauVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('blocked_until').eq('id', user.id).single();
  if (profile?.blocked_until && new Date(profile.blocked_until) > new Date()) redirect('/logbook');

  const [{ data: types }, { data: compagnies }, { data: admins }, { data: allProfiles }] = await Promise.all([
    supabase.from('types_avion').select('id, nom, constructeur').order('ordre'),
    supabase.from('compagnies').select('id, nom').order('nom'),
    supabase.from('profiles').select('id, identifiant').eq('role', 'admin').order('identifiant'),
    supabase.from('profiles').select('id, identifiant').order('identifiant'),
  ]);

  const autresProfiles = (allProfiles || []).filter((p) => p.id !== user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/logbook" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Nouveau vol</h1>
      </div>
      <VolForm typesAvion={types || []} compagnies={compagnies || []} admins={admins || []} autresProfiles={autresProfiles} />
    </div>
  );
}
