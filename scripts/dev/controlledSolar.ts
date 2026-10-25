// Dev check: chapter 4 in CONTROLLED mode (circular, evenly spaced orbits) vs RELEASED, full run.
// Usage: npx tsx scripts/dev/controlledSolar.ts
import { makeSolarParams } from '../../src/solar/params';
import { createSolar, orbitOf, solarMetrics, stepSolar } from '../../src/solar/nbody';

for (const [name, over] of [['RELEASED', {}], ['CONTROLLED', { layout: 'rings' as const }]] as const) {
  const p = makeSolarParams(over);
  const s = createSolar(p);
  const rows: string[] = [];
  for (const at of [1000, 3000, 6000, 12000, 24000, 36000, 48000, p.steps]) {
    stepSolar(s, at - s.step);
    const m = solarMetrics(s);
    let emax = 0;
    for (let i = 0; i < s.x.length; i++) if (s.alive[i]) emax = Math.max(emax, orbitOf(s.x[i], s.y[i], s.vx[i], s.vy[i]).e);
    rows.push(`  step ${String(at).padStart(5)} (${((at * p.dt)).toFixed(0)} yr): bodies ${m.nBodies} collisions ${m.collisions} largest ${m.largestMass.toFixed(3)} M⊕ max e ${emax.toFixed(3)}`);
  }
  console.log(`${name}:\n${rows.join('\n')}`);
}
