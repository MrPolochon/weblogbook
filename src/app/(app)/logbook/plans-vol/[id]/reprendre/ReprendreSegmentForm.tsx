'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { joinSidStarRoute, buildRouteWithManual, stripRouteBrackets } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Loader2, Play } from 'lucide-react';

type Segment = {
  id: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  numero_vol: string;
  type_vol: 'VFR' | 'IFR';
  temps_prev_min: number;
  intentions_vol: string | null;
  niveau_croisiere: string | null;
  sid_depart: string | null;
  star_arrivee: string | null;
  route_ifr: string | null;
  medevac_segment_index: number | null;
  medevac_total_segments: number | null;
  vol_sans_atc: boolean | null;
};

type ProcItem = { id: string; nom: string; route: string };

export default function ReprendreSegmentForm({ segment }: { segment: Segment }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const busyRef = useRef(false);

  const [intentions_vol, setIntentionsVol] = useState(segment.intentions_vol || '');
  const [sid_depart, setSidDepart] = useState(segment.sid_depart || '');
  const [star_arrivee, setStarArrivee] = useState(segment.star_arrivee || '');
  const [route_ifr, setRouteIfr] = useState(segment.route_ifr || '');
  const [niveau_croisiere, setNiveauCroisiere] = useState(segment.niveau_croisiere || '');

  const [sidList, setSidList] = useState<ProcItem[]>([]);
  const [starList, setStarList] = useState<ProcItem[]>([]);
  const [selectedSidRoute, setSelectedSidRoute] = useState<string | null>(null);
  const [selectedStarRoute, setSelectedStarRoute] = useState<string | null>(null);
  const [manualRoutePart, setManualRoutePart] = useState('');
  const [sidCustomMode, setSidCustomMode] = useState(false);
  const [starCustomMode, setStarCustomMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showNoAtcConfirm, setShowNoAtcConfirm] = useState(false);

  useEffect(() => {
    if (segment.type_vol !== 'IFR') return;
    fetch(`/api/sid-star?aeroport=${encodeURIComponent(segment.aeroport_depart)}&type=SID`)
      .then(r => r.json()).then(d => setSidList(Array.isArray(d) ? d : []))
      .catch(() => setSidList([]));
    fetch(`/api/sid-star?aeroport=${encodeURIComponent(segment.aeroport_arrivee)}&type=STAR`)
      .then(r => r.json()).then(d => setStarList(Array.isArray(d) ? d : []))
      .catch(() => setStarList([]));
  }, [segment.type_vol, segment.aeroport_depart, segment.aeroport_arrivee]);

  useEffect(() => {
    if (segment.type_vol !== 'IFR') return;
    setRouteIfr(buildRouteWithManual(selectedSidRoute, manualRoutePart, selectedStarRoute));
  }, [segment.type_vol, selectedSidRoute, selectedStarRoute, manualRoutePart]);

  async function submit(forceNoAtc = false) {
    if (busyRef.current) return;
    setError(null); setSuccess(null);

    if (segment.type_vol === 'IFR') {
      if (!sid_depart.trim() || !star_arrivee.trim()) { setError('SID et STAR requises pour IFR.'); return; }
    } else if (!intentions_vol.trim()) { setError('Intentions de vol requises pour VFR.'); return; }

    busyRef.current = true;
    setLoading(true);

    try {
      const body: Record<string, unknown> = {};
      if (segment.type_vol === 'IFR') {
        body.sid_depart = sid_depart.trim();
        body.star_arrivee = star_arrivee.trim();
        const routeCalculee = buildRouteWithManual(selectedSidRoute, manualRoutePart, selectedStarRoute);
        const routeFinale = stripRouteBrackets(route_ifr.trim() || routeCalculee).trim();
        body.route_ifr = routeFinale || undefined;
        if (niveau_croisiere.trim()) body.niveau_croisiere = niveau_croisiere.trim().replace(/^FL\s*/i, '');
        body.selected_sid_route = selectedSidRoute || undefined;
        body.selected_star_route = selectedStarRoute || undefined;
        body.manual_route_part = manualRoutePart || undefined;
      } else {
        body.intentions_vol = intentions_vol.trim();
      }
      if (forceNoAtc) body.force_sans_atc = true;

      const res = await fetch(`/api/plans-vol/${segment.id}/reprendre`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
        setSuccess(`Segment activé ! Contactez ${data.atc_contact.nom} sur ${data.atc_contact.position}${data.atc_contact.frequence ? ` (${data.atc_contact.frequence})` : ''}.`);
      } else {
        setSuccess(`Segment activé en autosurveillance. Bon vol !`);
      }

      setTimeout(() => {
        startTransition(() => router.push('/logbook/plans-vol'));
        router.refresh();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); submit(false); }} className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
          <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{success}</p>
        </div>
      )}

      {showNoAtcConfirm && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
          <p className="text-amber-200 text-sm font-medium">Aucun ATC en ligne. Continuer en autosurveillance ?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowNoAtcConfirm(false); submit(true); }}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
              Oui, sans ATC
            </button>
            <button type="button" onClick={() => setShowNoAtcConfirm(false)}
              className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm font-medium hover:bg-slate-600">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">
            {segment.type_vol === 'IFR' ? 'Plan de vol IFR' : 'Plan de vol VFR'}
          </h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 font-mono">
            {segment.type_vol}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Départ</p>
            <p className="font-mono text-slate-200">{segment.aeroport_depart}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Arrivée</p>
            <p className="font-mono text-slate-200">{segment.aeroport_arrivee}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Temps prévu</p>
            <p className="text-slate-200">{segment.temps_prev_min} min</p>
          </div>
        </div>

        {segment.type_vol === 'VFR' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Intentions de vol</label>
            <textarea value={intentions_vol} onChange={e => setIntentionsVol(e.target.value)}
              rows={3} placeholder="Ex: Transit direct, altitude 3500 ft..."
              className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
          </div>
        )}

        {segment.type_vol === 'IFR' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">SID de départ ({segment.aeroport_depart})</label>
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
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-100 focus:ring-2 focus:ring-red-500 focus:border-red-500">
                    <option value="">Choisir SID...</option>
                    {sidList.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                    <option value="__custom__">Saisie libre...</option>
                  </select>
                ) : (
                  <input type="text" value={sid_depart} onChange={e => setSidDepart(e.target.value)}
                    placeholder="Ex: RADAR VECTORS"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">STAR d&apos;arrivée ({segment.aeroport_arrivee})</label>
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
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-100 focus:ring-2 focus:ring-red-500 focus:border-red-500">
                    <option value="">Choisir STAR...</option>
                    {starList.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                    <option value="__custom__">Saisie libre...</option>
                  </select>
                ) : (
                  <input type="text" value={star_arrivee} onChange={e => setStarArrivee(e.target.value)}
                    placeholder="Ex: RADAR VECTORS"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Route IFR</label>
              <input type="text" value={route_ifr}
                onChange={e => { setRouteIfr(e.target.value); setManualRoutePart(e.target.value); }}
                placeholder="DCT VOR1 AWY VOR2..."
                className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Niveau de croisière</label>
              <input type="text" value={niveau_croisiere} onChange={e => setNiveauCroisiere(e.target.value)}
                placeholder="Ex: 350 (= FL350)"
                className="w-full px-3 py-2 rounded-lg bg-slate-900/50 border border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono" />
            </div>
          </div>
        )}
      </div>

      <button type="submit" disabled={loading || !!success}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 disabled:opacity-50 text-white rounded-xl font-bold text-lg shadow-lg transition-all">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
        Activer le segment et envoyer à l&apos;ATC
      </button>
    </form>
  );
}
