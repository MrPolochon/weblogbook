'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/fetch-json';
export default function SiaviServiceControls({ estAfis, available }: { estAfis: boolean; available: boolean }) {
  const router = useRouter();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function change() {
    setBusy(true); setError('');
    try { await fetchJson('/api/siavi/session',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:estAfis?'pompier':'afis'})}); router.refresh(); }
    catch(e) { setError(e instanceof Error?e.message:'Changement impossible.'); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-2">
    {estAfis && !available && <p role="status" className="text-amber-200">Un ATC est arrivé : ne prenez plus de nouveaux vols AFIS. Relâchez vos vols puis passez en mode Pompier.</p>}
    <button type="button" disabled={busy || (!estAfis && !available)} onClick={()=>void change()} className="rounded-lg border border-orange-400/40 px-4 py-2 text-orange-100 disabled:opacity-50">{busy?'Mise à jour…':estAfis?'Passer en mode Pompier':'Activer Pompier + AFIS'}</button>
    {!estAfis && !available && <p className="text-sm text-slate-400">AFIS indisponible tant qu’un ATC est présent.</p>}
    {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
  </div>;
}
