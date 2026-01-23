'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, Building2, User, Plus, Minus, Edit2 } from 'lucide-react';

type Compte = {
  id: string;
  user_id: string | null;
  compagnie_id: string | null;
  vban: string;
  solde: number;
  created_at: string;
  compagnies?: { nom: string } | null;
  profiles?: { identifiant: string } | null;
};

type User = { id: string; identifiant: string };
type Compagnie = { id: string; nom: string };

type Props = {
  comptes: Compte[];
  users: User[];
  compagnies: Compagnie[];
};

// Helper pour extraire le nom de compagnie
function getCompagnieNom(compagnies: { nom: string } | null | undefined): string | null {
  if (!compagnies) return null;
  return compagnies.nom || null;
}

// Helper pour extraire l'identifiant du profil
function getProfileIdentifiant(profiles: { identifiant: string } | null | undefined): string | null {
  if (!profiles) return null;
  return profiles.identifiant || null;
}

export default function AdminFelitzComptesContent({ comptes, users, compagnies }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedCompte, setSelectedCompte] = useState<string | null>(null);
  const [montant, setMontant] = useState('');
  const [action, setAction] = useState<'ajout' | 'retrait' | 'set'>('ajout');
  const [showCreate, setShowCreate] = useState(false);
  const [createUserId, setCreateUserId] = useState('');
  const [createCompagnieId, setCreateCompagnieId] = useState('');

  async function handleModifierSolde() {
    if (!selectedCompte || !montant || Number(montant) <= 0) return;
    setLoading(true);
    try {
      const body: any = {};
      if (action === 'ajout') {
        body.montant_ajout = Number(montant);
      } else if (action === 'retrait') {
        body.montant_retrait = Number(montant);
      } else {
        body.solde = Number(montant);
      }

      const res = await fetch(`/api/felitz/comptes/${selectedCompte}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      alert('Solde modifié avec succès');
      setSelectedCompte(null);
      setMontant('');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCompte() {
    if (!createUserId && !createCompagnieId) {
      alert('Sélectionnez un utilisateur ou une compagnie');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/felitz/comptes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: createUserId || null,
          compagnie_id: createCompagnieId || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      alert('Compte créé avec succès');
      setShowCreate(false);
      setCreateUserId('');
      setCreateCompagnieId('');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const compteSelectionne = selectedCompte ? comptes.find((c) => c.id === selectedCompte) : null;
  const compteSysteme = comptes.find((c) => c.vban.startsWith('SYSTEME'));

  return (
    <div className="space-y-6">
      {compteSysteme && (
        <div className="card bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-purple-500/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-slate-200 flex items-center gap-2">
                <Wallet className="h-5 w-5 text-purple-400" />
                Compte système (Admin)
              </h2>
              <p className="text-slate-300 mt-1">VBAN: {compteSysteme.vban}</p>
              <p className="text-2xl font-bold text-purple-400 mt-2">
                {Number(compteSysteme.solde).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </p>
              <p className="text-slate-400 text-sm mt-1">Ce compte est utilisé pour les opérations administratives</p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-slate-200">Tous les comptes</h2>
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Créer un compte
          </button>
        </div>

        {showCreate && (
          <div className="mb-4 p-4 border border-slate-700 rounded-lg bg-slate-800/30 space-y-3">
            <div>
              <label className="label">Utilisateur (optionnel)</label>
              <select
                className="input"
                value={createUserId}
                onChange={(e) => {
                  setCreateUserId(e.target.value);
                  if (e.target.value) setCreateCompagnieId('');
                }}
              >
                <option value="">— Aucun —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.identifiant}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Compagnie (optionnel)</label>
              <select
                className="input"
                value={createCompagnieId}
                onChange={(e) => {
                  setCreateCompagnieId(e.target.value);
                  if (e.target.value) setCreateUserId('');
                }}
              >
                <option value="">— Aucune —</option>
                {compagnies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateCompte}
                className="btn-primary"
                disabled={loading || (!createUserId && !createCompagnieId)}
              >
                Créer
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setCreateUserId('');
                  setCreateCompagnieId('');
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {selectedCompte && (
          <div className="mb-4 p-4 border border-sky-500/50 rounded-lg bg-sky-900/20 space-y-3">
            <h3 className="text-slate-200 font-medium">Modifier le solde</h3>
            <div>
              <label className="label">Action</label>
              <select
                className="input"
                value={action}
                onChange={(e) => setAction(e.target.value as 'ajout' | 'retrait' | 'set')}
              >
                <option value="ajout">Ajouter de l&apos;argent</option>
                <option value="retrait">Retirer de l&apos;argent</option>
                <option value="set">Définir le solde exact</option>
              </select>
            </div>
            <div>
              <label className="label">Montant (€)</label>
              <input
                type="number"
                className="input"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleModifierSolde}
                className="btn-primary"
                disabled={loading || !montant || Number(montant) <= 0}
              >
                {loading ? 'Modification…' : 'Modifier'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCompte(null);
                  setMontant('');
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {comptes.length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun compte.</p>
        ) : (
          <div className="space-y-2">
            {comptes.map((compte) => (
              <div
                key={compte.id}
                className={`border rounded-lg p-3 bg-slate-800/30 flex items-center justify-between ${
                  compte.vban.startsWith('SYSTEME')
                    ? 'border-purple-500/50 bg-purple-900/10'
                    : 'border-slate-700/50'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {compte.compagnie_id ? (
                      <Building2 className="h-4 w-4 text-blue-400" />
                    ) : compte.user_id ? (
                      <User className="h-4 w-4 text-green-400" />
                    ) : (
                      <Wallet className="h-4 w-4 text-purple-400" />
                    )}
                    <p className="text-slate-200 font-medium">
                      {compte.compagnie_id
                        ? getCompagnieNom(compte.compagnies) || 'Compagnie'
                        : compte.user_id
                        ? getProfileIdentifiant(compte.profiles) || 'Utilisateur'
                        : 'Compte système'}
                    </p>
                  </div>
                  <p className="text-slate-400 text-sm">VBAN: {compte.vban}</p>
                  <p className="text-slate-300 text-lg font-semibold mt-1">
                    {Number(compte.solde).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCompte(compte.id);
                    setMontant('');
                    setAction('ajout');
                  }}
                  className="btn-secondary flex items-center gap-2"
                  disabled={loading}
                >
                  <Edit2 className="h-4 w-4" />
                  Modifier
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
