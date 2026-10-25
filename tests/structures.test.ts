import { describe, expect, it } from 'vitest';
import { PRESETS, makeParams } from '../src/sim/params';
import { createState } from '../src/sim/state';
import { stepSim } from '../src/sim/physics';
import { computeMetrics } from '../src/sim/metrics';
import { structuresOf } from '../src/sim/structures';

describe('chapter 6 decorations', () => {
  it('drawing structures (bonds, outlines, colours) never changes the simulation or its metrics', () => {
    const p = makeParams({ ...PRESETS[0].params, N: 600, L: 25 * Math.sqrt(600 / 1500) });
    const plain = createState(p);
    const decorated = createState(p);
    const a = [];
    const b = [];
    for (let k = 0; k < 20; k++) {
      stepSim(plain, 100);
      stepSim(decorated, 100);
      // What the worker does for each displayed frame: clusters and fingerprints of a copy of the positions.
      const xy = new Float32Array(2 * decorated.x.length);
      for (let i = 0; i < decorated.x.length; i++) {
        xy[2 * i] = decorated.x[i];
        xy[2 * i + 1] = decorated.y[i];
      }
      const st = structuresOf(decorated.params, decorated.type, xy);
      expect(st.label.length).toBe(p.N);
      a.push(computeMetrics(plain));
      b.push(computeMetrics(decorated));
    }
    expect(b).toEqual(a);
    expect(Array.from(decorated.x)).toEqual(Array.from(plain.x));
    expect(Array.from(decorated.vy)).toEqual(Array.from(plain.vy));
  });

  it('same composition and shape get the same colour', () => {
    const p = makeParams({ ...PRESETS[0].params, N: 600, L: 25 * Math.sqrt(600 / 1500) });
    const s = createState(p);
    stepSim(s, 3000);
    const xy = new Float32Array(2 * s.x.length);
    for (let i = 0; i < s.x.length; i++) {
      xy[2 * i] = s.x[i];
      xy[2 * i + 1] = s.y[i];
    }
    const st = structuresOf(s.params, s.type, xy);
    // Clusters reported as matching share a hue, and their count equals the number with that hue.
    for (let c = 0; c < st.hue.length; c++) {
      const same = Array.from(st.hue).filter((h) => h === st.hue[c]).length;
      expect(st.matches[c]).toBe(same);
    }
  });
});
