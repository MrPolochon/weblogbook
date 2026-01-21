import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminAtcGrades from './AdminAtcGrades';
import AdminCreateAtcForm from './AdminCreateAtcForm';
import AdminAtcComptes from './AdminAtcComptes';
import AdminAtcSessionsEnLigne from './AdminAtcSessionsEnLigne';

export default async function AtcAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/atc');

  const [{ data: grades }, { data: atcComptes }, { data: sessions }] = await Promise.all([
    supabase.from('atc_grades').select('id, nom, ordre').order('ordre', { ascending: true }),
    supabase.from('profiles').select('id, identifiant, role, atc, atc_grade_id').or('role.eq.atc,atc.eq.true').order('identifiant'),
    supabase.from('atc_sessions').select('user_id, aeroport, position, started_at').order('aeroport').order('position'),
  ]);

  const userIds = Array.from(new Set((sessions || []).map((s) => s.user_id)));
  const { data: profs } = userIds.length > 0 ? await supabase.from('profiles').select('id, identifiant').in('id', userIds) : { data: [] };
  const identifiantByUserId = new Map((profs || []).map((p) => [p.id, p.identifiant]));
  const sessionsEnLigne = (sessions || []).map((s) => ({
    aeroport: s.aeroport,
    position: s.position,
    started_at: s.started_at,
    identifiant: identifiantByUserId.get(s.user_id) ?? '—',
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/atc" className="text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Admin ATC</h1>
      </div>

      <AdminAtcSessionsEnLigne sessions={sessionsEnLigne} />
      <AdminAtcGrades grades={grades || []} />
      <AdminCreateAtcForm grades={grades || []} />
      <AdminAtcComptes comptes={atcComptes || []} grades={grades || []} />
    </div>
  );
}
