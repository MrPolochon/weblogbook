'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ConfirmerCopiloteButton({
  volId,
  identifiantCopilote,
}: {
  volId: string;
  identifiantCopilote: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/vols/${volId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmer_copilote: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || 'Erreur');
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="btn-primary"
    >
      {loading ? 'Envoi…' : `Confirmer que ${identifiantCopilote} était bien mon copilote`}
    </button>
  );
}
