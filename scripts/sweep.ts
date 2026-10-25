// Headless parameter sweep: finds settings where driven vs control differ clearly,
// and reports how often driven beats control across the whole grid (so the
// presets are not silently cherry-picked).
//
//   npm run sweep                       # default base, 20 seeds
//   npm run sweep -- --seeds 40 --steps 30000 --base spec
//
// Uses the same sim module as the browser. One worker thread per core.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { DEFAULT_PARAMS, makeParams, type SimParams } from '../src/sim/params';
import { createState } from '../src/sim/state';
import { stepSim } from '../src/sim/physics';
import { computeMetrics, findClusters, fingerprint } from '../src/sim/metrics';

interface Job {
  id: number;
  params: SimParams;
}
interface JobResult {
  id: number;
  maxCopies: number;
  order: number;
  nClusters: number;
  /** maxCopies counting only clusters of at least 12 / 15 particles (stricter "meaningful" copies). */
  copies12: number;
  copies15: number;
}

/** Largest number of clusters (of at least minSize particles) sharing one fingerprint. */
function strictCopies(sizes: number[], keys: string[], minSize: number): number {
  const tally = new Map<string, number>();
  keys.forEach((k, i) => {
    if (sizes[i] >= minSize) tally.set(k, (tally.get(k) ?? 0) + 1);
  });
  let best = 0;
  for (const n of tally.values()) best = Math.max(best, n);
  return best >= 2 ? best : 0;
}

const SAMPLE_EVERY = 100; // steps between metric samples in the last 20%

function runJob(job: Job, steps: number): JobResult {
  const s = createState(job.params);
  const startAvg = Math.floor(steps * 0.8);
  stepSim(s, startAvg);
  let n = 0;
  let copies = 0;
  let order = 0;
  let clusters = 0;
  let c12 = 0;
  let c15 = 0;
  while (s.step < steps) {
    stepSim(s, Math.min(SAMPLE_EVERY, steps - s.step));
    const m = computeMetrics(s);
    copies += m.maxCopies;
    order += m.order;
    clusters += m.nClusters;
    const cl = findClusters(s);
    const sizes = cl.members.map((x) => x.length);
    const keys = cl.members.map((x) => fingerprint(s, x));
    c12 += strictCopies(sizes, keys, 12);
    c15 += strictCopies(sizes, keys, 15);
    n++;
  }
  return { id: job.id, maxCopies: copies / n, order: order / n, nClusters: clusters / n, copies12: c12 / n, copies15: c15 / n };
}

