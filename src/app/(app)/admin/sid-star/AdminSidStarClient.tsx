'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Route, Plus, Trash2, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { toast } from 'sonner';

interface SidStar {
  id: string;
  aeroport: string;
  type_procedure: 'SID' | 'STAR';
  nom: string;
  route: string;
}

export default function AdminSidStarClient() {
  const router = useRouter();
  const [procedures, setProcedures] = useState<SidStar[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAeroport, setFilterAeroport] = useState('');
  const [filterType, setFilterType] = useState<'SID' | 'STAR' | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ aeroport: '', type_procedure: 'SID' as 'SID' | 'STAR', nom: '', route: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchProcedures = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAeroport) params.set('aeroport', filterAeroport);
      if (filterType) params.set('type', filterType);
      const res = await fetch(`/api/sid-star?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setProcedures(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
      setProcedures([]);
    } finally {
      setLoading(false);
    }
  }, [filterAeroport, filterType]);

  useEffect(() => {
    fetchProcedures();
  }, [fetchProcedures]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.aeroport || !form.nom.trim() || !form.route.trim()) {
      toast.error('Remplissez tous les champs');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sid-star', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aeroport: form.aeroport,
          type_procedure: form.type_procedure,
          nom: form.nom.trim().toUpperCase(),
          route: form.route.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Procédure créée');
      setForm({ aeroport: '', type_procedure: 'SID', nom: '', route: '' });
      setShowForm(false);
      fetchProcedures();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette procédure ?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/sid-star/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast.success('Procédure supprimée');
      fetchProcedures();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setDeleting(null);
    }
  }

  const filtered = procedures;

  // Grouper par "famille" : base du nom (ex: LOGAN4 pour LOGAN4, LOGAN4 VIA DOCKR, LOGAN4.RENDR...)
  function getFamily(nom: string): string {
    const beforeVia = nom.split(' VIA ')[0].trim();
    const beforeDot = beforeVia.split('.')[0].trim();
    return beforeDot || nom;
  }

  const grouped = filtered.reduce<Record<string, SidStar[]>>((acc, p) => {
    const key = `${p.aeroport}|${p.type_procedure}|${getFamily(p.nom)}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const groupEntries = Object.entries(grouped).map(([key, items]) => {
    const [aeroport, typeProc, family] = key.split('|');
    return { key, aeroport, typeProc, family, items };
  });

  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  // Ouvrir toutes les familles quand les données sont chargées (sinon restent fermées car procedures vide au 1er rendu)
  const groupKeysStr = groupEntries.map((g) => g.key).sort().join(',');
  useEffect(() => {
    if (groupEntries.length > 0) {
      setExpandedFamilies((prev) => {
        const keys = new Set(groupEntries.map((g) => g.key));
        if (prev.size === 0) return keys;
        return new Set(Array.from(prev).concat(Array.from(keys)));
      });
    }
  // groupKeysStr = représentation stable des clés (groupEntries recréé à chaque rendu)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKeysStr]);

  function toggleFamily(key: string) {
    setExpandedFamilies((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterAeroport}
          onChange={(e) => setFilterAeroport(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tous les aéroports</option>
          {AEROPORTS_PTFS.map((a) => (
            <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as 'SID' | 'STAR' | '')}
          className="bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">SID & STAR</option>
          <option value="SID">SID</option>
          <option value="STAR">STAR</option>
        </select>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouvelle procédure
        </button>
      </div>

      {/* Formulaire création */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-slate-800/50 border border-slate-600 space-y-4">
          <h3 className="font-semibold text-slate-200">Créer une SID ou STAR</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Aéroport *</label>
              <select
                value={form.aeroport}
                onChange={(e) => setForm((f) => ({ ...f, aeroport: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2"
                required
              >
                <option value="">— Choisir —</option>
                {AEROPORTS_PTFS.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Type *</label>
              <select
                value={form.type_procedure}
                onChange={(e) => setForm((f) => ({ ...f, type_procedure: e.target.value as 'SID' | 'STAR' }))}
                className="w-full bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2"
              >
                <option value="SID">SID</option>
                <option value="STAR">STAR</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nom (ex: LOGAN4, LOGAN4 VIA DOCKR, LOGAN4.RENDR) *</label>
            <input
              type="text"
              value={form.nom}
              onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
              placeholder="LOGAN4 ou LOGAN4 VIA DOCKR ou LOGAN4.RENDR"
              className="w-full bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Route (points séparés par DCT ou airway) *</label>
            <textarea
              value={form.route}
              onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}
              placeholder="logan DCT IMLR DCT BUCFA DCT SKYDV DCT WELSH"
              rows={2}
              className="w-full bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 font-mono text-sm"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              DCT = direct. Les airways ont des chiffres (ex: UL345, TGR456). Entre chaque paire de points : DCT ou nom d&apos;airway.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Enregistrement…' : 'Créer'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-slate-200 rounded-lg text-sm"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Liste */}
      <div className="rounded-xl border border-slate-600 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            Aucune procédure. Créez-en une pour qu&apos;elles apparaissent dans le dépôt de plan de vol.
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {groupEntries.map(({ key, aeroport, typeProc, family, items }) => {
              const isExpanded = expandedFamilies.has(key);
              return (
                <div key={key} className="border-b border-slate-700 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleFamily(key)}
                    className="w-full flex items-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-800/70 text-left transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <span className="font-mono font-bold text-slate-200">{family}</span>
                    <span className="text-slate-500 text-sm">({items.length} variante{items.length > 1 ? 's' : ''})</span>
                    <span className="text-slate-500 text-xs">— {aeroport}</span>
                    <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${typeProc === 'SID' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {typeProc}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="overflow-x-auto bg-slate-900/30">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-800/60 text-slate-400 text-xs">
                            <th className="text-left px-4 py-2 font-medium">Aéroport</th>
                            <th className="text-left px-4 py-2 font-medium">Type</th>
                            <th className="text-left px-4 py-2 font-medium">Nom</th>
                            <th className="text-left px-4 py-2 font-medium">Route</th>
                            <th className="w-12 px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p) => (
                            <tr key={p.id} className="border-t border-slate-700/50 hover:bg-slate-800/20">
                              <td className="px-4 py-2 font-mono font-bold text-sky-400">{p.aeroport}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.type_procedure === 'SID' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                  {p.type_procedure}
                                </span>
                              </td>
                              <td className="px-4 py-2 font-mono text-slate-200">{p.nom}</td>
                              <td className="px-4 py-2 font-mono text-slate-400 text-xs max-w-md truncate" title={p.route}>{p.route}</td>
                              <td className="px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(p.id)}
                                  disabled={deleting === p.id}
                                  className="p-1.5 text-red-400 hover:bg-red-500/20 rounded disabled:opacity-50"
                                  title="Supprimer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
