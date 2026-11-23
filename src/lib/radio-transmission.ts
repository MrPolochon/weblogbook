export type RadioMicMode = 'muted' | 'ptt' | 'open';

/** Synchronous gate, independent of network requests or SDK mute promises. */
export class RadioTransmission {
  mode: RadioMicMode = 'muted';
  ready = false;
  private held = new Set<string>();

  constructor(private apply: (enabled: boolean) => void) {}

  get transmitting() {
    return this.ready && (this.mode === 'open' || (this.mode === 'ptt' && this.held.size > 0));
  }

  setMode(mode: RadioMicMode) {
    this.mode = mode;
    this.held.clear();
    this.flush();
  }

  setReady(ready: boolean) {
    this.ready = ready;
    if (!ready) this.held.clear();
    this.flush();
  }

  press(source: string) {
    if (this.ready && this.mode === 'ptt') this.held.add(source);
    this.flush();
  }

  release(source: string) {
    this.held.delete(source);
    this.flush();
  }

  releaseAll() {
    this.held.clear();
    this.flush();
  }

  reset() {
    this.mode = 'muted';
    this.ready = false;
    this.held.clear();
    this.flush();
  }

  private flush() { this.apply(this.transmitting); }
}

export function isRadioTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
}
