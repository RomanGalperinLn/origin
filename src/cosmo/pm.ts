// 2D particle-mesh gravity in an expanding (matter-dominated) universe.
//
// Comoving positions x in a periodic unit box, time variable s = ln a, v = dx/da.
// Equations (Einstein-de Sitter, growing mode D = a):
//   dx/ds = a v
//   dv/ds = -(3/2) v - (3 / (2a)) ∇ψ,   ∇²ψ = δ
// The -(3/2) v term is Hubble drag: expansion slows everything down, which is why
// structure grows slowly. Linear theory (x = q + aΨ, v = Ψ) is an exact solution,
// so tiny ripples grow in proportion to a until gravity turns them non-linear.
// Each step: CIC density -> FFT Poisson solve -> gradient -> CIC interpolation -> KDK leapfrog.

import type { CosmoParams } from './params';
import { fft2d, waveNumber } from './fft';
import { gaussianField } from './field';

export interface CosmoState {
  params: CosmoParams;
  step: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  /** ∇ψ at each particle for the current positions (cached so steps are exact after a restore). */
  gx: Float64Array;
  gy: Float64Array;
  /** Particle index of each star, and the step it ignited. */
  starOf: Int32Array;
  starBorn: Int32Array;
  nStars: number;
  isStar: Uint8Array;
}

export interface CosmoMetrics {
  step: number;
  a: number;
  /** Years since the Big Bang. */
  t: number;
  /** Variance of the density contrast on the grid (structure growth). */
  sigma2: number;
  maxDelta: number;
  nStars: number;
  /** Mass fraction of the box in the largest connected clump of dense cells. */
  largestClump: number;
  /** Centre of the largest clump (box units), for the zoom into chapter 3. */
  clumpX: number;
  clumpY: number;
}

export function stepSize(p: CosmoParams): number {
  return Math.log(p.aFinal) / p.steps;
}

export function scaleFactorAt(p: CosmoParams, step: number): number {
  return Math.exp(step * stepSize(p));
}

/** Years since the Big Bang for scale factor a (a ∝ t^(2/3), a = 1 at tStart). */
export function timeOfA(p: CosmoParams, a: number): number {
  return p.tStart * Math.pow(a, 1.5);
}

// ---------------------------------------------------------------------------
// Grid work (module scratch, sized on first use)

let scratch: { G: number; rho: Float64Array; re: Float64Array; im: Float64Array; k2inv: Float64Array; kx: Float64Array; ky: Float64Array } | null = null;

function grid(G: number) {
  if (!scratch || scratch.G !== G) {
    const k2inv = new Float64Array(G * G);
    const kx = new Float64Array(G * G);
    const ky = new Float64Array(G * G);
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const a = 2 * Math.PI * waveNumber(i, G);
        const b = 2 * Math.PI * waveNumber(j, G);
        const k2 = a * a + b * b;
        const idx = i + j * G;
        kx[idx] = a;
        ky[idx] = b;
        // Gaussian force smoothing at about one cell suppresses grid noise.
        const cell = 1 / G;
        k2inv[idx] = k2 === 0 ? 0 : Math.exp(-k2 * (0.7 * cell) ** 2) / k2;
      }
    scratch = { G, rho: new Float64Array(G * G), re: new Float64Array(G * G), im: new Float64Array(G * G), k2inv, kx, ky };
  }
  return scratch;
}

/** Cloud-in-cell density contrast δ = n / n̄ - 1 into `out` (cell centres at (i + 0.5) / G). */
export function depositDelta(s: CosmoState, out: Float64Array): void {
  const G = s.params.G;
  const N = s.x.length;
  out.fill(0);
  const nbar = N / (G * G);
  const w = 1 / nbar;
  for (let p = 0; p < N; p++) {
    const u = s.x[p] * G - 0.5;
    const v = s.y[p] * G - 0.5;
    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const fx = u - i0;
    const fy = v - j0;
    const i = ((i0 % G) + G) % G;
    const j = ((j0 % G) + G) % G;
    const i1 = (i + 1) % G;
    const j1 = (j + 1) % G;
    out[i + j * G] += (1 - fx) * (1 - fy) * w;
    out[i1 + j * G] += fx * (1 - fy) * w;
    out[i + j1 * G] += (1 - fx) * fy * w;
    out[i1 + j1 * G] += fx * fy * w;
  }
  for (let c = 0; c < G * G; c++) out[c] -= 1;
}

