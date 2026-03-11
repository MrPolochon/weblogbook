import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminLicences from '@/app/(app)/admin/licences/AdminLicences';

export default async function IfsaLicencesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, ifsa').eq('id', user.id).single();
  if (!profile?.ifsa && profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();
  const [{ data: pilotes }, { data: typesAvion }] = await Promise.all([
    admin.from('profiles').select('id, identifiant').order('identifiant'),
    admin.from('types_avion').select('id, nom, constructeur').order('ordre'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/ifsa" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Licences et qualifications</h1>
      </div>
      <AdminLicences pilotes={pilotes || []} typesAvion={typesAvion || []} />
    </div>
  );
}
