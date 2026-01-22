import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminLicences from './AdminLicences';

export default async function AdminLicencesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const [{ data: pilotes }, { data: typesAvion }] = await Promise.all([
    supabase.from('profiles').select('id, identifiant').order('identifiant'),
    supabase.from('types_avion').select('id, nom, constructeur').order('ordre'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Licences et qualifications</h1>
      </div>
      <AdminLicences pilotes={pilotes || []} typesAvion={typesAvion || []} />
    </div>
  );
}
