import { describe, expect, it } from 'vitest';
import { EARTH_MASS, makeSolarParams } from '../src/solar/params';
import {
  cbrt,
  computeAccel,
  cloneSolar,
  copySolarInto,
  createSolar,
  findEarth,
  mergeTouching,
  orbitOf,
  radiusOf,
  sinCos,
  solarMetrics,
  stepSolar,
  type SolarMetrics,
  type SolarState,
} from '../src/solar/nbody';
import { GenericTimeline } from '../src/sim/timeline';

const small = makeSolarParams({ N: 120, steps: 600, snapshotEvery: 100, metricsEvery: 20 });

function totalMomentum(s: SolarState): [number, number] {
  let px = 0;
  let py = 0;
  for (let i = 0; i < s.x.length; i++) {
    px += s.m[i] * s.vx[i];
    py += s.m[i] * s.vy[i];
  }
  return [px, py];
}

describe('solar system N-body', () => {
  it('portable math matches Math.cbrt / sin / cos', () => {
    for (const q of [0.001, 0.00625, 0.5, 1, 2.7, 80]) expect(cbrt(q)).toBeCloseTo(Math.cbrt(q), 14);
    for (let k = -50; k <= 50; k++) {
      const [s, c] = sinCos(k * 0.37);
      expect(s).toBeCloseTo(Math.sin(k * 0.37), 14);
      expect(c).toBeCloseTo(Math.cos(k * 0.37), 14);
    }
  });

  it('is deterministic', () => {
    const a = createSolar(small);
    const b = createSolar(small);
    stepSolar(a, 300);
    stepSolar(b, 300);
    expect(Array.from(a.x)).toEqual(Array.from(b.x));
    expect(Array.from(a.vy)).toEqual(Array.from(b.vy));
    expect(a.collisions).toBe(b.collisions);
  });

  it('merging conserves mass and momentum and puts the body at the centre of mass', () => {
    const s = createSolar(makeSolarParams({ N: 2 }));
    s.x.set([1, 1.0005]);
    s.y.set([0, 0.0002]);
    s.vx.set([0.1, -0.3]);
    s.vy.set([6.2, 6.0]);
    s.m.set([2 * EARTH_MASS, 0.5 * EARTH_MASS]);
    const p0 = totalMomentum(s);
    const comX = (2 * 1 + 0.5 * 1.0005) / 2.5;
    expect(mergeTouching(s)).toBe(1);
    expect(s.alive[0] + s.alive[1]).toBe(1);
    expect(s.m[0] + s.m[1]).toBeCloseTo(2.5 * EARTH_MASS, 20);
    const p1 = totalMomentum(s);
    expect(p1[0]).toBeCloseTo(p0[0], 18);
    expect(p1[1]).toBeCloseTo(p0[1], 18);
    expect(s.x[0]).toBeCloseTo(comX, 14); // the heavier body (index 0) keeps its index
    expect(s.r[0]).toBeCloseTo(radiusOf(s.params, 2.5 * EARTH_MASS), 15);
  });

  it('keeps total mass through a run (nothing lost in a short run)', () => {
    const s = createSolar(small);
    const m0 = solarMetrics(s).totalMass;
    stepSolar(s, 600);
    const m = solarMetrics(s);
    expect(m.collisions).toBeGreaterThan(0);
    expect(m.lost).toBe(0);
    expect(m.totalMass).toBeCloseTo(m0, 10);
  });

  it('orbits stay near-Keplerian without collisions (leapfrog stability)', () => {
    // Negligible masses and real radii: each body should keep its orbit over ~100 orbits at 1 AU.
    const p = makeSolarParams({ N: 40, diskMassEarth: 1e-4, gravityBoost: 1, radiusInflation: 1, eRms: 0.02 });
    const s = createSolar(p);
    const a0 = Array.from(s.x, (_, i) => orbitOf(s.x[i], s.y[i], s.vx[i], s.vy[i]));
    stepSolar(s, 10000);
    expect(s.lost).toBe(0);
    for (let i = 0; i < s.x.length; i++) {
      if (!s.alive[i]) continue;
      const o = orbitOf(s.x[i], s.y[i], s.vx[i], s.vy[i]);
      expect(Math.abs(o.a - a0[i].a) / a0[i].a).toBeLessThan(0.01);
      expect(o.e).toBeLessThan(0.2);
    }
  });

  it('a single circular orbit at 1 AU takes one year and stays circular', () => {
    const s = createSolar(makeSolarParams({ N: 1, eRms: 0 }));
    const { a } = orbitOf(s.x[0], s.y[0], s.vx[0], s.vy[0]);
    // Put the body at exactly 1 AU on a circular orbit.
    s.x[0] = 1;
    s.y[0] = 0;
    s.vx[0] = 0;
    s.vy[0] = 2 * Math.PI;
    computeAccel(s);
    stepSolar(s, 100); // 1 year at dt = 0.01
    expect(a).toBeGreaterThan(0);
    expect(Math.hypot(s.x[0] - 1, s.y[0])).toBeLessThan(0.02);
    const o = orbitOf(s.x[0], s.y[0], s.vx[0], s.vy[0]);
    expect(o.a).toBeCloseTo(1, 3);
    expect(o.e).toBeLessThan(1e-3);
  });

  it('seek gives exactly the straight-run state', () => {
    const tl = new GenericTimeline<SolarState, SolarMetrics>(
      {
        step: stepSolar,
        stepOf: (s) => s.step,
        clone: cloneSolar,
        copyInto: copySolarInto,
        metrics: solarMetrics,
        metricsEvery: small.metricsEvery,
        snapshotEvery: small.snapshotEvery,
      },
      createSolar(small),
    );
    tl.advance(600);
    const view = cloneSolar(tl.head);
    tl.seek(view, 437);
    const straight = createSolar(small);
    stepSolar(straight, 437);
    expect(view.step).toBe(437);
    expect(Array.from(view.x)).toEqual(Array.from(straight.x));
    expect(Array.from(view.vx)).toEqual(Array.from(straight.vx));
    expect(Array.from(view.m)).toEqual(Array.from(straight.m));
  });

  it('finds Earth as the largest body in the Earth zone', () => {
    const s = createSolar(makeSolarParams({ N: 3, eRms: 0 }));
    const put = (i: number, r: number, m: number) => {
      s.x[i] = r;
      s.y[i] = 0;
      s.vx[i] = 0;
      s.vy[i] = 2 * Math.PI / Math.sqrt(r);
      s.m[i] = m * EARTH_MASS;
    };
    put(0, 0.9, 0.3);
    put(1, 1.1, 0.8);
    put(2, 2.0, 3);
    expect(findEarth(s)).toEqual({ index: 1, inZone: true });
    put(1, 1.5, 0.8);
    put(0, 0.5, 0.3);
    expect(findEarth(s)).toEqual({ index: 1, inZone: false }); // closest planet to 1 AU
  });
});
