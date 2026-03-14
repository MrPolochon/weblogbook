/**
 * Sons du téléphone ATC/SIAVI — réutilisés par le BRIA et les téléphones.
 * iOS : AudioContext doit être débloqué par un geste utilisateur (clic/touch).
 */

let sharedCtx: AudioContext | null = null;

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext || null;
}

/** À appeler dans un gestionnaire de clic/touch (ex: ouverture BRIA) pour débloquer l'audio sur iOS */
export function unlockAudioForIOS(): void {
  if (typeof window === 'undefined') return;
  const AC = getAudioContextClass();
  if (!AC) return;
  try {
    if (!sharedCtx) {
      sharedCtx = new AC();
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume();
    }
  } catch { /* ignore */ }
}

function getAudioContext(): AudioContext | null {
  const AC = getAudioContextClass();
  if (!AC) return null;
  try {
    if (sharedCtx && sharedCtx.state !== 'closed') {
      if (sharedCtx.state === 'suspended') void sharedCtx.resume();
      return sharedCtx;
    }
    const ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Sonnerie (ring) — même son que téléphone ATC/SIAVI */
export function playPhoneRing(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 500);
  } catch { /* ignore */ }
}

/** Raccrochage (end) — même son que téléphone ATC/SIAVI */
export function playPhoneEnd(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 480;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close(), 500);
  } catch { /* ignore */ }
}
