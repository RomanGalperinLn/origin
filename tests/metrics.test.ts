import { describe, expect, it } from 'vitest';
import { makeParams } from '../src/sim/params';
import { createState, type SimState } from '../src/sim/state';
import { computeMetrics, copyStats, findClusters, orderByCompression } from '../src/sim/metrics';

/** A state whose particles sit exactly where we put them. */
function handMade(points: [number, number, number][], L = 20): SimState {
  const s = createState(makeParams({ N: points.length, L }));
  points.forEach(([x, y, t], i) => {
    s.x[i] = x;
    s.y[i] = y;
    s.type[i] = t;
  });
  return s;
}

function blob(cx: number, cy: number, n: number, type = 0): [number, number, number][] {
  // Small ring + centre, neighbours 0.3 apart (< r_link = 0.5).
  const pts: [number, number, number][] = [[cx, cy, type]];
  for (let k = 0; k < n - 1; k++) {
    const a = (2 * Math.PI * k) / (n - 1);
    pts.push([cx + 0.3 * Math.cos(a), cy + 0.3 * Math.sin(a), type]);
  }
  return pts;
}

describe('clustering', () => {
  it('two separated blobs give exactly 2 clusters', () => {
    const s = handMade([...blob(5, 5, 8), ...blob(14, 12, 10)]);
    const c = findClusters(s);
    expect(c.members.length).toBe(2);
    expect(c.members.map((m) => m.length).sort()).toEqual([10, 8].sort());
  });

  it('ignores clusters smaller than min size and lone particles', () => {
    const s = handMade([...blob(5, 5, 8), ...blob(14, 12, 3), [10, 2, 0]]);
    expect(findClusters(s).members.length).toBe(1);
  });

  it('links across the periodic boundary', () => {
    const s = handMade([...blob(0.1, 10, 4), ...blob(19.95, 10, 4)]);
    // Two 4-particle halves of one blob that straddles x = 0.
    for (let i = 0; i < s.params.N; i++) s.x[i] = ((s.x[i] % 20) + 20) % 20;
    expect(findClusters(s).members.length).toBe(1);
  });

  it('identical blobs count as copies', () => {
    const s = handMade([...blob(4, 4, 7, 1), ...blob(12, 4, 7, 1), ...blob(8, 14, 7, 1), ...blob(15, 15, 9, 2)]);
    const cs = copyStats(s, findClusters(s));
    expect(cs.maxCopies).toBe(3);
    expect(cs.repeatedShapes).toBe(1);
  });
});

describe('order', () => {
  it('a tidy state is more compressible than a random one', () => {
    const random = createState(makeParams({ N: 1500, L: 25 }));
    const tidy = createState(makeParams({ N: 1500, L: 25 }));
    for (let i = 0; i < 1500; i++) {
      tidy.x[i] = (i % 50) * 0.1;
      tidy.y[i] = Math.floor(i / 50) * 0.1;
      tidy.type[i] = 0;
    }
    expect(orderByCompression(tidy)).toBeGreaterThan(orderByCompression(random));
  });

  it('computeMetrics returns finite numbers', () => {
    const m = computeMetrics(createState(makeParams({ N: 400, L: 13 })));
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
  });
});
