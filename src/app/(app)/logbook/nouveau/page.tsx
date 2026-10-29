import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFlightInstructorProfilesForSelect } from '@/lib/instruction-permissions';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import NouveauVolClient from './NouveauVolClient';
import { loadUnrecordedClosedPlans } from '@/lib/logbook-registration';

export default async function NouveauVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('blocked_until').eq('id', user.id).single();
  if (profile?.blocked_until && new Date(profile.blocked_until) > new Date()) redirect('/logbook');

  const admin = createAdminClient();
  const [{ data: types, error: typesError }, { data: compagnies, error: compagniesError }, { data: allProfiles, error: profilesError }, { data: closedPlans, error: plansError }, instructeurs] = await Promise.all([
    supabase.from('types_avion').select('id, nom, constructeur').order('ordre'),
    supabase.from('compagnies').select('id, nom').order('nom'),
    supabase.from('profiles').select('id, identifiant').order('identifiant'),
    loadUnrecordedClosedPlans(admin, user.id),
    getFlightInstructorProfilesForSelect(admin),
  ]);

  const autresProfiles = (allProfiles || []).filter((p) => p.id !== user.id);
  // The shared query excludes every registered status, including pending staff
  // review and historic records without a plan link, before its result limit.
  const availablePlans = closedPlans ?? [];
  const unavailable = Boolean(typesError || compagniesError || profilesError || plansError);

  return (
    <Suspense fallback={<div className="text-slate-400">Chargement…</div>}>
      <NouveauVolClient
        closedPlans={availablePlans}
        typesAvion={types || []}
        compagnies={compagnies || []}
        instructeurs={instructeurs || []}
        autresProfiles={autresProfiles}
        loadWarning={unavailable ? 'Certaines listes n’ont pas pu être chargées. Actualisez la page avant de transmettre votre vol si une information manque.' : undefined}
      />
    </Suspense>
  );
}
