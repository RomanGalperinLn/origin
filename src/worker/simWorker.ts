/// <reference lib="webworker" />
import { controlParams, type SimParams } from '../sim/params';
import { cloneState, type SimState } from '../sim/state';
import { meanDisplacement, reverseVelocities, stepSim } from '../sim/physics';
import { Timeline } from '../sim/timeline';
import { copyStats, findClusters, type MetricSample } from '../sim/metrics';
import { structuresOf } from '../sim/structures';
import {
  ECHO_STEPS,
  FRAME_EVERY,
  REVERSE_FRAME_EVERY,
  REVERSE_SAMPLE_EVERY,
  REVERSE_STEPS,
  type BranchSample,
  type FromWorker,
  type ToWorker,
} from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface Run {
  timeline: Timeline;
  view: SimState; // state shown on screen (may lag behind the head)
  frames: Uint16Array[]; // quantised positions every FRAME_EVERY steps
  unsent: MetricSample[];
}

let driven: Run | null = null;
let control: Run | null = null;
let targetSteps = 0;
let runId = 0;

// The "reverse time" branch: a copy of the driven run with flipped velocities.
interface Branch {
  id: number;
  state: SimState;
  startStep: number;
  frictionless: boolean;
  k: number; // steps run so far (frictionless: counts both legs)
  total: number;
  origin: SimState | null; // frictionless: state at the start of the echo
  S0: number; // bath entropy at the start (so the branch reports entropy since the flip)
  frames: Float32Array[];
  samples: BranchSample[];
}
let branch: Branch | null = null;
let branchCounter = 0;
let lastFlush = 0;

function makeRun(params: SimParams): Run {
  const timeline = new Timeline(params);
  const run: Run = { timeline, view: cloneState(timeline.head), frames: [], unsent: [...timeline.metrics] };
  run.frames.push(quantise(timeline.head));
  return run;
}

function quantise(s: SimState): Uint16Array {
  const { N, L } = s.params;
  const out = new Uint16Array(2 * N);
  const k = 65535 / L;
  for (let i = 0; i < N; i++) {
    out[2 * i] = Math.min(65535, Math.round(s.x[i] * k));
    out[2 * i + 1] = Math.min(65535, Math.round(s.y[i] * k));
  }
  return out;
}

function positions(s: SimState): Float32Array {
  const out = new Float32Array(2 * s.params.N);
  for (let i = 0; i < s.params.N; i++) {
    out[2 * i] = s.x[i];
    out[2 * i + 1] = s.y[i];
  }
  return out;
}

function dequantise(q: Uint16Array, L: number): Float32Array {
  const out = new Float32Array(q.length);
  const k = L / 65535;
  for (let i = 0; i < q.length; i++) out[i] = q[i] * k;
  return out;
}

/** One circle (centre x, y, radius) around each cluster sharing the most common fingerprint. */
function topCopyRings(s: SimState): Float32Array {
  const { L } = s.params;
  const half = L / 2;
  const c = findClusters(s);
  const cs = copyStats(s, c);
  const out: number[] = [];
  if (cs.topFingerprint === null) return new Float32Array(0);
  cs.keys.forEach((k, ci) => {
    if (k !== cs.topFingerprint) return;
    const m = c.members[ci];
    // Unwrap around the first member, then take centroid and extent.
    const x0 = s.x[m[0]];
    const y0 = s.y[m[0]];
    const dx: number[] = [];
    const dy: number[] = [];
    for (const i of m) {
      let ddx = s.x[i] - x0;
      let ddy = s.y[i] - y0;
      if (ddx > half) ddx -= L;
      else if (ddx < -half) ddx += L;
      if (ddy > half) ddy -= L;
      else if (ddy < -half) ddy += L;
      dx.push(ddx);
      dy.push(ddy);
    }
    const cx = dx.reduce((a, b) => a + b, 0) / m.length;
    const cy = dy.reduce((a, b) => a + b, 0) / m.length;
    let r = 0;
    for (let k = 0; k < m.length; k++) r = Math.max(r, Math.hypot(dx[k] - cx, dy[k] - cy));
    out.push((((x0 + cx) % L) + L) % L, (((y0 + cy) % L) + L) % L, r + 0.5);
  });
  return Float32Array.from(out);
}

function advanceBoth(n: number): void {
  for (const run of [driven!, control!]) {
    const fresh = run.timeline.advance(n);
    for (const m of fresh) run.unsent.push(m);
    if (run.timeline.head.step % FRAME_EVERY === 0) run.frames.push(quantise(run.timeline.head));
  }
}

function flushMetrics(): void {
  if (!driven || !control) return;
  const msg: FromWorker = {
    type: 'metrics',
    runId,
    headStep: driven.timeline.head.step,
    targetSteps,
    driven: driven.unsent,
    control: control.unsent,
  };
  driven.unsent = [];
  control.unsent = [];
  ctx.postMessage(msg);
  lastFlush = performance.now();
}

// Background computation in ~12 ms slices so frame requests are answered quickly.
// A MessageChannel gives a zero-delay yield (setTimeout is clamped to 4 ms).
const tickChannel = new MessageChannel();
let ticking = false;
tickChannel.port1.onmessage = tick;

function scheduleTick(): void {
  if (!ticking) {
    ticking = true;
    tickChannel.port2.postMessage(null);
  }
}

function tick(): void {
  ticking = false;
  if (!driven || !control) return;
  const t0 = performance.now();
  if (branch) {
    // The branch has priority over background precompute.
    while (branch && performance.now() - t0 < 12) stepBranch();
    if (branch) flushBranch(false);
    scheduleTick();
    return;
  }
  const chunk = driven.timeline.params.metricsEvery;
  while (driven.timeline.head.step < targetSteps && performance.now() - t0 < 12) advanceBoth(chunk);
  const done = driven.timeline.head.step >= targetSteps;
  if (done || performance.now() - lastFlush > 200) flushMetrics();
  if (!done) scheduleTick();
}

