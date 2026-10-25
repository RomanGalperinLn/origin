// An optional ambient hum for chapter 6 (muted by default): two soft low tones whose volume
// follows a level from 0 to 1 (the driven run's entropy production rate). Decoration only.

export class AmbientHum {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;

  get on(): boolean {
    return this.ctx !== null;
  }

  start(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    for (const [freq, type, level] of [
      [55, 'sine', 1],
      [82.5, 'triangle', 0.35],
      [110.4, 'sine', 0.25],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(filter);
      o.start();
    }
    filter.connect(gain).connect(ctx.destination);
    this.ctx = ctx;
    this.gain = gain;
  }

  /** Level 0..1, smoothed. */
  setLevel(level: number): void {
    if (!this.ctx || !this.gain) return;
    const target = 0.015 + 0.07 * Math.max(0, Math.min(1, level));
    this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
  }

  stop(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
  }
}
