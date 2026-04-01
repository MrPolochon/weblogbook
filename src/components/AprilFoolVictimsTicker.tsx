'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Radio } from 'lucide-react';
import { getParisCalendarYear } from '@/lib/paris-date';

const CHUNK_SIZE = 5;
const POLL_MS = 45_000;
/** Temps d’affichage d’un groupe de noms avant de passer au suivant (jamais les mêmes identifiants entre paliers). */
const CHUNK_SHOW_MS = 50_000;
/** Pause entre la fin du dernier palier et le retour au premier. */
const CYCLE_PAUSE_MS = 60_000;

export default function AprilFoolVictimsTicker() {
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [chunkIndex, setChunkIndex] = useState(0);
  const [phase, setPhase] = useState<'show' | 'pause'>('show');
  const year = getParisCalendarYear();
  const chunksRef = useRef<string[][]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/april-fool/victims?year=${year}`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setFetchState('error');
          return;
        }
        const data = await res.json();
        if (!cancelled && Array.isArray(data.identifiers)) {
          setFetchState('ok');
          const next = data.identifiers as string[];
          setIdentifiers((prev) => {
            if (
              prev.length === next.length &&
              prev.every((v, i) => v === next[i])
            ) {
              return prev;
            }
            return next;
          });
        }
      } catch {
        if (!cancelled) setFetchState('error');
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [year]);

  const chunks = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < identifiers.length; i += CHUNK_SIZE) {
      out.push(identifiers.slice(i, i + CHUNK_SIZE));
    }
    return out;
  }, [identifiers]);

  chunksRef.current = chunks;

  const chunksKey = identifiers.join('\0');

  useEffect(() => {
    if (fetchState !== 'ok' || chunks.length === 0) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    setChunkIndex(0);
    setPhase('show');

    const scheduleAfterCyclePause = () => {
      if (cancelled) return;
      setPhase('pause');
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        setPhase('show');
        setChunkIndex(0);
        scheduleChunk(0);
      }, CYCLE_PAUSE_MS);
    };

    const scheduleChunk = (index: number) => {
      if (cancelled) return;
      setPhase('show');
      setChunkIndex(index);

      timeoutId = setTimeout(() => {
        if (cancelled) return;
        const len = chunksRef.current.length;
        const next = index + 1;
        if (next >= len) {
          scheduleAfterCyclePause();
        } else {
          scheduleChunk(next);
        }
      }, CHUNK_SHOW_MS);
    };

    scheduleChunk(0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [fetchState, chunksKey, chunks.length]);

  const safeIndex =
    chunks.length === 0 ? 0 : Math.min(Math.max(0, chunkIndex), chunks.length - 1);
  const currentChunk = chunks[safeIndex] ?? [];

  let line: string;
  if (fetchState === 'loading') {
    line = 'Chargement du palmarès…';
  } else if (fetchState === 'error') {
    line =
      'Palmarès indisponible (vérifier la migration SQL april_fool_ack ou réessayer plus tard).';
  } else if (identifiers.length === 0) {
    line =
      "Aucun identifiant dans le panneau pour l'instant — les courageux apparaîtront ici après la blague.";
  } else if (phase === 'pause') {
    line = 'Palmarès · courte pause · reprise sous peu';
  } else {
    line = `Ils sont tombés dans le panneau : ${currentChunk.join(' · ')}`;
  }

  const showPalier =
    fetchState === 'ok' &&
    identifiers.length > 0 &&
    phase === 'show' &&
    currentChunk.length > 0 &&
    chunks.length > 1;

  return (
    <div className="flex w-full items-center gap-2 overflow-hidden border-b border-amber-500/30 bg-gradient-to-r from-amber-950/50 via-slate-950/90 to-amber-950/50 px-2 py-1.5 backdrop-blur-md">
      <Radio className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" aria-hidden />
      <div className="min-w-0 flex-1 overflow-hidden py-0.5">
        <p
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-xs font-medium text-amber-100/90 sm:flex-nowrap sm:text-sm"
          title={phase === 'show' && currentChunk.length > 0 ? currentChunk.join(' · ') : undefined}
        >
          <span className="font-semibold text-amber-300/90">POISSON D&apos;AVRIL {year}</span>
          {showPalier ? (
            <span
              className="rounded border border-amber-500/25 bg-amber-950/40 px-1.5 py-0 text-[10px] font-medium tabular-nums text-amber-400/90 sm:text-[11px]"
              aria-label={`Palier ${safeIndex + 1} sur ${chunks.length}`}
            >
              Palier {safeIndex + 1}/{chunks.length}
            </span>
          ) : null}
          <span className="font-mono leading-snug sm:truncate">
            <span
              key={`${phase}-${safeIndex}-${currentChunk.join('|')}`}
              className="april-fool-ticker-line inline"
            >
              {line}
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}
