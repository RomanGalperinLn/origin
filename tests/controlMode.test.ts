import { describe, expect, it } from 'vitest';
import { paramsFor } from '../src/control/controlMode';
import { PRESETS, makeParams } from '../src/sim/params';
import { createState } from '../src/sim/state';
import { makeEvoParams } from '../src/evo/params';
import { evoSchedule } from '../src/evo/schedule';
import { createEvo, evoMetrics, stepEvo } from '../src/evo/world';

describe('CONTROLLED / RELEASED switch', () => {
  it('RELEASED leaves every chapter exactly as before', () => {
    const life = makeParams(PRESETS[0].params);
    expect(paramsFor('life', 'released', life)).toBe(life);
    const evo = makeEvoParams();
    expect(paramsFor('evolution', 'released', evo)).toBe(evo);
  });

  it('CONTROLLED chapter 6 starts as a neat lattice in bands grouped by type, with the same physics', () => {
    const released = createState(makeParams(PRESETS[0].params));
    const controlled = createState(paramsFor('life', 'controlled', makeParams(PRESETS[0].params)));
    expect(controlled.params.T).toBe(0);
    expect(controlled.params.E0).toBe(released.params.E0); // the energy source stays on
    expect(Array.from(controlled.A)).toEqual(Array.from(released.A)); // same interactions and charges
    expect(Array.from(controlled.q)).toEqual(Array.from(released.q));
    for (let i = 1; i < controlled.type.length; i++) expect(controlled.type[i]).toBeGreaterThanOrEqual(controlled.type[i - 1]);
  });

  it('CONTROLLED chapter 7: no variation, so no new species and no complexity, ever', () => {
    const base = makeEvoParams({ steps: 6000 });
    const p = paramsFor('evolution', 'controlled', { ...base, schedule: evoSchedule(base.steps) });
    const s = createEvo(p);
    stepEvo(s, 6000);
    const m = evoMetrics(s);
    expect(m.species).toBe(1);
    expect(m.meanSegments).toBe(1);
    expect(s.tree.length).toBe(1);
    expect(m.population).toBeGreaterThan(50);
  }, 60000);
});
