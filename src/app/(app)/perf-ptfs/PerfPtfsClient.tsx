'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  airportData,
  getAircraftData,
  getAirportData,
  getRunwayData,
} from '@/lib/ptfs-perf/utils';
import { getPerfTypeFromServerNom, getSupportedPerfTypes } from '@/lib/ptfs-perf/server-type-map';
import { calculateTakeoffPerformance } from '@/lib/ptfs-perf/takeoff';
import { calculateLandingPerformance } from '@/lib/ptfs-perf/landing';
import { Gauge, ChevronDown } from 'lucide-react';

const airportOptions = [...airportData].sort((a, b) => (a.name > b.name ? 1 : -1)).map((apt) => ({ value: apt.icao, label: `${apt.name} (${apt.icao})` }));

interface TypeAvionServer {
  id: string;
  nom: string;
  constructeur?: string | null;
  code_oaci?: string | null;
}

type TakeoffResult = ReturnType<typeof calculateTakeoffPerformance>;
type LandingResult = ReturnType<typeof calculateLandingPerformance>;

export default function PerfPtfsClient() {
  const [serverTypes, setServerTypes] = useState<TypeAvionServer[]>([]);
  const [toAircraft, setToAircraft] = useState('');
  const [toAirport, setToAirport] = useState('');
  const [toRunway, setToRunway] = useState('');
  const [toIntersection, setToIntersection] = useState('');
  const [toFlaps, setToFlaps] = useState('');
  const [ldgAircraft, setLdgAircraft] = useState('');
  const [ldgAirport, setLdgAirport] = useState('');
  const [ldgRunway, setLdgRunway] = useState('');
  const [ldgFlaps, setLdgFlaps] = useState('');
  const [ldgReversers, setLdgReversers] = useState('');
  const [toResult, setToResult] = useState<TakeoffResult | null>(null);
  const [ldgResult, setLdgResult] = useState<LandingResult | null>(null);
  const [toNoDataMessage, setToNoDataMessage] = useState<string | null>(null);
  const [ldgNoDataMessage, setLdgNoDataMessage] = useState<string | null>(null);
  const [toDetailsOpen, setToDetailsOpen] = useState(false);
  const [ldgDetailsOpen, setLdgDetailsOpen] = useState(false);

  useEffect(() => {
    fetch('/api/types-avion')
      .then((r) => r.json())
      .then((data: TypeAvionServer[] | { error?: string }) => {
        if (Array.isArray(data)) setServerTypes(data);
      })
      .catch(() => {});
  }, []);

  const aircraftOptions = useMemo(() => {
    return [...serverTypes]
      .sort((a, b) => (a.nom > b.nom ? 1 : -1))
      .map((t) => ({ value: t.nom, label: t.constructeur ? `${t.nom} (${t.constructeur})` : t.nom }));
  }, [serverTypes]);

  const toPerfType = useMemo(() => getPerfTypeFromServerNom(toAircraft), [toAircraft]);
  const ldgPerfType = useMemo(() => getPerfTypeFromServerNom(ldgAircraft), [ldgAircraft]);

  const toRunwayOptions = useMemo(() => {
    if (!toAirport) return [];
    const apt = getAirportData(toAirport);
    if (!apt) return [];
    return [...apt.runways].sort((a, b) => (a.heading > b.heading ? 1 : -1)).map((rwy) => ({ value: rwy.name, label: `RWY ${rwy.name} (${rwy.tora} ft)` }));
  }, [toAirport]);

  const toIntersectionOptions = useMemo(() => {
    if (!toAirport || !toRunway) return [];
    const apt = getAirportData(toAirport);
    if (!apt) return [];
    const rwy = getRunwayData(apt, toRunway);
    if (!rwy) return [];
    return [{ value: '', label: 'Pleine longueur' }, ...[...(rwy.intersections || [])].sort((a, b) => (a.shift > b.shift ? 1 : -1)).map((int) => ({ value: int.name, label: `Intersection ${int.name} (${rwy.tora - int.shift} ft)` }))];
  }, [toAirport, toRunway]);

  const toFlapsOptions = useMemo(() => {
    if (!toPerfType) return [];
    const acft = getAircraftData(toPerfType);
    if (!acft) return [];
    const maxFlaps = Math.max(...acft.flaps.map((f) => f.setting));
    return [{ value: '', label: 'Sans volets' }, ...acft.flaps.sort((a, b) => (a.setting > b.setting ? 1 : -1)).map((f) => ({ value: String(f.setting), label: f.name ? `${f.name} (${f.setting}/${maxFlaps})` : `Volets ${f.setting}/${maxFlaps}` }))];
  }, [toPerfType]);

  const ldgRunwayOptions = useMemo(() => {
    if (!ldgAirport) return [];
    const apt = getAirportData(ldgAirport);
    if (!apt) return [];
    return [...apt.runways].sort((a, b) => (a.heading > b.heading ? 1 : -1)).map((rwy) => ({ value: rwy.name, label: `RWY ${rwy.name} (${rwy.lda} ft)` }));
  }, [ldgAirport]);

  const ldgFlapsOptions = useMemo(() => {
    if (!ldgPerfType) return [];
    const acft = getAircraftData(ldgPerfType);
    if (!acft) return [];
    const maxFlaps = Math.max(...acft.flaps.map((f) => f.setting));
    return [{ value: '', label: 'Sans volets' }, ...acft.flaps.sort((a, b) => (a.setting > b.setting ? 1 : -1)).map((f) => ({ value: String(f.setting), label: f.name ? `${f.name} (${f.setting}/${maxFlaps})` : `Volets ${f.setting}/${maxFlaps}` }))];
  }, [ldgPerfType]);

  const ldgReversersOptions = useMemo(() => {
    if (!ldgPerfType) return [];
    const acft = getAircraftData(ldgPerfType);
    if (!acft) return [];
    const opts: { value: string; label: string }[] = [];
    if (acft.deceleration.idleReversers) opts.push({ value: 'idle-rev', label: 'Reverse idle' });
    if (acft.deceleration.maxReversers) opts.push({ value: 'max-rev', label: 'Reverse max' });
    return opts;
  }, [ldgPerfType]);

  const canCalculateTakeoff = Boolean(toAircraft && toAirport && toRunway);
  const canCalculateLanding = Boolean(ldgAircraft && ldgAirport && ldgRunway);

  const supportedList = getSupportedPerfTypes().join(', ');

  function onCalculateTakeoff() {
    if (!canCalculateTakeoff) return;
    setToNoDataMessage(null);
    if (!toPerfType) {
      setToResult(null);
      setToNoDataMessage(`Données de performance non disponibles pour « ${toAircraft} ». Types avec données PTFS : ${supportedList}. Vous pouvez utiliser un type équivalent (ex. Boeing 737 pour 737-800).`);
      return;
    }
    const acft = getAircraftData(toPerfType);
    const flaps = toFlaps ? parseInt(toFlaps, 10) : (acft?.flaps[0]?.setting ?? 0);
    const res = calculateTakeoffPerformance(toPerfType, toAirport, toRunway, toIntersection, flaps);
    setToResult(res ?? null);
  }

  function onCalculateLanding() {
    if (!canCalculateLanding) return;
    setLdgNoDataMessage(null);
    if (!ldgPerfType) {
      setLdgResult(null);
      setLdgNoDataMessage(`Données de performance non disponibles pour « ${ldgAircraft} ». Types avec données PTFS : ${supportedList}.`);
      return;
    }
    const acft = getAircraftData(ldgPerfType);
    const flaps = ldgFlaps ? parseInt(ldgFlaps, 10) : (acft?.flaps[0]?.setting ?? 0);
    const res = calculateLandingPerformance(ldgPerfType, ldgAirport, ldgRunway, flaps, ldgReversers || '');
    setLdgResult(res ?? null);
  }

  const toPossible = toResult ? toResult.canLiftoff && toResult.canAccelStop : null;
  const ldgPossible = ldgResult ? ldgResult.canStop : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Gauge className="h-7 w-7 text-amber-400" />
          Calculateur de performance PTFS
        </h1>
        <p className="text-slate-400 mt-1">
          Tous les avions du serveur sont listés. Les calculs utilisent les données PTFS (Roblox) quand disponibles — types équivalents (ex. 737-800 → Boeing 737) partagent les mêmes perfs. Par{' '}
          <a href="https://github.com/cityuserGH/ptfsperf" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300">cityuser</a> (MIT).
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Takeoff */}
        <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Décollage</h2>
          <div className="space-y-3">
            <Select label="Avion" value={toAircraft} onChange={(v) => { setToAircraft(v); setToResult(null); setToNoDataMessage(null); }} options={aircraftOptions} placeholder={serverTypes.length ? 'Choisir un avion du serveur' : 'Chargement…'} />
            <Select label="Aéroport" value={toAirport} onChange={(v) => { setToAirport(v); setToRunway(''); setToIntersection(''); }} options={airportOptions} placeholder="Choisir un aéroport" />
            <Select label="Piste" value={toRunway} onChange={(v) => { setToRunway(v); setToIntersection(''); }} options={toRunwayOptions} placeholder="Choisir une piste" disabled={!toAirport} />
            <Select label="Intersection" value={toIntersection} onChange={setToIntersection} options={toIntersectionOptions} placeholder="Pleine longueur" disabled={!toRunway} />
            <Select label="Volets" value={toFlaps} onChange={setToFlaps} options={toFlapsOptions} placeholder="Sans volets" disabled={!toAircraft} />
          </div>
          <button
            onClick={onCalculateTakeoff}
            disabled={!canCalculateTakeoff}
            className="mt-4 w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
          >
            Calculer
          </button>
          {toNoDataMessage && (
            <p className="mt-4 text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              {toNoDataMessage}
            </p>
          )}
          {toResult && (
            <div className="mt-4 space-y-2 text-sm">
              <p className={toPossible === true ? 'text-emerald-400' : toPossible === false ? 'text-amber-400' : 'text-slate-400'}>
                {toPossible === true ? 'Décollage possible.' : toPossible === false ? 'Attention : décollage non possible en sécurité. Essayez plus de volets ou une piste plus longue.' : '—'}
              </p>
              <p>Poussée : <strong className="text-slate-200">{toResult.thrust} %</strong></p>
              <table className="w-full text-slate-300">
                <tbody>
                  <tr><td>V1</td><td className="text-right">{toResult.v1 > 0 ? toResult.v1 : '—'}</td><td className="text-slate-500">kts</td></tr>
                  <tr><td>Vr</td><td className="text-right">{toResult.vr}</td><td className="text-slate-500">kts</td></tr>
                  <tr><td>V2</td><td className="text-right">{toResult.v2}</td><td className="text-slate-500">kts</td></tr>
                </tbody>
              </table>
              <button type="button" onClick={() => setToDetailsOpen((o) => !o)} className="flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs mt-2">
                <ChevronDown className={`h-4 w-4 transition-transform ${toDetailsOpen ? 'rotate-180' : ''}`} />
                {toDetailsOpen ? 'Masquer' : 'Afficher'} les détails
              </button>
              {toDetailsOpen && (
                <table className="w-full text-slate-400 text-xs mt-2">
                  <tbody>
                    <tr><td>Distance décollage réelle</td><td className="text-right">{toResult.atod}</td><td>ft</td></tr>
                    <tr><td>Course requise (+15 %)</td><td className="text-right">{toResult.torun}</td><td>ft</td></tr>
                    <tr><td>Marge (dispo. {toResult.tora} ft)</td><td className="text-right">{toResult.tora - toResult.torun}</td><td>ft</td></tr>
                    <tr><td>Distance accélération-freinage</td><td className="text-right">{toResult.asdist}</td><td>ft</td></tr>
                    <tr><td>Marge ASDA ({toResult.asda} ft)</td><td className="text-right">{toResult.asda - toResult.asdist}</td><td>ft</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>

        {/* Landing */}
        <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Atterrissage</h2>
          <div className="space-y-3">
            <Select label="Avion" value={ldgAircraft} onChange={(v) => { setLdgAircraft(v); setLdgResult(null); setLdgNoDataMessage(null); }} options={aircraftOptions} placeholder={serverTypes.length ? 'Choisir un avion du serveur' : 'Chargement…'} />
            <Select label="Aéroport" value={ldgAirport} onChange={(v) => { setLdgAirport(v); setLdgRunway(''); }} options={airportOptions} placeholder="Choisir un aéroport" />
            <Select label="Piste" value={ldgRunway} onChange={setLdgRunway} options={ldgRunwayOptions} placeholder="Choisir une piste" disabled={!ldgAirport} />
            <Select label="Volets" value={ldgFlaps} onChange={setLdgFlaps} options={ldgFlapsOptions} placeholder="Sans volets" disabled={!ldgAircraft} />
            <Select label="Inverseurs" value={ldgReversers} onChange={setLdgReversers} options={ldgReversersOptions} placeholder="Sans inverseurs" disabled={!ldgAircraft} />
          </div>
          <button
            onClick={onCalculateLanding}
            disabled={!canCalculateLanding}
            className="mt-4 w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium"
          >
            Calculer
          </button>
          {ldgNoDataMessage && (
            <p className="mt-4 text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              {ldgNoDataMessage}
            </p>
          )}
          {ldgResult && (
            <div className="mt-4 space-y-2 text-sm">
              <p className={ldgPossible === true ? 'text-emerald-400' : ldgPossible === false ? 'text-amber-400' : 'text-slate-400'}>
                {ldgPossible === true ? 'Atterrissage possible.' : ldgPossible === false ? 'Attention : atterrissage non possible en sécurité. Essayez inverseurs, plus de volets ou une piste plus longue.' : '—'}
              </p>
              <table className="w-full text-slate-300">
                <tbody>
                  <tr><td>Vref</td><td className="text-right">{ldgResult.Vref}</td><td className="text-slate-500">kts</td></tr>
                  <tr><td>Vapp</td><td className="text-right">{ldgResult.Vapp}</td><td className="text-slate-500">kts</td></tr>
                </tbody>
              </table>
              <p>Poussée pour Vapp : <strong className="text-slate-200">{ldgResult.thrust} %</strong></p>
              <button type="button" onClick={() => setLdgDetailsOpen((o) => !o)} className="flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs mt-2">
                <ChevronDown className={`h-4 w-4 transition-transform ${ldgDetailsOpen ? 'rotate-180' : ''}`} />
                {ldgDetailsOpen ? 'Masquer' : 'Afficher'} les détails
              </button>
              {ldgDetailsOpen && (
                <table className="w-full text-slate-400 text-xs mt-2">
                  <tbody>
                    <tr><td>Distance atterrissage réelle</td><td className="text-right">{ldgResult.ald}</td><td>ft</td></tr>
                    <tr><td>Distance requise (+15 %)</td><td className="text-right">{ldgResult.ldr}</td><td>ft</td></tr>
                    <tr><td>Marge (LDA {ldgResult.lda} ft)</td><td className="text-right">{ldgResult.margin}</td><td>ft</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 disabled:opacity-50"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
