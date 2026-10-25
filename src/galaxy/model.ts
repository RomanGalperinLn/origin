// The galaxy model: each star's position and colour as a closed-form function of time.
//  - Settling: every star starts in a puffy round cloud and moves to its place in a thin
//    rotating disk (or the bulge) as the disk forms (dates from events.json).
//  - Rotation: flat rotation curve v(r) = v0 (1 - exp(-r/r0)), so Ω(r) = v/r falls with
//    radius (differential rotation). Drawn slower than real (params.visualTurns).
//  - Spiral arms: a density wave. A two-armed logarithmic spiral turns rigidly at the
//    pattern speed; stars move through it, bunching up inside it (a traffic jam), and gas
//    passing through it forms young blue stars that fade as they move on.
//  - A small satellite galaxy (Gaia-Enceladus) falls in and is torn into the halo.

import { createRng, gaussian, nextFloat } from '../sim/rng';
import { eventTime } from '../time/cosmic';
import { KMS_PER_KPC_TO_RAD_PER_YEAR, type GalaxyParams } from './params';

export const DISK = 0;
export const GAS = 1;
export const BULGE = 2;
export const SATELLITE = 3;

/** Per point in the output buffer: x, y, z (kpc), brightness, r, g, b (0..1). */
export const OUT_STRIDE = 7;

export interface Galaxy {
  p: GalaxyParams;
  n: number;
  kind: Uint8Array;
  /** Final (disk or bulge) cylindrical radius, angle at the chapter start, height. */
  r: Float64Array;
  phi0: Float64Array;
  z: Float64Array;
  /** Starting position in the puffy cloud. */
  hx: Float64Array;
  hy: Float64Array;
  hz: Float64Array;
  /** Per-star jitter in when it settles (fraction of the settling time). */
  settleJitter: Float64Array;
  /** Satellite: lag along its orbit and offset within the satellite. */
  lag: Float64Array;
}

/** When things happen, in years since the Big Bang (all from events.json). */
export interface GalaxyTiming {
  tStart: number;
  tEnd: number;
  /** The disk has settled by the end of the thin-disk range. */
  settleEnd: number;
  /** Arms grow in over the thin-disk range. */
  armsStart: number;
  armsFull: number;
  mergerStart: number;
  mergerEnd: number;
}

export function galaxyTiming(): GalaxyTiming {
  return {
    tStart: eventTime('oldest-milky-way-stars'),
    tEnd: eventTime('sun-forms'),
    settleEnd: eventTime('thin-disk', 'latest'),
    armsStart: eventTime('thin-disk', 'earliest'),
    armsFull: eventTime('thin-disk', 'latest'),
    mergerStart: eventTime('gaia-enceladus', 'earliest'),
    mergerEnd: eventTime('gaia-enceladus', 'latest'),
  };
}

export interface GalaxyMetrics {
  /** RMS height of disk and bulge stars above the mid-plane (kpc). */
  thickness: number;
  /** Gas points currently lit up as young stars in the arms. */
  starForming: number;
  /** Real turns completed at the Sun's distance since the chapter began. */
  turnsAtSun: number;
  /** Spiral-arm strength 0..1. */
  arms: number;
}

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** Circular speed (km/s) and angular speed (rad/yr) at radius r (kpc). */
export const vCirc = (p: GalaxyParams, r: number) => p.v0 * (1 - Math.exp(-r / p.r0));
export const omega = (p: GalaxyParams, r: number) => (vCirc(p, Math.max(r, 0.05)) / Math.max(r, 0.05)) * KMS_PER_KPC_TO_RAD_PER_YEAR;

/** How many times slower than real the rotation is drawn. */
export function rotationSlowdown(p: GalaxyParams, tm: GalaxyTiming): number {
  const realTurns = (omega(p, p.sunRadius) * (tm.tEnd - tm.tStart)) / (2 * Math.PI);
  return realTurns / p.visualTurns;
}

