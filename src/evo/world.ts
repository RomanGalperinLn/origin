// The evolution toy model: organisms with simple genomes eat, move, reproduce with
// mutation and die; selection does the rest. Oxygen, food and extinctions follow a
// schedule set from real dates. Deterministic: the only randomness is the seeded RNG
// stored in the state, so any step can be rebuilt exactly from a snapshot.

import { cloneRng, createRng, gaussian, nextFloat, type RngState } from '../sim/rng';
import type { EvoParams } from './params';

// Per-organism record, stride K in one Float64Array (fast to clone for snapshots).
export const X = 0;
export const Y = 1;
export const HEADING = 2;
export const ENERGY = 3;
export const AGE = 4;
// Genome
export const SIZE = 5;
export const SPEED = 6;
export const SENSE = 7;
export const METAB = 8;
export const CR = 9;
export const CG = 10;
export const CB = 11;
export const SEGMENTS = 12;
export const DIET = 13;
/** Species id (index into the tree). Inherited at birth, changed only by a census split. */
export const SPECIES = 14;
/** Steps left digesting a catch (no hunting meanwhile): a predator's handling time. */
export const DIGEST = 15;
export const K = 16;

/** Gene ranges (clamped after mutation). */
const RANGE: Record<number, [number, number]> = {
  [SIZE]: [0.4, 4],
  [SPEED]: [0.1, 2.5],
  [SENSE]: [1, 12],
  [METAB]: [0.05, 1],
  [CR]: [0, 1],
  [CG]: [0, 1],
  [CB]: [0, 1],
  [DIET]: [0, 1],
};
/** Mutation scale per gene (times params.mutation). Colour is neutral, so it drifts: a lineage marker. */
const MUT_SCALE: Record<number, number> = { [SIZE]: 1, [SPEED]: 0.8, [SENSE]: 5, [METAB]: 0.5, [CR]: 1, [CG]: 1, [CB]: 1, [DIET]: 0.6 };
const MAX_SEGMENTS = 8;

export interface SpeciesNode {
  id: number;
  parent: number;
  born: number;
  /** Step of the census that found it gone; -1 while alive. */
  died: number;
  r: number;
  g: number;
  b: number;
  /** Members at the latest census (0 once extinct). */
  n: number;
  /** Mean segments at the latest census. */
  seg: number;
}

export interface EvoState {
  params: EvoParams;
  step: number;
  rng: RngState;
  org: Float64Array;
  n: number;
  food: Float64Array;
  nFood: number;
  /** Food patch centres (x, y), the first `patches` active before the Cambrian. */
  patchXY: Float64Array;
  tree: SpeciesNode[];
  births: number;
  deaths: number;
  eaten: number;
}

export interface Environment {
  oxygen: number;
  foodRate: number;
  patches: number;
  snowball: boolean;
}

export interface EvoMetrics {
  step: number;
  population: number;
  species: number;
  meanSegments: number;
  maxSegments: number;
  /** Shannon entropy of species sizes (nats): genetic diversity. */
  diversity: number;
  meanSize: number;
  /** Fraction of organisms able to eat others. */
  predators: number;
  oxygen: number;
  food: number;
}

const ramp = (s: number, [a, b]: [number, number]) => Math.max(0, Math.min(1, (s - a) / Math.max(1, b - a)));

/** The environment at a step: a pure function of the schedule (dates from events.json). */
export function environmentAt(p: EvoParams, step: number): Environment {
  const sc = p.schedule;
  let oxygen = p.oxygenLow;
  if (p.oxygenRises) {
    oxygen += (p.oxygenMid - p.oxygenLow) * ramp(step, sc.goe);
    oxygen += (1 - p.oxygenMid) * ramp(step, sc.noe);
  }
  const snowball = step >= sc.snowball[0] && step < sc.snowball[1];
  const cambrian = step >= sc.cambrian;
  let foodRate = p.foodRate * (cambrian ? p.cambrianFood : 1);
  if (snowball) foodRate *= p.snowballFood;
  return { oxygen, foodRate, patches: cambrian ? p.cambrianPatches : p.patches, snowball };
}

