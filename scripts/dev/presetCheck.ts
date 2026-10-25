// Dev helper: full-size driven vs control comparison for a parameter set.
import { makeParams, controlParams } from '../../src/sim/params';
import { createState } from '../../src/sim/state';
import { stepSim } from '../../src/sim/physics';
import { computeMetrics } from '../../src/sim/metrics';
const p = makeParams(JSON.parse(process.argv[2]));
const runs = [createState(p), createState(controlParams(p))];
const lines: string[] = [];
for (const at of [5000, 20000, 60000]) {
  runs.forEach((r) => stepSim(r, at - r.step));
  const [d, c] = runs.map(computeMetrics);
  lines.push(`  ${at}: order D ${d.order.toFixed(3)} C ${c.order.toFixed(3)} | clusters D ${d.nClusters} C ${c.nClusters} | copies D ${d.maxCopies} C ${c.maxCopies}`);
}
console.log(process.argv[2] + '\n' + lines.join('\n'));
