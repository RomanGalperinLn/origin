// Chapter 4 (SIMULATED): 2D N-body planetesimal accretion around the young Sun.
// All tunable parameters for the solar system, in one place.
// Units: AU, years, solar masses; G = 4π² so a 1 AU circular orbit takes exactly 1 year.

export interface SolarParams {
  /**
   * PRNG seed for the starting disk. Seed 5 is shown: of seeds 1-6, Earth ended inside the
   * Earth zone in 3 (seeds 3, 4, 5), and seed 5 leaves the fewest bodies (23; Earth 1.39 M⊕
   * at 1.09 AU). See scripts/dev/solarTune.ts and the README.
   */
  seed: number;
  /** Number of planetesimals at the start. Default 800. */
  N: number;
  /** Inner and outer edge of the disk (AU). Default 0.4 to 4. */
  rIn: number;
  rOut: number;
  /** Total mass of the disk in Earth masses (spread as Σ(r) ∝ r^-1.5). Default 5. */
  diskMassEarth: number;
  /** Starting eccentricities and inclination-free "stirring": RMS e of the near-circular orbits. Default 0.02. */
  eRms: number;
  /** Starting layout: 'random' (the normal app) or 'rings' (CONTROLLED: circular orbits, evenly spaced, no jitter). */
  layout: 'random' | 'rings';
  /**
   * Collision radii are inflated by this factor over a rock of Earth-like density, so that
   * collisions happen within demo time. Stated in the UI. Default 200.
   */
  radiusInflation: number;
  /**
   * Body-body gravity is multiplied by this (the Sun's pull is not), so the bodies stir each
   * other onto crossing orbits within a few hundred orbits instead of ~100 million years.
   * Masses shown are the real ones. Stated in the UI. Default 200.
   */
  gravityBoost: number;
  /** Gravitational softening length (AU), well below the collision radii. Default 1e-4. */
  softening: number;
  /** Timestep (years). 0.4 AU orbits take 0.25 years, so ~25 steps per innermost orbit. Default 0.01. */
  dt: number;
  /** Steps in the whole run, spread evenly over the chapter. Default 60000 (600 years, ~600 orbits at 1 AU). */
  steps: number;
  /** Bodies closer than this to the Sun (AU) fall in; further than ejectRadius count as ejected. */
  sunRadius: number;
  ejectRadius: number;
  /** Earth is the largest surviving body with a semi-major axis in this range (AU). */
  earthZone: [number, number];
  /** Full snapshot every this many steps (seeking). Default 250 (~240 snapshots of ~50 KB). */
  snapshotEvery: number;
  /** Metric sample every this many steps. Default 50. */
  metricsEvery: number;
}

export const DEFAULT_SOLAR: SolarParams = {
  seed: 5,
  N: 800,
  rIn: 0.4,
  rOut: 4,
  diskMassEarth: 5,
  eRms: 0.02,
  layout: 'random',
  radiusInflation: 200,
  gravityBoost: 200,
  softening: 1e-4,
  dt: 0.01,
  steps: 60000,
  sunRadius: 0.05,
  ejectRadius: 30,
  earthZone: [0.8, 1.2],
  snapshotEvery: 250,
  metricsEvery: 50,
};

export function makeSolarParams(overrides: Partial<SolarParams> = {}): SolarParams {
  return { ...DEFAULT_SOLAR, ...overrides };
}

/** G in AU³ / (M_sun · yr²). */
export const G = 4 * Math.PI * Math.PI;
/** Earth mass in solar masses. */
export const EARTH_MASS = 3.003e-6;
/** Earth radius in AU. */
export const EARTH_RADIUS_AU = 4.2635e-5;

/**
 * Scripted (not simulated) parts of the chapter, in millions of years after the Sun forms.
 * Observed young stars lose their gas disks within roughly 3 to 10 million years.
 */
export const SOLAR_SCRIPT = {
  /** The Sun brightens to full over this long. */
  sunIgniteMyr: 2,
  /** The gas disk's glow fades between these times. */
  gasClearFromMyr: 3,
  gasClearToMyr: 10,
  /** The Moon-forming impact illustration fills this many Myr before the impact date (the chapter end). */
  impactLeadMyr: 9,
};
