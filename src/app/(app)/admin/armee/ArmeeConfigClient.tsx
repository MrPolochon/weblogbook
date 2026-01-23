'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Landmark, User, RefreshCw, Plus, Clock, Users } from 'lucide-react';
import { formatDuree } from '@/lib/utils';

interface Pilote {
  id: string;
  identifiant: string;
  role?: string;
  armee?: boolean;
}

interface CompteMilitaire {
  id: string;
  vban: string;
  solde: number;
  proprietaire_id: string | null;
}

interface Props {
  compteMilitaire: CompteMilitaire | null;
  pdgActuel: { id: string; identifiant: string } | null;
  tousPilotes: Pilote[];
  pilotesArmee: Pilote[];
  totalMinutes: number;
}

export default function ArmeeConfigClient({ compteMilitaire, pdgActuel, tousPilotes, pilotesArmee, totalMinutes }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [selectedPdg, setSelectedPdg] = useState(pdgActuel?.id || '');
  const [soldeInitial, setSoldeInitial] = useState('0');

  // Créer le compte militaire
  async function handleCreateCompte() {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/armee/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_compte',
          pdg_id: selectedPdg || null,
          solde_initial: parseInt(soldeInitial) || 0
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Compte de l\'armée créé avec succès');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  // Mettre à jour le PDG militaire
  async function handleUpdatePdg() {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/armee/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_pdg',
          pdg_id: selectedPdg || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('PDG militaire mis à jour');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Configuration du compte de l'armée */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Landmark className="h-5 w-5 text-red-400" />
          Compte Bancaire de l&apos;Armée
        </h2>

        {compteMilitaire ? (
          <div className="space-y-4">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
              <p className="text-sm text-slate-400 mb-1">VBAN Armée</p>
              <p className="font-mono text-slate-200 text-sm break-all">{compteMilitaire.vban}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/30">
                <p className="text-sm text-emerald-400">Solde actuel</p>
                <p className="text-2xl font-bold text-emerald-300">
                  {compteMilitaire.solde.toLocaleString('fr-FR')} F$
                </p>
              </div>
              <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                <p className="text-sm text-red-400">PDG Militaire actuel</p>
                <p className="text-xl font-bold text-red-300">
                  {pdgActuel?.identifiant || 'Non défini'}
                </p>
              </div>
            </div>

            {/* Modifier le PDG */}
            <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Modifier le PDG Militaire
              </label>
              <div className="flex gap-3">
                <select 
                  className="input flex-1" 
                  value={selectedPdg} 
                  onChange={(e) => setSelectedPdg(e.target.value)}
                >
                  <option value="">— Aucun PDG —</option>
                  {tousPilotes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.identifiant} {p.role === 'admin' ? '(Admin)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleUpdatePdg}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                  Mettre à jour
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-400">
              Aucun compte bancaire configuré pour l&apos;armée. Créez-en un pour permettre la gestion financière militaire.
            </p>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  PDG Militaire (optionnel)
                </label>
                <select 
                  className="input w-full" 
                  value={selectedPdg} 
                  onChange={(e) => setSelectedPdg(e.target.value)}
                >
                  <option value="">— Sélectionner plus tard —</option>
                  {tousPilotes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.identifiant} {p.role === 'admin' ? '(Admin)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Solde initial (F$)
                </label>
                <input 
                  type="number" 
                  className="input w-full" 
                  value={soldeInitial}
                  onChange={(e) => setSoldeInitial(e.target.value)}
                  min="0"
                />
              </div>
            </div>

            <button
              onClick={handleCreateCompte}
              disabled={loading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Créer le compte de l&apos;Armée
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
        {success && <p className="text-emerald-400 text-sm mt-3">{success}</p>}
      </div>

      {/* Liste des pilotes militaires */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-red-400" />
          Pilotes Militaires
          <span className="text-sm font-normal text-slate-500">({pilotesArmee.length})</span>
        </h2>

        <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400">
            <Clock className="h-4 w-4" />
            <span>Temps de vol militaire total validé : <span className="font-semibold text-red-300">{formatDuree(totalMinutes)}</span></span>
          </div>
        </div>

        {pilotesArmee.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pilotesArmee.map((p) => (
              <div 
                key={p.id} 
                className={`p-3 rounded-lg border ${
                  pdgActuel?.id === p.id 
                    ? 'bg-red-500/10 border-red-500/30' 
                    : 'bg-slate-800/50 border-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className={`h-4 w-4 ${pdgActuel?.id === p.id ? 'text-red-400' : 'text-slate-500'}`} />
                  <span className="text-slate-200">{p.identifiant}</span>
                  {pdgActuel?.id === p.id && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">PDG</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500">Aucun pilote avec le rôle militaire.</p>
        )}

        <p className="text-xs text-slate-500 mt-4">
          Pour ajouter le rôle militaire à un pilote, modifiez son profil dans la section &quot;Pilotes&quot;.
        </p>
      </div>
    </div>
  );
}
