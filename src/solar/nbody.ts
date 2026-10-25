// 2D N-body planetesimal accretion: the Sun (fixed at the origin) plus N bodies that
// attract each other pairwise (O(N²), fine at a few hundred bodies), integrated with a
// kick-drift-kick leapfrog. Bodies that touch merge perfectly inelastically, conserving
// mass and momentum. Deterministic: the seeded PRNG is only used to build the disk.

import { createRng, nextFloat, type RngState } from '../sim/rng';
import { EARTH_MASS, EARTH_RADIUS_AU, G, type SolarParams } from './params';

export interface SolarState {
  params: SolarParams;
  step: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  m: Float64Array;
  /** 1 while the body exists; merged or lost bodies are 0 (indices stay stable for rendering). */
  alive: Uint8Array;
  /** Collision radius of each body (AU), updated when it grows. */
  r: Float64Array;
  /** Step at which each body last absorbed another (for collision flashes). */
  hitStep: Int32Array;
  ax: Float64Array;
  ay: Float64Array;
  collisions: number;
  /** Bodies that fell into the Sun or were flung beyond the eject radius. */
  lost: number;
}

export interface SolarMetrics {
  step: number;
  /** Simulated years since the start of the run. */
  years: number;
  nBodies: number;
  /** Largest body, in Earth masses. */
  largestMass: number;
  collisions: number;
  lost: number;
  /** Total mass still in bodies, in Earth masses (drops only if something is lost). */
  totalMass: number;
}

/**
 * Cube root by Newton's method using only + - * /, which every JavaScript engine rounds
 * identically (Math.cbrt is not guaranteed to), so the run is the same in Node and every
 * browser. Accurate to full precision for 1e-6 < q < 1e3.
 */
export function cbrt(q: number): number {
  let y = q > 1 ? q / 3 + 0.7 : 1;
  for (let k = 0; k < 60; k++) y -= (y * y * y - q) / (3 * y * y);
  return y;
}

/**
 * sin and cos from a polynomial (Taylor series after reduction to |x| <= π/4), again only
 * + - * /: Math.sin and Math.cos may differ in the last bit between engines, and the N-body
 * run is chaotic enough to turn that into a different solar system.
 */
export function sinCos(x: number): [number, number] {
  const TAU = 6.283185307179586;
  x -= TAU * Math.round(x / TAU); // now |x| <= π
  const q = Math.round(x / (TAU / 4)); // quadrant -2..2
  const r = x - q * (TAU / 4);
  const r2 = r * r;
  let sn = 0;
  let cs = 0;
  let termS = r;
  let termC = 1;
  for (let k = 1; k <= 11; k++) {
    sn += termS;
    cs += termC;
    termS *= -r2 / ((2 * k) * (2 * k + 1));
    termC *= -r2 / ((2 * k - 1) * (2 * k));
  }
  const m = ((q % 4) + 4) % 4;
  if (m === 0) return [sn, cs];
  if (m === 1) return [cs, -sn];
  if (m === 2) return [-sn, -cs];
  return [-cs, sn];
}

/** Approximately normal (mean 0, SD 1): sum of 12 uniforms minus 6 (Irwin-Hall); basic arithmetic only. */
function normal(r: RngState): number {
  let t = -6;
  for (let k = 0; k < 12; k++) t += nextFloat(r);
  return t;
}

/** Collision radius (AU): Earth-like density, inflated by params.radiusInflation. */
export function radiusOf(p: SolarParams, m: number): number {
  return p.radiusInflation * EARTH_RADIUS_AU * cbrt(m / EARTH_MASS);
}

