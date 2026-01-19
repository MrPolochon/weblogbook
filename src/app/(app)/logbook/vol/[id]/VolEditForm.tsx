'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addMinutes, subMinutes } from 'date-fns';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

type T = { id: string; nom: string; constructeur?: string };
type C = { id: string; nom: string };
type Admin = { id: string; identifiant: string };

function parseUtcLocal(s: string): Date | null {
  if (!s) return null;
  const z = /Z$/.test(s) ? s : s + 'Z';
  const d = new Date(z);
  return isNaN(d.getTime()) ? null : d;
}

export default function VolEditForm({
  volId,
  typeAvionId,
  compagnieId,
  compagnieLibelle,
  aeroportDepart,
  aeroportArrivee,
  dureeMinutes,
  departUtc,
  typeVol,
  instructeurId,
  instructionType,
  commandantBord,
  rolePilote,
  isCurrentUserPilote,
  piloteId,
  copiloteId,
  typesAvion,
  compagnies,
  admins,
  autresProfiles,
  successRedirect,
  isConfirmationMode,
  readOnly,
  isRefuseParCopilote,
  isConfirmationInstructeur,
}: {
  volId: string;
  typeAvionId: string;
  compagnieId: string | null;
  compagnieLibelle: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  dureeMinutes: number;
  departUtc: string;
  typeVol: 'IFR' | 'VFR' | 'Instruction';
  instructeurId: string;
  instructionType: string;
  commandantBord: string;
  rolePilote: 'Pilote' | 'Co-pilote';
  isCurrentUserPilote: boolean;
  piloteId: string;
  copiloteId: string;
  typesAvion: T[];
  compagnies: C[];
  admins: Admin[];
  autresProfiles: { id: string; identifiant: string }[];
  successRedirect?: string;
  isConfirmationMode?: boolean;
  readOnly?: boolean;
  isRefuseParCopilote?: boolean;
  isConfirmationInstructeur?: boolean;
}) {
  const router = useRouter();
  const [type_avion_id, setTypeAvionId] = useState(typeAvionId);
  const [compagnie_id, setCompagnieId] = useState(compagnieId || '');
  const [pourMoiMemo, setPourMoiMemo] = useState(compagnieLibelle === 'Pour moi-même');
  const [aeroport_depart, setAeroportDepart] = useState(aeroportDepart || '');
  const [aeroport_arrivee, setAeroportArrivee] = useState(aeroportArrivee || '');
  const [duree_minutes, setDureeMinutes] = useState(String(dureeMinutes));
  const [heure_mode, setHeureMode] = useState<'depart' | 'arrivee'>('depart');
  const [heure_utc, setHeureUtc] = useState(departUtc || '');
  const [type_vol, setTypeVol] = useState(typeVol);
  const [instructeur_id, setInstructeurId] = useState(instructeurId || '');
  const [instruction_type, setInstructionType] = useState(instructionType || '');
  const [commandant_bord, setCommandantBord] = useState(commandantBord);
  const [role_pilote, setRolePilote] = useState(rolePilote);
  const [autrePersonneId, setAutrePersonneId] = useState(isCurrentUserPilote ? (copiloteId || '') : (piloteId || ''));
  const [loading, setLoading] = useState(false);
  const [loadingRefuser, setLoadingRefuser] = useState(false);
  const [loadingConfirmerInst, setLoadingConfirmerInst] = useState(false);
  const [loadingRefuserInst, setLoadingRefuserInst] = useState(false);
  const [refusReasonInst, setRefusReasonInst] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmerInstructeur() {
    setLoadingConfirmerInst(true);
    setError(null);
    try {
      const res = await fetch(`/api/vols/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmer_instructeur: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push(successRedirect || '/logbook');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingConfirmerInst(false);
    }
  }

  async function handleRefuserInstructeur() {
    setLoadingRefuserInst(true);
    setError(null);
    try {
      const res = await fetch(`/api/vols/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refuser_instructeur: true, refusal_reason: refusReasonInst.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push(successRedirect || '/logbook');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingRefuserInst(false);
    }
  }

  async function handleRefuserCopilote() {
    setLoadingRefuser(true);
    setError(null);
    try {
      const res = await fetch(`/api/vols/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refuser_copilote: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push(successRedirect || '/logbook');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingRefuser(false);
    }
  }

  const compagnieLib = pourMoiMemo ? 'Pour moi-même' : (compagnies.find((c) => c.id === compagnie_id)?.nom ?? compagnieLibelle);

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
    const d = parseInt(duree_minutes, 10);
    if (!type_avion_id || (!pourMoiMemo && !compagnie_id) || !aeroport_depart || !aeroport_arrivee || isNaN(d) || d < 1 || !heure_utc || !commandant_bord.trim()) {
      setError('Veuillez remplir tous les champs requis.');
      return;
    }
    if (type_vol === 'Instruction' && (!instructeur_id || !instruction_type.trim())) {
      setError('Pour un vol d\'instruction : choisir l\'admin instructeur et indiquer le type d\'instruction.');
      return;
    }
    if (type_vol !== 'Instruction' && role_pilote === 'Co-pilote' && !autrePersonneId && !(isCurrentUserPilote && copiloteId)) {
      setError(isCurrentUserPilote ? 'Qui était le copilote ?' : 'Qui était le pilote (commandant) ?');
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
      compagnie_libelle: pourMoiMemo ? 'Pour moi-même' : compagnieLib,
      aeroport_depart,
      aeroport_arrivee,
      duree_minutes: d,
      depart_utc,
      type_vol,
      instructeur_id: type_vol === 'Instruction' ? instructeur_id : null,
      instruction_type: type_vol === 'Instruction' ? instruction_type.trim() : null,
      commandant_bord: commandant_bord.trim(),
      role_pilote,
    };
    if (type_vol === 'Instruction') {
      if (role_pilote === 'Co-pilote') body.pilote_id = instructeur_id;
    } else if (role_pilote === 'Co-pilote') {
      if (isCurrentUserPilote) body.copilote_id = autrePersonneId || null;
      else body.pilote_id = autrePersonneId;
    } else if (isCurrentUserPilote && copiloteId) {
      body.copilote_id = autrePersonneId || null;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/vols/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push(successRedirect || '/logbook');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 max-w-xl">
      <div>
        <label className="label">Type d&apos;avion *</label>
        <select className="input" value={type_avion_id} onChange={(e) => setTypeAvionId(e.target.value)} required disabled={readOnly}>
          <option value="">— Choisir —</option>
          {typesAvion.map((t) => (
            <option key={t.id} value={t.id}>{t.nom} {t.constructeur ? `(${t.constructeur})` : ''}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Compagnie aérienne *</label>
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" id="moi" checked={pourMoiMemo} onChange={(e) => { setPourMoiMemo(e.target.checked); if (e.target.checked) setCompagnieId(''); }} disabled={readOnly} />
          <label htmlFor="moi" className="text-sm text-slate-300">Pour moi-même</label>
        </div>
        {!pourMoiMemo && (
          <select className="input" value={compagnie_id} onChange={(e) => setCompagnieId(e.target.value)} required disabled={readOnly}>
            <option value="">— Choisir —</option>
            {compagnies.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Aéroport de départ *</label>
          <select className="input" value={aeroport_depart} onChange={(e) => setAeroportDepart(e.target.value)} required disabled={readOnly}>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Aéroport d&apos;arrivée *</label>
          <select className="input" value={aeroport_arrivee} onChange={(e) => setAeroportArrivee(e.target.value)} required disabled={readOnly}>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Durée (minutes) *</label>
          <input type="number" className="input" value={duree_minutes} onChange={(e) => setDureeMinutes(e.target.value)} min={1} required disabled={readOnly} />
        </div>
        <div className="space-y-2">
          <span className="label block">Heure (UTC) *</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="radio" name="heure_mode" checked={heure_mode === 'depart'} onChange={() => handleHeureModeChange('depart')} className="rounded" disabled={readOnly} />
              Départ
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="radio" name="heure_mode" checked={heure_mode === 'arrivee'} onChange={() => handleHeureModeChange('arrivee')} className="rounded" disabled={readOnly} />
              Arrivée
            </label>
          </div>
          <input type="datetime-local" className="input" value={heure_utc} onChange={(e) => setHeureUtc(e.target.value)} required disabled={readOnly} />
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
          <label className="label">Type de vol *</label>
          <select className="input" value={type_vol} onChange={(e) => setTypeVol(e.target.value as 'IFR' | 'VFR' | 'Instruction')} disabled={readOnly}>
            <option value="VFR">VFR</option>
            <option value="IFR">IFR</option>
            <option value="Instruction">Instruction</option>
          </select>
        </div>
        <div>
          <label className="label">Rôle *</label>
          <select className="input" value={role_pilote} onChange={(e) => { setRolePilote(e.target.value as 'Pilote' | 'Co-pilote'); if (e.target.value === 'Pilote') setAutrePersonneId(''); }} disabled={readOnly}>
            <option value="Pilote">Pilote</option>
            <option value="Co-pilote">Co-pilote</option>
          </select>
        </div>
      </div>
      {type_vol !== 'Instruction' && ((role_pilote === 'Co-pilote' || copiloteId) && isCurrentUserPilote) && (
        <div>
          <label className="label">{role_pilote === 'Co-pilote' ? 'Qui était le copilote ? *' : 'Co-pilote (modifier ou retirer)'}</label>
          <select className="input" value={autrePersonneId} onChange={(e) => setAutrePersonneId(e.target.value)} disabled={readOnly}>
            {copiloteId ? <option value="">— Retirer le co-pilote —</option> : <option value="">— Choisir —</option>}
            {autresProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.identifiant}</option>
            ))}
          </select>
        </div>
      )}
      {type_vol !== 'Instruction' && role_pilote === 'Co-pilote' && !isCurrentUserPilote && (
        <div>
          <label className="label">Qui était le pilote (commandant de bord) ? *</label>
          <select className="input" value={autrePersonneId} onChange={(e) => setAutrePersonneId(e.target.value)} disabled={readOnly}>
            <option value="">— Choisir —</option>
            {autresProfiles.map((p) => (
              <option key={p.id} value={p.id}>{p.identifiant}</option>
            ))}
          </select>
        </div>
      )}
      {type_vol === 'Instruction' && (
        <div className="space-y-4 rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <div>
            <label className="label">Admin / instructeur *</label>
            <select className="input" value={instructeur_id} onChange={(e) => setInstructeurId(e.target.value)} disabled={readOnly}>
              <option value="">— Choisir —</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.identifiant}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type de vol d&apos;instruction *</label>
            <input type="text" className="input" value={instruction_type} onChange={(e) => setInstructionType(e.target.value)} placeholder="ex. IFR initial, VFR de nuit..." disabled={readOnly} />
          </div>
        </div>
      )}
      <div>
        <label className="label">Nom / pseudo du commandant de bord *</label>
        <input type="text" className="input" value={commandant_bord} onChange={(e) => setCommandantBord(e.target.value)} required disabled={readOnly} />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {isConfirmationInstructeur ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleConfirmerInstructeur} className="btn-primary" disabled={loadingConfirmerInst || loadingRefuserInst}>
              {loadingConfirmerInst ? 'Envoi…' : 'Confirmer (valider le vol)'}
            </button>
            <div className="flex flex-wrap items-end gap-2 flex-1">
              <div>
                <label className="label text-xs">Raison du refus (optionnel)</label>
                <input type="text" className="input max-w-xs" value={refusReasonInst} onChange={(e) => setRefusReasonInst(e.target.value)} placeholder="Si vous refusez…" disabled={loadingConfirmerInst || loadingRefuserInst} />
              </div>
              <button type="button" onClick={handleRefuserInstructeur} disabled={loadingConfirmerInst || loadingRefuserInst} className="btn-secondary border-amber-500/50 text-amber-300 hover:bg-amber-500/20">
                {loadingRefuserInst ? 'Envoi…' : 'Refuser'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={loading || loadingRefuser}>
            {loading ? 'Envoi…' : isConfirmationMode ? 'Confirmer et envoyer aux admins' : 'Enregistrer et renvoyer'}
          </button>
          {readOnly && (
            <button type="button" onClick={handleRefuserCopilote} disabled={loading || loadingRefuser} className="btn-secondary border-amber-500/50 text-amber-300 hover:bg-amber-500/20">
              {loadingRefuser ? 'Envoi…' : "Ce n'est pas moi le co-pilote"}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
