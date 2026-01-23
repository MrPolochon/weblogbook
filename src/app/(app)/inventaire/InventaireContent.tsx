'use client';

import { Plane } from 'lucide-react';

type Props = { avions: Array<{ id: string; nom: string | null; type: string }> };

export default function InventaireContent({ avions }: Props) {
  if (avions.length === 0) {
    return (
      <div className="card">
        <p className="text-slate-400">Aucun avion dans votre inventaire.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {avions.map((a) => (
        <div key={a.id} className="card">
          <div className="flex items-center gap-2 mb-2">
            <Plane className="h-5 w-5 text-sky-400" />
            <p className="text-slate-200 font-medium">{a.nom || a.type}</p>
          </div>
          {a.nom && <p className="text-slate-400 text-sm">{a.type}</p>}
        </div>
      ))}
    </div>
  );
}
