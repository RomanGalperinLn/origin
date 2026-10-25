// Clusters of a displayed frame, for drawing only (bonds, outlines, matching colours).
// Works on a copy of the positions, so it can never change the simulation or its metrics
// (tests/structures.test.ts checks this).

import type { SimParams } from './params';
import type { SimState } from './state';
import { findClusters, fingerprint } from './metrics';
import type { FrameStructures } from '../worker/protocol';

/** FNV-1a hash of a fingerprint string, as a hue in [0, 1). */
export function hueOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

/** Clusters of a frame (from its positions), with a colour per fingerprint. Drawing only. */
export function structuresOf(params: SimParams, type: Uint8Array, xy: Float32Array): FrameStructures {
  const N = type.length;
  const x = new Float64Array(N);
  const y = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = xy[2 * i];
    y[i] = xy[2 * i + 1];
  }
  const s = { params, x, y, type } as unknown as SimState;
  const c = findClusters(s);
  const keys = c.members.map((m) => fingerprint(s, m));
  const tally = new Map<string, number>();
  for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
  return { label: c.label, hue: Float32Array.from(keys, hueOf), matches: Int32Array.from(keys, (k) => tally.get(k)!) };
}

