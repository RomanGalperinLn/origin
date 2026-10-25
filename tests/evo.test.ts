import { describe, expect, it } from 'vitest';
import { makeEvoParams, type EvoParams } from '../src/evo/params';
import { evoSchedule, evoStepAt, evoTimeAt } from '../src/evo/schedule';
import { cloneEvo, copyEvoInto, createEvo, environmentAt, evoMetrics, stepEvo, type EvoMetrics, type EvoState } from '../src/evo/world';
import { GenericTimeline } from '../src/sim/timeline';
import { eventTime } from '../src/time/cosmic';

const realParams = (over: Partial<EvoParams> = {}): EvoParams => {
  const p = makeEvoParams(over);
  return { ...p, schedule: evoSchedule(p.steps) };
};

describe('evolution schedule (real dates)', () => {
  it('maps events.json dates to steps in the right order', () => {
    const sc = evoSchedule(20000);
    expect(sc.goe[0]).toBeLessThan(sc.goe[1]);
    expect(sc.goe[1]).toBeLessThan(sc.snowball[0]);
    expect(sc.snowball[0]).toBeLessThan(sc.snowball[1]);
    expect(sc.noe[0]).toBeLessThan(sc.snowball[0]); // the oxygen rise spans Snowball Earth
    expect(sc.noe[1]).toBeLessThanOrEqual(sc.cambrian);
    expect(sc.cambrian).toBeLessThan(sc.extinctions[0].step);
    expect(sc.extinctions[0].step).toBeLessThan(sc.extinctions[1].step);
  });

  it('step <-> time round-trips', () => {
    for (const id of ['great-oxidation', 'cambrian', 'end-cretaceous']) {
      const t = eventTime(id);
      const back = evoTimeAt(evoStepAt(t, 20000), 20000);
      expect(Math.abs(back - t) / (13.8e9 - t)).toBeLessThan(0.01); // within 1% of "years ago"
    }
  });

  it('oxygen follows the schedule; the control never rises', () => {
    const p = realParams();
    expect(environmentAt(p, 0).oxygen).toBeCloseTo(p.oxygenLow);
    expect(environmentAt(p, p.schedule.goe[1]).oxygen).toBeCloseTo(p.oxygenMid);
    expect(environmentAt(p, p.steps).oxygen).toBeCloseTo(1);
    expect(environmentAt({ ...p, oxygenRises: false }, p.steps).oxygen).toBeCloseTo(p.oxygenLow);
    const mid = (p.schedule.snowball[0] + p.schedule.snowball[1]) / 2;
    expect(environmentAt(p, mid).foodRate).toBeLessThan(environmentAt(p, 0).foodRate);
  });
});

describe('evolution model', () => {
  it('is deterministic', () => {
    const p = realParams({ steps: 2000 });
    const a = createEvo(p);
    const b = createEvo(p);
    stepEvo(a, 600);
    stepEvo(b, 600);
    expect(a.n).toBe(b.n);
    expect(Array.from(a.org.subarray(0, a.n * 16))).toEqual(Array.from(b.org.subarray(0, b.n * 16)));
    expect(a.tree).toEqual(b.tree);
  });

  it('seeking via snapshots gives the same state as a straight run', () => {
    const p = realParams({ steps: 2000, snapshotEvery: 100 });
    const tl = new GenericTimeline<EvoState, EvoMetrics>(
      { step: stepEvo, stepOf: (s) => s.step, clone: cloneEvo, copyInto: copyEvoInto, metrics: evoMetrics, metricsEvery: 10, snapshotEvery: 100 },
      createEvo(p),
    );
    tl.advance(800);
    const view = cloneEvo(tl.head);
    tl.seek(view, 537);
    const straight = createEvo(p);
    stepEvo(straight, 537);
    expect(view.n).toBe(straight.n);
    expect(Array.from(view.org.subarray(0, view.n * 16))).toEqual(Array.from(straight.org.subarray(0, straight.n * 16)));
    expect(view.rng).toEqual(straight.rng);
  });

  it(
    'complexity stays at one cell before the oxygen rise and grows after; the no-oxygen control stays simple',
    () => {
      const p = realParams();
      const run = (params: EvoParams) => {
        const s = createEvo(params);
        let minPop = Infinity;
        let maxPop = 0;
        let before = 0;
        const popAt: Record<number, number> = {};
        while (s.step < params.steps) {
          for (const e of params.schedule.extinctions) if (s.step === e.step) popAt[e.step] = s.n;
          stepEvo(s, 1);
          for (const e of params.schedule.extinctions) if (s.step === e.step + 1) popAt[-e.step] = s.n;
          minPop = Math.min(minPop, s.n);
          maxPop = Math.max(maxPop, s.n);
          if (s.step === params.schedule.noe[0]) before = evoMetrics(s).meanSegments;
        }
        return { s, minPop, maxPop, before, end: evoMetrics(s).meanSegments, popAt };
      };
      const oxy = run(p);
      const ctl = run({ ...p, oxygenRises: false });

      expect(oxy.before).toBeLessThan(1.15);
      expect(oxy.end).toBeGreaterThan(1.5);
      expect(ctl.end).toBeLessThan(1.15);
      // Stable population: no crash to zero, never above the cap.
      for (const r of [oxy, ctl]) {
        expect(r.minPop).toBeGreaterThan(50);
        expect(r.maxPop).toBeLessThanOrEqual(p.maxPopulation);
      }
      // Extinctions wipe out whole lineages at once (visible on the tree) and thin the population.
      expect(p.schedule.extinctions.map((e) => e.fraction)).toEqual([0.9, 0.75]); // from events.json
      for (const e of p.schedule.extinctions) {
        const ended = oxy.s.tree.filter((n) => n.died === e.step).length;
        expect(ended).toBeGreaterThan(0);
        expect(oxy.popAt[-e.step]).toBeLessThan(oxy.popAt[e.step]);
      }
      expect(oxy.s.tree.filter((n) => n.died >= 0).length).toBeGreaterThan(3);
      expect(oxy.s.tree.length).toBeGreaterThan(10);
    },
    60000,
  );
});
