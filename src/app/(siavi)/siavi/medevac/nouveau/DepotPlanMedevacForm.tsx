'use client';
import { MEDEVAC_HOSPITALS, medevacRoutingError, type MedevacMissionType } from '@/lib/siavi/mission-routing';

import { useState, useEffect, useMemo, useTransition, useRef } from 'react';
import { medevacRevenue } from '@/lib/siavi/medevac-remuneration';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { joinSidStarRoute, buildRouteWithManual, stripRouteBrackets } from '@/lib/utils';
import { HeartPulse, Plane, AlertCircle, CheckCircle2, Loader2, Plus, Trash2, ArrowRight, MapPin } from 'lucide-react';

interface TypeAvion {
  id: string;
  nom: string;
  code_oaci: string | null;
  categorie?: string;
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
  bases: string[];
  initialAircraftId?: string;
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
  heure_depart: string;
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
    heure_depart: '',
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

export default function DepotPlanMedevacForm({ flotte, initialAircraftId, bases }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const submitBusyRef = useRef(false);
  const [missionType,setMissionType] = useState<MedevacMissionType>('evacuation');
  const [step, setStep] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const [aeroport_depart, setAeroportDepart] = useState(flotte.find(a=>a.id===initialAircraftId)?.aeroport_actuel ?? '');
  const [numero_vol, setNumeroVol] = useState('');
  const [siavi_avion_id, setSiaviAvionId] = useState(flotte.find(a=>a.id===initialAircraftId)?.id ?? '');
  const [vol_sans_atc, setVolSansAtc] = useState(false);
  const [showNoAtcConfirm, setShowNoAtcConfirm] = useState(false);

  const [segments, setSegments] = useState<SegmentForm[]>([emptySegment()]);

  const [sidCache, setSidCache] = useState<Record<string, ProcItem[]>>({});
  const [starCache, setStarCache] = useState<Record<string, ProcItem[]>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => { if(error || showNoAtcConfirm || success) { feedbackRef.current?.scrollIntoView({block:'center',behavior:'smooth'}); feedbackRef.current?.focus(); } }, [error,showNoAtcConfirm,success]);

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

