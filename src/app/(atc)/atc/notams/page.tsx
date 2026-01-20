import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import NotamsSection from '@/app/(app)/notams/NotamsSection';

export const dynamic = 'force-dynamic';

const TROIS_JOURS_MS = 3 * 24 * 60 * 60 * 1000;

export default async function AtcNotamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const threeDaysAgo = new Date(Date.now() - TROIS_JOURS_MS).toISOString();
  const admin = createAdminClient();
  await admin.from('notams').delete().lt('au_at', threeDaysAgo);

  const [{ data: notams }, { data: profile }] = await Promise.all([
    supabase.from('notams').select('id, identifiant, code_aeroport, du_at, au_at, champ_a, champ_e, champ_d, champ_q, priorite, reference_fr, annule').eq('annule', false).gte('au_at', threeDaysAgo).order('au_at', { ascending: false }),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ]);

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">NOTAMs</h1>
      <p className="text-slate-600 text-sm">
        Notices to Airmen : informations temporaires (travaux, restrictions, dangers). Les NOTAMs restent affichés 3 jours après expiration puis sont supprimés définitivement. Voir le{' '}
        <a href="https://umvie.com/guide-pratique-pour-lire-les-notam-et-rester-informe/" target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">guide pour lire les NOTAM</a>.
      </p>

      <NotamsSection notams={notams} isAdmin={isAdmin} variant="atc" />
    </div>
  );
}
