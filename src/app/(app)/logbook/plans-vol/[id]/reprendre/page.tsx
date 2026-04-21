import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, HeartPulse, Play, ArrowRight } from 'lucide-react';
import ReprendreSegmentForm from './ReprendreSegmentForm';

export default async function ReprendreSegmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  const admin = createAdminClient();
  const { data: segment } = await admin
    .from('plans_vol')
    .select('id, pilote_id, statut, aeroport_depart, aeroport_arrivee, numero_vol, type_vol, temps_prev_min, intentions_vol, niveau_croisiere, sid_depart, star_arrivee, route_ifr, medevac_mission_id, medevac_segment_index, medevac_total_segments, vol_sans_atc')
    .eq('id', id)
    .single();

  if (!segment || segment.pilote_id !== user.id || segment.statut !== 'planifie_suivant') notFound();

  // Charger le segment précédent pour afficher contexte
  const { data: segmentPrec } = await admin
    .from('plans_vol')
    .select('id, aeroport_depart, aeroport_arrivee, numero_vol, statut, medevac_segment_index')
    .eq('medevac_next_plan_id', id)
    .maybeSingle();

  if (!segmentPrec) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/logbook/plans-vol" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
            <Play className="h-6 w-6 text-red-400" />
            Reprendre la mission
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            MEDEVAC {segment.numero_vol} — segment {segment.medevac_segment_index}/{segment.medevac_total_segments}
          </p>
        </div>
      </div>

      {/* Récap trajet */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
        <div className="flex items-center gap-3 text-sm text-slate-400 mb-3">
          <HeartPulse className="h-4 w-4 text-red-400" />
          Contexte de la mission
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm px-2 py-1 rounded bg-slate-700/50 text-slate-300">
            {segmentPrec.aeroport_depart}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-600" />
          <span className="font-mono text-sm px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">
            {segmentPrec.aeroport_arrivee}
          </span>
          <span className="text-slate-500 mx-1">·</span>
          <span className="text-xs text-slate-500">Segment précédent (clôturé)</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm px-2 py-1 rounded bg-sky-500/20 text-sky-300">
            {segment.aeroport_depart}
          </span>
          <ArrowRight className="h-3 w-3 text-red-400" />
          <span className="font-mono text-sm px-2 py-1 rounded bg-red-500/20 text-red-300">
            {segment.aeroport_arrivee}
          </span>
          <span className="text-slate-500 mx-1">·</span>
          <span className="text-xs text-red-300 font-medium">Segment à activer maintenant</span>
        </div>
      </div>

      <ReprendreSegmentForm
        segment={{
          id: segment.id,
          aeroport_depart: segment.aeroport_depart,
          aeroport_arrivee: segment.aeroport_arrivee,
          numero_vol: segment.numero_vol,
          type_vol: segment.type_vol as 'VFR' | 'IFR',
          temps_prev_min: segment.temps_prev_min,
          intentions_vol: segment.intentions_vol,
          niveau_croisiere: segment.niveau_croisiere,
          sid_depart: segment.sid_depart,
          star_arrivee: segment.star_arrivee,
          route_ifr: segment.route_ifr,
          medevac_segment_index: segment.medevac_segment_index,
          medevac_total_segments: segment.medevac_total_segments,
          vol_sans_atc: segment.vol_sans_atc,
        }}
      />
    </div>
  );
}
