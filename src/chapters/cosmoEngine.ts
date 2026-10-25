// Main-thread side of the cosmic-web simulation, shared by chapter 1 (which draws
// the ripple field as the CMB) and chapter 2 (gravity). Created at page load so the
// field and the run are ready before the story reaches them.

import { makeCosmoParams, type CosmoParams } from '../cosmo/params';
import { stepSize, type CosmoMetrics } from '../cosmo/pm';
import type { CosmoRun, FromCosmo, ToCosmo } from '../cosmo/protocol';

export type CosmoFrame = Extract<FromCosmo, { type: 'frame' }>;

export class CosmoEngine {
  readonly params: CosmoParams;
  field: Float32Array | null = null;
  headStep = 0;
  readonly history: Record<CosmoRun, CosmoMetrics[]> = { ripples: [], smooth: [] };
  onMetrics: ((ripples: CosmoMetrics[], smooth: CosmoMetrics[]) => void) | null = null;
  onFrame: ((f: CosmoFrame) => void) | null = null;

  private worker = new Worker(new URL('../cosmo/cosmoWorker.ts', import.meta.url), { type: 'module' });
  private runId = 1;
  private frameInFlight = false;
  private lastRequest = { step: -1, run: 'ripples' as CosmoRun };

  /** tStart / tEnd: chapter 2's span in years since the Big Bang (a = 1 at tStart, a ∝ t^(2/3)). */
  constructor(tStart: number, tEnd: number, seed: number) {
    this.params = makeCosmoParams({ seed, tStart, aFinal: Math.pow(tEnd / tStart, 2 / 3) });
    this.worker.onmessage = (e: MessageEvent<FromCosmo>) => this.receive(e.data);
    const init: ToCosmo = { type: 'init', runId: this.runId, params: this.params };
    this.worker.postMessage(init);
  }

  private receive(msg: FromCosmo): void {
    if (msg.type === 'frame') this.frameInFlight = false;
    if (msg.runId !== this.runId) return;
    if (msg.type === 'field') this.field = msg.delta;
    else if (msg.type === 'metrics') {
      this.headStep = msg.headStep;
      this.history.ripples.push(...msg.ripples);
      this.history.smooth.push(...msg.smooth);
      this.onMetrics?.(msg.ripples, msg.smooth);
    } else if (msg.type === 'frame') this.onFrame?.(msg);
  }

  /** Simulation step shown at time t (uniform in ln a). */
  stepAt(t: number): number {
    const a = Math.pow(Math.max(t, this.params.tStart) / this.params.tStart, 2 / 3);
    return Math.max(0, Math.min(this.params.steps, Math.round(Math.log(a) / stepSize(this.params))));
  }

  /** Time (years since the Big Bang) of a step. */
  timeAt(step: number): number {
    return this.params.tStart * Math.exp(1.5 * step * stepSize(this.params));
  }

  /**
   * Requests the exact state at `step` (one request in flight at a time; repeats are skipped).
   * Returns false if the request was not sent.
   */
  requestFrame(step: number, run: CosmoRun, force = false): boolean {
    step = Math.min(step, this.headStep);
    if (this.frameInFlight) return false;
    if (!force && step === this.lastRequest.step && run === this.lastRequest.run) return false;
    this.frameInFlight = true;
    this.lastRequest = { step, run };
    const msg: ToCosmo = { type: 'frame', step, run };
    this.worker.postMessage(msg);
    return true;
  }

  /** Metric sample at or before `step`. */
  metricAt(run: CosmoRun, step: number): CosmoMetrics | undefined {
    const h = this.history[run];
    return h[Math.min(h.length - 1, Math.floor(step / this.params.metricsEvery))];
  }
}
