'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function RelacherVolAfisButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirm('Relâcher ce vol ? Il retournera en autosurveillance sans surveillance AFIS.')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/siavi/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'relacher', plan_id: planId }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur');
      }

      router.push('/siavi');
      startTransition(() => router.refresh());
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
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors disabled:opacity-50"
    >
      <ArrowLeft className="h-4 w-4" />
      {loading ? 'Relâchement...' : 'Relâcher en autosurveillance'}
    </button>
  );
}
