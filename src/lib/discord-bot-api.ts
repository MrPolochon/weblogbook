const getBotUrl = () => process.env.ATIS_WEBHOOK_URL?.replace(/\/$/, '');
const getBotSecret = () => process.env.ATIS_WEBHOOK_SECRET;

function getHeaders() {
  return {
    Authorization: `Bearer ${getBotSecret()}`,
    'X-ATIS-Secret': getBotSecret() ?? '',
    'Content-Type': 'application/json',
  };
}

export async function fetchDiscordBot<T>(
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<{ data?: T; error?: string; status: number }> {
  const url = getBotUrl();
  const secret = getBotSecret();
  if (!url || !secret) {
    return { error: 'Bot Discord non configuré', status: 503 };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${url}${path}`, {
      method: options?.method ?? 'GET',
      headers: getHeaders(),
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data?.error || `Erreur ${res.status}`, status: res.status };
    }
    return { data, status: res.status };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return {
      error: isTimeout ? 'Délai dépassé lors de la requête au bot Discord' : 'Erreur de connexion au bot Discord',
      status: 500,
    };
  }
}
