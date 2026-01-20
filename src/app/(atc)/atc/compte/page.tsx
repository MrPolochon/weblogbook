import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CompteForm from '@/app/(app)/compte/CompteForm';

export default async function AtcComptePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('identifiant, role, armee')
    .eq('id', user.id)
    .single();

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-2xl font-semibold text-slate-900">Mon compte</h1>
      <div className="card">
        <p className="text-slate-600 text-sm">Identifiant</p>
        <p className="text-slate-900 font-medium">{profile?.identifiant ?? '—'}</p>
      </div>
      <CompteForm armee={Boolean(profile?.armee)} isAdmin={profile?.role === 'admin'} variant="atc" />
    </div>
  );
}
