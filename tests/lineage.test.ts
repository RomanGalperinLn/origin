import { describe, expect, it } from 'vitest';
import { POINTS, blendCreatures, creatureShape, creatureSvg, smoothPath } from '../src/lineage/creature';
import { STAGE_ART, STAGE_ORDER } from '../src/lineage/stages';

describe('lineage drawings', () => {
  it('has 24 key frames, all with the same six parts and point counts', () => {
    expect(STAGE_ORDER.length).toBe(24);
    const expected = [POINTS.body, POINTS.head, POINTS.limb, POINTS.limb, POINTS.tail, POINTS.eye];
    for (const id of STAGE_ORDER) expect(creatureShape(STAGE_ART[id]).parts.map((p) => p.length)).toEqual(expected);
  });

  it('every SVG has six paths in the same (back-to-front) order with the same number of commands', () => {
    const structure = (svg: string) => [...svg.matchAll(/<path id="([^"]+)" d="([^"]+)"/g)].map((m) => `${m[1]}:${m[2].replace(/[^MCZ]/g, '').length}`);
    const first = structure(creatureSvg(STAGE_ART[STAGE_ORDER[0]], 'x'));
    expect(first.map((s) => s.split(':')[0])).toEqual(['tail', 'back-limb', 'body', 'front-limb', 'head', 'eye']);
    for (const id of STAGE_ORDER) expect(structure(creatureSvg(STAGE_ART[id], id))).toEqual(first);
  });

  it('blending is exact at the key frames and finite in between', () => {
    for (let i = 0; i + 1 < STAGE_ORDER.length; i++) {
      const a = STAGE_ART[STAGE_ORDER[i]];
      const b = STAGE_ART[STAGE_ORDER[i + 1]];
      expect(smoothPath(creatureShape(blendCreatures(a, b, 0)).parts[0])).toBe(smoothPath(creatureShape(a).parts[0]));
      expect(smoothPath(creatureShape(blendCreatures(a, b, 1)).parts[1])).toBe(smoothPath(creatureShape(b).parts[1]));
      for (const u of [0.25, 0.5, 0.75])
        for (const part of creatureShape(blendCreatures(a, b, u)).parts)
          for (const [x, y] of part) {
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
            expect(x).toBeGreaterThan(-5);
            expect(x).toBeLessThan(405);
          }
    }
  });
});

import { STAGES, MIN_GAP, SEL_SHARE, lineageStateAt, stagePositions, knotAgo, knotFraction } from '../src/lineage/timeline';
import { CHAPTERS, chapterProgress } from '../src/time/chapters';
import { AGE, eventTime } from '../src/time/cosmic';
import brain from '../src/data/brainSize.json';

describe('lineage data and time scale', () => {
  it('24 stages in time order, each with a date inside its range, a short fact and a source', () => {
    expect(STAGES.map((s) => s.id)).toEqual(STAGE_ORDER);
    for (let k = 0; k < STAGES.length; k++) {
      const s = STAGES[k];
      if (k) expect(s.tAgo).toBeLessThan(STAGES[k - 1].tAgo);
      if (s.tAgoRange) {
        expect(s.tAgo).toBeGreaterThanOrEqual(s.tAgoRange[0]);
        expect(s.tAgo).toBeLessThanOrEqual(s.tAgoRange[1]);
      }
      expect(s.fact.split(/\s+/).length).toBeLessThan(15);
      expect(s.sourceKey).toMatch(/^S\d+/);
    }
  });

  it('agrees with the facts table at the chapter edges', () => {
    const evo = CHAPTERS.find((c) => c.id === 'evolution')!;
    expect(AGE - STAGES[0].tAgo).toBeCloseTo(evo.tStart, 0);
    expect(AGE - STAGES[STAGES.length - 1].tAgo).toBeCloseTo(evo.tEnd, 0);
    expect(STAGES.find((s) => s.id === 'chimp-lca')!.tAgo).toBe(AGE - eventTime('human-chimp-split'));
  });

  it('every stage gets at least 3% of the chapter; the last eight (from the chimp split) about a third', () => {
    const pos = stagePositions();
    expect(pos[0]).toBe(SEL_SHARE);
    expect(pos[pos.length - 1]).toBe(1);
    for (let k = 1; k < pos.length; k++) expect(pos[k] - pos[k - 1]).toBeGreaterThanOrEqual(MIN_GAP - 1e-9);
    const lca = STAGES.findIndex((s) => s.id === 'chimp-lca');
    expect(1 - pos[lca - 1]).toBeGreaterThan(0.28);
    expect(1 - pos[lca - 1]).toBeLessThan(0.42);
  });

  it('the slider passes each stage at its date, and time <-> slider round-trips', () => {
    const evo = CHAPTERS.find((c) => c.id === 'evolution')!;
    const i = CHAPTERS.indexOf(evo);
    const pos = stagePositions();
    STAGES.forEach((s, k) => {
      if (k === 0) return; // stage 1 is the chapter start; 7a comes first
      expect(chapterProgress(i, AGE - s.tAgo)).toBeCloseTo(pos[k], 6);
      const st = lineageStateAt(pos[k], pos);
      expect(st.i === k || (st.i === k - 1 && st.u === 1) || k === STAGES.length - 1).toBe(true);
    });
    for (const f of [0.05, 0.3, 0.77, 0.99]) expect(knotFraction(evo.knots!, knotAgo(evo.knots!, f))).toBeCloseTo(f, 9);
  });

  it('brain sizes: values inside their ranges; chimpanzee reference and Neanderthal side branch present', () => {
    for (const e of brain.entries) {
      expect(e.cc).toBeGreaterThanOrEqual(e.ccRange[0]);
      expect(e.cc).toBeLessThanOrEqual(e.ccRange[1]);
    }
    expect(brain.entries.some((e) => e.kind === 'reference')).toBe(true);
    expect(brain.entries.some((e) => e.kind === 'side-branch')).toBe(true);
  });
});

import { BrainChart, revealAgo, type BrainEntry } from '../src/ui/brainChart';

describe('brain-size chart', () => {
  const entries = brain.entries as BrainEntry[];
  const endAgo = AGE - CHAPTERS.find((c) => c.id === 'evolution')!.tEnd;
  it('every fossil point (incl. modern humans and the Neanderthal side branch) is shown by the end of chapter 7', () => {
    for (const e of entries.filter((x) => x.kind !== 'reference')) expect(endAgo).toBeLessThanOrEqual(revealAgo(e) * 1.0001);
  });
  it('our lineage reaches the modern-human value at the Homo sapiens key frame', () => {
    const sapiens = entries.find((e) => e.id === 'sapiens')!;
    expect(BrainChart.lineageCc(entries, endAgo)).toBeCloseTo(sapiens.cc, 6);
    expect(BrainChart.lineageCc(entries, 1e8)).toBeNull();
  });
});