const wrapL = (v: number, L: number) => {
  v %= L;
  return v < 0 ? v + L : v;
};

/** Shortest periodic displacement. */
const dper = (d: number, L: number) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);

export function createEvo(p: EvoParams): EvoState {
  const rng = createRng(p.seed * 7919 + 13);
  const org = new Float64Array(p.maxPopulation * K);
  const s: EvoState = {
    params: p,
    step: 0,
    rng,
    org,
    n: 0,
    food: new Float64Array(2 * p.maxFood),
    nFood: 0,
    patchXY: new Float64Array(2 * Math.max(p.patches, p.cambrianPatches)),
    tree: [{ id: 0, parent: -1, born: 0, died: -1, r: 0.3, g: 0.8, b: 0.75, n: p.initialPopulation, seg: 1 }],
    births: 0,
    deaths: 0,
    eaten: 0,
  };
  for (let k = 0; k < s.patchXY.length; k++) s.patchXY[k] = nextFloat(rng) * p.L;
  for (let i = 0; i < p.initialPopulation; i++) {
    const o = i * K;
    org[o + X] = nextFloat(rng) * p.L;
    org[o + Y] = nextFloat(rng) * p.L;
    org[o + HEADING] = nextFloat(rng) * 2 * Math.PI;
    org[o + ENERGY] = p.startEnergy;
    org[o + AGE] = Math.floor(nextFloat(rng) * p.maxAge * 0.5);
    org[o + SIZE] = 1;
    org[o + SPEED] = 0.8;
    org[o + SENSE] = 6;
    org[o + METAB] = 0.5;
    org[o + CR] = 0.3 + 0.05 * gaussian(rng);
    org[o + CG] = 0.8 + 0.05 * gaussian(rng);
    org[o + CB] = 0.75 + 0.05 * gaussian(rng);
    org[o + SEGMENTS] = 1;
    org[o + DIET] = 0.05;
    org[o + SPECIES] = 0;
    if (p.identicalStart) {
      // CONTROLLED: identical organisms, neatly placed on a grid, all the same age.
      const cols = Math.ceil(Math.sqrt(p.initialPopulation));
      org[o + X] = ((i % cols) + 0.5) * (p.L / cols);
      org[o + Y] = (Math.floor(i / cols) + 0.5) * (p.L / cols);
      org[o + HEADING] = 0;
      org[o + AGE] = 0;
      org[o + CR] = 0.3;
      org[o + CG] = 0.8;
      org[o + CB] = 0.75;
    }
  }
  s.n = p.initialPopulation;
  for (let k = 0; k < 300; k++) spawnFood(s, environmentAt(p, 0));
  return s;
}

// --- body plan -------------------------------------------------------------------
// Extra segments (cells) make a bigger, faster body that keeps more of what it eats (division
// of labour), but bodies also pay an oxygen overhead that grows with the square of the extra
// segments (supplying oxygen to inner cells gets harder with size), divided by the oxygen
// level: multicellularity only pays once oxygen is high, and stays modest even then.

export const bodyMass = (org: Float64Array, o: number) => org[o + SIZE] * (1 + 0.5 * (org[o + SEGMENTS] - 1));
const metabolicScale = (org: Float64Array, o: number) => org[o + SIZE] * (1 + 0.15 * (org[o + SEGMENTS] - 1));
const speedOf = (org: Float64Array, o: number) => org[o + SPEED] * (1 + 0.1 * (org[o + SEGMENTS] - 1));
/** Mouth reach: grows a little with body size, capped (a big body is not a big net). */
const reachOf = (body: number) => Math.min(2, 0.7 + 0.25 * body);
/**
 * Fraction of eaten energy kept. Metabolism raises it; extra segments (specialised cells)
 * close part of the remaining gap, with diminishing returns. Never above 1.
 */
