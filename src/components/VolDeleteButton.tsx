'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export default function VolDeleteButton({ volId, canDelete = true }: { volId: string; canDelete?: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  if (!canDelete) return null;

  async function handleClick() {
    if (!confirm('Supprimer ce vol ?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vols/${volId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Erreur lors de la suppression.');
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={deleting}
      className="rounded p-1.5 text-slate-400 hover:bg-slate-700/50 hover:text-red-400 disabled:opacity-50"
      title="Supprimer"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
