import { describe, expect, it } from 'vitest';
import { makeParams } from '../src/sim/params';
import { createState, type SimState } from '../src/sim/state';
import { computeForces, pairForce, stepSim } from '../src/sim/physics';

function sameArrays(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

describe('determinism', () => {
  it('same seed and params give bit-identical state after 2000 steps', () => {
    const p = makeParams({ seed: 7, N: 600, L: 25 });
    const a = createState(p);
    const b = createState(p);
    stepSim(a, 2000);
    stepSim(b, 2000);
    expect(sameArrays(a.x, b.x)).toBe(true);
    expect(sameArrays(a.y, b.y)).toBe(true);
    expect(sameArrays(a.vx, b.vx)).toBe(true);
    expect(sameArrays(a.vy, b.vy)).toBe(true);
    expect(a.W).toBe(b.W);
    expect(a.Q).toBe(b.Q);
  });

  it('different seeds diverge', () => {
    const a = createState(makeParams({ seed: 1, N: 300, L: 20 }));
    const b = createState(makeParams({ seed: 2, N: 300, L: 20 }));
    stepSim(a, 50);
    stepSim(b, 50);
    expect(sameArrays(a.x, b.x)).toBe(false);
  });
});

// Brute-force O(N^2) reference for the grid.
function bruteForces(s: SimState): { fx: Float64Array; fy: Float64Array } {
  const { N, L, rMax, beta, kForce, K } = s.params;
  const fx = new Float64Array(N);
  const fy = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      let dx = s.x[j] - s.x[i];
      let dy = s.y[j] - s.y[i];
      dx -= L * Math.round(dx / L);
      dy -= L * Math.round(dy / L);
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= rMax) continue;
      const f = kForce * pairForce(d / rMax, s.A[s.type[i] * K + s.type[j]], beta);
      fx[i] += (f * dx) / d;
      fy[i] += (f * dy) / d;
    }
  }
  return { fx, fy };
}

describe('spatial grid', () => {
  it('matches brute force for N = 200', () => {
    const s = createState(makeParams({ seed: 3, N: 200, L: 8 }));
    stepSim(s, 20); // move a bit so particles sit near cell edges and wrap
    const fx = new Float64Array(200);
    const fy = new Float64Array(200);
    computeForces(s, fx, fy);
    const ref = bruteForces(s);
    for (let i = 0; i < 200; i++) {
      expect(fx[i]).toBeCloseTo(ref.fx[i], 4);
      expect(fy[i]).toBeCloseTo(ref.fy[i], 4);
    }
  });

  it('also matches with a non-integer number of cells per side', () => {
    const s = createState(makeParams({ seed: 4, N: 200, L: 7.3 }));
    const fx = new Float64Array(200);
    const fy = new Float64Array(200);
    computeForces(s, fx, fy);
    const ref = bruteForces(s);
    for (let i = 0; i < 200; i++) {
      expect(fx[i]).toBeCloseTo(ref.fx[i], 4);
      expect(fy[i]).toBeCloseTo(ref.fy[i], 4);
    }
  });
});

describe('integrator sanity', () => {
  it('conserves kinetic + potential energy with no friction, noise or driving', () => {
    const p = makeParams({ seed: 5, N: 300, L: 18, gamma: 0, T: 0, E0: 0, dt: 0.005 });
    const s = createState(p);
    // Energy is only conserved for reciprocal forces, so symmetrise A.
    const K = p.K;
    for (let i = 0; i < K; i++)
      for (let j = i + 1; j < K; j++) {
        const m = 0.5 * (s.A[i * K + j] + s.A[j * K + i]);
        s.A[i * K + j] = m;
        s.A[j * K + i] = m;
      }

    // Pair potential U(d) = -integral_d^rMax kForce f(u/rMax) du (midpoint rule).
    const pairEnergy = (d: number, a: number) => {
      const n = 200;
      const h = (p.rMax - d) / n;
      let acc = 0;
      for (let k = 0; k < n; k++) acc += p.kForce * pairForce((d + (k + 0.5) * h) / p.rMax, a, p.beta) * h;
      return -acc;
    };

    const energy = () => {
      let kin = 0;
      for (let i = 0; i < p.N; i++) kin += 0.5 * (s.vx[i] ** 2 + s.vy[i] ** 2);
      let pot = 0;
      for (let i = 0; i < p.N; i++)
        for (let j = i + 1; j < p.N; j++) {
          let dx = s.x[j] - s.x[i];
          let dy = s.y[j] - s.y[i];
          dx -= p.L * Math.round(dx / p.L);
          dy -= p.L * Math.round(dy / p.L);
          const d = Math.hypot(dx, dy);
          if (d < p.rMax) pot += pairEnergy(d, s.A[s.type[i] * K + s.type[j]]);
        }
      return { kin, pot, total: kin + pot };
    };

    const e0 = energy();
    stepSim(s, 400);
    const e1 = energy();
    // Something actually happened...
    expect(e1.kin).toBeGreaterThan(1);
    // ...and the total moved by much less than the kinetic energy produced.
    expect(Math.abs(e1.total - e0.total)).toBeLessThan(0.05 * Math.abs(e1.kin) + 0.5);
  });
});
