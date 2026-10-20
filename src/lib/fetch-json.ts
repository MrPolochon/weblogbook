export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.redirected && response.url && new URL(response.url).pathname === '/login') {
      throw new Error('Votre session a expiré. Reconnectez-vous pour continuer.');
    }
    const data = await response.json().catch(() => {
      throw new Error('Réponse du serveur illisible. Réessayez.');
    });
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Chargement impossible. Réessayez.');
    return data as T;
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener('abort', abort);
  }
}