const assimilationOf = (org: Float64Array, o: number) => 1 - (0.5 - 0.5 * org[o + METAB] * 0.9) / org[o + SEGMENTS];

// --- spatial hashing (scratch buffers shared by all states in this thread) -------

let gridG = 0;
let foodStart = new Int32Array(0);
let foodIdx = new Int32Array(0);
let orgStart = new Int32Array(0);
let orgIdx = new Int32Array(0);
let foodGone = new Uint8Array(0);
let orgGone = new Uint8Array(0);

function cellOfXY(x: number, y: number, G: number, L: number): number {
  const cx = Math.min(G - 1, Math.floor((x / L) * G));
  const cy = Math.min(G - 1, Math.floor((y / L) * G));
  return cx + cy * G;
}

function buildGrid(xy: (i: number) => [number, number], count: number, G: number, L: number, start: Int32Array, idx: Int32Array): void {
  start.fill(0);
  const cells = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y] = xy(i);
    cells[i] = cellOfXY(x, y, G, L);
    start[cells[i] + 1]++;
  }
  for (let c = 0; c < G * G; c++) start[c + 1] += start[c];
  const fill = start.slice(0, G * G);
  for (let i = 0; i < count; i++) idx[fill[cells[i]]++] = i;
}

function ensureScratch(p: EvoParams): void {
  const G = Math.max(1, Math.floor(p.L / RANGE[SENSE][1]));
  if (G !== gridG) {
    gridG = G;
    foodStart = new Int32Array(G * G + 1);
    orgStart = new Int32Array(G * G + 1);
  }
  if (foodIdx.length < p.maxFood) {
    foodIdx = new Int32Array(p.maxFood);
    foodGone = new Uint8Array(p.maxFood);
  }
  if (orgIdx.length < p.maxPopulation) {
    orgIdx = new Int32Array(p.maxPopulation);
    orgGone = new Uint8Array(p.maxPopulation);
  }
}

function spawnFood(s: EvoState, env: Environment): void {
  const p = s.params;
  if (s.nFood >= p.maxFood) return;
  const r = s.rng;
  let x: number;
  let y: number;
  if (nextFloat(r) < p.uniformFood) {
    x = nextFloat(r) * p.L;
    y = nextFloat(r) * p.L;
  } else {
    const k = Math.min(env.patches - 1, Math.floor(nextFloat(r) * env.patches));
    x = s.patchXY[2 * k] + 9 * gaussian(r);
    y = s.patchXY[2 * k + 1] + 9 * gaussian(r);
  }
  s.food[2 * s.nFood] = wrapL(x, p.L);
  s.food[2 * s.nFood + 1] = wrapL(y, p.L);
  s.nFood++;
}

// --- one step ----------------------------------------------------------------------

export function stepEvo(s: EvoState, nSteps = 1): void {
  for (let k = 0; k < nSteps; k++) stepOnce(s);
}

