/** Local receiver/sidetone sound. Never connected to the microphone or SFU. */
export class RadioSquelch {
  private context: AudioContext;
  private output: GainNode;
  private active = new Set<string>();
  private releaseTimer?: ReturnType<typeof setTimeout>;
  private receiving = false;
  private enabled = true;
  private remoteSpeakers = 0;
  private transmitting = false;
  private carrier?: { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
  private noiseBuffer?: AudioBuffer;
  private collision?: { oscillator: OscillatorNode; gain: GainNode };
  constructor(volume: number) {
    this.context = new AudioContext();
    this.output = this.context.createGain();
    this.output.gain.value = volume;
    this.output.connect(this.context.destination);
    void this.resume();
  }
  setVolume(volume: number) { this.output.gain.value = volume; }
  setEnabled(enabled: boolean) { this.enabled = enabled; this.updateCarrier(); this.updateCollision(); }
  /** Low-level receiver hiss with irregular, softened crackles under speech. */
  private updateCarrier() {
    if (!this.enabled || !this.active.size) { this.stopCarrier(); return; }
    if (this.carrier || this.context.state !== 'running') return;
    if (!this.noiseBuffer) {
      const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 7.3), this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let flutter = 0, crackle = 0, tint = 0;
      const decay = Math.exp(-1 / (this.context.sampleRate * .012));
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        flutter += (Math.random() - .5) * .002;
        flutter = Math.max(-.25, Math.min(.25, flutter));
        if (Math.random() < 2.5 / this.context.sampleRate) crackle = .3 + Math.random() * .5;
        crackle *= decay;
        tint = .96 * tint + .04 * white;
        // Fade the loop seam so a repeated buffer never introduces a click.
        const seam = Math.min(1, i / (this.context.sampleRate * .03), (data.length - 1 - i) / (this.context.sampleRate * .03));
        data[i] = (white * (.35 + flutter + crackle) + tint * .5) * seam;
      }
      this.noiseBuffer = buffer;
    }
    const source = this.context.createBufferSource(); source.buffer = this.noiseBuffer; source.loop = true;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1900; filter.Q.value = .65;
    const gain = this.context.createGain(); const now = this.context.currentTime;
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.035, now + .06);
    source.connect(filter).connect(gain).connect(this.output);
    source.start(now, Math.random() * 6);
    this.carrier = { source, filter, gain };
  }
  private stopCarrier() {
    const carrier = this.carrier; if (!carrier) return;
    this.carrier = undefined;
    const now = this.context.currentTime;
    carrier.gain.gain.cancelScheduledValues(now);
    carrier.gain.gain.setValueAtTime(carrier.gain.gain.value, now);
    carrier.gain.gain.linearRampToValueAtTime(0, now + .035);
    carrier.source.onended = () => { carrier.source.disconnect(); carrier.filter.disconnect(); carrier.gain.disconnect(); };
    carrier.source.stop(now + .04);
  }
  private updateCollision() {
    const overlapping = this.enabled && this.remoteSpeakers + Number(this.transmitting) >= 2;
    if (overlapping && !this.collision) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = 2100;
      gain.gain.setValueAtTime(0, this.context.currentTime);
      gain.gain.linearRampToValueAtTime(0.12, this.context.currentTime + 0.025);
      oscillator.connect(gain).connect(this.output);
      oscillator.start();
      this.collision = { oscillator, gain };
    } else if (!overlapping) this.stopCollision();
  }
  private stopCollision() {
    const collision = this.collision;
    if (!collision) return;
    this.collision = undefined;
    collision.gain.gain.cancelScheduledValues(this.context.currentTime);
    collision.gain.gain.setValueAtTime(collision.gain.gain.value, this.context.currentTime);
    collision.gain.gain.linearRampToValueAtTime(0, this.context.currentTime + 0.02);
    collision.oscillator.onended = () => { collision.oscillator.disconnect(); collision.gain.disconnect(); };
    collision.oscillator.stop(this.context.currentTime + 0.025);
  }
  async resume() { try { await this.context.resume(); this.updateCarrier(); } catch { /* Voice playback offers its own resume control. */ } }
  private burst(opening: boolean) {
    if (!this.enabled || this.context.state !== 'running') return;
    const duration = opening ? 0.035 + Math.random() * .02 : 0.085 + Math.random() * .035;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource(); source.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1600; filter.Q.value = 0.6;
    const envelope = this.context.createGain(); const now = this.context.currentTime;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(opening ? .075 : .1, now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(envelope).connect(this.output);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(now); source.stop(now + duration);
  }
  setTransmit(enabled: boolean) { this.transmitting = enabled; this.setActive('tx', enabled); this.updateCollision(); }
  setReceive(enabled: boolean, speakerCount = enabled ? 1 : 0) {
    this.remoteSpeakers = enabled ? Math.max(0, speakerCount) : 0;
    this.updateCollision();
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
    this.updateCarrier();
  }
  close() { clearTimeout(this.releaseTimer); this.stopCarrier(); this.stopCollision(); this.remoteSpeakers = 0; this.transmitting = false; this.active.clear(); this.output.disconnect(); void this.context.close().catch(() => {}); }
}

