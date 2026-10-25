// Dev check: chapter 6 in CONTROLLED mode (lattice start grouped by type, T = 0, field on)
// vs RELEASED (Demo A), driven runs, over the full chapter. Usage: npx tsx scripts/dev/controlledCh6.ts [steps]
import { PRESETS, makeParams } from '../../src/sim/params';
import { createState } from '../../src/sim/state';
import { stepSim } from '../../src/sim/physics';
import { computeMetrics } from '../../src/sim/metrics';

const steps = Number(process.argv[2] ?? 60000);
const VARIANTS: [string, Record<string, unknown>][] = process.argv[3] === 'why'
  ? [['lattice, T=0, field OFF', { layout: 'lattice', T: 0, E0: 0 }], ['lattice, T=0, field on', { layout: 'lattice', T: 0 }]]
  : [['RELEASED', {}], ['CONTROLLED', { layout: 'lattice', T: 0 }]];
for (const [name, over] of VARIANTS) {
  const s = createState(makeParams({ ...PRESETS[0].params, ...over }));
  const x0 = s.x.slice();
  const y0 = s.y.slice();
  const L = s.params.L;
  const rows: string[] = [];
  for (const at of [0, 1000, 5000, 15000, 30000, steps]) {
    if (at > s.step) stepSim(s, at - s.step);
    const m = computeMetrics(s);
    let disp = 0;
    for (let i = 0; i < s.x.length; i++) {
      const dx = ((s.x[i] - x0[i] + 1.5 * L) % L) - L / 2;
      const dy = ((s.y[i] - y0[i] + 1.5 * L) % L) - L / 2;
      disp += Math.hypot(dx, dy) / s.x.length;
    }
    rows.push(`  step ${String(at).padStart(5)}: clusters ${String(m.nClusters).padStart(3)} largest ${String(m.largestCluster).padStart(4)} clustered ${(100 * m.fracClustered).toFixed(0).padStart(3)}% copies ${m.maxCopies} order ${m.order.toFixed(3)} mean drift ${disp.toFixed(2)}`);
  }
  console.log(`${name}:\n${rows.join('\n')}`);
}
