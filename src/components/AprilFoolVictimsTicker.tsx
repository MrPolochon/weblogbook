'use client';

import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { getParisCalendarYear } from '@/lib/paris-date';

const CHUNK_SIZE = 5;
const POLL_MS = 45_000;
const SCROLL_SEC = 50;
/** Temps d’affichage d’un bloc avant de passer au suivant (identifiants toujours différents). */
const CHUNK_SHOW_MS = 50_000;
/** Entre la fin du dernier bloc et le retour au premier : pas de répétition immédiate du même groupe. */
const CYCLE_PAUSE_MS = 60_000;

export default function AprilFoolVictimsTicker() {
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [fetchState, setFetchState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [chunkIndex, setChunkIndex] = useState(0);
  const [phase, setPhase] = useState<'show' | 'pause'>('show');
  const year = getParisCalendarYear();

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

  const chunksKey = identifiers.join('\0');

  useEffect(() => {
    setChunkIndex(0);
    setPhase('show');
  }, [chunksKey]);

  useEffect(() => {
    if (fetchState !== 'ok' || chunks.length === 0) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const loop = (index: number, afterCyclePause: boolean) => {
      if (cancelled) return;

      if (afterCyclePause) {
        setPhase('pause');
        timeoutId = setTimeout(() => {
          if (cancelled) return;
          setPhase('show');
          setChunkIndex(0);
          loop(0, false);
        }, CYCLE_PAUSE_MS);
        return;
      }

      setPhase('show');
      setChunkIndex(index);

      timeoutId = setTimeout(() => {
        if (cancelled) return;
        const next = index + 1;
        if (next >= chunks.length) {
          loop(0, true);
        } else {
          loop(next, false);
        }
      }, CHUNK_SHOW_MS);
    };

    loop(0, false);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [fetchState, chunks.length, chunksKey]);

  const currentChunk = chunks[chunkIndex] ?? [];

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
    line =
      'Pause palmarès — les mêmes blocs ne se répètent pas tout de suite · reprise dans une minute…';
  } else {
    line = `Ils sont tombés dans le panneau : ${currentChunk.join(' · ')}`;
  }

  const useMarquee =
    fetchState === 'ok' && identifiers.length > 0 && phase === 'show' && currentChunk.length > 0;

  /** Une ligne dupliquée pour l’animation -50 % ; un seul bloc de noms à la fois. */
  const marqueeLine = useMemo(
    () => (
      <span className="text-xs font-medium tracking-wide text-amber-100/90 sm:text-sm">
        <span className="font-semibold text-amber-300/90">POISSON D&apos;AVRIL {year}</span>
        {' — '}
        <span className="font-mono">{`Ils sont tombés dans le panneau : ${currentChunk.join(' · ')}`}</span>
        <span className="mx-6 text-amber-500/60">•</span>
      </span>
    ),
    [currentChunk, year],
  );

  return (
    <div className="flex w-full items-center gap-2 overflow-hidden border-b border-amber-500/30 bg-gradient-to-r from-amber-950/50 via-slate-950/90 to-amber-950/50 px-2 py-1.5 backdrop-blur-md">
      <Radio className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" aria-hidden />
      <div className="min-w-0 flex-1 overflow-hidden py-0.5">
        {useMarquee ? (
          <div
            key={`marquee-${chunkIndex}-${currentChunk.join('|')}`}
            className="flex w-max whitespace-nowrap"
            style={{ animation: `april-fool-scroll ${SCROLL_SEC}s linear infinite` }}
          >
            <div className="flex w-max shrink-0 whitespace-nowrap">{marqueeLine}</div>
            <div className="flex w-max shrink-0 whitespace-nowrap" aria-hidden>
              {marqueeLine}
            </div>
          </div>
        ) : (
          <p className="text-center text-xs font-medium text-amber-100/90 sm:text-sm">
            <span className="font-semibold text-amber-300/90">POISSON D&apos;AVRIL {year}</span>
            {' — '}
            <span className="font-mono">{line}</span>
          </p>
        )}
      </div>
    </div>
  );
}
