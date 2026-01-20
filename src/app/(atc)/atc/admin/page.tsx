import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminAtcGrades from './AdminAtcGrades';
import AdminCreateAtcForm from './AdminCreateAtcForm';
import AdminAtcComptes from './AdminAtcComptes';

export default async function AtcAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/atc');

  const [{ data: grades }, { data: atcComptes }] = await Promise.all([
    supabase.from('atc_grades').select('id, nom, ordre').order('ordre', { ascending: true }),
    supabase.from('profiles').select('id, identifiant, role, atc, atc_grade_id').or('role.eq.atc,atc.eq.true').order('identifiant'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/atc" className="text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Admin ATC</h1>
      </div>

      <AdminAtcGrades grades={grades || []} />
      <AdminCreateAtcForm grades={grades || []} />
      <AdminAtcComptes comptes={atcComptes || []} grades={grades || []} />
    </div>
  );
}
