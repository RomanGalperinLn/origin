import { describe, expect, it } from 'vitest';
import { AGE, EVENTS, cosmicCalendar, eventTime, formatAge, formatYearsAgo, YEARS_PER_CALENDAR_SECOND } from '../src/time/cosmic';
import { fmt, sci } from '../src/ui/charts';
import { CHAPTERS, chapterIndexAtTime, sliderToTime, timeToSlider } from '../src/time/chapters';

describe('master timeline mapping', () => {
  it('chapter shares add up to the whole slider', () => {
    expect(CHAPTERS.reduce((a, c) => a + c.sliderShare, 0)).toBeCloseTo(1, 10);
  });

  it('chapters are contiguous and in order', () => {
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i].tStart).toBe(CHAPTERS[i - 1].tEnd);
    expect(CHAPTERS[0].tStart).toBe(0);
    expect(CHAPTERS[CHAPTERS.length - 1].tEnd).toBe(AGE);
  });

  it('is monotonic and covers Big Bang to today', () => {
    expect(sliderToTime(0)).toBe(0);
    expect(sliderToTime(1)).toBe(AGE);
    let prev = -1;
    for (let k = 0; k <= 10000; k++) {
      const t = sliderToTime(k / 10000);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('round-trips slider -> time -> slider', () => {
    for (let k = 1; k < 1000; k++) {
      const u = k / 1000;
      expect(timeToSlider(sliderToTime(u))).toBeCloseTo(u, 6);
    }
  });

  it('every event lands in the chapter it is filed under', () => {
    for (const e of EVENTS) {
      if (e.id === 'big-bang' || e.id === 'today') continue;
      const c = CHAPTERS[chapterIndexAtTime(e.t)];
      // Boundary events (e.g. recombination) open the next chapter but are filed under the one they end.
      const ok = c.id === e.chapter || CHAPTERS.some((x) => x.id === e.chapter && x.tEnd === e.t);
      expect(ok, `${e.id} in ${c.id}, filed under ${e.chapter}`).toBe(true);
    }
  });
});

describe('readouts', () => {
  it('Cosmic Calendar: Sun forms in early September, dinosaurs die on 30 December', () => {
    expect(cosmicCalendar(eventTime('sun-forms'))).toMatch(/^Sep [1-3],/);
    expect(cosmicCalendar(eventTime('end-cretaceous'))).toMatch(/^Dec 30,/);
    expect(cosmicCalendar(0)).toBe('Jan 1, 00:00:00');
    expect(cosmicCalendar(AGE)).toBe('Dec 31, midnight');
  });

  it('recorded history fits in the last seconds of the year', () => {
    expect(cosmicCalendar(eventTime('writing'))).toMatch(/^Dec 31, 23:59:4\d$/);
    expect(YEARS_PER_CALENDAR_SECOND).toBeCloseTo(437.6, 0);
  });

  it('formats years ago', () => {
    expect(formatYearsAgo(0)).toBe('13.8 billion years ago');
    expect(formatYearsAgo(AGE - 4.57e9)).toBe('4.57 billion years ago');
    expect(formatYearsAgo(AGE - 4.5e8)).toBe('450 million years ago');
    expect(formatYearsAgo(AGE - 12000)).toBe('12,000 years ago');
    expect(formatYearsAgo(AGE - 266)).toBe('266 years ago (1760 CE)');
    expect(formatYearsAgo(AGE)).toBe('today');
  });

  it('formats the age of the universe', () => {
    expect(formatAge(eventTime('protons'))).toMatch(/microsecond/);
    expect(formatAge(3 / (365.25 * 24 * 60))).toBe('3 minutes');
    expect(formatAge(380000)).toBe('380,000 years');
    expect(formatAge(4.6e9)).toBe('4.6 billion years');
    expect(formatAge(1 / (365.25 * 86400))).toBe('1 second');
    expect(formatAge(1e-6 / (365.25 * 86400))).toBe('1 microsecond');
  });
});

describe('unit boundaries', () => {
  it('never prints "1000 million" or "1,000,000 years"', () => {
    for (const ago of [999.6e6, 999.99e6, 999_960, 999_999]) {
      const s = formatYearsAgo(AGE - ago);
      expect(s).not.toMatch(/1000 million|1,000,000/);
    }
    for (const t of [999_999.7, 999.7e6]) expect(formatAge(t)).not.toMatch(/1000 million|1,000,000/);
  });
});

describe('number formatting', () => {
  it('uses powers of ten far outside everyday ranges', () => {
    expect(fmt(1e-14)).toBe('10⁻¹⁴');
    expect(fmt(1e13)).toBe('10¹³');
    expect(sci(1.24e13)).toBe('1.2 × 10¹³');
    expect(fmt(8.2e9)).toBe('8.2B');
    expect(fmt(0.5)).toBe('0.50');
  });
});
