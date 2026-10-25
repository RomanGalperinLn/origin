// Chapter 3 (MODELLED): the Milky Way settling from a puffy cloud into a rotating disk
// with density-wave spiral arms. A closed-form model, not a simulation: every star's
// position is a function of time, so any moment can be drawn directly. All tunables here.
// Units: kiloparsecs (1 kpc ≈ 3,260 light-years), km/s, years.

export interface GalaxyParams {
  seed: number;
  /** Star points drawn (disk + bulge). Default 20000. */
  stars: number;
  /** Fraction of points in the central bulge (old, orange, slowly rotating). */
  bulgeFraction: number;
  /** Fraction of disk points that are gas / star-forming tracers (light up blue in the arms). */
  gasFraction: number;
  /** Disk scale length (kpc): surface density ∝ exp(-r / scale). Milky Way: about 2.5-3.5. */
  diskScale: number;
  /** Disk edge for drawing (kpc). */
  diskMax: number;
  /** Thin-disk scale height (kpc). Milky Way: about 0.3. */
  thinHeight: number;
  /** Initial puffy cloud radius scale (kpc). */
  haloScale: number;
  /** Flat rotation speed v0 (km/s) and turnover radius r0 (kpc): v(r) = v0 (1 - exp(-r / r0)). */
  v0: number;
  r0: number;
  /** Spiral pattern speed Ω_p (km/s/kpc). Milky Way estimates: about 20-30. */
  patternSpeed: number;
  /** Number of arms and pitch angle (degrees). Spec: 2 arms, about 12°. */
  arms: number;
  pitchDeg: number;
  /** Reference radius of the log spiral (kpc). */
  rRef: number;
  /** How strongly stars bunch up in the arms (0 = no arms, 1 = very strong). */
  armCrowding: number;
  /** Fraction of the gap between arms over which freshly formed stars stay blue and bright. */
  youngPhase: number;
  /** Turns the disk makes at the Sun's distance during the chapter, as drawn (the real number is about 40). */
  visualTurns: number;
  /** The Sun's distance from the centre today (kpc): about 8.2 kpc, roughly 26,000 light-years. */
  sunRadius: number;
  /** Points in the infalling satellite galaxy (Gaia-Enceladus). */
  satelliteStars: number;
}

export const DEFAULT_GALAXY: GalaxyParams = {
  seed: 1,
  stars: 20000,
  bulgeFraction: 0.15,
  gasFraction: 0.3,
  diskScale: 3,
  diskMax: 15,
  thinHeight: 0.3,
  haloScale: 9,
  v0: 230,
  r0: 1.5,
  patternSpeed: 25,
  arms: 2,
  pitchDeg: 12,
  rRef: 4,
  armCrowding: 0.72,
  youngPhase: 0.12,
  visualTurns: 3,
  sunRadius: 8.2,
  satelliteStars: 800,
};

export function makeGalaxyParams(overrides: Partial<GalaxyParams> = {}): GalaxyParams {
  return { ...DEFAULT_GALAXY, ...overrides };
}

/** 1 km/s/kpc in radians per year. */
export const KMS_PER_KPC_TO_RAD_PER_YEAR = 1.0227e-9;
