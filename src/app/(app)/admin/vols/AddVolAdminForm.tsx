'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addMinutes, subMinutes } from 'date-fns';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type T = { id: string; nom: string; constructeur?: string };
type C = { id: string; nom: string };
type P = { id: string; identifiant: string };

function parseUtcLocal(s: string): Date | null {
  if (!s) return null;
  const z = /Z$/.test(s) ? s : s + 'Z';
  const d = new Date(z);
  return isNaN(d.getTime()) ? null : d;
}

export default function AddVolAdminForm({
  typesAvion,
  compagnies,
  profiles,
  admins,
}: {
  typesAvion: T[];
  compagnies: C[];
  profiles: P[];
  admins: P[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pilote_id, setPiloteId] = useState('');
  const [type_avion_id, setTypeAvionId] = useState('');
  const [compagnie_id, setCompagnieId] = useState('');
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
  const [pilote_commandid, setPiloteCommandantId] = useState('');
  const [copilote_id, setCopiloteId] = useState('');
  const [callsign, setCallsign] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compagnieLibelle = pourMoiMemo ? 'Pour moi-même' : (compagnies.find((c) => c.id === compagnie_id)?.nom ?? '');

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
    setError(null);
    if (role_pilote === 'Co-pilote') {
      if (!pilote_commandid || !copilote_id || !type_avion_id || (!pourMoiMemo && !compagnie_id)) {
        setError('Pilote, copilote, type d\'avion et compagnie requis.');
        return;
      }
    } else {
      if (!pilote_id || !type_avion_id || (!pourMoiMemo && !compagnie_id)) {
        setError('Pilote, type d\'avion et compagnie requis.');
        return;
      }
    }
    if (!aeroport_depart || !aeroport_arrivee) {
      setError('Aéroports de départ et d\'arrivée requis.');
      return;
    }
    const d = parseInt(duree_minutes, 10);
    if (isNaN(d) || d < 1 || !heure_utc || !commandant_bord.trim()) {
      setError('Durée, heure (départ ou arrivée) et commandant requis.');
      return;
    }
    if (type_vol === 'Instruction' && (!instructeur_id || !instruction_type.trim())) {
      setError('Vol d\'instruction : instructeur et type d\'instruction requis.');
      return;
    }
    const depart_utc = computeDepartUtc();
    if (!depart_utc) {
      setError('Heure invalide.');
      return;
    }
    const body: Record<string, unknown> = {
      type_avion_id,
      compagnie_id: pourMoiMemo ? null : compagnie_id,
      compagnie_libelle: pourMoiMemo ? 'Pour moi-même' : compagnieLibelle,
      aeroport_depart,
      aeroport_arrivee,
      duree_minutes: d,
      depart_utc,
      type_vol,
      instructeur_id: type_vol === 'Instruction' ? instructeur_id : null,
      instruction_type: type_vol === 'Instruction' ? instruction_type.trim() : null,
      commandant_bord: commandant_bord.trim(),
      role_pilote,
      created_by_admin: true,
    };
    if (role_pilote === 'Co-pilote') {
      body.pilote_id = pilote_commandid;
      body.copilote_id = copilote_id;
    } else {
      body.pilote_id = pilote_id;
    }
    body.callsign = callsign.trim() || undefined;
    setLoading(true);
    try {
      const res = await fetch('/api/vols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setOpen(false);
      setPiloteId('');
      setPiloteCommandantId('');
      setCopiloteId('');
      setTypeAvionId('');
      setCompagnieId('');
      setPourMoiMemo(false);
      setAeroportDepart('');
      setAeroportArrivee('');
      setDureeMinutes('');
      setHeureMode('depart');
      setHeureUtc('');
      setTypeVol('VFR');
      setInstructeurId('');
      setInstructionType('');
      setCommandantBord('');
      setCallsign('');
      setRolePilote('Pilote');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="btn-secondary"
      >
        {open ? 'Annuler' : 'Ajouter un vol pour un pilote'}
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {role_pilote === 'Pilote' && (
            <div>
              <label className="label">Pilote *</label>
              <select className="input" value={pilote_id} onChange={(e) => setPiloteId(e.target.value)}>
                <option value="">— Choisir —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.identifiant}</option>
                ))}
              </select>
            </div>
          )}
          {role_pilote === 'Co-pilote' && type_vol !== 'Instruction' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Pilote (commandant) *</label>
                <select className="input" value={pilote_commandid} onChange={(e) => setPiloteCommandantId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.identifiant}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Co-pilote *</label>
                <select className="input" value={copilote_id} onChange={(e) => setCopiloteId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.identifiant}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="label">Type d&apos;avion *</label>
            <select className="input" value={type_avion_id} onChange={(e) => setTypeAvionId(e.target.value)} required>
              <option value="">— Choisir —</option>
              {typesAvion.map((t) => (
                <option key={t.id} value={t.id}>{t.nom} {t.constructeur ? `(${t.constructeur})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Compagnie *</label>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" id="moi" checked={pourMoiMemo} onChange={(e) => { setPourMoiMemo(e.target.checked); if (e.target.checked) setCompagnieId(''); }} />
              <label htmlFor="moi" className="text-sm text-slate-300">Pour moi-même</label>
            </div>
            {!pourMoiMemo && (
              <select className="input" value={compagnie_id} onChange={(e) => setCompagnieId(e.target.value)} required>
                <option value="">— Choisir —</option>
                {compagnies.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Aéroport départ *</label>
              <select className="input" value={aeroport_depart} onChange={(e) => setAeroportDepart(e.target.value)}>
                <option value="">— Choisir —</option>
                {AEROPORTS_PTFS.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Aéroport arrivée *</label>
              <select className="input" value={aeroport_arrivee} onChange={(e) => setAeroportArrivee(e.target.value)}>
                <option value="">— Choisir —</option>
                {AEROPORTS_PTFS.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Durée (min) *</label>
              <input type="number" className="input" value={duree_minutes} onChange={(e) => setDureeMinutes(e.target.value)} min={1} required />
            </div>
            <div className="space-y-2">
              <span className="label block">Heure (UTC) *</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="radio" name="heure_mode" checked={heure_mode === 'depart'} onChange={() => handleHeureModeChange('depart')} className="rounded" />
                  Départ
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="radio" name="heure_mode" checked={heure_mode === 'arrivee'} onChange={() => handleHeureModeChange('arrivee')} className="rounded" />
                  Arrivée
                </label>
              </div>
              <input type="datetime-local" className="input" value={heure_utc} onChange={(e) => setHeureUtc(e.target.value)} required />
              {heure_utc && parseInt(duree_minutes, 10) >= 1 && (() => {
                const dur = parseInt(duree_minutes, 10);
                const pd = parseUtcLocal(heure_utc);
                if (!pd || isNaN(dur)) return null;
                const other = heure_mode === 'depart' ? addMinutes(pd, dur) : subMinutes(pd, dur);
                return (
                  <p className="text-xs text-slate-500">
                    {heure_mode === 'depart' ? 'Arrivée calculée : ' : 'Départ calculé : '}
                    {String(other.getUTCHours()).padStart(2, '0')}:{String(other.getUTCMinutes()).padStart(2, '0')}
                  </p>
                );
              })()}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type vol *</label>
              <select className="input" value={type_vol} onChange={(e) => { const v = e.target.value as 'IFR' | 'VFR' | 'Instruction'; setTypeVol(v); if (v === 'Instruction') setRolePilote('Pilote'); }}>
                <option value="VFR">VFR</option>
                <option value="IFR">IFR</option>
                <option value="Instruction">Instruction</option>
              </select>
            </div>
            <div>
              <label className="label">Rôle *</label>
              <select className="input" value={role_pilote} onChange={(e) => { setRolePilote(e.target.value as 'Pilote' | 'Co-pilote'); if (e.target.value === 'Pilote') { setPiloteCommandantId(''); setCopiloteId(''); } }}>
                <option value="Pilote">Pilote</option>
                <option value="Co-pilote">Co-pilote</option>
              </select>
            </div>
          </div>
          {type_vol === 'Instruction' && (
            <div className="space-y-4 rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
              <div>
                <label className="label">Admin instructeur *</label>
                <select className="input" value={instructeur_id} onChange={(e) => setInstructeurId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>{a.identifiant}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Type de vol d&apos;instruction *</label>
                <input type="text" className="input" value={instruction_type} onChange={(e) => setInstructionType(e.target.value)} placeholder="ex. IFR initial, VFR de nuit..." />
              </div>
            </div>
          )}
          <div>
            <label className="label">Commandant de bord *</label>
            <input type="text" className="input" value={commandant_bord} onChange={(e) => setCommandantBord(e.target.value)} required />
          </div>
          <div>
            <label className="label">Callsign / N° de vol</label>
            <input type="text" className="input" value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="ex. AF123, F-GKTA… (optionnel)" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Ajout…' : 'Ajouter (validé)'}</button>
        </form>
      )}
    </div>
  );
}
