import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import {
  Flame, Plane, Clock, MapPin, AlertTriangle, ArrowRight, Eye, Radio,
  HeartPulse, ClipboardList, Landmark, TrendingUp, Wrench, CheckCircle2,
  AlertCircle, Pause, Calendar, Activity, Shield, FileText
} from 'lucide-react';
import SeMettreEnServiceSiaviForm from '../SeMettreEnServiceSiaviForm';
import HorsServiceSiaviButton from '../HorsServiceSiaviButton';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

// Statuts visibles côté SIAVI agent
const STATUT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  en_attente: { label: 'ATT', color: 'text-amber-300', bgColor: 'bg-amber-500/20 border border-amber-500/30' },
  depose: { label: 'DEP', color: 'text-amber-300', bgColor: 'bg-amber-500/20 border border-amber-500/30' },
  accepte: { label: 'ACC', color: 'text-emerald-300', bgColor: 'bg-emerald-500/20 border border-emerald-500/30' },
  en_cours: { label: 'VOL', color: 'text-sky-300', bgColor: 'bg-sky-500/20 border border-sky-500/30' },
  automonitoring: { label: 'AUTO', color: 'text-purple-300', bgColor: 'bg-purple-500/20 border border-purple-500/30' },
  en_attente_cloture: { label: 'CLO', color: 'text-orange-300', bgColor: 'bg-orange-500/20 border border-orange-500/30' },
  en_pause: { label: 'PAUSE', color: 'text-amber-200', bgColor: 'bg-amber-500/10 border border-amber-400/30' },
  planifie_suivant: { label: 'SUIV.', color: 'text-slate-300', bgColor: 'bg-slate-500/20 border border-slate-500/30' },
};

type SupervisedPlan = {
  id: string;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  statut: string;
  temps_prev_min: number | null;
  medevac_mission_id: string | null;
  medevac_segment_index: number | null;
  medevac_total_segments: number | null;
  pilote: { identifiant: string } | null;
};

type MissionActiveSegment = {
  id: string;
  statut: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  numero_vol: string;
  medevac_segment_index: number | null;
  medevac_total_segments: number | null;
  temps_prev_min: number | null;
};

type AvionCount = { ground: number; in_flight: number; bloque: number; autre: number };

