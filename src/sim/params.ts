// Every simulation parameter lives here. Units: lengths in world units
// (r_max = 1 by default), time in simulation time units (step * dt).

export interface SimParams {
  /** PRNG seed. Determines initial positions, types, interaction matrix and charges. */
  seed: number;
  /** Number of particles. Default 1500, up to ~2500. */
  N: number;
  /** Number of particle types. Default 6. */
  K: number;
  /** Side of the square periodic world. Default 25 (spec original: 40). */
  L: number;
  /** Interaction radius. Distances in the force law are measured in units of this. Default 1. */
  rMax: number;
  /** Fraction of r_max where short-range repulsion turns into the A[i][j] bump. Default 0.3. */
  beta: number;
  /** Overall force scale. Default 10. */
  kForce: number;
  /** Multiplies the random matrix A (0 = pure short-range repulsion). Default 0.3 (spec original: 1). */
  attraction: number;
  /**
   * Symmetrise A so forces are reciprocal. Default true (spec original: false).
   * With an asymmetric A the interactions themselves pump energy in, so the
   * "control" would secretly be driven too. Symmetric makes the field the only
   * energy source and the control a true equilibrium system.
   */
  symmetric: boolean;
  /** Field amplitude E0. 0 means driving is off (the control run). Default 5 (spec original: 2). */
  E0: number;
  /** Field period in time units (omega = 2*pi / period). Default 50. */
  period: number;
  /** Field direction in radians (0 = along x). Default 0. */
  fieldAngle: number;
  /** Integration timestep. Default 0.02. */
  dt: number;
  /** Friction coefficient gamma. Default 1. */
  gamma: number;
  /** Bath temperature T. Default 0.1 (spec original: 0.05). */
  /** Starting layout: 'random' (scattered, the normal app) or 'lattice' (a neat grid in bands grouped by type: CONTROLLED mode). */
  layout: 'random' | 'lattice';
  /** Steps to let the start settle (same physics and field, before step 0) into its rest state. 0 = none. CONTROLLED mode uses it. */
  settleSteps: number;
  T: number;
  /** Compute a metric sample every this many steps. Default 10. */
  metricsEvery: number;
  /** Save a full snapshot every this many steps (used for seeking). Default 200 (spec: 500; 200 keeps seeks under 1 s). */
  snapshotEvery: number;
  /** Two particles are linked into one cluster below this distance (world units). Default 0.5. */
  rLink: number;
  /** Clusters smaller than this are ignored. Default 5. */
  minClusterSize: number;
}

export const DEFAULT_PARAMS: SimParams = {
  seed: 1,
  N: 1500,
  K: 6,
  L: 25,
  rMax: 1,
  beta: 0.3,
  kForce: 10,
  attraction: 0.3,
  symmetric: true,
  E0: 5,
  period: 50,
  fieldAngle: 0,
  dt: 0.02,
  gamma: 1,
  layout: 'random',
  settleSteps: 0,
  T: 0.1,
  metricsEvery: 10,
  snapshotEvery: 200,
  rLink: 0.5,
  minClusterSize: 5,
};

export interface Preset {
  name: string;
  description: string;
  params: Partial<SimParams>;
}

// Presets are filled in from the parameter sweep (scripts/sweep.ts).
export const PRESETS: Preset[] = [
  // From the sweep (sweep_results.csv): these settings were more ordered than their
  // control in all 20 seeds. Seed 1 is used (the first seed, not the luckiest).
  {
    name: 'Demo A',
    description: 'Strong field, cold. Order beat control in 20/20 sweep seeds.',
    params: { seed: 1, E0: 8, period: 50, T: 0.02 },
  },
  {
    name: 'Demo B',
    description: 'Medium field, slow oscillation, cold. Order beat control in 20/20 sweep seeds.',
    params: { seed: 1, E0: 4, period: 100, T: 0.02 },
  },
  { name: 'Default', description: 'Symmetric interactions, dense, strong field.', params: {} },
  {
    name: 'Spec original',
    description: 'Original Particle Life settings. Driven and control look alike here.',
    params: { L: 40, attraction: 1, symmetric: false, E0: 2, T: 0.05 },
  },
];

export function makeParams(overrides: Partial<SimParams> = {}): SimParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}

/** Same parameters with the energy field switched off. */
export function controlParams(p: SimParams): SimParams {
  return { ...p, E0: 0 };
}
