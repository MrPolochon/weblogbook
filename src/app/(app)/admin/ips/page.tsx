import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import IpsClient from './IpsClient';

export default async function AdminIpsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Consultation des IP</h1>
      </div>
      <p className="text-slate-400 text-sm">
        Pour consulter la liste des adresses IP et la dernière IP utilisée par chaque compte, vous devez entrer le mot de passe superadmin,
        valider par code envoyé à votre email, puis obtenir l&apos;approbation d&apos;un autre administrateur.
      </p>
      <IpsClient />
    </div>
  );
}