export function createGalaxy(p: GalaxyParams): Galaxy {
  const rng = createRng(p.seed * 104729 + 7);
  const n = p.stars + p.satelliteStars;
  const g: Galaxy = {
    p,
    n,
    kind: new Uint8Array(n),
    r: new Float64Array(n),
    phi0: new Float64Array(n),
    z: new Float64Array(n),
    hx: new Float64Array(n),
    hy: new Float64Array(n),
    hz: new Float64Array(n),
    settleJitter: new Float64Array(n),
    lag: new Float64Array(n),
  };
  const nBulge = Math.round(p.stars * p.bulgeFraction);
  for (let i = 0; i < n; i++) {
    let kind = DISK;
    if (i >= p.stars) kind = SATELLITE;
    else if (i < nBulge) kind = BULGE;
    else if (nextFloat(rng) < p.gasFraction) kind = GAS;
    g.kind[i] = kind;
    g.phi0[i] = nextFloat(rng) * 2 * Math.PI;
    if (kind === BULGE) {
      // Flattened spheroid, scale about 1 kpc.
      const rr = Math.abs(gaussian(rng)) * 0.9 + 0.05;
      g.r[i] = rr;
      g.z[i] = gaussian(rng) * 0.55;
    } else if (kind === SATELLITE) {
      g.r[i] = Math.abs(gaussian(rng)) * 0.5; // offset within the satellite
      g.z[i] = gaussian(rng) * 0.4;
      g.lag[i] = nextFloat(rng) * 0.35;
    } else {
      // Exponential disk: radius from a gamma(2) draw (surface density ∝ exp(-r/scale)).
      let rr = 0;
      do rr = -p.diskScale * Math.log((1 - nextFloat(rng)) * (1 - nextFloat(rng)));
      while (rr > p.diskMax);
      g.r[i] = Math.max(0.3, rr);
      g.z[i] = gaussian(rng) * p.thinHeight * (kind === GAS ? 0.5 : 1);
    }
    // Puffy start: a round cloud (gaussian blob, a little larger for outer disk stars).
    const s = p.haloScale * (0.35 + 0.65 * Math.min(1, g.r[i] / p.diskMax + 0.3));
    g.hx[i] = gaussian(rng) * s * 0.6;
    g.hy[i] = gaussian(rng) * s * 0.6;
    g.hz[i] = gaussian(rng) * s * 0.6;
    g.settleJitter[i] = (nextFloat(rng) - 0.5) * 0.4;
  }
  return g;
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/**
 * Satellite centre along its infall path at progress s: before the merger (s < 0) it circles
 * at the edge; during it (0..1) it spirals in; after, its debris stays in the inner halo.
 */
function satellitePath(s: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, s));
  const R = 14 * Math.pow(1 - c, 0.8) + 1.5 * c;
  const a = 0.6 + 3.5 * Math.PI * Math.min(1, s);
  return [R * Math.cos(a), R * Math.sin(a), 5 * (1 - c) * Math.sin(1.7 * a)];
}

/**
 * Positions and colours of every point at time t (years since the Big Bang).
 * Writes OUT_STRIDE floats per point into `out` and returns the metrics.
 */
