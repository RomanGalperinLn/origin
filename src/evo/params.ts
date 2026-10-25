// Chapter 7 (SIMULATED): a toy model of evolution by natural selection.
// All tunable parameters in one place. Units: box side L (periodic), one step = one tick.
// The creatures are not real species; only the environment's dates are real (events.json).

export interface EvoSchedule {
  /** Great Oxidation Event: oxygen ramps from oxygenLow to oxygenMid over [start, end] (steps). */
  goe: [number, number];
  /** Neoproterozoic oxygenation: oxygen ramps from oxygenMid to 1 over [start, end]. */
  noe: [number, number];
  /** Snowball Earth: food supply drops to snowballFood over [start, end]. */
  snowball: [number, number];
  /** Cambrian explosion: more food patches (niches) and food from this step on. */
  cambrian: number;
  /** Mass extinctions: wipe out this fraction of species (whole lineages, chosen at random, seeded) at this step. */
  extinctions: { step: number; fraction: number; id: string }[];
}

export interface EvoParams {
  seed: number;
  /** Steps across the whole chapter. Default 20000. */
  steps: number;
  /** Box side (periodic). Default 160. */
  L: number;
  /** Organisms at the start (all one species: the first cells). Default 300. */
  initialPopulation: number;
  /** Hard cap on population: no births above it. Default 1500. */
  maxPopulation: number;

  // Food
  /** Food particles spawned per step (before environment changes). Default 14. */
  foodRate: number;
  /** Cap on food particles lying around. Default 2500. */
  maxFood: number;
  /** Energy in one food particle. Default 6. */
  foodEnergy: number;
  /** Food patches (sunlit shallows / vents) before and after the Cambrian. Defaults 4 and 9. */
  patches: number;
  cambrianPatches: number;
  /** Food rate multiplier after the Cambrian. Default 1.4. */
  cambrianFood: number;
  /** Food rate multiplier during Snowball Earth. Default 0.3. */
  snowballFood: number;
  /** Fraction of food spawned anywhere rather than in patches. Default 0.25. */
  uniformFood: number;

  // Oxygen (fraction of today's level)
  oxygenLow: number;
  oxygenMid: number;

  // Energy budget per step
  /** Basal cost per unit body size. */
  costBase: number;
  /** Movement cost: costMove * metabolism * body * speed^2 (bigger and faster costs more). */
  costMove: number;
  /** Sensing cost per unit of sense range. */
  costSense: number;
  /** Oxygen overhead per step: costSegment * (segments-1)^2 / oxygen. Every extra cell needs its own supply. */
  costSegment: number;
  /** Energy needed to reproduce, per unit body. The child takes half. */
  reproduceEnergy: number;
  /** Energy of a newborn's parent at the start. */
  startEnergy: number;
  /** Max age in steps. */
  maxAge: number;
  /** Energy in a unit of body: paid by the parent at birth, partly recovered by a predator. */
  bodyEnergy: number;
  /** Fraction of a prey's energy (body + reserves) a predator keeps, times its diet. Default 0.3. */
  preyEfficiency: number;
  /** A predator must be this many times bigger than its prey. Spec: 1.2. */
  predationRatio: number;
  /** Diet above which an organism can eat others. */
  predationDiet: number;
  /** Steps a predator spends digesting after a catch (limits kill rate; damps boom and bust). */
  handlingSteps: number;

  // Mutation
  /** Gaussian mutation size on continuous genes (in each gene's own scale). */
  mutation: number;
  /** Chance per birth of +-1 segment. */
  segmentMutation: number;

  // Species
  /** Species census (and possible splits) every this many steps. Default 250. */
  censusEvery: number;
  /** Two sub-groups whose mean genomes differ by more than this become separate species. */
  splitDistance: number;
  /** Each side of a split needs at least this many members. */
  minSpecies: number;
  /** Max new species per census (keeps the tree readable). */
  maxSplits: number;

  /** Full snapshot every this many steps (seeking). */
  snapshotEvery: number;
  /** Metric sample every this many steps. */
  metricsEvery: number;

  schedule: EvoSchedule;
  /** false = control run: oxygen never rises (stays oxygenLow). */
  oxygenRises: boolean;
  /** CONTROLLED mode: every organism starts identical (same genome, neat grid positions, same age). */
  identicalStart: boolean;
}

export const DEFAULT_EVO: EvoParams = {
  seed: 1,
  steps: 20000,
  L: 160,
  initialPopulation: 300,
  maxPopulation: 1500,

  foodRate: 14,
  maxFood: 2500,
  foodEnergy: 6,
  patches: 4,
  cambrianPatches: 9,
  cambrianFood: 1.4,
  snowballFood: 0.3,
  uniformFood: 0.25,

  oxygenLow: 0.03,
  oxygenMid: 0.1,

  costBase: 0.035,
  costMove: 0.04,
  costSense: 0.002,
  costSegment: 0.005,
  reproduceEnergy: 20,
  startEnergy: 10,
  maxAge: 700,
  bodyEnergy: 8,
  preyEfficiency: 0.3,
  predationRatio: 1.2,
  predationDiet: 0.3,
  handlingSteps: 30,

  mutation: 0.05,
  segmentMutation: 0.06,

  censusEvery: 250,
  splitDistance: 0.25,
  minSpecies: 12,
  maxSplits: 3,

  snapshotEvery: 200,
  metricsEvery: 10,

  // Placeholder schedule (fractions of 20000 steps); the chapter replaces it with steps
  // computed from the real dates in events.json.
  schedule: {
    goe: [940, 1340],
    noe: [3400, 4700],
    snowball: [3900, 4300],
    cambrian: 4700,
    extinctions: [
      { step: 9000, fraction: 0.9, id: 'end-permian' },
      { step: 13400, fraction: 0.75, id: 'end-cretaceous' },
    ],
  },
  oxygenRises: true,
  identicalStart: false,
};

export function makeEvoParams(overrides: Partial<EvoParams> = {}): EvoParams {
  return { ...DEFAULT_EVO, ...overrides };
}
