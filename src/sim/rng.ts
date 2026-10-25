// Seeded PRNG (mulberry32) plus Box-Muller Gaussians. The whole generator
// state is a few plain numbers so it can be snapshotted and restored exactly.

export interface RngState {
  s: number; // uint32 mulberry32 state
  spare: number; // cached second Box-Muller sample
  hasSpare: boolean;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0, spare: 0, hasSpare: false };
}

export function cloneRng(r: RngState): RngState {
  return { s: r.s, spare: r.spare, hasSpare: r.hasSpare };
}

/** Uniform in [0, 1). */
export function nextFloat(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform in [a, b). */
export function uniform(r: RngState, a: number, b: number): number {
  return a + (b - a) * nextFloat(r);
}

/** Standard normal sample. */
export function gaussian(r: RngState): number {
  if (r.hasSpare) {
    r.hasSpare = false;
    return r.spare;
  }
  let u = nextFloat(r);
  while (u <= 1e-12) u = nextFloat(r);
  const v = nextFloat(r);
  const mag = Math.sqrt(-2 * Math.log(u));
  r.spare = mag * Math.sin(2 * Math.PI * v);
  r.hasSpare = true;
  return mag * Math.cos(2 * Math.PI * v);
}
