'use client';

import { useState, useEffect, useCallback } from 'react';
import { Radio, Plus, Trash2, Save, AlertCircle, Loader2, Edit2, X } from 'lucide-react';
import { isValidVhfFrequency } from '@/lib/vhf-frequencies';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';

interface FreqEntry {
  id: string;
  aeroport: string;
  position: string;
  frequency: string;
}

const POSITIONS = [...ATC_POSITIONS, 'AFIS'] as const;
const AEROPORTS = Array.from(CODES_OACI_VALIDES).sort();

export default function FrequencesVhfSection() {
  const [frequencies, setFrequencies] = useState<FreqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Formulaire d'ajout
  const [newAeroport, setNewAeroport] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newFrequency, setNewFrequency] = useState('');
  const [adding, setAdding] = useState(false);

  // Édition inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFrequency, setEditFrequency] = useState('');
  const [saving, setSaving] = useState(false);

  const loadFrequencies = useCallback(async () => {
    try {
      const res = await fetch('/api/vhf/frequencies');
      if (res.ok) {
        const data = await res.json();
        setFrequencies(data);
      }
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFrequencies();
  }, [loadFrequencies]);

  async function handleAdd() {
    if (!newAeroport || !newPosition || !newFrequency) {
      setError('Tous les champs sont requis');
      return;
    }
    if (!isValidVhfFrequency(newFrequency)) {
      setError(`Fréquence invalide : ${newFrequency}`);
      return;
    }

    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/vhf/frequencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aeroport: newAeroport,
          position: newPosition,
          frequency: newFrequency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Fréquence ajoutée');
      setNewAeroport('');
      setNewPosition('');
      setNewFrequency('');
      loadFrequencies();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette assignation de fréquence ?')) return;
    setError('');
    try {
      const res = await fetch(`/api/vhf/frequencies?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess('Fréquence supprimée');
      loadFrequencies();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleSaveEdit() {
    if (!editingId || !editFrequency) return;
    if (!isValidVhfFrequency(editFrequency)) {
      setError(`Fréquence invalide : ${editFrequency}`);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/vhf/frequencies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, frequency: editFrequency }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Fréquence modifiée');
      setEditingId(null);
      setEditFrequency('');
      loadFrequencies();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  // Valider visuellement la fréquence saisie
  const freqIsValid = (f: string) => !f || isValidVhfFrequency(f);

  // Grouper par aéroport
  const grouped = frequencies.reduce<Record<string, FreqEntry[]>>((acc, f) => {
    if (!acc[f.aeroport]) acc[f.aeroport] = [];
    acc[f.aeroport].push(f);
    return acc;
  }, {});

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Radio className="h-5 w-5 text-emerald-600" />
        Fréquences VHF
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        Assignez une fréquence VHF unique à chaque position ATC/AFIS par aéroport.
        Chaque fréquence ne peut être attribuée qu&apos;à une seule position.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 mb-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          {success}
        </div>
      )}

      {/* Formulaire d'ajout */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Aéroport</label>
          <select
            value={newAeroport}
            onChange={(e) => setNewAeroport(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">Sélectionner</option>
            {AEROPORTS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Position</label>
          <select
            value={newPosition}
            onChange={(e) => setNewPosition(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
          >
            <option value="">Sélectionner</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Fréquence</label>
          <input
            type="text"
            value={newFrequency}
            onChange={(e) => setNewFrequency(e.target.value)}
            placeholder="118.935"
            className={`text-sm border rounded-lg px-3 py-1.5 w-28 font-mono ${
              freqIsValid(newFrequency) ? 'border-slate-300' : 'border-red-400 bg-red-50'
            }`}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !newAeroport || !newPosition || !newFrequency}
          className="flex items-center gap-1 text-sm px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg transition-colors"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Ajouter
        </button>
      </div>

      {/* Tableau des fréquences */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : frequencies.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">Aucune fréquence assignée</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([apt, entries]) => (
            <div key={apt} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-emerald-50 px-4 py-2 border-b border-slate-200">
                <span className="font-bold font-mono text-emerald-700">{apt}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {entries.sort((a, b) => a.position.localeCompare(b.position)).map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-slate-700 w-20">{f.position}</span>
                      {editingId === f.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editFrequency}
                            onChange={(e) => setEditFrequency(e.target.value)}
                            className={`text-sm font-mono border rounded px-2 py-0.5 w-28 ${
                              freqIsValid(editFrequency) ? 'border-slate-300' : 'border-red-400 bg-red-50'
                            }`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') { setEditingId(null); setEditFrequency(''); }
                            }}
                          />
                          <button
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="text-emerald-600 hover:text-emerald-700"
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditFrequency(''); }}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-mono text-emerald-600 font-semibold">{f.frequency}</span>
                      )}
                    </div>
                    {editingId !== f.id && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditingId(f.id); setEditFrequency(f.frequency); }}
                          className="text-slate-400 hover:text-sky-600 transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(f.id)}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
