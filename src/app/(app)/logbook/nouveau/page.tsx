import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import NouveauVolClient from './NouveauVolClient';

export default async function NouveauVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('blocked_until').eq('id', user.id).single();
  if (profile?.blocked_until && new Date(profile.blocked_until) > new Date()) redirect('/logbook');

  const admin = createAdminClient();
  const [{ data: types }, { data: compagnies }, { data: admins }, { data: allProfiles }, { data: closedPlans }] = await Promise.all([
    supabase.from('types_avion').select('id, nom, constructeur').order('ordre'),
    supabase.from('compagnies').select('id, nom').order('nom'),
    supabase.from('profiles').select('id, identifiant').eq('role', 'admin').order('identifiant'),
    supabase.from('profiles').select('id, identifiant').order('identifiant'),
    admin.from('plans_vol').select('id, aeroport_depart, aeroport_arrivee, type_vol, numero_vol, accepted_at, cloture_at').eq('pilote_id', user.id).eq('statut', 'cloture').not('accepted_at', 'is', null).not('cloture_at', 'is', null).order('cloture_at', { ascending: false }),
  ]);

  const autresProfiles = (allProfiles || []).filter((p) => p.id !== user.id);

  return (
    <Suspense fallback={<div className="text-slate-400">Chargement…</div>}>
      <NouveauVolClient
        closedPlans={closedPlans || []}
        typesAvion={types || []}
        compagnies={compagnies || []}
        admins={admins || []}
        autresProfiles={autresProfiles}
      />
    </Suspense>
  );
}