/** ∇ψ at every particle (∇²ψ = δ), solved with one forward and one combined inverse FFT. */
function computeForces(s: CosmoState): Float64Array {
  const G = s.params.G;
  const g = grid(G);
  depositDelta(s, g.rho);
  g.re.set(g.rho);
  g.im.fill(0);
  fft2d(g.re, g.im, G);
  // ψ_k = -δ_k / k². ∂ψ/∂x -> i kx ψ_k. Pack gx + i gy into one complex field: F = i kx ψ + i (i ky ψ) = (i kx - ky) ψ.
  for (let c = 0; c < G * G; c++) {
    const pr = -g.re[c] * g.k2inv[c];
    const pi = -g.im[c] * g.k2inv[c];
    const kx = g.kx[c];
    const ky = g.ky[c];
    // (i kx - ky)(pr + i pi) = (-kx pi - ky pr) + i (kx pr - ky pi)
    g.re[c] = -kx * pi - ky * pr;
    g.im[c] = kx * pr - ky * pi;
  }
  fft2d(g.re, g.im, G, true); // re = ∂ψ/∂x, im = ∂ψ/∂y
  const N = s.x.length;
  for (let p = 0; p < N; p++) {
    const u = s.x[p] * G - 0.5;
    const v = s.y[p] * G - 0.5;
    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const fx = u - i0;
    const fy = v - j0;
    const i = ((i0 % G) + G) % G;
    const j = ((j0 % G) + G) % G;
    const i1 = (i + 1) % G;
    const j1 = (j + 1) % G;
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
    const c00 = i + j * G;
    const c10 = i1 + j * G;
    const c01 = i + j1 * G;
    const c11 = i1 + j1 * G;
    s.gx[p] = w00 * g.re[c00] + w10 * g.re[c10] + w01 * g.re[c01] + w11 * g.re[c11];
    s.gy[p] = w00 * g.im[c00] + w10 * g.im[c10] + w01 * g.im[c01] + w11 * g.im[c11];
  }
  return g.rho; // δ for the new positions (used for star formation)
}

// ---------------------------------------------------------------------------

/**
 * Initial state: particles on a lattice, displaced with the Zel'dovich approximation
 * from the ripple field δ (RMS = amplitude at a = 1):  Ψ_k = i k δ_k / k²,  x = q + aΨ,  v = Ψ.
 * With ripples off, the lattice is perfect: δ = 0, no force, nothing ever moves.
 */
export function createCosmo(p: CosmoParams, field?: Float64Array): CosmoState {
  const G = p.G;
  const N = G * G;
  const s: CosmoState = {
    params: { ...p },
    step: 0,
    x: new Float64Array(N),
    y: new Float64Array(N),
    vx: new Float64Array(N),
    vy: new Float64Array(N),
    gx: new Float64Array(N),
    gy: new Float64Array(N),
    starOf: new Int32Array(p.maxStars),
    starBorn: new Int32Array(p.maxStars),
    nStars: 0,
    isStar: new Uint8Array(N),
  };
  const psiX = new Float64Array(N);
  const psiY = new Float64Array(N);
  if (p.ripples) {
    const delta = field ?? gaussianField(p.seed, G, p.slope, p.smoothCells);
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let c = 0; c < N; c++) re[c] = delta[c] * p.amplitude;
    fft2d(re, im, G);
    const g = grid(G);
    // Pack Ψx + iΨy: Ψ_k = i k δ_k / k²  ->  (i kx - ky) δ_k / k² (same trick as the forces).
    for (let c = 0; c < N; c++) {
      const k2 = g.kx[c] * g.kx[c] + g.ky[c] * g.ky[c];
      const inv = k2 === 0 ? 0 : 1 / k2;
      const dr = re[c] * inv;
      const di = im[c] * inv;
      re[c] = -g.kx[c] * di - g.ky[c] * dr;
      im[c] = g.kx[c] * dr - g.ky[c] * di;
    }
    fft2d(re, im, G, true);
    psiX.set(re);
    psiY.set(im);
  }
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const c = i + j * G;
      const a = 1;
      s.x[c] = wrap((i + 0.5) / G + a * psiX[c]);
      s.y[c] = wrap((j + 0.5) / G + a * psiY[c]);
      s.vx[c] = psiX[c];
      s.vy[c] = psiY[c];
    }
  computeForces(s);
  return s;
}

