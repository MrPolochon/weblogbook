'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';

export default function PrendreVolAfisButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirm('Prendre ce vol sous votre surveillance AFIS ?')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/siavi/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prendre', plan_id: planId }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      }

      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
    >
      <Eye className="h-4 w-4" />
      {loading ? 'Prise en charge...' : 'Prendre sous surveillance'}
    </button>
  );
}
