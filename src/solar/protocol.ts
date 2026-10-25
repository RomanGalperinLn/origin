import type { SolarParams } from './params';
import type { SolarMetrics } from './nbody';

/** Floats per body in a frame: index, x, y, vx, vy, mass (Earth masses), steps since its last merge. */
export const BODY_STRIDE = 7;

export type ToSolar = { type: 'init'; runId: number; params: SolarParams } | { type: 'frame'; step: number };

export type FromSolar =
  | {
      type: 'metrics';
      runId: number;
      headStep: number;
      steps: number;
      samples: SolarMetrics[];
      /** Index of Earth once the run is complete (-1 before). */
      earth: number;
      /** False if no body ended inside the Earth zone (Earth is then the planet closest to 1 AU). */
      earthInZone: boolean;
    }
  | { type: 'frame'; runId: number; step: number; bodies: Float32Array };