function stepOnce(s: EvoState): void {
  const p = s.params;
  const L = p.L;
  const r = s.rng;
  const org = s.org;
  const env = environmentAt(p, s.step);
  ensureScratch(p);
  const G = gridG;

  // Food grows in patches (sunlit shallows, vents) and a little everywhere.
  const whole = Math.floor(env.foodRate);
  const nSpawn = whole + (nextFloat(r) < env.foodRate - whole ? 1 : 0);
  for (let i = 0; i < nSpawn; i++) spawnFood(s, env);

  // Mass extinction: whole species are wiped out, in random order, until the cited fraction of
  // species is gone. Survivors keep at least 10% of the organisms (real survivors tend to be
  // widespread groups), so the world is not left with a handful. Lineages end on the tree at once.
  for (const ex of p.schedule.extinctions) {
    if (ex.step !== s.step) continue;
    const size = new Map<number, number>();
    for (let i = 0; i < s.n; i++) size.set(org[i * K + SPECIES], (size.get(org[i * K + SPECIES]) ?? 0) + 1);
    const order = [...size.keys()].sort((a, b) => a - b);
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(nextFloat(r) * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    const target = Math.min(order.length - 1, Math.round(ex.fraction * order.length));
    const doomed = new Set<number>();
    let left = s.n;
    for (const sp of order) {
      if (doomed.size >= target) break;
      if (left - size.get(sp)! < 0.1 * s.n) continue;
      doomed.add(sp);
      left -= size.get(sp)!;
    }
    for (let i = 0; i < s.n; i++) if (doomed.has(org[i * K + SPECIES])) org[i * K + ENERGY] = -1;
    compactOrganisms(s, new Uint8Array(0));
    markExtinct(s);
  }

  const n0 = s.n;
  buildGrid((i) => [s.food[2 * i], s.food[2 * i + 1]], s.nFood, G, L, foodStart, foodIdx);
  buildGrid((i) => [org[i * K + X], org[i * K + Y]], n0, G, L, orgStart, orgIdx);
  foodGone.fill(0, 0, s.nFood);
  orgGone.fill(0, 0, n0);
  const cellSize = L / G;

  for (let i = 0; i < n0; i++) {
    if (orgGone[i]) continue;
    const o = i * K;
    const x = org[o + X];
    const y = org[o + Y];
    const body = bodyMass(org, o);
    const sense = org[o + SENSE];
    const diet = org[o + DIET];
    const hunter = diet >= p.predationDiet && org[o + DIGEST] <= 0;
    if (org[o + DIGEST] > 0) org[o + DIGEST]--;
    const cx = Math.min(G - 1, Math.floor(x / cellSize));
    const cy = Math.min(G - 1, Math.floor(y / cellSize));
    const reachC = Math.ceil(sense / cellSize);

    // Nearest food and (for hunters) nearest smaller organism within sense range.
    let bestF = -1;
    let bestFd = sense * sense;
    let bestP = -1;
    let bestPd = sense * sense;
    for (let dy = -reachC; dy <= reachC; dy++)
      for (let dx = -reachC; dx <= reachC; dx++) {
        const c = ((cx + dx + G) % G) + ((cy + dy + G) % G) * G;
        if (diet < 1)
          for (let q = foodStart[c]; q < foodStart[c + 1]; q++) {
            const f = foodIdx[q];
            if (foodGone[f]) continue;
            const ddx = dper(s.food[2 * f] - x, L);
            const ddy = dper(s.food[2 * f + 1] - y, L);
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < bestFd) {
              bestFd = d2;
              bestF = f;
            }
          }
        if (hunter)
          for (let q = orgStart[c]; q < orgStart[c + 1]; q++) {
            const j = orgIdx[q];
            if (j === i || orgGone[j]) continue;
            if (bodyMass(org, j * K) * p.predationRatio >= body) continue;
            const ddx = dper(org[j * K + X] - x, L);
            const ddy = dper(org[j * K + Y] - y, L);
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < bestPd) {
              bestPd = d2;
              bestP = j;
            }
          }
      }

    // Move: toward prey if hunting and found, else toward food, else wander.
    const sp = speedOf(org, o);
    let tx = 0;
    let ty = 0;
    let target = 0; // 1 food, 2 prey
    if (bestP >= 0) {
      tx = org[bestP * K + X];
      ty = org[bestP * K + Y];
      target = 2;
    } else if (bestF >= 0) {
      tx = s.food[2 * bestF];
      ty = s.food[2 * bestF + 1];
      target = 1;
    }
    if (target) org[o + HEADING] = Math.atan2(dper(ty - y, L), dper(tx - x, L));
    else org[o + HEADING] += 0.4 * gaussian(r);
    const h = org[o + HEADING];
    const dist = target ? Math.sqrt(target === 1 ? bestFd : bestPd) : Infinity;
    const stepLen = Math.min(sp, dist);
    const nx = wrapL(x + stepLen * Math.cos(h), L);
    const ny = wrapL(y + stepLen * Math.sin(h), L);
    org[o + X] = nx;
    org[o + Y] = ny;

    // Eat what is within reach.
    const reach = reachOf(body);
    const assim = assimilationOf(org, o);
    const seg = org[o + SEGMENTS];
    if (target && dist - stepLen <= reach) {
      if (target === 1) {
        foodGone[bestF] = 1;
        org[o + ENERGY] += p.foodEnergy * (1 - 0.6 * diet) * assim;
      } else if (sp > speedOf(org, bestP * K)) {
        // A catch needs a faster hunter: slower prey is eaten, faster prey escapes.
        const po = bestP * K;
        orgGone[bestP] = 1;
        org[o + DIGEST] = p.handlingSteps;
        org[o + ENERGY] += diet * assim * p.preyEfficiency * (p.bodyEnergy * bodyMass(org, po) + Math.max(0, org[po + ENERGY]));
        s.eaten++;
      }
    }

    // Pay for living: bigger and faster costs more; extra segments need oxygen.
    const ms = metabolicScale(org, o);
    org[o + ENERGY] -=
      p.costBase * ms +
      p.costMove * org[o + METAB] * ms * stepLen * stepLen +
      p.costSense * sense +
      (p.costSegment * (seg - 1) * (seg - 1)) / env.oxygen;
    org[o + AGE]++;
  }

  compactFood(s);
  compactOrganisms(s, orgGone);

  // Reproduction (asexual): the parent pays for the child's body (energy that a predator can
  // later get back), then splits what is left with a mutated copy of itself.
  const nNow = s.n;
  for (let i = 0; i < nNow && s.n < p.maxPopulation; i++) {
    const o = i * K;
    const bodyCost = p.bodyEnergy * bodyMass(org, o);
    if (org[o + ENERGY] <= p.reproduceEnergy * metabolicScale(org, o) + bodyCost) continue;
    const c = s.n * K;
    org.copyWithin(c, o, o + K);
    org[o + ENERGY] = 0.5 * (org[o + ENERGY] - bodyCost);
    org[c + ENERGY] = org[o + ENERGY];
    org[c + AGE] = 0;
    org[c + DIGEST] = 0;
    org[c + X] = wrapL(org[o + X] + gaussian(r), L);
    org[c + Y] = wrapL(org[o + Y] + gaussian(r), L);
    org[c + HEADING] = nextFloat(r) * 2 * Math.PI;
    for (const gene of [SIZE, SPEED, SENSE, METAB, CR, CG, CB, DIET]) {
      const [lo, hi] = RANGE[gene];
      org[c + gene] = Math.max(lo, Math.min(hi, org[c + gene] + p.mutation * MUT_SCALE[gene] * gaussian(r)));
    }
    if (nextFloat(r) < p.segmentMutation) {
      const up = nextFloat(r) < 0.5 ? 1 : -1;
      org[c + SEGMENTS] = Math.max(1, Math.min(MAX_SEGMENTS, org[c + SEGMENTS] + up));
    }
    s.n++;
    s.births++;
  }

  s.step++;
  if (s.step % p.censusEvery === 0) census(s);
}

