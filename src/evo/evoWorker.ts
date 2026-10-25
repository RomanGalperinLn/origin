/// <reference lib="webworker" />
// Runs chapter 7's evolution model (real oxygen history, and the no-oxygen control) in the
// background and answers frame requests with exact states via snapshots.

import { GenericTimeline } from '../sim/timeline';
import type { EvoParams } from './params';
import { FRAME_STRIDE, type EvoRun, type FromEvo, type ToEvo } from './protocol';
import { CB, CG, CR, DIET, HEADING, K, SEGMENTS, SIZE, X, Y, cloneEvo, copyEvoInto, createEvo, evoMetrics, stepEvo, type EvoMetrics, type EvoState } from './world';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface Run {
  timeline: GenericTimeline<EvoState, EvoMetrics>;
  view: EvoState;
  unsent: EvoMetrics[];
}

let runs: Record<EvoRun, Run> | null = null;
let params: EvoParams | null = null;
let runId = 0;
let lastFlush = 0;

function makeRun(p: EvoParams): Run {
  const timeline = new GenericTimeline<EvoState, EvoMetrics>(
    {
      step: stepEvo,
      stepOf: (s) => s.step,
      clone: cloneEvo,
      copyInto: copyEvoInto,
      metrics: evoMetrics,
      metricsEvery: p.metricsEvery,
      snapshotEvery: p.snapshotEvery,
    },
    createEvo(p),
  );
  return { timeline, view: cloneEvo(timeline.head), unsent: [...timeline.metrics] };
}

function flush(): void {
  if (!runs) return;
  const msg: FromEvo = {
    type: 'metrics',
    runId,
    headStep: Math.min(runs.oxygen.timeline.headStep, runs.control.timeline.headStep),
    oxygen: runs.oxygen.unsent,
    control: runs.control.unsent,
    tree: runs.oxygen.timeline.head.tree,
  };
  runs.oxygen.unsent = [];
  runs.control.unsent = [];
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
  while (runs.oxygen.timeline.headStep < params.steps && performance.now() - t0 < 12) {
    for (const r of [runs.oxygen, runs.control]) r.unsent.push(...r.timeline.advance(params.metricsEvery));
  }
  const done = runs.oxygen.timeline.headStep >= params.steps;
  if (done || performance.now() - lastFlush > 150) flush();
  if (!done) schedule();
}

function sendFrame(step: number, which: EvoRun): void {
  if (!runs) return;
  const r = runs[which];
  r.timeline.seek(r.view, step);
  const s = r.view;
  const org = new Float32Array(s.n * FRAME_STRIDE);
  for (let i = 0; i < s.n; i++) {
    const o = i * K;
    const f = i * FRAME_STRIDE;
    org[f] = s.org[o + X];
    org[f + 1] = s.org[o + Y];
    org[f + 2] = s.org[o + HEADING];
    org[f + 3] = s.org[o + SIZE];
    org[f + 4] = s.org[o + SEGMENTS];
    org[f + 5] = s.org[o + CR];
    org[f + 6] = s.org[o + CG];
    org[f + 7] = s.org[o + CB];
    org[f + 8] = s.org[o + DIET];
  }
  const food = Float32Array.from(s.food.subarray(0, 2 * s.nFood));
  const msg: FromEvo = { type: 'frame', runId, run: which, step: s.step, org, food };
  ctx.postMessage(msg, [org.buffer, food.buffer]);
}

ctx.onmessage = (e: MessageEvent<ToEvo>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    runId = msg.runId;
    params = msg.params;
    runs = { oxygen: makeRun(params), control: makeRun({ ...params, oxygenRises: false }) };
    flush();
    schedule();
  } else if (msg.type === 'frame') {
    sendFrame(msg.step, msg.run);
  }
};
