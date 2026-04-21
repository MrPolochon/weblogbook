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
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, temps_prev_min, type_vol, accepted_at, cloture_at, siavi_avion_id, pilote_id, medevac_mission_id, medevac_segment_index, medevac_total_segments')
    .eq('id', planId)
    .single();

  if (!plan || !plan.siavi_avion_id) redirect('/siavi/rapports');

  // Vérifier qu'il n'y a pas déjà un rapport
  const { data: existing } = await admin.from('siavi_rapports_medevac')
    .select('id')
    .eq('plan_vol_id', planId)
    .maybeSingle();

  if (existing) redirect(`/siavi/rapports/${existing.id}`);

  // Charger tous les segments de la mission si c'est un vol multi-segments
  type SegmentInfo = {
    id: string;
    aeroport_depart: string;
    aeroport_arrivee: string;
    accepted_at: string | null;
    cloture_at: string | null;
    temps_prev_min: number;
    medevac_segment_index: number | null;
  };
  let segments: SegmentInfo[] = [];
  if (plan.medevac_mission_id) {
    const { data: segs } = await admin.from('plans_vol')
      .select('id, aeroport_depart, aeroport_arrivee, accepted_at, cloture_at, temps_prev_min, medevac_segment_index')
      .eq('medevac_mission_id', plan.medevac_mission_id)
      .order('medevac_segment_index', { ascending: true });
    segments = (segs || []) as SegmentInfo[];
  }

  // Charger les infos de l'avion
  const { data: avion } = await admin.from('siavi_avions')
    .select('immatriculation, types_avion:type_avion_id(nom)')
    .eq('id', plan.siavi_avion_id)
    .single();

  const ta = avion?.types_avion as { nom?: string } | { nom?: string }[] | null | undefined;
  const aircraftType = ta ? (Array.isArray(ta) ? (ta[0]?.nom || 'N/A') : (ta.nom || 'N/A')) : 'N/A';

  // Construire le trajet complet pour affichage (ex: IRFD → IBTH → IPPH → ITKO)
  const isMultiSegment = segments.length > 1;
  const trajetComplet = isMultiSegment
    ? [segments[0].aeroport_depart, ...segments.map(s => s.aeroport_arrivee)].join(' → ')
    : `${plan.aeroport_depart} → ${plan.aeroport_arrivee}`;

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
            <p className="text-red-100/80 text-sm">
              Vol {plan.numero_vol}
              {isMultiSegment ? ` — Mission ${segments.length} segments — ` : ' — '}
              <span className="font-mono">{trajetComplet}</span>
            </p>
          </div>
        </div>
      </div>

      {isMultiSegment && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-200 font-medium mb-2">Détail des segments de la mission</p>
          <ul className="space-y-1 text-sm text-slate-300">
            {segments.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-200 text-xs font-bold">
                  {s.medevac_segment_index ?? i + 1}
                </span>
                <span className="font-mono text-slate-200">{s.aeroport_depart}</span>
                <span className="text-slate-500">→</span>
                <span className="font-mono text-slate-200">{s.aeroport_arrivee}</span>
                <span className="text-slate-500 mx-1">·</span>
                <span className="text-xs text-slate-500">{s.temps_prev_min} min prévues</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RapportMedevacForm
        planVolId={plan.id}
        numeroVol={plan.numero_vol}
        aeroportDepart={segments[0]?.aeroport_depart || plan.aeroport_depart}
        aeroportArrivee={segments[segments.length - 1]?.aeroport_arrivee || plan.aeroport_arrivee}
        aircraftRegistration={avion?.immatriculation || 'N/A'}
        aircraftType={aircraftType}
        commanderDefault={profile?.identifiant || ''}
        segments={segments.map(s => ({
          aeroport_depart: s.aeroport_depart,
          aeroport_arrivee: s.aeroport_arrivee,
          segment_index: s.medevac_segment_index,
        }))}
      />
    </div>
  );
}
