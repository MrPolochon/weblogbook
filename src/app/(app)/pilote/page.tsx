import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, BookOpen, CalendarDays, CheckCheck, CircleAlert, Clock3, FileCheck2, Gauge, Landmark, Map, Plane, Radio, ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatDuree } from '@/lib/utils';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import MajorEventBanner from '@/components/MajorEventBanner';
import PilotUtcClock from '@/components/pilot/PilotUtcClock';
import { loadUnrecordedClosedPlans } from '@/lib/logbook-registration';

type Summary = { total: number; validated: number; pending: number; refused: number; minutes: number };
type ActivePlan = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string; statut: string; created_at: string; temps_prev_min: number; pilote_id: string; deroutement_at: string | null };
const statuses: Record<string, { label: string; detail: string; tone: string }> = {
  depose: { label: 'Déposé', detail: 'Suivre le traitement du plan.', tone: 'text-slate-300 border-slate-600' },
  en_attente: { label: 'En attente ATC', detail: 'Consulter le statut avant le départ.', tone: 'text-amber-200 border-amber-800' },
  en_attente_copilote: { label: 'Confirmation copilote', detail: 'L’équipage doit confirmer le plan.', tone: 'text-amber-200 border-amber-800' },
  accepte: { label: 'Accepté', detail: 'Consulter les instructions et préparer le départ.', tone: 'text-emerald-200 border-emerald-800' },
  en_cours: { label: 'En cours', detail: 'Suivre le vol et préparer sa clôture à l’arrivée.', tone: 'text-sky-200 border-sky-800' },
  automonitoring: { label: 'Autosurveillance', detail: 'Vol suivi sans prise en charge ATC.', tone: 'text-sky-200 border-sky-800' },
  en_attente_cloture: { label: 'Clôture demandée', detail: 'La clôture est en cours de traitement.', tone: 'text-amber-200 border-amber-800' },
  en_pause: { label: 'Mission en pause', detail: 'Consulter les conditions de reprise.', tone: 'text-amber-200 border-amber-800' },
};
const resources = [
  { href: '/carte-atc', title: 'Réseau et contrôle', text: 'Consulter les positions ATC sur la carte ODW.', icon: Radio },
  { href: '/notams', title: 'NOTAMs', text: 'Vérifier les restrictions avant le départ.', icon: ScrollText },
  { href: '/perf-ptfs', title: 'Performances', text: 'Préparer les paramètres de votre appareil.', icon: Gauge },
  { href: '/app/calendrier', title: 'Calendrier', text: 'Événements et réservations de créneaux.', icon: CalendarDays },
  { href: '/documents', title: 'Documentation', text: 'Retrouver les procédures et publications.', icon: BookOpen },
  { href: '/messagerie', title: 'Messages et règlements', text: 'Consulter vos échanges et les chèques reçus.', icon: FileCheck2 },
];

