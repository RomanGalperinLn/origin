import type { SimParams } from './params';
import { cloneState, copyStateInto, createState, type SimState } from './state';
import { stepSim } from './physics';
import { computeMetrics, type MetricSample } from './metrics';

/** What a simulation must provide to get snapshots and exact seeking. */
export interface TimelineModel<S, M> {
  step(s: S, n: number): void;
  stepOf(s: S): number;
  clone(s: S): S;
  copyInto(dst: S, src: S): void;
  metrics(s: S): M;
  metricsEvery: number;
  snapshotEvery: number;
}

/**
 * One run's history, for any deterministic simulation. `head` is the furthest
 * computed state; full snapshots are kept every `snapshotEvery` steps, and a
 * metric sample every `metricsEvery`. Any earlier step can be rebuilt exactly
 * from the nearest snapshot at or before it.
 */
export class GenericTimeline<S, M> {
  head: S;
  snapshots = new Map<number, S>();
  metrics: M[] = [];

  constructor(
    protected model: TimelineModel<S, M>,
    initial: S,
  ) {
    this.head = initial;
    this.snapshots.set(model.stepOf(initial), model.clone(initial));
    this.metrics.push(model.metrics(initial));
  }

  get headStep(): number {
    return this.model.stepOf(this.head);
  }

  /** Advances the head by n steps, recording metrics and snapshots. Returns the new metric samples. */
  advance(n: number): M[] {
    const { metricsEvery, snapshotEvery } = this.model;
    const fresh: M[] = [];
    const end = this.headStep + n;
    while (this.headStep < end) {
      const toBoundary = metricsEvery - (this.headStep % metricsEvery);
      this.model.step(this.head, Math.min(toBoundary, end - this.headStep));
      const s = this.headStep;
      if (s % metricsEvery === 0) {
        const m = this.model.metrics(this.head);
        this.metrics.push(m);
        fresh.push(m);
      }
      if (s % snapshotEvery === 0) this.snapshots.set(s, this.model.clone(this.head));
    }
    return fresh;
  }

  /**
   * Puts `view` into the exact state at `target` (clamped to the head).
   * Steps `view` forward if that is cheaper than restarting from a snapshot.
   */
  seek(view: S, target: number): void {
    const m = this.model;
    target = Math.max(0, Math.min(Math.round(target), this.headStep));
    if (target === this.headStep) {
      m.copyInto(view, this.head);
      return;
    }
    const snapStep = Math.floor(target / m.snapshotEvery) * m.snapshotEvery;
    const at = m.stepOf(view);
    if (!(at <= target && at >= snapStep)) m.copyInto(view, this.snapshots.get(snapStep)!);
    const now = m.stepOf(view);
    if (target > now) m.step(view, target - now);
  }

  /** Latest metric sample at or before `step`. */
  metricAt(step: number): M {
    const i = Math.min(this.metrics.length - 1, Math.floor(step / this.model.metricsEvery));
    return this.metrics[Math.max(0, i)];
  }
}

/** The origin-of-life particle simulation's timeline. */
/**
 * The run's starting state. With settleSteps > 0 (CONTROLLED mode) the neat layout first settles
 * under the run's own conditions (same physics, same field, no noise) into its rest state, which
 * becomes the designed start: step 0 is the settled crystal. Settling is rounded up to whole field
 * periods, so the field's phase carries on smoothly; the clock and energy counters restart at 0.
 */
export function initialState(params: SimParams): SimState {
  const s = createState(params);
  if (params.settleSteps > 0) {
    const period = Math.max(1, Math.round(params.period / params.dt));
    stepSim(s, Math.ceil(params.settleSteps / period) * period);
    s.step = 0;
    s.W = 0;
    s.Q = 0;
  }
  return s;
}

export class Timeline extends GenericTimeline<SimState, MetricSample> {
  constructor(params: SimParams) {
    super(
      {
        step: stepSim,
        stepOf: (s) => s.step,
        clone: cloneState,
        copyInto: copyStateInto,
        metrics: computeMetrics,
        metricsEvery: params.metricsEvery,
        snapshotEvery: params.snapshotEvery,
      },
      initialState(params),
    );
  }

  get params(): SimParams {
    return this.head.params;
  }
}
