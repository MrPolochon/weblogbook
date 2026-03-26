'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, Plus, Loader2, Trash2, Users, Warehouse, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Entreprise {
  id: string;
  nom: string;
  description: string | null;
  pdg_id: string;
  pdg_callsign: string;
  created_at: string;
  nb_employes: number;
  nb_hangars: number;
  vban?: string | null;
}

interface User {
  id: string;
  identifiant: string;
}

export default function AdminReparationClient({ entreprises: initial, users }: { entreprises: Entreprise[]; users: User[] }) {
  const router = useRouter();
  const [entreprises, setEntreprises] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [nom, setNom] = useState('');
  const [desc, setDesc] = useState('');
  const [pdgId, setPdgId] = useState('');
  const [pdgFilter, setPdgFilter] = useState('');

  const filteredUsers = pdgFilter.length >= 1
    ? users.filter(u => (u.identifiant || '').toLowerCase().includes(pdgFilter.toLowerCase())).slice(0, 15)
    : [];

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(''); } else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 5000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim() || !pdgId) return;
    setBusy(true);
    try {
      const res = await fetch('/api/reparation/entreprises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom.trim(), description: desc.trim() || undefined, pdg_id: pdgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      flash('Entreprise créée');
      setNom(''); setDesc(''); setPdgId(''); setPdgFilter('');
      router.refresh();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erreur', true);
    } finally { setBusy(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer l'entreprise "${name}" ?\n\nCette action est irréversible. Toutes les données (hangars, employés, compte Felitz) seront supprimées.`)) return;
    const code = prompt(`Pour confirmer, tapez SUPPRIMER :`);
    if (code?.toUpperCase() !== 'SUPPRIMER') { flash('Suppression annulée.', true); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/reparation/entreprises/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'SUPPRIMER' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur');
      }
      flash('Entreprise supprimée');
      setEntreprises(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erreur', true);
    } finally { setBusy(false); }
  }

  const selectedUser = users.find(u => u.id === pdgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Wrench className="h-7 w-7 text-orange-400" />
          Entreprises de réparation
        </h1>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">{success}</p>}

      <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2"><Plus className="h-5 w-5 text-orange-400" />Créer une entreprise</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Nom de l&apos;entreprise *</label>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: AeroTech Repair" className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">PDG (utilisateur) *</label>
              <div className="relative">
                <input type="text" value={pdgFilter} onChange={e => { setPdgFilter(e.target.value); if (!e.target.value) setPdgId(''); }}
                  placeholder="Rechercher par identifiant..."
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2" />
                {filteredUsers.length > 0 && !pdgId && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl">
                    {filteredUsers.map(u => (
                      <button key={u.id} type="button" onClick={() => { setPdgId(u.id); setPdgFilter(u.identifiant); }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 flex items-center justify-between">
                        <span className="font-medium">{u.identifiant}</span>
                        <span className="text-xs text-slate-500 font-mono">{u.id.slice(0, 8)}...</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUser && (
                <p className="text-xs text-emerald-400 mt-1">
                  PDG sélectionné : <strong>{selectedUser.identifiant}</strong>
                  <span className="text-slate-500 ml-2 font-mono">{selectedUser.id.slice(0, 8)}...</span>
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Spécialité, localisation..." className="w-full rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2" />
            </div>
          </div>
          <button type="submit" disabled={busy || !nom.trim() || !pdgId} className="px-4 py-2 rounded-lg bg-orange-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
        <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2"><Wrench className="h-5 w-5 text-orange-400" />Entreprises ({entreprises.length})</h2>
        {entreprises.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune entreprise de réparation.</p>
        ) : (
          <div className="space-y-3">
            {entreprises.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-3 p-4 rounded-lg bg-slate-700/20 border border-slate-700/30">
                <div>
                  <p className="font-semibold text-slate-100">{e.nom}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />PDG : {e.pdg_callsign}</span>
                    <span>{e.nb_employes} employé{e.nb_employes > 1 ? 's' : ''}</span>
                    <span className="flex items-center gap-1"><Warehouse className="h-3 w-3" />{e.nb_hangars} hangar{e.nb_hangars > 1 ? 's' : ''}</span>
                    {e.vban && <span className="font-mono">VBAN: {e.vban}</span>}
                    {e.description && <span>— {e.description}</span>}
                    <span>{new Date(e.created_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                </div>
                <button disabled={busy} onClick={() => handleDelete(e.id, e.nom)} className="text-red-400 hover:text-red-300 disabled:opacity-50 shrink-0" title="Supprimer">
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
