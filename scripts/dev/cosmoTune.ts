// Dev helper: first-star time and structure growth for several ripple amplitudes.
import { makeCosmoParams } from '../../src/cosmo/params';
import { cosmoMetrics, createCosmo, stepCosmo, timeOfA, scaleFactorAt } from '../../src/cosmo/pm';
const G = Number(process.argv[2] ?? 128);
const aFinal = Math.pow(0.8e9 / 3.8e5, 2 / 3);
for (const amplitude of process.argv.slice(3).map(Number)) {
  const p = makeCosmoParams({ G, amplitude, aFinal });
  const s = createCosmo(p);
  let first = -1;
  const t0 = performance.now();
  const marks: string[] = [];
  while (s.step < p.steps) {
    stepCosmo(s, 1);
    if (first < 0 && s.nStars > 0) first = s.step;
    if (s.step % 300 === 0) { const m = cosmoMetrics(s); marks.push(`a=${m.a.toFixed(0)} σ²=${m.sigma2.toFixed(2)} stars=${m.nStars} clump=${(100 * m.largestClump).toFixed(1)}%`); }
  }
  const ms = (performance.now() - t0) / p.steps;
  const tFirst = first < 0 ? NaN : timeOfA(p, scaleFactorAt(p, first)) / 1e6;
  console.log(`G=${G} amp=${amplitude}: ${ms.toFixed(1)} ms/step, first star at ${tFirst.toFixed(0)} Myr (step ${first})\n   ${marks.join('\n   ')}`);
}
