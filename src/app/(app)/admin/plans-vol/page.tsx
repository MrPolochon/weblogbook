import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import PlansNonClotures from './PlansNonClotures';

export default async function AdminPlansVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  const admin = createAdminClient();

  // Plans non clôturés : tous sauf 'cloture' et 'annule'
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
    .order('created_at', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Plans de vol non clôturés</h1>
          <p className="text-sm text-slate-400 mt-1">
            {plans?.length || 0} plan(s) ouvert(s) — Clôture forcée = amende de 50 000 F$
          </p>
        </div>
      </div>

      <PlansNonClotures plans={(plans || []) as any} />
    </div>
  );
}
