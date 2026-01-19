'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type PlanTransfert = { id: string; numero_vol: string };
type PlanAccepter = { id: string; numero_vol: string; aeroport_depart: string; aeroport_arrivee: string };

export default function AtcAcceptTransfertSidebar({
  plansTransfert,
  plansAccepter,
}: {
  plansTransfert: PlanTransfert[];
  plansAccepter: PlanAccepter[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleAcceptTransfert(planId: string) {
    setLoadingId(planId);
    try {
      const res = await fetch(`/api/plans-vol/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accepter_transfert' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoadingId(null);
    }
  }

  if (plansTransfert.length === 0 && plansAccepter.length === 0) return null;

  const itemClass = 'w-full text-left truncate text-sm font-bold text-white bg-orange-500 border-2 border-orange-600 rounded px-2 py-1.5 animate-blink-fast hover:bg-orange-600 hover:border-orange-700 disabled:opacity-50';

  return (
    <aside className="w-52 flex-shrink-0 border-l-2 border-orange-500 bg-orange-100 py-3 px-2 flex flex-col shadow-[0_0_12px_rgba(249,115,22,0.3)]">
      <p className="text-xs font-bold uppercase tracking-wider text-orange-900 px-2 mb-1.5">À traiter</p>

      {plansAccepter.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-orange-800 px-2 mb-1">Plans à accepter / refuser / transférer</p>
          <p className="text-[10px] text-orange-700 px-2 mb-1.5">Cliquez → voir le détail, puis Accepter, Refuser ou Transférer</p>
          <ul className="space-y-1">
            {plansAccepter.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/atc/plan/${p.id}`}
                  className={`block ${itemClass}`}
                  title={`${p.numero_vol} ${p.aeroport_depart} → ${p.aeroport_arrivee}`}
                >
                  {p.numero_vol} {p.aeroport_depart}→{p.aeroport_arrivee}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plansTransfert.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-orange-800 px-2 mb-1">Transferts à accepter</p>
          <p className="text-[10px] text-orange-700 px-2 mb-1.5">Cliquez pour accepter le transfert (1 min)</p>
          <ul className="space-y-1">
            {plansTransfert.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleAcceptTransfert(p.id)}
                  disabled={loadingId !== null}
                  className={itemClass}
                  title="Cliquer pour accepter le transfert"
                >
                  {loadingId === p.id ? '…' : p.numero_vol}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