  const returnBase=bases.includes(aeroport_depart)?aeroport_depart:bases[0];
  const selectedAircraft=flotte.find(a=>a.id===siavi_avion_id);
  const plannedMinutes=segments.reduce((sum,s)=>sum+(Number(s.temps_prev_min)||0),0);
  const estimatedRevenue=medevacRevenue(plannedMinutes,firstTypeAvion(selectedAircraft?.types_avion)?.categorie==='helicoptere');

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
    setSegments(prev => prev.map((s, i) => {
      if(i===index) return {...s,...patch,...(patch.aeroport_arrivee!==undefined && patch.aeroport_arrivee!==s.aeroport_arrivee ? {star_arrivee:'',selectedStarRoute:null,starCustomMode:false}: {})};
      if(i===index+1 && patch.aeroport_arrivee!==undefined) return {...s,sid_depart:'',selectedSidRoute:null,sidCustomMode:false};
      return s;
    }));
  }

  function addSegment() {
    if (segments.length >= MAX_SEGMENTS) return;
    setSegments(prev => [...prev, emptySegment()]);
  }

  function removeSegment(index: number) {
    if (segments.length <= 1) return;
    setSegments(prev => prev.filter((_, i) => i !== index).map((s,i)=>i===index?{...s,sid_depart:'',selectedSidRoute:null,sidCustomMode:false}:s));
  }

  function buildSegmentsPayload() {
    return segments.map((seg, idx) => {
      const dep = idx === 0 ? aeroport_depart : segments[idx - 1].aeroport_arrivee;
      return {
        aeroport_depart: dep.toUpperCase(),
        aeroport_arrivee: seg.aeroport_arrivee.toUpperCase(),
        temps_prev_min: parseInt(seg.temps_prev_min, 10),
        heure_depart: seg.heure_depart.trim() || undefined,
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

  function advanceStep() {
    setError(null);
    if (step === 0) {
      if (!numero_vol.trim() || !/^\d{1,4}$/.test(numero_vol)) { setError('Choisissez un numéro de 1 à 4 chiffres, par exemple 01.'); return; }
      if (!selectedAircraft || !aeroport_depart) { setError('Choisissez un appareil disponible et son aéroport de départ.'); return; }
    }
    if (step === 1) {
      for (let i=0;i<segments.length;i++) {
        const seg=segments[i];
        if (!seg.aeroport_arrivee) { setError('Trajet '+(i+1)+' : choisissez une destination.'); return; }
        if (!/^\d+$/.test(seg.temps_prev_min) || Number(seg.temps_prev_min)<1 || Number(seg.temps_prev_min)>1440) { setError('Trajet '+(i+1)+' : indiquez une durée entière de 1 à 1 440 minutes.'); return; }
        if (seg.heure_depart && !/^([01]\d|2[0-3]):[0-5]\d$/.test(seg.heure_depart)) { setError('Trajet '+(i+1)+' : utilisez HH:MM en UTC, par exemple 14:30.'); return; }
        if (seg.type_vol==='VFR' && !seg.intentions_vol.trim()) { setError('Trajet '+(i+1)+' : décrivez vos intentions de vol à vue.'); return; }
        if (seg.type_vol==='IFR' && (!seg.sid_depart.trim() || !seg.star_arrivee.trim())) { setError('Trajet '+(i+1)+' : renseignez la SID et la STAR prévues.'); return; }
      }
    }
    if(step===1){const routingError=medevacRoutingError(missionType,segments.map((s,i)=>({aeroport_depart:segmentDepart(i),aeroport_arrivee:s.aeroport_arrivee})),bases);if(routingError){setError(routingError);return;}}
    setStep(Math.min(2,step+1));
  }

  async function handleSubmit(e: React.FormEvent, forceNoAtc = false) {
    e.preventDefault();
    if (step < 2) { advanceStep(); return; }
    if (submitBusyRef.current || success) return;
    setError(null); setSuccess(null);

    if (!aeroport_depart) { setError('Sélectionnez l\'aéroport de départ.'); return; }
    if (!numero_vol.trim() || !/^\d+$/.test(numero_vol.trim())) { setError('Numéro de vol requis (chiffres uniquement). Le préfixe MEDEVAC est ajouté automatiquement.'); return; }
    if (!siavi_avion_id) { setError('Sélectionnez un avion SIAVI.'); return; }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const dep = i === 0 ? aeroport_depart : segments[i - 1].aeroport_arrivee;
      if (!seg.aeroport_arrivee) { setError(`Segment ${i + 1} : destination requise.`); return; }

      if (!seg.temps_prev_min || parseInt(seg.temps_prev_min, 10) < 1) { setError(`Segment ${i + 1} : temps prévu invalide.`); return; }
      if (seg.type_vol === 'IFR' && (!seg.sid_depart.trim() || !seg.star_arrivee.trim())) { setError(`Segment ${i + 1} : SID et STAR requises pour IFR.`); return; }
      if (seg.type_vol === 'VFR' && !seg.intentions_vol.trim()) { setError(`Segment ${i + 1} : intentions de vol requises pour VFR.`); return; }
    }

    const routingError=medevacRoutingError(missionType,segments.map((s,i)=>({aeroport_depart:segmentDepart(i),aeroport_arrivee:s.aeroport_arrivee})),bases);
    if(routingError){setError(routingError);return;}
    submitBusyRef.current = true;
    setLoading(true);

    try {
      const payload = {
        mission_type: missionType,
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
        setSuccess(`Vol ${missionType==='evacuation'?'MEDEVAC':'SIAVI'}${numero_vol.trim()} déposé${suffixe} ! Contactez ${data.atc_contact.nom} sur ${data.atc_contact.position}${data.atc_contact.frequence ? ` (${data.atc_contact.frequence})` : ''}.`);
      } else {
        setSuccess(`Vol MEDEVAC${numero_vol.trim()} déposé en autosurveillance${suffixe}.`);
      }

      setTimeout(() => {
        startTransition(() => router.push(`/siavi/medevac/vol/${data.id}`));
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
    <form noValidate onSubmit={handleSubmit} className="space-y-6 siavi-workspace siavi-enter">
      <header className="rounded-2xl border border-rose-500/30 bg-slate-900 p-5"><p className="text-xs font-bold uppercase tracking-widest text-rose-300">Préparer un vol du service SIAVI</p><h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-bold text-white outline-none">{['1. Choisir votre appareil','2. Construire vos trajets','3. Vérifier et déposer'][step]}</h2><ol aria-label="Étapes de création" className="mt-5 grid grid-cols-3 gap-2">{['Appareil','Trajets','Vérification'].map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={`rounded-xl border p-3 text-sm font-semibold ${step===i?'border-rose-400 bg-rose-950 text-white':'border-slate-700 text-slate-400'}`}>{i<step?'✓':i+1} · {label}</li>)}</ol><p className="mt-4 text-sm leading-relaxed text-slate-300">{missionType==='evacuation'?'Une évacuation peut comporter plusieurs trajets : rejoindre le patient, le transporter vers un hôpital, puis éventuellement revenir à la base. Exemple : IRFD → IBTH → ITKO. Vous gardez le même appareil pour toute la mission.':'Sans évacuation sanitaire, chaque trajet doit se terminer à une base MEDEVAC achetée. Une reconnaissance peut partir et revenir à la même base. Depuis un hôpital, prévoyez le retour à une base.'}</p></header>
      <div ref={feedbackRef} tabIndex={-1} className="space-y-4 outline-none">{error && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-rose-950/40 border border-rose-500/25 text-rose-200">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-950/50 border border-emerald-200 text-emerald-200">
          <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{success}</p>
        </div>
      )}

      {showNoAtcConfirm && (
        <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-300 space-y-3">
          <p className="text-amber-100 text-sm font-medium">Aucun ATC en ligne. Voulez-vous décoller en autosurveillance ?</p>
          <div className="flex gap-2">
            <button type="button" onClick={(e) => { setShowNoAtcConfirm(false); handleSubmit(e as unknown as React.FormEvent, true); }}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
              Continuer en autosurveillance
            </button>
            <button type="button" onClick={() => setShowNoAtcConfirm(false)}
              className="px-4 py-2 bg-amber-200 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-300">
              Annuler
            </button>
          </div>
        </div>
      )}

      </div><section hidden={step!==0}><div className="rounded-xl bg-slate-900 border border-rose-500/25 shadow-sm p-6 space-y-5">
        <h2 className="text-lg font-semibold text-rose-100 flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-rose-300" />
          Appareil et départ de la mission
        </h2><fieldset className="space-y-3 rounded-xl border border-slate-600 p-4"><legend className="px-2 font-semibold text-white">Nature du vol</legend><label className="flex items-start gap-3 text-sm text-slate-200"><input type="radio" name="mission-type" checked={missionType==='evacuation'} onChange={()=>setMissionType('evacuation')} className="mt-1"/><span>Évacuation sanitaire — MEDEVAC<br/><span className="text-slate-400">Prise en charge possible sur un autre terrain ; fin de mission à un hôpital ou une base MEDEVAC.</span></span></label><label className="flex items-start gap-3 text-sm text-slate-200"><input type="radio" name="mission-type" checked={missionType==='service'} onChange={()=>setMissionType('service')} className="mt-1"/><span>Vol de service SIAVI — reconnaissance ou retour à base<br/><span className="text-slate-400">Sans évacuation sanitaire : chaque trajet doit se terminer à une base MEDEVAC. Une boucle base → même base est autorisée.</span></span></label></fieldset>

        {!flotte.length && <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">Aucun appareil disponible pour le moment. Consultez la flotte pour vérifier les missions en cours et les appareils en entretien.</p>}
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1">Indicatif d&apos;appel</label>
          <div className="flex">
            <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-rose-400/40 bg-rose-950/60 text-rose-200 font-mono font-bold text-sm">
              {missionType==='evacuation'?'MEDEVAC':'SIAVI'}
            </span>
            <input
              type="text"
              value={numero_vol}
              onChange={e => setNumeroVol(e.target.value.replace(/\D/g, ''))}
              placeholder="01"
              className="flex-1 px-3 py-2 rounded-r-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
              aria-label="Numéro de mission MEDEVAC"
              maxLength={4}
            />
          </div><p className="mt-2 text-xs text-slate-400">Saisissez seulement les chiffres : 01 donne {missionType==='evacuation'?'MEDEVAC01':'SIAVI01'}.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1">
            <MapPin className="inline h-4 w-4 mr-1 text-rose-300" />
            Aéroport de départ initial
          </label>
          <select aria-label="Aéroport de départ initial" value={aeroport_depart} onChange={e => {setAeroportDepart(e.target.value);setSegments(prev=>prev.map((s,i)=>i===0?{...s,sid_depart:'',selectedSidRoute:null,sidCustomMode:false}:s));}}
            className="min-h-12 w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-900">
            <option value="">Choisir...</option>
            {aeroports.map(a => <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1">
            <Plane className="inline h-4 w-4 mr-1" />
            Appareil MEDEVAC · avion ou hélicoptère
          </label>
          {avionsDisponibles.length === 0 ? (
            <p className="text-sm text-rose-300 italic">
              {aeroport_depart
                ? `Aucun avion SIAVI disponible à ${aeroport_depart.toUpperCase()}`
                : 'Sélectionnez un aéroport de départ'}
            </p>
          ) : (
            <select aria-label="Appareil MEDEVAC" value={siavi_avion_id} onChange={e => {setSiaviAvionId(e.target.value); const a=flotte.find(a=>a.id===e.target.value); if(a)setAeroportDepart(a.aeroport_actuel);}}
              className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-900">
              <option value="">Choisir un appareil...</option>
              {avionsDisponibles.map(a => {
                const ta = firstTypeAvion(a.types_avion);
                return (
                  <option key={a.id} value={a.id}>
                    {a.immatriculation} — {ta?.nom || '?'} ({a.aeroport_actuel}, {Number(a.usure_percent)}% de santé)
                  </option>
                );
              })}
            </select>
          )}
        </div>
      {selectedAircraft&&<p className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-sm text-emerald-100">{firstTypeAvion(selectedAircraft.types_avion)?.categorie==='helicoptere'?'Hélicoptère':'Avion'} · {selectedAircraft.immatriculation} · Position {selectedAircraft.aeroport_actuel} · Santé {Number(selectedAircraft.usure_percent)} %. Le départ doit correspondre à cette position.</p>}</div>

      </section>
      <section hidden={step!==1} className="space-y-5"><div className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-4 text-sm leading-relaxed text-sky-100"><p className="font-semibold">Un trajet = un décollage et un atterrissage</p><p className="mt-2">Ajoutez seulement les trajets que vous allez effectuer, dans l’ordre. Le départ du trajet suivant reprend automatiquement votre dernière destination. Jusqu’à 5 trajets par mission.</p><p className="mt-2">La durée correspond au temps de vol de ce trajet, pas à la mission entière. Les horaires UTC sont facultatifs.</p></div>
      <aside className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-100"><p className="font-semibold">Où terminer la mission ?</p><p className="mt-2">Bases MEDEVAC achetées : {bases.length?bases.join(', '):'aucune base achetée pour le moment'}.</p><p className="mt-2">Hôpitaux (évacuation uniquement) : {Object.entries(MEDEVAC_HOSPITALS).map(([code,name])=>code+' — '+name).join(' ; ')}.</p><p className="mt-2">Exemples : IRFD → IBTH → ITKO pour une évacuation ; IRFD → IKFL → IMLR → IRFD pour une prise en charge avec retour ; IRFD → IRFD pour une reconnaissance si IRFD est une base achetée.</p></aside>
      {/* Segments */}
      {segments.map((seg, index) => {
        const dep = segmentDepart(index);
        const sidKey = dep.toUpperCase();
        const starKey = seg.aeroport_arrivee.toUpperCase();
        const sidList = sidCache[sidKey] || [];
        const starList = starCache[starKey] || [];

        return (
          <div key={index} className="rounded-xl bg-slate-900 border border-rose-500/25 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-rose-100 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-600 text-white text-sm font-bold">
                  {index + 1}
                </span>
                Trajet {index + 1}
                {dep && seg.aeroport_arrivee && (
                  <span className="text-sm text-slate-400 font-normal">
                    <span className="font-mono text-rose-200">{dep.toUpperCase()}</span>
                    <ArrowRight className="inline h-3 w-3 mx-1" />
                    <span className="font-mono text-rose-200">{seg.aeroport_arrivee.toUpperCase()}</span>
                  </span>
                )}
              </h3>
      {segments.length > 1 && (
                <button type="button" onClick={() => removeSegment(index)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-rose-300 hover:bg-rose-950/40 text-sm">
                  <Trash2 className="h-4 w-4" />
                  Retirer
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Départ du trajet</label>
                <div className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-800 text-slate-200 font-mono text-sm">
                  {dep ? `${dep.toUpperCase()}` : <span className="italic text-slate-400">Défini par le segment précédent</span>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Destination · {missionType==='service'?'base MEDEVAC requise':index===segments.length-1?'hôpital ou base pour finir':'escale de prise en charge possible'}</label>
                <select aria-label={`Destination du trajet ${index+1}`} value={seg.aeroport_arrivee} onChange={e => updateSegment(index, { aeroport_arrivee: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-900">
                  <option value="">Choisir...</option>
                  {aeroports.filter(a => missionType==='evacuation'||bases.includes(a.code)).map(a => <option key={a.code} value={a.code}>{a.code} — {a.nom}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Temps prévu (min)</label>
                <input aria-label={`Durée du trajet ${index+1} en minutes`} type="number" value={seg.temps_prev_min} onChange={e => updateSegment(index, { temps_prev_min: e.target.value })}
                  min="1" placeholder="30"
                  className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">
                  Heure de départ (UTC) <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <div className="relative">
                  <input
                    type="text" inputMode="text" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} title="Heure UTC au format HH:MM, par exemple 14:30"
                    value={seg.heure_depart}
                    onChange={e => updateSegment(index, { heure_depart: e.target.value })}
                    placeholder="14:30"
                    className="w-full px-3 py-2 pr-10 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase tracking-widest text-slate-400">UTC</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Affichée dans la case <span className="font-mono text-rose-300/80">CTOT</span> du strip ATC.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Règles de vol</label>
                <div className="flex gap-2">
                  {(['VFR', 'IFR'] as const).map(tv => (
                    <button key={tv} type="button" onClick={() => updateSegment(index, { type_vol: tv })}
                      className={`min-h-12 flex-1 py-2 rounded-lg border text-sm font-bold transition-all ${seg.type_vol === tv
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-slate-900 border-rose-400/40 text-rose-200 hover:bg-rose-950/40'}`}>
                      {tv==='VFR'?'VFR · à vue':'IFR · instruments'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {seg.type_vol === 'VFR' && (
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1">Intentions de vol · où allez-vous et à quelle altitude ?</label>
                <textarea aria-label={`Intentions VFR du trajet ${index+1}`} value={seg.intentions_vol} onChange={e => updateSegment(index, { intentions_vol: e.target.value })}
                  rows={2} placeholder="Exemple RP : évacuation vers IBTH, transit côtier à 1 500 ft, arrivée à vue. Adaptez à votre trajet."
                  className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
              </div>
            )}

            {seg.type_vol === 'IFR' && (
              <div className="space-y-4 p-4 rounded-lg bg-rose-950/40 border border-rose-500/25"><p className="text-sm leading-relaxed text-slate-300">IFR : choisissez la procédure de départ (SID) et d’arrivée (STAR), puis votre route et niveau prévus. La saisie libre sert uniquement à renseigner une procédure prévue ou convenue avec l’ATC ; ne choisissez pas une procédure au hasard.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-1">SID de départ ({dep.toUpperCase() || '?'})</label>
                    {sidList.length > 0 && !seg.sidCustomMode ? (
                      <select
                        value={sidList.some(s => s.nom === seg.sid_depart) ? seg.sid_depart : ''}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__custom__') { updateSegment(index, { sidCustomMode: true, sid_depart: '', selectedSidRoute: null }); return; }
                          const proc = sidList.find(s => s.nom === v);
                          updateSegment(index, { sid_depart: v, selectedSidRoute: proc?.route || null });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-900">
                        <option value="">Choisir SID...</option>
                        {sidList.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                        <option value="__custom__">Saisie libre...</option>
                      </select>
                    ) : (
                      <input type="text" value={seg.sid_depart} onChange={e => updateSegment(index, { sid_depart: e.target.value })}
                        placeholder="Ex: RADAR VECTORS"
                        className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-200 mb-1">STAR d&apos;arrivée ({seg.aeroport_arrivee.toUpperCase() || '?'})</label>
                    {starList.length > 0 && !seg.starCustomMode ? (
                      <select
                        value={starList.some(s => s.nom === seg.star_arrivee) ? seg.star_arrivee : ''}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '__custom__') { updateSegment(index, { starCustomMode: true, star_arrivee: '', selectedStarRoute: null }); return; }
                          const proc = starList.find(s => s.nom === v);
                          updateSegment(index, { star_arrivee: v, selectedStarRoute: proc?.route || null });
                        }}
                        className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-900">
                        <option value="">Choisir STAR...</option>
                        {starList.map(s => <option key={s.id} value={s.nom}>{s.nom}</option>)}
                        <option value="__custom__">Saisie libre...</option>
                      </select>
                    ) : (
                      <input type="text" value={seg.star_arrivee} onChange={e => updateSegment(index, { star_arrivee: e.target.value })}
                        placeholder="Ex: RADAR VECTORS"
                        className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500" />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1">Route entre la SID et la STAR (facultatif)</label>
                  <input type="text" value={seg.manualRoutePart}
                    onChange={e => updateSegment(index, { manualRoutePart: e.target.value })}
                    placeholder="DCT VOR1 AWY VOR2..."
                    className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono text-sm" />
                </div>
                <div>
                  <p className="mb-3 break-words text-xs text-slate-400">Route complète : {buildRouteWithManual(seg.selectedSidRoute,seg.manualRoutePart,seg.selectedStarRoute)||'À compléter'}</p><label className="block text-sm font-medium text-slate-200 mb-1">Niveau de croisière</label>
                  <input type="text" value={seg.niveau_croisiere} onChange={e => updateSegment(index, { niveau_croisiere: e.target.value })}
                    placeholder="Ex: 080 (= FL080, 8 000 ft)"
                    className="w-full px-3 py-2 rounded-lg border border-rose-400/40 text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono" />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {selectedAircraft && <section className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-100"><p className="font-semibold">Recette estimée : {estimatedRevenue.toLocaleString('fr-FR')} F$</p><p className="mt-1">50 % au SIAVI, 50 % à partager entre les participants du rapport. Estimation sur {plannedMinutes} min prévues ; versement final selon la durée enregistrée, au maximum {firstTypeAvion(selectedAircraft.types_avion)?.categorie==='helicoptere'?'800 000':'2 000 000'} F$ par mission.</p></section>}
{segments.length<MAX_SEGMENTS && returnBase && segments[segments.length-1].aeroport_arrivee && segments[segments.length-1].aeroport_arrivee!==returnBase && <button type="button" onClick={()=>setSegments(prev=>[...prev,{...emptySegment(),aeroport_arrivee:returnBase}])} className="min-h-12 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 font-semibold text-slate-200">Ajouter un trajet de retour à la base {returnBase}</button>}
      {/* Bouton ajouter destination */}
      {segments.length < MAX_SEGMENTS && (
        <button type="button" onClick={addSegment}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-rose-400/40 text-rose-200 hover:border-red-500 hover:bg-rose-950/40 transition-colors font-medium">
          <Plus className="h-4 w-4" />
          Ajouter le trajet suivant ({segments.length + 1}/{MAX_SEGMENTS})
        </button>
      )}

      {segments.length > 1 && (
        <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-200 text-amber-100 text-sm">
          <p className="font-semibold mb-1">Mission en {segments.length} trajets</p>
          <p>Seul le 1<sup>er</sup> segment sera envoyé à l&apos;ATC dès le dépôt. Après chaque atterrissage, clôturez le segment puis activez le suivant depuis votre console MEDEVAC en choisissant la SID/STAR (ou vos intentions VFR).</p>
        </div>
      )}

      </section>
      {step===2 && <section className="space-y-5 rounded-2xl border border-rose-500/30 bg-slate-900 p-5"><h3 className="text-xl font-bold text-white">Votre vol {missionType==='evacuation'?'MEDEVAC':'SIAVI'}{numero_vol}</h3><p className="text-sm font-semibold text-rose-200">{missionType==='evacuation'?'Évacuation sanitaire — MEDEVAC':'Vol de service SIAVI — hors évacuation'}</p><p className="text-slate-300">{selectedAircraft?.immatriculation} · {firstTypeAvion(selectedAircraft?.types_avion)?.nom}</p><ol className="space-y-3">{segments.map((seg,i)=><li key={i} className="rounded-xl border border-slate-700 p-4"><p className="font-mono font-bold text-white">{i+1}. {segmentDepart(i)} → {seg.aeroport_arrivee}</p><p className="mt-2 text-sm text-slate-300">{seg.type_vol} · {seg.temps_prev_min} min {seg.heure_depart?'· '+seg.heure_depart+' UTC':''}</p><p className="mt-2 break-words text-sm text-slate-400">{seg.type_vol==='VFR'?seg.intentions_vol:[seg.sid_depart,seg.route_ifr,seg.star_arrivee].filter(Boolean).join(' · ')}</p></li>)}</ol><div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4"><h3 className="font-semibold text-cyan-100">Comment sera suivi votre premier départ ?</h3><label className="mt-3 flex items-start gap-3 text-sm text-slate-200"><input type="radio" name="atc-mode" checked={!vol_sans_atc} onChange={()=>setVolSansAtc(false)} className="mt-1"/><span>Demander la prise en charge ATC<br/><span className="text-slate-400">Le site cherche un contrôleur au départ. S’il n’y en a aucun, vous pourrez confirmer l’autosurveillance.</span></span></label><label className="mt-4 flex items-start gap-3 text-sm text-slate-200"><input type="radio" name="atc-mode" checked={vol_sans_atc} onChange={()=>setVolSansAtc(true)} className="mt-1"/><span>Vol sans ATC · autosurveillance<br/><span className="text-slate-400">À utiliser en l’absence de contrôle : vous gérez le suivi du vol depuis votre console MEDEVAC.</span></span></label></div><div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-emerald-100"><p className="font-semibold">Estimation de la mission : {estimatedRevenue.toLocaleString('fr-FR')} F$ pour {plannedMinutes} min prévues</p><p className="mt-2">50 % au SIAVI ; 50 % à partager entre les participants choisis dans le rapport final. La rémunération réelle dépend de la durée enregistrée, avec un plafond de {firstTypeAvion(selectedAircraft?.types_avion)?.categorie==='helicoptere'?'800 000':'2 000 000'} F$.</p></div><div className="text-sm leading-relaxed text-slate-300"><h3 className="font-semibold text-white">Après le dépôt</h3><ol className="mt-2 list-decimal space-y-2 pl-5"><li>Ouvrez votre console MEDEVAC pour le transpondeur et le suivi du vol. Avec un ATC, attendez sa prise en charge et suivez ses instructions.</li><li>Après chaque atterrissage, clôturez le trajet, puis activez le suivant s’il y en a un.</li><li>Après le dernier trajet, remplissez le rapport et sélectionnez les participants pour répartir les salaires.</li></ol></div></section>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4">{step>0?<button type="button" disabled={loading||!!success} onClick={()=>{setStep(step-1);setError(null);setShowNoAtcConfirm(false);}} className="min-h-12 rounded-xl border border-slate-600 px-5 font-semibold text-slate-200">Retour · modifier</button>:<Link href="/siavi/flotte" className="min-h-12 rounded-xl border border-slate-600 px-5 py-3 text-slate-200">Consulter la flotte</Link>}{step<2&&<button type="button" onClick={advanceStep} className="min-h-12 rounded-xl bg-rose-700 px-5 font-bold text-white">{step===0?'Continuer vers les trajets':'Vérifier ma mission'} →</button>}</div>
      {step===2 && <button type="submit" disabled={loading || !!success}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 disabled:opacity-50 text-white rounded-xl font-bold text-lg shadow-lg transition-all">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <HeartPulse className="h-5 w-5" />}
        Créer la mission et ouvrir ma console
      </button>}
    </form>
  );
}