export function galaxyAt(g: Galaxy, tm: GalaxyTiming, t: number, out: Float32Array): GalaxyMetrics {
  const p = g.p;
  const S = rotationSlowdown(p, tm);
  const tau = (t - tm.tStart) / S; // drawn ("model") time
  const settle = (t - tm.tStart) / (tm.settleEnd - tm.tStart);
  const arms = smooth((t - tm.armsStart) / (tm.armsFull - tm.armsStart));
  const M = p.arms;
  const tanPitch = Math.tan((p.pitchDeg * Math.PI) / 180);
  const omegaP = p.patternSpeed * KMS_PER_KPC_TO_RAD_PER_YEAR;
  const crowd = p.armCrowding * arms;
  const youngW = 2 * Math.PI * p.youngPhase;
  const mergerS = (t - tm.mergerStart) / (tm.mergerEnd - tm.mergerStart);

  let z2 = 0;
  let nz = 0;
  let starForming = 0;
  for (let i = 0; i < g.n; i++) {
    const o = i * OUT_STRIDE;
    const kind = g.kind[i];
    const r = g.r[i];
    if (kind === SATELLITE) {
      // The satellite's stars trail along its orbit; once merged they stay as halo debris.
      // Each star lags a little behind the centre once tides start pulling the satellite apart.
      const torn = Math.max(0, Math.min(1, mergerS));
      const [cx, cy, cz] = satellitePath(Math.max(-1, mergerS * 1.15 - g.lag[i] * torn * 1.5));
      const spread = 1 + 3 * torn;
      const a = g.phi0[i];
      out[o] = cx + Math.cos(a) * r * spread;
      out[o + 1] = cy + Math.sin(a) * r * spread;
      out[o + 2] = cz + g.z[i] * spread;
      out[o + 3] = 0.9;
      out[o + 4] = 1;
      out[o + 5] = 0.8;
      out[o + 6] = 0.6;
      continue;
    }
    const om = omega(p, r) * (kind === BULGE ? 0.5 : 1);
    let phi = g.phi0[i] + om * tau;
    let young = 0;
    if (kind !== BULGE && crowd > 0) {
      const thetaArm = Math.log(r / p.rRef) / tanPitch + omegaP * tau;
      const u = M * (phi - thetaArm);
      // Traffic jam: stars linger near the arm (u = 0), so the arm shows up as a crowd.
      phi -= (crowd / M) * Math.sin(u);
      if (kind === GAS) {
        const d = ((u % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        // Inside corotation stars overtake the arm; outside, the arm overtakes them.
        const since = om > omegaP ? d : 2 * Math.PI - d;
        young = Math.exp(-since / youngW) * arms;
        if (young > 0.5) starForming++;
      }
    }
    const fx = r * Math.cos(phi);
    const fy = r * Math.sin(phi);
    const f = smooth(settle + g.settleJitter[i]);
    // The puffy cloud turns slowly as a whole while it collapses.
    const ha = 0.3 * om * tau;
    const ca = Math.cos(ha);
    const sa = Math.sin(ha);
    const hx = g.hx[i] * ca - g.hy[i] * sa;
    const hy = g.hx[i] * sa + g.hy[i] * ca;
    out[o] = lerp(hx, fx, f);
    out[o + 1] = lerp(hy, fy, f);
    out[o + 2] = lerp(g.hz[i], g.z[i], f);
    z2 += out[o + 2] * out[o + 2];
    nz++;
    if (kind === BULGE) {
      out[o + 3] = 0.55;
      out[o + 4] = 1;
      out[o + 5] = 0.75;
      out[o + 6] = 0.45;
    } else if (kind === GAS) {
      // Gas: dim and reddish; lit young stars: bright blue-white.
      out[o + 3] = 0.08 + 2.6 * young;
      out[o + 4] = lerp(0.75, 0.62, young);
      out[o + 5] = lerp(0.45, 0.78, young);
      out[o + 6] = lerp(0.65, 1, young);
    } else {
      out[o + 3] = 0.26;
      out[o + 4] = 1;
      out[o + 5] = 0.9;
      out[o + 6] = 0.72;
    }
  }
  return {
    thickness: Math.sqrt(z2 / Math.max(1, nz)),
    starForming,
    turnsAtSun: (omega(p, p.sunRadius) * (t - tm.tStart)) / (2 * Math.PI),
    arms,
  };
}

/** Where the Sun will form: at the Sun's radius, on the inner edge of an arm at the chapter's end. */
export function sunPosition(p: GalaxyParams, tm: GalaxyTiming, t: number): [number, number] {
  const S = rotationSlowdown(p, tm);
  const tanPitch = Math.tan((p.pitchDeg * Math.PI) / 180);
  const omegaP = p.patternSpeed * KMS_PER_KPC_TO_RAD_PER_YEAR;
  const tauEnd = (tm.tEnd - tm.tStart) / S;
  const phiEnd = Math.log(p.sunRadius / p.rRef) / tanPitch + omegaP * tauEnd + 0.25;
  const phi = phiEnd + omega(p, p.sunRadius) * ((t - tm.tStart) / S - tauEnd);
  return [p.sunRadius * Math.cos(phi), p.sunRadius * Math.sin(phi)];
}