function wrap(v: number): number {
  v -= Math.floor(v);
  return v >= 1 ? 0 : v;
}

/** n steps of kick-drift-kick leapfrog in ln a, with exact Hubble-drag damping. */
export function stepCosmo(s: CosmoState, n = 1): void {
  const p = s.params;
  const ds = stepSize(p);
  const damp = Math.exp(-0.75 * ds); // half-step of dv/ds = -(3/2) v
  const N = s.x.length;
  for (let k = 0; k < n; k++) {
    // Exact half-kicks for dv/ds = -1.5 v - (1.5/a) g with g held fixed over each half:
    // ∫ 1.5 e^{-s'} e^{-1.5 (s_end - s')} ds' = 3 e^{-1.5 s_end} (e^{s_end/2} - e^{s_begin/2}).
    const s0 = s.step * ds;
    const sm = s0 + ds / 2;
    const s1 = s0 + ds;
    const a0 = Math.exp(s0);
    const a1 = Math.exp(s1);
    const kick0 = 3 * Math.exp(-1.5 * sm) * (Math.exp(0.5 * sm) - Math.exp(0.5 * s0));
    for (let i = 0; i < N; i++) {
      s.vx[i] = s.vx[i] * damp - kick0 * s.gx[i];
      s.vy[i] = s.vy[i] * damp - kick0 * s.gy[i];
      s.x[i] = wrap(s.x[i] + (a1 - a0) * s.vx[i]);
      s.y[i] = wrap(s.y[i] + (a1 - a0) * s.vy[i]);
    }
    const delta = computeForces(s);
    const kick1 = 3 * Math.exp(-1.5 * s1) * (Math.exp(0.5 * s1) - Math.exp(0.5 * sm));
    for (let i = 0; i < N; i++) {
      s.vx[i] = s.vx[i] * damp - kick1 * s.gx[i];
      s.vy[i] = s.vy[i] * damp - kick1 * s.gy[i];
    }
    s.step++;
    igniteStars(s, delta);
  }
}

// ---------------------------------------------------------------------------
// First stars: a cell denser than deltaStar ignites one star on a particle in it
// (so the star then moves with the matter). At most a few per step.

const MAX_NEW_STARS_PER_STEP = 6;

function igniteStars(s: CosmoState, delta: Float64Array): void {
  const p = s.params;
  if (s.nStars >= p.maxStars) return;
  const G = p.G;
  let candidates: number[] | null = null;
  for (let c = 0; c < G * G; c++) if (delta[c] > p.deltaStar) (candidates ??= []).push(c);
  if (!candidates) return;
  // Cells that already hold a star don't ignite another.
  const occupied = new Set<number>();
  for (let k = 0; k < s.nStars; k++) occupied.add(cellOf(s, s.starOf[k], G));
  let made = 0;
  for (const c of candidates) {
    if (occupied.has(c)) continue;
    // Lowest-index non-star particle in the cell (deterministic).
    for (let i = 0; i < s.x.length; i++) {
      if (!s.isStar[i] && cellOf(s, i, G) === c) {
        s.isStar[i] = 1;
        s.starOf[s.nStars] = i;
        s.starBorn[s.nStars] = s.step;
        s.nStars++;
        occupied.add(c);
        made++;
        break;
      }
    }
    if (made >= MAX_NEW_STARS_PER_STEP || s.nStars >= p.maxStars) return;
  }
}

