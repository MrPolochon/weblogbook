'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addMinutes, subMinutes } from 'date-fns';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { NATURES_VOL_MILITAIRE } from '@/lib/avions-militaires';
import { ARME_MISSIONS, ArmeeMission } from '@/lib/armee-missions';

type Profil = { id: string; identifiant: string };
type InventaireItem = { 
  id: string; 
  nom_personnalise: string | null; 
  types_avion: { id: string; nom: string; code_oaci: string | null } | { id: string; nom: string; code_oaci: string | null }[] | null;
};

function parseUtcLocal(s: string): Date | null {
  if (!s) return null;
  const z = /Z$/.test(s) ? s : s + 'Z';
  const d = new Date(z);
  return isNaN(d.getTime()) ? null : d;
}

const LIB_ESC = { escadrille: 'Vol en escadrille', escadron: 'Vol en escadron (vous = chef d\'escadron)', autre: 'Ni l\'un ni l\'autre (précisez la nature)' } as const;
const LIB_NATURE: Record<string, string> = { entrainement: 'Entraînement', escorte: 'Escorte', sauvetage: 'Sauvetage', reconnaissance: 'Reconnaissance', autre: 'Autre' };

export default function VolFormMilitaire({ pilotesArmee, inventaireMilitaire = [], missionId = '' }: { pilotesArmee: Profil[]; inventaireMilitaire?: InventaireItem[]; missionId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [armee_avion_id, setArmeeAvionId] = useState('');
  const [mission_id, setMissionId] = useState(missionId);
  const [escadrille_ou_escadron, setEscadrilleOuEscadron] = useState<'escadrille' | 'escadron' | 'autre'>('escadrille');
  const [nature_vol_militaire, setNatureVolMilitaire] = useState<string>('');
  const [nature_vol_militaire_autre, setNatureVolMilitaireAutre] = useState('');
  const [aeroport_depart, setAeroportDepart] = useState('');
  const [aeroport_arrivee, setAeroportArrivee] = useState('');
  const [duree_minutes, setDureeMinutes] = useState('');
  const [heure_mode, setHeureMode] = useState<'depart' | 'arrivee'>('depart');
  const [heure_utc, setHeureUtc] = useState('');
  const [commandant_bord, setCommandantBord] = useState('');
  const [role_pilote, setRolePilote] = useState<'Pilote' | 'Co-pilote'>('Pilote');
  const [pilote_id, setPiloteId] = useState('');
  const [copilote_id, setCopiloteId] = useState('');
  const [equipage_ids, setEquipageIds] = useState<string[]>([]);
  const [callsign, setCallsign] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEscadrilleOuEscadron = escadrille_ou_escadron === 'escadrille' || escadrille_ou_escadron === 'escadron';
  const selectedMission = mission_id ? ARME_MISSIONS.find((m) => m.id === mission_id) || null : null;

  useEffect(() => {
    if (!selectedMission) return;
    setAeroportDepart(selectedMission.aeroport_depart);
    setAeroportArrivee(selectedMission.aeroport_arrivee);
    setDureeMinutes(String(selectedMission.duree_minutes));
    setEscadrilleOuEscadron(selectedMission.escadrille_ou_escadron);
    setNatureVolMilitaire(selectedMission.nature_vol_militaire);
    setNatureVolMilitaireAutre('');
    if (!callsign.trim()) {
      setCallsign(`${selectedMission.callsign_prefix}${Math.floor(100 + Math.random() * 900)}`);
    }
  }, [selectedMission, callsign]);

  function toggleEquipage(id: string) {
    setEquipageIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
        aeroport_arrivee !== selectedMission.aeroport_arrivee ||
        d !== selectedMission.duree_minutes ||
        escadrille_ou_escadron !== selectedMission.escadrille_ou_escadron ||
        nature_vol_militaire !== selectedMission.nature_vol_militaire
      ) {
        setError('Le plan de vol doit correspondre à la mission sélectionnée.');
        return;
      }
    }
    if (escadrille_ou_escadron === 'autre') {
      if (!nature_vol_militaire) {
        setError('Indiquez la nature du vol (entraînement, escorte, sauvetage, reconnaissance ou autre).');
        return;
      }
      if (nature_vol_militaire === 'autre' && !nature_vol_militaire_autre.trim()) {
        setError('Précisez la nature du vol militaire (champ « Autre »).');
        return;
      }
      if (role_pilote === 'Co-pilote' && !pilote_id) {
        setError('Qui était le pilote (commandant de bord) ?');
        return;
      }
    }
    const depart_utc = computeDepartUtc();
    if (!depart_utc) {
      setError('Heure invalide.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/vols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_vol: 'Vol militaire',
          armee_avion_id,
          mission_id: selectedMission?.id,
          escadrille_ou_escadron,
          nature_vol_militaire: selectedMission ? nature_vol_militaire : (escadrille_ou_escadron === 'autre' ? nature_vol_militaire : null),
          nature_vol_militaire_autre: selectedMission ? null : (escadrille_ou_escadron === 'autre' && nature_vol_militaire === 'autre' ? nature_vol_militaire_autre.trim() : null),
          aeroport_depart,
          aeroport_arrivee,
          duree_minutes: d,
          depart_utc,
          commandant_bord: commandant_bord.trim(),
          role_pilote: isEscadrilleOuEscadron ? 'Pilote' : role_pilote,
          pilote_id: isEscadrilleOuEscadron ? undefined : (role_pilote === 'Co-pilote' ? pilote_id : undefined),
          copilote_id: isEscadrilleOuEscadron ? undefined : (role_pilote === 'Pilote' && copilote_id ? copilote_id : undefined),
          equipage_ids: isEscadrilleOuEscadron ? equipage_ids : undefined,
          callsign: callsign.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      router.push('/militaire');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 max-w-xl">
      <div>
        <label className="label">Mission (optionnel)</label>
        <select
          className="input"
          value={mission_id}
          onChange={(e) => setMissionId(e.target.value)}
        >
          <option value="">— Sans mission —</option>
          {ARME_MISSIONS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.titre} ({m.rewardMin.toLocaleString('fr-FR')}–{m.rewardMax.toLocaleString('fr-FR')} F$)
            </option>
          ))}
        </select>
        {selectedMission && (
          <p className="text-xs text-slate-400 mt-1">
            Mission: {selectedMission.description}
          </p>
        )}
      </div>
      <div>
        <label className="label">Avion de l&apos;armée *</label>
        <select
          className="input"
          value={armee_avion_id}
          onChange={(e) => setArmeeAvionId(e.target.value)}
          required
        >
          <option value="">— Choisir un avion —</option>
          {inventaireMilitaire.map((inv) => {
            const typeAvion = inv.types_avion ? (Array.isArray(inv.types_avion) ? inv.types_avion[0] : inv.types_avion) : null;
            return (
            <option key={inv.id} value={inv.id}>
              {inv.nom_personnalise || typeAvion?.nom || 'Avion militaire'}
              {typeAvion?.code_oaci && ` (${typeAvion.code_oaci})`}
            </option>
            );
          })}
        </select>
        {inventaireMilitaire.length === 0 && (
          <p className="text-xs text-amber-400 mt-1">Aucun avion militaire dans l&apos;inventaire de l&apos;armée.</p>
        )}
      </div>

      <div>
        <span className="label block">Type de vol militaire *</span>
        <div className="space-y-2 mt-1">
          {(['escadrille', 'escadron', 'autre'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="esc"
                checked={escadrille_ou_escadron === k}
                onChange={() => {
                  if (selectedMission) return;
                  setEscadrilleOuEscadron(k);
                  if (k === 'autre') { setEquipageIds([]); setNatureVolMilitaire(''); }
                  else { setNatureVolMilitaire(''); setNatureVolMilitaireAutre(''); setPiloteId(''); setCopiloteId(''); }
                }}
                className="rounded"
                disabled={Boolean(selectedMission)}
              />
              {LIB_ESC[k]}
            </label>
          ))}
        </div>
      </div>

      {selectedMission && (
        <div className="rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <p className="text-xs text-slate-400 mb-1">Nature de mission</p>
          <p className="text-sm text-slate-200">{LIB_NATURE[selectedMission.nature_vol_militaire] || selectedMission.nature_vol_militaire}</p>
        </div>
      )}

      {escadrille_ou_escadron === 'autre' && (
        <div className="space-y-2 rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <span className="label block">Nature du vol *</span>
          <div className="flex flex-wrap gap-3">
            {NATURES_VOL_MILITAIRE.map((n) => (
              <label key={n} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="radio" name="nature" checked={nature_vol_militaire === n} onChange={() => setNatureVolMilitaire(n)} className="rounded" disabled={Boolean(selectedMission)} />
                {LIB_NATURE[n] || n}
              </label>
            ))}
          </div>
          {nature_vol_militaire === 'autre' && (
            <div>
              <label className="label">Précisez la nature *</label>
              <input type="text" className="input" value={nature_vol_militaire_autre} onChange={(e) => setNatureVolMilitaireAutre(e.target.value)} placeholder="ex. mission spéciale…" disabled={Boolean(selectedMission)} />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Aéroport de départ *</label>
          <select className="input" value={aeroport_depart} onChange={(e) => setAeroportDepart(e.target.value)} required disabled={Boolean(selectedMission)}>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Aéroport d&apos;arrivée *</label>
          <select className="input" value={aeroport_arrivee} onChange={(e) => setAeroportArrivee(e.target.value)} required disabled={Boolean(selectedMission)}>
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
          <input type="number" className="input" value={duree_minutes} onChange={(e) => setDureeMinutes(e.target.value)} min={1} required disabled={Boolean(selectedMission)} />
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
        </div>
      </div>

      {isEscadrilleOuEscadron && (
        <div className="rounded-lg border border-slate-600/50 bg-slate-800/30 p-4">
          <label className="label block mb-2">Pilotes du vol (vous êtes inclus). Ajoutez les autres participants :</label>
          <p className="text-xs text-slate-500 mb-3">Tous les pilotes sélectionnés auront ce vol dans leur logbook.</p>
          <div className="flex flex-wrap gap-3 max-h-40 overflow-y-auto">
            {pilotesArmee.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={equipage_ids.includes(p.id)} onChange={() => toggleEquipage(p.id)} className="rounded" />
                {p.identifiant}
              </label>
            ))}
          </div>
          {pilotesArmee.length === 0 && <p className="text-slate-500 text-sm">Aucun autre pilote avec le rôle Armée.</p>}
        </div>
      )}

      {!isEscadrilleOuEscadron && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Rôle *</label>
              <select className="input" value={role_pilote} onChange={(e) => { setRolePilote(e.target.value as 'Pilote' | 'Co-pilote'); setPiloteId(''); setCopiloteId(''); }}>
                <option value="Pilote">Pilote</option>
                <option value="Co-pilote">Co-pilote</option>
              </select>
            </div>
          </div>

          {role_pilote === 'Pilote' && (
            <div>
              <label className="label">Co-pilote (optionnel)</label>
              <select className="input" value={copilote_id} onChange={(e) => setCopiloteId(e.target.value)}>
                <option value="">— Aucun —</option>
                {pilotesArmee.map((p) => (
                  <option key={p.id} value={p.id}>{p.identifiant}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Seuls les utilisateurs avec le rôle Armée peuvent être ajoutés.</p>
            </div>
          )}

          {role_pilote === 'Co-pilote' && (
            <div>
              <label className="label">Pilote (commandant de bord) *</label>
              <select className="input" value={pilote_id} onChange={(e) => setPiloteId(e.target.value)}>
                <option value="">— Choisir —</option>
                {pilotesArmee.map((p) => (
                  <option key={p.id} value={p.id}>{p.identifiant}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <div>
        <label className="label">Nom / pseudo du commandant de bord *</label>
        <input type="text" className="input" value={commandant_bord} onChange={(e) => setCommandantBord(e.target.value)} required />
      </div>

      <div>
        <label className="label">Callsign / N° de vol</label>
        <input type="text" className="input" value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="ex. AF123… (optionnel)" />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Envoi…' : 'Soumettre'}
      </button>
    </form>
  );
}
