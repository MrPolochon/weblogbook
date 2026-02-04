import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminSiaviGrades from './AdminSiaviGrades';
import AdminCreateSiaviForm from './AdminCreateSiaviForm';
import AdminSiaviComptes from './AdminSiaviComptes';
import AdminSiaviSessionsEnLigne from './AdminSiaviSessionsEnLigne';

export default async function SiaviAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/siavi');

  const [{ data: grades }, { data: siaviComptes }, { data: sessions }] = await Promise.all([
    supabase.from('siavi_grades').select('id, nom, ordre').order('ordre', { ascending: true }),
    supabase.from('profiles').select('id, identifiant, role, siavi, siavi_grade_id').eq('siavi', true).order('identifiant'),
    supabase.from('afis_sessions').select('user_id, aeroport, est_afis, started_at').order('aeroport'),
  ]);

  const userIds = Array.from(new Set((sessions || []).map((s) => s.user_id)));
  const { data: profs } = userIds.length > 0 ? await supabase.from('profiles').select('id, identifiant').in('id', userIds) : { data: [] };
  const identifiantByUserId = new Map((profs || []).map((p) => [p.id, p.identifiant]));
  const sessionsEnLigne = (sessions || []).map((s) => ({
    user_id: s.user_id,
    aeroport: s.aeroport,
    est_afis: s.est_afis,
    started_at: s.started_at,
    identifiant: identifiantByUserId.get(s.user_id) ?? '—',
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/siavi" className="text-red-600 hover:text-red-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-red-900">Admin SIAVI</h1>
      </div>

      <AdminSiaviSessionsEnLigne sessions={sessionsEnLigne} />
      <AdminSiaviGrades grades={grades || []} />
      <AdminCreateSiaviForm grades={grades || []} />
      <AdminSiaviComptes comptes={siaviComptes || []} grades={grades || []} />
    </div>
  );
}
