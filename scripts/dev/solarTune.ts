// Dev helper: runs the solar-system accretion for a few settings and prints how the
// population evolves (bodies, largest mass, collisions, lost) and the final planets.
// Usage: npx tsx scripts/dev/solarTune.ts key=value ... (any SolarParams number field)
import { makeSolarParams, EARTH_MASS } from '../../src/solar/params';
import { createSolar, findEarth, orbitOf, solarMetrics, stepSolar, PLANET_MASS } from '../../src/solar/nbody';

const over: Record<string, number> = {};
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('=');
  over[k] = Number(v);
}
const p = makeSolarParams(over);
const s = createSolar(p);
const t0 = performance.now();
const marks = 10;
for (let k = 1; k <= marks; k++) {
  stepSolar(s, Math.round(p.steps / marks));
  const m = solarMetrics(s);
  console.log(
    `step ${s.step} (${m.years.toFixed(0)} yr): bodies ${m.nBodies}, largest ${m.largestMass.toFixed(2)} M⊕, collisions ${m.collisions}, lost ${m.lost}, ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
}
const planets: string[] = [];
for (let i = 0; i < s.x.length; i++)
  if (s.alive[i] && s.m[i] / EARTH_MASS >= PLANET_MASS) {
    const o = orbitOf(s.x[i], s.y[i], s.vx[i], s.vy[i]);
    planets.push(`a=${o.a.toFixed(2)} e=${o.e.toFixed(2)} m=${(s.m[i] / EARTH_MASS).toFixed(2)}`);
  }
planets.sort();
const { index: earth, inZone } = findEarth(s);
console.log(`planets (>= ${PLANET_MASS} M⊕): ${planets.length}\n  ${planets.join('\n  ')}`);
console.log(earth < 0 ? 'no Earth found' : `Earth${inZone ? '' : ' (outside the zone: closest planet to 1 AU)'}: index ${earth}, ${(s.m[earth] / EARTH_MASS).toFixed(2)} M⊕, a=${orbitOf(s.x[earth], s.y[earth], s.vx[earth], s.vy[earth]).a.toFixed(2)} AU`);
console.log(`ms/step avg ${((performance.now() - t0) / p.steps).toFixed(2)}`);
