'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, MapPin, Pause, Plane, Plus, RefreshCw, Route, Trash2 } from 'lucide-react';
import { AEROPORTS_VOL_CIVIL } from '@/lib/aeroports-ptfs';
import { isAvionCompagnieAuSol } from '@/lib/compagnie-utils';
import { fetchJson } from '@/lib/fetch-json';
import styles from './CompanyItineraries.module.css';

export type ItineraryLeg = {
  id: string; itinerary_id: string; leg_index: number; origin: string; destination: string;
  preparation: { aeroport_arrivee?: string; type_vol?: 'VFR' | 'IFR'; temps_prev_min?: number; intentions_vol?: string; sid_depart?: string; star_arrivee?: string; route_ifr?: string; niveau_croisiere?: string | number; heure_depart?: string };
  status: 'planned' | 'active' | 'completed' | 'cancelled'; plan_id: string | null; actual_destination?: string | null;
};
export type CommercialItinerary = {
  id: string; company_id: string; pilot_id: string; aircraft_id: string; flight_number: string;
  nature_transport: 'passagers' | 'cargo'; origin: string; destination: string;
  status: 'planned' | 'active' | 'paused' | 'completed' | 'cancelled' | 'diverted'; next_leg_index: number;
  legs: ItineraryLeg[]; can_resume?: boolean; can_cancel?: boolean;
};
export type ItineraryDetail = { itinerary: CommercialItinerary; legs: ItineraryLeg[]; next_leg: ItineraryLeg | null; current_plan_id: string | null };
type FleetAircraft = { id: string; immatriculation: string; aeroport_actuel: string; statut: string; usure_percent: number; detruit?: boolean; location_status?: string; types_avion?: { nom: string } | { nom: string }[] | null };
type LegDraft = { destination: string; minutes: string; rules: 'VFR' | 'IFR' };
const newLeg = (): LegDraft => ({ destination: '', minutes: '30', rules: 'VFR' });
const statuses = { planned: 'À préparer', active: 'Tronçon en cours', paused: 'En escale', completed: 'Terminé', cancelled: 'Annulé', diverted: 'Dérouté' };
const legStatuses = { planned: 'À venir', active: 'En cours', completed: 'Clôturé', cancelled: 'Annulé' };