function cellOf(s: CosmoState, i: number, G: number): number {
  const cx = Math.min(G - 1, Math.floor(s.x[i] * G));
  const cy = Math.min(G - 1, Math.floor(s.y[i] * G));
  return cx + cy * G;
}

// ---------------------------------------------------------------------------

export function cloneCosmo(s: CosmoState): CosmoState {
  return {
    params: { ...s.params },
    step: s.step,
    x: s.x.slice(),
    y: s.y.slice(),
    vx: s.vx.slice(),
    vy: s.vy.slice(),
    gx: s.gx.slice(),
    gy: s.gy.slice(),
    starOf: s.starOf.slice(),
    starBorn: s.starBorn.slice(),
    nStars: s.nStars,
    isStar: s.isStar.slice(),
  };
}

export function copyCosmoInto(dst: CosmoState, src: CosmoState): void {
  dst.params = { ...src.params };
  dst.step = src.step;
  dst.x.set(src.x);
  dst.y.set(src.y);
  dst.vx.set(src.vx);
  dst.vy.set(src.vy);
  dst.gx.set(src.gx);
  dst.gy.set(src.gy);
  dst.starOf.set(src.starOf);
  dst.starBorn.set(src.starBorn);
  dst.nStars = src.nStars;
  dst.isStar.set(src.isStar);
}

let metricRho = new Float64Array(0);
let parent = new Int32Array(0);

export function cosmoMetrics(s: CosmoState): CosmoMetrics {
  const p = s.params;
  const G = p.G;
  if (metricRho.length !== G * G) {
    metricRho = new Float64Array(G * G);
    parent = new Int32Array(G * G);
  }
  depositDelta(s, metricRho);
  let v = 0;
  let maxDelta = -1;
  for (let c = 0; c < G * G; c++) {
    v += metricRho[c] * metricRho[c];
    if (metricRho[c] > maxDelta) maxDelta = metricRho[c];
  }
  // Largest clump: connected dense cells (8-neighbour, periodic), mass = Σ (1 + δ). A high
  // threshold keeps single cells on thin filaments from merging and splitting separate knots.
  for (let c = 0; c < G * G; c++) parent[c] = c;
  const find = (c: number): number => {
    while (parent[c] !== c) {
      parent[c] = parent[parent[c]];
      c = parent[c];
    }
    return c;
  };
  const dense = (c: number) => metricRho[c] > p.deltaClump;
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const c = i + j * G;
      if (!dense(c)) continue;
      const jn = ((j + 1) % G) * G;
      for (const nb of [((i + 1) % G) + j * G, i + jn, ((i + 1) % G) + jn, ((i + G - 1) % G) + jn]) {
        if (!dense(nb)) continue;
        const a = find(c);
        const b = find(nb);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  const mass = new Map<number, number>();
  for (let c = 0; c < G * G; c++) if (dense(c)) {
    const r = find(c);
    mass.set(r, (mass.get(r) ?? 0) + 1 + metricRho[c]);
  }
  let best = -1;
  let bestMass = 0;
  for (const [r, m] of mass) if (m > bestMass || (m === bestMass && r < best)) {
    best = r;
    bestMass = m;
  }
  // Centre of the largest clump: densest cell in it.
  let clumpX = 0.5;
  let clumpY = 0.5;
  if (best >= 0) {
    let peak = -Infinity;
    for (let c = 0; c < G * G; c++) if (dense(c) && find(c) === best && metricRho[c] > peak) {
      peak = metricRho[c];
      clumpX = ((c % G) + 0.5) / G;
      clumpY = (Math.floor(c / G) + 0.5) / G;
    }
  }
  const a = scaleFactorAt(p, s.step);
  return {
    step: s.step,
    a,
    t: timeOfA(p, a),
    sigma2: v / (G * G),
    maxDelta,
    nStars: s.nStars,
    largestClump: bestMass / (G * G),
    clumpX,
    clumpY,
  };
}
