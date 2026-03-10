'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Handshake, Plus, Loader2, Trash2, Users, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Alliance {
  id: string;
  nom: string;
  description: string | null;
  devise: string | null;
  created_at: string;
  nb_membres: number;
}

interface Compagnie {
  id: string;
  nom: string;
  pdg_id: string;
  has_alliance: boolean;
}

export default function AdminAlliancesClient({ alliances: initial, compagnies }: { alliances: Alliance[]; compagnies: Compagnie[] }) {
  const router = useRouter();
  const [alliances, setAlliances] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [nom, setNom] = useState('');
  const [desc, setDesc] = useState('');
  const [devise, setDevise] = useState('');
  const [compagnieId, setCompagnieId] = useState('');

  const availableCompagnies = compagnies.filter(c => !c.has_alliance);

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(''); } else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !compagnieId) return;
    setBusy(true);
    try {
      const res = await fetch('/api/alliances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom.trim(), compagnie_id: compagnieId, description: desc.trim() || undefined, devise: devise.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      flash('Alliance créée');
      setNom(''); setDesc(''); setDevise(''); setCompagnieId('');
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erreur', true);
    } finally { setBusy(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Dissoudre l'alliance "${name}" ? Cette action est irréversible.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/alliances/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      flash('Alliance dissoute');
      setAlliances(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erreur', true);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Handshake className="h-7 w-7 text-violet-400" />
          Gestion des alliances
        </h1>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">{success}</p>}

      <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2"><Plus className="h-5 w-5 text-violet-400" />Créer une alliance</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Nom *</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Star Alliance" className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Compagnie fondatrice (PDG = président) *</label>
              <select value={compagnieId} onChange={e => setCompagnieId(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2">
                <option value="">— Choisir —</option>
                {availableCompagnies.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              {availableCompagnies.length === 0 && <p className="text-xs text-amber-400 mt-1">Toutes les compagnies sont déjà dans une alliance.</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Objectif de l'alliance" className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Devise / Slogan</label>
              <input type="text" value={devise} onChange={e => setDevise(e.target.value)} placeholder="Unis pour voler plus haut" className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2" />
            </div>
          </div>
          <button type="submit" disabled={busy || !nom.trim() || !compagnieId} className="px-4 py-2 rounded-lg bg-violet-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer l&apos;alliance
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-sky-400" />Alliances existantes ({alliances.length})</h2>
        {alliances.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune alliance.</p>
        ) : (
          <div className="space-y-3">
            {alliances.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-4 rounded-lg bg-slate-700/20 border border-slate-700/30">
                <div>
                  <p className="font-semibold text-slate-100">{a.nom}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>{a.nb_membres} membre{a.nb_membres > 1 ? 's' : ''}</span>
                    {a.description && <span>— {a.description}</span>}
                    {a.devise && <span className="italic">&laquo; {a.devise} &raquo;</span>}
                    <span>{new Date(a.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>
                <button disabled={busy} onClick={() => handleDelete(a.id, a.nom)} className="text-red-400 hover:text-red-300 disabled:opacity-50 shrink-0" title="Dissoudre">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
