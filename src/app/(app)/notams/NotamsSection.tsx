'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import CreateNotamForm from './CreateNotamForm';
import NotamCard from './NotamCard';
import NotamDeleteButton from './NotamDeleteButton';

type Notam = {
  id: string;
  identifiant: string;
  code_aeroport: string;
  du_at: string;
  au_at: string;
  champ_a: string | null;
  champ_e: string;
  champ_d: string | null;
  champ_q: string | null;
  priorite: string | null;
  reference_fr: string | null;
  annule: boolean;
};

export default function NotamsSection({
  notams,
  isAdmin,
  variant = 'default',
}: {
  notams: Notam[] | null;
  isAdmin: boolean;
  variant?: 'default' | 'atc';
}) {
  const [showForm, setShowForm] = useState(false);
  const isAtc = variant === 'atc';

  const titleClass = isAtc ? 'text-slate-800' : 'text-slate-200';
  const emptyClass = isAtc ? 'text-slate-600' : 'text-slate-500';
  const btnClass = isAtc
    ? 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-sky-100 text-sky-800 hover:bg-sky-200'
    : 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-slate-700/50 text-sky-300 hover:bg-slate-600/50';

  return (
    <div className="card">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 className={`text-lg font-medium ${titleClass}`}>NOTAMs publiés</h2>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className={btnClass}
          >
            <Plus className="h-4 w-4" />
            {showForm ? 'Fermer' : 'Créer un NOTAM'}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <CreateNotamForm
          variant={variant}
          embedded
          onSuccess={() => setShowForm(false)}
        />
      )}

      {!notams || notams.length === 0 ? (
        <p className={emptyClass}>Aucun NOTAM.</p>
      ) : (
        <div className="space-y-4">
          {notams.map((n) => (
            <NotamCard
              key={n.id}
              n={n}
              variant={variant}
              adminDeleteButton={isAdmin ? <NotamDeleteButton notamId={n.id} variant={variant} /> : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
