// Winston: narrates the run every ~8 s while playing and on major events,
// answers spoken or typed questions, and never talks over himself.
// Any API failure degrades to text-only or silence; the simulation never waits on it.

import type { SimParams } from '../sim/params';
import type { MetricSample } from '../sim/metrics';

export interface WinstonSource {
  history: () => { driven: MetricSample[]; control: MetricSample[] };
  params: () => SimParams;
  step: () => number;
  playing: () => boolean;
  /** Winston only narrates while this is true (the origin-of-life chapter is on screen). */
  active: () => boolean;
}

const NARRATE_EVERY_MS = 8000;
const MIN_GAP_MS = 4000; // even major events wait this long after the last line
const CLIENT_TIMEOUT_MS = 8000; // server has its own 6 s timeout per upstream call
const ORDER_THRESHOLDS = [0.75, 0.8, 0.85, 0.9];
const CLUSTERED_THRESHOLD = 0.3;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function postJSON(url: string, body: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const round = (v: number, sig = 3) => (v === 0 || !Number.isFinite(v) ? 0 : Number(v.toPrecision(sig)));

export class Winston {
  enabled = true;
  private ttsAvailable = false;
  private busy = false; // a request or speech is in progress
  private pendingEvents: string[] = [];
  private wantNarration = false;
  private lastSpokeAt = 0;
  private lastNarratedStep = 0;
  private lastSeenStep = 0;
  private firedThresholds = new Set<string>();
  private lastEntropyTrend: 'rising' | 'falling' | null = null;
  private audio: HTMLAudioElement | null = null;
  private subtitleTimer = 0;
  private recognition: any = null;
  /** Bumped on deactivate so replies to stale requests are dropped. */
  private generation = 0;

  constructor(private src: WinstonSource) {
    const toggle = $<HTMLInputElement>('winston-on');
    toggle.addEventListener('change', () => this.setEnabled(toggle.checked));
    $('winston-ask-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('winston-question');
      const q = input.value.trim();
      input.value = '';
      if (q) this.ask(q);
    });
    this.setupMic();
    this.checkHealth();
    setInterval(() => this.tick(), 500);
  }

  /** Clears event state for a fresh run (preset change). */
  reset(): void {
    this.firedThresholds.clear();
    this.lastEntropyTrend = null;
    this.lastNarratedStep = 0;
    this.lastSeenStep = 0;
    this.pendingEvents = [];
  }

  /** The narrated chapter left the screen: stop talking and forget queued events. */
  deactivate(): void {
    this.generation++;
    this.stopSpeech();
    this.pendingEvents = [];
    this.wantNarration = false;
    this.showSubtitle('', 0);
  }

  /** Events raised by the page (reverse time pressed, etc.). Major events narrate as soon as possible. */
  event(text: string, major = true): void {
    if (!this.enabled) return;
    this.pendingEvents.push(text);
    if (major) this.wantNarration = true;
  }

  private setEnabled(on: boolean): void {
    this.enabled = on;
    $<HTMLInputElement>('winston-on').checked = on;
    if (!on) {
      this.stopSpeech();
      this.pendingEvents = [];
      this.wantNarration = false;
      this.showSubtitle('', 0);
    }
    this.setStatus(on ? '' : 'off');
  }

  private async checkHealth(): Promise<void> {
    try {
      const res = await fetch('/api/health');
      const h = (await res.json()) as { gemini: boolean; tts: boolean };
      this.ttsAvailable = h.tts;
      if (!h.gemini) {
        this.setEnabled(false);
        this.setStatus('no Gemini key on server');
      } else if (!h.tts) {
        this.setStatus('text only (no voice key)');
      }
    } catch {
      this.setEnabled(false);
      this.setStatus('server offline');
    }
  }

  private setStatus(s: string): void {
    $('winston-status').textContent = s;
  }

  // ---------------------------------------------------------------------------
  // Event detection: scan the metric samples the audience has just watched.

  private tick(): void {
    if (!this.enabled || !this.src.active()) return;
    const step = this.src.step();
    const { driven, control } = this.src.history();
    const every = this.src.params().metricsEvery;

    if (step < this.lastSeenStep - 500) {
      this.event(`The audience rewound time from step ${this.lastSeenStep} to step ${step}.`);
    } else if (step > this.lastSeenStep) {
      const from = Math.floor(this.lastSeenStep / every) + 1;
      const to = Math.min(driven.length - 1, Math.floor(step / every));
      for (let i = from; i <= to; i++) this.detect(driven[i], control[i]);
    }
    this.lastSeenStep = step;

    const now = performance.now();
    const due = this.src.playing() && now - this.lastSpokeAt > NARRATE_EVERY_MS;
    if (!this.busy && now - this.lastSpokeAt > MIN_GAP_MS && (due || this.wantNarration)) this.narrate();
  }

  private detect(d: MetricSample, c: MetricSample | undefined): void {
    if (!d) return;
    if (!this.firedThresholds.has('clustered') && d.fracClustered >= CLUSTERED_THRESHOLD) {
      this.firedThresholds.add('clustered');
      this.event(`First substantial structures in the driven run: ${Math.round(100 * d.fracClustered)}% of particles are now in clusters (step ${d.step}).`);
    }
    for (const t of ORDER_THRESHOLDS) {
      const key = `order${t}`;
      if (!this.firedThresholds.has(key) && d.order >= t) {
        this.firedThresholds.add(key);
        this.event(`Driven order crossed ${t} at step ${d.step}; control order is ${c ? c.order.toFixed(3) : 'unknown'}.`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Context sent to the model: only numbers the page actually has.

  private summarize(arr: MetricSample[], step: number): Record<string, number> | null {
    const every = this.src.params().metricsEvery;
    const i = Math.min(arr.length - 1, Math.floor(step / every));
    if (i < 0) return null;
    const m = arr[i];
    const p = this.src.params();
    const window = Math.max(1, Math.round(p.period / (p.dt * every)));
    let w = 0;
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - window + 1); k <= i; k++, n++) {
      w += arr[k].W_dot;
      s += arr[k].S_dot;
    }
    return {
      step: m.step,
      order: round(m.order),
      clusters: m.nClusters,
      meanClusterSize: round(m.meanClusterSize),
      largestCluster: m.largestCluster,
      fractionClustered: round(m.fracClustered, 2),
      energyAbsorbed: round(w / n),
      entropyRate: round(s / n),
      totalEntropyProduced: round(m.S),
    };
  }

  private context(): Record<string, unknown> {
    const step = this.src.step();
    const p = this.src.params();
    const { driven, control } = this.src.history();
    const since = this.lastNarratedStep < step ? this.lastNarratedStep : Math.floor(step / 2);
    const dNow = this.summarize(driven, step);
    const dBefore = this.summarize(driven, Math.max(0, step - 2 * Math.round(p.period / p.dt)));
    if (dNow && dBefore) {
      // Ignore wobbles: only a >10% change over two field periods counts as a trend.
      const ratio = dNow.entropyRate / (dBefore.entropyRate || 1);
      const trend = ratio > 1.1 ? 'rising' : ratio < 0.9 ? 'falling' : null;
      if (trend && this.lastEntropyTrend && trend !== this.lastEntropyTrend)
        this.pendingEvents.push(`The driven run's entropy production rate is now ${trend} (was ${this.lastEntropyTrend}).`);
      if (trend) this.lastEntropyTrend = trend;
    }
    return {
      step,
      time: Math.round(step * p.dt),
      playing: this.src.playing(),
      fieldPeriod: p.period,
      driven: { now: dNow, atLastNarration: this.summarize(driven, since) },
      control: { now: this.summarize(control, step), atLastNarration: this.summarize(control, since) },
      events: this.pendingEvents.slice(-6),
    };
  }

  // ---------------------------------------------------------------------------

  private async narrate(): Promise<void> {
    this.busy = true;
    this.wantNarration = false;
    const gen = this.generation;
    const context = this.context();
    this.pendingEvents = [];
    this.lastNarratedStep = this.src.step();
    this.lastSpokeAt = performance.now();
    try {
      const res = await postJSON('/api/narrate', { context });
      if (!res.ok) throw new Error(`narrate ${res.status}`);
      const { text } = (await res.json()) as { text: string };
      if (this.enabled && gen === this.generation && this.src.active()) await this.say(text);
    } catch (e) {
      console.warn('[winston] narration skipped:', (e as Error).message);
    } finally {
      this.busy = false;
      this.lastSpokeAt = performance.now();
    }
  }

  async ask(question: string): Promise<void> {
    if (!this.enabled) this.setEnabled(true);
    this.stopSpeech();
    this.busy = true;
    this.showSubtitle(`You: “${question}”`, 0);
    try {
      const res = await postJSON('/api/ask', { question, context: this.context() });
      if (!res.ok) throw new Error(`ask ${res.status}`);
      const { text } = (await res.json()) as { text: string };
      await this.say(text);
    } catch (e) {
      console.warn('[winston] question failed:', (e as Error).message);
      this.showSubtitle('Winston could not answer just now (connection problem).', 4000);
    } finally {
      this.busy = false;
      this.lastSpokeAt = performance.now();
    }
  }

  /** Shows the subtitle and plays the voice if available. Resolves when finished. */
  private async say(text: string): Promise<void> {
    // Deactivation (leaving chapter 6) bumps the generation: after every wait, a stale line is dropped.
    const gen = this.generation;
    const stale = () => gen !== this.generation;
    const readingMs = 1500 + text.split(/\s+/).length * 350;
    this.showSubtitle(text, 0);
    if (this.ttsAvailable) {
      try {
        const res = await postJSON('/api/tts', { text });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        const blob = await res.blob();
        if (stale()) return;
        const url = URL.createObjectURL(blob);
        await this.play(url);
        URL.revokeObjectURL(url);
        if (!stale()) this.showSubtitle(text, 2500);
        return;
      } catch (e) {
        console.warn('[winston] voice skipped:', (e as Error).message);
      }
    }
    // Text only: hold the floor for about as long as it takes to read.
    await new Promise((r) => setTimeout(r, readingMs));
    if (!stale()) this.showSubtitle(text, 2500);
  }

  private play(url: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      this.audio = audio;
      const done = () => {
        if (this.audio === audio) this.audio = null;
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.onpause = done; // stopSpeech() pauses
      audio.play().catch(done); // e.g. autoplay blocked before any click
    });
  }

  private stopSpeech(): void {
    this.audio?.pause();
    this.audio = null;
  }

  /** Shows text; clears it after `hideAfterMs` (0 = keep). */
  private showSubtitle(text: string, hideAfterMs: number): void {
    clearTimeout(this.subtitleTimer);
    const el = $('winston-text');
    if (hideAfterMs > 0) {
      this.subtitleTimer = window.setTimeout(() => el.classList.add('faded'), hideAfterMs);
    }
    if (text) {
      el.textContent = text;
      el.classList.remove('faded');
    } else el.classList.add('faded');
  }

  // ---------------------------------------------------------------------------
  // Voice questions via the Web Speech API (Chrome). Falls back to the text box.

  private setupMic(): void {
    const btn = $<HTMLButtonElement>('winston-mic');
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      btn.hidden = true;
      return;
    }
    btn.addEventListener('click', () => {
      if (this.recognition) {
        this.recognition.stop();
        return;
      }
      const rec = new SR();
      rec.lang = 'en-GB';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      this.recognition = rec;
      btn.classList.add('listening');
      btn.textContent = '● Listening…';
      this.stopSpeech();
      rec.onresult = (e: any) => {
        const q = e.results?.[0]?.[0]?.transcript ?? '';
        if (q) this.ask(q);
      };
      const end = () => {
        this.recognition = null;
        btn.classList.remove('listening');
        btn.textContent = '🎤 Ask Winston';
      };
      rec.onend = end;
      rec.onerror = (e: any) => {
        console.warn('[winston] mic:', e.error);
        end();
      };
      rec.start();
    });
  }
}
