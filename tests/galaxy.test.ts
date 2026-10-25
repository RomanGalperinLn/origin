import { describe, expect, it } from 'vitest';
import { makeGalaxyParams } from '../src/galaxy/params';
import { GAS, OUT_STRIDE, createGalaxy, galaxyAt, galaxyTiming, omega, rotationSlowdown, sunPosition } from '../src/galaxy/model';

const p = makeGalaxyParams({ stars: 4000, satelliteStars: 200 });
const tm = galaxyTiming();
const g = createGalaxy(p);
const buf = new Float32Array(g.n * OUT_STRIDE);

describe('galaxy model', () => {
  it('uses dates from events.json in the right order', () => {
    expect(tm.tStart).toBeLessThan(tm.mergerStart);
    expect(tm.mergerStart).toBeLessThan(tm.mergerEnd);
    expect(tm.armsStart).toBeLessThan(tm.armsFull);
    expect(tm.armsFull).toBeLessThan(tm.tEnd);
  });

  it('is deterministic', () => {
    const a = createGalaxy(p);
    const b = createGalaxy(p);
    const ba = new Float32Array(a.n * OUT_STRIDE);
    const bb = new Float32Array(b.n * OUT_STRIDE);
    galaxyAt(a, tm, 9e9, ba);
    galaxyAt(b, tm, 9e9, bb);
    expect(Array.from(ba)).toEqual(Array.from(bb));
  });

  it('the cloud flattens into a thin disk and arms appear only once it has settled', () => {
    const start = galaxyAt(g, tm, tm.tStart, buf);
    const end = galaxyAt(g, tm, tm.tEnd, buf);
    expect(start.thickness).toBeGreaterThan(5 * end.thickness);
    expect(end.thickness).toBeLessThan(0.6); // kpc: a thin disk
    expect(galaxyAt(g, tm, tm.armsStart - 1e8, buf).arms).toBe(0);
    expect(galaxyAt(g, tm, tm.armsStart - 1e8, buf).starForming).toBe(0);
    expect(end.arms).toBeCloseTo(1);
    expect(end.starForming).toBeGreaterThan(0);
  });

  it('differential rotation: inner stars turn faster; the Sun\'s orbit takes about 200-250 million years', () => {
    expect(omega(p, 2)).toBeGreaterThan(omega(p, 8));
    const period = (2 * Math.PI) / omega(p, p.sunRadius);
    expect(period).toBeGreaterThan(2e8);
    expect(period).toBeLessThan(2.5e8);
    expect(rotationSlowdown(p, tm)).toBeGreaterThan(1);
  });

  it('gas lights up near the arms (density wave), not everywhere', () => {
    galaxyAt(g, tm, tm.tEnd, buf);
    let lit = 0;
    let gas = 0;
    for (let i = 0; i < g.n; i++)
      if (g.kind[i] === GAS) {
        gas++;
        if (buf[i * OUT_STRIDE + 3] > 1) lit++;
      }
    expect(lit).toBeGreaterThan(0.05 * gas);
    expect(lit).toBeLessThan(0.5 * gas);
  });

  it('marks the Sun at its distance from the centre', () => {
    const [x, y] = sunPosition(p, tm, tm.tEnd);
    expect(Math.hypot(x, y)).toBeCloseTo(p.sunRadius);
  });
});
