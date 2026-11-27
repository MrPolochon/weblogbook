export const GROUND_IDLE_MS = 60 * 60 * 1000;

/** Persist per duty session, so refreshes and additional tabs do not reset idle time. */
export function groundIdleClock(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, now = Date.now) {
  let last = now(), expired = false, saved = 0;
  function read() {
    try {
      const value = JSON.parse(storage.getItem(key) || 'null');
      if (value?.expired === true) expired = true;
      if (Number.isFinite(value?.last) && value.last <= now()) last = Math.max(saved ? last : 0, value.last);
    } catch { /* Memory-only fallback when storage is unavailable. */ }
  }
  function write() {
    try { storage.setItem(key, JSON.stringify({ last, expired })); } catch { /* Memory-only fallback. */ }
    saved = now();
  }
  read(); write();
  function check() {
    read();
    if (!expired && now() - last >= GROUND_IDLE_MS) { expired = true; write(); }
    return expired;
  }
  return {
    check,
    activity() {
      // After sleep, an input must not revive a session whose deadline already elapsed.
      if (check()) return false;
      last = now();
      if (now() - saved >= 1000) write();
      return true;
    },
  };
}
