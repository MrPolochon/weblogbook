/** Bound network waits while preserving cancellation from the caller. */
export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error('Le service met trop de temps à répondre. Réessayez dans quelques instants.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