export default async function PilotDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const [profileResult, summaryResult, plansResult, balanceResult, closedResult] = await Promise.all([
    supabase.from('profiles').select('identifiant, heures_initiales_minutes, blocked_until').eq('id', user.id).maybeSingle(),
    admin.rpc('logbook_summary', { p_user_id: user.id }),
    admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, statut, created_at, temps_prev_min, pilote_id, deroutement_at', { count: 'exact' })
      .or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id}`)
      .in('statut', Object.keys(statuses)).order('created_at', { ascending: false }).limit(6),
    admin.from('felitz_comptes').select('solde').eq('proprietaire_id', user.id).eq('type', 'personnel').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    loadUnrecordedClosedPlans(admin, user.id, 1),
  ]);
  const summary = summaryResult.error ? null : summaryResult.data as Summary | null;
  const plans = (plansResult.data ?? []) as ActivePlan[];
  const initial = Number(profileResult.data?.heures_initiales_minutes ?? 0);
  const totalMinutes = summary ? initial + Number(summary.minutes) : null;
  const blocked = profileResult.data?.blocked_until && new Date(profileResult.data.blocked_until) > new Date();
  const partialError = [profileResult, summaryResult, plansResult, balanceResult, closedResult].some(r => r.error);
  const money = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value) + ' F$';

  return <div className="space-y-6">
    <MajorEventBanner />
    <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-700/70 pb-6">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">PTFS · Opérations pilotes</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Salle de préparation du vol</h1>
        <p className="mt-2 text-sm text-slate-400">{profileResult.data?.identifiant ? `${profileResult.data.identifiant} · ` : ''}Votre situation, vos vols et vos prochaines actions.</p>
      </div><PilotUtcClock />
    </header>
    {partialError && <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-100"><CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0"/><p>Certaines données sont indisponibles. Vos vols et votre solde ne sont pas remis à zéro. <Link href="/pilote" className="font-semibold underline">Réessayer</Link></p></div>}
    {blocked && <div role="alert" className="rounded-lg border border-red-800/60 bg-red-950/20 p-4 text-sm text-red-200">Votre compte est temporairement bloqué. Consultez <Link href="/compte" className="underline">votre compte</Link> avant de préparer un nouveau vol.</div>}
    <section aria-label="Situation du pilote" className="grid gap-3 sm:grid-cols-3">
      <DashboardMetric label="Temps de vol validé" value={summary && !profileResult.error && totalMinutes !== null ? formatDuree(totalMinutes) : 'Indisponible'} detail="Vols validés et heures initiales" icon={Clock3}/>
      <DashboardMetric label="Carnet de vol" value={summary ? `${summary.validated} vol${summary.validated > 1 ? 's' : ''} validé${summary.validated > 1 ? 's' : ''}` : 'Indisponible'} detail={summary ? `${summary.pending} en attente de validation · historique complet` : 'Consulter le carnet pour réessayer'} icon={CheckCheck}/>
      <DashboardMetric label="Compte personnel" value={balanceResult.error ? 'Indisponible' : balanceResult.data ? money(Number(balanceResult.data.solde)) : 'Aucun compte'} detail="Solde Felitz Bank · hors chèques non encaissés" icon={Landmark}/>
    </section>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <section aria-labelledby="pilot-operations-title" className="overflow-hidden rounded-lg border border-slate-700/70 bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/70 px-5 py-4"><div><h2 id="pilot-operations-title" className="font-semibold text-slate-100">Plans de vol ouverts</h2><p className="mt-1 text-xs text-slate-500">{plansResult.error ? 'Chargement indisponible' : `${plansResult.count ?? 0} plan(s) · affichage des six plus récents`}</p></div><Link href="/logbook/plans-vol" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-sky-300">Tous les plans <ArrowRight aria-hidden className="h-4 w-4"/></Link></div>
        {plansResult.error ? <p className="p-5 text-sm text-amber-200">Impossible de charger vos plans. <Link href="/logbook/plans-vol" className="underline">Ouvrir les opérations</Link></p> : plans.length === 0 ? <div className="p-6"><Plane aria-hidden className="mb-3 h-6 w-6 text-slate-500"/><h3 className="font-medium text-slate-200">Aucun plan de vol ouvert</h3><p className="mt-1 text-sm text-slate-400">Préparez une route et un appareil, puis déposez votre plan.</p><Link href="/logbook/depot-plan-vol" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500">Préparer un vol <ArrowRight aria-hidden className="h-4 w-4"/></Link></div> : <ul className="divide-y divide-slate-800">{plans.map(plan => {
          const state = statuses[plan.statut];
          return <li key={plan.id} className="px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500">{plan.numero_vol} · {plan.pilote_id === user.id ? 'Commandant de bord' : 'Copilote'}</p><p className="mt-1 flex items-center gap-3 font-mono text-lg font-semibold text-slate-100">{plan.aeroport_depart}<ArrowRight aria-hidden className="h-4 w-4 text-slate-500"/>{plan.aeroport_arrivee}</p></div><span className={`rounded border px-2.5 py-1 text-xs font-medium ${plan.deroutement_at ? 'border-orange-700 text-orange-200' : state.tone}`}>{plan.deroutement_at ? 'Déroutement · ' : ''}{state.label}</span></div><p className="mt-2 text-xs text-slate-400">{state.detail} · Durée prévue : {formatDuree(plan.temps_prev_min)} · Déposé le {formatDateMediumUTC(plan.created_at)} à {formatTimeUTC(plan.created_at)} UTC</p></li>;
        })}</ul>}
      </section>
      <aside aria-labelledby="pilot-follow-up" className="space-y-3"><h2 id="pilot-follow-up" className="text-xs font-semibold uppercase tracking-wider text-slate-500">Suivi administratif</h2>
        <FollowUp href="/logbook/nouveau" title="Enregistrer les vols terminés" description={closedResult.error ? 'Vérifier les vols à ajouter au carnet.' : closedResult.count ? `${closedResult.count} plan(s) clôturé(s) à enregistrer dans le carnet.` : 'Après la clôture, enregistrer le vol dans le carnet.'}/>
        <FollowUp href="/logbook/a-confirmer" title="Vérifier les confirmations" description="Relire les vols et invitations d’équipage qui attendent votre accord."/>
        <FollowUp href="/felitz-bank" title="Consulter les règlements" description="Vérifier votre compte et les paiements reçus."/>
      </aside>
    </div>
    <section aria-labelledby="pilot-resources"><div className="mb-4 flex items-center gap-2"><Map aria-hidden className="h-4 w-4 text-slate-500"/><h2 id="pilot-resources" className="font-semibold text-slate-100">Préparation et ressources</h2></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{resources.map(({ href, title, text, icon: Icon }) => <Link key={href} href={href} className="group flex min-h-28 gap-3 rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 transition-colors hover:border-slate-500 hover:bg-slate-900"><Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-slate-400"/><div><h3 className="text-sm font-semibold text-slate-200 group-hover:text-white">{title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-400">{text}</p></div></Link>)}</div></section>
  </div>;
}

function DashboardMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Plane }) {
  return <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-slate-400">{label}</p><Icon aria-hidden className="h-4 w-4 text-slate-500"/></div><p className="mt-3 text-xl font-semibold tabular-nums text-slate-100">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>;
}
function FollowUp({ href, title, description }: { href: string; title: string; description: string }) {
  return <Link href={href} className="block rounded-lg border border-slate-700/70 bg-slate-900/40 p-4 transition-colors hover:border-slate-500"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold text-slate-200">{title}</h3><ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-slate-500"/></div><p className="mt-2 text-xs leading-relaxed text-slate-400">{description}</p></Link>;
}