function compactFood(s: EvoState): void {
  let w = 0;
  for (let f = 0; f < s.nFood; f++) {
    if (foodGone[f]) continue;
    s.food[2 * w] = s.food[2 * f];
    s.food[2 * w + 1] = s.food[2 * f + 1];
    w++;
  }
  s.nFood = w;
}

/** Removes eaten, starved and old organisms, keeping order (determinism). */
function compactOrganisms(s: EvoState, gone: Uint8Array): void {
  const org = s.org;
  const maxAge = s.params.maxAge;
  let w = 0;
  for (let i = 0; i < s.n; i++) {
    const o = i * K;
    if ((i < gone.length && gone[i]) || org[o + ENERGY] <= 0 || org[o + AGE] > maxAge) {
      s.deaths++;
      continue;
    }
    if (w !== i) org.copyWithin(w * K, o, o + K);
    w++;
  }
  s.n = w;
}

// --- species --------------------------------------------------------------------------

/** Ends the lineages that have no members left. */
function markExtinct(s: EvoState): void {
  const alive = new Set<number>();
  for (let i = 0; i < s.n; i++) alive.add(s.org[i * K + SPECIES]);
  for (const node of s.tree)
    if (node.died < 0 && !alive.has(node.id)) {
      node.died = s.step;
      node.n = 0;
    }
}

