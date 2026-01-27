'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plane, Plus, Wrench, AlertTriangle, Edit2, MapPin, Percent, ShoppingCart } from 'lucide-react';
import { COUT_AFFRETER_TECHNICIENS, COUT_VOL_FERRY } from '@/lib/compagnie-utils';
import Link from 'next/link';

type TypeAvion = { id: string; nom: string; constructeur: string };
type Hub = { aeroport_code: string };
type Avion = {
  id: string;
  immatriculation: string;
  nom_bapteme: string | null;
  usure_percent: number;
  aeroport_actuel: string;
  statut: string;
  types_avion: TypeAvion | TypeAvion[] | null;
  maintenance_fin_at: string | null;
};

interface Props {
  compagnieId: string;
  soldeCompagnie?: number;
  isPdg?: boolean;
}

export default function CompagnieAvionsClient({ compagnieId, soldeCompagnie = 0, isPdg = true }: Props) {
  const router = useRouter();
  const [avions, setAvions] = useState<Avion[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  
  // Édition
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editImmat, setEditImmat] = useState('');
  const [editNom, setEditNom] = useState('');

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

  async function handleAffreterTechniciens(avionId: string, forceCheck = false) {
    // Si c'est une vérification forcée (pour compléter maintenance), pas de confirmation
    if (!forceCheck && !confirm(`Affréter des techniciens pour réparer cet avion sur place ? Coût : ${COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$. Délai : 1 heure.`)) return;
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/affreter-techniciens`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.temps_restant_min !== undefined) {
          alert(`Techniciens en cours de travail. Temps restant : ${d.temps_restant_min} min.`);
        } else {
          throw new Error(d.error || 'Erreur');
        }
        return;
      }
      if (d.repare) {
        alert('Avion réparé avec succès ! L\'avion est maintenant opérationnel.');
      } else {
        alert(d.message || `Techniciens affrétés. L'avion sera réparé dans ${d.temps_attente_min || 60} minutes.`);
      }
      router.refresh();
      loadAvions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  // Vérifier la maintenance terminée
  async function handleVerifierMaintenance(avionId: string) {
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/affreter-techniciens`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (d.repare) {
        alert('Avion réparé avec succès ! L\'avion est maintenant opérationnel.');
        router.refresh();
        loadAvions();
      } else if (d.temps_restant_min !== undefined) {
        alert(`Maintenance en cours. Temps restant : ${d.temps_restant_min} min.`);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  function startEdit(avion: Avion) {
    setEditingId(avion.id);
    setEditImmat(avion.immatriculation);
    setEditNom(avion.nom_bapteme || '');
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setActionId(editingId);
    try {
      const res = await fetch(`/api/compagnies/avions/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          immatriculation: editImmat.trim().toUpperCase(),
          nom_bapteme: editNom.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setEditingId(null);
      router.refresh();
      loadAvions();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  function getStatutLabel(statut: string, maintenanceFinAt?: string | null, usure?: number) {
    if (statut === 'maintenance' && maintenanceFinAt) {
      const fin = new Date(maintenanceFinAt);
      const maintenant = new Date();
      const tempsRestantMs = fin.getTime() - maintenant.getTime();
      if (tempsRestantMs > 0) {
        const tempsRestantMin = Math.ceil(tempsRestantMs / 60000);
        return { text: `Maintenance (${tempsRestantMin} min)`, className: 'text-amber-400' };
      }
      return { text: 'Prêt', className: 'text-emerald-400 animate-pulse' };
    }
    // Avion au sol mais à 0% d'usure = devrait être bloqué
    if (statut === 'ground' && usure === 0) {
      return { text: 'À réparer', className: 'text-red-400' };
    }
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
  const avionsEnVol = avions.filter(a => a.statut === 'in_flight').length;
  const avionsDisponibles = avions.filter(a => a.statut === 'ground' && a.usure_percent > 0).length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-400" />
          Flotte ({avions.length} avion{avions.length > 1 ? 's' : ''})
        </h2>
        <div className="flex items-center gap-4">
          {isPdg && (
            <>
              <div className="text-right text-sm">
                <span className="text-emerald-400">{avionsDisponibles}</span>
                <span className="text-slate-500"> dispo</span>
                {avionsEnVol > 0 && (
                  <>
                    <span className="text-slate-600 mx-1">•</span>
                    <span className="text-sky-400">{avionsEnVol}</span>
                    <span className="text-slate-500"> en vol</span>
                  </>
                )}
              </div>
              <Link
                href="/marketplace"
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <ShoppingCart className="h-4 w-4" />
                Acheter
              </Link>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {avionsBloques.length > 0 && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
            <AlertTriangle className="h-4 w-4" />
            {avionsBloques.length} avion(s) bloqué(s) à 0% d&apos;usure
          </div>
          <p className="text-sm text-slate-400">
            Affrétez des techniciens ({COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$) ou débloquez pour un vol ferry ({COUT_VOL_FERRY.toLocaleString('fr-FR')} F$).
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Chargement...</p>
      ) : avions.length === 0 ? (
        <div className="text-center py-6">
          <Plane className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Aucun avion dans la flotte.</p>
          {isPdg && (
            <p className="text-sm text-slate-500 mt-2">
              Achetez des avions sur le <Link href="/marketplace" className="text-purple-400 hover:text-purple-300 underline">Marketplace</Link>.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-400">
                <th className="pb-2 pr-4">Immatriculation</th>
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">
                  <span className="flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    Usure
                  </span>
                </th>
                <th className="pb-2 pr-4">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Position
                  </span>
                </th>
                <th className="pb-2 pr-4">Statut</th>
                {isPdg && <th className="pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {avions.map((a) => {
                const statut = getStatutLabel(a.statut, a.maintenance_fin_at, a.usure_percent);
                const isAtHub = hubs.some((h) => h.aeroport_code === a.aeroport_actuel);
                const typeNom = Array.isArray(a.types_avion) ? a.types_avion[0]?.nom : a.types_avion?.nom;
                const isEditing = editingId === a.id;
                const maintenancePrete = a.statut === 'maintenance' && a.maintenance_fin_at && new Date(a.maintenance_fin_at) <= new Date();
                
                return (
                  <tr key={a.id} className="border-b border-slate-700/50 last:border-0">
                    <td className="py-2.5 pr-4">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editImmat}
                          onChange={(e) => setEditImmat(e.target.value.toUpperCase())}
                          className="input py-1 px-2 w-24 text-sm font-mono"
                          maxLength={10}
                        />
                      ) : (
                        <span className="font-mono font-medium text-slate-200">{a.immatriculation}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNom}
                          onChange={(e) => setEditNom(e.target.value)}
                          className="input py-1 px-2 w-32 text-sm"
                          placeholder="Nom de baptême"
                          maxLength={50}
                        />
                      ) : (
                        <span className="text-slate-400 italic">{a.nom_bapteme || '—'}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{typeNom || '—'}</td>
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
                    {isPdg && (
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={actionId === a.id}
                                className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
                              >
                                Sauver
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="text-xs text-slate-400 hover:underline"
                              >
                                Annuler
                              </button>
                            </>
                          ) : (
                            <>
                              {a.statut === 'ground' && (
                                <button
                                  type="button"
                                  onClick={() => startEdit(a)}
                                  className="text-xs text-slate-400 hover:text-slate-200"
                                  title="Modifier"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {/* Avion bloqué ou au sol avec 0% d'usure = nécessite réparation */}
                              {(a.statut === 'bloque' || (a.statut === 'ground' && a.usure_percent === 0)) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleAffreterTechniciens(a.id)}
                                    disabled={actionId === a.id}
                                    className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
                                    title={`Réparer sur place - Coût: ${COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$ (délai: 1h)`}
                                  >
                                    <Wrench className="inline h-3 w-3 mr-0.5" />
                                    Affréter
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDebloquer(a.id)}
                                    disabled={actionId === a.id}
                                    className="text-xs text-amber-400 hover:underline disabled:opacity-50"
                                    title={`Débloquer pour vol ferry - Coût: ${COUT_VOL_FERRY.toLocaleString('fr-FR')} F$`}
                                  >
                                    Débloquer
                                  </button>
                                </>
                              )}
                              {maintenancePrete && (
                                <button
                                  type="button"
                                  onClick={() => handleVerifierMaintenance(a.id)}
                                  disabled={actionId === a.id}
                                  className="text-xs text-emerald-400 hover:underline disabled:opacity-50 animate-pulse font-semibold"
                                  title="Terminer la maintenance"
                                >
                                  Récupérer
                                </button>
                              )}
                              {a.statut === 'maintenance' && a.maintenance_fin_at && !maintenancePrete && (
                                <span className="text-xs text-slate-500">En réparation...</span>
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
                                  Réparer
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
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
