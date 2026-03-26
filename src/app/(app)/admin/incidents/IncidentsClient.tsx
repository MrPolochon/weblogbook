'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flame, PlaneLanding, Clock, CheckCircle2, Eye, AlertTriangle, ExternalLink, Image as ImageIcon, Wrench, Trash2, Shield } from 'lucide-react';
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
  statut: 'en_attente' | 'en_examen' | 'clos';
  decision: 'remis_en_etat' | 'detruit' | null;
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

export default function IncidentsClient() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'tous' | 'en_attente' | 'en_examen' | 'clos'>('tous');

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
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prendre_en_charge' }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Erreur');
        return;
      }
      toast.success('Incident pris en charge');
      fetchIncidents();
    } catch {
      toast.error('Erreur serveur');
    }
  };

  const handleDecision = async (id: string, decision: 'remis_en_etat' | 'detruit') => {
    try {
      setDeciding(id);
      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decider', decision, notes: (notesMap[id] || '').trim() || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Erreur');
        return;
      }
      toast.success(decision === 'detruit' ? 'Avion detruit' : 'Avion remis en etat');
      setNotesMap(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      setExpanded(null);
      fetchIncidents();
    } catch {
      toast.error('Erreur serveur');
    } finally {
      setDeciding(null);
    }
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

            return (
              <div key={inc.id} className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : inc.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-700/30 transition-colors"
                >
                  <div className={`p-1.5 rounded ${tc.bg}`}>
                    <TypeIcon className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-100">{inc.numero_incident}</span>
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${sc.bg}`}>
                        <StatusIcon className="h-3 w-3 inline mr-1" />{sc.label}
                      </span>
                      {inc.screenshot_url && <ImageIcon className="h-3.5 w-3.5 text-slate-500" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {tc.label} — Vol {inc.numero_vol || '?'} ({inc.aeroport_depart} → {inc.aeroport_arrivee})
                      {inc.pilote_identifiant && ` — Pilote: ${inc.pilote_identifiant}`}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-slate-700 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Infos vol</h3>
                        <dl className="text-xs space-y-1">
                          <Row label="Numero vol" value={inc.numero_vol} />
                          <Row label="Type vol" value={inc.type_vol} />
                          <Row label="Depart" value={inc.aeroport_depart} />
                          <Row label="Arrivee" value={inc.aeroport_arrivee} />
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
                          <Row label="Signale par" value={inc.signale_par_identifiant} />
                          <Row label="Position ATC" value={inc.position_atc} />
                        </dl>
                      </div>
                    </div>

                    {inc.screenshot_url && (
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Screenshot</h3>
                        <a href={inc.screenshot_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300">
                          <ExternalLink className="h-3 w-3" />Voir le screenshot
                        </a>
                      </div>
                    )}

                    {inc.statut === 'clos' && (
                      <div className="p-3 bg-slate-900/50 border border-slate-600 rounded-lg space-y-1">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Decision</h3>
                        <p className="text-sm font-bold text-slate-100">
                          {inc.decision === 'detruit' ? '🔴 Avion detruit' : '🟢 Avion remis en etat (usure 100%)'}
                        </p>
                        {inc.decision_notes && <p className="text-xs text-slate-400">{inc.decision_notes}</p>}
                        {inc.examine_at && (
                          <p className="text-xs text-slate-500">
                            Examine le {new Date(inc.examine_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}

                    {inc.statut === 'en_attente' && (
                      <button
                        onClick={() => handlePrendre(inc.id)}
                        className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Prendre en charge
                      </button>
                    )}

                    {inc.statut === 'en_examen' && (
                      <div className="space-y-3 p-3 bg-slate-900/50 border border-slate-600 rounded-lg">
                        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Rendre une decision</h3>
                        <textarea
                          value={notesMap[inc.id] || ''}
                          onChange={(e) => setNotesMap(prev => ({ ...prev, [inc.id]: e.target.value }))}
                          placeholder="Notes (optionnel)..."
                          rows={2}
                          className="w-full text-sm bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDecision(inc.id, 'remis_en_etat')}
                            disabled={deciding === inc.id}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            <Wrench className="h-4 w-4" />
                            Remettre en etat
                          </button>
                          <button
                            onClick={() => handleDecision(inc.id, 'detruit')}
                            disabled={deciding === inc.id}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                            Detruire l&apos;avion
                          </button>
                        </div>
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
