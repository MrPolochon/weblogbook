import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CompteForm from './CompteForm';

export default async function ComptePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('identifiant, role')
    .eq('id', user.id)
    .single();

  return (
    <div className="space-y-6 max-w-md">
      <h1 className="text-2xl font-semibold text-slate-100">Mon compte</h1>
      <div className="card">
        <p className="text-slate-400 text-sm">Identifiant</p>
        <p className="text-slate-100 font-medium">{profile?.identifiant ?? '—'}</p>
      </div>
      <CompteForm />
    </div>
  );
}