const FEATURES: [number, number][] = [
  [SIZE, 0.5],
  [SPEED, 1 / 1.5],
  [SENSE, 0.1],
  [METAB, 1],
  [CR, 0.6],
  [CG, 0.6],
  [CB, 0.6],
  [SEGMENTS, 1 / 3],
  [DIET, 1.5],
];
const NF = FEATURES.length;

function feature(org: Float64Array, i: number, out: Float64Array, off: number): void {
  for (let f = 0; f < NF; f++) out[off + f] = org[i * K + FEATURES[f][0]] * FEATURES[f][1];
}

function dist2(a: Float64Array, ai: number, b: Float64Array, bi: number): number {
  let d = 0;
  for (let f = 0; f < NF; f++) {
    const e = a[ai + f] - b[bi + f];
    d += e * e;
  }
  return d;
}

/**
 * Census: counts members, marks extinct species, and splits a species in two when its
 * members have drifted into two clearly different groups (2-means on the genome).
 */
export function census(s: EvoState): void {
  const p = s.params;
  const org = s.org;
  const members = new Map<number, number[]>();
  for (let i = 0; i < s.n; i++) {
    const sp = org[i * K + SPECIES];
    let m = members.get(sp);
    if (!m) members.set(sp, (m = []));
    m.push(i);
  }
  for (const node of s.tree) {
    if (node.died >= 0) continue;
    const m = members.get(node.id);
    if (!m) {
      node.died = s.step;
      node.n = 0;
      continue;
    }
    node.n = m.length;
    let seg = 0;
    for (const i of m) seg += org[i * K + SEGMENTS];
    node.seg = seg / m.length;
  }

  const candidates = [...members.entries()]
    .filter(([, m]) => m.length >= 2 * p.minSpecies)
    .sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  let splits = 0;
  for (const [id, m] of candidates) {
    if (splits >= p.maxSplits) break;
    const feats = new Float64Array(m.length * NF);
    m.forEach((i, k) => feature(org, i, feats, k * NF));
    // Deterministic 2-means: seeds are the member farthest from the mean and the one farthest from it.
    const mean = new Float64Array(NF);
    for (let k = 0; k < m.length; k++) for (let f = 0; f < NF; f++) mean[f] += feats[k * NF + f] / m.length;
    let a = 0;
    for (let k = 1; k < m.length; k++) if (dist2(feats, k * NF, mean, 0) > dist2(feats, a * NF, mean, 0)) a = k;
    let b = 0;
    for (let k = 1; k < m.length; k++) if (dist2(feats, k * NF, feats, a * NF) > dist2(feats, b * NF, feats, a * NF)) b = k;
    const ca = feats.slice(a * NF, a * NF + NF);
    const cb = feats.slice(b * NF, b * NF + NF);
    const side = new Uint8Array(m.length);
    for (let it = 0; it < 8; it++) {
      for (let k = 0; k < m.length; k++) side[k] = dist2(feats, k * NF, ca, 0) <= dist2(feats, k * NF, cb, 0) ? 0 : 1;
      const sums = [new Float64Array(NF), new Float64Array(NF)];
      const counts = [0, 0];
      for (let k = 0; k < m.length; k++) {
        counts[side[k]]++;
        for (let f = 0; f < NF; f++) sums[side[k]][f] += feats[k * NF + f];
      }
      if (!counts[0] || !counts[1]) break;
      for (let f = 0; f < NF; f++) {
        ca[f] = sums[0][f] / counts[0];
        cb[f] = sums[1][f] / counts[1];
      }
    }
    let n1 = 0;
    for (let k = 0; k < m.length; k++) n1 += side[k];
    const n0 = m.length - n1;
    if (Math.min(n0, n1) < p.minSpecies || Math.sqrt(dist2(ca, 0, cb, 0)) < p.splitDistance) continue;
    // The smaller group becomes the new species (a branch off the old one).
    const newSide = n1 <= n0 ? 1 : 0;
    const nodeId = s.tree.length;
    let rr = 0;
    let gg = 0;
    let bb = 0;
    let seg = 0;
    let cnt = 0;
    for (let k = 0; k < m.length; k++) {
      if (side[k] !== newSide) continue;
      const o = m[k] * K;
      org[o + SPECIES] = nodeId;
      rr += org[o + CR];
      gg += org[o + CG];
      bb += org[o + CB];
      seg += org[o + SEGMENTS];
      cnt++;
    }
    s.tree.push({ id: nodeId, parent: id, born: s.step, died: -1, r: rr / cnt, g: gg / cnt, b: bb / cnt, n: cnt, seg: seg / cnt });
    const old = s.tree[id];
    old.n -= cnt;
    splits++;
  }
}

