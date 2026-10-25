import { describe, expect, it } from 'vitest';
import { surfaceAt } from '../src/globe/keyframes';
import { AGE, eventTime } from '../src/time/cosmic';
import { POPULATION_POINTS, populationAt } from '../src/globe/population';

const at = (id: string, which: 'mid' | 'earliest' | 'latest' = 'mid') => surfaceAt(eventTime(id, which)).state;
const isBlue = (c: number[]) => c[2] > c[0];

describe('globe keyframes follow the facts table', () => {
  it('lava -> oceans -> orange sky -> blue sky -> snowball -> green land -> city lights', () => {
    expect(at('earth-forms').lava).toBeGreaterThan(0.9);
    expect(at('earth-forms').ocean).toBe(0);
    expect(at('zircons').ocean).toBeGreaterThan(0.5); // first liquid water ~4.4 Gya
    expect(at('zircons').lava).toBeLessThan(0.2);
    expect(isBlue(at('earliest-life').atmo)).toBe(false); // orange, oxygen-free sky
    expect(isBlue(at('great-oxidation').atmo)).toBe(false); // oxygen only starts to build up
    expect(isBlue(at('eukaryotes', 'earliest').atmo)).toBe(true);
    expect(at('snowball-earth').ice).toBeGreaterThan(0.9);
    expect(at('snowball-earth', 'earliest').ice).toBeLessThan(0.3);
    expect(at('snowball-earth', 'latest').ice).toBeLessThan(0.3);
    expect(at('cambrian').veg).toBe(0); // land still bare
    expect(at('tetrapods').veg).toBeGreaterThan(0.5);
    expect(at('agriculture').city).toBe(0);
    expect(surfaceAt(AGE).state.city).toBe(1);
  });

  it('flashes impacts during the late heavy bombardment and at the dinosaur-killing asteroid', () => {
    expect(at('late-heavy-bombardment', 'earliest').impacts).toBeGreaterThan(0.5);
    expect(at('end-cretaceous').impacts).toBeGreaterThan(0.9);
    expect(at('cambrian').impacts).toBeLessThan(0.1);
  });

  it('all values stay in range and change smoothly', () => {
    let prev = surfaceAt(eventTime('earth-forms')).state;
    for (let k = 1; k <= 5000; k++) {
      const t = eventTime('earth-forms') + (k / 5000) * (AGE - eventTime('earth-forms'));
      const s = surfaceAt(t).state;
      for (const key of ['lava', 'ocean', 'land', 'ice', 'veg', 'city', 'haze', 'clouds', 'impacts'] as const) {
        expect(s[key]).toBeGreaterThanOrEqual(0);
        expect(s[key]).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(s.ocean - prev.ocean)).toBeLessThan(0.2);
      prev = s;
    }
  });
});

describe('population data', () => {
  it('matches the anchor figures and grows monotonically', () => {
    expect(populationAt(-10000)).toBe(4e6);
    expect(populationAt(1800) / 1e9).toBeCloseTo(1, 9);
    expect(populationAt(2022) / 8e9).toBeCloseTo(1, 9);
    expect(populationAt(1850)).toBeGreaterThan(1e9);
    expect(populationAt(1850)).toBeLessThan(1.6e9);
    let prev = 0;
    for (const p of POPULATION_POINTS) {
      expect(p.population).toBeGreaterThan(prev);
      prev = p.population;
    }
  });
});
