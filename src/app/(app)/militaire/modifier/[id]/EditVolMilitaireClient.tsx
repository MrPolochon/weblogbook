'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addMinutes, subMinutes } from 'date-fns';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { NATURES_VOL_MILITAIRE } from '@/lib/avions-militaires';
import { ARME_MISSIONS } from '@/lib/armee-missions';

type Profil = { id: string; identifiant: string };
type InventaireItem = {
  id: string;
  nom_personnalise: string | null;
  types_avion: { id: string; nom: string; code_oaci: string | null } | { id: string; nom: string; code_oaci: string | null }[] | null;
};

type VolData = {
  id: string;
  pilote_id: string;
  copilote_id: string | null;
  chef_escadron_id: string | null;
  duree_minutes: number;
  depart_utc: string;
  armee_avion_id: string | null;
  callsign: string | null;
  commandant_bord: string | null;
  escadrille_ou_escadron: string | null;
  nature_vol_militaire: string | null;
  nature_vol_militaire_autre: string | null;
  aeroport_depart: string | null;
  aeroport_arrivee: string | null;
  mission_id: string | null;
  role_pilote: string | null;
  equipage_ids: string[];
};

function parseUtcLocal(s: string): Date | null {
  if (!s) return null;
  const z = /Z$/.test(s) ? s : s + 'Z';
  const d = new Date(z);
  return isNaN(d.getTime()) ? null : d;
}

const LIB_ESC = {
  escadrille: 'Vol en escadrille',
  escadron: 'Vol en escadron (vous = chef d\'escadron)',
  autre: 'Ni l\'un ni l\'autre (précisez la nature)',
} as const;
const LIB_NATURE: Record<string, string> = { entrainement: 'Entraînement', escorte: 'Escorte', sauvetage: 'Sauvetage', reconnaissance: 'Reconnaissance', autre: 'Autre' };

interface Props {
  vol: VolData;
  pilotesArmee: Profil[];
  inventaireMilitaire: InventaireItem[];
}

