import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, HeartPulse, Play, ArrowRight } from 'lucide-react';
import ReprendreSegmentForm from '@/app/(app)/logbook/plans-vol/[id]/reprendre/ReprendreSegmentForm';

export default async function ReprendreSegmentSiaviPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, siavi').eq('id', user.id).single();
  const canSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || Boolean(profile?.siavi);
  if (!canSiavi) redirect('/logbook');

  const admin = createAdminClient();
  const { data: segment } = await admin
    .from('plans_vol')
    .select('id, pilote_id, statut, aeroport_depart, aeroport_arrivee, numero_vol, type_vol, temps_prev_min, intentions_vol, niveau_croisiere, sid_depart, star_arrivee, route_ifr, medevac_mission_id, medevac_segment_index, medevac_total_segments, vol_sans_atc')
    .eq('id', id)
    .single();

  if (!segment || segment.pilote_id !== user.id || segment.statut !== 'planifie_suivant' || !segment.medevac_mission_id) notFound();

  const { data: segmentPrec } = await admin
    .from('plans_vol')
    .select('id, aeroport_depart, aeroport_arrivee, numero_vol, statut, medevac_segment_index')
    .eq('medevac_next_plan_id', id)
    .maybeSingle();

  if (!segmentPrec || !['en_pause','cloture'].includes(segmentPrec.statut)) notFound();

  return (
    <div className="space-y-6 siavi-workspace siavi-enter">
      <div className="flex items-center gap-4">
        <Link href="/siavi/medevac" className="p-2 rounded-lg bg-rose-950/60 text-rose-300 hover:text-rose-100 hover:bg-red-200 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-rose-100 flex items-center gap-3">
            <Play className="h-6 w-6 text-rose-300" />
            Reprendre la mission
          </h1>
          <p className="text-sm text-rose-200 mt-1">
            MEDEVAC {segment.numero_vol} — segment {segment.medevac_segment_index}/{segment.medevac_total_segments}
          </p>
        </div>
      </div>

      {/* Récap trajet */}
      <div className="rounded-xl border border-rose-500/25 bg-slate-900 p-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-rose-200 mb-3">
          <HeartPulse className="h-4 w-4 text-rose-300" />
          Contexte de la mission
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm px-2 py-1 rounded bg-slate-100 text-slate-200">
            {segmentPrec.aeroport_depart}
          </span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span className="font-mono text-sm px-2 py-1 rounded bg-emerald-100 text-emerald-700">
            {segmentPrec.aeroport_arrivee}
          </span>
          <span className="text-slate-400 mx-1">·</span>
          <span className="text-xs text-slate-400">Segment précédent (clôturé)</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm px-2 py-1 rounded bg-sky-100 text-sky-700">
            {segment.aeroport_depart}
          </span>
          <ArrowRight className="h-3 w-3 text-red-500" />
          <span className="font-mono text-sm px-2 py-1 rounded bg-rose-950/60 text-rose-200">
            {segment.aeroport_arrivee}
          </span>
          <span className="text-slate-400 mx-1">·</span>
          <span className="text-xs text-rose-200 font-medium">Segment à activer maintenant</span>
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
        redirectTo={`/siavi/medevac/vol/${id}`}
      />
    </div>
  );
}
