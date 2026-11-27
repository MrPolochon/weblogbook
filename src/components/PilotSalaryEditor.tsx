'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PilotSalaryEditor({ id, name, value, fallback }: { id: string; name: string; value: number | null; fallback: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  return <form className="flex flex-wrap items-center gap-2 text-xs" onSubmit={async e => {
    e.preventDefault(); setBusy(true); setStatus('');
    try {
      const response = await fetch('/api/compagnies/employes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, pourcentage_salaire: draft === '' ? null : Number(draft) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Enregistrement impossible');
      setStatus('Salaire enregistré'); router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Erreur réseau'); }
    finally { setBusy(false); }
  }}>
    <label>Salaire (%) <input aria-label={`Salaire de ${name} en pourcentage`} type="number" min="0" max="100" step="1" value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} placeholder={String(fallback)} className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-white" /></label>
    <button disabled={busy} className="rounded bg-sky-700 px-2 py-1 text-white disabled:opacity-50">{busy ? '…' : 'Enregistrer'}</button>
    <span className="text-slate-400">Vide : taux compagnie ({fallback} %). Part équipage, partagée à deux si copilote.</span>
    <span role="status">{status}</span>
  </form>;
}
