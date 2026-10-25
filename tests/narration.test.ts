import { describe, expect, it } from 'vitest';
import { NARRATION, resolveNarration } from '../src/lineage/narration';
import raw from '../src/data/narration/evolution.json';
import { STAGES } from '../src/lineage/timeline';

describe('chapter 7 narration', () => {
  it('every template resolves from the data files, and every trigger exists', () => {
    for (const l of NARRATION) {
      expect(l.text).not.toMatch(/[{}]/);
      expect(['chapter', 'lineage', 'end', ...STAGES.map((s) => s.id)]).toContain(l.at);
      expect(l.text.split(/\s+/).length).toBeLessThanOrEqual(18); // short: a stage passes every 2-3 s
    }
    expect(() => resolveNarration('{when:no-such-stage}')).toThrow();
  });

  it('no typed dates or sizes: numbers come only through templates', () => {
    // The raw text may only contain digits inside {…} templates (plus none at all elsewhere).
    for (const l of raw.lines) expect(l.text.replace(/\{[^}]*\}/g, '')).not.toMatch(/\d/);
  });

  it('honesty: shared ancestors, never "descended from monkeys"; both theme lines present', () => {
    const all = NARRATION.map((l) => l.text).join(' ');
    expect(all).not.toMatch(/descend(ed|s)? from (monkeys|apes|chimpanzees)/i);
    expect(all).toMatch(/share ancestors/);
    expect(NARRATION.filter((l) => /cousins, not our ancestors/.test(l.text)).length).toBe(1);
    expect(NARRATION[0].text).toMatch(/disordered chemistry/);
    expect(NARRATION[NARRATION.length - 1].text).toMatch(/most complex structure/);
  });
});
