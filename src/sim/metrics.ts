import { deflateSync } from 'fflate';
import type { SimState } from './state';
import { buildGrid, neighbourCells } from './physics';

export interface MetricSample {
  step: number;
  time: number;
  /** Power absorbed from the field, sum F_ext . v. */
  W_dot: number;
  /** Cumulative work absorbed from the field. */
  W: number;
  /** Net heat flow into the bath (friction power minus noise input). */
  Q_dot: number;
  /** Entropy production rate of the bath, Q_dot / T. */
  S_dot: number;
  /** Cumulative entropy produced in the bath, Q / T. */
  S: number;
  nClusters: number;
  meanClusterSize: number;
  largestCluster: number;
  fracClustered: number;
  /** Largest number of clusters sharing one fingerprint. */
  maxCopies: number;
  /** Number of fingerprints that appear at least twice. */
  repeatedShapes: number;
  /** 1 - compressed / raw size of the quantised type grid. */
  order: number;
}

export const METRIC_KEYS = [
  'step', 'time', 'W_dot', 'W', 'Q_dot', 'S_dot', 'S', 'nClusters', 'meanClusterSize',
  'largestCluster', 'fracClustered', 'maxCopies', 'repeatedShapes', 'order',
] as const;

// ---------------------------------------------------------------------------
// Clusters: connected components of the "closer than r_link" graph.

export interface Clusters {
  /** Cluster index per particle (into members), or -1 if not in a counted cluster. */
  label: Int32Array;
  /** Particle indices of each cluster with at least minClusterSize members, ascending. */
  members: Int32Array[];
}

const nbr = new Int32Array(9);
let parentBuf = new Int32Array(0);

function find(parent: Int32Array, i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

export function findClusters(s: SimState): Clusters {
  const { N, L, rMax, rLink, minClusterSize } = s.params;
  const { x, y } = s;
  if (parentBuf.length < N) parentBuf = new Int32Array(N);
  const parent = parentBuf;
  for (let i = 0; i < N; i++) parent[i] = i;

  const g = buildGrid(x, y, N, L, Math.max(rMax, rLink));
  const { cellStart, sorted, cellOf } = g;
  const half = L / 2;
  const r2 = rLink * rLink;
  for (let i = 0; i < N; i++) {
    neighbourCells(g, cellOf[i], nbr);
    for (let n = 0; n < 9; n++) {
      const c = nbr[n];
      for (let idx = cellStart[c]; idx < cellStart[c + 1]; idx++) {
        const j = sorted[idx];
        if (j <= i) continue;
        let dx = x[j] - x[i];
        let dy = y[j] - y[i];
        if (dx > half) dx -= L;
        else if (dx < -half) dx += L;
        if (dy > half) dy -= L;
        else if (dy < -half) dy += L;
        if (dx * dx + dy * dy < r2) {
          const a = find(parent, i);
          const b = find(parent, j);
          // Smaller index becomes the root, so labels are deterministic.
          if (a < b) parent[b] = a;
          else if (b < a) parent[a] = b;
        }
      }
    }
  }

  const size = new Int32Array(N);
  for (let i = 0; i < N; i++) size[find(parent, i)]++;
  const rootToCluster = new Int32Array(N).fill(-1);
  const counts: number[] = [];
  for (let i = 0; i < N; i++) {
    if (parent[i] === i && size[i] >= minClusterSize) {
      rootToCluster[i] = counts.length;
      counts.push(size[i]);
    }
  }
  const members = counts.map((n) => new Int32Array(n));
  const fill = new Int32Array(counts.length);
  const label = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const c = rootToCluster[find(parent, i)];
    if (c >= 0) {
      label[i] = c;
      members[c][fill[c]++] = i;
    }
  }
  return { label, members };
}

// ---------------------------------------------------------------------------
// Fingerprint: composition + radius of gyration + pairwise distance histogram.
// Clusters with the same composition and shape get the same string.
// Composition is coarse on purpose (which types make up >= 10% of the cluster):
// exact type counts almost never match for clusters bigger than ~10 particles.

const FP_MAX_MEMBERS = 120; // cap the O(n^2) distance histogram on huge clusters

