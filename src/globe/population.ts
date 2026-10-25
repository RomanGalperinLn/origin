// World population over time (RECONSTRUCTED from published estimates; see population.json).
import population from '../data/population.json';

export const POPULATION_POINTS = population.points;

/** World population at a calendar year, log-interpolated between data points. */
export function populationAt(year: number): number {
  const pts = population.points;
  if (year <= pts[0].year) return pts[0].population;
  for (let i = 1; i < pts.length; i++) {
    if (year <= pts[i].year) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (year - a.year) / (b.year - a.year);
      return Math.exp(Math.log(a.population) + f * (Math.log(b.population) - Math.log(a.population)));
    }
  }
  return pts[pts.length - 1].population;
}
