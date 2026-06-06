'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flame, PlaneLanding, Clock, CheckCircle2, Eye, AlertTriangle, ImageIcon, Wrench, Trash2, Shield, MinusCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

type Incident = {
  id: string;
  numero_incident: string;
  type_incident: 'crash' | 'atterrissage_urgence';
  plan_vol_id: string | null;
  numero_vol: string | null;
  aeroport_depart: string | null;
  aeroport_arrivee: string | null;
  type_vol: string | null;
  aeroport_incident: string | null;
  compagnie_avion_id: string | null;
  immatriculation: string | null;
  type_avion: string | null;
  usure_avant_incident: number | null;
  pilote_id: string | null;
  pilote_identifiant: string | null;
  compagnie_id: string | null;
  signale_par_id: string;
  signale_par_identifiant: string | null;
  position_atc: string | null;
  screenshot_url: string | null;
  description: string | null;
  images_urls: string[];
  statut: 'en_attente' | 'en_examen' | 'clos';
  decision: 'remis_en_etat' | 'detruit' | 'aucune_action' | null;
  decision_notes: string | null;
  examine_par_id: string | null;
  examine_at: string | null;
  signalement_ifsa_id: string | null;
  created_at: string;
};

const STATUS_CONFIG = {
  en_attente: { label: 'En attente', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Clock },
  en_examen: { label: 'En examen', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Eye },
  clos: { label: 'Clos', bg: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: CheckCircle2 },
} as const;

const TYPE_CONFIG = {
  crash: { label: 'CRASH', bg: 'bg-red-600', icon: Flame },
  atterrissage_urgence: { label: 'Urgence', bg: 'bg-amber-600', icon: PlaneLanding },
} as const;

const DECISION_CONFIG = {
  detruit: { label: '🔴 Avion détruit', color: 'text-red-300' },
  remis_en_etat: { label: '🟢 Avion remis en état (usure 100%)', color: 'text-emerald-300' },
  aucune_action: { label: '⚪ Aucune action — avion débloqué (usure inchangée)', color: 'text-slate-300' },
} as const;

