'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, BookOpen, Crown, Settings, Save, RefreshCw } from 'lucide-react';

type Pilote = { id: string; identifiant: string };
type C = { 
  id: string; 
  nom: string; 
  pdg_id: string | null;
  prix_billet_pax: number;
  prix_kg_cargo: number;
  pourcentage_salaire: number;
  vban: string | null;
  code_oaci: string | null;
  callsign_telephonie: string | null;
  profiles: { identifiant: string }[] | { identifiant: string } | null;
};

function getPdgIdentifiant(profiles: C['profiles']): string | null {
  if (!profiles) return null;
  if (Array.isArray(profiles)) {
    return profiles[0]?.identifiant || null;
  }
  return profiles.identifiant || null;
}

export default function CompagniesList({ compagnies, pilotes }: { compagnies: C[]; pilotes: Pilote[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function handleDelete(id: string, nom: string) {
    if (!confirm(`Supprimer « ${nom} » ? Le nom restera affiché sur les vols déjà enregistrés.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/compagnies/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Erreur lors de la suppression');
        return;
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur lors de la suppression');
    } finally {
      setDeleting(null);
    }
  }

  if (compagnies.length === 0) return <p className="text-slate-500">Aucune compagnie.</p>;

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-200 mb-4">Liste des compagnies</h2>
      <div className="space-y-4">
        {compagnies.map((c) => (
          <div key={c.id} className="border-b border-slate-700/50 pb-4 last:border-0 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-slate-200 font-medium">{c.nom}</span>
                {c.code_oaci && (
                  <span className="ml-2 text-xs font-mono bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">{c.code_oaci}</span>
                )}
                {c.callsign_telephonie && (
                  <span className="ml-1 text-xs text-slate-400">{c.callsign_telephonie}</span>
                )}
                {getPdgIdentifiant(c.profiles) && (
                  <span className="ml-2 text-sm text-amber-400 flex items-center gap-1 inline-flex">
                    <Crown className="h-3 w-3" />
                    {getPdgIdentifiant(c.profiles)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(editing === c.id ? null : c.id)}
                  className={`rounded p-1.5 transition-colors ${editing === c.id ? 'bg-sky-600/20 text-sky-400' : 'text-slate-400 hover:bg-slate-700/50 hover:text-sky-400'}`}
                  title="Paramètres"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <Link
                  href={`/admin/compagnies/${c.id}/logbook`}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-sky-400"
                  title="Voir le logbook"
                >
                  <BookOpen className="h-4 w-4" />
                </Link>
            <button
              onClick={() => handleDelete(c.id, c.nom)}
              disabled={deleting === c.id}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-red-400 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
              </div>
            </div>
            
            {c.vban && (
              <p className="text-xs text-slate-500 font-mono mb-2">{c.vban}</p>
            )}
            
            {editing === c.id && (
              <CompagnieSettings compagnie={c} pilotes={pilotes} onClose={() => setEditing(null)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompagnieSettings({ compagnie, pilotes, onClose }: { compagnie: C; pilotes: Pilote[]; onClose: () => void }) {
  const router = useRouter();
  const [pdgId, setPdgId] = useState(compagnie.pdg_id || '');
  const [prixBillet, setPrixBillet] = useState(compagnie.prix_billet_pax.toString());
  const [prixCargo, setPrixCargo] = useState(compagnie.prix_kg_cargo.toString());
  const [salaire, setSalaire] = useState(compagnie.pourcentage_salaire.toString());
  const [codeOaci, setCodeOaci] = useState(compagnie.code_oaci || '');
  const [callsignTel, setCallsignTel] = useState(compagnie.callsign_telephonie || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/compagnies/${compagnie.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdg_id: pdgId || null,
          prix_billet_pax: parseInt(prixBillet) || 100,
          prix_kg_cargo: parseInt(prixCargo) || 5,
          pourcentage_salaire: parseInt(salaire) || 20,
          code_oaci: codeOaci || null,
          callsign_telephonie: callsignTel || null,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">PDG</label>
          <select
            value={pdgId}
            onChange={(e) => setPdgId(e.target.value)}
            className="input w-full text-sm"
          >
            <option value="">Aucun PDG</option>
            {pilotes.map((p) => (
              <option key={p.id} value={p.id}>{p.identifiant}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">% salaire pilote</label>
          <input
            type="number"
            value={salaire}
            onChange={(e) => setSalaire(e.target.value)}
            min="0"
            max="100"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Prix billet passager (F$)</label>
          <input
            type="number"
            value={prixBillet}
            onChange={(e) => setPrixBillet(e.target.value)}
            min="0"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Prix kg cargo (F$)</label>
          <input
            type="number"
            value={prixCargo}
            onChange={(e) => setPrixCargo(e.target.value)}
            min="0"
            className="input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Code OACI (ex: AFR, LUF)</label>
          <input
            type="text"
            value={codeOaci}
            onChange={(e) => setCodeOaci(e.target.value.toUpperCase())}
            maxLength={4}
            placeholder="AFR"
            className="input w-full text-sm font-mono uppercase"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Callsign radio (ex: AIRFRANCE)</label>
          <input
            type="text"
            value={callsignTel}
            onChange={(e) => setCallsignTel(e.target.value.toUpperCase())}
            maxLength={30}
            placeholder="AIRFRANCE"
            className="input w-full text-sm font-mono uppercase"
          />
        </div>
      </div>
      
      {error && <p className="text-xs text-red-400">{error}</p>}
      
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
        >
          {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Enregistrer
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// Note: L'ancien système de flotte par quantité a été supprimé.
// Les avions de compagnie sont maintenant gérés individuellement dans /admin/avions
