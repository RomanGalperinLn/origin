// Main-thread side of chapter 7's evolution model. Created at page load so the run is
// ready (it takes a few seconds) before the story reaches it.

import { paramsFor, type Mode } from '../control/controlMode';
import { makeEvoParams, type EvoParams } from '../evo/params';
import { evoSchedule, evoStepAt, evoTimeAt } from '../evo/schedule';
import type { EvoRun, FromEvo, ToEvo } from '../evo/protocol';
import type { EvoMetrics, SpeciesNode } from '../evo/world';

export type EvoFrame = Extract<FromEvo, { type: 'frame' }>;

export class EvoEngine {
  readonly params: EvoParams;
  headStep = 0;
  tree: SpeciesNode[] = [];
  readonly history: Record<EvoRun, EvoMetrics[]> = { oxygen: [], control: [] };
  onMetrics: ((oxygen: EvoMetrics[], control: EvoMetrics[]) => void) | null = null;
  onFrame: ((f: EvoFrame) => void) | null = null;

  private worker = new Worker(new URL('../evo/evoWorker.ts', import.meta.url), { type: 'module' });
  private runId = 1;
  private frameInFlight = false;
  private lastRequest = { step: -1, run: 'oxygen' as EvoRun };

  constructor(
    seed: number,
    readonly mode: Mode = 'released',
  ) {
    const base = makeEvoParams({ seed });
    this.params = paramsFor('evolution', mode, { ...base, schedule: evoSchedule(base.steps) });
    this.worker.onmessage = (e: MessageEvent<FromEvo>) => this.receive(e.data);
    const init: ToEvo = { type: 'init', runId: this.runId, params: this.params };
    this.worker.postMessage(init);
  }

  private receive(msg: FromEvo): void {
    if (msg.type === 'frame') this.frameInFlight = false;
    if (msg.runId !== this.runId) return;
    if (msg.type === 'metrics') {
      this.headStep = msg.headStep;
      this.tree = msg.tree;
      this.history.oxygen.push(...msg.oxygen);
      this.history.control.push(...msg.control);
      this.onMetrics?.(msg.oxygen, msg.control);
    } else this.onFrame?.(msg);
  }

  stepAt(t: number): number {
    return evoStepAt(t, this.params.steps);
  }

  timeAt(step: number): number {
    return evoTimeAt(step, this.params.steps);
  }

  /** Requests the exact state at `step`. Returns false if not sent (one in flight, or a repeat). */
  requestFrame(step: number, run: EvoRun, force = false): boolean {
    step = Math.min(step, this.headStep);
    if (this.frameInFlight) return false;
    if (!force && step === this.lastRequest.step && run === this.lastRequest.run) return false;
    this.frameInFlight = true;
    this.lastRequest = { step, run };
    const msg: ToEvo = { type: 'frame', step, run };
    this.worker.postMessage(msg);
    return true;
  }

  /** Metric sample at or before `step`. */
  metricAt(run: EvoRun, step: number): EvoMetrics | undefined {
    const h = this.history[run];
    return h[Math.min(h.length - 1, Math.floor(step / this.params.metricsEvery))];
  }
}
