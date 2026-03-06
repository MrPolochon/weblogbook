'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';

export default function AdminProfileEmail({
  profileId,
  initialEmail,
}: {
  profileId: string;
  initialEmail: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profileId}/email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess('Email enregistré.');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-200 mb-2 flex items-center gap-2">
        <Mail className="h-5 w-5 text-sky-400" />
        Email du compte
      </h2>
      <p className="text-sm text-slate-400 mb-4">
        Adresse utilisée pour envoyer le code de vérification à chaque connexion. Si vide, l&apos;utilisateur devra la renseigner lors de sa première connexion.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          className="input w-full max-w-md bg-slate-900/50"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ex: pilote@exemple.com"
          autoComplete="email"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-emerald-400">{success}</p>}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Enregistrer l\'email'}
        </button>
      </form>
    </div>
  );
}
