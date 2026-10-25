# Origin: where does order come from?

In Dan Brown's *Origin*, Edmond Kirsch "fast-forwards" a primordial soup and claims that life emerges from
physics. This is an honest, much smaller version of that experiment. **Two copies of the same particle soup start
from identical random chaos. One is continuously driven by an oscillating energy field, the other is not.** You
drag time forwards and backwards and watch the driven one organise into a few compact structures while the
control stays a scatter of small, irregular clumps. Live charts show energy absorbed, entropy produced and order.
An AI narrator, Winston, explains what you are seeing. The idea being tested is Jeremy England's hypothesis of
*dissipation-driven adaptation*: matter that is driven by an external energy source tends, over time, to organise
into structures shaped by that drive. **It does not create life.** It shows self-organisation emerging from driven
physics, which one real and still-debated hypothesis predicts.

## Install and run

```bash
npm install
cp .env.example .env        # add GEMINI_API_KEY, ELEVENLABS_API_KEY (ELEVENLABS_VOICE_ID optional)
npm run server              # API proxy on :8787 (holds the keys)
npm run dev                 # app on http://localhost:5173
```

Other commands:

```bash
npm test                    # Vitest: determinism, seek, energy, grid, clustering, reversal, timeline, globe,
                            #   cosmic-web gravity (FFT, linear growth, no-ripples control, seek),
                            #   evolution (schedule, determinism, seek, oxygen gate vs control, extinctions),
                            #   solar-system N-body (conservation, Kepler stability, seek), galaxy model,
                            #   lineage (drawing structure, data, ≥3% per stage, slider round-trips),
                            #   chapter 6 decorations leave metrics unchanged
npm run sweep               # headless parameter search -> sweep_results.csv
npm run narration           # pre-generate chapter 7 narration audio (needs ELEVENLABS_API_KEY in .env)
npm run sweep -- --base spec --seeds 10   # same search on the original Particle Life settings
npm run build && npm run server           # production build, served by the API server on :8787
```

The app works without the server or without keys: Winston switches himself off (or goes text-only without an
ElevenLabs key) and the simulation is unaffected. There is a **Winston on** toggle for bad Wi-Fi.
`GEMINI_MODEL` (default `gemini-2.5-flash`) can be changed in `.env`.

## How the physics works

`N = 1500` particles of `K = 6` types in a periodic square box (side `L = 25`), with mass 1.

**Interactions (Particle Life).** A seeded random matrix `A[i][j] ∈ [−1, 1]` (scaled by `attraction = 0.3` and
made symmetric, see below) sets how type `i` responds to type `j`. With `r` the distance in units of
`r_max = 1` and `β = 0.3`:

```
r < β:       F = r/β − 1                                   (short-range repulsion)
β ≤ r < 1:   F = A[i][j] · (1 − |2r − 1 − β| / (1 − β))   (attraction/repulsion bump)
r ≥ 1:       F = 0
```

Positive F pulls towards the neighbour, scaled by `k_force = 10`. A spatial hash grid makes this O(N).

**Driving (the England part).** Each type has a charge `q[t] ∈ [−1, 1]`. An oscillating field along x pushes on it:

```
F_ext(t) = q[type] · E0 · sin(ω t) · x̂,     ω = 2π / period
```

The control run is identical in every respect (same seed, matrix, charges, start) except `E0 = 0`.

**Langevin step** (`dt = 0.02`, friction `γ = 1`, temperature `T`, `ξ` standard normal):

```
v ← v + dt (F_total − γ v) + sqrt(2 γ T dt) ξ
x ← x + v dt   (wrapped)
```

The field pumps energy in, friction turns it into heat, and the noise is the heat bath. Everything is
deterministic given `(seed, params)`. A seeded PRNG is used, never `Math.random()`, and there is a test for it.
Any moment can be rebuilt exactly from the nearest snapshot (every 200 steps), which is how the time slider works.

## What the metrics mean

