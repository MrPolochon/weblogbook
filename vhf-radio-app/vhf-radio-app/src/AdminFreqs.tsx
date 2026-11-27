import { useState, useEffect, useCallback } from 'react';
import { Radio, Plus, Trash2, Edit3, Save, X, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { API_BASE_URL } from './lib/config';
import { isValidVhfFrequency } from './lib/vhf-frequencies';

interface Frequency {
  id: string;
  aeroport: string;
  position: string;
  frequency: string;
}

interface AdminFreqsProps {
  onBack: () => void;
  accessToken: string;
}

export default function AdminFreqs({ onBack, accessToken }: AdminFreqsProps) {
  const [frequencies, setFrequencies] = useState<Frequency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFreq, setEditFreq] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newAeroport, setNewAeroport] = useState('');
  const [newPosition, setNewPosition] = useState('TWR');
  const [newFrequency, setNewFrequency] = useState('');
  const [saving, setSaving] = useState(false);

  const getAuthHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };
  }, [accessToken]);

  const fetchFrequencies = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/vhf/frequencies`, { headers });
      if (!res.ok) throw new Error('Erreur serveur');
      const data = await res.json();
      setFrequencies(data);
      setError('');
    } catch (err) {
      setError('Impossible de charger les fréquences');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchFrequencies();
  }, [fetchFrequencies]);

  async function handleAdd() {
    if (!newAeroport || !newPosition || !newFrequency) {
      setError('Tous les champs sont requis');
      return;
    }
    if (!isValidVhfFrequency(newFrequency)) {
      setError(`Fréquence invalide : ${newFrequency}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/vhf/frequencies`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          aeroport: newAeroport.toUpperCase(),
          position: newPosition,
          frequency: newFrequency,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erreur');
        setSaving(false);
        return;
      }
      setShowAdd(false);
      setNewAeroport('');
      setNewPosition('TWR');
      setNewFrequency('');
      fetchFrequencies();
    } catch {
      setError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(id: string) {
    if (!editFreq || !isValidVhfFrequency(editFreq)) {
      setError(`Fréquence invalide : ${editFreq}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/vhf/frequencies`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id, frequency: editFreq }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erreur');
        setSaving(false);
        return;
      }
      setEditingId(null);
      setEditFreq('');
      fetchFrequencies();
    } catch {
      setError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette fréquence ?')) return;
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/vhf/frequencies?id=${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erreur');
        return;
      }
      fetchFrequencies();
    } catch {
      setError('Erreur réseau');
    }
  }

  // Group by aeroport
  const grouped = frequencies.reduce<Record<string, Frequency[]>>((acc, f) => {
    if (!acc[f.aeroport]) acc[f.aeroport] = [];
    acc[f.aeroport].push(f);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Radio className="h-5 w-5 text-emerald-400" />
                Fréquences VHF
              </h1>
              <p className="text-xs text-slate-500">Administration</p>
            </div>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 mb-4">
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 mb-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Nouvelle fréquence</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Aéroport (OACI)</label>
                <input
                  value={newAeroport}
                  onChange={(e) => setNewAeroport(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="w-full px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-sm text-slate-200 font-mono uppercase"
                  placeholder="IRFD"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Position</label>
                <select
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-sm text-slate-200"
                >
                  <option value="TWR">TWR</option>
                  <option value="GND">GND</option>
                  <option value="APP">APP</option>
                  <option value="CTR">CTR</option>
                  <option value="DEL">DEL</option>
                  <option value="AFIS">AFIS</option>
                  <option value="ATIS">ATIS</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Fréquence</label>
              <input
                value={newFrequency}
                onChange={(e) => setNewFrequency(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-slate-700 border border-slate-600 text-sm text-slate-200 font-mono"
                placeholder="118.935"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 transition-colors">
                Annuler
              </button>
              <button
                onClick={handleAdd}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Enregistrer
              </button>
            </div>
          </div>
        )}

        {/* Frequencies list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-slate-500 animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12">
            <Radio className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Aucune fréquence configurée</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([apt, freqs]) => (
              <div key={apt} className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
                <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700">
                  <span className="text-sm font-bold text-emerald-400 font-mono">{apt}</span>
                </div>
                <div className="divide-y divide-slate-700/50">
                  {freqs.map((f) => (
                    <div key={f.id} className="px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-medium w-12">{f.position}</span>
                        {editingId === f.id ? (
                          <input
                            value={editFreq}
                            onChange={(e) => setEditFreq(e.target.value)}
                            className="px-2 py-0.5 rounded bg-slate-700 border border-emerald-500/50 text-sm text-emerald-300 font-mono w-24"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(f.id); if (e.key === 'Escape') { setEditingId(null); setEditFreq(''); } }}
                          />
                        ) : (
                          <span className="text-sm text-emerald-300 font-mono">{f.frequency}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {editingId === f.id ? (
                          <>
                            <button onClick={() => handleEdit(f.id)} disabled={saving}
                              className="p-1 rounded text-emerald-400 hover:text-emerald-300 hover:bg-slate-700 transition-colors">
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => { setEditingId(null); setEditFreq(''); }}
                              className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(f.id); setEditFreq(f.frequency); }}
                              className="p-1 rounded text-slate-500 hover:text-sky-400 hover:bg-slate-700 transition-colors">
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(f.id)}
                              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
