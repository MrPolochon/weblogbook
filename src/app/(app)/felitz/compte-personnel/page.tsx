import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wallet, Send, History } from 'lucide-react';
import FelitzComptePersonnel from './FelitzComptePersonnel';

export default async function FelitzComptePersonnelPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/atc');

  const { data: compte } = await supabase
    .from('felitz_comptes')
    .select('id, vban, solde')
    .eq('user_id', user.id)
    .is('compagnie_id', null)
    .single();

  if (!compte) {
    const admin = await import('@/lib/supabase/admin').then((m) => m.createAdminClient());
    const vban = await admin.rpc('generate_vban_personnel');
    await admin.from('felitz_comptes').insert({
      user_id: user.id,
      type_compte: 'personnel',
      vban: vban.data || vban,
      solde: 0,
    });
    redirect('/felitz/compte-personnel');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/felitz" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Compte personnel
        </h1>
      </div>
      <FelitzComptePersonnel compteId={compte.id} vban={compte.vban} solde={Number(compte.solde)} />
    </div>
  );
}
