'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';

export default function NotamDeleteButton({ notamId, variant = 'default' }: { notamId: string; variant?: 'default' | 'atc' }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm('Supprimer définitivement ce NOTAM ? Il sera effacé de la base de données.')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notams/${notamId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur');
      router.refresh();
    } catch {
      setLoading(false);
      alert('Erreur lors de la suppression.');
    }
  }

  const btn = variant === 'atc'
    ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
    : 'text-slate-400 hover:text-red-400 hover:bg-red-950/30';

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className={`rounded p-1.5 transition ${btn}`}
      title="Supprimer le NOTAM (définitif)"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
