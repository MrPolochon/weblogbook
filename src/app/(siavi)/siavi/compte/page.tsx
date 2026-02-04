import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CompteForm from '@/app/(app)/compte/CompteForm';
import LicencesSection from '@/components/LicencesSection';

function formatTemps(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min === 0) return '0 h';
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

export default async function SiaviComptePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('identifiant, role, siavi_grade_id, siavi_temps_total_minutes').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  // Récupérer tous les agents SIAVI
  const [
    { data: siaviProfiles },
    { data: grades },
  ] = await Promise.all([
    supabase.from('profiles').select('id, identifiant, siavi_grade_id, siavi_temps_total_minutes').or(isAdmin ? 'siavi.eq.true,role.eq.admin' : 'siavi.eq.true').order('identifiant'),
    supabase.from('siavi_grades').select('id, nom, ordre').order('ordre', { ascending: true }),
  ]);

  const gradeById = new Map((grades || []).map((g) => [g.id, g]));
  
  // Grade de l'utilisateur actuel
  const monGrade = profile?.siavi_grade_id ? gradeById.get(profile.siavi_grade_id)?.nom : null;
  
  const list = (siaviProfiles || []).map((p) => ({
    identifiant: p.identifiant,
    gradeNom: p.siavi_grade_id ? (gradeById.get(p.siavi_grade_id)?.nom ?? '—') : '—',
    gradeOrdre: p.siavi_grade_id ? (gradeById.get(p.siavi_grade_id)?.ordre ?? 999) : 999,
    tempsTotal: p.siavi_temps_total_minutes,
  }));
  list.sort((a, b) => a.gradeOrdre - b.gradeOrdre || a.identifiant.localeCompare(b.identifiant));

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-8 max-w-5xl">
      <div className="space-y-6 max-w-md">
        <h1 className="text-2xl font-bold text-red-400">Mon compte SIAVI</h1>
        <div className="rounded-xl border-2 border-red-300 bg-white p-4 shadow-sm">
          <div className="space-y-3">
            <div>
              <p className="text-red-700 text-sm font-medium">Identifiant</p>
              <p className="text-slate-900 font-semibold">{profile?.identifiant ?? '—'}</p>
            </div>
            {monGrade && (
              <div>
                <p className="text-red-700 text-sm font-medium">Grade SIAVI</p>
                <p className="text-slate-900 font-semibold">{monGrade}</p>
              </div>
            )}
            <div>
              <p className="text-red-700 text-sm font-medium">Temps total en service</p>
              <p className="text-slate-900 font-semibold tabular-nums">{formatTemps(profile?.siavi_temps_total_minutes)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border-2 border-red-300 bg-white p-4 shadow-sm">
          <CompteForm armee={false} isAdmin={isAdmin} variant="siavi" showArmee={false} />
        </div>
        <LicencesSection userId={user.id} variant="siavi" />
      </div>
      <div className="lg:min-w-[320px] lg:flex-1">
        <div className="rounded-xl border-2 border-red-300 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-red-800 mb-4">{isAdmin ? 'Agents SIAVI et admins' : 'Agents SIAVI'}</h2>
          {list.length === 0 ? (
            <p className="text-slate-600 text-sm">Aucun agent SIAVI.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-red-200 text-left text-red-700">
                    <th className="pb-2 pr-4">Identifiant</th>
                    <th className="pb-2 pr-4">Grade</th>
                    <th className="pb-2">Temps en service</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.identifiant} className="border-b border-red-100 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-slate-800">{row.identifiant}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{row.gradeNom}</td>
                      <td className="py-2.5 text-slate-600 tabular-nums">{formatTemps(row.tempsTotal)}</td>
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
