'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CpdlcCommand, CpdlcInbox } from '@/lib/cpdlc/types';

export function useCpdlc(planId?: string) {
  const [data, setData] = useState<CpdlcInbox | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const retryIds = useRef(new Map<string, string>());
  const request = useRef<AbortController | null>(null);
  const endpoint = `/api/cpdlc${planId ? `?plan_id=${encodeURIComponent(planId)}` : ''}`;
  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    let timedOut = false;
    request.current = controller;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
    try {
      const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'DATALINK UNAVAILABLE');
      if (!controller.signal.aborted) { setData(result); setError(result.available === false ? result.error || 'DATALINK UNAVAILABLE' : ''); }
    } catch (reason) {
      if (timedOut) setError('CONNECTION TIMEOUT — RETRYING');
      else if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'DATALINK UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, [endpoint]);
  useEffect(() => {
    setData(null); setLoading(true);
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { clearInterval(timer); request.current?.abort(); request.current = null; };
  }, [refresh]);
  const act = useCallback(async (command: CpdlcCommand) => {
    if (pending.current) throw new Error('TRANSMISSION IN PROGRESS');
    pending.current = true; setBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    // A lost HTTP response must not duplicate a successfully delivered message.
    const retryKey = JSON.stringify({ ...command, client_request_id: undefined });
    const requestId = 'client_request_id' in command ? retryIds.current.get(retryKey) || command.client_request_id : null;
    if (requestId) retryIds.current.set(retryKey, requestId);
    try {
      const response = await fetch('/api/cpdlc', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestId ? { ...command, client_request_id: requestId } : command) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'TRANSMISSION FAILED');
      retryIds.current.delete(retryKey);
      request.current?.abort(); request.current = null;
      await refresh();
      return result as { ok: true; message_id?: string };
    } catch (reason) {
      if (controller.signal.aborted) throw new Error('TRANSMISSION TIMEOUT — RETRY TO CONFIRM DELIVERY');
      throw reason;
    } finally { clearTimeout(timeout); pending.current = false; setBusy(false); }
  }, [refresh]);
  return { data, error, loading, busy, refresh, act };
}
