// The eight chapters of the master timeline and the piecewise slider mapping.
// Each chapter owns a fixed share of the slider; inside it, time maps linearly,
// logarithmically (since its start), logarithmically towards today, or through knots
// (chapter 7: one position per lineage stage, see src/lineage/timeline.ts).
// Boundaries come from events.json, never hard-coded dates.

import { AGE, eventTime, type ChapterId } from './cosmic';
import { knotAgo, knotFraction, lineageKnots, type Knot } from '../lineage/timeline';

export type ChapterKind = 'SIMULATED' | 'MODELLED' | 'RECONSTRUCTED';
export type ChapterScale = 'linear' | 'log' | 'logAgo' | 'knots';

export interface ChapterSpan {
  id: ChapterId;
  title: string;
  /** Fits on the slider band at 1366 px. */
  shortTitle: string;
  kind: ChapterKind;
  /** Extra badge text, e.g. "+ RECONSTRUCTED" for mixed chapters. */
  kindNote?: string;
  tStart: number;
  tEnd: number;
  sliderShare: number;
  scale: ChapterScale;
  /** Offset (years) for log scales so log(0) is avoided: log(t + offset) or log(ago + offset). */
  logOffset: number;
  /** For the 'knots' scale: (years ago, fraction through the chapter), log-interpolated between. */
  knots?: Knot[];
  /** Seconds of playback at normal speed. */
  playbackSeconds: number;
  color: string;
}

export const CHAPTERS: ChapterSpan[] = [
  {
    id: 'hot', title: 'The Hot Beginning', shortTitle: 'Hot start', kind: 'MODELLED',
    tStart: eventTime('big-bang'), tEnd: eventTime('recombination'),
    sliderShare: 0.08, scale: 'log', logOffset: 1e-14, playbackSeconds: 25, color: '#c0504d',
  },
  {
    id: 'web', title: 'The Cosmic Web and First Stars', shortTitle: 'Cosmic web', kind: 'SIMULATED',
    tStart: eventTime('recombination'), tEnd: eventTime('oldest-milky-way-stars'),
    sliderShare: 0.14, scale: 'log', logOffset: 0, playbackSeconds: 35, color: '#5b4b9a',
  },
  {
    id: 'galaxy', title: 'A Galaxy Takes Shape', shortTitle: 'Galaxy', kind: 'MODELLED',
    tStart: eventTime('oldest-milky-way-stars'), tEnd: eventTime('sun-forms'),
    sliderShare: 0.1, scale: 'linear', logOffset: 0, playbackSeconds: 25, color: '#3f6fb0',
  },
  {
    id: 'solar', title: 'Birth of the Solar System', shortTitle: 'Solar system', kind: 'SIMULATED',
    tStart: eventTime('sun-forms'), tEnd: eventTime('moon-impact'),
    sliderShare: 0.12, scale: 'linear', logOffset: 0, playbackSeconds: 30, color: '#c99a2e',
  },
  {
    id: 'earth', title: 'Young Earth', shortTitle: 'Young Earth', kind: 'RECONSTRUCTED',
    tStart: eventTime('moon-impact'), tEnd: eventTime('late-heavy-bombardment', 'earliest'),
    sliderShare: 0.08, scale: 'linear', logOffset: 0, playbackSeconds: 20, color: '#b5562f',
  },
  {
    id: 'life', title: 'The Origin of Life', shortTitle: 'Origin of life', kind: 'SIMULATED',
    tStart: eventTime('late-heavy-bombardment', 'earliest'), tEnd: eventTime('earliest-life'),
    sliderShare: 0.16, scale: 'linear', logOffset: 0, playbackSeconds: 60, color: '#2f8f7a',
  },
  {
    id: 'evolution', title: 'Evolution: from cells to humans', shortTitle: 'Evolution', kind: 'RECONSTRUCTED', kindNote: '+ SIMULATED toy model',
    tStart: eventTime('earliest-life'), tEnd: eventTime('homo-sapiens'),
    sliderShare: 0.2, scale: 'knots', logOffset: 0, playbackSeconds: 70, color: '#4f9a3c',
  },
  {
    id: 'humans', title: 'Humans', shortTitle: 'Humans', kind: 'RECONSTRUCTED',
    tStart: eventTime('homo-sapiens'), tEnd: AGE,
    sliderShare: 0.12, scale: 'logAgo', logOffset: 10, playbackSeconds: 30, color: '#d08a3c',
  },
];

