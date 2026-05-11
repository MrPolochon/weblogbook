const rateMap = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  rateMap.forEach((entry, key) => {
    if (entry.resetAt < now) rateMap.delete(key);
  });
}

/**
 * In-memory rate limiter (per-process). Sufficient for single-instance deployments.
 * For multi-instance, use Redis-based rate limiting.
 *
 * @param key - Unique identifier (e.g. IP + route)
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns { allowed, remaining, resetAt }
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();
  const now = Date.now();
  const entry = rateMap.get(key);

  if (!entry || entry.resetAt < now) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { allowed: entry.count <= maxRequests, remaining, resetAt: entry.resetAt };
}

/**
 * Presets reutilisables pour les routes API.
 * Garde la compatibilite avec rateLimit() existant : applique le rate limit
 * en derivant la cle depuis l'IP du requester + le nom du preset.
 */
const RATE_LIMIT_PRESETS = {
  auth: { requests: 5, windowMs: 60_000 },
  messages: { requests: 20, windowMs: 60_000 },
  'livekit-token': { requests: 3, windowMs: 60_000 },
  notifications: { requests: 30, windowMs: 60_000 },
  notams: { requests: 30, windowMs: 60_000 },
  default: { requests: 60, windowMs: 60_000 },
} as const;

export type RateLimitPreset = keyof typeof RATE_LIMIT_PRESETS;

function getRequestIp(req: Request | { headers: Headers }): string {
  const h = req.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  return h.get('x-real-ip') || 'unknown';
}

export function applyRateLimit(
  req: Request | { headers: Headers },
  preset: RateLimitPreset = 'default',
  scopeKey?: string
) {
  const cfg = RATE_LIMIT_PRESETS[preset];
  const key = `${preset}:${scopeKey ?? getRequestIp(req)}`;
  return rateLimit(key, cfg.requests, cfg.windowMs);
}
