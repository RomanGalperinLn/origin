import type { CosmoParams } from './params';
import type { CosmoMetrics } from './pm';

export type CosmoRun = 'ripples' | 'smooth';

export type ToCosmo =
  | { type: 'init'; runId: number; params: CosmoParams }
  | { type: 'frame'; step: number; run: CosmoRun };

export type FromCosmo =
  /** The primordial ripple field (RMS 1), drawn as the CMB in chapter 1. */
  | { type: 'field'; runId: number; G: number; delta: Float32Array }
  | { type: 'metrics'; runId: number; headStep: number; steps: number; ripples: CosmoMetrics[]; smooth: CosmoMetrics[] }
  | {
      type: 'frame';
      runId: number;
      run: CosmoRun;
      step: number;
      /** Interleaved x, y in [0, 1). */
      pos: Float32Array;
      /** Per star: x, y, steps since ignition. */
      stars: Float32Array;
    };
