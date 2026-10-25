import type { SimState } from './state';
import { gaussian } from './rng';

// ---------------------------------------------------------------------------
// Spatial hash grid (counting sort into cells of side >= r_max).
// Each particle only checks the 3x3 block of cells around it, so force
// evaluation is O(N).

export interface Grid {
  nc: number; // cells per side
  cellSize: number;
  cellStart: Int32Array; // length nc*nc + 1
  sorted: Int32Array; // particle indices ordered by cell
  cellOf: Int32Array; // cell index of each particle
}

const gridCache = new Map<string, Grid>();

function getGrid(N: number, L: number, minCell: number): Grid {
  const nc = Math.max(3, Math.floor(L / minCell));
  const key = `${N}:${nc}`;
  let g = gridCache.get(key);
  if (!g) {
    g = {
      nc,
      cellSize: L / nc,
      cellStart: new Int32Array(nc * nc + 1),
      sorted: new Int32Array(N),
      cellOf: new Int32Array(N),
    };
    gridCache.set(key, g);
  }
  return g;
}

/** Bins particles into cells. Order inside a cell is ascending index (deterministic). */
export function buildGrid(x: Float64Array, y: Float64Array, N: number, L: number, minCell: number): Grid {
  const g = getGrid(N, L, minCell);
  const { nc, cellStart, sorted, cellOf } = g;
  const inv = nc / L;
  cellStart.fill(0);
  for (let i = 0; i < N; i++) {
    let cx = Math.floor(x[i] * inv);
    let cy = Math.floor(y[i] * inv);
    if (cx >= nc) cx = nc - 1;
    if (cy >= nc) cy = nc - 1;
    const c = cx + cy * nc;
    cellOf[i] = c;
    cellStart[c + 1]++;
  }
  for (let c = 0; c < nc * nc; c++) cellStart[c + 1] += cellStart[c];
  // Running write cursor per cell.
  const cursor = cursorFor(nc * nc);
  cursor.set(cellStart.subarray(0, nc * nc));
  for (let i = 0; i < N; i++) sorted[cursor[cellOf[i]]++] = i;
  return g;
}

let cursorBuf = new Int32Array(0);
function cursorFor(n: number): Int32Array {
  if (cursorBuf.length < n) cursorBuf = new Int32Array(n);
  return cursorBuf.subarray(0, n);
}

/** Writes the 9 cells around cell c (periodic wrap) into out. */
export function neighbourCells(g: Grid, c: number, out: Int32Array): void {
  const nc = g.nc;
  const cx = c % nc;
  const cy = (c - cx) / nc;
  let k = 0;
  for (let dy = -1; dy <= 1; dy++) {
    const yy = (cy + dy + nc) % nc;
    for (let dx = -1; dx <= 1; dx++) {
      const xx = (cx + dx + nc) % nc;
      out[k++] = xx + yy * nc;
    }
  }
}

// ---------------------------------------------------------------------------
// Force law (Particle Life). r is distance / r_max, a = A[i][j].
// Positive = pull toward the neighbour.

export function pairForce(r: number, a: number, beta: number): number {
  if (r < beta) return r / beta - 1;
  if (r < 1) return a * (1 - Math.abs(2 * r - 1 - beta) / (1 - beta));
  return 0;
}

let fxBuf = new Float64Array(0);
let fyBuf = new Float64Array(0);
const nbr = new Int32Array(9);

/** Interaction forces on every particle (no field), written into fx, fy. */
export function computeForces(s: SimState, fx: Float64Array, fy: Float64Array): void {
  const { N, L, rMax, beta, kForce, K } = s.params;
  const { x, y, type, A } = s;
  const g = buildGrid(x, y, N, L, rMax);
  const { cellStart, sorted, cellOf } = g;
  const half = L / 2;
  const rMax2 = rMax * rMax;
  const invR = 1 / rMax;
  const invBeta = 1 / beta;
  const invOneMinusBeta = 1 / (1 - beta);

  for (let i = 0; i < N; i++) {
    const xi = x[i];
    const yi = y[i];
    const rowOff = type[i] * K;
    let fxi = 0;
    let fyi = 0;
    neighbourCells(g, cellOf[i], nbr);
    for (let n = 0; n < 9; n++) {
      const c = nbr[n];
      const end = cellStart[c + 1];
      for (let idx = cellStart[c]; idx < end; idx++) {
        const j = sorted[idx];
        if (j === i) continue;
        let dx = x[j] - xi;
        let dy = y[j] - yi;
        if (dx > half) dx -= L;
        else if (dx < -half) dx += L;
        if (dy > half) dy -= L;
        else if (dy < -half) dy += L;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rMax2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const r = d * invR;
        let f: number;
        if (r < beta) f = r * invBeta - 1;
        else f = A[rowOff + type[j]] * (1 - Math.abs(2 * r - 1 - beta) * invOneMinusBeta);
        const scale = (kForce * f) / d;
        fxi += scale * dx;
        fyi += scale * dy;
      }
    }
    fx[i] = fxi;
    fy[i] = fyi;
  }
}