| Chart | Definition |
| --- | --- |
| **Energy absorbed from field** | `Ẇ = Σ F_ext · v`, averaged over one field period. Zero for the control. |
| **Entropy produced** | Net heat to the bath divided by T: `Ṡ = (γ Σ v² − 2NγT) / T`, averaged over one field period. The `2NγT` term removes what the noise itself puts in, so an undriven system in equilibrium sits near 0. |
| **Order** | The particles are drawn onto a 64×64 grid (dominant type per cell, or empty), compressed with deflate: `order = 1 − compressed / raw`. Higher = more ordered. About 0.69 is fully random here. |

## Chapter 6 visuals

The two panels look down a "microscope" into a primordial ocean (`src/ui/renderer.ts`): glowing particles with short
trails (brighter when moving fast), positions interpolated between worker frames for smooth 60 FPS playback, the square
world zoomed to fill the panel (the crop is labelled). With **show structures** on (default), the worker sends each
frame's clusters (`src/sim/structures.ts`, computed on a copy of the positions): bonds between linked particles, a
smoothed outline around each cluster, coloured by its fingerprint (same colour = same composition and shape), and a
ripple with "same shape ×N" when a shape's count goes up (at most one per second per panel; "same shape", not "copy":
these are look-alike clusters, not self-replication). The driven panel shows the field as travelling light bands that
drift with the field's integral and brighten with its strength, plus a warm "vent" glow, bubbles and dust. Every 18 s
of playback both panels zoom in on their largest structure (one whose shape repeats, if any), hold 3 s and zoom out;
a **magnifier** inset and an ambient **hum** (off by default, volume follows the entropy production rate) are toggles.
All of this is drawing only: `tests/structures.test.ts` checks the metrics and state are bit-identical with the
structure computation on or off.

## Time controls

The app is one story from the Big Bang to today, in 8 chapters. Each chapter carries a badge:
**SIMULATED** (real physics or a real model runs live), **MODELLED** (a simplified model) or **RECONSTRUCTED**
(a visual driven by dated events). *Status: all 8 chapters are built; chapter 1's particle soup comes in phase 6, transitions in phase 7.*

| # | Chapter | Badge | What runs | Status |
| --- | --- | --- | --- | --- |
| 1 | The Hot Beginning | MODELLED | glowing fog cooling as T ∝ t^(-1/2), clearing to reveal the CMB | fog + CMB **done**; particle soup phase 6 |
| 2 | The Cosmic Web and First Stars | SIMULATED | 2D particle-mesh gravity in an expanding box, first stars, no-ripples control | **done** |
| 3 | A Galaxy Takes Shape | MODELLED | closed-form model of 20,000 stars: a puffy cloud settles into a disk, differential rotation, two-armed density-wave spiral, Gaia-Enceladus falls in, zoom to the Sun's neighbourhood | **done** |
| 4 | Birth of the Solar System | SIMULATED | 2D N-body accretion: 800 planetesimals merge into a few planets; Earth tagged; Moon-forming impact as a RECONSTRUCTED inset | **done** |
| 5 | Young Earth | RECONSTRUCTED | 3D globe: lava, first oceans, hazy sky, bombardment | **done** |
| 6 | The Origin of Life | SIMULATED | driven particle simulation vs control | **done** |
| 7 | Evolution: from cells to humans | RECONSTRUCTED + SIMULATED | 7a: toy selection model (oxygen-gated multicellularity, no-oxygen control); 7b: our lineage morphing through 24 sourced key stages, family-tree mini-map of living cousins, fossil brain-size chart | **done** |
| 8 | Humans | RECONSTRUCTED | globe with city lights, milestones, world population chart | **done** |

