'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Grade = { id: string; nom: string; ordre: number };
type Compte = { id: string; identifiant: string; role: string; atc: boolean | null; atc_grade_id: string | null };

export default function AdminAtcComptes({ comptes, grades }: { comptes: Compte[]; grades: Grade[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [accesPiloteLoadingId, setAccesPiloteLoadingId] = useState<string | null>(null);
  const [revoquerLoadingId, setRevoquerLoadingId] = useState<string | null>(null);

  function gradeNom(gradeId: string | null): string {
    if (!gradeId) return '—';
    return grades.find((g) => g.id === gradeId)?.nom ?? '—';
  }

  async function handleGradeChange(profileId: string, newGradeId: string | null) {
    setLoadingId(profileId);
    try {
      const res = await fetch(`/api/pilotes/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atc_grade_id: newGradeId || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleAccorderAccesPilote(profileId: string) {
    setAccesPiloteLoadingId(profileId);
    try {
      const res = await fetch(`/api/pilotes/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'pilote' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setAccesPiloteLoadingId(null);
    }
  }

  async function handleRevoquerAccesPilote(profileId: string) {
    if (!confirm('Révoquer l\'accès à l\'espace pilote ? Le compte deviendra ATC uniquement (rôle Armée sera retiré).')) return;
    setRevoquerLoadingId(profileId);
    try {
      const res = await fetch(`/api/pilotes/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'atc' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setRevoquerLoadingId(null);
    }
  }

  if (comptes.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-medium text-slate-800 mb-2">Comptes ayant accès ATC</h2>
        <p className="text-slate-600 text-sm">Aucun compte ATC (rôle atc ou attribut ATC).</p>
      </div>
    );
  }

  const sortedGrades = [...grades].sort((a, b) => a.ordre - b.ordre);

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-800 mb-2">Comptes ayant accès ATC</h2>
      <p className="text-slate-600 text-sm mb-4">Modifiez le grade. Les comptes avec « ATC uniquement » n’ont pas accès à l’espace pilote.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="pb-2 pr-4">Identifiant</th>
              <th className="pb-2 pr-4">Rôle</th>
              <th className="pb-2 pr-4">Espace pilote</th>
              <th className="pb-2 pr-4">Grade actuel</th>
              <th className="pb-2">Changer le grade</th>
            </tr>
          </thead>
          <tbody>
            {comptes.map((p) => {
              const sansEspacePilote = p.role === 'atc';
              return (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-medium text-slate-800">{p.identifiant}</td>
                <td className="py-3 pr-4 text-slate-600">{p.role === 'atc' ? 'atc' : p.role + (p.atc ? ' + ATC' : '')}</td>
                <td className="py-3 pr-4">
                  {sansEspacePilote ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="Pas d’accès à l’espace pilote">ATC uniquement</span>
                      <button
                        type="button"
                        onClick={() => handleAccorderAccesPilote(p.id)}
                        disabled={accesPiloteLoadingId === p.id}
                        className="text-xs font-medium text-sky-600 hover:text-sky-800 hover:underline disabled:opacity-50"
                      >
                        {accesPiloteLoadingId === p.id ? '…' : "Autoriser l'accès pilote"}
                      </button>
                    </span>
                  ) : (p.role === 'pilote' && p.atc) ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-600">Oui</span>
                      <button
                        type="button"
                        onClick={() => handleRevoquerAccesPilote(p.id)}
                        disabled={revoquerLoadingId === p.id}
                        className="text-xs font-medium text-amber-600 hover:text-amber-800 hover:underline disabled:opacity-50"
                      >
                        {revoquerLoadingId === p.id ? '…' : "Révoquer l'accès pilote"}
                      </button>
                    </span>
                  ) : (
                    <span className="text-slate-600">Oui</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600">{gradeNom(p.atc_grade_id)}</td>
                <td className="py-3">
                  <select
                    className="input max-w-[180px] py-1.5 text-sm"
                    value={p.atc_grade_id ?? ''}
                    onChange={(e) => handleGradeChange(p.id, e.target.value || null)}
                    disabled={loadingId === p.id}
                  >
                    <option value="">— Aucun —</option>
                    {sortedGrades.map((g) => (
                      <option key={g.id} value={g.id}>{g.nom}</option>
                    ))}
                  </select>
                  {loadingId === p.id && <span className="ml-2 text-slate-500 text-xs">…</span>}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
