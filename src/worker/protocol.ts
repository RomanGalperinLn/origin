import type { SimParams } from '../sim/params';
import type { MetricSample } from '../sim/metrics';

// Main thread -> worker
export type ToWorker =
  /** runId is echoed on every reply so the page can drop messages from a previous run. */
  | { type: 'init'; runId: number; params: SimParams; targetSteps: number }
  | { type: 'setTarget'; targetSteps: number }
  /**
   * exact=false lets the worker answer from the cached frame at or before `step`.
   * structures=true adds each run's clusters (for drawing bonds and outlines).
   */
  | { type: 'frame'; step: number; exact: boolean; highlight: boolean; structures?: boolean }
  /** Flip the driven run's velocities at `step` and run a short branch. */
  | { type: 'reverse'; step: number; frictionless: boolean };

// Worker -> main thread
export type FromWorker =
  | { type: 'ready'; runId: number; N: number; L: number; K: number; types: Uint8Array }
  | {
      type: 'frame';
      runId: number;
      step: number;
      headStep: number;
      /** Interleaved x, y for each run (transferred, not copied). */
      driven: Float32Array;
      control: Float32Array;
      /** Circles (x, y, radius, ...) around clusters sharing the most common fingerprint (only when highlight was asked). */
      drivenRings: Float32Array | null;
      controlRings: Float32Array | null;
      /** Clusters on screen (only when structures was asked). */
      drivenStructures: FrameStructures | null;
      controlStructures: FrameStructures | null;
    }
  | { type: 'metrics'; runId: number; headStep: number; targetSteps: number; driven: MetricSample[]; control: MetricSample[] }
  | {
      type: 'branch';
      runId: number;
      branchId: number;
      /** Step of the driven run where velocities were flipped. */
      startStep: number;
      frictionless: boolean;
      totalSteps: number;
      /** Positions (interleaved x, y) recorded since the last message, in order. */
      frames: Float32Array[];
      samples: BranchSample[];
      done: boolean;
    };

/** Clusters of the frame shown: for drawing only (bonds, outlines, matching colours). */
export interface FrameStructures {
  /** Cluster index per particle, or -1 if not in a cluster (same as the metrics' clusters). */
  label: Int32Array;
  /** Per cluster: a hue (0..1) hashed from its fingerprint, so same shape = same colour. */
  hue: Float32Array;
  /** Per cluster: how many clusters on screen share its fingerprint. */
  matches: Int32Array;
}

export interface BranchSample {
  /** Steps since the flip. */
  k: number;
  /**
   * Mean particle distance from the past this branch should retrace:
   * real physics: the driven run at startStep - k; frictionless: the state at the flip.
   */
  dist: number;
  /** Cumulative entropy produced by the branch since the start (heat to bath / T). */
  S: number;
  /** Frictionless echo: 'out' before the flip, 'back' after. Real physics: always 'back'. */
  phase: 'out' | 'back';
}

/** Steps between cached frames (used for fast playback and slider drags). ~36 MB for a 60k-step run. */
export const FRAME_EVERY = 20;

/** Real-physics reverse branch: length and how often a frame / sample is recorded. */
export const REVERSE_STEPS = 3000;
export const REVERSE_FRAME_EVERY = 10;
export const REVERSE_SAMPLE_EVERY = 100;
/** Frictionless echo: steps out, then the same number back. Chaos wins beyond ~150. */
export const ECHO_STEPS = 100;
