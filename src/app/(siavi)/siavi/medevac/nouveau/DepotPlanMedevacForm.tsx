'use client';

import { useState, useEffect, useMemo, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { joinSidStarRoute, buildRouteWithManual, stripRouteBrackets } from '@/lib/utils';
import { HeartPulse, Plane, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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

export default function DepotPlanMedevacForm({ flotte }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const submitBusyRef = useRef(false);

  const [aeroport_depart, setAeroportDepart] = useState('');
  const [aeroport_arrivee, setAeroportArrivee] = useState('');
  const [numero_vol, setNumeroVol] = useState('');
  const [temps_prev_min, setTempsPrevMin] = useState('');
  const [type_vol, setTypeVol] = useState<'VFR' | 'IFR'>('VFR');
  const [intentions_vol, setIntentionsVol] = useState('');
  const [sid_depart, setSidDepart] = useState('');
  const [star_arrivee, setStarArrivee] = useState('');
  const [route_ifr, setRouteIfr] = useState('');
  const [niveau_croisiere, setNiveauCroisiere] = useState('');
  const [siavi_avion_id, setSiaviAvionId] = useState('');
  const [vol_sans_atc, setVolSansAtc] = useState(false);
  const [showNoAtcConfirm, setShowNoAtcConfirm] = useState(false);

  const [sidList, setSidList] = useState<{ id: string; nom: string; route: string }[]>([]);
  const [starList, setStarList] = useState<{ id: string; nom: string; route: string }[]>([]);
  const [selectedSidRoute, setSelectedSidRoute] = useState<string | null>(null);
  const [selectedStarRoute, setSelectedStarRoute] = useState<string | null>(null);
  const [manualRoutePart, setManualRoutePart] = useState('');
  const [sidCustomMode, setSidCustomMode] = useState(false);
  const [starCustomMode, setStarCustomMode] = useState(false);

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

  useEffect(() => {
    if (!aeroport_depart || type_vol !== 'IFR') { setSidList([]); setSelectedSidRoute(null); return; }
    fetch(`/api/sid-star?aeroport=${encodeURIComponent(aeroport_depart)}&type=SID`)
      .then(r => r.json()).then(d => setSidList(Array.isArray(d) ? d : []))
      .catch(() => setSidList([]));
    setSidDepart(''); setSelectedSidRoute(null); setManualRoutePart(''); setSidCustomMode(false);
  }, [aeroport_depart, type_vol]);

  useEffect(() => {
    if (!aeroport_arrivee || type_vol !== 'IFR') { setStarList([]); setSelectedStarRoute(null); return; }
    fetch(`/api/sid-star?aeroport=${encodeURIComponent(aeroport_arrivee)}&type=STAR`)
      .then(r => r.json()).then(d => setStarList(Array.isArray(d) ? d : []))
      .catch(() => setStarList([]));
    setStarArrivee(''); setSelectedStarRoute(null); setManualRoutePart(''); setStarCustomMode(false);
  }, [aeroport_arrivee, type_vol]);

  useEffect(() => {
    if (type_vol !== 'IFR') return;
    setRouteIfr(buildRouteWithManual(selectedSidRoute, manualRoutePart, selectedStarRoute));
  }, [type_vol, selectedSidRoute, selectedStarRoute, manualRoutePart]);

  function getFormData(volSansAtc = false) {
    return {
      aeroport_depart,
      aeroport_arrivee,
      numero_vol: numero_vol.trim(),
      temps_prev_min: parseInt(temps_prev_min, 10),
      type_vol,
      intentions_vol: type_vol === 'VFR' ? intentions_vol.trim() : undefined,
      sid_depart: type_vol === 'IFR' ? sid_depart.trim() : undefined,
      star_arrivee: type_vol === 'IFR' ? star_arrivee.trim() : undefined,
      route_ifr: type_vol === 'IFR' && route_ifr.trim() ? stripRouteBrackets(route_ifr).trim() : undefined,
      niveau_croisiere: type_vol === 'IFR' && niveau_croisiere.trim() ? niveau_croisiere.trim().replace(/^FL\s*/i, '') : undefined,
      strip_route: type_vol === 'IFR' && (sid_depart.trim() || star_arrivee.trim())
        ? (stripRouteBrackets(route_ifr).trim() || (selectedSidRoute && selectedStarRoute ? joinSidStarRoute(selectedSidRoute, selectedStarRoute) : [selectedSidRoute, selectedStarRoute].filter(Boolean).join(' ')) || 'RADAR VECTORS DCT')
        : undefined,
      siavi_avion_id,
      vol_sans_atc: volSansAtc,
    };
  }

  async function handleSubmit(e: React.FormEvent, forceNoAtc = false) {
    e.preventDefault();
    if (submitBusyRef.current) return;
    setError(null); setSuccess(null);

    if (!aeroport_depart || !aeroport_arrivee) { setError('Sélectionnez les aéroports.'); return; }
    if (!numero_vol.trim() || !/^\d+$/.test(numero_vol.trim())) { setError('Numéro de vol requis (chiffres uniquement). Le préfixe MEDEVAC est ajouté automatiquement.'); return; }
    if (!temps_prev_min || parseInt(temps_prev_min) < 1) { setError('Temps prévu invalide.'); return; }
    if (type_vol === 'IFR' && (!sid_depart.trim() || !star_arrivee.trim())) { setError('SID et STAR requises pour IFR.'); return; }
    if (type_vol === 'VFR' && !intentions_vol.trim()) { setError('Intentions de vol requises pour VFR.'); return; }
    if (!siavi_avion_id) { setError('Sélectionnez un avion SIAVI.'); return; }

    submitBusyRef.current = true;
    setLoading(true);

    try {
      const res = await fetch('/api/siavi/medevac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getFormData(forceNoAtc)),
      });
      const data = await res.json();

      if (!res.ok) {
        if (!forceNoAtc && data.error?.includes('Aucun ATC')) {
          setShowNoAtcConfirm(true);
          return;
        }
        throw new Error(data.error || 'Erreur');
      }

      if (data.atc_contact) {
        setSuccess(`Vol MEDEVAC${numero_vol.trim()} déposé ! Contactez ${data.atc_contact.nom} sur ${data.atc_contact.position}${data.atc_contact.frequence ? ` (${data.atc_contact.frequence})` : ''}.`);
      } else {
        setSuccess(`Vol MEDEVAC${numero_vol.trim()} déposé en autosurveillance.`);
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
            <button type="button" onClick={(e) => { setShowNoAtcConfirm(false); handleSubmit(e as any, true); }}
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

        {/* Callsign */}
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
              className="flex-1 px-3 py-2 rounded-r-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
              maxLength={4}
            />
          </div>
        </div>

        {/* Aéroports */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Aéroport de départ</label>
            <select value={aeroport_depart} onChange={e => setAeroportDepart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
              <option value="">Choisir...</option>
              {aeroports.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Aéroport d&apos;arrivée</label>
            <select value={aeroport_arrivee} onChange={e => setAeroportArrivee(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
              <option value="">Choisir...</option>
              {aeroports.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}
            </select>
          </div>
        </div>

        {/* Temps et type de vol */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Temps prévu (min)</label>
            <input type="number" value={temps_prev_min} onChange={e => setTempsPrevMin(e.target.value)}
              min="1" placeholder="30"
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type de vol</label>
            <div className="flex gap-2">
              {(['VFR', 'IFR'] as const).map(tv => (
                <button key={tv} type="button" onClick={() => setTypeVol(tv)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-all ${type_vol === tv
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-white border-red-300 text-red-700 hover:bg-red-50'}`}>
                  {tv}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* VFR intentions */}
        {type_vol === 'VFR' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Intentions de vol</label>
            <textarea value={intentions_vol} onChange={e => setIntentionsVol(e.target.value)}
              rows={2} placeholder="Ex: Tour de piste, transit sud-nord..."
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
          </div>
        )}

        {/* IFR fields */}
        {type_vol === 'IFR' && (
          <div className="space-y-4 p-4 rounded-lg bg-red-50 border border-red-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SID de départ</label>
                {sidList.length > 0 && !sidCustomMode ? (
                  <select
                    value={sidList.some(s => s.nom === sid_depart) ? sid_depart : ''}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '__custom__') { setSidCustomMode(true); setSidDepart(''); setSelectedSidRoute(null); return; }
                      setSidDepart(v);
                      const proc = sidList.find(s => s.nom === v);
                      setSelectedSidRoute(proc?.route || null);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
                    <option value="">Choisir SID...</option>
                    {sidList.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                    <option value="__custom__">Saisie libre...</option>
                  </select>
                ) : (
                  <input type="text" value={sid_depart} onChange={e => setSidDepart(e.target.value)}
                    placeholder="Ex: RADAR VECTORS"
                    className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">STAR d&apos;arrivée</label>
                {starList.length > 0 && !starCustomMode ? (
                  <select
                    value={starList.some(s => s.nom === star_arrivee) ? star_arrivee : ''}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '__custom__') { setStarCustomMode(true); setStarArrivee(''); setSelectedStarRoute(null); return; }
                      setStarArrivee(v);
                      const proc = starList.find(s => s.nom === v);
                      setSelectedStarRoute(proc?.route || null);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
                    <option value="">Choisir STAR...</option>
                    {starList.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                    <option value="__custom__">Saisie libre...</option>
                  </select>
                ) : (
                  <input type="text" value={star_arrivee} onChange={e => setStarArrivee(e.target.value)}
                    placeholder="Ex: RADAR VECTORS"
                    className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Route IFR</label>
              <input type="text" value={route_ifr} onChange={e => { setRouteIfr(e.target.value); setManualRoutePart(e.target.value); }}
                placeholder="DCT VOR1 AWY VOR2..."
                className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Niveau de croisière</label>
              <input type="text" value={niveau_croisiere} onChange={e => setNiveauCroisiere(e.target.value)}
                placeholder="Ex: 350 (= FL350)"
                className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono" />
            </div>
          </div>
        )}

        {/* Avion SIAVI */}
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
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
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

      {/* Submit */}
      <button type="submit" disabled={loading || !!success}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 disabled:opacity-50 text-white rounded-xl font-bold text-lg shadow-lg transition-all">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <HeartPulse className="h-5 w-5" />}
        Déposer le vol MEDEVAC
      </button>
    </form>
  );
}
