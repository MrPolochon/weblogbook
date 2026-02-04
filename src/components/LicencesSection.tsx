'use client';

import { useEffect, useState } from 'react';
import { Award, Calendar, FileText, X } from 'lucide-react';
import { formatDateMediumUTC } from '@/lib/date-utils';

type Licence = {
  id: string;
  type: string;
  type_avion_id: string | null;
  langue: string | null;
  date_delivrance: string | null;
  date_expiration: string | null;
  a_vie: boolean;
  note: string | null;
  types_avion: { nom: string; constructeur: string } | null;
};

type Props = {
  userId: string;
  variant?: 'default' | 'atc' | 'siavi';
};

export default function LicencesSection({ userId, variant = 'default' }: Props) {
  const isSiavi = variant === 'siavi';
  const isAtcOrSiavi = variant === 'atc' || isSiavi;
  const cardClass = isSiavi ? 'rounded-xl border-2 border-red-300 bg-white p-4 shadow-sm' : 'card';
  const [licences, setLicences] = useState<Licence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/licences?user_id=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) setLicences(d.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      return formatDateMediumUTC(dateStr);
    } catch {
      return dateStr;
    }
  }

  function formatLibelle(lic: Licence): string {
    if (lic.type === 'Qualification Type' && lic.types_avion) {
      return `Qualification Type ${lic.types_avion.constructeur} ${lic.types_avion.nom}`;
    }
    if (lic.type.startsWith('COM') && lic.langue) {
      return `${lic.type} ${lic.langue}`;
    }
    return lic.type;
  }

  function isExpired(lic: Licence): boolean {
    if (lic.a_vie || !lic.date_expiration) return false;
    try {
      return new Date(lic.date_expiration) < new Date();
    } catch {
      return false;
    }
  }

  function isExpiringSoon(lic: Licence): boolean {
    if (lic.a_vie || !lic.date_expiration) return false;
    try {
      const exp = new Date(lic.date_expiration);
      const now = new Date();
      const daysUntilExp = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilExp >= 0 && daysUntilExp <= 30;
    } catch {
      return false;
    }
  }

  if (loading) {
    return (
      <div className={cardClass}>
        <h2 className={`text-lg font-bold mb-4 ${isSiavi ? 'text-red-800' : isAtcOrSiavi ? 'text-slate-800' : 'text-slate-100'}`}>
          Licences et qualifications
        </h2>
        <p className={`text-sm ${isSiavi ? 'text-slate-600' : 'text-slate-500'}`}>Chargement…</p>
      </div>
    );
  }

  if (licences.length === 0) {
    return (
      <div className={cardClass}>
        <h2 className={`text-lg font-bold mb-4 ${isSiavi ? 'text-red-800' : isAtcOrSiavi ? 'text-slate-800' : 'text-slate-100'}`}>
          Licences et qualifications
        </h2>
        <p className={`text-sm ${isSiavi ? 'text-slate-600' : 'text-slate-500'}`}>Aucune licence ou qualification enregistrée.</p>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h2 className={`text-lg font-bold mb-4 flex items-center gap-2 ${isSiavi ? 'text-red-800' : isAtcOrSiavi ? 'text-slate-800' : 'text-slate-100'}`}>
        <Award className={`h-5 w-5 ${isSiavi ? 'text-red-600' : ''}`} />
        Licences et qualifications
      </h2>
      <div className="space-y-3">
        {licences.map((lic) => {
          const expired = isExpired(lic);
          const expiringSoon = isExpiringSoon(lic);
          return (
            <div
              key={lic.id}
              className={`rounded-lg border p-3 ${
                expired
                  ? 'border-red-500/50 bg-red-500/10'
                  : expiringSoon
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : isAtcOrSiavi
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-slate-700/50 bg-slate-800/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${isAtcOrSiavi ? 'text-slate-900' : 'text-slate-100'}`}>
                    {formatLibelle(lic)}
                  </p>
                  <div className="mt-1.5 space-y-1 text-sm">
                    {lic.date_delivrance && (
                      <div className={`flex items-center gap-1.5 ${isAtcOrSiavi ? 'text-slate-600' : 'text-slate-400'}`}>
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Délivré le {formatDate(lic.date_delivrance)}</span>
                      </div>
                    )}
                    {lic.a_vie ? (
                      <div className="flex items-center gap-1.5 text-emerald-500">
                        <span className="text-xs font-medium">✓ À vie</span>
                      </div>
                    ) : lic.date_expiration ? (
                      <div
                        className={`flex items-center gap-1.5 ${
                          expired
                            ? 'text-red-400'
                            : expiringSoon
                              ? 'text-amber-400'
                              : isAtcOrSiavi
                                ? 'text-slate-600'
                                : 'text-slate-400'
                        }`}
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {expired ? 'Expiré le ' : 'Expire le '}
                          {formatDate(lic.date_expiration)}
                        </span>
                      </div>
                    ) : null}
                    {lic.note && (
                      <div className={`flex items-start gap-1.5 mt-1.5 ${isAtcOrSiavi ? 'text-slate-600' : 'text-slate-400'}`}>
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span className="text-xs">{lic.note}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
