/** A single gain stage per receiver; HTML media volume itself cannot exceed 1. */
export class RadioPlayback {
  private context: AudioContext | null = null;
  private nodes = new Map<HTMLAudioElement, { source: MediaElementAudioSourceNode; gain: GainNode }>();
  attach(element: HTMLAudioElement, volume: number, boost: boolean) {
    if (boost) {
      this.context ??= new AudioContext();
      const source = this.context.createMediaElementSource(element);
      const gain = this.context.createGain();
      source.connect(gain); gain.connect(this.context.destination);
      this.nodes.set(element, { source, gain });
    }
    this.setVolume(element, volume);
  }
  setVolume(element: HTMLAudioElement, volume: number) {
    const node = this.nodes.get(element);
    element.volume = node ? 1 : Math.min(1, volume);
    if (node) node.gain.gain.value = volume;
  }
  async resume() { await this.context?.resume(); }
  async setSinkId(id: string) {
    const context = this.context as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    await context?.setSinkId?.(id);
  }
  detach(element: HTMLAudioElement) {
    const node = this.nodes.get(element);
    node?.source.disconnect(); node?.gain.disconnect(); this.nodes.delete(element);
  }
  close() {
    for (const element of this.nodes.keys()) this.detach(element);
    void this.context?.close().catch(() => {}); this.context = null;
  }
}