export function createSolar(p: SolarParams): SolarState {
  const N = p.N;
  const rng = createRng(p.seed);
  const s: SolarState = {
    params: { ...p },
    step: 0,
    x: new Float64Array(N),
    y: new Float64Array(N),
    vx: new Float64Array(N),
    vy: new Float64Array(N),
    m: new Float64Array(N),
    alive: new Uint8Array(N).fill(1),
    r: new Float64Array(N),
    hitStep: new Int32Array(N).fill(-1_000_000),
    ax: new Float64Array(N),
    ay: new Float64Array(N),
    collisions: 0,
    lost: 0,
  };
  // Σ ∝ r^-1.5 means dM ∝ r^-0.5 dr, so with equal-mass bodies r is uniform in sqrt(r).
  const qIn = Math.sqrt(p.rIn);
  const qOut = Math.sqrt(p.rOut);
  const m0 = (p.diskMassEarth * EARTH_MASS) / N;
  for (let i = 0; i < N; i++) {
    const q = qIn + (qOut - qIn) * nextFloat(rng);
    const a = q * q;
    const [sn, c] = sinCos(2 * Math.PI * nextFloat(rng));
    // Small eccentricity: start at radius a(1 - e cos E) with the matching speed (vis-viva).
    const e = Math.min(0.2, Math.abs(normal(rng)) * p.eRms);
    const [sinE, cosE] = sinCos(2 * Math.PI * nextFloat(rng));
    const r = a * (1 - e * cosE);
    const vr = (Math.sqrt(G / a) * (e * sinE)) / (1 - e * cosE);
    const vt = (Math.sqrt(G / a) * Math.sqrt(1 - e * e)) / (1 - e * cosE);
    s.x[i] = r * c;
    s.y[i] = r * sn;
    s.vx[i] = vr * c - vt * sn;
    s.vy[i] = vr * sn + vt * c;
    s.m[i] = m0;
    s.r[i] = radiusOf(p, m0);
    if (p.layout === 'rings') {
      // CONTROLLED: a designed disk. Radii evenly spaced, angles spread by a fixed rule (golden
      // angle), exactly circular orbits: no eccentricity, no jitter.
      const R = p.rIn + ((p.rOut - p.rIn) * (i + 0.5)) / N;
      const [sa, ca] = sinCos((i * 2.399963229728653) % (2 * Math.PI));
      const v = Math.sqrt(G / R);
      s.x[i] = R * ca;
      s.y[i] = R * sa;
      s.vx[i] = -v * sa;
      s.vy[i] = v * ca;
    }
  }
  computeAccel(s);
  return s;
}

/** Sun + pairwise gravity into s.ax / s.ay (call after moving bodies by hand). */
export function computeAccel(s: SolarState): void {
  const { x, y, m, alive, ax, ay } = s;
  const N = x.length;
  const eps2 = s.params.softening * s.params.softening;
  const Gb = G * s.params.gravityBoost;
  for (let i = 0; i < N; i++) {
    if (!alive[i]) {
      ax[i] = 0;
      ay[i] = 0;
      continue;
    }
    const r2 = x[i] * x[i] + y[i] * y[i];
    const inv = G / (r2 * Math.sqrt(r2));
    ax[i] = -x[i] * inv;
    ay[i] = -y[i] * inv;
  }
  for (let i = 0; i < N; i++) {
    if (!alive[i]) continue;
    const xi = x[i];
    const yi = y[i];
    const mi = m[i];
    let axi = 0;
    let ayi = 0;
    for (let j = i + 1; j < N; j++) {
      if (!alive[j]) continue;
      const dx = x[j] - xi;
      const dy = y[j] - yi;
      const d2 = dx * dx + dy * dy + eps2;
      const f = Gb / (d2 * Math.sqrt(d2));
      const fj = f * m[j];
      const fi = f * mi;
      axi += dx * fj;
      ayi += dy * fj;
      ax[j] -= dx * fi;
      ay[j] -= dy * fi;
    }
    ax[i] += axi;
    ay[i] += ayi;
  }
}

/**
 * Merges touching bodies (perfectly inelastic: mass and momentum conserved; the merged
 * body sits at the centre of mass). The heavier body keeps its index. Returns merges done.
 */
export function mergeTouching(s: SolarState): number {
  const { x, y, vx, vy, m, alive } = s;
  const rad = s.r;
  const p = s.params;
  const N = x.length;
  let merges = 0;
  for (let i = 0; i < N; i++) {
    if (!alive[i]) continue;
    for (let j = i + 1; j < N; j++) {
      if (!alive[j]) continue;
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const rr = rad[i] + rad[j];
      if (dx * dx + dy * dy >= rr * rr) continue;
      const [k, g] = m[j] > m[i] ? [j, i] : [i, j]; // keeper, gone
      const M = m[k] + m[g];
      x[k] = (m[k] * x[k] + m[g] * x[g]) / M;
      y[k] = (m[k] * y[k] + m[g] * y[g]) / M;
      vx[k] = (m[k] * vx[k] + m[g] * vx[g]) / M;
      vy[k] = (m[k] * vy[k] + m[g] * vy[g]) / M;
      m[k] = M;
      rad[k] = radiusOf(p, M);
      m[g] = 0;
      alive[g] = 0;
      s.hitStep[k] = s.step + 1;
      merges++;
      if (g === i) break; // body i is gone; move on
    }
  }
  return merges;
}

