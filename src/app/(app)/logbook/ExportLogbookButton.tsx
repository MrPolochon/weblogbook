'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, FileDown, Calendar, Filter, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type Statut = 'tous' | 'valide' | 'en_attente' | 'refuse';

type Props = {
  typesVolDisponibles?: string[];
  className?: string;
};

const STATUTS: Array<{ value: Statut; label: string; color: string }> = [
  { value: 'valide', label: 'Vols validés', color: 'text-emerald-300' },
  { value: 'tous', label: 'Tous les statuts', color: 'text-slate-200' },
  { value: 'en_attente', label: 'En attente', color: 'text-amber-300' },
  { value: 'refuse', label: 'Refusés', color: 'text-red-300' },
];

export default function ExportLogbookButton({ typesVolDisponibles = [], className }: Props) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statut, setStatut] = useState<Statut>('valide');
  const [typeVol, setTypeVol] = useState<string>('tous');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [inclureMilitaire, setInclureMilitaire] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  async function handleExport() {
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

  return (
    <div ref={wrapperRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500/90 to-emerald-600/90 hover:from-emerald-400 hover:to-emerald-500 text-white text-sm font-medium transition-all shadow-lg shadow-emerald-900/40 border border-emerald-400/30 hover:scale-[1.02] active:scale-[0.98]"
      >
        <FileDown className="h-4 w-4" />
        Exporter en PDF
        {hasActiveFilters && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.8)]"></span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Options d'export du logbook"
          className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] z-40 rounded-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl animate-fade-in overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-700/60 bg-gradient-to-r from-emerald-500/10 to-sky-500/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                <FileDown className="h-4 w-4 text-emerald-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">Export PDF du logbook</p>
                <p className="text-[11px] text-slate-400">Personnalisez les filtres avant de générer.</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700/50 transition-colors"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      statut === s.value
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 shadow-inner'
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
                  value={typeVol}
                  onChange={(e) => setTypeVol(e.target.value)}
                  className="input w-full py-1.5 text-sm"
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

          <div className="px-4 py-3 border-t border-slate-700/60 bg-slate-950/50 flex items-center justify-between gap-2">
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
              disabled={downloading}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white text-sm font-semibold shadow-md shadow-emerald-900/40 transition-all disabled:opacity-50 disabled:hover:scale-100 hover:scale-[1.02] active:scale-[0.98]"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? 'Génération…' : 'Télécharger'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
