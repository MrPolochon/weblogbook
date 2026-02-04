'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, User, KeyRound } from 'lucide-react';

type Grade = { id: string; nom: string; ordre: number };

type Mode = 'nouveau' | 'existant';

export default function AdminCreateSiaviForm({ grades }: { grades: Grade[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('nouveau');
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [aussiPilote, setAussiPilote] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifiant.trim()) return;
    
    if (mode === 'nouveau' && (!password || password.length < 8)) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/siavi/comptes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifiant: identifiant.trim(),
          password: mode === 'nouveau' ? password : undefined,
          grade_id: gradeId || null,
          mode,
          aussi_pilote: mode === 'nouveau' ? aussiPilote : undefined,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'ajout');
      }
      
      if (mode === 'nouveau') {
        setSuccess(`Compte SIAVI "${identifiant}" créé avec succès ! L'agent peut se connecter avec son mot de passe.`);
      } else {
        setSuccess(`Rôle SIAVI accordé à "${identifiant}" avec succès !`);
      }
      setIdentifiant('');
      setPassword('');
      setGradeId('');
      setAussiPilote(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-red-200 bg-white p-4">
      <h2 className="text-lg font-medium text-red-800 mb-4">Ajouter un agent SIAVI</h2>
      
      {/* Sélecteur de mode */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode('nouveau')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'nouveau'
              ? 'bg-red-600 text-white'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Nouveau compte
        </button>
        <button
          type="button"
          onClick={() => setMode('existant')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'existant'
              ? 'bg-red-600 text-white'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          <User className="h-4 w-4" />
          Compte existant
        </button>
      </div>
      
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <p className="text-green-600 text-sm">{success}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-red-700 mb-1">
            {mode === 'nouveau' ? 'Nouvel identifiant' : 'Identifiant du pilote existant'}
          </label>
          <input
            type="text"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            placeholder="Identifiant..."
            className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            required
          />
          {mode === 'existant' && (
            <p className="text-xs text-slate-500 mt-1">Le pilote doit déjà avoir un compte</p>
          )}
          {mode === 'nouveau' && (
            <p className="text-xs text-slate-500 mt-1">Cet identifiant sera utilisé pour se connecter</p>
          )}
        </div>
        
        {mode === 'nouveau' && (
          <div>
            <label className="block text-sm font-medium text-red-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 caractères..."
              className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
              required
              minLength={8}
            />
            <p className="text-xs text-slate-500 mt-1">L&apos;agent pourra changer son mot de passe dans Mon compte</p>
          </div>
        )}
        
        <div>
          <label className="block text-sm font-medium text-red-700 mb-1">Grade (optionnel)</label>
          <select
            value={gradeId}
            onChange={(e) => setGradeId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-red-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">— Aucun grade —</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>{g.nom}</option>
            ))}
          </select>
        </div>
        
        {mode === 'nouveau' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aussiPilote}
              onChange={(e) => setAussiPilote(e.target.checked)}
              className="rounded border-red-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-slate-700">Aussi pilote (accès aux deux espaces)</span>
          </label>
        )}

        <button
          type="submit"
          disabled={loading || !identifiant.trim() || (mode === 'nouveau' && password.length < 8)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {loading ? 'En cours...' : mode === 'nouveau' ? 'Créer le compte SIAVI' : 'Ajouter comme agent SIAVI'}
        </button>
      </form>
    </div>
  );
}