if (!isMainThread) {
  const { steps } = workerData as { steps: number };
  parentPort!.on('message', (job: Job | null) => {
    if (job === null) process.exit(0);
    parentPort!.postMessage(runJob(job, steps));
  });
} else {
  await main();
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const seeds = Number(arg('seeds', '20'));
  const steps = Number(arg('steps', '30000'));
  const N = Number(arg('N', '800'));
  const base = arg('base', 'default');
  const out = arg('out', base === 'spec' ? 'sweep_results_spec.csv' : 'sweep_results.csv');

  // Same density as the full-size run: shrink L with sqrt(N).
  const baseOverrides: Partial<SimParams> =
    base === 'spec' ? { L: 40, attraction: 1, symmetric: false, T: 0.05 } : {};
  const fullL = baseOverrides.L ?? DEFAULT_PARAMS.L;
  const L = fullL * Math.sqrt(N / DEFAULT_PARAMS.N);

  const E0s = [0.5, 1, 2, 4, 8];
  const periods = [20, 50, 100];
  const Ts = [0.02, 0.05, 0.1, 0.3];

  // Control runs don't depend on E0 or period: one per (seed, T).
  const jobs: Job[] = [];
  const controlId = new Map<string, number>();
  const drivenCombos: { seed: number; E0: number; period: number; T: number; id: number }[] = [];
  for (let seed = 1; seed <= seeds; seed++)
    for (const T of Ts) {
      const id = jobs.length;
      jobs.push({ id, params: makeParams({ ...baseOverrides, seed, N, L, T, E0: 0 }) });
      controlId.set(`${seed}:${T}`, id);
      for (const E0 of E0s)
        for (const period of periods) {
          const did = jobs.length;
          jobs.push({ id: did, params: makeParams({ ...baseOverrides, seed, N, L, T, E0, period }) });
          drivenCombos.push({ seed, E0, period, T, id: did });
        }
    }

  const nWorkers = Math.max(1, availableParallelism() - 1);
  console.log(`base=${base} N=${N} L=${L.toFixed(2)} steps=${steps} jobs=${jobs.length} workers=${nWorkers}`);
  const results = new Array<JobResult>(jobs.length);
  let next = 0;
  let done = 0;
  const t0 = Date.now();

  await Promise.all(
    Array.from({ length: nWorkers }, () => {
      return new Promise<void>((resolve, reject) => {
        // Worker threads don't inherit tsx's loader; the .mjs bootstrap registers it.
        const w = new Worker(new URL('./sweepWorker.mjs', import.meta.url), { workerData: { steps } });
        const feed = () => w.postMessage(next < jobs.length ? jobs[next++] : null);
        w.on('message', (r: JobResult) => {
          results[r.id] = r;
          done++;
          if (done % 50 === 0 || done === jobs.length) {
            const el = (Date.now() - t0) / 1000;
            console.log(`  ${done}/${jobs.length}  ${el.toFixed(0)}s elapsed, ~${((el / done) * (jobs.length - done)).toFixed(0)}s left`);
          }
          feed();
        });
        w.on('error', reject);
        w.on('exit', () => resolve());
        feed();
      });
    }),
  );

  const rows = drivenCombos.map((c) => {
    const d = results[c.id];
    const k = results[controlId.get(`${c.seed}:${c.T}`)!];
    const score = d.maxCopies - k.maxCopies + 10 * (d.order - k.order);
    return { ...c, d, k, score };
  });
  rows.sort((a, b) => b.score - a.score);

  const header = 'seed,E0,period,T,score,order_driven,order_control,maxCopies_driven,maxCopies_control,nClusters_driven,nClusters_control,copies12_driven,copies12_control,copies15_driven,copies15_control,score12';
  const lines = rows.map((r) =>
    [r.seed, r.E0, r.period, r.T, r.score.toFixed(4), r.d.order.toFixed(4), r.k.order.toFixed(4),
      r.d.maxCopies.toFixed(2), r.k.maxCopies.toFixed(2), r.d.nClusters.toFixed(1), r.k.nClusters.toFixed(1),
      r.d.copies12.toFixed(2), r.k.copies12.toFixed(2), r.d.copies15.toFixed(2), r.k.copies15.toFixed(2),
      (r.d.copies12 - r.k.copies12 + 10 * (r.d.order - r.k.order)).toFixed(4)].join(','),
  );
  writeFileSync(out, [header, ...lines].join('\n') + '\n');

  const frac = (f: (r: (typeof rows)[number]) => boolean) => ((100 * rows.filter(f).length) / rows.length).toFixed(1) + '%';
  console.log(`\nWrote ${out} (${rows.length} driven runs, each compared with its control)`);
  console.log(`Driven beats control (score > 0):        ${frac((r) => r.score > 0)}`);
  console.log(`Driven order > control order:            ${frac((r) => r.d.order > r.k.order)}`);
  console.log(`Driven maxCopies > control maxCopies:    ${frac((r) => r.d.maxCopies > r.k.maxCopies)}`);
  console.log(`Strict (>= 12 particles) copies, driven > control: ${frac((r) => r.d.copies12 > r.k.copies12)}`);
  console.log(`Strict (>= 15 particles) copies, driven > control: ${frac((r) => r.d.copies15 > r.k.copies15)}`);
  console.log(`Strict score (copies12 diff + 10 x order diff) > 0: ${frac((r) => r.d.copies12 - r.k.copies12 + 10 * (r.d.order - r.k.order) > 0)}`);
  console.log(`Driven wins BOTH order and strict copies (>= 12):  ${frac((r) => r.d.order > r.k.order && r.d.copies12 > r.k.copies12)}`);
  // Settings that win both, robustly across seeds.
  const both = new Map<string, { n: number; wins: number; dc: number; kc: number; dord: number }>();
  for (const r of rows) {
    const key = `${r.E0}|${r.period}|${r.T}`;
    const b = both.get(key) ?? { n: 0, wins: 0, dc: 0, kc: 0, dord: 0 };
    b.n++;
    if (r.d.order > r.k.order && r.d.copies12 > r.k.copies12) b.wins++;
    b.dc += r.d.copies12;
    b.kc += r.k.copies12;
    b.dord += r.d.order - r.k.order;
    both.set(key, b);
  }
  console.log('\nSettings by seeds winning both order and strict copies (E0|period|T):');
  for (const [key, b] of [...both.entries()].sort((a, b2) => b2[1].wins / b2[1].n - a[1].wins / a[1].n).slice(0, 10))
    console.log(`  ${key.padEnd(14)} both in ${b.wins}/${b.n} seeds  copies12 D/C ${(b.dc / b.n).toFixed(2)}/${(b.kc / b.n).toFixed(2)}  order diff ${(b.dord / b.n).toFixed(3)}`);

  console.log('\nTop 10 runs:');
  console.log('  seed  E0  period  T     score   order D/C        copies D/C');
  for (const r of rows.slice(0, 10))
    console.log(`  ${String(r.seed).padStart(4)} ${String(r.E0).padStart(4)} ${String(r.period).padStart(6)}  ${String(r.T).padEnd(5)} ${r.score.toFixed(3).padStart(6)}   ${r.d.order.toFixed(3)}/${r.k.order.toFixed(3)}   ${r.d.maxCopies.toFixed(1)}/${r.k.maxCopies.toFixed(1)}`);

  // Robustness: which (E0, period, T) settings win across seeds, not just for one lucky seed.
  const combos = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.E0}|${r.period}|${r.T}`;
    if (!combos.has(key)) combos.set(key, []);
    combos.get(key)!.push(r);
  }
  const summary = [...combos.entries()].map(([key, rs]) => ({
    key,
    mean: rs.reduce((a, r) => a + r.score, 0) / rs.length,
    wins: rs.filter((r) => r.score > 0).length / rs.length,
  }));
  summary.sort((a, b) => b.mean - a.mean);
  console.log('\nTop 10 settings averaged over seeds (E0|period|T):');
  for (const s of summary.slice(0, 10))
    console.log(`  ${s.key.padEnd(14)} mean score ${s.mean.toFixed(3)}  driven wins in ${(100 * s.wins).toFixed(0)}% of seeds`);
}