// --- metrics, cloning ---------------------------------------------------------------

export function evoMetrics(s: EvoState): EvoMetrics {
  const org = s.org;
  const counts = new Map<number, number>();
  let seg = 0;
  let maxSeg = 0;
  let size = 0;
  let pred = 0;
  for (let i = 0; i < s.n; i++) {
    const o = i * K;
    const sp = org[o + SPECIES];
    counts.set(sp, (counts.get(sp) ?? 0) + 1);
    seg += org[o + SEGMENTS];
    if (org[o + SEGMENTS] > maxSeg) maxSeg = org[o + SEGMENTS];
    size += bodyMass(org, o);
    if (org[o + DIET] >= s.params.predationDiet) pred++;
  }
  let H = 0;
  for (const c of counts.values()) {
    const q = c / s.n;
    H -= q * Math.log(q);
  }
  const n = Math.max(1, s.n);
  return {
    step: s.step,
    population: s.n,
    species: counts.size,
    meanSegments: s.n ? seg / n : 0,
    maxSegments: maxSeg,
    diversity: H,
    meanSize: size / n,
    predators: pred / n,
    oxygen: environmentAt(s.params, s.step).oxygen,
    food: s.nFood,
  };
}

export function cloneEvo(s: EvoState): EvoState {
  return {
    params: s.params,
    step: s.step,
    rng: cloneRng(s.rng),
    org: s.org.slice(),
    n: s.n,
    food: s.food.slice(),
    nFood: s.nFood,
    patchXY: s.patchXY.slice(),
    tree: s.tree.map((t) => ({ ...t })),
    births: s.births,
    deaths: s.deaths,
    eaten: s.eaten,
  };
}

export function copyEvoInto(dst: EvoState, src: EvoState): void {
  dst.params = src.params;
  dst.step = src.step;
  dst.rng = cloneRng(src.rng);
  dst.org.set(src.org);
  dst.n = src.n;
  dst.food.set(src.food);
  dst.nFood = src.nFood;
  dst.patchXY.set(src.patchXY);
  dst.tree = src.tree.map((t) => ({ ...t }));
  dst.births = src.births;
  dst.deaths = src.deaths;
  dst.eaten = src.eaten;
}
