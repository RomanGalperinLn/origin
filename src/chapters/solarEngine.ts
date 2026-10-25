// Main-thread side of chapter 4's accretion simulation. Created at page load so the
// run is ready before the story reaches it. Simulation steps are spread evenly over
// the chapter's span (time compressed).

import type { Mode } from '../control/controlMode';
import { makeSolarParams, type SolarParams } from '../solar/params';
import type { SolarMetrics } from '../solar/nbody';
import type { FromSolar, ToSolar } from '../solar/protocol';

export type SolarFrame = Extract<FromSolar, { type: 'frame' }>;

export class SolarEngine {
  readonly params: SolarParams = makeSolarParams();
  headStep = 0;
  readonly history: SolarMetrics[] = [];
  /** Earth's body index once the run is complete (-1 before). */
  earth = -1;
  earthInZone = true;
  onMetrics: ((samples: SolarMetrics[]) => void) | null = null;
  onFrame: ((f: SolarFrame) => void) | null = null;

  private worker = new Worker(new URL('../solar/solarWorker.ts', import.meta.url), { type: 'module' });
  private runId = 1;
  private frameInFlight = false;
  private lastRequest = -1;

  /** tStart / tEnd: the chapter's span in years since the Big Bang. */
  constructor(
    readonly tStart: number,
    readonly tEnd: number,
    readonly mode: Mode = 'released',
  ) {
    this.worker.onmessage = (e: MessageEvent<FromSolar>) => this.receive(e.data);
    const init: ToSolar = { type: 'init', runId: this.runId, params: this.params };
    this.worker.postMessage(init);
  }

  private receive(msg: FromSolar): void {
    if (msg.type === 'frame') this.frameInFlight = false;
    if (msg.runId !== this.runId) return;
    if (msg.type === 'metrics') {
      this.headStep = msg.headStep;
      this.earth = msg.earth;
      this.earthInZone = msg.earthInZone;
      this.history.push(...msg.samples);
      this.onMetrics?.(msg.samples);
    } else this.onFrame?.(msg);
  }

  get done(): boolean {
    return this.headStep >= this.params.steps;
  }

  /** Simulation step shown at time t. */
  stepAt(t: number): number {
    const f = (t - this.tStart) / (this.tEnd - this.tStart);
    return Math.max(0, Math.min(this.params.steps, Math.round(f * this.params.steps)));
  }

  /** Time (years since the Big Bang) of a step. */
  timeAt(step: number): number {
    return this.tStart + (step / this.params.steps) * (this.tEnd - this.tStart);
  }

  /**
   * Requests the exact state at `step` (one request in flight at a time; repeats are skipped).
   * Returns false if the request was not sent.
   */
  requestFrame(step: number, force = false): boolean {
    step = Math.min(step, this.headStep);
    if (this.frameInFlight) return false;
    if (!force && step === this.lastRequest) return false;
    this.frameInFlight = true;
    this.lastRequest = step;
    const msg: ToSolar = { type: 'frame', step };
    this.worker.postMessage(msg);
    return true;
  }

  /** Metric sample at or before `step`. */
  metricAt(step: number): SolarMetrics | undefined {
    const h = this.history;
    return h[Math.min(h.length - 1, Math.floor(step / this.params.metricsEvery))];
  }
}