export default async function SiaviPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [
    { data: session },
    { data: profile },
    { data: afisSessionsRaw },
    { data: atcSessionsRaw },
    { data: siaviCompte },
    { data: flotteRaw },
    { count: rapportsMois },
    { count: missionsTotales },
    { data: derniersRapports },
    { data: maMissionActiveRaw },
  ] = await Promise.all([
    supabase.from('afis_sessions').select('id, aeroport, est_afis, started_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('identifiant').eq('id', user.id).single(),
    admin.from('afis_sessions').select('aeroport, est_afis, user_id').order('aeroport'),
    admin.from('atc_sessions').select('aeroport, position, user_id').order('aeroport').order('position'),
    admin.from('felitz_comptes').select('solde, vban').eq('type', 'siavi').maybeSingle(),
    admin.from('siavi_avions').select('id, statut'),
    admin.from('siavi_rapports_medevac')
      .select('id', { count: 'exact', head: true })
      .gte('date_mission', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
    admin.from('siavi_rapports_medevac').select('id', { count: 'exact', head: true }),
    admin.from('siavi_rapports_medevac')
      .select('id, numero_mission, date_mission, commander, outcome, plan_vol:plan_vol_id(numero_vol, aeroport_depart, aeroport_arrivee)')
      .order('created_at', { ascending: false })
      .limit(5),
    admin.from('plans_vol')
      .select('id, statut, aeroport_depart, aeroport_arrivee, numero_vol, medevac_segment_index, medevac_total_segments, temps_prev_min, medevac_mission_id')
      .eq('pilote_id', user.id)
      .in('statut', ['en_attente', 'depose', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'en_pause', 'planifie_suivant'])
      .order('medevac_segment_index', { ascending: true }),
  ]);

  // Enrichir les sessions AFIS et ATC avec les identifiants
  const profileCache = new Map<string, { identifiant: string } | null>();
  async function getProfile(userId: string | null): Promise<{ identifiant: string } | null> {
    if (!userId) return null;
    if (profileCache.has(userId)) return profileCache.get(userId) || null;
    const { data } = await admin.from('profiles').select('identifiant').eq('id', userId).single();
    profileCache.set(userId, data);
    return data;
  }

  const afisEnService = await Promise.all((afisSessionsRaw || []).map(async (sess) => ({
    ...sess,
    profiles: await getProfile(sess.user_id),
  })));
  const atcEnService = await Promise.all((atcSessionsRaw || []).map(async (sess) => ({
    ...sess,
    profiles: await getProfile(sess.user_id),
  })));

  // Compter la flotte SIAVI
  const flotteCount: AvionCount = (flotteRaw || []).reduce((acc: AvionCount, a: { statut: string }) => {
    if (a.statut === 'ground') acc.ground++;
    else if (a.statut === 'in_flight') acc.in_flight++;
    else if (a.statut === 'bloque') acc.bloque++;
    else acc.autre++;
    return acc;
  }, { ground: 0, in_flight: 0, bloque: 0, autre: 0 });
  const totalFlotte = (flotteRaw || []).length;

  // Détecter si l'agent a une mission MEDEVAC en cours (actif ou pause)
  const maMission = (maMissionActiveRaw || []) as MissionActiveSegment[];
  const segmentActif = maMission.find(s => ['en_attente', 'depose', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'].includes(s.statut)) || null;
  const segmentEnPause = maMission.find(s => s.statut === 'en_pause') || null;
  const segmentSuivant = segmentEnPause
    ? maMission.find(s => s.statut === 'planifie_suivant' && s.medevac_segment_index === ((segmentEnPause.medevac_segment_index || 0) + 1)) || null
    : null;

  // Plans sous surveillance AFIS
  let plansSurveilles: SupervisedPlan[] = [];
  if (session?.est_afis) {
    const { data } = await admin.from('plans_vol')
      .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, temps_prev_min, medevac_mission_id, medevac_segment_index, medevac_total_segments, pilote_id')
      .eq('current_afis_user_id', user.id)
      .in('statut', ['accepte', 'en_cours', 'en_attente_cloture', 'automonitoring'])
      .order('created_at', { ascending: false });
    plansSurveilles = await Promise.all((data || []).map(async (plan) => ({
      ...plan,
      pilote: await getProfile(plan.pilote_id),
    })));
  }

  const totalAfisEnService = afisEnService.filter(s => s.est_afis).length;
  const totalAtcEnService = atcEnService.length;

  // Regrouper les positions par aéroport
  const positionsParAeroport = new Map<string, { afis: typeof afisEnService; atc: typeof atcEnService }>();
  for (const a of afisEnService) {
    if (!positionsParAeroport.has(a.aeroport)) positionsParAeroport.set(a.aeroport, { afis: [], atc: [] });
    positionsParAeroport.get(a.aeroport)!.afis.push(a);
  }
  for (const a of atcEnService) {
    if (!positionsParAeroport.has(a.aeroport)) positionsParAeroport.set(a.aeroport, { afis: [], atc: [] });
    positionsParAeroport.get(a.aeroport)!.atc.push(a);
  }
  const aeroportsActifs = Array.from(positionsParAeroport.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-700 via-rose-700 to-rose-900 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-white/15 backdrop-blur-sm border border-white/10">
              <Flame className="h-8 w-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-bold text-white tracking-tight">Centre SIAVI</h1>
                <span className="px-2 py-0.5 rounded-full bg-white/15 text-white/90 text-xs font-medium uppercase tracking-wider">
                  Brigade
                </span>
              </div>
              <p className="text-red-100/90 text-sm">
                Service d&apos;Information et d&apos;Assistance en Vol —
                <span className="ml-1 font-medium">{profile?.identifiant || 'Agent'}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-center min-w-[96px]">
              <div className="text-2xl font-bold text-white leading-none">{totalAfisEnService}</div>
              <div className="text-[10px] text-red-100/80 uppercase tracking-wider mt-1">AFIS actifs</div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-center min-w-[96px]">
              <div className="text-2xl font-bold text-white leading-none">{totalAtcEnService}</div>
              <div className="text-[10px] text-red-100/80 uppercase tracking-wider mt-1">ATC en ligne</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MISSION EN COURS DE L'AGENT ─── */}
      {(segmentActif || segmentEnPause) && (
        <div className={`relative overflow-hidden rounded-2xl border-2 p-5 ${
          segmentEnPause
            ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-rose-500/10'
            : 'border-red-500/50 bg-gradient-to-br from-red-500/10 to-rose-500/10'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${segmentEnPause ? 'bg-amber-500/20' : 'bg-red-500/20'}`}>
                {segmentEnPause ? <Pause className="h-5 w-5 text-amber-300" /> : <HeartPulse className="h-5 w-5 text-red-300" />}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase tracking-wider text-red-300 font-semibold">
                    {segmentEnPause ? 'Mission en pause' : 'Mission en cours'}
                  </span>
                  {(segmentActif || segmentEnPause)?.medevac_total_segments && (
                    <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-200 text-xs font-bold border border-red-500/30">
                      Segment {(segmentActif || segmentEnPause)!.medevac_segment_index}/{(segmentActif || segmentEnPause)!.medevac_total_segments}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-bold text-white">{(segmentActif || segmentEnPause)!.numero_vol}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono text-sky-300">{(segmentActif || segmentEnPause)!.aeroport_depart}</span>
                  <ArrowRight className="h-3 w-3 text-slate-500" />
                  <span className="font-mono text-emerald-300">{(segmentActif || segmentEnPause)!.aeroport_arrivee}</span>
                  {segmentSuivant && (
                    <>
                      <span className="text-slate-500 mx-1">→ Suivant :</span>
                      <span className="font-mono text-red-300">{segmentSuivant.aeroport_depart}</span>
                      <ArrowRight className="h-3 w-3 text-slate-500" />
                      <span className="font-mono text-red-300">{segmentSuivant.aeroport_arrivee}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {segmentActif && (
                <Link
                  href={`/siavi/plan/${segmentActif.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
                >
                  <Eye className="h-4 w-4" />
                  Voir le vol
                </Link>
              )}
              {segmentSuivant && (
                <Link
                  href={`/logbook/plans-vol/${segmentSuivant.id}/reprendre`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
                >
                  <ArrowRight className="h-4 w-4" />
                  Reprendre la mission
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── DASHBOARD STATS ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Missions ce mois */}
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 hover:border-red-500/50 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <HeartPulse className="h-4 w-4 text-red-300" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">Ce mois</span>
          </div>
          <div className="text-3xl font-bold text-slate-100 mb-0.5">{rapportsMois ?? 0}</div>
          <div className="text-xs text-slate-400">
            <span className="text-red-300">{missionsTotales ?? 0}</span> mission{(missionsTotales ?? 0) > 1 ? 's' : ''} au total
          </div>
        </div>

        {/* Compte SIAVI */}
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 hover:border-emerald-500/50 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Landmark className="h-4 w-4 text-emerald-300" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">Trésorerie</span>
          </div>
          <div className="text-3xl font-bold text-emerald-200 mb-0.5">
            {siaviCompte?.solde != null ? `${Number(siaviCompte.solde).toLocaleString('fr-FR')}` : '—'}
            <span className="text-base text-slate-400 ml-1">F$</span>
          </div>
          <div className="text-xs text-slate-500 truncate font-mono">
            {siaviCompte?.vban || 'Compte SIAVI'}
          </div>
        </div>

        {/* Flotte */}
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 hover:border-sky-500/50 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-sky-500/20">
              <Plane className="h-4 w-4 text-sky-300" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">Flotte</span>
          </div>
          <div className="text-3xl font-bold text-slate-100 mb-0.5">{totalFlotte}</div>
          <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              {flotteCount.ground}
            </span>
            <span className="inline-flex items-center gap-1 text-sky-300">
              <Plane className="h-3 w-3" />
              {flotteCount.in_flight}
            </span>
            {flotteCount.bloque > 0 && (
              <span className="inline-flex items-center gap-1 text-red-300">
                <AlertCircle className="h-3 w-3" />
                {flotteCount.bloque}
              </span>
            )}
            {flotteCount.autre > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Wrench className="h-3 w-3" />
                {flotteCount.autre}
              </span>
            )}
          </div>
        </div>

        {/* Activité globale */}
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-4 hover:border-purple-500/50 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Activity className="h-4 w-4 text-purple-300" />
            </div>
            <span className="text-xs text-slate-400 uppercase tracking-wider">En ligne</span>
          </div>
          <div className="text-3xl font-bold text-slate-100 mb-0.5">
            {totalAfisEnService + totalAtcEnService}
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-red-300">
              <Flame className="h-3 w-3" />
              {totalAfisEnService} AFIS
            </span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 text-sky-300">
              <Radio className="h-3 w-3" />
              {totalAtcEnService} ATC
            </span>
          </div>
        </div>
      </div>

      {/* ─── STATUT DE SERVICE ─── */}
      {!session ? (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-amber-600/5 p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/20 shrink-0">
              <AlertTriangle className="h-6 w-6 text-amber-300" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-amber-100 mb-1">Hors service</h2>
              <p className="text-amber-200/80 text-sm mb-4">
                Sélectionnez un aéroport pour prendre la surveillance AFIS.
              </p>
              <SeMettreEnServiceSiaviForm />
            </div>
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border p-5 ${
          session.est_afis
            ? 'border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-emerald-600/5'
            : 'border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-amber-600/5'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className={`p-3 rounded-xl ${session.est_afis ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                  <Shield className={`h-6 w-6 ${session.est_afis ? 'text-emerald-300' : 'text-amber-300'}`} />
                </div>
                {session.est_afis && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse border-2 border-slate-900" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-white font-mono">{session.aeroport}</span>
                  {session.est_afis ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold border border-emerald-500/30">
                      AFIS
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 text-xs font-bold border border-amber-500/30">
                      POMPIER
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3.5 w-3.5" />
                  En service depuis {formatDistanceToNow(new Date(session.started_at), { locale: fr })}
                </p>
              </div>
            </div>
            <HorsServiceSiaviButton />
          </div>
          
          {!session.est_afis && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-amber-200 text-sm">
                <strong className="font-semibold">Mode Pompier :</strong> Un contrôleur ATC est en ligne sur cet aéroport.
                Téléphone utilisable, fonctions AFIS désactivées.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── ACTIONS RAPIDES ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          href="/siavi/medevac/nouveau"
          className="group relative overflow-hidden rounded-xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-rose-600/10 hover:border-red-500 hover:from-red-500/20 hover:to-rose-600/20 p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-500/20 group-hover:bg-red-500/30 transition-colors shrink-0">
              <HeartPulse className="h-5 w-5 text-red-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-white">Nouveau MEDEVAC</h3>
              <p className="text-xs text-slate-400 truncate">Déposer un vol d&apos;évacuation</p>
            </div>
          </div>
        </Link>

        <Link
          href="/siavi/flotte"
          className="group relative overflow-hidden rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-blue-600/10 hover:border-sky-500 hover:from-sky-500/20 hover:to-blue-600/20 p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-500/20 group-hover:bg-sky-500/30 transition-colors shrink-0">
              <Plane className="h-5 w-5 text-sky-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-white">Flotte SIAVI</h3>
              <p className="text-xs text-slate-400 truncate">Appareils & hubs</p>
            </div>
          </div>
        </Link>

        <Link
          href="/siavi/rapports"
          className="group relative overflow-hidden rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-indigo-600/10 hover:border-purple-500 hover:from-purple-500/20 hover:to-indigo-600/20 p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors shrink-0">
              <ClipboardList className="h-5 w-5 text-purple-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-white">Rapports</h3>
              <p className="text-xs text-slate-400 truncate">Missions archivées</p>
            </div>
          </div>
        </Link>

        <Link
          href="/siavi/felitz-bank"
          className="group relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-teal-600/10 hover:border-emerald-500 hover:from-emerald-500/20 hover:to-teal-600/20 p-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors shrink-0">
              <Landmark className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-white">Banque Felitz</h3>
              <p className="text-xs text-slate-400 truncate">Comptes & transactions</p>
            </div>
          </div>
        </Link>
      </div>

      {/* ─── GRID 2 COLONNES : VOLS SURVEILLÉS + DERNIÈRES MISSIONS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vols sous surveillance AFIS */}
        {session?.est_afis && (
          <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-800/40">
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Eye className="h-4 w-4 text-red-400" />
                Vols sous surveillance
                <span className="text-sm font-normal text-slate-400">({plansSurveilles.length})</span>
              </h2>
            </div>
            {plansSurveilles.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Plane className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Aucun vol sous votre surveillance</p>
                <p className="text-slate-500 text-xs mt-1">Prenez un vol en autosurveillance depuis la barre latérale</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/30">
                {plansSurveilles.map((p) => {
                  const config = STATUT_CONFIG[p.statut] || { label: p.statut.toUpperCase(), color: 'text-slate-300', bgColor: 'bg-slate-500/20 border border-slate-500/30' };
                  return (
                    <Link key={p.id} href={`/siavi/plan/${p.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-slate-800/50 transition-colors group">
                      <div className={`px-2 py-1 rounded font-mono text-xs font-bold ${config.bgColor} ${config.color}`}>
                        {config.label}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-100 font-mono text-sm">{p.numero_vol}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">{p.type_vol}</span>
                          {p.medevac_total_segments && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-200 border border-red-500/30">
                              {p.medevac_segment_index}/{p.medevac_total_segments}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <span className="font-mono text-sky-300">{p.aeroport_depart}</span>
                          <ArrowRight className="h-3 w-3 text-slate-500" />
                          <span className="font-mono text-emerald-300">{p.aeroport_arrivee}</span>
                          {p.temps_prev_min && (
                            <span className="ml-1 text-slate-500">· {p.temps_prev_min} min</span>
                          )}
                          {p.pilote?.identifiant && (
                            <span className="ml-1 text-slate-500 truncate">· {p.pilote.identifiant}</span>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-red-400 transition-colors" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Dernières missions MEDEVAC */}
        <div className={`rounded-xl bg-slate-800/30 border border-slate-700/50 overflow-hidden ${!session?.est_afis ? 'lg:col-span-2' : ''}`}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-800/40">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-400" />
              Dernières missions MEDEVAC
              <span className="text-sm font-normal text-slate-400">({(derniersRapports || []).length})</span>
            </h2>
            <Link href="/siavi/rapports" className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1">
              Tout voir <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {(!derniersRapports || derniersRapports.length === 0) ? (
            <div className="text-center py-10 px-4">
              <HeartPulse className="h-10 w-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Aucun rapport MEDEVAC pour l&apos;instant</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/30">
              {derniersRapports.map((r) => {
                const pv = r.plan_vol as { numero_vol?: string; aeroport_depart?: string; aeroport_arrivee?: string } | null;
                return (
                  <Link key={r.id} href={`/siavi/rapports/${r.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-slate-800/50 transition-colors group">
                    <div className="px-2 py-1 rounded font-mono text-xs font-bold bg-red-500/20 text-red-200 border border-red-500/30 min-w-[54px] text-center">
                      #{r.numero_mission}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-100 font-mono text-sm">{pv?.numero_vol || '—'}</span>
                        <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(r.date_mission).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                        <span className="font-mono text-sky-300">{pv?.aeroport_depart || '—'}</span>
                        <ArrowRight className="h-3 w-3 text-slate-500" />
                        <span className="font-mono text-emerald-300">{pv?.aeroport_arrivee || '—'}</span>
                        <span className="mx-1 text-slate-600">·</span>
                        <span className="text-slate-500 truncate">{r.commander}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── POSITIONS EN SERVICE (groupées par aéroport) ─── */}
      <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-800/40">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-400" />
            Positions en service
            <span className="text-sm font-normal text-slate-400">({aeroportsActifs.length} aéroport{aeroportsActifs.length > 1 ? 's' : ''})</span>
          </h2>
        </div>
        {aeroportsActifs.length === 0 ? (
          <div className="text-center py-10 px-4">
            <Flame className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Aucun agent en service</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 p-4">
            {aeroportsActifs.map(([aeroport, { afis, atc }]) => {
              const hasAfisActif = afis.some(a => a.est_afis);
              const hasPompier = afis.some(a => !a.est_afis);
              return (
                <div key={aeroport} className="rounded-lg bg-slate-900/40 border border-slate-700/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold text-white font-mono">{aeroport}</span>
                    <div className="flex items-center gap-1">
                      {hasAfisActif && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="AFIS actif" />}
                      {hasPompier && <span className="w-2 h-2 rounded-full bg-amber-400" title="Pompier" />}
                      {atc.length > 0 && <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" title="ATC actif" />}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {afis.map((sess, idx) => (
                      <div key={`afis-${idx}`} className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <Flame className={`h-3 w-3 ${sess.est_afis ? 'text-emerald-400' : 'text-amber-400'}`} />
                          <span className={sess.est_afis ? 'text-emerald-200 font-medium' : 'text-amber-200 font-medium'}>
                            {sess.est_afis ? 'AFIS' : 'Pompier'}
                          </span>
                        </span>
                        <span className="text-slate-400 truncate max-w-[100px]" title={sess.profiles?.identifiant || ''}>
                          {sess.profiles?.identifiant || '—'}
                        </span>
                      </div>
                    ))}
                    {atc.map((sess, idx) => (
                      <div key={`atc-${idx}`} className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <Radio className="h-3 w-3 text-sky-400" />
                          <span className="text-sky-200 font-medium">{sess.position}</span>
                        </span>
                        <span className="text-slate-400 truncate max-w-[100px]" title={sess.profiles?.identifiant || ''}>
                          {sess.profiles?.identifiant || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── INFOBULLE FOOTER ─── */}
      <p className="text-xs text-slate-500 text-center">
        <TrendingUp className="inline h-3 w-3 mr-1" />
        Le solde SIAVI est alimenté à chaque mission MEDEVAC clôturée. Plus un vol est ponctuel, plus le revenu est élevé.
      </p>
    </div>
  );
}
