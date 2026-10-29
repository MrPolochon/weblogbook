'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, FileDown, Calendar, Filter, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type Statut = 'tous' | 'valide' | 'en_attente' | 'refuse';

type Props = {
  typesVolDisponibles?: string[];
  className?: string;
};

const STATUTS: Array<{ value: Statut; label: string; color: string }> = [
  { value: 'valide', label: 'Vols validés', color: 'text-sky-300' },
  { value: 'tous', label: 'Tous les statuts', color: 'text-slate-200' },
  { value: 'en_attente', label: 'En attente', color: 'text-amber-300' },
  { value: 'refuse', label: 'Refusés', color: 'text-red-300' },
];

const PANEL_MAX_W = 352;
const EST_PANEL_H = 440;
const VIEW_MARGIN = 12;
const GAP = 8;

export default function ExportLogbookButton({ typesVolDisponibles = [], className }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statut, setStatut] = useState<Statut>('valide');
  const [typeVol, setTypeVol] = useState<string>('tous');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [inclureMilitaire, setInclureMilitaire] = useState(false);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
    translateY: string;
  }>({ top: 0, left: 0, width: PANEL_MAX_W, translateY: '0' });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const updatePanelPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const width = Math.min(PANEL_MAX_W, window.innerWidth - 2 * VIEW_MARGIN);
    let left = r.right - width;
    left = Math.max(VIEW_MARGIN, Math.min(left, window.innerWidth - width - VIEW_MARGIN));

    const spaceBelow = window.innerHeight - r.bottom - VIEW_MARGIN;
    const spaceAbove = r.top - VIEW_MARGIN;
    const preferAbove =
      spaceBelow < Math.min(EST_PANEL_H, spaceBelow + spaceAbove) && spaceAbove > 120;

    let top: number;
    let translateY: string;
    if (preferAbove) {
      top = r.top - GAP;
      translateY = '-100%';
    } else {
      top = r.bottom + GAP;
      translateY = '0';
    }

    setPanelPos({ top, left, width, translateY });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePanelPosition, true);
    window.addEventListener('resize', updatePanelPosition);
    return () => {
      window.removeEventListener('scroll', updatePanelPosition, true);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function handleExport() {
    if (downloading) return;
    if (dateDebut && dateFin && dateDebut > dateFin) {
      toast.error('La date de fin doit être postérieure ou égale à la date de début.');
      return;
    }
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      params.set('statut', statut);
      if (typeVol && typeVol !== 'tous') params.set('type_vol', typeVol);
      if (dateDebut) params.set('date_debut', dateDebut);
      if (dateFin) params.set('date_fin', dateFin);
      if (inclureMilitaire) params.set('inclure_militaire', '1');

      const res = await fetch(`/api/logbook/export?${params.toString()}`, { method: 'GET' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Erreur génération PDF');
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || 'logbook.pdf';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      toast.success('PDF généré avec succès', {
        description: filename,
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de l\'export');
    } finally {
      setDownloading(false);
    }
  }

  function resetFiltres() {
    setStatut('valide');
    setTypeVol('tous');
    setDateDebut('');
    setDateFin('');
    setInclureMilitaire(false);
  }

  const hasActiveFilters =
    statut !== 'valide' ||
    typeVol !== 'tous' ||
    !!dateDebut ||
    !!dateFin ||
    inclureMilitaire;

  const panel = open && mounted && (
    <div
      ref={panelRef}
      id="logbook-export-options"
      role="dialog"
      aria-label="Options d'export du logbook"
      className="fixed z-[60] flex max-h-[min(75vh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-900 shadow-xl"
      style={{
        top: panelPos.top,
        left: panelPos.left,
        width: panelPos.width,
        transform: `translateY(${panelPos.translateY})`,
      }}
    >
      <div className="px-4 py-3 border-b border-slate-700/60 bg-slate-950/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-600 shrink-0">
            <FileDown className="h-4 w-4 text-sky-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">Export PDF du logbook</p>
            <p className="text-[11px] text-slate-400">Archive du carnet · dates en UTC.</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700/50 transition-colors shrink-0"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto overscroll-contain min-h-0">
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Filter className="h-3 w-3" />
            Statut des vols
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {STATUTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatut(s.value)}
                aria-pressed={statut === s.value}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  statut === s.value
                    ? 'border-sky-600 bg-sky-950/30 text-sky-200'
                    : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:border-slate-500/60 hover:bg-slate-800/70'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {typesVolDisponibles.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Type de vol
            </label>
            <select
              aria-label="Type de vol à exporter"
              value={typeVol}
              onChange={(e) => setTypeVol(e.target.value)}
              className="input min-h-11 w-full min-w-0 text-sm"
            >
              <option value="tous">Tous les types</option>
              {typesVolDisponibles.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Du
            </label>
            <input
              type="date"
              aria-label="Début de la période UTC"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="input w-full py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Au
            </label>
            <input
              type="date"
              aria-label="Fin de la période UTC"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              min={dateDebut || undefined}
              className="input w-full py-1.5 text-sm"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/40 cursor-pointer hover:bg-slate-800/70 transition-colors">
          <input
            type="checkbox"
            checked={inclureMilitaire}
            onChange={(e) => setInclureMilitaire(e.target.checked)}
            className="mt-0.5 accent-emerald-500"
          />
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-200">Inclure les vols militaires</p>
            <p className="text-[10px] text-slate-500">Par défaut, les vols militaires sont exclus du logbook civil.</p>
          </div>
        </label>
      </div>

      {dateDebut && dateFin && dateDebut > dateFin && <p role="alert" className="px-4 pb-3 text-xs text-red-300">La date de fin précède la date de début.</p>}
      <div className="px-4 py-3 border-t border-slate-700/60 bg-slate-950/50 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={resetFiltres}
          disabled={downloading || !hasActiveFilters}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Réinitialiser
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={downloading || Boolean(dateDebut && dateFin && dateDebut > dateFin)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloading ? 'Génération…' : 'Télécharger'}
        </button>
      </div>
    </div>
  );

  return (
    <div className={className || ''}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'logbook-export-options' : undefined}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
      >
        <FileDown className="h-4 w-4" />
        Exporter en PDF
        {hasActiveFilters && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-300"></span>
        )}
      </button>

      {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </div>
  );
}
