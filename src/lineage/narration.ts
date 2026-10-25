// Chapter 7 narration: lines from src/data/narration/evolution.json with their templates
// filled from the data files, so every date and number traces back to sources.md.
// Shared by the app (subtitles, pre-generated audio) and scripts/generateNarration.ts.

import narration from '../data/narration/evolution.json';
import lineage from '../data/lineage.json';
import brain from '../data/brainSize.json';
import { AGE, eventTime, formatYearsAgo } from '../time/cosmic';

export interface NarrationLine {
  id: string;
  /** 'chapter' (start of chapter 7), 'lineage' (start of 7b), 'end' (just before the end) or a lineage stage id. */
  at: string;
  /** Seconds after the trigger. */
  delay?: number;
  text: string;
}

const about = (ago: number) => `about ${formatYearsAgo(AGE - ago)}`;

/** Fills {when:STAGE}, {split:COUSIN}, {event:ID} and {cc:ID}; throws on an unknown key (no silent gaps). */
export function resolveNarration(text: string): string {
  return text.replace(/\{(when|split|event|cc):([a-z0-9-]+)\}/g, (_m, kind: string, id: string) => {
    if (kind === 'when') {
      const s = lineage.stages.find((x) => x.id === id);
      if (!s) throw new Error(`narration: unknown stage ${id}`);
      return about(s.tAgo);
    }
    if (kind === 'split') {
      const c = lineage.stages.flatMap((x) => x.cousinsBranchingHere).find((x) => x.id === id);
      if (!c) throw new Error(`narration: unknown cousin ${id}`);
      return about(c.tAgo);
    }
    if (kind === 'event') return about(AGE - eventTime(id));
    const e = brain.entries.find((x) => x.id === id);
    if (!e) throw new Error(`narration: unknown brain entry ${id}`);
    return String(Math.round(e.cc / 10) * 10);
  });
}

export const NARRATION: NarrationLine[] = (narration.lines as NarrationLine[]).map((l) => ({ ...l, text: resolveNarration(l.text) }));