**The cosmic web** (`src/cosmo/`, chapters 1–2) is real gravity, in 2D. 16,384 particles start on a lattice,
displaced (Zel'dovich approximation) by a Gaussian random field with P(k) ∝ k⁻². Chapter 1 draws that same field as
the CMB. Each step deposits mass on a 128×128 grid (cloud-in-cell), solves Poisson's equation with an FFT, and moves
particles with a kick-drift-kick leapfrog in ln a, in an Einstein-de Sitter universe (a ∝ t^(2/3)):

```
dx/d(ln a) = a v,    dv/d(ln a) = -(3/2) v - (3 / 2a) ∇ψ,    ∇²ψ = δ
```

The -(3/2) v term is Hubble drag: expansion slows everything, which is why structure grows slowly. Linear theory
(ripples growing ∝ a) is an exact solution of these equations, and a test checks the code reproduces it within 10%.
Stars ignite in grid cells denser than δ = 40. The ripple amplitude (0.014 RMS at recombination) was **tuned** so the
first star ignites at about 134 million years, inside the 100–200 Myr estimate. The **no ripples** control starts as a
perfect lattice: nothing ever moves (a test checks this to 10⁻¹²). Limitations: 2D gravity is not 3D gravity, the
box has no physical size attached, and the star threshold is a rule of thumb, so the picture is qualitative.

**The galaxy** (`src/galaxy/`, chapter 3) is a model, not a simulation: every star's position is a formula of time,
so any moment is drawn directly. 20,000 points (bulge, old disk stars, gas) start in a puffy round cloud and settle into
a thin disk (scale length 3 kpc, height 0.3 kpc) by the end of the thin disk's date range. They rotate on a flat
rotation curve, v(r) = v0 (1 − e^(−r/r0)) with v0 = 230 km/s, so inner stars lap outer ones (one turn at the Sun's
distance takes about 220 million years). The spiral arms are a density wave: a two-armed logarithmic spiral (12°
pitch) turning rigidly at 25 km/s/kpc; stars bunch up as they pass through it, and gas points light up blue just after
crossing an arm and fade as they move on. A smaller galaxy (Gaia-Enceladus) spirals in and is torn into the halo. The
rotation is drawn about 13× slower than real (the disk really turned about 40 times at the Sun's distance in this
chapter). The chapter ends zoomed in on the Sun's distance from the centre today (8.2 kpc, about 27,000 light-years).
Dates of the merger and of the thin disk come from `events.json`; the thin disk's age is debated.

**The solar system** (`src/solar/`, chapter 4) is real gravity and real collisions, in 2D. 800 planetesimals (5 Earth
masses in total, Σ ∝ r^-1.5, 0.4–4 AU) orbit the Sun (G = 4π², AU, years) and attract each other pairwise; a
kick-drift-kick leapfrog moves them, and bodies that touch merge, conserving mass and momentum. 600 simulated years
are spread over the chapter's 70 million years. To fit roughly 100 million years of collisions into that, collision
radii are 200× real and body–body gravity is 200× real (the Sun's pull and the masses shown are real). At the end,
Earth is the largest body between 0.8 and 1.2 AU. The gas glow and the Sun's ignition are scripted, and the
Moon-forming impact is an illustration in a magnified inset. The run is deterministic and bit-identical across
JavaScript engines: the disk is built without `Math.sin`, `Math.cos` or `Math.log`, which can differ in the last bit.
Tune it with `npx tsx scripts/dev/solarTune.ts seed=5`.

**Our lineage** (`src/lineage/`, chapter 7b) shows one creature morphing through 24 key stages, from the first cells
(3.5 billion years ago) to Homo sapiens (300,000 years ago). Dates, ranges, one-line facts, living cousins and their
divergence times are in `src/data/lineage.json`, fossil brain sizes in `src/data/brainSize.json`, and every value's
source in `src/data/sources.md` (verified with web searches; disagreements are stored as ranges). Each drawing is one
parameter set of a simple creature model (`src/lineage/creature.ts`: spine, body widths, head shape, two limbs, tail,
eye), so all 24 have the same six parts with the same point counts (`public/lineage/NN-id.svg`, regenerated by
`npx tsx scripts/genLineageSvgs.ts`, grid at `/lineage-grid.html` in dev). The morph blends the parameters, so limbs
grow and swing rather than melt; missing parts are tiny and tucked inside the body. Chapter 7's slider stretch uses
knots (`src/lineage/timeline.ts`): the first 15% is 7a, then every stage gets at least 3% of the chapter and the last
eight (from the split with chimpanzees) about a third; time is logarithmic between knots. The key frames come from
the fossil record and real groups; the in-between frames are illustrations, and the screen says so.

**Chapter 7 narration** (`src/data/narration/evolution.json`) is 19 short lines in our own words, one per milestone,
plus the two theme lines (disordered chemistry at the start, "the most complex structure we know" at the end). Every
date and number in them is a template filled from the data files (`{when:afarensis}` → "about 3.2 million years ago"),
so nothing is typed by hand; a test checks there are no bare digits, that monkeys and apes are always "cousins" with
"shared ancestors", never ancestors. Lines show as subtitles when the slider passes their stage moving forward; the
newest line wins so the text keeps pace with the picture (the chapter plays in about 70 s). Audio is pre-generated, never
live: put `ELEVENLABS_API_KEY` in `.env` and run `npm run narration` (same voice and model as the server) to write
`public/narration/evolution/*.mp3` and a manifest; the chapter then plays each clip with its subtitle when Winston is
**on**.

**Evolution** (`src/evo/`, chapter 7) is a toy model of natural selection, not a model of real species. Up to 1,500
organisms live in a periodic 2D sea. Each has a genome: size, speed, sense range, metabolism, colour (neutral, so it
drifts and marks lineages), body segments and diet. Each step they steer toward the nearest food (or, if their diet
allows, a smaller and slower organism), eat, and pay for living: a basal cost, movement ∝ metabolism × body × speed²,
sensing, and an oxygen overhead ∝ (segments − 1)² / oxygen. Above an energy threshold they pay for a child's body and
split the rest with a mutated copy. Extra segments make a bigger, faster body that keeps more of what it eats, so
whether they pay off depends on oxygen. The environment follows `events.json` (`src/evo/schedule.ts`): oxygen ramps
up over the Great Oxidation Event (to 10% of today) and the Neoproterozoic Oxygenation (to 100%), Snowball Earth cuts
the food supply to 30%, the Cambrian opens more food patches, and the end-Permian and end-Cretaceous extinctions
wipe out 90% and 75% of species (whole lineages chosen at random; the fractions are in `events.json`; survivors keep
at least 10% of the organisms). Every 250 steps a census splits a species in two when its members have
drifted into two distinct groups (deterministic 2-means on the genome), which builds the live tree of life. A
**control** run is identical except that oxygen never rises.

Measured (5 seeds, `npx tsx scripts/dev/evoTune.ts`, in Node): mean segments stay at 1.01–1.04 until the
Neoproterozoic oxygen rise, reach about 1.1–2.0 by 340 million years ago and about 2.0–2.7 around the end-Cretaceous,
and end at 2.0–3.2 (one seed runs on to 6.7 in a late predator arms race); the control stays at 1.00. Population never
falls below about 95 (low points follow the mass extinctions). Predators (diet ≥ 0.3) can evolve but are rare. The
model's steps are spread evenly along the logarithmic slider, so it gets far more steps per million years near the
present (one step is about 1.6 million years at the start and about 140 years at the end): the shape of its curves
over time is not to scale. These costs, the oxygen levels and the
mutation rates were **tuned** for this outcome; earlier versions let 8-segment predators run away with the world or
created energy from nothing (both fixed). The honest claim is narrow: in this model, the complexity gain needs the
oxygen rise. It does not show that real evolution worked this way.

**The globe** (`src/globe/`) is one Three.js renderer shared by chapters 5, 7 and 8. A custom shader draws seeded
procedural continents and takes lava, ocean, land, ice, plants, city lights, haze, clouds, impacts and sky colour as
inputs. `src/globe/keyframes.ts` sets those inputs from a keyframe table whose every date comes from
`events.json`. It is a visualisation of dates, not a climate or geology model: the continents' slow re-shaping is a
visual stand-in for drift, and the exact land fraction or ice extent at a given time is illustrative.

**Population data** (`src/data/population.json`): rounded figures from Our World in Data (HYDE 3.2, UN World
Population Prospects 2024), plus the UN's billion milestones (1927, 1960, 1974, 1987, 1999, 2011, 2022). Ancient
values are uncertain by up to a factor of two.

- **Deep link:** `http://localhost:5173/#ago=4.4e9` opens the story 4.4 billion years ago.
- **Master slider:** one coloured band per chapter, so each chapter has a fixed share of the slider; inside a
  chapter time runs linearly or logarithmically. Click a band name to jump to that chapter. Ticks mark the dated
  events from `src/data/events.json`; hover a tick for its date and Cosmic Calendar time.
- **◀◀ Start / ▶ Play (space bar) / Today ▶▶**, speed **slow / normal / fast**, and **← →** to nudge (Shift for bigger steps).
  Each chapter plays at its own pace.
- **Readouts:** years ago, age of the universe, and Carl Sagan's **Cosmic Calendar** (all of history squeezed into one
  year: the Sun forms in early September, the dinosaurs die on 30 December, writing appears at 23:59:48 on 31 December).
- **Chapter 6** maps its time span (about 4.1 to 3.5 billion years ago) linearly onto the simulation's 60,000 steps.
  The run is precomputed in a Web Worker from page load. Playback and dragging use frames cached every 20 steps, and
  pausing rebuilds the exact state from a snapshot (< 1 s). Its toolbar has the **preset** (Demo A by default),
  **log scale** for the charts, **show structures** (bonds and outlines, same colour = same shape), **magnifier**,
  **♪ hum** (off by default) and **⟲ Reverse time**.
- **Reverse time** flips every velocity of the driven run and runs it 3,000 more steps. With friction and the
  heat bath the particles do not go back: distance from the past keeps growing and entropy keeps rising, while a
  true reversal would need it to fall. **Frictionless mode** (no friction, noise or field) runs 100 steps, flips
  with the exact time-reversal of the integrator, runs 100 steps back, and returns to within about 10⁻⁹ of the
  start. Beyond about 150 steps, chaos amplifies rounding errors and even the frictionless retrace fails.
  That is Loschmidt's paradox in miniature.

## Honest limitations and what we changed from the original plan

- **Parameter search, reported in full.** `npm run sweep` ran 1,200 driven runs (20 seeds × field strength
  E0 ∈ {0.5, 1, 2, 4, 8} × period ∈ {20, 50, 100} × T ∈ {0.02, 0.05, 0.1, 0.3}), each compared with an identical
  control, at N = 800 for 30,000 steps (metrics averaged over the last 20%). Results are in `sweep_results.csv`:
  - **Driven was more ordered than control in 93.3% of runs.** The effect grows with field strength (82% of runs
    at E0 = 0.5, 97 to 98% at E0 ≥ 2) and is strongest when cold (100% at T = 0.02). For the best settings it held
    in all 20 seeds.
  - **Repeated structures went the other way:** driven had more copies in only 23% of runs. The spec's combined
    score (`copies diff + 10 × order diff`) is dominated by that term, so driven "wins" on it in only 29.9% of runs.
  - The presets **Demo A** (E0 = 8, period 50, T = 0.02) and **Demo B** (E0 = 4, period 100, T = 0.02) are settings
    that won on order in 20/20 seeds. They use seed 1, the first seed, not the best one.
  - **Same search on the original Particle Life settings** (`sweep_results_spec.csv`, 600 runs): driven was more
    ordered in **48.8%** of runs, a coin flip. Its top-10 list still contains impressive-looking cases, which is
    exactly why we report the fraction, not just the best run.

- **2D toy model.** "Copies" are clusters with matching coarse composition and shape, not self-replication in any
  biological sense.
- **England's hypothesis is debated.** This demo is consistent with "driven matter organises", but it does not
  test the stronger claims (that the structures are selected *because* they dissipate well).
- **The original Particle Life settings showed no effect.** With an asymmetric matrix, `L = 40`, `T = 0.05` and
  `E0 = 2`, driven and control were indistinguishable (see the sweep numbers above). Two reasons: those particles
  clump within a few thousand steps with or without a field, and **an asymmetric interaction matrix already pumps
  energy in by itself** (non-reciprocal forces do work), so the "control" was secretly driven too.
- **What we changed:** (1) a **symmetric** matrix, so the control is a true equilibrium system and the field is
  the only energy source; (2) weaker attraction (`× 0.3`) and a denser box (`L = 25`), so the undriven system stays
  a fluid of small clumps; (3) state stored in Float64 (needed for exact time reversal); (4) snapshots every 200
  steps instead of 500 (faster seeking); (5) a coarser composition term in the fingerprint (exact type counts
  never matched for clusters over about 10 particles).
- **The control is not frozen.** It slowly coarsens as it relaxes toward equilibrium. The honest claim is that
  driving makes the system organise *faster and further* over the run, not that the control never changes.
- **Cosmic web (chapters 1–2) is tuned and 2D.** The ripple amplitude was chosen so the first star ignites
  within the 100–200 million year estimate (this run: about 135 million years). The fog in chapter 1 is drawn
  clearing from about 57,000 years so it is visible on the log clock; in reality it clears between about 250,000
  and 380,000 years. The CMB map is coloured by seed density (denser = colder, the Sachs-Wolfe sign), not by the
  gravitational potential, and is not the Planck map. "Largest clump" counts connected cells denser than 20× the
  mean.
- **The galaxy (chapter 3) is a picture from equations.** No gravity is computed: settling, rotation and arms are
  prescribed. The real Milky Way also has a central bar, minor arms and spurs (the Sun sits in a spur, between major
  arms), and the Sun may have formed closer in and migrated out; the marker shows where it is today.
- **Solar system (chapter 4) is 2D, compressed and selected.** Radii and mutual gravity are both 200× real; without
  them the bodies stall at dozens of Moon-to-Mars-sized embryos within demo time. Seed 5 is shown: of seeds 1–6, Earth
  ended between 0.8 and 1.2 AU in 3. In this run Earth ends up at 1.39 Earth masses and the Mars analogue at 0.54,
  five times the real Mars (0.107). A too-big Mars is a known problem in real planet-formation simulations too ("the
  small-Mars problem"). Further out, bodies are still colliding at the end; in reality Jupiter, which we do not
  simulate, stopped a planet forming there and left the asteroid belt. Three small bodies (1.25% of the mass) are
  flung out during the run, shown as "flung out". Earth's orbit ends fairly eccentric (up to
  about 0.2, versus 0.017 today) because the boosted gravity stirs orbits.
- **Our lineage (chapter 7b) is reconstructed.** Key stages are real groups or fossils, but the drawings are simple
  schematics and the frames between them are illustrations, not real animals. Molecular-clock split dates often
  predate the matching fossils, so some cousins branch off a stage earlier than one might expect (see `sources.md`).
  Dates of early stages carry large uncertainties; ranges are stored and the screen says "about".
- **Evolution (chapter 7) is a toy, and tuned.** See the Evolution paragraph above: its costs, oxygen levels and
  mutation rates were tuned so that the oxygen gate shows clearly. Its numbers were measured in Node; the browser's
  `Math.log`/`sin`/`cos` can differ in the last bit, so the browser's run is a different (equally valid) sample with
  the same qualitative outcome.
- **Repeated structures favour the control, so that chart was dropped.** The driven run condenses into a few
  large clusters (about 4 of 300 particles in Demo A), so there is little to repeat; the control's dozens of medium
  clumps produce chance look-alikes. We tried a stricter definition (clusters of at least 12 or 15 particles, with
  the shape fingerprint) and re-ran the full sweep (`sweep_results_strict.csv`): driven had more strict copies in
  only 29.0% (≥ 12) and 31.3% (≥ 15) of 1,200 runs, the combined score (copies diff + 10 × order diff) favoured driven
  in 36.0%, and no setting won both order and strict copies in more than 12 of 20 seeds (with fewer copies than
  control on average even there). Rather than pick a lucky seed, the app no longer shows a repeated-structures chart;
  the story rests on order, where driven wins 93.3% of runs (20/20 seeds for Demo A). `scripts/dev/copiesDiag.ts`
  prints the cluster sizes behind these numbers.

## Demo script (about 3 minutes)

*For the current build (see the status table above for what is built). The
full 13.8-billion-year script comes with phase 8. Optional opener: start at the Big Bang and press Play to watch
the fog clear into the CMB and gravity grow it into the cosmic web (chapters 1–2, about a minute).*

1. "Where do we come from?" The slider is at the Big Bang. Drag it slowly to the right and point at the readouts
   and the Cosmic Calendar: "the Sun forms in early September; all of recorded history is the last 12 seconds."
2. Click **Origin of life** on the slider. Press **Play**. The driven side condenses into a few compact
   structures while the control stays a scatter of small clumps. Winston narrates.
3. Point at the charts: energy absorbed and entropy produced (driven only, since the control has no energy
   source), and order (driven clearly above grey).
4. Drag back and forth inside the chapter: "this is time in our hands."
5. Press **⟲ Reverse time**. The system does not go back to chaos and entropy keeps rising. Tick **frictionless
   mode** to show that without a heat bath it *does* retrace, for a short while. Winston explains the arrow of time.
6. Ask Winston a question (🎤 or the text box).
7. Close: "This doesn't create life. It shows that driven physics favours organisation over time, which is
   exactly what one real hypothesis says."

## Project layout

```
server/index.ts           Express proxy: /api/narrate, /api/ask, /api/tts, /api/health
src/data/events.json      the facts table: single source of truth for every date
src/time/cosmic.ts        years ago, age of universe, Cosmic Calendar, events
src/time/chapters.ts      the 8 chapters, their badges, and the piecewise slider mapping
src/chapters/             Chapter interface; hotBeginning (1), cosmicWeb (2), galaxy (3), solarSystem (4), globeChapter (5, 8), originOfLife (6),
                          evolution (7, on top of globeChapter), engines that talk to the workers, placeholders
src/cosmo/                FFT, ripple field, particle-mesh gravity, its worker
src/evo/                  evolution toy model, its schedule from events.json, its worker
src/lineage/              creature model, the 24 key-frame drawings, chapter 7's stage layout and time knots
src/solar/                planetesimal N-body with merging, its worker and renderer
src/galaxy/               closed-form galaxy model (settling, rotation curve, density-wave arms, merger)
src/globe/                Three.js globe, shaders, keyframes, population data
src/sim/                  shared simulation module (browser worker, sweep and tests all import it)
  params.ts               every parameter + presets
  rng.ts                  mulberry32 + Box-Muller
  state.ts                SimState create/clone
  physics.ts              force law, spatial grid, Langevin step, velocity reversal
  metrics.ts              work, heat, entropy, clusters, fingerprints, compression order
  timeline.ts             snapshots + exact seek
src/worker/simWorker.ts   runs driven + control in lockstep, frame cache, reverse branch
src/ui/                   main, masterSlider, renderers (particles, cosmic web, evolution, tree of life), charts (uPlot), reverse overlay, winston
scripts/sweep.ts          headless parameter search (worker_threads)
scripts/dev/              dev helpers: headless browser check, seek timing, snapshot PNGs, preset check, mock Gemini/ElevenLabs
tests/                    Vitest
```

Testing Winston without keys: run `npx tsx scripts/dev/mockUpstream.ts` and start the server with
`GEMINI_API_KEY=x ELEVENLABS_API_KEY=x GEMINI_BASE_URL=http://localhost:9999 ELEVENLABS_BASE_URL=http://localhost:9999 npm run server`.
