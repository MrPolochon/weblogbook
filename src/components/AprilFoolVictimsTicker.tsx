'use client';

import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { getParisCalendarYear } from '@/lib/paris-date';

const CHUNK_SIZE = 5;
const CHUNK_INTERVAL_MS = 60_000;
const POLL_MS = 45_000;
const SCROLL_SEC = 50;

export default function AprilFoolVictimsTicker() {
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [chunkIndex, setChunkIndex] = useState(0);
  const year = getParisCalendarYear();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/april-fool/victims?year=${year}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.identifiers)) {
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
        /* table absente ou réseau */
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

  useEffect(() => {
    if (chunks.length <= 1) return;
    const t = setInterval(() => {
      setChunkIndex((i) => (i + 1) % chunks.length);
    }, CHUNK_INTERVAL_MS);
    return () => clearInterval(t);
  }, [chunks.length]);

  useEffect(() => {
    setChunkIndex(0);
  }, [identifiers]);

  if (identifiers.length === 0) return null;

  const chunk = chunks[chunkIndex % chunks.length] ?? [];
  const line = `Ils sont tombés dans le panneau : ${chunk.join(' · ')}`;

  return (
    <div className="flex items-center gap-2 overflow-hidden border-b border-amber-500/30 bg-gradient-to-r from-amber-950/50 via-slate-950/90 to-amber-950/50 px-2 py-1.5 backdrop-blur-md">
      <Radio className="h-4 w-4 shrink-0 text-amber-400 animate-pulse" aria-hidden />
      <div className="min-w-0 flex-1 overflow-hidden py-0.5">
        <div
          className="inline-block whitespace-nowrap"
          style={{ animation: `scroll-left ${SCROLL_SEC}s linear infinite` }}
        >
          <span className="text-xs font-medium tracking-wide text-amber-100/90 sm:text-sm">
            <span className="font-semibold text-amber-300/90">POISSON D&apos;AVRIL {year}</span>
            {' — '}
            <span className="font-mono">{line}</span>
          </span>
          <span className="mx-8 text-amber-500/60">•</span>
          <span className="text-xs font-medium tracking-wide text-amber-100/90 sm:text-sm">
            <span className="font-semibold text-amber-300/90">POISSON D&apos;AVRIL {year}</span>
            {' — '}
            <span className="font-mono">{line}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