/** Removes bodies that fell into the Sun or left the system. */
function removeLost(s: SolarState): void {
  const p = s.params;
  const rs2 = p.sunRadius * p.sunRadius;
  const re2 = p.ejectRadius * p.ejectRadius;
  for (let i = 0; i < s.x.length; i++) {
    if (!s.alive[i]) continue;
    const r2 = s.x[i] * s.x[i] + s.y[i] * s.y[i];
    if (r2 < rs2 || r2 > re2) {
      s.alive[i] = 0;
      s.m[i] = 0;
      s.lost++;
    }
  }
}

/** n steps of kick-drift-kick leapfrog, merging bodies that touch. */
export function stepSolar(s: SolarState, n = 1): void {
  const dt = s.params.dt;
  const h = dt / 2;
  const { x, y, vx, vy, ax, ay, alive } = s;
  const N = x.length;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      vx[i] += h * ax[i];
      vy[i] += h * ay[i];
      x[i] += dt * vx[i];
      y[i] += dt * vy[i];
    }
    const merges = mergeTouching(s);
    s.collisions += merges;
    removeLost(s);
    computeAccel(s);
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      vx[i] += h * ax[i];
      vy[i] += h * ay[i];
    }
    s.step++;
  }
}

/** Osculating orbit around the Sun: semi-major axis a (AU), eccentricity e, periapsis angle w. */
export function orbitOf(x: number, y: number, vx: number, vy: number): { a: number; e: number; w: number } {
  const r = Math.sqrt(x * x + y * y);
  const v2 = vx * vx + vy * vy;
  const a = 1 / (2 / r - v2 / G);
  const h = x * vy - y * vx;
  // Eccentricity vector: (v × h)/G - r̂.
  const ex = (vy * h) / G - x / r;
  const ey = (-vx * h) / G - y / r;
  return { a, e: Math.sqrt(ex * ex + ey * ey), w: Math.atan2(ey, ex) };
}

/**
 * Earth: the largest surviving body with a semi-major axis inside the Earth zone. If the zone
 * is empty, the planet (>= PLANET_MASS) closest to 1 AU, flagged inZone = false so the UI can
 * say so. index -1 if there are no planets at all.
 */
export function findEarth(s: SolarState): { index: number; inZone: boolean } {
  const [lo, hi] = s.params.earthZone;
  let best = -1;
  let nearest = -1;
  let nearestDist = Infinity;
  for (let i = 0; i < s.x.length; i++) {
    if (!s.alive[i]) continue;
    const { a } = orbitOf(s.x[i], s.y[i], s.vx[i], s.vy[i]);
    if (a >= lo && a <= hi && (best < 0 || s.m[i] > s.m[best])) best = i;
    const d = Math.abs(Math.log(a));
    if (s.m[i] >= PLANET_MASS * EARTH_MASS && d < nearestDist) {
      nearest = i;
      nearestDist = d;
    }
  }
  return best >= 0 ? { index: best, inZone: true } : { index: nearest, inZone: false };
}

export function cloneSolar(s: SolarState): SolarState {
  return {
    params: { ...s.params },
    step: s.step,
    x: s.x.slice(),
    y: s.y.slice(),
    vx: s.vx.slice(),
    vy: s.vy.slice(),
    m: s.m.slice(),
    alive: s.alive.slice(),
    r: s.r.slice(),
    hitStep: s.hitStep.slice(),
    ax: s.ax.slice(),
    ay: s.ay.slice(),
    collisions: s.collisions,
    lost: s.lost,
  };
}

export function copySolarInto(dst: SolarState, src: SolarState): void {
  dst.params = { ...src.params };
  dst.step = src.step;
  dst.x.set(src.x);
  dst.y.set(src.y);
  dst.vx.set(src.vx);
  dst.vy.set(src.vy);
  dst.m.set(src.m);
  dst.alive.set(src.alive);
  dst.r.set(src.r);
  dst.hitStep.set(src.hitStep);
  dst.ax.set(src.ax);
  dst.ay.set(src.ay);
  dst.collisions = src.collisions;
  dst.lost = src.lost;
}

export function solarMetrics(s: SolarState): SolarMetrics {
  let n = 0;
  let largest = 0;
  let total = 0;
  for (let i = 0; i < s.x.length; i++) {
    if (!s.alive[i]) continue;
    n++;
    total += s.m[i];
    if (s.m[i] > largest) largest = s.m[i];
  }
  return {
    step: s.step,
    years: s.step * s.params.dt,
    nBodies: n,
    largestMass: largest / EARTH_MASS,
    collisions: s.collisions,
    lost: s.lost,
    totalMass: total / EARTH_MASS,
  };
}

/** Bodies above this mass (Earth masses) count as planets in summaries. */
export const PLANET_MASS = 0.05;
