import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Route } from 'lucide-react';
import AdminSidStarClient from './AdminSidStarClient';

export default async function AdminSidStarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
          <Route className="h-7 w-7 text-sky-400" />
          SID / STAR
        </h1>
      </div>
      <div className="card">
        <p className="text-slate-400 text-sm mb-4">
          Définissez les procédures SID et STAR par aéroport. Lors du dépôt d&apos;un plan de vol (formulaire ou BRIA),
          la sélection d&apos;une SID/STAR remplit automatiquement la case route du strip ATC.
        </p>
        <AdminSidStarClient />
      </div>
    </div>
  );
}