function startBranch(step: number, frictionless: boolean): void {
  if (!driven) return;
  // Align to a cached frame so the past can be compared exactly against stored history.
  step = Math.floor(Math.min(step, driven.timeline.head.step) / FRAME_EVERY) * FRAME_EVERY;
  const state = cloneState(driven.timeline.head);
  driven.timeline.seek(state, step);
  let origin: SimState | null = null;
  if (frictionless) {
    state.params = { ...state.params, gamma: 0, T: 0, E0: 0 };
    origin = cloneState(state);
  } else {
    reverseVelocities(state, false);
  }
  const T = state.params.T;
  branch = {
    id: ++branchCounter,
    state,
    startStep: step,
    frictionless,
    k: 0,
    total: frictionless ? 2 * ECHO_STEPS : REVERSE_STEPS,
    origin,
    S0: T > 0 ? state.Q / T : 0,
    frames: [positions(state)],
    samples: [],
  };
  recordBranchSample();
  scheduleTick();
}

function recordBranchSample(): void {
  const b = branch!;
  const s = b.state;
  const { L, T } = s.params;
  let dist = NaN;
  if (b.origin) {
    dist = meanDisplacement(s.x, s.y, b.origin.x, b.origin.y, L);
  } else if (b.startStep - b.k >= 0 && (b.startStep - b.k) % FRAME_EVERY === 0) {
    const past = dequantise(driven!.frames[(b.startStep - b.k) / FRAME_EVERY], L);
    const px = new Float64Array(s.params.N);
    const py = new Float64Array(s.params.N);
    for (let i = 0; i < s.params.N; i++) {
      px[i] = past[2 * i];
      py[i] = past[2 * i + 1];
    }
    dist = meanDisplacement(s.x, s.y, px, py, L);
  }
  const phase = b.frictionless && b.k < ECHO_STEPS ? 'out' : 'back';
  b.samples.push({ k: b.k, dist, S: T > 0 ? s.Q / T - b.S0 : 0, phase });
}

function stepBranch(): void {
  const b = branch!;
  stepSim(b.state, 1);
  b.k++;
  if (b.frictionless && b.k === ECHO_STEPS) reverseVelocities(b.state, true);
  const frameEvery = b.frictionless ? 1 : REVERSE_FRAME_EVERY;
  const sampleEvery = b.frictionless ? 5 : REVERSE_SAMPLE_EVERY;
  if (b.k % frameEvery === 0) b.frames.push(positions(b.state));
  if (b.k % sampleEvery === 0) recordBranchSample();
  if (b.k >= b.total) flushBranch(true);
}

function flushBranch(done: boolean): void {
  const b = branch!;
  const msg: FromWorker = {
    type: 'branch',
    runId,
    branchId: b.id,
    startStep: b.startStep,
    frictionless: b.frictionless,
    totalSteps: b.total,
    frames: b.frames,
    samples: b.samples,
    done,
  };
  ctx.postMessage(msg, b.frames.map((f) => f.buffer));
  b.frames = [];
  b.samples = [];
  if (done) branch = null;
}

function sendFrame(step: number, exact: boolean, highlight: boolean, structures = false): void {
  if (!driven || !control) return;
  const head = driven.timeline.head.step;
  step = Math.max(0, Math.min(Math.round(step), head));
  let d: Float32Array;
  let c: Float32Array;
  let dRings: Float32Array | null = null;
  let cRings: Float32Array | null = null;
  const L = driven.timeline.params.L;
  if (!exact && step < head) {
    const fi = Math.floor(step / FRAME_EVERY);
    step = fi * FRAME_EVERY;
    d = dequantise(driven.frames[fi], L);
    c = dequantise(control.frames[fi], L);
  } else {
    driven.timeline.seek(driven.view, step);
    control.timeline.seek(control.view, step);
    d = positions(driven.view);
    c = positions(control.view);
    if (highlight) {
      dRings = topCopyRings(driven.view);
      cRings = topCopyRings(control.view);
    }
  }
  const dS = structures ? structuresOf(driven.timeline.params, driven.timeline.head.type, d) : null;
  const cS = structures ? structuresOf(control.timeline.params, control.timeline.head.type, c) : null;
  const msg: FromWorker = {
    type: 'frame', runId, step, headStep: head, driven: d, control: c, drivenRings: dRings, controlRings: cRings,
    drivenStructures: dS, controlStructures: cS,
  };
  const transfer: Transferable[] = [d.buffer, c.buffer];
  if (dRings) transfer.push(dRings.buffer);
  if (cRings) transfer.push(cRings.buffer);
  for (const st of [dS, cS]) if (st) transfer.push(st.label.buffer, st.hue.buffer, st.matches.buffer);
  ctx.postMessage(msg, transfer);
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      branch = null;
      driven = makeRun(msg.params);
      control = makeRun(controlParams(msg.params));
      targetSteps = msg.targetSteps;
      runId = msg.runId;
      const s = driven.timeline.head;
      const ready: FromWorker = { type: 'ready', runId, N: s.params.N, L: s.params.L, K: s.params.K, types: s.type.slice() };
      ctx.postMessage(ready);
      flushMetrics();
      scheduleTick();
      break;
    }
    case 'setTarget':
      targetSteps = msg.targetSteps;
      scheduleTick();
      break;
    case 'frame':
      sendFrame(msg.step, msg.exact, msg.highlight, msg.structures);
      break;
    case 'reverse':
      startBranch(msg.step, msg.frictionless);
      break;
  }
};
