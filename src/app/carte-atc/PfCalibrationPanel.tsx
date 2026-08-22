'use client';

import { Crosshair } from 'lucide-react';
import {
  PF_CALIB_MAX_POINTS,
  PF_CALIB_MIN_POINTS,
  type PfCalibFit,
  type PfCalibPoint,
} from '@/lib/pf-calibration';

type AircraftHint = {
  id: string;
  callsign: string;
  x: number;
  y: number;
} | null;

export default function PfCalibrationPanel({
  calibMode,
  onToggleMode,
  points,
  onChangePoint,
  onRemovePoint,
  onApply,
  onReset,
  onUseAircraft,
  selectedAircraft,
  fit,
  active,
  applyError,
}: {
  calibMode: boolean;
  onToggleMode: () => void;
  points: PfCalibPoint[];
  onChangePoint: (id: string, patch: Partial<PfCalibPoint>) => void;
  onRemovePoint: (id: string) => void;
  onApply: () => void;
  onReset: () => void;
  onUseAircraft: (id: string) => void;
  selectedAircraft: AircraftHint;
  fit: PfCalibFit;
  active: boolean;
  applyError: string | null;
}) {
  const ready = points.filter((p) => p.gameX != null && p.gameY != null).length;

  return (
    <div className="rounded-lg border border-cyan-700/40 bg-slate-950/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-slate-200 text-xs font-semibold">Calibration carte</p>
        <button
          type="button"
          onClick={onToggleMode}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border ${
            calibMode
              ? 'bg-amber-600/25 text-amber-200 border-amber-500/40'
              : 'bg-slate-800 text-slate-300 border-slate-600'
          }`}
        >
          <Crosshair className="h-3 w-3" />
          {calibMode ? 'Clic actif' : 'Placer un point'}
        </button>
      </div>
      <p className="text-[10px] text-slate-500 leading-snug">
        Clique l’endroit réel sur le fond : les X/Y jeu de l’avion sélectionné (ou le plus proche) sont pris pour ce point.
        1 point décale la carte, 2 et plus règlent l’échelle, {PF_CALIB_MAX_POINTS} pour un calage solide.
      </p>
      <p className="text-[11px] font-mono text-cyan-300/90">
        {ready} / {PF_CALIB_MAX_POINTS} points prêts
        {active ? ' · calage actif' : ''}
      </p>
      {calibMode && (
        <p className="text-[10px] text-amber-200/90">Clique sur la carte pour poser le prochain point.</p>
      )}
      {selectedAircraft && (
        <button
          type="button"
          onClick={() => onUseAircraft(selectedAircraft.id)}
          className="w-full text-left text-[10px] rounded-md border border-amber-500/30 bg-amber-950/30 px-2 py-1.5 text-amber-100"
        >
          Remplir avec {selectedAircraft.callsign || 'l’avion'} · X {selectedAircraft.x.toFixed(1)} · Y {selectedAircraft.y.toFixed(1)}
        </button>
      )}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
        {points.length === 0 && (
          <p className="text-[10px] text-slate-600">Aucun point. Passe en mode clic puis clique la carte.</p>
        )}
        {points.map((p, i) => (
          <div key={p.id} className="rounded-md border border-slate-700/70 bg-slate-900/80 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <input
                className="flex-1 min-w-0 rounded bg-slate-800 border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-200"
                value={p.label}
                onChange={(e) => onChangePoint(p.id, { label: e.target.value })}
                placeholder={`Point ${i + 1}`}
              />
              <button type="button" onClick={() => onRemovePoint(p.id)} className="text-[10px] text-slate-500 hover:text-red-300">
                Retirer
              </button>
            </div>
            <p className="text-[10px] font-mono text-slate-500">
              Carte {p.mapX.toFixed(2)} , {p.mapY.toFixed(2)}
            </p>
            <div className="grid grid-cols-2 gap-1">
              <label className="text-[10px] text-slate-500">
                X jeu
                <input
                  className="mt-0.5 w-full rounded bg-slate-800 border border-slate-600 px-1.5 py-0.5 text-[10px] font-mono text-cyan-200"
                  inputMode="decimal"
                  value={p.gameX ?? ''}
                  onChange={(e) => onChangePoint(p.id, { gameX: parseCoord(e.target.value) })}
                  placeholder="-43291"
                />
              </label>
              <label className="text-[10px] text-slate-500">
                Y jeu
                <input
                  className="mt-0.5 w-full rounded bg-slate-800 border border-slate-600 px-1.5 py-0.5 text-[10px] font-mono text-cyan-200"
                  inputMode="decimal"
                  value={p.gameY ?? ''}
                  onChange={(e) => onChangePoint(p.id, { gameY: parseCoord(e.target.value) })}
                  placeholder="5100"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      {applyError && <p className="text-[10px] text-red-400">{applyError}</p>}
      {active && (
        <p className="text-[10px] font-mono text-slate-500 leading-snug">
          sx {fit.sx.toExponential(4)} · sy {fit.sy.toExponential(4)}
          <br />
          ox {fit.ox.toFixed(3)} · oy {fit.oy.toFixed(3)} · rms {fit.rms.toFixed(3)}
        </p>
      )}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onApply}
          className="flex-1 px-2 py-1.5 rounded-md text-[10px] font-semibold bg-cyan-700/40 text-cyan-100 border border-cyan-500/40 hover:bg-cyan-700/55"
        >
          Appliquer
        </button>
        <button
          type="button"
          onClick={onReset}
          className="px-2 py-1.5 rounded-md text-[10px] text-slate-400 border border-slate-600 hover:text-slate-200"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function parseCoord(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
