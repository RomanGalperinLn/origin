// Dev helper: runs the evolution model with the real schedule and prints the story in numbers.
// Usage: npx tsx scripts/dev/evoTune.ts [seed] [key=value ...]
import { makeEvoParams, type EvoParams } from '../../src/evo/params';
import { evoSchedule, evoTimeAt } from '../../src/evo/schedule';
import { createEvo, evoMetrics, stepEvo } from '../../src/evo/world';
import { formatYearsAgo } from '../../src/time/cosmic';

const seed = Number(process.argv[2] ?? 1);
const over: Partial<EvoParams> = {};
for (const kv of process.argv.slice(3)) {
  const [k, v] = kv.split('=');
  (over as Record<string, unknown>)[k] = v === 'false' ? false : Number(v);
}
const base = makeEvoParams({ seed, ...over });
const p = { ...base, schedule: evoSchedule(base.steps) };
if (!process.env.BRIEF) console.log('schedule', JSON.stringify(p.schedule));
const s = createEvo(p);
const t0 = performance.now();
let minPop = Infinity;
// BRIEF=1: one line per run with mean segments / species at a few key moments.
const brief = process.env.BRIEF ? [p.schedule.noe[0], p.schedule.cambrian + 500, 6000, 9000, 12500, p.steps] : null;
const marks: string[] = [];
while (s.step < p.steps) {
  stepEvo(s, 1);
  minPop = Math.min(minPop, s.n);
  if (brief?.includes(s.step)) {
    const m = evoMetrics(s);
    marks.push(`${s.step}: seg ${m.meanSegments.toFixed(2)} sp ${m.species} pop ${m.population}`);
  }
  if (!brief && s.step % 500 === 0) {
    const m = evoMetrics(s);
    console.log(
      `${String(s.step).padStart(5)} ${formatYearsAgo(evoTimeAt(s.step, p.steps)).padEnd(26)} pop ${String(m.population).padStart(4)} sp ${String(m.species).padStart(3)} seg ${m.meanSegments.toFixed(2)} (max ${m.maxSegments}) size ${m.meanSize.toFixed(2)} pred ${(100 * m.predators).toFixed(0)}% O2 ${m.oxygen.toFixed(2)} food ${m.food} H ${m.diversity.toFixed(2)}`,
    );
  }
}
if (brief) console.log(marks.join(' | '));
console.log(`${((performance.now() - t0) / p.steps).toFixed(2)} ms/step; min population ${minPop}; tree nodes ${s.tree.length}, alive ${s.tree.filter((t) => t.died < 0).length}`);
