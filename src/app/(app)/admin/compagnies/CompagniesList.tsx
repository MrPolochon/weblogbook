'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, BookOpen } from 'lucide-react';

type C = { id: string; nom: string };

export default function CompagniesList({ compagnies }: { compagnies: C[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string, nom: string) {
    if (!confirm(`Supprimer « ${nom} » ? Le nom restera affiché sur les vols déjà enregistrés.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/compagnies/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur');
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  if (compagnies.length === 0) return <p className="text-slate-500">Aucune compagnie.</p>;

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-slate-200 mb-4">Liste</h2>
      <ul className="space-y-2">
        {compagnies.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-1">
            <span className="text-slate-200">{c.nom}</span>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/compagnies/${c.id}/logbook`}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-sky-400"
                title="Voir le logbook"
              >
                <BookOpen className="h-4 w-4" />
              </Link>
              <button
                onClick={() => handleDelete(c.id, c.nom)}
                disabled={deleting === c.id}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
