import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CompteForm from '@/app/(app)/compte/CompteForm';

export default async function AtcComptePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { data: profile },
    { data: atcProfiles },
    { data: grades },
  ] = await Promise.all([
    supabase.from('profiles').select('identifiant, role').eq('id', user.id).single(),
    supabase.from('profiles').select('id, identifiant, atc_grade_id').or('role.eq.atc,atc.eq.true').order('identifiant'),
    supabase.from('atc_grades').select('id, nom, ordre').order('ordre', { ascending: true }),
  ]);

  const gradeById = new Map((grades || []).map((g) => [g.id, g]));
  const list = (atcProfiles || []).map((p) => ({
    identifiant: p.identifiant,
    gradeNom: p.atc_grade_id ? (gradeById.get(p.atc_grade_id)?.nom ?? '—') : '—',
    gradeOrdre: p.atc_grade_id ? (gradeById.get(p.atc_grade_id)?.ordre ?? 999) : 999,
  }));
  list.sort((a, b) => a.gradeOrdre - b.gradeOrdre || a.identifiant.localeCompare(b.identifiant));

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-8 max-w-5xl">
      <div className="space-y-6 max-w-md">
        <h1 className="text-2xl font-semibold text-slate-900">Mon compte</h1>
        <div className="card">
          <p className="text-slate-600 text-sm">Identifiant</p>
          <p className="text-slate-900 font-medium">{profile?.identifiant ?? '—'}</p>
        </div>
        <CompteForm armee={false} isAdmin={profile?.role === 'admin'} variant="atc" showArmee={false} />
      </div>
      <div className="lg:min-w-[280px] lg:flex-1">
        <div className="card">
          <h2 className="text-lg font-medium text-slate-800 mb-4">Contrôleurs ATC</h2>
          {list.length === 0 ? (
            <p className="text-slate-600 text-sm">Aucun contrôleur ATC.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="pb-2 pr-4">Identifiant</th>
                    <th className="pb-2">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.identifiant} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-slate-800">{row.identifiant}</td>
                      <td className="py-2.5 text-slate-600">{row.gradeNom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
