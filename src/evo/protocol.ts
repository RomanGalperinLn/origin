import type { EvoParams } from './params';
import type { EvoMetrics, SpeciesNode } from './world';

/** 'oxygen': the real schedule. 'control': identical, except oxygen never rises. */
export type EvoRun = 'oxygen' | 'control';

export type ToEvo = { type: 'init'; runId: number; params: EvoParams } | { type: 'frame'; step: number; run: EvoRun };

export type FromEvo =
  | {
      type: 'metrics';
      runId: number;
      headStep: number;
      oxygen: EvoMetrics[];
      control: EvoMetrics[];
      /** The oxygen run's species tree at its head step (small: re-sent whole). */
      tree: SpeciesNode[];
    }
  | {
      type: 'frame';
      runId: number;
      run: EvoRun;
      step: number;
      /** Per organism: x, y, heading, size, segments, r, g, b, diet (FRAME_STRIDE floats). */
      org: Float32Array;
      /** Interleaved food x, y. */
      food: Float32Array;
    };

export const FRAME_STRIDE = 9;
