import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CreateNotamForm from '@/app/(app)/notams/CreateNotamForm';
import NotamCard from '@/app/(app)/notams/NotamCard';

export const dynamic = 'force-dynamic';

export default async function AtcNotamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: notams }, { data: profile }] = await Promise.all([
    supabase.from('notams').select('id, identifiant, code_aeroport, du_at, au_at, champ_a, champ_e, champ_d, champ_q, priorite, reference_fr, annule').order('au_at', { ascending: false }),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ]);

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">NOTAMs</h1>
      <p className="text-slate-600 text-sm">
        Notices to Airmen : informations temporaires (travaux, restrictions, dangers). Les NOTAMs sont visibles par les pilotes et les ATC. Voir le{' '}
        <a href="https://umvie.com/guide-pratique-pour-lire-les-notam-et-rester-informe/" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">guide pour lire les NOTAM</a>.
      </p>

      {isAdmin && <CreateNotamForm variant="atc" />}

      <div className="card">
        <h2 className="text-lg font-medium text-slate-800 mb-4">NOTAMs publiés</h2>
        {!notams || notams.length === 0 ? (
          <p className="text-slate-600">Aucun NOTAM.</p>
        ) : (
          <div className="space-y-4">
            {notams.map((n) => (
              <NotamCard key={n.id} n={n} variant="atc" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
