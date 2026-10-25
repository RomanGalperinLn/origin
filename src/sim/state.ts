import type { SimParams } from './params';
import { cloneRng, createRng, nextFloat, uniform, type RngState } from './rng';

export interface SimState {
  params: SimParams;
  step: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  type: Uint8Array;
  /** Interaction matrix, row-major K*K: A[i*K + j] = how type i responds to type j. */
  A: Float32Array;
  /** Field charge per type. */
  q: Float32Array;
  rng: RngState;
  /** Cumulative work done by the field (integrated every step). */
  W: number;
  /** Cumulative net heat to the bath (integrated every step). */
  Q: number;
  /** Field power on the last step (sum F_ext . v). */
  lastWdot: number;
  /** Net heat flow to the bath on the last step. */
  lastQdot: number;
}

/**
 * Builds the initial state from the seed. The matrix, charges, types and
 * positions depend only on (seed, N, K, L), never on E0 or T, so a driven run
 * and its control start bit-identical.
 */
export function createState(params: SimParams): SimState {
  const { N, K, L } = params;
  const rng = createRng(params.seed);
  const A = new Float32Array(K * K);
  for (let i = 0; i < K * K; i++) A[i] = uniform(rng, -1, 1);
  if (params.symmetric)
    for (let i = 0; i < K; i++)
      for (let j = i + 1; j < K; j++) A[i * K + j] = A[j * K + i] = 0.5 * (A[i * K + j] + A[j * K + i]);
  for (let i = 0; i < K * K; i++) A[i] *= params.attraction;
  const q = new Float32Array(K);
  for (let i = 0; i < K; i++) q[i] = uniform(rng, -1, 1);
  const x = new Float64Array(N);
  const y = new Float64Array(N);
  const type = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = nextFloat(rng) * L;
    y[i] = nextFloat(rng) * L;
    type[i] = Math.floor(nextFloat(rng) * K);
  }
  if (params.layout === 'lattice') {
    // CONTROLLED: a neat, designed start. A square grid, filled row by row, with the types in
    // K horizontal bands (grouped by type). The matrix and charges above are unchanged.
    const cols = Math.ceil(Math.sqrt(N));
    const rows = Math.ceil(N / cols);
    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / cols);
      x[i] = ((i % cols) + 0.5) * (L / cols);
      y[i] = (r + 0.5) * (L / rows);
      type[i] = Math.min(K - 1, Math.floor((r * K) / rows));
    }
  }
  return {
    params: { ...params },
    step: 0,
    x,
    y,
    vx: new Float64Array(N),
    vy: new Float64Array(N),
    type,
    A,
    q,
    rng,
    W: 0,
    Q: 0,
    lastWdot: 0,
    lastQdot: 0,
  };
}

export function cloneState(s: SimState): SimState {
  return {
    params: { ...s.params },
    step: s.step,
    x: s.x.slice(),
    y: s.y.slice(),
    vx: s.vx.slice(),
    vy: s.vy.slice(),
    type: s.type.slice(),
    A: s.A.slice(),
    q: s.q.slice(),
    rng: cloneRng(s.rng),
    W: s.W,
    Q: s.Q,
    lastWdot: s.lastWdot,
    lastQdot: s.lastQdot,
  };
}

/** Copies everything that changes during a run from src into dst (same N). */
export function copyStateInto(dst: SimState, src: SimState): void {
  dst.params = { ...src.params };
  dst.step = src.step;
  dst.x.set(src.x);
  dst.y.set(src.y);
  dst.vx.set(src.vx);
  dst.vy.set(src.vy);
  dst.type.set(src.type);
  dst.A.set(src.A);
  dst.q.set(src.q);
  dst.rng = cloneRng(src.rng);
  dst.W = src.W;
  dst.Q = src.Q;
  dst.lastWdot = src.lastWdot;
  dst.lastQdot = src.lastQdot;
}

/** Simulation time of the current step. */
export function simTime(s: SimState): number {
  return s.step * s.params.dt;
}
