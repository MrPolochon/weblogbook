/** Local receiver/sidetone sound. Never connected to the microphone or SFU. */
export class RadioSquelch {
  private context: AudioContext;
  private output: GainNode;
  private active = new Set<string>();
  private releaseTimer?: ReturnType<typeof setTimeout>;
  private receiving = false;
  private enabled = true;
  constructor(volume: number) {
    this.context = new AudioContext();
    this.output = this.context.createGain();
    this.output.gain.value = volume;
    this.output.connect(this.context.destination);
    void this.resume();
  }
  setVolume(volume: number) { this.output.gain.value = volume; }
  setEnabled(enabled: boolean) { this.enabled = enabled; }
  async resume() { try { await this.context.resume(); } catch { /* Voice playback offers its own resume control. */ } }
  private burst(opening: boolean) {
    if (!this.enabled || this.context.state !== 'running') return;
    const duration = opening ? 0.075 : 0.13;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource(); source.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1600; filter.Q.value = 0.6;
    const envelope = this.context.createGain(); const now = this.context.currentTime;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.14, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(envelope).connect(this.output);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(now); source.stop(now + duration);
  }
  setTransmit(enabled: boolean) { this.setActive('tx', enabled); }
  setReceive(enabled: boolean) {
    clearTimeout(this.releaseTimer);
    if (enabled) { this.receiving = true; this.setActive('rx', true); }
    else if (this.receiving) this.releaseTimer = setTimeout(() => {
      this.receiving = false; this.setActive('rx', false);
    }, 400); // Do not close squelch between words.
  }
  private setActive(source: string, enabled: boolean) {
    const before = this.active.size > 0;
    if (enabled) this.active.add(source); else this.active.delete(source);
    const after = this.active.size > 0;
    if (before !== after) this.burst(after);
  }
  close() { clearTimeout(this.releaseTimer); this.active.clear(); this.output.disconnect(); void this.context.close().catch(() => {}); }
}
