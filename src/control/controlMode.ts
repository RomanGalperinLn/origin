// The CONTROLLED / RELEASED switch: the show's theme in one place.
//
//  RELEASED   = the normal app: random starting conditions, noise, ripples, mutations.
//  CONTROLLED = the same physics, code and seeds, with one change everywhere: we remove the
//               randomness (noise, ripples, mutations, initial jitter) and start from a neat,
//               designed layout.
//
// Chapters never read the switch any other way: each chapter instance is built for one mode
// and asks paramsFor() for its parameters. Every controlled result comes from running the
// chapter's real model with these settings.

import type { ChapterId } from '../time/cosmic';

export type Mode = 'controlled' | 'released';

/** What each chapter changes in CONTROLLED mode (merged over its normal parameters). */
const CONTROLLED: Partial<Record<ChapterId, Record<string, unknown>>> = {
  // 1. No density ripples: the first light is a perfectly uniform glow.
  hot: { ripples: false },
  // 2. Particles start on a perfect grid with zero displacement (the smooth run): nothing to collapse onto.
  web: { run: 'smooth' },
  // 6. A neat lattice grouped by type, no thermal noise; the energy source stays on (a fair test of
  // randomness). A neat lattice of attracting particles is not at rest (it snaps into a crystal within
  // ~1,000 steps), so the designed start is that lattice already settled into its rest state under the
  // same conditions (30,000 steps): from step 0 it only vibrates in place.
  life: { layout: 'lattice', T: 0, settleSteps: 30000 },
  // 7. No mutations, and every organism starts identical.
  evolution: { mutation: 0, segmentMutation: 0, identicalStart: true },
};

let current: Mode = 'controlled';
const listeners: ((m: Mode) => void)[] = [];

/** The switch's position. Defaults to CONTROLLED, so the first run on stage shows nothing evolving. */
export function mode(): Mode {
  return current;
}

export function setMode(m: Mode): void {
  if (m === current) return;
  current = m;
  for (const fn of listeners) fn(m);
}

export function toggleMode(): void {
  setMode(current === 'controlled' ? 'released' : 'controlled');
}

export function onModeChange(fn: (m: Mode) => void): void {
  listeners.push(fn);
}

/** A chapter's parameters in the given mode: its normal ones, with the controlled changes on top. */
export function paramsFor<T extends object>(chapter: ChapterId, m: Mode, released: T): T {
  return m === 'controlled' ? { ...released, ...(CONTROLLED[chapter] as Partial<T> | undefined) } : released;
}

