'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, User, Package, Utensils, Fuel, Users } from 'lucide-react';
import type { GroundServiceRequest, ServiceType } from '@/lib/types';

const SERVICE_ICONS: Record<ServiceType, React.ReactNode> = {
  bagages:  <Package className="h-5 w-5" />,
  catering: <Utensils className="h-5 w-5" />,
  fuel:     <Fuel className="h-5 w-5" />,
  boarding: <Users className="h-5 w-5" />,
};

const SERVICE_LABELS: Record<ServiceType, string> = {
  bagages:  'Chargement bagages',
  catering: 'Service catering',
  fuel:     'Ravitaillement carburant',
  boarding: 'Boarding passagers',
};

const SERVICE_COLORS: Record<ServiceType, string> = {
  bagages:  'text-amber-400 bg-amber-900/20 border-amber-800/40',
  catering: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
  fuel:     'text-sky-400 bg-sky-900/20 border-sky-800/40',
  boarding: 'text-purple-400 bg-purple-900/20 border-purple-800/40',
};

interface Props {
  request: GroundServiceRequest;
  onUpdate: (updated: GroundServiceRequest) => void;
}

export default function ServiceRequestCard({ request, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [ageMin, setAgeMin] = useState(0);
  const isCritical = ageMin >= 3 && request.statut === 'pending';
  const isWarning = ageMin >= 1 && ageMin < 3 && request.statut === 'pending';

  useEffect(() => {
    function tick() {
      setAgeMin(Math.floor((Date.now() - new Date(request.requested_at).getTime()) / 60000));
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [request.requested_at]);

  async function handleAction(statut: 'accepted' | 'in_progress' | 'completed' | 'rejected') {
    setLoading(true);
    try {
      const res = await fetch(`/api/ground/service-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      const data = await res.json() as { request?: GroundServiceRequest };
      if (res.ok && data.request) onUpdate(data.request);
    } finally {
      setLoading(false);
    }
  }

  const colorClass = SERVICE_COLORS[request.service_type as ServiceType];
  const borderClass = isCritical
    ? 'border-red-700/60 animate-pulse'
    : isWarning
    ? 'border-amber-700/60'
    : 'border-slate-700/40';

  return (
    <div className={`rounded-xl border ${borderClass} bg-slate-800/30 p-4 transition-all`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl border ${colorClass}`}>
            {SERVICE_ICONS[request.service_type as ServiceType]}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-100 text-sm">
                {SERVICE_LABELS[request.service_type as ServiceType]}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                request.statut === 'pending'    ? 'bg-amber-500/20 text-amber-300' :
                request.statut === 'accepted'   ? 'bg-sky-500/20 text-sky-300' :
                request.statut === 'in_progress'? 'bg-purple-500/20 text-purple-300' :
                request.statut === 'completed'  ? 'bg-emerald-500/20 text-emerald-300' :
                'bg-red-500/20 text-red-300'
              }`}>
                {request.statut === 'pending' ? 'En attente' :
                 request.statut === 'accepted' ? 'Acceptée' :
                 request.statut === 'in_progress' ? 'En cours' :
                 request.statut === 'completed' ? 'Terminée' : 'Rejetée'}
              </span>
              {isCritical && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                  URGENT
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              {request.pilote && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {(request.pilote as { identifiant: string }).identifiant}
                </span>
              )}
              {request.plan_vol && (
                <span className="font-mono">
                  {(request.plan_vol as { numero_vol: string }).numero_vol}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {ageMin > 0 ? `${ageMin} min` : 'à l\'instant'}
              </span>
              {request.pax_count && (
                <span>{request.pax_count} pax</span>
              )}
            </div>
            {request.notes && (
              <p className="text-xs text-slate-400 mt-1 italic">{request.notes}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        {request.statut === 'pending' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAction('accepted')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Accepter
            </button>
            <button
              type="button"
              onClick={() => handleAction('rejected')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-700/40 text-red-400 text-xs font-medium hover:bg-red-900/20 transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {request.statut === 'accepted' && (
          <button
            type="button"
            onClick={() => handleAction('completed')}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Terminé
          </button>
        )}
      </div>
    </div>
  );
}
