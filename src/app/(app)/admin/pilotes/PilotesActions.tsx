'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function PilotesActions({
  piloteId,
  identifiant,
  isAdmin,
}: {
  piloteId: string;
  identifiant: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Supprimer le compte de ${identifiant} ? Toutes les données seront effacées. Les vols seront archivés 1 semaine.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/pilotes/${piloteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur');
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!isAdmin && (
        <>
          <Link
            href={`/admin/pilotes/${piloteId}`}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-sky-400"
            title="Heures, blocage"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-red-400 disabled:opacity-50"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