// ---------------------------------------------------------------------------
// Langevin step.
//   F = F_interactions + q[type] * E0 * sin(omega * t) * d
//   v <- v + dt/m (F - gamma v) + sqrt(2 gamma T dt) xi
//   x <- x + v dt   (wrapped)
// Work and heat are accumulated every step so seeking reproduces them exactly.

export function fieldStrength(s: SimState): number {
  const p = s.params;
  if (p.E0 === 0) return 0;
  return p.E0 * Math.sin(((2 * Math.PI) / p.period) * s.step * p.dt);
}

export function stepSim(s: SimState, nSteps = 1): void {
  const p = s.params;
  const { N, L, dt, gamma, T } = p;
  if (fxBuf.length < N) {
    fxBuf = new Float64Array(N);
    fyBuf = new Float64Array(N);
  }
  const fx = fxBuf;
  const fy = fyBuf;
  const { x, y, vx, vy, type, q, rng } = s;
  const noiseAmp = Math.sqrt(2 * gamma * T * dt);
  const dirX = Math.cos(p.fieldAngle);
  const dirY = Math.sin(p.fieldAngle);

  for (let k = 0; k < nSteps; k++) {
    computeForces(s, fx, fy);
    const E = fieldStrength(s);
    const ex = E * dirX;
    const ey = E * dirY;
    let wdot = 0;
    let v2 = 0;
    for (let i = 0; i < N; i++) {
      const qi = q[type[i]];
      const fex = qi * ex;
      const fey = qi * ey;
      const ovx = vx[i];
      const ovy = vy[i];
      let nvx = ovx + dt * (fx[i] + fex - gamma * ovx);
      let nvy = ovy + dt * (fy[i] + fey - gamma * ovy);
      if (noiseAmp > 0) {
        nvx += noiseAmp * gaussian(rng);
        nvy += noiseAmp * gaussian(rng);
      }
      // Midpoint velocity for the power estimates.
      const mvx = 0.5 * (ovx + nvx);
      const mvy = 0.5 * (ovy + nvy);
      wdot += fex * mvx + fey * mvy;
      v2 += mvx * mvx + mvy * mvy;
      vx[i] = nvx;
      vy[i] = nvy;

      let nx = x[i] + nvx * dt;
      let ny = y[i] + nvy * dt;
      if (nx >= L) nx -= L;
      else if (nx < 0) nx += L;
      if (ny >= L) ny -= L;
      else if (ny < 0) ny += L;
      // Rounding (e.g. -1e-17 + L) can land exactly on L.
      x[i] = nx >= L ? 0 : nx;
      y[i] = ny >= L ? 0 : ny;
    }
    // Net heat to the bath: friction power minus what the noise injects (2 N gamma T in 2D).
    const qdot = gamma * v2 - 2 * N * gamma * T;
    s.lastWdot = wdot;
    s.lastQdot = qdot;
    s.W += wdot * dt;
    s.Q += qdot * dt;
    s.step++;
  }
}

/**
 * Flips every velocity (the "reverse time" button). With exact=true the flip is
 * v <- -v - F(x) dt, which makes this integrator retrace its own path exactly
 * (up to rounding) when there is no friction, noise or field. With friction and
 * noise the path is not retraced no matter how the flip is done.
 */
export function reverseVelocities(s: SimState, exact: boolean): void {
  const { N, dt } = s.params;
  if (fxBuf.length < N) {
    fxBuf = new Float64Array(N);
    fyBuf = new Float64Array(N);
  }
  if (exact) computeForces(s, fxBuf, fyBuf);
  for (let i = 0; i < N; i++) {
    s.vx[i] = -s.vx[i] - (exact ? fxBuf[i] * dt : 0);
    s.vy[i] = -s.vy[i] - (exact ? fyBuf[i] * dt : 0);
  }
}

/** Mean minimum-image distance between the same particles in two states (or position arrays). */
export function meanDisplacement(ax: ArrayLike<number>, ay: ArrayLike<number>, bx: ArrayLike<number>, by: ArrayLike<number>, L: number): number {
  const half = L / 2;
  let sum = 0;
  for (let i = 0; i < ax.length; i++) {
    let dx = ax[i] - bx[i];
    let dy = ay[i] - by[i];
    if (dx > half) dx -= L;
    else if (dx < -half) dx += L;
    if (dy > half) dy -= L;
    else if (dy < -half) dy += L;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum / ax.length;
}
