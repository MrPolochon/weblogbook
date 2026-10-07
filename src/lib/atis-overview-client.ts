'use client';

import { fetchJson } from '@/lib/fetch-json';

let pending: Promise<unknown> | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

/** One request per tab, shared by the panel, ticker and warning banner. */
export function getSharedAtisOverview<T>(): Promise<T> {
  if (!pending) {
    pending = fetchJson<{ instances: unknown[]; error?: string }>('/api/atc/atis/overview', { cache: 'no-store' })
      .then((data) => {
        if (!Array.isArray(data.instances)) {
          throw new Error(data.error || 'État ATIS indisponible. Réessayez.');
        }
        return data;
      })
      .finally(() => { pending = null; });
  }
  return pending as Promise<T>;
}

function refreshVisible() {
  if (document.visibilityState === 'hidden') return;
  for (const listener of listeners) listener();
}

export function subscribeAtisPolling(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(refreshVisible, 5000);
    document.addEventListener('visibilitychange', refreshVisible);
  }
  if (document.visibilityState !== 'hidden') listener();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', refreshVisible);
    }
  };
}
