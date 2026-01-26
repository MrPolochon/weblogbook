'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, Plus, Wrench, AlertTriangle } from 'lucide-react';
import { COUT_AFFRETER_TECHNICIENS, COUT_VOL_FERRY } from '@/lib/compagnie-utils';

type TypeAvion = { id: string; nom: string; constructeur: string };
type Hub = { aeroport_code: string };
type Avion = {
  id: string;
  immatriculation: string;
  nom_bapteme: string | null;
  usure_percent: number;
  aeroport_actuel: string;
  statut: string;
  type_avion: TypeAvion | null;
};

export default function CompagnieAvionsClient({ compagnieId }: { compagnieId: string }) {
  const router = useRouter();
  const [avions, setAvions] = useState<Avion[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    loadAvions();
    loadHubs();
  }, [compagnieId]);

  async function loadAvions() {
    try {
      const res = await fetch(`/api/compagnies/avions?compagnie_id=${compagnieId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setAvions(d || []);
      else setError(d.error || 'Erreur');
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  async function loadHubs() {
    try {
      const res = await fetch(`/api/compagnies/hubs?compagnie_id=${compagnieId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setHubs(d || []);
    } catch {
      console.error('Erreur chargement hubs');
    }
  }

  async function handleReparer(avionId: string) {
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/reparer`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
      loadAvions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  async function handleDebloquer(avionId: string) {
    if (!confirm(`Débloquer cet avion pour un vol ferry ? L'avion pourra faire un vol à vide vers un hub (coût ${COUT_VOL_FERRY.toLocaleString('fr-FR')} F$).`)) return;
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/debloquer`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      router.refresh();
      loadAvions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  async function handleAffreterTechniciens(avionId: string) {
    if (!confirm(`Affréter des techniciens pour réparer cet avion sur place ? Coût : ${COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$.`)) return;
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/affreter-techniciens`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      alert('Techniciens affrétés. L\'avion a été réparé et est maintenant opérationnel.');
      router.refresh();
      loadAvions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  function getStatutLabel(statut: string) {
    switch (statut) {
      case 'ground': return { text: 'Au sol', className: 'text-emerald-400' };
      case 'in_flight': return { text: 'En vol', className: 'text-sky-400' };
      case 'maintenance': return { text: 'Maintenance', className: 'text-amber-400' };
      case 'bloque': return { text: 'Bloqué', className: 'text-red-500' };
      default: return { text: statut, className: 'text-slate-400' };
    }
  }

  function getUsureColor(usure: number) {
    if (usure >= 70) return 'text-emerald-400';
    if (usure >= 30) return 'text-amber-400';
    return 'text-red-400';
  }

  const avionsBloques = avions.filter(a => a.statut === 'bloque' && a.usure_percent === 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-400" />
          Flotte individuelle ({avions.length} avions)
        </h2>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {avionsBloques.length > 0 && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
            <AlertTriangle className="h-4 w-4" />
            {avionsBloques.length} avion(s) bloqué(s) à 0% d&apos;usure
          </div>
          <p className="text-sm text-slate-400">
            Ces avions doivent être réparés. Vous pouvez affréter des techniciens ({COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$) 
            ou débloquer l&apos;avion pour un vol ferry vers un hub ({COUT_VOL_FERRY.toLocaleString('fr-FR')} F$).
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Chargement...</p>
      ) : avions.length === 0 ? (
        <p className="text-slate-400">Aucun avion individuel dans la flotte.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-400">
                <th className="pb-2 pr-4">Immatriculation</th>
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Usure</th>
                <th className="pb-2 pr-4">Localisation</th>
                <th className="pb-2 pr-4">Statut</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {avions.map((a) => {
                const statut = getStatutLabel(a.statut);
                const isAtHub = hubs.some((h) => h.aeroport_code === a.aeroport_actuel);
                return (
                  <tr key={a.id} className="border-b border-slate-700/50 last:border-0">
                    <td className="py-2.5 pr-4 font-mono font-medium text-slate-200">{a.immatriculation}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{a.nom_bapteme || '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-300">{a.type_avion?.nom || '—'}</td>
                    <td className="py-2.5 pr-4">
                      <span className={getUsureColor(a.usure_percent)}>{a.usure_percent}%</span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {a.aeroport_actuel}
                      {isAtHub && <span className="text-emerald-400 text-xs ml-1">(Hub)</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={statut.className}>{statut.text}</span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        {a.statut === 'bloque' && a.usure_percent === 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAffreterTechniciens(a.id)}
                              disabled={actionId === a.id}
                              className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
                              title="Réparer sur place"
                            >
                              {actionId === a.id ? '…' : 'Affréter'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDebloquer(a.id)}
                              disabled={actionId === a.id}
                              className="text-xs text-amber-400 hover:underline disabled:opacity-50"
                              title="Débloquer pour ferry"
                            >
                              {actionId === a.id ? '…' : 'Débloquer'}
                            </button>
                          </>
                        )}
                        {a.statut === 'ground' && a.usure_percent < 100 && isAtHub && (
                          <button
                            type="button"
                            onClick={() => handleReparer(a.id)}
                            disabled={actionId === a.id}
                            className="text-xs text-sky-400 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                            title="Réparer au hub (gratuit)"
                          >
                            <Wrench className="h-3 w-3" />
                            {actionId === a.id ? '…' : 'Réparer'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
