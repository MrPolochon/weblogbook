'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookText, X, Volume2, PhoneCall } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AEROPORT_CODES, POSITION_CODES } from '@/lib/atc-phone-codes';

/**
 * Bouton "Annuaire" integre dans la nav ATC (entre Position et horloge).
 *
 * Click -> popover 2 onglets ATIS / ATC, click sur un numero -> dispatch
 * 'atc-telephone:dial' avec le numero. Le composant AtcTelephone (rendu
 * dans le layout) ecoute cet event, s'ouvre, pre-remplit le dialer et
 * passe en 'dialing'. L'utilisateur n'a plus qu'a appuyer sur Call.
 *
 * Le bouton flottant Telephone bottom-right reste disponible pour les
 * appels manuels classiques.
 */
export default function AtcPhonebookButton({ isDark }: { isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'atis' | 'atc'>('atis');
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<string>('all');
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const POPOVER_WIDTH = 360;
      let right = Math.max(8, vw - r.right);
      if (vw - right - POPOVER_WIDTH < 8) right = vw - POPOVER_WIDTH - 8;
      setPos({ top: r.bottom + 6, right: Math.max(8, right) });
    }
    reposition();
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function dialNumber(num: string) {
    window.dispatchEvent(new CustomEvent('atc-telephone:dial', { detail: { number: num } }));
    setOpen(false);
  }

  const triggerClass = cn(
    'relative rounded-xl border px-2.5 py-1 transition-colors flex items-center justify-center gap-1.5 text-sm font-semibold whitespace-nowrap',
    open
      ? isDark
        ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
        : 'border-sky-300 bg-sky-100 text-sky-700'
      : isDark
        ? 'border-slate-700/80 bg-slate-900/70 text-slate-200 hover:border-sky-500/40 hover:text-sky-200'
        : 'border-slate-200 bg-slate-100 text-slate-700 hover:border-sky-300 hover:text-sky-700'
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        title="Annuaire des numéros ATC et ATIS"
        aria-label="Annuaire ATC"
      >
        <BookText className="h-4 w-4" />
        <span className="hidden lg:inline">Annuaire</span>
      </button>

      {mounted && open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-[min(22.5rem,calc(100vw-1rem))] max-h-[min(80vh,32rem)] overflow-hidden rounded-2xl border border-slate-600/60 bg-[#0d1120] shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60">
            <div className="flex items-center gap-2">
              <BookText className="h-4 w-4 text-slate-300" />
              <span className="text-sm font-semibold text-slate-200">Annuaire ATC</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="flex items-center justify-center h-6 w-6 rounded-md text-slate-400 hover:bg-slate-700/60 hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex gap-1 px-3 pt-2">
            <button
              type="button"
              onClick={() => { setTab('atis'); setSearch(''); }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors',
                tab === 'atis'
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                  : 'bg-slate-800 text-slate-400 border border-transparent hover:text-slate-200'
              )}
            >
              <Volume2 className="h-3.5 w-3.5" />
              ATIS
              <span className="text-[10px] opacity-70">({Object.keys(AEROPORT_CODES).length})</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('atc'); setSearch(''); }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors',
                tab === 'atc'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-transparent hover:text-slate-200'
              )}
            >
              <PhoneCall className="h-3.5 w-3.5" />
              ATC
              <span className="text-[10px] opacity-70">
                ({Object.keys(AEROPORT_CODES).length * Object.keys(POSITION_CODES).length})
              </span>
            </button>
          </div>

          <div className="px-3 py-2 flex gap-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'atis' ? 'Rechercher (ICAO, code)' : 'ICAO, position, numéro...'}
              className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-slate-100 px-2 py-1 text-xs placeholder-slate-500"
            />
            {tab === 'atc' && (
              <select
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value)}
                className="rounded-md bg-slate-800 border border-slate-700 text-slate-100 px-1 py-1 text-xs max-w-[90px]"
              >
                <option value="all">Toutes</option>
                {Object.keys(POSITION_CODES).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5 text-[11px]">
            {tab === 'atis' ? (
              <AtisList search={search} onDial={dialNumber} />
            ) : (
              <AtcList search={search} posFilter={posFilter} onDial={dialNumber} />
            )}
          </div>

          <div className="border-t border-slate-700/50 px-3 py-2 text-[10px] text-slate-500 leading-snug bg-slate-900/40">
            {tab === 'atis' ? (
              <>ℹ️ Click sur un aéroport — le téléphone s&apos;ouvre, le numéro est composé. Appuyez sur Call pour écouter l&apos;ATIS.</>
            ) : (
              <>
                ℹ️ Codes locaux (même aéroport) : <span className="font-mono">*15</span> Delivery,
                <span className="font-mono"> *16</span> Clairance, <span className="font-mono">*17</span> Ground,
                <span className="font-mono"> *18</span> Tower. Urgences : <span className="font-mono">911</span> / <span className="font-mono">112</span>.
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function AtisList({ search, onDial }: { search: string; onDial: (num: string) => void }) {
  const q = search.trim().toUpperCase();
  const filtered = Object.entries(AEROPORT_CODES)
    .filter(([icao, code]) => !q || icao.includes(q) || code.includes(q))
    .sort(([a], [b]) => a.localeCompare(b));
  if (filtered.length === 0) {
    return <p className="text-slate-500 text-center py-4">Aucun résultat</p>;
  }
  return (
    <>
      {filtered.map(([icao, code]) => {
        const num = `${code}9999`;
        return (
          <button
            key={icao}
            type="button"
            onClick={() => onDial(num)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-slate-800 hover:bg-sky-500/20 hover:border-sky-500/40 border border-transparent transition-colors text-left"
          >
            <span className="font-mono text-slate-100">{icao}</span>
            <span className="font-mono text-sky-300">{num}</span>
          </button>
        );
      })}
    </>
  );
}

function AtcList({ search, posFilter, onDial }: { search: string; posFilter: string; onDial: (num: string) => void }) {
  const q = search.trim().toUpperCase();
  const rows: Array<{ icao: string; position: string; number: string }> = [];
  const sortedAirports = Object.entries(AEROPORT_CODES).sort(([a], [b]) => a.localeCompare(b));
  const positionOrder = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center', 'AFIS', 'ATIS'];
  for (const [icao, aeroCode] of sortedAirports) {
    for (const p of positionOrder) {
      if (posFilter !== 'all' && posFilter !== p) continue;
      const posCode = POSITION_CODES[p];
      if (!posCode) continue;
      const num = `+14${aeroCode}${posCode}`;
      if (q) {
        const hay = `${icao} ${p.toUpperCase()} ${num} ${aeroCode}${posCode}`;
        if (!hay.includes(q)) continue;
      }
      rows.push({ icao, position: p, number: num });
    }
  }
  if (rows.length === 0) {
    return <p className="text-slate-500 text-center py-4">Aucun résultat</p>;
  }
  return (
    <>
      {rows.map((r) => (
        <button
          key={`${r.icao}-${r.position}`}
          type="button"
          onClick={() => onDial(r.number)}
          className="w-full grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded bg-slate-800 hover:bg-emerald-500/20 hover:border-emerald-500/40 border border-transparent transition-colors text-left"
          title={`${r.icao} ${r.position}`}
        >
          <span className="font-mono text-slate-100">{r.icao}</span>
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[9px] font-semibold',
            r.position === 'ATIS' ? 'bg-sky-500/20 text-sky-300' :
            r.position === 'Tower' ? 'bg-amber-500/20 text-amber-300' :
            r.position === 'Ground' ? 'bg-emerald-500/20 text-emerald-300' :
            r.position === 'Center' ? 'bg-purple-500/20 text-purple-300' :
            'bg-slate-700 text-slate-300'
          )}>{r.position}</span>
          <span className="font-mono text-emerald-300">{r.number}</span>
        </button>
      ))}
    </>
  );
}
