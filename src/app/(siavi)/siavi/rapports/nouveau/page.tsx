import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import RapportMedevacForm from './RapportMedevacForm';

export default async function NouveauRapportPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles')
    .select('role, siavi, identifiant')
    .eq('id', user.id)
    .single();

  const canSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || profile?.siavi;
  if (!canSiavi) redirect('/logbook');

  if (!planId) redirect('/siavi/rapports');

  const admin = createAdminClient();

  // Charger le plan de vol MEDEVAC
  const { data: plan } = await admin.from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, temps_prev_min, type_vol, accepted_at, cloture_at, siavi_avion_id, pilote_id')
    .eq('id', planId)
    .single();

  if (!plan || !plan.siavi_avion_id) redirect('/siavi/rapports');

  // Vérifier qu'il n'y a pas déjà un rapport
  const { data: existing } = await admin.from('siavi_rapports_medevac')
    .select('id')
    .eq('plan_vol_id', planId)
    .maybeSingle();

  if (existing) redirect(`/siavi/rapports/${existing.id}`);

  // Charger les infos de l'avion
  const { data: avion } = await admin.from('siavi_avions')
    .select('immatriculation, types_avion:type_avion_id(nom)')
    .eq('id', plan.siavi_avion_id)
    .single();

  const ta = avion?.types_avion;
  const aircraftType = ta ? (Array.isArray(ta) ? ta[0]?.nom : ta.nom) : 'N/A';

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-700 to-rose-800 p-6 shadow-xl">
        <div className="relative flex items-center gap-4">
          <Link href="/siavi/rapports" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Rapport de mission MEDEVAC</h1>
            <p className="text-red-100/80 text-sm">Vol {plan.numero_vol} — {plan.aeroport_depart} → {plan.aeroport_arrivee}</p>
          </div>
        </div>
      </div>

      <RapportMedevacForm
        planVolId={plan.id}
        numeroVol={plan.numero_vol}
        aeroportDepart={plan.aeroport_depart}
        aeroportArrivee={plan.aeroport_arrivee}
        aircraftRegistration={avion?.immatriculation || 'N/A'}
        aircraftType={aircraftType}
        commanderDefault={profile?.identifiant || ''}
      />
    </div>
  );
}
