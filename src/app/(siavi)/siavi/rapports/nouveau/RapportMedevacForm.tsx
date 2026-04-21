'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Trash2, Clock, AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';

interface TimelineEntry {
  heure: string;
  description: string;
}

interface SegmentBrief {
  aeroport_depart: string;
  aeroport_arrivee: string;
  segment_index: number | null;
}

interface Props {
  planVolId: string;
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  aircraftRegistration: string;
  aircraftType: string;
  commanderDefault: string;
  segments?: SegmentBrief[];
  /** Suggestion serveur (UTC, alerte fictive 30–60 min avant le 1er départ) */
  initialChronologie?: TimelineEntry[];
}

export default function RapportMedevacForm({
  planVolId, numeroVol, aeroportDepart, aeroportArrivee,
  aircraftRegistration, aircraftType, commanderDefault, segments,
  initialChronologie,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [commander, setCommander] = useState(commanderDefault);
  const [coPilot, setCoPilot] = useState('');
  const [medicalTeam, setMedicalTeam] = useState('');

  // Timeline : suggestions serveur si fournies, sinon libellés sans heures
  const defaultTimeline: TimelineEntry[] = (() => {
    if (initialChronologie?.length) return initialChronologie;
    if (segments && segments.length > 1) {
      const entries: TimelineEntry[] = [{ heure: '', description: 'MEDEVAC alert activation' }];
      segments.forEach((s) => {
        entries.push({ heure: '', description: `Departure ${s.aeroport_depart}` });
        entries.push({ heure: '', description: `Arrival ${s.aeroport_arrivee}` });
      });
      return entries;
    }
    return [
      { heure: '', description: 'MEDEVAC alert activation' },
      { heure: '', description: `Departure ${aeroportDepart}` },
      { heure: '', description: `Arrival ${aeroportArrivee}` },
    ];
  })();
  const [timeline, setTimeline] = useState<TimelineEntry[]>(defaultTimeline);
  const [medicalSummary, setMedicalSummary] = useState('');
  const [groundEvent, setGroundEvent] = useState('');
  const [outcome, setOutcome] = useState('');
  const [safetyRemarks, setSafetyRemarks] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function addTimelineEntry() {
    setTimeline([...timeline, { heure: '', description: '' }]);
  }

  function removeTimelineEntry(idx: number) {
    setTimeline(timeline.filter((_, i) => i !== idx));
  }

  function updateTimeline(idx: number, field: 'heure' | 'description', value: string) {
    setTimeline(timeline.map((entry, i) => i === idx ? { ...entry, [field]: value } : entry));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!commander.trim()) { setError('Commandant de bord requis.'); return; }
    if (!medicalSummary.trim()) { setError('Résumé médical requis.'); return; }
    if (!outcome.trim()) { setError('Issue de la mission requise.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/siavi/rapports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_vol_id: planVolId,
          commander: commander.trim(),
          co_pilot: coPilot.trim() || null,
          medical_team: medicalTeam.trim() || null,
          mission_timeline: timeline.filter(t => t.heure.trim() || t.description.trim()),
          medical_summary: medicalSummary.trim(),
          ground_event: groundEvent.trim() || null,
          outcome: outcome.trim(),
          safety_remarks: safetyRemarks.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(`Rapport de mission n°${data.numero_mission} enregistré.`);
      setTimeout(() => {
        startTransition(() => router.push(`/siavi/rapports/${data.id}`));
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{success}</p>
        </div>
      )}

      {/* Infos auto-remplies */}
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider mb-3">1. Informations générales & aéronef</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-red-600">Mission</span><p className="font-mono font-bold text-red-900">{numeroVol}</p></div>
          <div><span className="text-red-600">Base</span><p className="font-mono font-bold text-red-900">{aeroportDepart}</p></div>
          <div><span className="text-red-600">Immat.</span><p className="font-mono font-bold text-red-900">{aircraftRegistration}</p></div>
          <div><span className="text-red-600">Type</span><p className="font-bold text-red-900">{aircraftType}</p></div>
        </div>
      </div>

      {/* Équipage */}
      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider">3. Équipage de vol</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Commandant de bord / Pilote médical *</label>
            <input type="text" value={commander} onChange={e => setCommander(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Co-pilote / Pilote médical</label>
            <input type="text" value={coPilot} onChange={e => setCoPilot(e.target.value)} className={inputCls} placeholder="Optionnel" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Équipe médicale</label>
          <input type="text" value={medicalTeam} onChange={e => setMedicalTeam(e.target.value)} className={inputCls} placeholder="Ex: 2 Medical Pilots + 1 Nurse" />
        </div>
      </div>

      {/* Chronologie */}
      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider">4. Chronologie de la mission (UTC)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Heures proposées automatiquement en UTC : alerte fictive entre 30 et 60 minutes avant le 1er départ, puis enchaînement selon les durées prévues par segment. À ajuster selon les heures réelles.
            </p>
          </div>
          <button type="button" onClick={addTimelineEntry}
            className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-medium transition-colors">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {timeline.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="flex items-center gap-1 w-24 flex-shrink-0">
                <Clock className="h-3.5 w-3.5 text-red-400" />
                <input type="text" value={entry.heure} onChange={e => updateTimeline(idx, 'heure', e.target.value)}
                  placeholder="HH:MM"
                  className="w-full px-2 py-1.5 rounded border border-red-300 focus:ring-2 focus:ring-red-500 font-mono text-sm bg-white text-slate-900 placeholder-slate-400" />
              </div>
              <input type="text" value={entry.description} onChange={e => updateTimeline(idx, 'description', e.target.value)}
                placeholder="Description de l'événement..."
                className="flex-1 px-3 py-1.5 rounded border border-red-300 focus:ring-2 focus:ring-red-500 text-sm bg-white text-slate-900 placeholder-slate-400" />
              {timeline.length > 1 && (
                <button type="button" onClick={() => removeTimelineEntry(idx)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Résumé médical */}
      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider">5. Résumé de l&apos;événement médical *</h3>
        <textarea value={medicalSummary} onChange={e => setMedicalSummary(e.target.value)}
          rows={4} placeholder="État du patient, traitement administré, événements médicaux en vol..."
          className={inputCls} required />
      </div>

      {/* Événement au sol */}
      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider">6. Événement au sol — arrivée</h3>
        <textarea value={groundEvent} onChange={e => setGroundEvent(e.target.value)}
          rows={3} placeholder="Optionnel : incidents au sol, transfert médical, interventions..."
          className={inputCls} />
      </div>

      {/* Issue */}
      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider">7. Issue de la mission *</h3>
        <textarea value={outcome} onChange={e => setOutcome(e.target.value)}
          rows={3} placeholder="État final du patient, résultat de l'intervention..."
          className={inputCls} required />
      </div>

      {/* Remarques sécurité */}
      <div className="rounded-xl bg-white border border-red-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wider">8. Remarques sécurité & opérationnelles</h3>
        <textarea value={safetyRemarks} onChange={e => setSafetyRemarks(e.target.value)}
          rows={3} placeholder="Optionnel : observations, recommandations..."
          className={inputCls} />
      </div>

      <button type="submit" disabled={loading || !!success}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 disabled:opacity-50 text-white rounded-xl font-bold text-lg shadow-lg transition-all">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        Soumettre le rapport
      </button>
    </form>
  );
}
