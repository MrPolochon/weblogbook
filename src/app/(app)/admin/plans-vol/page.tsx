import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PlansNonClotures from './PlansNonClotures';
import PlansHistorique from './PlansHistorique';
import AdminPlansVolTabs from './AdminPlansVolTabs';

export default async function AdminPlansVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();

  // Plans non clôturés : tous sauf 'cloture', 'annule', 'refuse' — exclut les strips manuels ATC
  const { data: plans } = await admin.from('plans_vol')
    .select(`
      id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, temps_prev_min,
      created_at, accepted_at, vol_commercial, vol_ferry, automonitoring, vol_sans_atc,
      compagnie_id, nature_transport, nb_pax_genere, cargo_kg_genere, revenue_brut, salaire_pilote,
      current_holder_user_id, current_holder_position, current_holder_aeroport,
      pilote:profiles!plans_vol_pilote_id_fkey(identifiant),
      compagnie:compagnies(nom)
    `)
    .not('statut', 'in', '("cloture","annule","refuse")')
    .or('created_by_atc.is.null,created_by_atc.eq.false')
    .order('created_at', { ascending: true });

  // Plans clôturés avec historique des ATC
  const { data: plansClotures } = await admin.from('plans_vol')
    .select(`
      id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut,
      created_at, accepted_at, cloture_at, demande_cloture_at,
      vol_commercial, vol_ferry, automonitoring, created_by_atc,
      compagnie_id,
      pilote:profiles!plans_vol_pilote_id_fkey(identifiant),
      compagnie:compagnies(nom),
      atc_plans_controles(user_id, aeroport, position, created_at, profile:profiles(identifiant))
    `)
    .in('statut', ['cloture', 'annule'])
    .order('cloture_at', { ascending: false, nullsFirst: false })
    .limit(500);

  const openPlans = (plans || []) as any;
  const closedPlans = (plansClotures || []) as any;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Plans de vol</h1>
          <p className="text-sm text-slate-400 mt-1">
            {openPlans.length} plan(s) ouvert(s) • {closedPlans.length} dans l&apos;historique
          </p>
        </div>
      </div>

      <AdminPlansVolTabs
        openCount={openPlans.length}
        closedCount={closedPlans.length}
        childrenOpen={<PlansNonClotures plans={openPlans} />}
        childrenHistory={<PlansHistorique plans={closedPlans} />}
      />
    </div>
  );
}
