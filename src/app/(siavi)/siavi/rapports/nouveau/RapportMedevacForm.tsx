'use client';

import { useState } from 'react';
import { splitMedevacRevenue } from '@/lib/siavi/medevac-remuneration';
import { Plus, Trash2, Clock, AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';

function newTimelineRowKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `tl-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface TimelineEntry {
  rowKey: string;
  heure: string;
  description: string;
}

interface SegmentBrief {
  aeroport_depart: string;
  aeroport_arrivee: string;
  segment_index: number | null;
}

interface Props {
  agents: {id:string;identifiant:string}[];
  pilotId: string;
  remunerationPreview: number | null;
  planVolId: string;
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  aircraftRegistration: string;
  aircraftType: string;
  commanderDefault: string;
  segments?: SegmentBrief[];
  /** Suggestion serveur (UTC, alerte fictive 30–60 min avant le 1er départ) */
  initialChronologie?: Array<{ heure: string; description: string }>;
}

export default function RapportMedevacForm({
  planVolId, numeroVol, aeroportDepart, aeroportArrivee,
  aircraftRegistration, aircraftType, commanderDefault, segments,
  initialChronologie, agents, pilotId, remunerationPreview,
}: Props) {
  const [participantIds,setParticipantIds]=useState<string[]>([pilotId]);
  const split=remunerationPreview===null?null:splitMedevacRevenue(remunerationPreview,participantIds.length);


  const [commander, setCommander] = useState(commanderDefault);
  const [coPilot, setCoPilot] = useState('');
  const [medicalTeam, setMedicalTeam] = useState('');

  // Timeline : initialiseur paresseux (une fois au montage) + clés stables par ligne
  const [timeline, setTimeline] = useState<TimelineEntry[]>(() => {
    const withKeys = (rows: Array<{ heure: string; description: string }>): TimelineEntry[] =>
      rows.map((r) => ({ rowKey: newTimelineRowKey(), ...r }));

    if (initialChronologie?.length) return withKeys(initialChronologie);
    if (segments && segments.length > 1) {
      const rows: Array<{ heure: string; description: string }> = [
        { heure: '', description: 'MEDEVAC alert activation' },
      ];
      segments.forEach((s) => {
        rows.push({ heure: '', description: `Departure ${s.aeroport_depart}` });
        rows.push({ heure: '', description: `Arrival ${s.aeroport_arrivee}` });
      });
      return withKeys(rows);
    }
    return withKeys([
      { heure: '', description: 'MEDEVAC alert activation' },
      { heure: '', description: `Departure ${aeroportDepart}` },
      { heure: '', description: `Arrival ${aeroportArrivee}` },
    ]);
  });
  const [medicalSummary, setMedicalSummary] = useState('');
  const [groundEvent, setGroundEvent] = useState('');
  const [outcome, setOutcome] = useState('');
  const [safetyRemarks, setSafetyRemarks] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function addTimelineEntry() {
    setTimeline([...timeline, { rowKey: newTimelineRowKey(), heure: '', description: '' }]);
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
          participant_ids: participantIds,
          commander: commander.trim(),
          co_pilot: coPilot.trim() || null,
          medical_team: medicalTeam.trim() || null,
          mission_timeline: timeline
            .filter((t) => t.heure.trim() || t.description.trim())
            .map(({ heure, description }) => ({ heure, description })),
          medical_summary: medicalSummary.trim(),
          ground_event: groundEvent.trim() || null,
          outcome: outcome.trim(),
          safety_remarks: safetyRemarks.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(`Rapport de mission n°${data.numero_mission} enregistré.`);
      // Reload the server layout so the completed report no longer locks navigation.
      window.location.assign('/siavi/medevac');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-rose-400/40 focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-900';

  return (
    <form onSubmit={handleSubmit} className="space-y-6 siavi-workspace siavi-enter">
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-950/40 border border-rose-500/25 text-rose-200">
          <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-950/50 border border-emerald-200 text-emerald-200">
          <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">{success}</p>
        </div>
      )}

      {/* Infos auto-remplies */}
      <div className="rounded-xl bg-rose-950/40 border border-rose-500/25 p-4">
        <h3 className="text-sm font-bold text-rose-200 uppercase tracking-wider mb-3">1. Informations générales & aéronef</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-rose-300">Mission</span><p className="font-mono font-bold text-rose-100">{numeroVol}</p></div>
          <div><span className="text-rose-300">Base</span><p className="font-mono font-bold text-rose-100">{aeroportDepart}</p></div>
          <div><span className="text-rose-300">Immat.</span><p className="font-mono font-bold text-rose-100">{aircraftRegistration}</p></div>
          <div><span className="text-rose-300">Type</span><p className="font-bold text-rose-100">{aircraftType}</p></div>
        </div>
      </div>

      {/* Équipage */}
      <div className="rounded-xl bg-slate-900 border border-rose-500/25 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-rose-200 uppercase tracking-wider">3. Équipage de vol</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Commandant de bord / Pilote médical *</label>
            <input type="text" value={commander} onChange={e => setCommander(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">Co-pilote / Pilote médical</label>
            <input type="text" value={coPilot} onChange={e => setCoPilot(e.target.value)} className={inputCls} placeholder="Optionnel" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-1">Équipe médicale</label>
          <input type="text" value={medicalTeam} onChange={e => setMedicalTeam(e.target.value)} className={inputCls} placeholder="Ex: 2 Medical Pilots + 1 Nurse" />
        </div>
      </div>

      <fieldset className="rounded-xl border border-rose-500/30 bg-slate-900 p-6 space-y-3"><legend className="px-2 text-lg font-semibold text-rose-100">Participants et rémunération</legend><p className="text-sm text-slate-300">Sélectionnez les agents ayant participé. Le pilote est inclus. La moitié de la recette va au SIAVI ; le reste est partagé à parts égales entre les membres de cet équipage.</p><div className="grid gap-2 sm:grid-cols-2">{agents.map(agent=><label key={agent.id} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100"><input type="checkbox" checked={participantIds.includes(agent.id)} disabled={agent.id===pilotId} onChange={e=>setParticipantIds(prev=>e.target.checked?[...prev,agent.id]:prev.filter(id=>id!==agent.id))} className="h-4 w-4 accent-rose-500" /><span>{agent.identifiant}{agent.id===pilotId?' · Pilote':''}</span></label>)}</div>{split?<div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-100"><p>Recette : {remunerationPreview?.toLocaleString('fr-FR')} F$ · SIAVI : {split.siavi.toLocaleString('fr-FR')} F$</p><p className="mt-1">Équipage : {split.crew.toLocaleString('fr-FR')} F$ pour {participantIds.length} participant(s), soit environ {Math.floor(split.crew/participantIds.length).toLocaleString('fr-FR')} F$ chacun.</p><p className="mt-2 text-xs text-slate-300">Le montant définitif est calculé et versé une seule fois à la validation du rapport.</p></div>:<p className="text-sm text-amber-200">Mission antérieure : ancien barème déjà appliqué à la clôture. Aucun second paiement ne sera effectué.</p>}</fieldset>

      {/* Chronologie */}
      <div className="rounded-xl bg-slate-900 border border-rose-500/25 shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-rose-200 uppercase tracking-wider">4. Chronologie de la mission (UTC)</h3>
            <p className="text-xs text-slate-400 mt-1">
              Heures proposées automatiquement en UTC : alerte fictive entre 30 et 60 minutes avant le 1er départ, puis enchaînement selon les durées prévues par segment. À ajuster selon les heures réelles.
            </p>
          </div>
          <button type="button" onClick={addTimelineEntry}
            className="inline-flex items-center gap-1 px-3 py-1 bg-rose-950/60 hover:bg-red-200 text-rose-200 rounded-lg text-xs font-medium transition-colors">
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </button>
        </div>
        <div className="space-y-2">
          {timeline.map((entry, idx) => (
            <div key={entry.rowKey} className="flex items-center gap-2">
              <div className="flex items-center gap-1 w-24 flex-shrink-0">
                <Clock className="h-3.5 w-3.5 text-red-400" />
                <input type="text" value={entry.heure} onChange={e => updateTimeline(idx, 'heure', e.target.value)}
                  placeholder="HH:MM"
                  className="w-full px-2 py-1.5 rounded border border-rose-400/40 focus:ring-2 focus:ring-red-500 font-mono text-sm bg-slate-900 text-slate-100 placeholder-slate-400" />
              </div>
              <input type="text" value={entry.description} onChange={e => updateTimeline(idx, 'description', e.target.value)}
                placeholder="Description de l'événement..."
                className="flex-1 px-3 py-1.5 rounded border border-rose-400/40 focus:ring-2 focus:ring-red-500 text-sm bg-slate-900 text-slate-100 placeholder-slate-400" />
              {timeline.length > 1 && (
                <button type="button" onClick={() => removeTimelineEntry(idx)}
                  className="p-1.5 text-red-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Résumé médical */}
      <div className="rounded-xl bg-slate-900 border border-rose-500/25 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-rose-200 uppercase tracking-wider">5. Résumé de l&apos;événement médical *</h3>
        <textarea value={medicalSummary} onChange={e => setMedicalSummary(e.target.value)}
          rows={4} placeholder="État du patient, traitement administré, événements médicaux en vol..."
          className={inputCls} required />
      </div>

      {/* Événement au sol */}
      <div className="rounded-xl bg-slate-900 border border-rose-500/25 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-rose-200 uppercase tracking-wider">6. Événement au sol — arrivée</h3>
        <textarea value={groundEvent} onChange={e => setGroundEvent(e.target.value)}
          rows={3} placeholder="Optionnel : incidents au sol, transfert médical, interventions..."
          className={inputCls} />
      </div>

      {/* Issue */}
      <div className="rounded-xl bg-slate-900 border border-rose-500/25 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-rose-200 uppercase tracking-wider">7. Issue de la mission *</h3>
        <textarea value={outcome} onChange={e => setOutcome(e.target.value)}
          rows={3} placeholder="État final du patient, résultat de l'intervention..."
          className={inputCls} required />
      </div>

      {/* Remarques sécurité */}
      <div className="rounded-xl bg-slate-900 border border-rose-500/25 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-rose-200 uppercase tracking-wider">8. Remarques sécurité & opérationnelles</h3>
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
