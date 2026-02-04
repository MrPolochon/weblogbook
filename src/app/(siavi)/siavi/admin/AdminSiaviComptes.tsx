'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Save } from 'lucide-react';

type Compte = { id: string; identifiant: string; role: string; siavi: boolean; siavi_grade_id: string | null };
type Grade = { id: string; nom: string; ordre: number };

export default function AdminSiaviComptes({ comptes, grades }: { comptes: Compte[]; grades: Grade[] }) {
  const router = useRouter();
  const [editingGrades, setEditingGrades] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gradeById = new Map(grades.map((g) => [g.id, g]));

  async function handleGradeChange(compteId: string, gradeId: string) {
    setEditingGrades((prev) => ({ ...prev, [compteId]: gradeId }));
  }

  async function handleSaveGrade(compteId: string) {
    setSaving(compteId);
    setError(null);

    try {
      const res = await fetch(`/api/siavi/comptes/${compteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siavi_grade_id: editingGrades[compteId] || null }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la mise à jour');
      }
      
      setEditingGrades((prev) => {
        const next = { ...prev };
        delete next[compteId];
        return next;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(null);
    }
  }

  async function handleRemove(compteId: string, identifiant: string) {
    if (!confirm(`Retirer les droits SIAVI de ${identifiant} ?`)) return;
    
    try {
      const res = await fetch(`/api/siavi/comptes/${compteId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la suppression');
      }
      
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (comptes.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <h2 className="text-lg font-medium text-red-800 mb-2">Comptes SIAVI</h2>
        <p className="text-slate-600 text-sm">Aucun compte SIAVI.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-white p-4">
      <h2 className="text-lg font-medium text-red-800 mb-4">Comptes SIAVI ({comptes.length})</h2>
      
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-red-200 text-left text-red-700">
              <th className="pb-2 pr-4">Identifiant</th>
              <th className="pb-2 pr-4">Grade</th>
              <th className="pb-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {comptes.map((c) => {
              const currentGradeId = editingGrades[c.id] ?? c.siavi_grade_id ?? '';
              const hasChanges = editingGrades[c.id] !== undefined;
              
              return (
                <tr key={c.id} className="border-b border-red-100 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-slate-800">{c.identifiant}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={currentGradeId}
                        onChange={(e) => handleGradeChange(c.id, e.target.value)}
                        className="px-2 py-1 rounded border border-red-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">— Aucun —</option>
                        {grades.map((g) => (
                          <option key={g.id} value={g.id}>{g.nom}</option>
                        ))}
                      </select>
                      {hasChanges && (
                        <button
                          onClick={() => handleSaveGrade(c.id)}
                          disabled={saving === c.id}
                          className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded"
                          title="Enregistrer"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => handleRemove(c.id, c.identifiant)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                      title="Retirer les droits SIAVI"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Retirer
                    </button>
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
