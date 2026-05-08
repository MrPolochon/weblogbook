export const BRIA_COOLDOWN_KEY = 'bria_cooldown_until';

export function getBriaCooldownRemaining(): number {
  if (typeof window === 'undefined') return 0;
  const until = parseInt(localStorage.getItem(BRIA_COOLDOWN_KEY) || '0', 10);
  return Math.max(0, until - Date.now());
}

export function setBriaCooldown(): void {
  if (typeof window === 'undefined') return;
  const minMs = 60 * 1000;
  const maxMs = 5 * 60 * 1000;
  const duration = minMs + Math.floor(Math.random() * (maxMs - minMs));
  localStorage.setItem(BRIA_COOLDOWN_KEY, String(Date.now() + duration));
}
