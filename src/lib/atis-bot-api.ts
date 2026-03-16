/**
 * Client pour appeler l'API du bot ATIS (ATISVoiceMaker)
 */

const getBotUrl = () => process.env.ATIS_WEBHOOK_URL?.replace(/\/$/, '');
const getSecret = () => process.env.ATIS_WEBHOOK_SECRET;

const headers = () => ({
  Authorization: `Bearer ${getSecret()}`,
  'X-ATIS-Secret': getSecret() ?? '',
  'Content-Type': 'application/json',
});

export async function fetchAtisBot<T>(
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<{ data?: T; error?: string; status: number }> {
  const url = getBotUrl();
  if (!url || !getSecret()) {
    return { error: 'Bot ATIS non configuré', status: 503 };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45s pour cold start Render
    const res = await fetch(`${url}${path}`, {
      method: options?.method ?? 'GET',
      headers: headers(),
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || (res.status === 401 ? 'Secret incorrect (ATIS_WEBHOOK_SECRET)' : res.status === 503 ? 'Bot non prêt ou webhook non configuré' : `Erreur ${res.status}`);
      return { error: msg, status: res.status };
    }
    return { data, status: res.status };
  } catch (e) {
    console.error('ATIS bot fetch:', e);
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    return { error: isTimeout ? 'Délai dépassé (le bot Render démarre peut-être, réessayez dans 1 min)' : 'Erreur de connexion au bot', status: 500 };
  }
}
