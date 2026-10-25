// Turns the real dates in events.json into simulation steps. Steps are spread evenly
// along chapter 7's stretch of the master slider, so what is on screen always matches
// the date on the readouts.

import { EVENTS, eventTime } from '../time/cosmic';
import { CHAPTERS, chapterProgress } from '../time/chapters';
import type { EvoSchedule } from './params';

const CHAPTER = CHAPTERS.findIndex((c) => c.id === 'evolution');

/** Simulation step shown at time t (years since the Big Bang). */
export function evoStepAt(t: number, steps: number): number {
  return Math.max(0, Math.min(steps, Math.round(steps * chapterProgress(CHAPTER, t))));
}

/** Time of a step: inverse of evoStepAt (bisection; the mapping is monotonic). */
export function evoTimeAt(step: number, steps: number): number {
  const c = CHAPTERS[CHAPTER];
  let lo = c.tStart;
  let hi = c.tEnd;
  const f = step / steps;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (chapterProgress(CHAPTER, mid) < f) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function evoSchedule(steps: number): EvoSchedule {
  const at = (id: string, which: 'mid' | 'earliest' | 'latest' = 'mid') => evoStepAt(eventTime(id, which), steps);
  return {
    goe: [at('great-oxidation', 'earliest'), at('great-oxidation', 'latest')],
    noe: [at('neoproterozoic-oxygenation', 'earliest'), at('neoproterozoic-oxygenation', 'latest')],
    snowball: [at('snowball-earth', 'earliest'), at('snowball-earth', 'latest')],
    cambrian: at('cambrian'),
    // Mass extinctions wipe out the fraction of species the facts table cites.
    extinctions: EVENTS.filter((e) => e.speciesLost !== undefined && e.chapter === 'evolution').map((e) => ({
      step: evoStepAt(e.t, steps),
      fraction: e.speciesLost!,
      id: e.id,
    })),
  };
}
