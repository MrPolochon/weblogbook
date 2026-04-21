'use client';

import { useState, useEffect, useMemo, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { joinSidStarRoute, buildRouteWithManual, stripRouteBrackets } from '@/lib/utils';
import { HeartPulse, Plane, AlertCircle, CheckCircle2, Loader2, Plus, Trash2, ArrowRight, MapPin } from 'lucide-react';

interface TypeAvion {
  id: string;
  nom: string;
  code_oaci: string | null;
  capacite_pax: number;
  capacite_cargo_kg: number;
}

interface SiaviAvion {
  id: string;
  type_avion_id: string;
  immatriculation: string;
  nom_personnalise: string | null;
  aeroport_actuel: string;
  statut: string;
  usure_percent: number;
  types_avion: TypeAvion | TypeAvion[] | null;
}

interface Props {
  flotte: SiaviAvion[];
}

function firstTypeAvion(ta: TypeAvion | TypeAvion[] | null | undefined): TypeAvion | null {
  if (!ta) return null;
  if (Array.isArray(ta)) return ta[0] ?? null;
  return ta;
}

const aeroports = AEROPORTS_PTFS.map(a => ({ code: a.code, nom: a.nom }));
const MAX_SEGMENTS = 5;

type ProcItem = { id: string; nom: string; route: string };

type SegmentForm = {
  aeroport_arrivee: string;
  temps_prev_min: string;
  type_vol: 'VFR' | 'IFR';
  intentions_vol: string;
  sid_depart: string;
  star_arrivee: string;
  route_ifr: string;
  niveau_croisiere: string;
  selectedSidRoute: string | null;
  selectedStarRoute: string | null;
  manualRoutePart: string;
  sidCustomMode: boolean;
  starCustomMode: boolean;
};

function emptySegment(): SegmentForm {
  return {
    aeroport_arrivee: '',
    temps_prev_min: '',
    type_vol: 'VFR',
    intentions_vol: '',
    sid_depart: '',
    star_arrivee: '',
    route_ifr: '',
    niveau_croisiere: '',
    selectedSidRoute: null,
    selectedStarRoute: null,
    manualRoutePart: '',
    sidCustomMode: false,
    starCustomMode: false,
  };
}

export default function DepotPlanMedevacForm({ flotte }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const submitBusyRef = useRef(false);

  const [aeroport_depart, setAeroportDepart] = useState('');
  const [numero_vol, setNumeroVol] = useState('');
  const [siavi_avion_id, setSiaviAvionId] = useState('');
  const [vol_sans_atc, setVolSansAtc] = useState(false);
  const [showNoAtcConfirm, setShowNoAtcConfirm] = useState(false);

  const [segments, setSegments] = useState<SegmentForm[]>([emptySegment()]);

  const [sidCache, setSidCache] = useState<Record<string, ProcItem[]>>({});
  const [starCache, setStarCache] = useState<Record<string, ProcItem[]>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const avionsDisponibles = useMemo(() =>
    flotte.filter(a =>
      a.statut === 'ground' &&
      Number(a.usure_percent) > 0 &&
      (!aeroport_depart || a.aeroport_actuel === aeroport_depart.toUpperCase())
    ),
    [flotte, aeroport_depart]
  );

  useEffect(() => {
    if (siavi_avion_id && aeroport_depart) {
      const av = flotte.find(a => a.id === siavi_avion_id);
      if (av && av.aeroport_actuel !== aeroport_depart.toUpperCase()) {
        setSiaviAvionId('');
      }
    }
  }, [aeroport_depart, flotte, siavi_avion_id]);

  function segmentDepart(index: number): string {
    if (index === 0) return aeroport_depart;
    return segments[index - 1]?.aeroport_arrivee || '';
  }

  async function fetchSidStar(kind: 'SID' | 'STAR', aeroport: string): Promise<ProcItem[]> {
    if (!aeroport) return [];
    const cacheKey = aeroport.toUpperCase();
    const cache = kind === 'SID' ? sidCache : starCache;
    if (cache[cacheKey]) return cache[cacheKey];
    try {
      const r = await fetch(`/api/sid-star?aeroport=${encodeURIComponent(aeroport)}&type=${kind}`);
      const d = await r.json();
      const list: ProcItem[] = Array.isArray(d) ? d : [];
      if (kind === 'SID') setSidCache(prev => ({ ...prev, [cacheKey]: list }));
      else setStarCache(prev => ({ ...prev, [cacheKey]: list }));
      return list;
    } catch { return []; }
  }

  useEffect(() => {
    segments.forEach((seg, idx) => {
      if (seg.type_vol !== 'IFR') return;
      const dep = idx === 0 ? aeroport_depart : segments[idx - 1]?.aeroport_arrivee;
      if (dep) fetchSidStar('SID', dep);
      if (seg.aeroport_arrivee) fetchSidStar('STAR', seg.aeroport_arrivee);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, aeroport_depart]);

  useEffect(() => {
    setSegments(prev => prev.map(seg => {
      if (seg.type_vol !== 'IFR') return seg;
      const newRoute = buildRouteWithManual(seg.selectedSidRoute, seg.manualRoutePart, seg.selectedStarRoute);
      if (newRoute === seg.route_ifr) return seg;
      return { ...seg, route_ifr: newRoute };
    }));
  }, [segments.map(s => `${s.type_vol}|${s.selectedSidRoute}|${s.selectedStarRoute}|${s.manualRoutePart}`).join('#')]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateSegment(index: number, patch: Partial<SegmentForm>) {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }

  function addSegment() {
    if (segments.length >= MAX_SEGMENTS) return;
    setSegments(prev => [...prev, emptySegment()]);
  }

  function removeSegment(index: number) {
    if (segments.length <= 1) return;
    setSegments(prev => prev.filter((_, i) => i !== index));
  }

  function buildSegmentsPayload() {
    return segments.map((seg, idx) => {
      const dep = idx === 0 ? aeroport_depart : segments[idx - 1].aeroport_arrivee;
      return {
        aeroport_depart: dep.toUpperCase(),
        aeroport_arrivee: seg.aeroport_arrivee.toUpperCase(),
        temps_prev_min: parseInt(seg.temps_prev_min, 10),
        type_vol: seg.type_vol,
        intentions_vol: seg.type_vol === 'VFR' ? seg.intentions_vol.trim() : undefined,
        sid_depart: seg.type_vol === 'IFR' ? seg.sid_depart.trim() : undefined,
        star_arrivee: seg.type_vol === 'IFR' ? seg.star_arrivee.trim() : undefined,
        route_ifr: seg.type_vol === 'IFR' && seg.route_ifr.trim() ? stripRouteBrackets(seg.route_ifr).trim() : undefined,
        niveau_croisiere: seg.type_vol === 'IFR' && seg.niveau_croisiere.trim() ? seg.niveau_croisiere.trim().replace(/^FL\s*/i, '') : undefined,
        strip_route: seg.type_vol === 'IFR' && (seg.sid_depart.trim() || seg.star_arrivee.trim())
          ? (stripRouteBrackets(seg.route_ifr).trim() || (seg.selectedSidRoute && seg.selectedStarRoute ? joinSidStarRoute(seg.selectedSidRoute, seg.selectedStarRoute) : [seg.selectedSidRoute, seg.selectedStarRoute].filter(Boolean).join(' ')) || 'RADAR VECTORS DCT')
          : undefined,
      };
    });
  }

  async function handleSubmit(e: React.FormEvent, forceNoAtc = false) {
    e.preventDefault();
    if (submitBusyRef.current) return;
    setError(null); setSuccess(null);

    if (!aeroport_depart) { setError('Sélectionnez l\'aéroport de départ.'); return; }
    if (!numero_vol.trim() || !/^\d+$/.test(numero_vol.trim())) { setError('Numéro de vol requis (chiffres uniquement). Le préfixe MEDEVAC est ajouté automatiquement.'); return; }
    if (!siavi_avion_id) { setError('Sélectionnez un avion SIAVI.'); return; }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const dep = i === 0 ? aeroport_depart : segments[i - 1].aeroport_arrivee;
      if (!seg.aeroport_arrivee) { setError(`Segment ${i + 1} : destination requise.`); return; }
      if (dep.toUpperCase() === seg.aeroport_arrivee.toUpperCase()) { setError(`Segment ${i + 1} : la destination doit être différente du départ (${dep}).`); return; }
      if (!seg.temps_prev_min || parseInt(seg.temps_prev_min, 10) < 1) { setError(`Segment ${i + 1} : temps prévu invalide.`); return; }
      if (seg.type_vol === 'IFR' && (!seg.sid_depart.trim() || !seg.star_arrivee.trim())) { setError(`Segment ${i + 1} : SID et STAR requises pour IFR.`); return; }
      if (seg.type_vol === 'VFR' && !seg.intentions_vol.trim()) { setError(`Segment ${i + 1} : intentions de vol requises pour VFR.`); return; }
    }

    submitBusyRef.current = true;
    setLoading(true);

    try {
      const payload = {
        aeroport_depart: aeroport_depart.toUpperCase(),
        numero_vol: numero_vol.trim(),
        siavi_avion_id,
        vol_sans_atc: forceNoAtc || vol_sans_atc,
        segments: buildSegmentsPayload(),
      };

      const res = await fetch('/api/siavi/medevac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (!forceNoAtc && data.error?.includes('Aucun ATC')) {
          setShowNoAtcConfirm(true);
          return;
        }
        throw new Error(data.error || 'Erreur');
      }

      const nbSeg = segments.length;
      const suffixe = nbSeg > 1 ? ` (mission ${nbSeg} segments)` : '';
      if (data.atc_contact) {
        setSuccess(`Vol MEDEVAC${numero_vol.trim()} déposé${suffixe} ! Contactez ${data.atc_contact.nom} sur ${data.atc_contact.position}${data.atc_contact.frequence ? ` (${data.atc_contact.frequence})` : ''}.`);
      } else {
        setSuccess(`Vol MEDEVAC${numero_vol.trim()} déposé en autosurveillance${suffixe}.`);
      }

      setTimeout(() => {
        startTransition(() => router.push('/siavi'));
        router.refresh();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
      submitBusyRef.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{success}</p>
        </div>
      )}

      {showNoAtcConfirm && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-3">
          <p className="text-amber-900 text-sm font-medium">Aucun ATC en ligne. Voulez-vous décoller en autosurveillance ?</p>
          <div className="flex gap-2">
            <button type="button" onClick={(e) => { setShowNoAtcConfirm(false); handleSubmit(e as unknown as React.FormEvent, true); }}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
              Oui, vol sans ATC
            </button>
            <button type="button" onClick={() => setShowNoAtcConfirm(false)}
              className="px-4 py-2 bg-amber-200 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-300">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6 space-y-5">
        <h2 className="text-lg font-semibold text-red-900 flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-red-600" />
          Plan de vol MEDEVAC
        </h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Indicatif d&apos;appel</label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-red-300 bg-red-100 text-red-800 font-mono font-bold text-sm">
              MEDEVAC
            </span>
            <input
              type="text"
              value={numero_vol}
              onChange={e => setNumeroVol(e.target.value.replace(/\D/g, ''))}
              placeholder="01"
              className="flex-1 px-3 py-2 rounded-r-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
              maxLength={4}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            <MapPin className="inline h-4 w-4 mr-1 text-red-600" />
            Aéroport de départ initial
          </label>
          <select value={aeroport_depart} onChange={e => setAeroportDepart(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
            <option value="">Choisir...</option>
            {aeroports.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            <Plane className="inline h-4 w-4 mr-1" />
            Avion SIAVI
          </label>
          {avionsDisponibles.length === 0 ? (
            <p className="text-sm text-red-600 italic">
              {aeroport_depart
                ? `Aucun avion SIAVI disponible à ${aeroport_depart.toUpperCase()}`
                : 'Sélectionnez un aéroport de départ'}
            </p>
          ) : (
            <select value={siavi_avion_id} onChange={e => setSiaviAvionId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
              <option value="">Choisir un avion...</option>
              {avionsDisponibles.map(a => {
                const ta = firstTypeAvion(a.types_avion);
                return (
                  <option key={a.id} value={a.id}>
                    {a.immatriculation} — {ta?.nom || '?'} ({a.aeroport_actuel}, {Number(a.usure_percent)}% usure)
                  </option>
                );
              })}
            </select>
          )}
        </div>
      </div>

      {/* Segments */}
      {segments.map((seg, index) => {
        const dep = segmentDepart(index);
        const sidKey = dep.toUpperCase();
        const starKey = seg.aeroport_arrivee.toUpperCase();
        const sidList = sidCache[sidKey] || [];
        const starList = starCache[starKey] || [];

        return (
          <div key={index} className="rounded-xl bg-white border border-red-200 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-red-900 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-600 text-white text-sm font-bold">
                  {index + 1}
                </span>
                Segment {index + 1}
                {dep && seg.aeroport_arrivee && (
                  <span className="text-sm text-slate-500 font-normal">
                    <span className="font-mono text-red-700">{dep.toUpperCase()}</span>
                    <ArrowRight className="inline h-3 w-3 mx-1" />
                    <span className="font-mono text-red-700">{seg.aeroport_arrivee.toUpperCase()}</span>
                  </span>
                )}
              </h3>
              {segments.length > 1 && (
                <button type="button" onClick={() => removeSegment(index)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 text-sm">
                  <Trash2 className="h-4 w-4" />
                  Retirer
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Départ du segment</label>
                <div className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 font-mono text-sm">
                  {dep ? `${dep.toUpperCase()}` : <span className="italic text-slate-400">Défini par le segment précédent</span>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Destination</label>
                <select value={seg.aeroport_arrivee} onChange={e => updateSegment(index, { aeroport_arrivee: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
                  <option value="">Choisir...</option>
                  {aeroports.filter(a => a.code !== dep.toUpperCase()).map(a => <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Temps prévu (min)</label>
                <input type="number" value={seg.temps_prev_min} onChange={e => updateSegment(index, { temps_prev_min: e.target.value })}
                  min="1" placeholder="30"
                  className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type de vol</label>
                <div className="flex gap-2">
                  {(['VFR', 'IFR'] as const).map(tv => (
                    <button key={tv} type="button" onClick={() => updateSegment(index, { type_vol: tv })}
                      className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-all ${seg.type_vol === tv
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-white border-red-300 text-red-700 hover:bg-red-50'}`}>
                      {tv}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {seg.type_vol === 'VFR' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Intentions de vol</label>
                <textarea value={seg.intentions_vol} onChange={e => updateSegment(index, { intentions_vol: e.target.value })}
                  rows={2} placeholder="Ex: Transit sud-nord, altitude 3500 ft..."
                  className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
              </div>
            )}

            {seg.type_vol === 'IFR' && (
              <div className="space-y-4 p-4 rounded-lg bg-red-50 border border-red-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SID de départ ({dep.toUpperCase() || '?'})</label>
                    {sidList.length > 0 && !seg.sidCustomMode ? (
                      <select
                        value={sidList.some(s => s.nom === seg.sid_depart) ? seg.sid_depart : ''}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__custom__') { updateSegment(index, { sidCustomMode: true, sid_depart: '', selectedSidRoute: null }); return; }
                          const proc = sidList.find(s => s.nom === v);
                          updateSegment(index, { sid_depart: v, selectedSidRoute: proc?.route || null });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
                        <option value="">Choisir SID...</option>
                        {sidList.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                        <option value="__custom__">Saisie libre...</option>
                      </select>
                    ) : (
                      <input type="text" value={seg.sid_depart} onChange={e => updateSegment(index, { sid_depart: e.target.value })}
                        placeholder="Ex: RADAR VECTORS"
                        className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">STAR d&apos;arrivée ({seg.aeroport_arrivee.toUpperCase() || '?'})</label>
                    {starList.length > 0 && !seg.starCustomMode ? (
                      <select
                        value={starList.some(s => s.nom === seg.star_arrivee) ? seg.star_arrivee : ''}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__custom__') { updateSegment(index, { starCustomMode: true, star_arrivee: '', selectedStarRoute: null }); return; }
                          const proc = starList.find(s => s.nom === v);
                          updateSegment(index, { star_arrivee: v, selectedStarRoute: proc?.route || null });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
                        <option value="">Choisir STAR...</option>
                        {starList.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                        <option value="__custom__">Saisie libre...</option>
                      </select>
                    ) : (
                      <input type="text" value={seg.star_arrivee} onChange={e => updateSegment(index, { star_arrivee: e.target.value })}
                        placeholder="Ex: RADAR VECTORS"
                        className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Route IFR</label>
                  <input type="text" value={seg.route_ifr}
                    onChange={e => updateSegment(index, { route_ifr: e.target.value, manualRoutePart: e.target.value })}
                    placeholder="DCT VOR1 AWY VOR2..."
                    className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Niveau de croisière</label>
                  <input type="text" value={seg.niveau_croisiere} onChange={e => updateSegment(index, { niveau_croisiere: e.target.value })}
                    placeholder="Ex: 350 (= FL350)"
                    className="w-full px-3 py-2 rounded-lg border border-red-300 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono" />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Bouton ajouter destination */}
      {segments.length < MAX_SEGMENTS && (
        <button type="button" onClick={addSegment}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-red-300 text-red-700 hover:border-red-500 hover:bg-red-50 transition-colors font-medium">
          <Plus className="h-4 w-4" />
          Ajouter une destination (segment {segments.length + 1}/{MAX_SEGMENTS})
        </button>
      )}

      {segments.length > 1 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <p className="font-semibold mb-1">Mission multi-segments ({segments.length} escales)</p>
          <p>Seul le 1<sup>er</sup> segment sera envoyé à l&apos;ATC dès le dépôt. Après chaque atterrissage, clôturez le segment puis activez le suivant depuis la page « Mes plans de vol » en choisissant la SID/STAR (ou vos intentions VFR).</p>
        </div>
      )}

      <button type="submit" disabled={loading || !!success}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 disabled:opacity-50 text-white rounded-xl font-bold text-lg shadow-lg transition-all">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <HeartPulse className="h-5 w-5" />}
        Déposer le vol MEDEVAC
      </button>
    </form>
  );
}
