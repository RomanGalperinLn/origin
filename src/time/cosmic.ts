// Cosmic time: all times are years since the Big Bang (float64).
// Formatting for the three readouts, the Cosmic Calendar, and the facts table.

import data from '../data/events.json';

export const AGE = data.ageOfUniverse; // years; "today"
export const PRESENT_YEAR = data.presentYear;
const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
const CALENDAR_SECONDS = 365 * 24 * 3600;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export type ChapterId = 'hot' | 'web' | 'galaxy' | 'solar' | 'earth' | 'life' | 'evolution' | 'humans';

export interface TimelineEvent {
  id: string;
  label: string;
  /** Years since the Big Bang. */
  t: number;
  /** [earliest, latest] in years since the Big Bang, if the date is uncertain. */
  tRange?: [number, number];
  chapter: ChapterId;
  note: string;
  /** Mass extinctions: commonly cited fraction of species lost. */
  speciesLost?: number;
  /** Cosmic Calendar date, e.g. "Sep 2, 03:12:45". */
  cosmicCalendar: string;
}

interface RawEvent {
  id: string;
  label: string;
  tAfter?: number;
  tAgo?: number;
  tAfterRange?: number[];
  tAgoRange?: number[];
  chapter: string;
  note: string;
  speciesLost?: number;
}

function toT(e: RawEvent): number {
  if (e.tAfter !== undefined) return e.tAfter;
  return AGE - (e.tAgo ?? 0);
}

function toRange(e: RawEvent): [number, number] | undefined {
  if (e.tAfterRange) return [e.tAfterRange[0], e.tAfterRange[1]];
  if (e.tAgoRange) return [AGE - e.tAgoRange[1], AGE - e.tAgoRange[0]];
  return undefined;
}

export const EVENTS: TimelineEvent[] = (data.events as RawEvent[])
  .map((e) => {
    const t = toT(e);
    return {
      id: e.id,
      label: e.label,
      t,
      tRange: toRange(e),
      chapter: e.chapter as ChapterId,
      note: e.note,
      speciesLost: e.speciesLost,
      cosmicCalendar: cosmicCalendar(t),
    };
  })
  .sort((a, b) => a.t - b.t);

/** Time of an event by id (throws on a typo so boundaries can't silently drift). */
export function eventTime(id: string, which: 'mid' | 'earliest' | 'latest' = 'mid'): number {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) throw new Error(`unknown event ${id}`);
  if (which === 'earliest') return e.tRange?.[0] ?? e.t;
  if (which === 'latest') return e.tRange?.[1] ?? e.t;
  return e.t;
}

// ---------------------------------------------------------------------------
// Readouts

function trim(v: number, digits: number): string {
  return v.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/** "13.2 billion years ago", "450 million years ago", "12,000 years ago", "today". */
export function formatYearsAgo(t: number): string {
  const ago = AGE - t;
  if (ago < 0.5) return 'today';
  // Thresholds sit where rounding would otherwise print "1000 million" or "1,000,000".
  if (ago >= 999.5e6) return `${trim(ago / 1e9, ago >= 1e10 ? 1 : 2)} billion years ago`;
  if (ago >= 999_950) return `${trim(ago / 1e6, ago >= 1e8 ? 0 : 1)} million years ago`;
  if (ago >= 1e4) {
    const rounded = ago >= 1e5 ? Math.round(ago / 1000) * 1000 : Math.round(ago / 100) * 100;
    return `${rounded.toLocaleString('en-GB')} years ago`;
  }
  const year = Math.round(PRESENT_YEAR - ago);
  const yearLabel = year > 0 ? `${year} CE` : `${1 - year} BCE`;
  return `${Math.round(ago).toLocaleString('en-GB')} years ago (${yearLabel})`;
}

/**
 * The most useful way to say when t is: early on, "3 minutes after the Big Bang"
 * (every early moment is "13.8 billion years ago"); later, "4.5 billion years ago".
 */
export function formatWhen(t: number): string {
  if (t <= 0) return 'the Big Bang';
  return t < 1e9 ? `${formatAge(t)} after the Big Bang` : formatYearsAgo(t);
}

/** "1 microsecond" but "2 microseconds". */
function unit(v: string, name: string): string {
  return `${v} ${v === '1' ? name : name + 's'}`;
}

/** Age of the universe at time t: "1 microsecond", "3 minutes", "380,000 years", "4.6 billion years". */
export function formatAge(t: number): string {
  const s = t * SECONDS_PER_YEAR;
  if (t <= 0) return '0';
  // Thresholds sit where one-decimal rounding would otherwise print "1000 milliseconds".
  if (s < 999.95e-9) return unit(trim(s * 1e9, 1), 'nanosecond');
  if (s < 999.95e-6) return unit(trim(s * 1e6, 1), 'microsecond');
  if (s < 0.99995) return unit(trim(s * 1e3, 1), 'millisecond');
  if (s < 120) return unit(trim(s, 1), 'second');
  if (s < 7200) return unit(trim(s / 60, 1), 'minute');
  if (s < 2 * 86400) return unit(trim(s / 3600, 1), 'hour');
  if (t < 2) return unit(trim(s / 86400, 0), 'day');
  if (t < 999_999.5) return `${Math.round(t).toLocaleString('en-GB')} years`;
  if (t < 999.5e6) return `${trim(t / 1e6, 0)} million years`;
  return `${trim(t / 1e9, 2)} billion years`;
}

/**
 * Carl Sagan's Cosmic Calendar: the whole history squeezed into one year.
 * Big Bang = 1 January 00:00:00, today = midnight at the end of 31 December.
 */
export function cosmicCalendar(t: number): string {
  const f = Math.max(0, Math.min(1, t / AGE));
  if (f >= 1) return 'Dec 31, midnight';
  let secs = f * CALENDAR_SECONDS;
  let day = Math.floor(secs / 86400);
  secs -= day * 86400;
  let month = 0;
  while (day >= MONTH_DAYS[month]) day -= MONTH_DAYS[month++];
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = Math.floor(secs % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[month]} ${day + 1}, ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/** Real years per Cosmic Calendar second (≈ 437). */
export const YEARS_PER_CALENDAR_SECOND = AGE / CALENDAR_SECONDS;
