// Dev helper (Chapter 6 data check): what are the "repeated structures" made of?
// Runs a preset driven and control and prints cluster sizes and copy counts at several
// minimum sizes. Usage: npx tsx scripts/dev/copiesDiag.ts [presetName] [steps]
import { PRESETS, controlParams, makeParams } from '../../src/sim/params';
import { createState } from '../../src/sim/state';
import { stepSim } from '../../src/sim/physics';
import { findClusters, fingerprint } from '../../src/sim/metrics';

const preset = PRESETS.find((p) => p.name === (process.argv[2] ?? 'Demo A'))!;
const steps = Number(process.argv[3] ?? 60000);
const marks = [5000, 15000, 30000, steps];
const THRESHOLDS = [5, 10, 12, 15];

function report(label: string, s: ReturnType<typeof createState>): void {
  const c = findClusters(s);
  const sizes = c.members.map((m) => m.length);
  const bins = [0, 0, 0, 0];
  for (const n of sizes) bins[n < 10 ? 0 : n < 15 ? 1 : n < 30 ? 2 : 3]++;
  const keys = c.members.map((m) => fingerprint(s, m));
  const parts = THRESHOLDS.map((min) => {
    const tally = new Map<string, number[]>();
    keys.forEach((k, i) => {
      if (sizes[i] < min) return;
      const list = tally.get(k) ?? [];
      list.push(sizes[i]);
      tally.set(k, list);
    });
    let best: number[] = [];
    let repeated = 0;
    for (const list of tally.values()) {
      if (list.length >= 2) repeated++;
      if (list.length > best.length) best = list;
    }
    return `min${min}: copies ${best.length >= 2 ? best.length : 0} (sizes ${best.length >= 2 ? best.sort((a, b) => a - b).join(' ') : '-'}), shapes ${repeated}`;
  });
  console.log(`  ${label.padEnd(8)} clusters ${String(sizes.length).padStart(3)} [5-9:${bins[0]} 10-14:${bins[1]} 15-29:${bins[2]} 30+:${bins[3]}]\n      ${parts.join('\n      ')}`);
}

const driven = createState(makeParams(preset.params));
const control = createState(controlParams(makeParams(preset.params)));
console.log(`${preset.name}: ${JSON.stringify(preset.params)}`);
for (const m of marks) {
  stepSim(driven, m - driven.step);
  stepSim(control, m - control.step);
  console.log(`step ${m}`);
  report('driven', driven);
  report('control', control);
}
