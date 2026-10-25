// Dev check: does a pre-relaxed crystal stay frozen in CONTROLLED chapter 6?
// 1) neat lattice, T = 0, field OFF: settle for R steps; 2) field ON from there, 60k steps.
// Drift is measured one full field period apart, so shaking in place doesn't count.
// Usage: npx tsx scripts/dev/relaxedCrystal.ts [relaxSteps] [runSteps]
import { PRESETS, makeParams } from '../../src/sim/params';
import { createState } from '../../src/sim/state';
import { stepSim } from '../../src/sim/physics';
import { computeMetrics } from '../../src/sim/metrics';

const relax = Number(process.argv[2] ?? 30000);
const run = Number(process.argv[3] ?? 60000);
const base = makeParams({ ...PRESETS[0].params, layout: 'lattice', T: 0 });
// FIELD=on: settle with the field on (the conditions the chapter runs in).
const s = createState({ ...base, E0: process.env.FIELD === 'on' ? base.E0 : 0 });
const L = s.params.L;
const drift = (ax: Float64Array, ay: Float64Array) => {
  let d = 0;
  for (let i = 0; i < s.x.length; i++) d += Math.hypot(((s.x[i] - ax[i] + 1.5 * L) % L) - L / 2, ((s.y[i] - ay[i] + 1.5 * L) % L) - L / 2);
  return d / s.x.length;
};
let px = s.x.slice();
let py = s.y.slice();
for (let k = 0; k < relax; k += 5000) {
  stepSim(s, 5000);
  const m = computeMetrics(s);
  console.log(`relax ${String(s.step).padStart(5)}: drift/5000 ${drift(px, py).toFixed(4)} clusters ${m.nClusters} largest ${m.largestCluster} order ${m.order.toFixed(3)}`);
  px = s.x.slice();
  py = s.y.slice();
}
// Field on, from rest. One field period = period / dt steps.
s.params = { ...s.params, E0: base.E0 };
s.vx.fill(0);
s.vy.fill(0);
const period = Math.round(base.period / base.dt);
const t0 = s.step - (s.step % period) + period;
stepSim(s, t0 - s.step);
px = s.x.slice();
py = s.y.slice();
const startX = s.x.slice();
const startY = s.y.slice();
for (let k = 1; k * period <= run; k *= 2) {
  stepSim(s, t0 + k * period - s.step);
  const m = computeMetrics(s);
  console.log(`field on, ${String(k * period).padStart(5)} steps: drift since field-on (same phase) ${drift(startX, startY).toFixed(4)} clusters ${m.nClusters} largest ${m.largestCluster} order ${m.order.toFixed(3)}`);
}
