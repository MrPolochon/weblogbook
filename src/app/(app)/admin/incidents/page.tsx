import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import IncidentsClient from './IncidentsClient';

export default async function AdminIncidentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, ifsa').eq('id', user.id).single();
  if (profile?.role !== 'admin' && !profile?.ifsa) redirect('/admin');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="text-sky-400 hover:text-sky-300">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-100">Incidents de vol</h1>
      </div>
      <IncidentsClient />
    </div>
  );
}