export default function EditVolMilitaireClient({ vol, pilotesArmee, inventaireMilitaire }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const depDate = parseUtcLocal(vol.depart_utc);
  const initialHeure = depDate ? depDate.toISOString().slice(0, 16) : '';

  const [armee_avion_id, setArmeeAvionId] = useState(vol.armee_avion_id || '');
  const [escadrille_ou_escadron, setEscadrilleOuEscadron] = useState<'escadrille' | 'escadron' | 'autre'>(
    (vol.escadrille_ou_escadron as 'escadrille' | 'escadron' | 'autre') || 'escadrille'
  );
  const [nature_vol_militaire, setNatureVolMilitaire] = useState(vol.nature_vol_militaire || '');
  const [nature_vol_militaire_autre, setNatureVolMilitaireAutre] = useState(vol.nature_vol_militaire_autre || '');
  const [aeroport_depart, setAeroportDepart] = useState(vol.aeroport_depart || '');
  const [aeroport_arrivee, setAeroportArrivee] = useState(vol.aeroport_arrivee || '');
  const [duree_minutes, setDureeMinutes] = useState(String(vol.duree_minutes || ''));
  const [heure_mode, setHeureMode] = useState<'depart' | 'arrivee'>('depart');
  const [heure_utc, setHeureUtc] = useState(initialHeure);
  const [commandant_bord, setCommandantBord] = useState(vol.commandant_bord || '');
  const [role_pilote, setRolePilote] = useState<'Pilote' | 'Co-pilote'>((vol.role_pilote as 'Pilote' | 'Co-pilote') || 'Pilote');
  const [copilote_id, setCopiloteId] = useState(vol.copilote_id || '');
  const [equipage_ids, setEquipageIds] = useState<string[]>(vol.equipage_ids || []);
  const [callsign, setCallsign] = useState(vol.callsign || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEscadrilleOuEscadron = escadrille_ou_escadron === 'escadrille' || escadrille_ou_escadron === 'escadron';
  const selectedMission = vol.mission_id ? ARME_MISSIONS.find(m => m.id === vol.mission_id) || null : null;

  function toggleEquipage(id: string) {
    setEquipageIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

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

    if (!armee_avion_id || !aeroport_depart || !aeroport_arrivee || isNaN(d) || d < 1 || !heure_utc || !commandant_bord.trim()) {
      setError('Veuillez remplir tous les champs requis.');
      return;
    }
    if (selectedMission) {
      if (
        aeroport_depart !== selectedMission.aeroport_depart ||
        aeroport_arrivee !== selectedMission.aeroport_arrivee
      ) {
        setError('Le plan de vol doit correspondre à la mission sélectionnée.');
        return;
      }
    }
    if (escadrille_ou_escadron === 'autre' && !nature_vol_militaire) {
      setError('Indiquez la nature du vol.');
      return;
    }
    if (nature_vol_militaire === 'autre' && !nature_vol_militaire_autre.trim()) {
      setError('Précisez la nature du vol militaire.');
      return;
    }

    const depart_utc = computeDepartUtc();
    if (!depart_utc) { setError('Heure invalide.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/vols/${vol.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _edit_militaire: true,
          type_vol: 'Vol militaire',
          armee_avion_id,
          escadrille_ou_escadron,
          nature_vol_militaire: isEscadrilleOuEscadron ? null : nature_vol_militaire,
          nature_vol_militaire_autre: isEscadrilleOuEscadron ? null : (nature_vol_militaire === 'autre' ? nature_vol_militaire_autre.trim() : null),
          aeroport_depart,
          aeroport_arrivee,
          duree_minutes: d,
          depart_utc,
          commandant_bord: commandant_bord.trim(),
          callsign: callsign.trim() || null,
          copilote_id: isEscadrilleOuEscadron ? null : (role_pilote === 'Pilote' && copilote_id ? copilote_id : null),
          chef_escadron_id: escadrille_ou_escadron === 'escadron' ? vol.pilote_id : null,
          equipage_ids: isEscadrilleOuEscadron ? equipage_ids : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push(`/militaire/vol/${vol.id}`);
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 max-w-xl">
      {selectedMission && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
          <p className="text-sm font-medium text-sky-400">Mission : {selectedMission.titre}</p>
          <p className="text-xs text-slate-400 mt-1">{selectedMission.description}</p>
        </div>
      )}

      <div>
        <label className="label">Avion de l&apos;armée *</label>
        <select className="input" value={armee_avion_id} onChange={e => setArmeeAvionId(e.target.value)} required>
          <option value="">— Choisir un avion —</option>
          {inventaireMilitaire.map(inv => {
            const typeAvion = inv.types_avion ? (Array.isArray(inv.types_avion) ? inv.types_avion[0] : inv.types_avion) : null;
            return (
              <option key={inv.id} value={inv.id}>
                {inv.nom_personnalise || typeAvion?.nom || 'Avion militaire'}
                {typeAvion?.code_oaci && ` (${typeAvion.code_oaci})`}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <span className="label block">Type de vol militaire *</span>
        <div className="space-y-2 mt-1">
          {(['escadrille', 'escadron', 'autre'] as const).map(k => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio" name="esc" checked={escadrille_ou_escadron === k}
                onChange={() => {
                  if (selectedMission) return;
                  setEscadrilleOuEscadron(k);
                  if (k === 'autre') { setEquipageIds([]); setNatureVolMilitaire(''); }
                  else { setNatureVolMilitaire(''); setNatureVolMilitaireAutre(''); }
                }}
                className="rounded" disabled={Boolean(selectedMission)}
              />
              {LIB_ESC[k]}
            </label>
          ))}
        </div>
      </div>

      {escadrille_ou_escadron === 'autre' && (
        <div className="space-y-2 rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <span className="label block">Nature du vol *</span>
          <div className="flex flex-wrap gap-3">
            {NATURES_VOL_MILITAIRE.map(n => (
              <label key={n} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="radio" name="nature" checked={nature_vol_militaire === n} onChange={() => setNatureVolMilitaire(n)} className="rounded" disabled={Boolean(selectedMission)} />
                {LIB_NATURE[n] || n}
              </label>
            ))}
          </div>
          {nature_vol_militaire === 'autre' && (
            <div>
              <label className="label">Précisez la nature *</label>
              <input type="text" className="input" value={nature_vol_militaire_autre} onChange={e => setNatureVolMilitaireAutre(e.target.value)} placeholder="ex. mission spéciale…" />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Aéroport de départ *</label>
          <select className="input" value={aeroport_depart} onChange={e => setAeroportDepart(e.target.value)} required disabled={Boolean(selectedMission)}>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map(a => <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Aéroport d&apos;arrivée *</label>
          <select className="input" value={aeroport_arrivee} onChange={e => setAeroportArrivee(e.target.value)} required disabled={Boolean(selectedMission)}>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map(a => <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Durée (minutes) *</label>
          <input type="number" className="input" value={duree_minutes} onChange={e => setDureeMinutes(e.target.value)} min={1} required />
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
          <input type="datetime-local" className="input" value={heure_utc} onChange={e => setHeureUtc(e.target.value)} required />
        </div>
      </div>

      {isEscadrilleOuEscadron && (
        <div className="rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <label className="label block mb-2">Pilotes du vol :</label>
          <div className="flex flex-wrap gap-3 max-h-40 overflow-y-auto">
            {pilotesArmee.map(p => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={equipage_ids.includes(p.id)} onChange={() => toggleEquipage(p.id)} className="rounded" />
                {p.identifiant}
              </label>
            ))}
          </div>
          {pilotesArmee.length === 0 && <p className="text-slate-500 text-sm">Aucun autre pilote armée.</p>}
        </div>
      )}

      {!isEscadrilleOuEscadron && (
        <>
          <div>
            <label className="label">Rôle *</label>
            <select className="input" value={role_pilote} onChange={e => setRolePilote(e.target.value as 'Pilote' | 'Co-pilote')}>
              <option value="Pilote">Pilote</option>
              <option value="Co-pilote">Co-pilote</option>
            </select>
          </div>
          {role_pilote === 'Pilote' && (
            <div>
              <label className="label">Co-pilote (optionnel)</label>
              <select className="input" value={copilote_id} onChange={e => setCopiloteId(e.target.value)}>
                <option value="">— Aucun —</option>
                {pilotesArmee.map(p => <option key={p.id} value={p.id}>{p.identifiant}</option>)}
              </select>
            </div>
          )}
        </>
      )}

      <div>
        <label className="label">Nom / pseudo du commandant de bord *</label>
        <input type="text" className="input" value={commandant_bord} onChange={e => setCommandantBord(e.target.value)} required />
      </div>

      <div>
        <label className="label">Callsign / N° de vol</label>
        <input type="text" className="input" value={callsign} onChange={e => setCallsign(e.target.value)} placeholder="ex. ARM-PAT123… (optionnel)" />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Enregistrement…' : 'Enregistrer les modifications'}
      </button>
    </form>
  );
}
