// Chapter 2 (SIMULATED): 2D particle-mesh gravity in an expanding universe.
// All tunable parameters for the cosmic web, in one place.
// Units: comoving box side = 1; scale factor a = 1 at recombination.

export interface CosmoParams {
  /** PRNG seed for the initial ripples (the same field is drawn as the CMB in chapter 1). */
  seed: number;
  /** Grid cells per side. Particles = G^2, one per cell at the start. Default 128. */
  G: number;
  /** RMS density contrast of the ripples at a = 1 (recombination). Tuned so the first star ignites around 100-200 Myr. */
  amplitude: number;
  /** Power-spectrum slope: P(k) ∝ k^slope. -2 gives equal power per octave in 2D. Default -2. */
  slope: number;
  /** Gaussian smoothing of the ripples, in grid cells (removes grid-scale noise). Default 1. */
  smoothCells: number;
  /** Years since the Big Bang at a = 1 (recombination). Set from the timeline. */
  tStart: number;
  /** Scale factor at the end of the chapter (a ∝ t^(2/3) from recombination to ~0.8 Gyr). Set from the timeline. */
  aFinal: number;
  /** Steps across the chapter, uniform in ln a. Default 1200 (smooth playback). */
  steps: number;
  /** A cell whose density contrast exceeds this ignites a star. Default 40. */
  deltaStar: number;
  /** Cap on star sprites. Default 500. */
  maxStars: number;
  /** Cells denser than this (density contrast) belong to a clump, for the largest-clump metric. Default 20. */
  deltaClump: number;
  /** false = the "no ripples" control: a perfectly smooth start. */
  ripples: boolean;
  /** Full snapshot every this many steps (seeking). Default 50. */
  snapshotEvery: number;
  /** Metric sample every this many steps. Default 5. */
  metricsEvery: number;
}

export const DEFAULT_COSMO: CosmoParams = {
  seed: 1,
  G: 128,
  amplitude: 0.014,
  slope: -2,
  smoothCells: 1,
  tStart: 380000,
  aFinal: 160,
  steps: 1200,
  deltaStar: 40,
  maxStars: 500,
  deltaClump: 20,
  ripples: true,
  snapshotEvery: 50,
  metricsEvery: 5,
};

export function makeCosmoParams(overrides: Partial<CosmoParams> = {}): CosmoParams {
  return { ...DEFAULT_COSMO, ...overrides };
}
