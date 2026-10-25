// Where each lineage stage sits on chapter 7's stretch of the master slider.
//  - 7a (the first SEL_SHARE of the chapter): the toy selection model, full screen.
//  - 7b (the rest): our lineage. Stage positions start from a log-of-years-ago layout
//    (so the last few million years are not squeezed to nothing), then are pushed apart so
//    every stage gets at least MIN_GAP of the chapter. Between positions, time runs
//    logarithmically. Dates come from lineage.json (sources in sources.md).

import lineageData from '../data/lineage.json';

export type Environment = 'ocean' | 'shore' | 'land' | 'forest' | 'savanna';

export interface Cousin {
  id: string;
  label: string;
  tAgo: number;
  tAgoRange: [number, number] | null;
  extinct: boolean;
  note: string;
}

export interface Stage {
  id: string;
  label: string;
  tAgo: number;
  tAgoRange: [number, number] | null;
  group: string;
  environment: Environment;
  scaleCm: number;
  cousinsBranchingHere: Cousin[];
  fact: string;
  sourceKey: string;
}

export const STAGES = lineageData.stages as Stage[];

/** Share of the chapter given to 7a (the toy selection model). */
export const SEL_SHARE = 0.15;
/** Minimum share of the chapter between two stages. */
export const MIN_GAP = 0.03;

export interface Knot {
  /** Years ago. */
  ago: number;
  /** Fraction through the chapter. */
  f: number;
}

/**
 * Slider positions of the stages (fraction through the chapter). Stage 1 sits at the start of
 * 7b; 7a covers the first part of the gap between stage 1 and stage 2 (in years).
 */
export function stagePositions(stages: Stage[] = STAGES): number[] {
  const n = stages.length;
  const l0 = Math.log(stages[0].tAgo);
  const l1 = Math.log(stages[n - 1].tAgo);
  const pos = stages.map((s) => SEL_SHARE + (1 - SEL_SHARE) * ((l0 - Math.log(s.tAgo)) / (l0 - l1)));
  // Push apart to at least MIN_GAP, keeping the ends fixed (a few relaxation sweeps).
  for (let sweep = 0; sweep < 50; sweep++) {
    for (let k = 1; k < n; k++) pos[k] = Math.max(pos[k], pos[k - 1] + MIN_GAP);
    pos[n - 1] = 1;
    for (let k = n - 2; k >= 0; k--) pos[k] = Math.min(pos[k], pos[k + 1] - MIN_GAP);
    pos[0] = SEL_SHARE;
  }
  return pos;
}

/** Where 7a ends in years ago: 35% of the way (in log time) from stage 1 to stage 2. */
export function selectionEndAgo(stages: Stage[] = STAGES): number {
  return Math.exp(Math.log(stages[0].tAgo) + 0.35 * (Math.log(stages[1].tAgo) - Math.log(stages[0].tAgo)));
}

/** Knots for the chapter's time scale: chapter start = stage 1's date, then 7a's end, then stages 2..n. */
export function lineageKnots(stages: Stage[] = STAGES): Knot[] {
  const pos = stagePositions(stages);
  const knots: Knot[] = [
    { ago: stages[0].tAgo, f: 0 },
    { ago: selectionEndAgo(stages), f: SEL_SHARE },
  ];
  for (let k = 1; k < stages.length; k++) knots.push({ ago: stages[k].tAgo, f: pos[k] });
  return knots;
}

/** Fraction through the chapter -> years ago (log-interpolated between knots). */
export function knotAgo(knots: Knot[], f: number): number {
  if (f <= knots[0].f) return knots[0].ago;
  for (let k = 1; k < knots.length; k++)
    if (f <= knots[k].f) {
      const u = (f - knots[k - 1].f) / (knots[k].f - knots[k - 1].f);
      return Math.exp(Math.log(knots[k - 1].ago) + u * (Math.log(knots[k].ago) - Math.log(knots[k - 1].ago)));
    }
  return knots[knots.length - 1].ago;
}

/** Years ago -> fraction through the chapter. */
export function knotFraction(knots: Knot[], ago: number): number {
  if (ago >= knots[0].ago) return 0;
  for (let k = 1; k < knots.length; k++)
    if (ago >= knots[k].ago) {
      const u = (Math.log(knots[k - 1].ago) - Math.log(ago)) / (Math.log(knots[k - 1].ago) - Math.log(knots[k].ago));
      return knots[k - 1].f + u * (knots[k].f - knots[k - 1].f);
    }
  return 1;
}

export interface LineageState {
  /** Index of the stage just behind (or at) the current time. */
  i: number;
  /** Morph progress toward stage i + 1 (0 = exactly stage i), with a short hold at each key frame. */
  u: number;
  /** Raw fraction between the two stages' positions (no hold). */
  raw: number;
  /** True during 7a. */
  selection: boolean;
}

/** Fraction of each stage-to-stage interval spent holding still on each key frame. */
const HOLD = 0.18;

export function lineageStateAt(f: number, pos: number[] = stagePositions()): LineageState {
  if (f < SEL_SHARE) return { i: 0, u: 0, raw: 0, selection: true };
  let i = 0;
  while (i < pos.length - 1 && f >= pos[i + 1]) i++;
  if (i >= pos.length - 1) return { i: pos.length - 1, u: 0, raw: 0, selection: false };
  const raw = (f - pos[i]) / (pos[i + 1] - pos[i]);
  const x = Math.max(0, Math.min(1, (raw - HOLD) / (1 - 2 * HOLD)));
  return { i, u: x * x * (3 - 2 * x), raw, selection: false };
}
