/// <reference lib="webworker" />
// Runs chapter 4's planetesimal accretion in the background and answers frame
// requests with exact states via snapshots. Picks Earth once the run is complete.

import { cloneSolar, copySolarInto, createSolar, findEarth, solarMetrics, stepSolar, type SolarMetrics, type SolarState } from './nbody';
import { EARTH_MASS, type SolarParams } from './params';
import { BODY_STRIDE, type FromSolar, type ToSolar } from './protocol';
import { GenericTimeline } from '../sim/timeline';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let timeline: GenericTimeline<SolarState, SolarMetrics> | null = null;
let view: SolarState | null = null;
let params: SolarParams | null = null;
let runId = 0;
let unsent: SolarMetrics[] = [];
let earth = { index: -1, inZone: true };
let lastFlush = 0;

function flush(): void {
  if (!timeline || !params) return;
  const msg: FromSolar = {
    type: 'metrics',
    runId,
    headStep: timeline.headStep,
    steps: params.steps,
    samples: unsent,
    earth: earth.index,
    earthInZone: earth.inZone,
  };
  unsent = [];
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
  if (!timeline || !params) return;
  const t0 = performance.now();
  while (timeline.headStep < params.steps && performance.now() - t0 < 12) unsent.push(...timeline.advance(params.metricsEvery));
  const done = timeline.headStep >= params.steps;
  if (done) earth = findEarth(timeline.head);
  if (done || performance.now() - lastFlush > 150) flush();
  if (!done) schedule();
}

function sendFrame(step: number): void {
  if (!timeline || !view) return;
  timeline.seek(view, step);
  const s = view;
  let n = 0;
  for (let i = 0; i < s.x.length; i++) n += s.alive[i];
  const bodies = new Float32Array(n * BODY_STRIDE);
  let k = 0;
  for (let i = 0; i < s.x.length; i++) {
    if (!s.alive[i]) continue;
    bodies.set([i, s.x[i], s.y[i], s.vx[i], s.vy[i], s.m[i] / EARTH_MASS, s.step - s.hitStep[i]], k);
    k += BODY_STRIDE;
  }
  const msg: FromSolar = { type: 'frame', runId, step: s.step, bodies };
  ctx.postMessage(msg, [bodies.buffer]);
}

ctx.onmessage = (e: MessageEvent<ToSolar>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    runId = msg.runId;
    params = msg.params;
    timeline = new GenericTimeline<SolarState, SolarMetrics>(
      {
        step: stepSolar,
        stepOf: (s) => s.step,
        clone: cloneSolar,
        copyInto: copySolarInto,
        metrics: solarMetrics,
        metricsEvery: params.metricsEvery,
        snapshotEvery: params.snapshotEvery,
      },
      createSolar(params),
    );
    view = cloneSolar(timeline.head);
    unsent = [...timeline.metrics];
    earth = { index: -1, inZone: true };
    flush();
    schedule();
  } else if (msg.type === 'frame') {
    sendFrame(msg.step);
  }
};
