'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { addMinutes, subMinutes } from 'date-fns';
import RecordUtcInput from '@/components/logbook/RecordUtcInput';
import RecordFlightSummary from '@/components/logbook/RecordFlightSummary';
import { AEROPORTS_VOL_CIVIL } from '@/lib/aeroports-ptfs';
import { COMPAGNIE_MEDEVAC_SIAVI } from '@/lib/vol-compagnie-libelle';

import type { PlanPreFill } from './NouveauVolClient';

type TypeAvion = { id: string; nom: string; constructeur: string };
type Compagnie = { id: string; nom: string };
type Instructeur = { id: string; identifiant: string };

function parseUtcLocal(s: string): Date | null {
  if (!s) return null;
  const z = /Z$/.test(s) ? s : s + 'Z';
  const d = new Date(z);
  return isNaN(d.getTime()) ? null : d;
}

type Profil = { id: string; identifiant: string };

export default function VolForm({
  typesAvion,
  compagnies,
  instructeurs,
  autresProfiles,
  planPreFill,
  planId,
  onClearPlan,
}: {
  typesAvion: TypeAvion[];
  compagnies: Compagnie[];
  instructeurs: Instructeur[];
  autresProfiles: Profil[];
  planPreFill?: PlanPreFill | null;
  planId?: string | null;
  onClearPlan?: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [type_avion_id, setTypeAvionId] = useState('');
  const [compagnie_id, setCompagnieId] = useState('');
  const [medevacSiavi, setMedevacSiavi] = useState(false);
  const [pourMoiMemo, setPourMoiMemo] = useState(false);
  const [aeroport_depart, setAeroportDepart] = useState('');
  const [aeroport_arrivee, setAeroportArrivee] = useState('');
  const [duree_minutes, setDureeMinutes] = useState('');
  const [heure_mode, setHeureMode] = useState<'depart' | 'arrivee'>('depart');
  const [heure_utc, setHeureUtc] = useState('');
  const [type_vol, setTypeVol] = useState<'IFR' | 'VFR' | 'Instruction'>('VFR');
  const [instructeur_id, setInstructeurId] = useState('');
  const [instruction_type, setInstructionType] = useState('');
  const [commandant_bord, setCommandantBord] = useState('');
  const [role_pilote, setRolePilote] = useState<'Pilote' | 'Co-pilote'>('Pilote');
  const [pilote_id, setPiloteId] = useState('');
  const [copilote_id, setCopiloteId] = useState('');
  const [callsign, setCallsign] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!planPreFill) return;
    setAeroportDepart(planPreFill.aeroport_depart);
    setAeroportArrivee(planPreFill.aeroport_arrivee);
    setDureeMinutes(String(planPreFill.duree_minutes));
    setHeureUtc(planPreFill.heure_utc);
    setHeureMode('depart');
    setTypeVol(planPreFill.type_vol);
    setCallsign(planPreFill.callsign);
  }, [planPreFill]);

  function clearPlanFields() {
    setAeroportDepart('');
    setAeroportArrivee('');
    setDureeMinutes('');
    setHeureUtc('');
    setHeureMode('depart');
    setTypeVol('VFR');
    setCallsign('');
    onClearPlan?.();
  }

  const compagnieLibelle = medevacSiavi
    ? COMPAGNIE_MEDEVAC_SIAVI
    : pourMoiMemo
      ? 'Pour moi-même'
      : (compagnies.find((c) => c.id === compagnie_id)?.nom ?? '');

  function computeDepartUtc(): string {
    const d = parseUtcLocal(heure_utc);
    if (!d) return '';
    if (heure_mode === 'depart') return d.toISOString();
    const dur = parseInt(duree_minutes, 10);
    if (isNaN(dur) || dur < 1) return d.toISOString();
    return subMinutes(d, dur).toISOString();
  }

  function handleHeureModeChange(m: 'depart' | 'arrivee') {
    if (m === heure_mode) return;
    const dur = parseInt(duree_minutes, 10);
    const d = parseUtcLocal(heure_utc);
    if (d && !isNaN(dur) && dur >= 1) {
      setHeureUtc((m === 'arrivee' ? addMinutes(d, dur) : subMinutes(d, dur)).toISOString().slice(0, 16));
    }
    setHeureMode(m);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    const d = parseInt(duree_minutes, 10);
    if (!type_avion_id || (!pourMoiMemo && !medevacSiavi && !compagnie_id) || !aeroport_depart || !aeroport_arrivee || isNaN(d) || d < 1 || !heure_utc || !commandant_bord.trim()) {
      setError('Veuillez remplir tous les champs requis.');
      return;
    }
    if (type_vol === 'Instruction' && (!instructeur_id || !instruction_type.trim())) {
      setError('Pour un vol d\'instruction : choisir l\'instructeur et indiquer le type d\'instruction.');
      return;
    }
    if (role_pilote === 'Co-pilote' && type_vol !== 'Instruction' && !pilote_id) {
      setError('Qui était le pilote (commandant de bord) ?');
      return;
    }
    const depart_utc = computeDepartUtc();
    if (!depart_utc) {
      setError('Heure invalide.');
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    let registered = false;
    try {
      const res = await fetch('/api/vols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_avion_id,
          compagnie_id: pourMoiMemo || medevacSiavi ? null : compagnie_id,
          compagnie_libelle: compagnieLibelle,
          aeroport_depart,
          aeroport_arrivee,
          duree_minutes: d,
          depart_utc,
          type_vol,
          instructeur_id: type_vol === 'Instruction' ? instructeur_id : null,
          instruction_type: type_vol === 'Instruction' ? instruction_type.trim() : null,
          commandant_bord: commandant_bord.trim(),
          role_pilote,
          pilote_id: role_pilote === 'Co-pilote' ? (type_vol === 'Instruction' ? instructeur_id : pilote_id) : undefined,
          copilote_id: type_vol !== 'Instruction' && role_pilote === 'Pilote' && copilote_id ? copilote_id : undefined,
          callsign: callsign.trim() || undefined,
          plan_id: planId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push(data.already_registered ? '/logbook?enregistrement=existant' : '/logbook?enregistrement=transmis');
      startTransition(() => router.refresh());
      registered = true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      if (!registered) {
        submittingRef.current = false;
        setLoading(false);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={loading} className="space-y-6 rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
      {planId && onClearPlan && (
        <div className="flex justify-end -mt-1 mb-1">
          <button
            type="button"
            onClick={clearPlanFields}
            className="text-xs text-slate-500 hover:text-slate-300 underline"
          >
            Ne pas copier les informations du plan de vol
          </button>
        </div>
      )}
      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-4 border-b border-slate-700 pb-2 text-xs font-semibold uppercase tracking-wider text-sky-300">01 · Appareil et exploitant</legend>
      <div>
        <label className="label">Type d&apos;avion *</label>
        <select aria-label="Type d’avion"
          className="input min-h-11 min-w-0 w-full"
          value={type_avion_id}
          onChange={(e) => setTypeAvionId(e.target.value)}
          required
        >
          <option value="">— Choisir —</option>
          {typesAvion.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom} {t.constructeur ? `(${t.constructeur})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Compagnie aérienne *</label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              id="moi"
              checked={pourMoiMemo}
              onChange={(e) => { setPourMoiMemo(e.target.checked); if (e.target.checked) { setCompagnieId(''); setMedevacSiavi(false); } }}
            />
            <label htmlFor="moi" className="text-sm text-slate-300">Pour moi-même</label>
          </span>
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              id="medevac"
              checked={medevacSiavi}
              onChange={(e) => {
                setMedevacSiavi(e.target.checked);
                if (e.target.checked) {
                  setPourMoiMemo(false);
                  setCompagnieId('');
                }
              }}
            />
            <label htmlFor="medevac" className="text-sm text-slate-300">Vol MEDEVAC (SIAVI)</label>
          </span>
        </div>
        <p className="text-xs text-slate-500 -mt-1 mb-2">Cochez cette case si le vol ne relève pas d&apos;une compagnie de la liste (ex. mission sanitaire SIAVI).</p>
        {!pourMoiMemo && !medevacSiavi && (
          <select aria-label="Compagnie aérienne"
            className="input min-h-11 min-w-0 w-full"
            value={compagnie_id}
            onChange={(e) => setCompagnieId(e.target.value)}
            required
          >
            <option value="">— Choisir —</option>
            {compagnies.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        )}
      </div>

      </fieldset>
      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-4 border-b border-slate-700 pb-2 text-xs font-semibold uppercase tracking-wider text-sky-300">02 · Trajet et horaires UTC</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Aéroport de départ *</label>
          <select aria-label="Aéroport de départ" className="input min-h-11 min-w-0 w-full" value={aeroport_depart} onChange={(e) => setAeroportDepart(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_VOL_CIVIL.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Aéroport d&apos;arrivée *</label>
          <select aria-label="Aéroport d’arrivée" className="input min-h-11 min-w-0 w-full" value={aeroport_arrivee} onChange={(e) => setAeroportArrivee(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_VOL_CIVIL.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Durée (minutes) *</label>
          <input aria-label="Durée du vol en minutes"
            type="number"
            className="input min-h-11 min-w-0 w-full"
            value={duree_minutes}
            onChange={(e) => setDureeMinutes(e.target.value)}
            min={1}
            required
          />
        </div>
        <div className="space-y-2">
          <span className="label block">Heure (UTC) *</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="heure_mode"
                checked={heure_mode === 'depart'}
                onChange={() => handleHeureModeChange('depart')}
                className="rounded"
              />
              Départ
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="heure_mode"
                checked={heure_mode === 'arrivee'}
                onChange={() => handleHeureModeChange('arrivee')}
                className="rounded"
              />
              Arrivée
            </label>
          </div>
          <RecordUtcInput id="record-time" value={heure_utc} onChange={setHeureUtc} required />
          {heure_utc && parseInt(duree_minutes, 10) >= 1 && (() => {
            const dur = parseInt(duree_minutes, 10);
            const pd = parseUtcLocal(heure_utc);
            if (!pd || isNaN(dur)) return null;
            const other = heure_mode === 'depart' ? addMinutes(pd, dur) : subMinutes(pd, dur);
            return (
              <p className="text-xs text-slate-500">
                {heure_mode === 'depart' ? 'Arrivée calculée : ' : 'Départ calculé : '}
                {other.toISOString().slice(0,10)} · {String(other.getUTCHours()).padStart(2, '0')}:{String(other.getUTCMinutes()).padStart(2, '0')} UTC
              </p>
            );
          })()}
        </div>
      </div>

      </fieldset>
      <fieldset className="min-w-0 space-y-4">
        <legend className="mb-4 border-b border-slate-700 pb-2 text-xs font-semibold uppercase tracking-wider text-sky-300">03 · Activité et équipage</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Type de vol *</label>
          <select aria-label="Type de vol" className="input min-h-11 min-w-0 w-full" value={type_vol} onChange={(e) => setTypeVol(e.target.value as 'IFR' | 'VFR' | 'Instruction')}>
            <option value="VFR">VFR</option>
            <option value="IFR">IFR</option>
            <option value="Instruction">Instruction</option>
          </select>
        </div>
        <div>
          <label className="label">Rôle *</label>
          <select aria-label="Fonction à bord" className="input min-h-11 min-w-0 w-full" value={role_pilote} onChange={(e) => { setRolePilote(e.target.value as 'Pilote' | 'Co-pilote'); if (e.target.value === 'Pilote') { setPiloteId(''); } else setCopiloteId(''); }}>
            <option value="Pilote">Pilote</option>
            <option value="Co-pilote">Co-pilote</option>
          </select>
        </div>
      </div>

      {role_pilote === 'Pilote' && type_vol !== 'Instruction' && (
        <div>
          <label className="label">Qui était votre co-pilote ? (optionnel)</label>
          <select aria-label="Copilote" className="input min-h-11 min-w-0 w-full" value={copilote_id} onChange={(e) => setCopiloteId(e.target.value)}>
            <option value="">— Aucun —</option>
            {autresProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.identifiant}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">Le co-pilote recevra une notification pour confirmer ce vol. Après sa confirmation, il sera envoyé aux admins et apparaîtra dans les deux logbooks.</p>
        </div>
      )}

      {role_pilote === 'Co-pilote' && type_vol !== 'Instruction' && (
        <div>
          <label className="label">Qui était le pilote (commandant de bord) ? *</label>
          <select aria-label="Pilote" className="input min-h-11 min-w-0 w-full" value={pilote_id} onChange={(e) => setPiloteId(e.target.value)}>
            <option value="">— Choisir —</option>
            {autresProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.identifiant}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">Le pilote recevra une notification pour confirmer ce vol. Après sa confirmation, il sera envoyé aux admins et apparaîtra dans les deux logbooks.</p>
        </div>
      )}

      {type_vol === 'Instruction' && (
        <div className="space-y-4 rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <div>
            <label className="label">Instructeur avec qui vous avez fait le vol *</label>
            <select aria-label="Instructeur" className="input min-h-11 min-w-0 w-full" value={instructeur_id} onChange={(e) => setInstructeurId(e.target.value)}>
              <option value="">— Choisir —</option>
              {instructeurs.map((a) => (
                <option key={a.id} value={a.id}>{a.identifiant}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type de vol d&apos;instruction *</label>
            <input aria-label="Objet de l’instruction"
              type="text"
              className="input min-h-11 min-w-0 w-full"
              value={instruction_type}
              onChange={(e) => setInstructionType(e.target.value)}
              placeholder="ex. IFR initial, VFR de nuit, perfectionnement..."
            />
          </div>
        </div>
      )}

      <div>
        <label className="label">Nom / pseudo du commandant de bord *</label>
        <input aria-label="Commandant de bord"
          type="text"
          className="input min-h-11 min-w-0 w-full"
          value={commandant_bord}
          onChange={(e) => setCommandantBord(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="label">Callsign / N° de vol</label>
        <input aria-label="Indicatif du vol"
          type="text"
          className="input min-h-11 min-w-0 w-full"
          value={callsign}
          onChange={(e) => setCallsign(e.target.value)}
          placeholder="ex. AF123, F-GKTA… (optionnel)"
        />
      </div>

      </fieldset>
      <div className="border-t border-slate-700 pt-5"><h2 className="mb-3 text-sm font-semibold text-slate-200">Récapitulatif avant transmission</h2><RecordFlightSummary departure={aeroport_depart} arrival={aeroport_arrivee} departureUtc={computeDepartUtc()} durationMinutes={parseInt(duree_minutes,10)} aircraft={typesAvion.find(t=>t.id===type_avion_id)?.nom ?? ''} company={compagnieLibelle} callsign={callsign} role={role_pilote}/><p className="mt-3 text-xs leading-relaxed text-slate-400">Les heures sont comptabilisées après la validation requise. Vérifiez le rôle de chaque membre d’équipage et les horaires UTC.</p></div>
      {error && <p role="alert" className="rounded-lg border border-red-800/60 bg-red-950/20 p-3 text-sm text-red-200">{error}</p>}
      <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50" disabled={loading}>
        {loading ? 'Transmission…' : 'Transmettre le vol pour validation'}
      </button>
    </form>
  );
}
