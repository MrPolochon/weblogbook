'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Eleve = {
  id: string;
  identifiant: string;
  formation_instruction_active: boolean;
  created_at: string;
};

type TypeAvion = {
  id: string;
  nom: string;
  constructeur: string | null;
  code_oaci: string | null;
};

type AvionTemp = {
  id: string;
  proprietaire_id: string;
  type_avion_id: string;
  nom_personnalise: string | null;
  immatriculation: string | null;
  aeroport_actuel: string | null;
  statut: string | null;
  usure_percent: number | null;
  instruction_actif: boolean;
};

export default function InstructionClient({
  eleves,
  typesAvion,
  avionsTemp,
}: {
  eleves: Eleve[];
  typesAvion: TypeAvion[];
  avionsTemp: AvionTemp[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [selectedEleveId, setSelectedEleveId] = useState('');
  const [typeAvionId, setTypeAvionId] = useState('');
  const [nomPerso, setNomPerso] = useState('');
  const [immat, setImmat] = useState('');
  const [editById, setEditById] = useState<Record<string, { nom: string; immat: string; aeroport: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const avionsByEleve = useMemo(() => {
    const map = new Map<string, AvionTemp[]>();
    for (const a of avionsTemp) {
      const arr = map.get(a.proprietaire_id) || [];
      arr.push(a);
      map.set(a.proprietaire_id, arr);
    }
    return map;
  }, [avionsTemp]);

  async function run(action: () => Promise<void>) {
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await action();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function createEleve(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await fetch('/api/instruction/eleves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiant: identifiant.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur création élève');
      setIdentifiant('');
      setPassword('');
      setSuccess('Élève créé et rattaché à votre formation.');
    });
  }

  async function addAvionTemp(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await fetch('/api/instruction/avions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eleve_id: selectedEleveId,
          type_avion_id: typeAvionId,
          nom_personnalise: nomPerso.trim() || null,
          immatriculation: immat.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur assignation avion');
      setTypeAvionId('');
      setNomPerso('');
      setImmat('');
      setSuccess('Avion temporaire assigné.');
    });
  }

  async function saveAvion(id: string) {
    const v = editById[id];
    if (!v) return;
    await run(async () => {
      const res = await fetch('/api/instruction/avions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          nom_personnalise: v.nom,
          immatriculation: v.immat,
          aeroport_actuel: v.aeroport,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur mise à jour avion');
      setSuccess('Avion temporaire mis à jour.');
    });
  }

  async function removeAvion(id: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/avions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur suppression avion');
      setSuccess('Avion temporaire supprimé.');
    });
  }

  async function finishFormation(eleveId: string) {
    await run(async () => {
      const res = await fetch(`/api/instruction/eleves/${eleveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'terminer_formation' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur fin de formation');
      setSuccess('Formation terminée: les avions temporaires ont été retirés.');
    });
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold text-slate-100">Instruction</h1>
        <p className="text-sm text-slate-400">
          Ici, vous créez vos élèves et vous leur assignez des avions temporaires de formation.
        </p>
      </div>

      <form onSubmit={createEleve} className="card space-y-3">
        <h2 className="text-lg font-medium text-slate-200">Créer un élève</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="input" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} placeholder="Identifiant élève" required />
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe temporaire" required minLength={8} />
          <button className="btn-primary" type="submit" disabled={loading}>Créer l&apos;élève</button>
        </div>
      </form>

      <form onSubmit={addAvionTemp} className="card space-y-3">
        <h2 className="text-lg font-medium text-slate-200">Assigner un avion temporaire</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select className="input" value={selectedEleveId} onChange={(e) => setSelectedEleveId(e.target.value)} required>
            <option value="">Élève</option>
            {eleves.filter((e) => e.formation_instruction_active).map((e) => (
              <option key={e.id} value={e.id}>{e.identifiant}</option>
            ))}
          </select>
          <select className="input" value={typeAvionId} onChange={(e) => setTypeAvionId(e.target.value)} required>
            <option value="">Type avion</option>
            {typesAvion.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}{t.code_oaci ? ` (${t.code_oaci})` : ''}{t.constructeur ? ` - ${t.constructeur}` : ''}
              </option>
            ))}
          </select>
          <input className="input" value={immat} onChange={(e) => setImmat(e.target.value.toUpperCase())} placeholder="Immatriculation (optionnel)" />
          <input className="input" value={nomPerso} onChange={(e) => setNomPerso(e.target.value)} placeholder="Nom personnalisé (optionnel)" />
        </div>
        <button className="btn-primary" type="submit" disabled={loading}>Assigner</button>
      </form>

      <div className="card space-y-4">
        <h2 className="text-lg font-medium text-slate-200">Élèves en formation</h2>
        {eleves.length === 0 && <p className="text-slate-500">Aucun élève rattaché.</p>}
        {eleves.map((e) => {
          const avions = avionsByEleve.get(e.id) || [];
          return (
            <div key={e.id} className="rounded-lg border border-slate-700/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-100 font-medium">{e.identifiant}</p>
                  <p className="text-xs text-slate-500">{e.formation_instruction_active ? 'Formation active' : 'Formation terminée'}</p>
                </div>
                {e.formation_instruction_active && (
                  <button className="btn-secondary" type="button" disabled={loading} onClick={() => finishFormation(e.id)}>
                    Terminer la formation
                  </button>
                )}
              </div>

              {avions.length === 0 && (
                <p className="text-sm text-slate-500">Aucun avion temporaire assigné.</p>
              )}
              {avions.map((a) => {
                const type = typesAvion.find((t) => t.id === a.type_avion_id);
                const edit = editById[a.id] || {
                  nom: a.nom_personnalise || '',
                  immat: a.immatriculation || '',
                  aeroport: a.aeroport_actuel || 'IRFD',
                };
                return (
                  <div key={a.id} className="rounded border border-slate-700/60 p-3 space-y-2">
                    <p className="text-sm text-slate-300">{type?.nom || 'Type inconnu'}</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <input
                        className="input"
                        value={edit.immat}
                        onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, immat: ev.target.value.toUpperCase() } }))}
                        placeholder="Immatriculation"
                      />
                      <input
                        className="input"
                        value={edit.nom}
                        onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, nom: ev.target.value } }))}
                        placeholder="Nom personnalisé"
                      />
                      <input
                        className="input"
                        value={edit.aeroport}
                        onChange={(ev) => setEditById((prev) => ({ ...prev, [a.id]: { ...edit, aeroport: ev.target.value.toUpperCase() } }))}
                        placeholder="Aéroport actuel"
                      />
                      <div className="flex gap-2">
                        <button type="button" className="btn-primary" disabled={loading} onClick={() => saveAvion(a.id)}>Enregistrer</button>
                        <button type="button" className="btn-secondary" disabled={loading} onClick={() => removeAvion(a.id)}>Supprimer</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">{success}</p>}
    </div>
  );
}
