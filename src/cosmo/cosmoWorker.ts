/// <reference lib="webworker" />
// Runs chapter 2's gravity simulation (with ripples, and the smooth "no ripples" control)
// in the background and answers frame requests with exact states via snapshots.

import { gaussianField } from './field';
import { cloneCosmo, copyCosmoInto, cosmoMetrics, createCosmo, stepCosmo, type CosmoMetrics, type CosmoState } from './pm';
import type { CosmoParams } from './params';
import type { CosmoRun, FromCosmo, ToCosmo } from './protocol';
import { GenericTimeline } from '../sim/timeline';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface Run {
  timeline: GenericTimeline<CosmoState, CosmoMetrics>;
  view: CosmoState;
  unsent: CosmoMetrics[];
}

let runs: Record<CosmoRun, Run> | null = null;
let params: CosmoParams | null = null;
let runId = 0;
let lastFlush = 0;

function makeRun(p: CosmoParams, field: Float64Array): Run {
  const timeline = new GenericTimeline<CosmoState, CosmoMetrics>(
    {
      step: stepCosmo,
      stepOf: (s) => s.step,
      clone: cloneCosmo,
      copyInto: copyCosmoInto,
      metrics: cosmoMetrics,
      metricsEvery: p.metricsEvery,
      snapshotEvery: p.snapshotEvery,
    },
    createCosmo(p, field),
  );
  return { timeline, view: cloneCosmo(timeline.head), unsent: [...timeline.metrics] };
}

function flush(): void {
  if (!runs || !params) return;
  const msg: FromCosmo = {
    type: 'metrics',
    runId,
    headStep: runs.ripples.timeline.headStep,
    steps: params.steps,
    ripples: runs.ripples.unsent,
    smooth: runs.smooth.unsent,
  };
  runs.ripples.unsent = [];
  runs.smooth.unsent = [];
  ctx.postMessage(msg);
  lastFlush = performance.now();
}

const channel = new MessageChannel();
let ticking = false;
channel.port1.onmessage = tick;
function schedule(): void {
  if (!ticking) {
    ticking = true;
    channel.port2.postMessage(null);
  }
}

function tick(): void {
  ticking = false;
  if (!runs || !params) return;
  const t0 = performance.now();
  const every = params.metricsEvery;
  while (runs.ripples.timeline.headStep < params.steps && performance.now() - t0 < 12) {
    for (const r of [runs.ripples, runs.smooth]) r.unsent.push(...r.timeline.advance(every));
  }
  const done = runs.ripples.timeline.headStep >= params.steps;
  if (done || performance.now() - lastFlush > 150) flush();
  if (!done) schedule();
}

function sendFrame(step: number, which: CosmoRun): void {
  if (!runs) return;
  const r = runs[which];
  r.timeline.seek(r.view, step);
  const s = r.view;
  const N = s.x.length;
  const pos = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) {
    pos[2 * i] = s.x[i];
    pos[2 * i + 1] = s.y[i];
  }
  const stars = new Float32Array(3 * s.nStars);
  for (let k = 0; k < s.nStars; k++) {
    const i = s.starOf[k];
    stars[3 * k] = s.x[i];
    stars[3 * k + 1] = s.y[i];
    stars[3 * k + 2] = s.step - s.starBorn[k];
  }
  const msg: FromCosmo = { type: 'frame', runId, run: which, step: s.step, pos, stars };
  ctx.postMessage(msg, [pos.buffer, stars.buffer]);
}

ctx.onmessage = (e: MessageEvent<ToCosmo>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    runId = msg.runId;
    params = msg.params;
    const field = gaussianField(params.seed, params.G, params.slope, params.smoothCells);
    const fieldMsg: FromCosmo = { type: 'field', runId, G: params.G, delta: Float32Array.from(field) };
    ctx.postMessage(fieldMsg);
    runs = { ripples: makeRun(params, field), smooth: makeRun({ ...params, ripples: false }, field) };
    flush();
    schedule();
  } else if (msg.type === 'frame') {
    sendFrame(msg.step, msg.run);
  }
};