export function fingerprint(s: SimState, m: Int32Array): string {
  const { K, L, rMax } = s.params;
  const half = L / 2;
  const counts = new Array<number>(K).fill(0);
  for (let k = 0; k < m.length; k++) counts[s.type[m[k]]]++;
  const recipe = counts.map((c) => (c >= 0.1 * m.length ? 1 : 0)).join('');

  // Unwrap positions relative to the first member (clusters are much smaller than L/2).
  const n = Math.min(m.length, FP_MAX_MEMBERS);
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const x0 = s.x[m[0]];
  const y0 = s.y[m[0]];
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < n; k++) {
    let dx = s.x[m[k]] - x0;
    let dy = s.y[m[k]] - y0;
    if (dx > half) dx -= L;
    else if (dx < -half) dx += L;
    if (dy > half) dy -= L;
    else if (dy < -half) dy += L;
    px[k] = dx;
    py[k] = dy;
    cx += dx;
    cy += dy;
  }
  cx /= n;
  cy /= n;
  let rg2 = 0;
  for (let k = 0; k < n; k++) rg2 += (px[k] - cx) ** 2 + (py[k] - cy) ** 2;
  const rg = Math.sqrt(rg2 / n) / rMax;

  // 5 bins of width 0.5 r_max; the last bin takes everything beyond 2 r_max.
  const hist = [0, 0, 0, 0, 0];
  let pairs = 0;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      const d = Math.hypot(px[a] - px[b], py[a] - py[b]) / rMax;
      hist[Math.min(4, Math.floor(d / 0.5))]++;
      pairs++;
    }
  const histKey = hist.map((h) => (h / Math.max(1, pairs)).toFixed(1)).join(',');
  return `${recipe}|${rg.toFixed(1)}|${histKey}`;
}

export interface CopyStats {
  maxCopies: number;
  repeatedShapes: number;
  /** Fingerprint shared by the most clusters (null if none repeats). */
  topFingerprint: string | null;
  /** Fingerprint of each cluster, same order as Clusters.members. */
  keys: string[];
}

export function copyStats(s: SimState, c: Clusters): CopyStats {
  const keys = c.members.map((m) => fingerprint(s, m));
  const tally = new Map<string, number>();
  for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
  let maxCopies = 0;
  let repeatedShapes = 0;
  let topFingerprint: string | null = null;
  for (const [k, n] of tally) {
    if (n >= 2) repeatedShapes++;
    if (n > maxCopies) {
      maxCopies = n;
      topFingerprint = k;
    }
  }
  if (maxCopies < 2) topFingerprint = null;
  return { maxCopies, repeatedShapes, topFingerprint, keys };
}

// ---------------------------------------------------------------------------
// Order via compression: 64x64 grid of the dominant type per cell (255 = empty).

const ORDER_GRID = 64;

export function orderByCompression(s: SimState): number {
  const { N, K, L } = s.params;
  const G = ORDER_GRID;
  const counts = new Uint16Array(G * G * K);
  const inv = G / L;
  for (let i = 0; i < N; i++) {
    const gx = Math.min(G - 1, Math.floor(s.x[i] * inv));
    const gy = Math.min(G - 1, Math.floor(s.y[i] * inv));
    counts[(gx + gy * G) * K + s.type[i]]++;
  }
  const raw = new Uint8Array(G * G);
  for (let c = 0; c < G * G; c++) {
    let best = 255;
    let bestN = 0;
    for (let t = 0; t < K; t++) {
      const n = counts[c * K + t];
      if (n > bestN) {
        bestN = n;
        best = t;
      }
    }
    raw[c] = best;
  }
  const compressed = deflateSync(raw, { level: 9 });
  return 1 - compressed.length / raw.length;
}

// ---------------------------------------------------------------------------

export function computeMetrics(s: SimState): MetricSample {
  const { N, T, dt } = s.params;
  const c = findClusters(s);
  const cs = copyStats(s, c);
  let clustered = 0;
  let largest = 0;
  for (const m of c.members) {
    clustered += m.length;
    if (m.length > largest) largest = m.length;
  }
  const nClusters = c.members.length;
  return {
    step: s.step,
    time: s.step * dt,
    W_dot: s.lastWdot,
    W: s.W,
    Q_dot: s.lastQdot,
    S_dot: T > 0 ? s.lastQdot / T : 0,
    S: T > 0 ? s.Q / T : 0,
    nClusters,
    meanClusterSize: nClusters > 0 ? clustered / nClusters : 0,
    largestCluster: largest,
    fracClustered: clustered / N,
    maxCopies: cs.maxCopies,
    repeatedShapes: cs.repeatedShapes,
    order: orderByCompression(s),
  };
}
