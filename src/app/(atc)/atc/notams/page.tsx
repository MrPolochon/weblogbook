import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Radio } from 'lucide-react';
import NotamsClient from '@/app/(app)/notams/NotamsClient';

export const dynamic = 'force-dynamic';

const TROIS_JOURS_MS = 3 * 24 * 60 * 60 * 1000;

export default async function AtcNotamsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Cleanup admin : suppression definitive des NOTAMs expires depuis plus de 3 jours
  const threeDaysAgo = new Date(Date.now() - TROIS_JOURS_MS).toISOString();
  const admin = createAdminClient();
  await admin.from('notams').delete().eq('permanent', false).lt('au_at', threeDaysAgo);

  const [{ data: notams }, { data: profile }] = await Promise.all([
    supabase
      .from('notams')
      .select(
        'id, identifiant, code_aeroport, du_at, au_at, permanent, champ_a, champ_e, champ_d, champ_q, priorite, reference_fr, annule'
      )
      .eq('annule', false)
      .gte('au_at', threeDaysAgo)
      .order('permanent', { ascending: false })
      .order('au_at', { ascending: false }),
    supabase.from('profiles').select('role, ifsa').eq('id', user.id).single(),
  ]);

  const canManageNotams = profile?.role === 'admin' || profile?.ifsa === true;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-sky-500/15 ring-1 ring-sky-400/30">
            <Radio className="h-6 w-6 text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">NOTAMs</h1>
            <p className="text-slate-400 text-sm max-w-2xl mt-1">
              Notices to Airmen : informations temporaires (travaux, restrictions, dangers).
              Cliquez sur un aéroport sur la carte pour voir uniquement ses NOTAMs.
              Les NOTAMs restent affichés 3 jours après expiration puis sont supprimés, sauf les permanents. Voir le{' '}
              <a
                href="https://umvie.com/guide-pratique-pour-lire-les-notam-et-rester-informe/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                guide pour lire les NOTAM
              </a>
              .
            </p>
          </div>
        </div>
      </div>

      <NotamsClient notams={notams ?? []} canManageNotams={canManageNotams} />
    </div>
  );
}
