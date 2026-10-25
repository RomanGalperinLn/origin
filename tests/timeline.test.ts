import { describe, expect, it } from 'vitest';
import { makeParams } from '../src/sim/params';
import { cloneState, createState } from '../src/sim/state';
import { meanDisplacement, reverseVelocities, stepSim } from '../src/sim/physics';
import { Timeline } from '../src/sim/timeline';

const params = makeParams({ seed: 11, N: 500, L: 14.4, snapshotEvery: 500 });

describe('seek', () => {
  it('seeking via a snapshot gives the same state as running straight there', () => {
    const direct = createState(params);
    stepSim(direct, 3000);

    const tl = new Timeline(params);
    tl.advance(2000);
    const view = cloneState(tl.head);
    tl.advance(1500); // head now past the target
    tl.seek(view, 1234); // go backwards first (restores from the 1000 snapshot)
    expect(view.step).toBe(1234);
    tl.seek(view, 3000);
    expect(view.step).toBe(3000);
    expect(Array.from(view.x)).toEqual(Array.from(direct.x));
    expect(Array.from(view.vy)).toEqual(Array.from(direct.vy));
    expect(view.W).toBe(direct.W);
    expect(view.rng).toEqual(direct.rng);
  });

  it('records a metric sample every metricsEvery steps', () => {
    const tl = new Timeline(params);
    tl.advance(95);
    expect(tl.metrics.map((m) => m.step)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(tl.metricAt(57).step).toBe(50);
  });
});

describe('reverse time', () => {
  it('without friction, noise or field, an exact flip retraces the path', () => {
    const s = createState(params);
    stepSim(s, 1000);
    s.params = { ...s.params, gamma: 0, T: 0, E0: 0 };
    const start = cloneState(s);
    stepSim(s, 100);
    const away = meanDisplacement(s.x, s.y, start.x, start.y, s.params.L);
    reverseVelocities(s, true);
    stepSim(s, 100);
    const back = meanDisplacement(s.x, s.y, start.x, start.y, s.params.L);
    expect(away).toBeGreaterThan(0.1);
    expect(back).toBeLessThan(1e-6);
  });

  it('with the heat bath, flipping velocities does not go back', () => {
    const s = createState(params);
    stepSim(s, 1000);
    const start = cloneState(s);
    stepSim(s, 300);
    reverseVelocities(s, true);
    stepSim(s, 300);
    expect(meanDisplacement(s.x, s.y, start.x, start.y, s.params.L)).toBeGreaterThan(0.1);
  });
});