export default function IncidentsClient() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [prenant, setPrenant] = useState<string | null>(null);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'tous' | 'en_attente' | 'en_examen' | 'clos'>('tous');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch('/api/incidents');
      if (!res.ok) throw new Error();
      setIncidents(await res.json());
    } catch {
      toast.error('Erreur chargement incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIncidents(); }, [fetchIncidents]);

  const handlePrendre = async (id: string) => {
    setPrenant(id);
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prendre_en_charge' }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return; }
      toast.success('Incident pris en charge');
      fetchIncidents();
    } catch { toast.error('Erreur serveur'); } finally { setPrenant(null); }
  };

  const handleDecision = async (id: string, decision: 'remis_en_etat' | 'detruit' | 'aucune_action') => {
    const labels = { remis_en_etat: 'Remettre en état', detruit: 'Détruire l\'avion', aucune_action: 'Ne rien faire' };
    if (!confirm(`Confirmer : ${labels[decision]} ?`)) return;
    try {
      setDeciding(id);
      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decider', decision, notes: (notesMap[id] || '').trim() || undefined }),
      });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Erreur'); return; }
      const toasts = { remis_en_etat: 'Avion remis en état', detruit: 'Avion détruit', aucune_action: 'Avion débloqué sans modification' };
      toast.success(toasts[decision]);
      setNotesMap(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      setExpanded(null);
      fetchIncidents();
    } catch { toast.error('Erreur serveur'); } finally { setDeciding(null); }
  };

  const filtered = filter === 'tous' ? incidents : incidents.filter(i => i.statut === filter);
  const counts = {
    en_attente: incidents.filter(i => i.statut === 'en_attente').length,
    en_examen: incidents.filter(i => i.statut === 'en_examen').length,
    clos: incidents.filter(i => i.statut === 'clos').length,
  };

  if (loading) return <div className="text-center text-slate-400 py-12">Chargement...</div>;

  return (
    <div className="space-y-4">
      {/* Lightbox photo */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="Photo incident" className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" />
        </div>
      )}

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['tous', 'en_attente', 'en_examen', 'clos'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${filter === f ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {f === 'tous' ? `Tous (${incidents.length})` : `${STATUS_CONFIG[f].label} (${counts[f]})`}
          </button>
        ))}
      </div>

      {counts.en_attente > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="text-sm text-amber-300 font-medium">{counts.en_attente} incident(s) en attente d&apos;examen</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-12">Aucun incident</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => {
            const tc = TYPE_CONFIG[inc.type_incident];
            const sc = STATUS_CONFIG[inc.statut];
            const StatusIcon = sc.icon;
            const TypeIcon = tc.icon;
            const isOpen = expanded === inc.id;
            const hasPhotos = (inc.images_urls || []).length > 0;

            return (
              <div key={inc.id} className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : inc.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-700/30 transition-colors"
                >
                  <div className={`p-1.5 rounded ${tc.bg} shrink-0`}>
                    <TypeIcon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-100">{inc.numero_incident}</span>
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${sc.bg}`}>
                        <StatusIcon className="h-3 w-3 inline mr-1" />{sc.label}
                      </span>
                      {hasPhotos && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded">
                          <ImageIcon className="h-3 w-3" />{inc.images_urls.length} photo{inc.images_urls.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {tc.label} — Vol {inc.numero_vol || '?'} ({inc.aeroport_depart} → {inc.aeroport_arrivee})
                      {inc.pilote_identifiant && ` — Pilote: ${inc.pilote_identifiant}`}
                    </p>
                    {inc.description && (
                      <p className="text-xs text-slate-500 mt-0.5 italic truncate">{inc.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500 hidden sm:block">
                      {new Date(inc.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-slate-700 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Infos vol</h3>
                        <dl className="text-xs space-y-1">
                          <Row label="Numéro vol" value={inc.numero_vol} />
                          <Row label="Type vol" value={inc.type_vol} />
                          <Row label="Départ" value={inc.aeroport_depart} />
                          <Row label="Arrivée" value={inc.aeroport_arrivee} />
                          <Row label="Lieu incident" value={inc.aeroport_incident} />
                          <Row label="Pilote" value={inc.pilote_identifiant} />
                        </dl>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><Flame className="h-3.5 w-3.5" /> Avion & ATC</h3>
                        <dl className="text-xs space-y-1">
                          <Row label="Immatriculation" value={inc.immatriculation} />
                          <Row label="Type avion" value={inc.type_avion} />
                          <Row label="Usure avant" value={inc.usure_avant_incident != null ? `${inc.usure_avant_incident}%` : null} />
                          <Row label="Signalé par" value={inc.signale_par_identifiant} />
                          <Row label="Position ATC" value={inc.position_atc} />
                        </dl>
                      </div>
                    </div>

                    {/* Description */}
                    {inc.description && (
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Description ATC</h3>
                        <p className="text-sm text-slate-200 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 leading-relaxed">
                          {inc.description}
                        </p>
                      </div>
                    )}

                    {/* Photos */}
                    {hasPhotos && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5" /> Photos ({inc.images_urls.length})
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {inc.images_urls.map((url, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setLightboxUrl(url)}
                              className="relative aspect-video overflow-hidden rounded-lg border border-slate-600 hover:border-sky-500 transition-colors cursor-zoom-in group"
                            >
                              <img
                                src={url}
                                alt={`Photo ${i + 1}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-500">Les photos seront supprimées automatiquement à la clôture de l&apos;incident.</p>
                      </div>
                    )}

                    {/* Ancienne URL screenshot */}
                    {inc.screenshot_url && !hasPhotos && (
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Screenshot (lien externe)</h3>
                        <a href={inc.screenshot_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300">
                          Voir le screenshot →
                        </a>
                      </div>
                    )}

                    {/* Décision rendue */}
                    {inc.statut === 'clos' && inc.decision && (
                      <div className="p-3 bg-slate-900/50 border border-slate-600 rounded-lg space-y-1">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Décision</h3>
                        <p className={`text-sm font-bold ${DECISION_CONFIG[inc.decision]?.color || 'text-slate-100'}`}>
                          {DECISION_CONFIG[inc.decision]?.label || inc.decision}
                        </p>
                        {inc.decision_notes && <p className="text-xs text-slate-400">{inc.decision_notes}</p>}
                        {inc.examine_at && (
                          <p className="text-xs text-slate-500">
                            Examiné le {new Date(inc.examine_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action : prendre en charge */}
                    {inc.statut === 'en_attente' && (
                      <button
                        onClick={() => handlePrendre(inc.id)}
                        disabled={prenant === inc.id}
                        className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {prenant === inc.id ? 'Prise en charge…' : 'Prendre en charge'}
                      </button>
                    )}

                    {/* Actions : décision */}
                    {inc.statut === 'en_examen' && (
                      <div className="space-y-3 p-3 bg-slate-900/50 border border-slate-600 rounded-lg">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Rendre une décision</h3>
                        <textarea
                          value={notesMap[inc.id] || ''}
                          onChange={(e) => setNotesMap(prev => ({ ...prev, [inc.id]: e.target.value }))}
                          placeholder="Notes (optionnel)..."
                          rows={2}
                          aria-label="Notes de décision"
                          className="w-full text-sm bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 resize-none"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            onClick={() => handleDecision(inc.id, 'remis_en_etat')}
                            disabled={deciding === inc.id}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            <Wrench className="h-4 w-4" />
                            Remettre en état
                          </button>
                          <button
                            onClick={() => handleDecision(inc.id, 'aucune_action')}
                            disabled={deciding === inc.id}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold bg-slate-600 text-white rounded-lg hover:bg-slate-500 disabled:opacity-50 transition-colors"
                          >
                            <MinusCircle className="h-4 w-4" />
                            Ne rien faire
                          </button>
                          <button
                            onClick={() => handleDecision(inc.id, 'detruit')}
                            disabled={deciding === inc.id}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                            Détruire l&apos;avion
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          <strong className="text-slate-400">Ne rien faire</strong> : l&apos;avion est débloqué avec son usure actuelle, aucune modification n&apos;est effectuée.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200 font-mono">{value || '—'}</dd>
    </div>
  );
}
