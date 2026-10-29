import LogbookOverview from '@/components/logbook/LogbookOverview';
import LogbookPagination from '@/components/logbook/LogbookPagination';
import MajorEventBanner from '@/components/MajorEventBanner';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { formatDuree } from '@/lib/utils';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { Plus, BookOpen, Plane, CheckCircle2, XCircle, Timer, ArrowRight, ChevronRight, Search, SlidersHorizontal, Layers } from 'lucide-react';
import VolDeleteButton from '@/components/VolDeleteButton';
import ExportLogbookButton from './ExportLogbookButton';
import { StatusBadge } from '@/components/StatusBadge';
import type { StatusBadgeConfig } from '@/components/StatusBadge';
import { countChequesAEncaisser } from '@/lib/felitz/cheques-count';

const VOL_STATUT_MAP: Record<string, StatusBadgeConfig> = {
  'validé': { label: 'Validé', className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25', icon: <CheckCircle2 className="h-3 w-3" /> },
  'refusé': { label: 'Refusé', className: 'bg-red-500/15 text-red-400 border border-red-500/25', icon: <XCircle className="h-3 w-3" /> },
  'en_attente': { label: 'À valider', className: 'bg-amber-500/15 text-amber-400 border border-amber-500/25', icon: <Timer className="h-3 w-3" /> },
};

export default async function LogbookPage({ searchParams: searchParamsPromise }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await searchParamsPromise;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const param = (key: string) => typeof searchParams[key] === 'string' ? searchParams[key] as string : '';
  const registrationNotice = param('enregistrement');
  const page = Math.min(10000, Math.max(1, Math.floor(Number(param('page')) || 1)));
  const status = ['validé', 'en_attente', 'refusé'].includes(param('statut')) ? param('statut') : '';
  const search = param('q').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().slice(0, 60);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(param('date')) && !Number.isNaN(Date.parse(param('date'))) ? param('date') : '';
  let flightsQuery = admin.from('vols').select(`
      id, pilote_id, copilote_id, instructeur_id, duree_minutes, depart_utc, arrivee_utc, statut, compagnie_libelle, type_vol, role_pilote, callsign,
      aeroport_depart, aeroport_arrivee, instruction_type,
      refusal_count, refusal_reason,
      type_avion:types_avion(nom, constructeur),
      instructeur:profiles!vols_instructeur_id_fkey(identifiant),
      pilote:profiles!vols_pilote_id_fkey(identifiant),
      copilote:profiles!vols_copilote_id_fkey(id,identifiant)
    `, { count: 'exact' }).or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id},instructeur_id.eq.${user.id}`).neq('type_vol', 'Vol militaire').in('statut', ['en_attente', 'validé', 'refusé']);
  if (status) flightsQuery = flightsQuery.eq('statut', status);
  if (date) flightsQuery = flightsQuery.gte('depart_utc', date + 'T00:00:00Z');
  if (search) flightsQuery = flightsQuery.or(`callsign.ilike.%${search}%,compagnie_libelle.ilike.%${search}%,aeroport_depart.ilike.%${search}%,aeroport_arrivee.ilike.%${search}%`);
  const summaryPromise = admin.rpc('logbook_summary', { p_user_id: user.id });
  // Profile + bounded flight data in a single parallel batch
  const [{ data: profile, error: profileError }, { data: vols, count: filteredCount, error: flightsError }, { data: volsEnAttentePilote }, { data: volsEnAttenteCopilote }, { data: volsEnAttenteInstructeur }, { data: plansActifs, error: activePlansError }, chequesAEncaisser, summaryResult] = await Promise.all([
    supabase.from('profiles').select('heures_initiales_minutes, blocked_until, role').eq('id', user.id).single(),
    flightsQuery.order('depart_utc', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 30, page * 30 - 1),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, pilote:profiles!vols_pilote_id_fkey(identifiant)').eq('copilote_id', user.id).eq('statut', 'en_attente_confirmation_pilote').order('depart_utc', { ascending: false }),
    supabase.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, copilote:profiles!vols_copilote_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_copilote').order('depart_utc', { ascending: false }),
    admin.from('vols').select('id, depart_utc, aeroport_depart, aeroport_arrivee, instructeur:profiles!vols_instructeur_id_fkey(identifiant)').eq('pilote_id', user.id).eq('statut', 'en_attente_confirmation_instructeur').order('depart_utc', { ascending: false }),
    admin.from('plans_vol').select('id, numero_vol, statut, code_transpondeur').or(`pilote_id.eq.${user.id},copilote_id.eq.${user.id}`).in('statut', ['depose', 'en_attente', 'en_attente_copilote', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'en_pause', 'planifie_suivant']).order('created_at', { ascending: false }).limit(8),
    countChequesAEncaisser(admin, user.id),
    summaryPromise,
  ]);

  const isAdmin = profile?.role === 'admin';

  const blocked = profile?.blocked_until
    ? new Date(profile.blocked_until) > new Date()
    : false;

  const summary = summaryResult.data as { total: number; validated: number; pending: number; refused: number; minutes: number; types: string[] } | null;
  const summaryUnavailable = Boolean(summaryResult.error || profileError) || summary === null;
  const totalValides = summary?.validated ?? 0;
  const totalMinutes = (profile?.heures_initiales_minutes ?? 0) + (summary?.minutes ?? 0);
  const heures = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const typesVolUniques = (summary?.types ?? []).filter(Boolean).sort();
  const pageCount = Math.max(1, Math.ceil((filteredCount ?? 0) / 30));
  const activeFilters = Boolean(search || status || date);
  const pageUrl = (target: number) => '/logbook?' + new URLSearchParams({ page: String(target), q: search, statut: status, date }).toString();

  return (
    <div className="space-y-6">
      <MajorEventBanner />
      {['transmis', 'existant'].includes(registrationNotice) && <p role="status" className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-4 text-sm text-emerald-100">{registrationNotice === 'existant' ? 'Ce vol était déjà enregistré dans votre carnet. Aucune nouvelle ligne n’a été créée.' : 'Votre vol est enregistré dans le carnet.'} La validation du staff est une étape distincte : ne transmettez pas de nouveau un vol en attente.</p>}
      <header className="rounded-xl border border-slate-700 bg-slate-900 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-sky-400">Registre personnel · Aviation civile</p><h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Carnet de vol</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">Consultez votre activité, vérifiez les validations et conservez une trace de chaque vol.</p></div>
          <ExportLogbookButton typesVolDisponibles={typesVolUniques} />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-400">{summaryUnavailable ? 'Totaux temporairement indisponibles' : <>{totalValides} vols validés · {heures} h {minutes.toString().padStart(2, '0')} · carnet complet</>}<span className="ml-2 text-slate-500">Horaires UTC</span></p>
          {!blocked ? <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Link href="/logbook/nouveau" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-600 px-4 text-sm font-medium text-slate-200 hover:bg-slate-800"><Plus aria-hidden className="h-4 w-4"/> Enregistrer un vol effectué</Link>
            <Link href="/logbook/depot-plan-vol" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500"><Plane aria-hidden className="h-4 w-4"/> Préparer un vol</Link>
          </div> : <p className="text-sm text-amber-300">L’ajout de vols est temporairement suspendu pour votre compte.</p>}
        </div>
      </header>

      <LogbookNextAction
        blocked={blocked}
        unavailable={Boolean(activePlansError)}
        plansActifs={plansActifs ?? []}
        chequesAEncaisser={chequesAEncaisser}
      />

      <nav aria-label="Accès rapides du pilote" className="flex flex-wrap gap-2 text-sm">
        <a href="#historique" className="rounded-xl border border-sky-600/50 bg-sky-500/10 px-4 py-2.5 font-medium text-sky-200">Historique des vols</a>
        <Link href="/logbook/a-confirmer" className="rounded-xl border border-slate-700 px-4 py-2.5 text-slate-300 hover:bg-slate-800">Vols à confirmer <span className="ml-1 text-amber-300">{(volsEnAttentePilote?.length ?? 0) + (volsEnAttenteCopilote?.length ?? 0) + (volsEnAttenteInstructeur?.length ?? 0)}</span></Link>
        <Link href="/instruction" className="rounded-xl border border-slate-700 px-4 py-2.5 text-slate-300 hover:bg-slate-800">Formation</Link>
        <Link href="/messagerie" className="rounded-xl border border-slate-700 px-4 py-2.5 text-slate-300 hover:bg-slate-800">Chèques <span className="ml-1 text-emerald-300">{chequesAEncaisser}</span></Link>
      </nav>
      <div id="confirmations" />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h2 className="text-xs font-semibold uppercase tracking-[.18em] text-slate-400">Votre carnet en un regard</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><Layers className="h-3.5 w-3.5"/> Totaux du carnet complet</span>
      </div>
      {summaryUnavailable ? <p role="alert" className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-amber-200">Statistiques temporairement indisponibles. Aucun total ne peut être affiché pour le moment. <Link href={pageUrl(page)} className="underline">Réessayer</Link></p> : <LogbookOverview summary={summary!} initialMinutes={profile?.heures_initiales_minutes ?? 0}/>}

      {/* Historique civil : les confirmations sont suivies séparément. */}

      <section id="historique" aria-labelledby="historique-title" className="scroll-mt-24 rounded-2xl border border-slate-700/60 bg-slate-900 p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="historique-title" className="flex items-center gap-2 text-xl font-semibold text-slate-100"><BookOpen className="h-5 w-5 text-sky-400"/> Historique des vols</h2><p className="mt-1 text-sm text-slate-400">{activeFilters?'Résultats correspondant à vos filtres.':'Parcourez vos vols du plus récent au plus ancien.'}</p></div>
          {!flightsError&&<span className="rounded-full border border-slate-600/60 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200">{filteredCount ?? 0} {activeFilters?'résultats':'vols au total'}</span>}
        </div>
        <form className="grid gap-3 rounded-xl border border-slate-700/60 bg-slate-950/40 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" action="/logbook#historique">
          <label className="text-xs font-medium text-slate-400">Rechercher un vol<div className="relative mt-2"><Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input name="q" placeholder="Route, compagnie, callsign…" defaultValue={search} className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 pl-10 pr-3 text-sm text-slate-100 outline-none focus:border-sky-500"/></div></label>
          <label className="text-xs font-medium text-slate-400">Statut<select name="statut" defaultValue={status} className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-sky-500"><option value="">Tous les statuts</option><option value="validé">Validés</option><option value="en_attente">En attente</option><option value="refusé">Refusés</option></select></label>
          <label className="min-w-0 text-xs font-medium text-slate-400">Départ depuis le (UTC)<input name="date" type="date" defaultValue={date} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-sky-500"/></label>
          <div className="flex items-end gap-2"><button className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500"><SlidersHorizontal className="h-4 w-4"/> Filtrer</button>{activeFilters&&<Link href="/logbook#historique" className="inline-flex min-h-11 items-center px-2 text-xs text-slate-300 underline hover:text-white">Effacer</Link>}</div>
        </form>
        {!flightsError&&pageCount>1&&<div className="mt-4 flex gap-3 rounded-xl border border-sky-800/60 bg-sky-950/30 p-3 text-sm text-sky-100"><Layers aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sky-400"/><p><strong>{filteredCount} vols, {pageCount} pages.</strong> Jusqu’à 30 vols sont affichés par page. Utilisez les numéros pour consulter les vols plus anciens.</p></div>}
        {!flightsError&&<LogbookPagination page={page} total={filteredCount ?? 0} search={search} status={status} date={date} location="haut"/>}
        {flightsError || !vols ? <p role="alert" className="text-amber-300 py-8">Impossible de charger les vols pour le moment. Ce message ne signifie pas que votre carnet est vide. <Link href={pageUrl(page)} className="underline">Réessayer</Link></p> : vols.length === 0 && page > pageCount ? <p className="py-8 text-slate-300">Cette page ne contient plus de vols. <Link href={pageUrl(1)} className="underline text-sky-400">Revenir à la première page</Link></p> : vols.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-slate-800/60 border border-slate-700/60 mb-4">
              <Plane className="h-8 w-8 text-slate-500" />
            </div>
            <p className="text-slate-400 text-base font-medium">Aucun vol dans cette sélection</p>
            <p className="text-slate-500 text-sm mt-1">{search || status || date ? 'Essayez de retirer les filtres pour retrouver vos vols.' : 'Les vols à confirmer apparaissent dans la rubrique Confirmations.'}</p>
            <Link
              href={search || status || date ? '/logbook' : '/logbook/nouveau'}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
            >
              <Plus className="h-4 w-4" />
              {search || status || date ? 'Afficher tous mes vols' : 'Enregistrer un vol'}
            </Link>
          </div>
        ) : (
          <>
            {/* ── Vue MOBILE : cartes (sm et moins) ── */}
            <div className="mt-4 space-y-2 pb-2 sm:hidden">
              {vols.map((v) => {
                const ta = Array.isArray(v.type_avion) ? v.type_avion[0] : v.type_avion;
                const roleTxt = v.instructeur_id === user.id ? 'Instructeur' : (v.copilote_id === user.id || (Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.id === user.id) ? 'Co-pilote' : v.role_pilote;
                return (
                  <Link
                    key={v.id}
                    href={`/logbook/vol/${v.id}`}
                    className="flex items-center gap-3 rounded-xl bg-slate-950/35 border border-slate-700/60 hover:border-sky-500/40 hover:bg-slate-800/80 transition-colors p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs bg-slate-700/60 px-1.5 py-0.5 rounded text-slate-200 font-bold">{v.aeroport_depart || '—'}</span>
                        <ArrowRight className="h-3 w-3 text-slate-500 shrink-0" />
                        <span className="font-mono text-xs bg-slate-700/60 px-1.5 py-0.5 rounded text-slate-200 font-bold">{v.aeroport_arrivee || '—'}</span>
                        <StatusBadge status={v.statut} map={VOL_STATUT_MAP} className="ml-auto shrink-0" />
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-slate-400">{formatDateMediumUTC(v.depart_utc)}</span>
                        {(ta as { nom?: string })?.nom && <span className="text-xs text-slate-500 truncate">{(ta as { nom?: string }).nom}</span>}
                        {v.callsign && <span className="text-xs text-sky-400/70 font-mono">{v.callsign}</span>}
                        <span className="text-xs text-slate-500 font-mono ml-auto">{formatDuree(v.duree_minutes || 0)}</span>
                        {roleTxt && <span className="text-xs text-slate-600">{roleTxt}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-600 shrink-0" />
                  </Link>
                );
              })}
            </div>

            {/* ── Vue DESKTOP : tableau (sm+) ── */}
            <div className="hidden sm:block overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-600/50 bg-slate-800/20">
                    <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Date (UTC)</th>
                    <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Route</th>
                    <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Appareil</th>
                    <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Cie / Callsign</th>
                    <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Durée</th>
                    <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Type / Rôle</th>
                    <th className="pb-3 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Statut</th>
                    <th className="pb-3 w-10"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {vols.map((v) => (
                    <tr key={v.id}
                      className="group border-l-2 border-transparent odd:bg-slate-800/15 hover:border-sky-500/40 hover:bg-slate-800/35 transition-[background-color,border-color] duration-150 cursor-pointer">
                      <td className="py-3 pr-4">
                        <Link href={`/logbook/vol/${v.id}`} className="text-slate-300 group-hover:text-sky-300 font-medium transition-colors block">
                          {formatDateMediumUTC(v.depart_utc)}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <span className="font-mono text-xs bg-slate-700/50 px-1.5 py-0.5 rounded">{v.aeroport_depart || '—'}</span>
                          <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                          <span className="font-mono text-xs bg-slate-700/50 px-1.5 py-0.5 rounded">{v.aeroport_arrivee || '—'}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatTimeUTC(v.depart_utc)} — {v.arrivee_utc ? formatTimeUTC(v.arrivee_utc) : '—'}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-300 text-xs">
                        {(() => {
                          const ta = Array.isArray(v.type_avion) ? v.type_avion[0] : v.type_avion;
                          return (<>{(ta as { nom?: string })?.nom || '—'}{(ta as { constructeur?: string })?.constructeur && <span className="block text-slate-500 text-xs">{(ta as { constructeur?: string }).constructeur}</span>}</>);
                        })()}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-slate-300 text-xs">{v.compagnie_libelle || '—'}</span>
                        {v.callsign && <span className="block text-xs text-sky-400/70 font-mono">{v.callsign}</span>}
                      </td>
                      <td className="py-3 pr-4 text-slate-300 font-mono text-xs">{formatDuree(v.duree_minutes || 0)}</td>
                      <td className="py-3 pr-4">
                        <span className="text-slate-300 text-xs">{v.type_vol}</span>
                        <span className="block text-xs text-slate-500">
                          {v.instructeur_id === user.id ? 'Instructeur' : (v.copilote_id === user.id || (Array.isArray(v.copilote) ? v.copilote[0] : v.copilote)?.id === user.id) ? 'Co-pilote' : v.role_pilote}
                        </span>
                        {v.type_vol === 'Instruction' && (v.instructeur || v.instruction_type) && (
                          <span className="block text-xs text-slate-600 mt-0.5">
                            {(Array.isArray(v.instructeur) ? v.instructeur[0] : v.instructeur)?.identifiant ?? ''}{v.instruction_type ? ` · ${v.instruction_type}` : ''}
                          </span>
                        )}
                        {v.copilote_id && (() => {
                          const estPilote = v.pilote_id === user.id;
                          const autre = estPilote ? (Array.isArray(v.copilote) ? v.copilote[0] : v.copilote) : (Array.isArray(v.pilote) ? v.pilote[0] : v.pilote);
                          return <span className="block text-xs text-slate-600 mt-0.5">{estPilote ? 'Co: ' : 'PIC: '}{autre?.identifiant ?? '—'}</span>;
                        })()}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={v.statut} map={VOL_STATUT_MAP} />
                      </td>
                      <td className="py-3">
                        <VolDeleteButton volId={v.id} canDelete={isAdmin || (v.type_vol === 'Instruction' && v.instructeur_id ? v.instructeur_id === user.id : (v.pilote_id === user.id || v.copilote_id === user.id))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!flightsError&&pageCount>1&&<div className="mt-4 border-t border-slate-700/50"><LogbookPagination page={page} total={filteredCount ?? 0} search={search} status={status} date={date} location="bas"/></div>}
      </section>
    </div>
  );
}

function LogbookNextAction({
  blocked,
  unavailable,
  plansActifs,
  chequesAEncaisser,
}: {
  blocked: boolean;
  unavailable: boolean;
  plansActifs: Array<{ id: string; numero_vol: string; statut: string; code_transpondeur: string | null }>;
  chequesAEncaisser: number;
}) {
  const actif = plansActifs.find(p => p.statut === 'en_attente_cloture') ?? plansActifs.find(p => ['en_cours', 'automonitoring', 'accepte', 'en_pause'].includes(p.statut)) ?? plansActifs[0];
  let title = 'Prochaine action';
  let detail = 'Déposez un plan de vol pour commencer un vol.';
  let href = '/logbook/depot-plan-vol';
  let cta = 'Déposer un plan';

  if (blocked) {
    title = 'Compte bloqué';
    detail = 'Vous ne pouvez pas déposer de vol pour le moment.';
    href = '/messagerie';
    cta = 'Voir la messagerie';
  } else if (unavailable) {
    title = 'Suivi des plans indisponible';
    detail = 'Le suivi ne peut pas être chargé pour le moment. Consultez vos plans avant de déposer un nouveau vol.';
    href = '/logbook/plans-vol';
    cta = 'Consulter mes plans';
  } else if (actif?.statut === 'en_attente_cloture') {
    title = 'Clôture en attente';
    detail = `Le plan ${actif.numero_vol} attend la confirmation ATC. Le paiement n’est pas encore versé.`;
    href = '/logbook/plans-vol';
    cta = 'Voir le plan';
  } else if (actif && ['depose', 'en_attente'].includes(actif.statut) && !actif.code_transpondeur) {
    title = 'Transpondeur à régler';
    detail = `Plan ${actif.numero_vol} déposé — saisissez le code transpondeur avant le départ.`;
    href = '/logbook/plans-vol';
    cta = 'Ouvrir le transpondeur';
  } else if (actif?.statut === 'en_pause') {
    title = 'Vol en pause';
    detail = `Le plan ${actif.numero_vol} est en pause. Vérifiez les conditions de reprise avant de poursuivre.`;
    href = '/logbook/plans-vol';
    cta = 'Voir la reprise';
  } else if (actif?.statut === 'en_attente_copilote') {
    title = 'Accord du copilote attendu';
    detail = `L’équipage du plan ${actif.numero_vol} doit être confirmé avant la suite du dépôt.`;
    href = '/logbook/plans-vol';
    cta = 'Consulter le plan';
  } else if (actif && ['accepte', 'en_cours', 'automonitoring', 'depose', 'en_attente', 'planifie_suivant'].includes(actif.statut)) {
    title = ['accepte', 'en_cours', 'automonitoring'].includes(actif.statut) ? 'Plan de vol actif' : 'Plan de vol en préparation';
    detail = `Plan ${actif.numero_vol} à suivre. À l’arrivée, demandez la clôture depuis la page du plan.`;
    href = '/logbook/plans-vol';
    cta = 'Voir le plan';
  } else if (chequesAEncaisser > 0) {
    title = 'Chèques à encaisser';
    detail = `${chequesAEncaisser} chèque${chequesAEncaisser > 1 ? 's' : ''} en attente. Sans encaissement le solde Felitz reste inchangé.`;
    href = '/messagerie';
    cta = 'Encaisser';
  }

  return (
    <div className="rounded-xl border border-sky-800 bg-slate-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-sky-400 font-semibold">{title}</p>
        <p className="text-sm text-slate-200 mt-0.5">{detail}</p>
        <p className="text-[11px] text-slate-400 mt-1">Les missions MEDEVAC SIAVI n’apparaissent pas dans ce carnet : elles se clôturent via le rapport SIAVI.</p>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-500"
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