export default function CompanyItineraries({ compagnieId, canManage, unlocked, companyCallsign = '' }: { compagnieId: string; canManage: boolean; unlocked: boolean; companyCallsign?: string }) {
  const [itineraries, setItineraries] = useState<CommercialItinerary[]>([]);
  const [aircraft, setAircraft] = useState<FleetAircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAircraft, setSelectedAircraft] = useState('');
  const [callsign, setCallsign] = useState(companyCallsign);
  const [nature, setNature] = useState<'passagers' | 'cargo'>('passagers');
  const [legs, setLegs] = useState<LegDraft[]>([newLeg(), newLeg()]);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [serverUnlocked, setServerUnlocked] = useState(true);
  const requestId = useRef<string | null>(null);
  const busyRef = useRef(false);
  const refreshGeneration = useRef(0);
  const endpoint = `/api/compagnies/${compagnieId}/itineraires`;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = ++refreshGeneration.current;
    const [result, fleet] = await Promise.all([
      fetchJson<{ unlocked: boolean; itineraries: CommercialItinerary[] }>(endpoint, { cache: 'no-store', signal }),
      fetchJson<FleetAircraft[]>(`/api/compagnies/avions?compagnie_id=${encodeURIComponent(compagnieId)}`, { cache: 'no-store', signal }),
    ]);
    if (signal?.aborted || generation !== refreshGeneration.current) return;
    setServerUnlocked(result.unlocked === true);
    setItineraries(result.itineraries ?? []);
    setAircraft(fleet ?? []);
  }, [compagnieId, endpoint]);

  useEffect(() => {
    if (!canManage || !unlocked) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Chargement impossible.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canManage, unlocked, refresh]);

  if (!canManage || !unlocked) return null;
  if (!serverUnlocked) return <p className={styles.empty}>La gestion des itinéraires sera disponible après la fin de la recherche Correspondances (RES-06).</p>;
  const reserved = new Set(itineraries.filter(item => ['planned', 'active', 'paused', 'diverted'].includes(item.status)).map(item => item.aircraft_id));
  const available = aircraft.filter(item => isAvionCompagnieAuSol(item.statut) && item.usure_percent > 0 && !item.detruit && item.location_status !== 'leased_out' && !reserved.has(item.id));
  const selected = available.find(item => item.id === selectedAircraft);
  const origin = selected?.aeroport_actuel ?? '';
  const route = [origin, ...legs.map(leg => leg.destination)];
  const updateLeg = (index: number, value: Partial<LegDraft>) => { setLegs(current => current.map((leg, i) => i === index ? { ...leg, ...value } : leg)); requestId.current = null; };

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    setError(''); setNotice('');
    if (!selected || !callsign.trim() || legs.some((leg, i) => !leg.destination || leg.destination === route[i] || !/^\d+$/.test(leg.minutes) || Number(leg.minutes) < 1 || Number(leg.minutes) > 1440)) {
      setError('Choisissez un appareil, un indicatif et 2 à 5 tronçons distincts, avec une durée de 1 à 1 440 minutes chacun.'); return;
    }
    busyRef.current = true; setBusy(true);
    requestId.current ??= crypto.randomUUID();
    try {
      await fetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        request_id: requestId.current, compagnie_avion_id: selectedAircraft, numero_vol: callsign.trim(), aeroport_depart: origin, nature_transport: nature,
        segments: legs.map(leg => ({ aeroport_arrivee: leg.destination, type_vol: leg.rules, temps_prev_min: Number(leg.minutes) })),
      }) });
      requestId.current = null;
      setShowCreate(false); setLegs([newLeg(), newLeg()]);
      setNotice('Itinéraire enregistré. Préparez son premier tronçon pour obtenir le chargement et vérifier le dépôt.');
      try { await refresh(); } catch { setError('Itinéraire enregistré. Actualisez la liste pour le retrouver.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Création impossible.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function cancel(id: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await fetchJson(`/api/itineraires/${id}/annuler`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setConfirmCancel(null); setNotice('Les tronçons restants ont été annulés.');
      try { await refresh(); } catch { setError('Annulation enregistrée. Actualisez la liste pour consulter son résultat.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Annulation impossible.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <section className={styles.itineraries} aria-labelledby="company-itineraries-title">
    <header className={styles.heading}><div><p className={styles.eyebrow}>Correspondances · RES-06</p><h3 id="company-itineraries-title"><Route aria-hidden className="h-5 w-5" /> Itinéraires avec escales</h3><p>Planifiez de 2 à 5 tronçons. À chaque escale, clôturez le vol puis préparez le départ suivant.</p></div><div className={styles.actions}><button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => { setError(''); void refresh().catch(e => setError(e instanceof Error ? e.message : 'Actualisation impossible.')); }}><RefreshCw aria-hidden className="h-4 w-4" />Actualiser les itinéraires</button><button type="button" className={styles.primary} disabled={busy || loading} onClick={() => { setShowCreate(current => !current); setError(''); }}><Plus aria-hidden className="h-4 w-4" />{showCreate ? 'Fermer la préparation' : 'Nouvel itinéraire'}</button></div></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.success}>{notice}</p>}
    {loading && <p role="status" className={styles.hint}>Chargement des itinéraires et de la flotte…</p>}
    {showCreate && <form className={styles.card} onSubmit={event => void create(event)}>
      <h4>Préparer le parcours</h4><p className={styles.hint}>L’enregistrement du parcours ne déclenche aucun paiement. L’appareil sera réservé jusqu’à la fin ou l’annulation du parcours. Chaque tronçon aura son propre chargement confirmé et son plan de vol.</p>
      <fieldset disabled={busy} className={styles.fields}>
        <label>Appareil<select aria-label="Appareil de l’itinéraire" required value={selectedAircraft} onChange={event => { setSelectedAircraft(event.target.value); requestId.current = null; }}><option value="">Choisir un appareil au sol</option>{available.map(item => <option key={item.id} value={item.id}>{item.immatriculation} · {item.aeroport_actuel}</option>)}</select></label>
        <label>Indicatif complet<input aria-label="Indicatif de l’itinéraire" required maxLength={20} value={callsign} onChange={event => { setCallsign(event.target.value.toUpperCase()); requestId.current = null; }} placeholder="AFR123" /></label>
        <label>Transport<select aria-label="Transport de l’itinéraire" value={nature} onChange={event => { setNature(event.target.value === 'cargo' ? 'cargo' : 'passagers'); requestId.current = null; }}><option value="passagers">Passagers</option><option value="cargo">Cargo</option></select></label>
        <label>Départ<input aria-label="Départ de l’itinéraire" readOnly value={origin} placeholder="Position de l’appareil" /></label>
      </fieldset>
      {!available.length && <p className={styles.hint}>Aucun appareil en état et au sol n’est disponible dans cette flotte.</p>}
      <ol className={styles.editorLegs}>{legs.map((leg, index) => <li key={index}>
        <div className={styles.legHeading}><h4>{index === legs.length - 1 ? 'Destination finale' : `Escale ${index + 1}`}</h4>{legs.length > 2 && <button type="button" disabled={busy} className={styles.secondary} aria-label={`Retirer le tronçon ${index + 1}`} onClick={() => { setLegs(current => current.filter((_, i) => i !== index)); requestId.current = null; }}><Trash2 aria-hidden className="h-4 w-4" />Retirer</button>}</div>
        <fieldset disabled={busy} className={styles.legFields}>
          <label>{route[index] || 'Départ à choisir'} →<select aria-label={`Destination du tronçon ${index + 1}`} value={leg.destination} required onChange={event => updateLeg(index, { destination: event.target.value })}><option value="">Choisir la destination</option>{AEROPORTS_VOL_CIVIL.filter(airport => airport.code !== route[index]).map(airport => <option key={airport.code} value={airport.code}>{airport.code} — {airport.nom}</option>)}</select></label>
          <label>Durée prévue (min)<input aria-label={`Durée du tronçon ${index + 1}`} type="number" inputMode="numeric" min={1} max={1440} step={1} required value={leg.minutes} onChange={event => updateLeg(index, { minutes: event.target.value })} /></label>
          <label>Règles de vol<select aria-label={`Règles du tronçon ${index + 1}`} value={leg.rules} onChange={event => updateLeg(index, { rules: event.target.value === 'IFR' ? 'IFR' : 'VFR' })}><option value="VFR">VFR · à vue</option><option value="IFR">IFR · instruments</option></select></label>
        </fieldset>
      </li>)}</ol>
      {legs.length < 5 && <button type="button" disabled={busy} className={styles.secondary} onClick={() => { setLegs(current => [...current.slice(0, -1), newLeg(), current[current.length - 1]]); requestId.current = null; }}><Plus aria-hidden className="h-4 w-4" />Ajouter une escale ({legs.length}/5 tronçons)</button>}
      <div className={styles.preview}><p className={styles.eyebrow}>Aperçu du parcours · {legs.length} tronçons</p><ol aria-label="Aperçu de la route">{route.map((airport, i) => <li key={i}>{i > 0 && <ArrowRight aria-hidden className="h-4 w-4" />}<span>{airport || '…'}<small>{i === 0 ? 'Départ' : i === route.length - 1 ? 'Arrivée finale' : `Escale ${i}`}</small></span></li>)}</ol></div>
      <p className={styles.hint}>Les horaires UTC, portes, intentions VFR ou procédures IFR et l’équipage seront vérifiés dans le formulaire de dépôt de chaque départ.</p>
      <button type="submit" disabled={busy || !selected} className={styles.primary}>{busy ? 'Enregistrement…' : 'Enregistrer l’itinéraire'}</button>
    </form>}
    {!loading && !itineraries.length && <p className={styles.empty}>Aucun itinéraire enregistré. Créez un parcours avec une ou plusieurs escales pour préparer les départs à votre rythme.</p>}
    <div className={styles.list}>{itineraries.map(itinerary => {
      const ordered = [...(itinerary.legs ?? [])].sort((a, b) => a.leg_index - b.leg_index);
      const next = ordered.find(leg => leg.leg_index === itinerary.next_leg_index && leg.status === 'planned') ?? ordered.find(leg => leg.status === 'planned');
      const active = ordered.find(leg => leg.status === 'active');
      const completed = ordered.filter(leg => leg.status === 'completed').length;
      const resumable = ['planned', 'paused'].includes(itinerary.status) && next && itinerary.can_resume === true;
      const canCancel = ['planned', 'paused', 'diverted'].includes(itinerary.status) && itinerary.can_cancel === true;
      return <article key={itinerary.id} className={styles.card}>
        <div className={styles.legHeading}><h4><Plane aria-hidden className="h-4 w-4" />{itinerary.flight_number} · {itinerary.origin} <ArrowRight aria-hidden className="h-4 w-4" /> {itinerary.destination}</h4><span className={styles.badge} data-status={itinerary.status}>{itinerary.status === 'paused' && <Pause aria-hidden className="h-3 w-3" />}{statuses[itinerary.status]}</span></div>
        <p className={styles.hint}>Destination finale : <strong>{itinerary.destination}</strong> · {completed}/{ordered.length} tronçons clôturés · {aircraft.find(item => item.id === itinerary.aircraft_id)?.immatriculation ?? 'Appareil affecté'} · {itinerary.nature_transport === 'cargo' ? 'Cargo' : 'Passagers'}</p>
        <ol className={styles.progress} aria-label={`Parcours de ${itinerary.flight_number}`}>{ordered.map(leg => <li key={leg.id} data-status={leg.status}><span className={styles.step}>{leg.status === 'completed' ? <Check aria-hidden className="h-3 w-3" /> : leg.leg_index}</span><div><span className={styles.airports}>{leg.origin} → {leg.destination}</span><p>{legStatuses[leg.status]} · {leg.preparation.type_vol ?? 'VFR'} · {leg.preparation.temps_prev_min ?? '—'} min{leg.actual_destination && leg.actual_destination !== leg.destination ? ` · Arrivée réelle : ${leg.actual_destination}` : ''}</p></div>{leg.plan_id && <Link href={`/logbook/plans-vol/${leg.plan_id}`} className={styles.planLink}>Voir le plan</Link>}</li>)}</ol>
        {itinerary.status === 'diverted' && <p className={styles.hint}>Le vol a été dérouté. Annulez les tronçons restants, puis créez un nouveau parcours depuis la position réelle de l’appareil.</p>}
        {itinerary.status === 'paused' && next && <p className={styles.hint}><MapPin aria-hidden className="inline h-3 w-3" /> Escale à {next.origin}. Prochain départ vers {next.destination}, arrivée finale {itinerary.destination}.</p>}
        <div className={styles.actions}>{resumable && <Link href={`/logbook/depot-plan-vol?itinerary=${encodeURIComponent(itinerary.id)}`} className={styles.primary}>Préparer le tronçon {next.leg_index} · {next.origin} → {next.destination}</Link>}{active?.plan_id && <Link href={`/logbook/plans-vol/${active.plan_id}`} className={styles.primary}>Suivre le tronçon en cours</Link>}{canCancel && <button type="button" disabled={busy} className={styles.secondary} onClick={() => setConfirmCancel(itinerary.id)}>Annuler les tronçons restants</button>}</div>
        {confirmCancel === itinerary.id && <div className={styles.confirmation} role="group" aria-label="Confirmer l’annulation de l’itinéraire"><p>Annuler les tronçons encore prévus pour {itinerary.flight_number} ? Les vols déjà clôturés resteront dans le suivi.</p><div className={styles.actions}><button type="button" disabled={busy} className={styles.primary} onClick={() => void cancel(itinerary.id)}>Confirmer l’annulation</button><button type="button" disabled={busy} className={styles.secondary} onClick={() => setConfirmCancel(null)}>Conserver le parcours</button></div></div>}
      </article>;
    })}</div>
  </section>;
}