// Chapter 7's knots come from the lineage stages; its ends are pinned to the chapter's own
// boundaries from events.json (a test checks the lineage's first and last dates agree).
{
  const evo = CHAPTERS.find((c) => c.id === 'evolution')!;
  const knots = lineageKnots();
  knots[0] = { ...knots[0], ago: AGE - evo.tStart };
  knots[knots.length - 1] = { ...knots[knots.length - 1], ago: AGE - evo.tEnd };
  evo.knots = knots;
}

/** Slider position where each chapter starts (cumulative shares). */
const U_START: number[] = [];
{
  let u = 0;
  for (const c of CHAPTERS) {
    U_START.push(u);
    u += c.sliderShare;
  }
}

export function chapterStartU(i: number): number {
  return U_START[i];
}

/** Fraction through the chapter (0..1) -> time. */
function localToTime(c: ChapterSpan, f: number): number {
  if (c.scale === 'linear') return c.tStart + f * (c.tEnd - c.tStart);
  if (c.scale === 'knots') return AGE - knotAgo(c.knots!, f);
  const o = c.logOffset;
  if (c.scale === 'log') {
    const a = Math.log(c.tStart + o);
    const b = Math.log(c.tEnd + o);
    return Math.exp(a + f * (b - a)) - o;
  }
  // logAgo: equal slider steps cover equal ratios of "years ago".
  const a = Math.log(AGE - c.tStart + o);
  const b = Math.log(AGE - c.tEnd + o);
  return AGE - (Math.exp(a + f * (b - a)) - o);
}

function timeToLocal(c: ChapterSpan, t: number): number {
  let f: number;
  if (c.scale === 'linear') f = (t - c.tStart) / (c.tEnd - c.tStart);
  else if (c.scale === 'knots') f = knotFraction(c.knots!, AGE - t);
  else if (c.scale === 'log') {
    const o = c.logOffset;
    const a = Math.log(c.tStart + o);
    const b = Math.log(c.tEnd + o);
    f = (Math.log(t + o) - a) / (b - a);
  } else {
    const o = c.logOffset;
    const a = Math.log(AGE - c.tStart + o);
    const b = Math.log(AGE - c.tEnd + o);
    f = (Math.log(AGE - t + o) - a) / (b - a);
  }
  return Math.max(0, Math.min(1, f));
}

/** Index of the chapter at slider position u. */
export function chapterIndexAtU(u: number): number {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) if (u >= U_START[i]) return i;
  return 0;
}

/** Index of the chapter containing time t (the later chapter on a boundary). */
export function chapterIndexAtTime(t: number): number {
  for (let i = CHAPTERS.length - 1; i >= 0; i--) if (t >= CHAPTERS[i].tStart) return i;
  return 0;
}

/** u in [0, 1] -> years since the Big Bang. */
export function sliderToTime(u: number): number {
  u = Math.max(0, Math.min(1, u));
  if (u >= 1) return AGE;
  const i = chapterIndexAtU(u);
  const c = CHAPTERS[i];
  // Clamp: exp(log(x)) - x is not exactly 0 in floating point.
  return Math.max(c.tStart, Math.min(c.tEnd, localToTime(c, (u - U_START[i]) / c.sliderShare)));
}

/** Years since the Big Bang -> u in [0, 1]. */
export function timeToSlider(t: number): number {
  if (t >= AGE) return 1;
  if (t <= 0) return 0;
  const i = chapterIndexAtTime(t);
  const c = CHAPTERS[i];
  return U_START[i] + timeToLocal(c, t) * c.sliderShare;
}

/** Fraction (0..1) through chapter i at time t. */
export function chapterProgress(i: number, t: number): number {
  return timeToLocal(CHAPTERS[i], t);
}
