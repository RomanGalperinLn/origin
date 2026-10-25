# Origin: system description

*13.8 billion years, from particles to people. Where does order come from?*

This document describes the whole system: what it shows, how each part works, the numbers it produces, how
it was checked, and where its limits are. The README covers day-to-day use; this file is the detailed reference.

---

## 1. The idea

In Dan Brown's novel *Origin*, Edmond Kirsch "fast-forwards" a primordial soup on a computer and claims that
life emerges from physics. This project is an honest, much smaller version of that experiment, set inside the
whole story of the universe. One master timeline runs from the Big Bang to today in eight chapters. Where
physics can be simulated, it is simulated live; where nobody can simulate it, the app shows the science
honestly and says so.

The theme of the show is one claim, tested in every chapter with a single switch:

> **Structure needs both randomness and a flow of energy.**
> When we control everything (no randomness, everything placed neatly by us), nothing evolves. When we
> release control and let chaos in, the same physics builds everything.

The app never claims to create life. Its strongest claim is the narrow one its own measurements support.

---

## 2. What the audience sees

### 2.1 The opening screen

A full-screen title card: **ORIGIN**, the question *"Where do we come from? Where are we going?"*, a large
two-position switch **CONTROLLED | RELEASED** (CONTROLLED by default, so the first run on stage shows nothing
evolving) and a **Begin** button that starts the timeline from the Big Bang. Switching to RELEASED for the first
time shows the line *"Now we let go."*

### 2.2 The main screen

- **Top bar:** years ago (for example "450 million years ago"), the age of the universe, the chapter title with
  its honesty badge, live counters for the chapter (stars formed, planets, species...), the **Cosmic Calendar**
  (the whole history squeezed into one year: the Big Bang is 1 January 00:00, today is midnight on
  31 December), the CONTROLLED/RELEASED pill and an About button.
- **Main view:** the chapter's visual (simulation, model or reconstruction).
- **Master timeline:** one slider for all 13.8 billion years, with a coloured band per chapter and a tick per
  dated event. Play, pause (space), speed (slow / normal / fast), drag, arrow keys, Start, Today.
- **Bottom row:** the chapter's live charts, and the Winston narrator panel.
- **Corner label:** "CONTROLLED — no randomness" or "RELEASED — chaos allowed". CONTROLLED mode tints the whole
  interface slightly cold and grey.

### 2.3 Honesty badges

Every chapter carries one badge, always visible:

| Badge | Meaning |
| --- | --- |
| **SIMULATED** | A real physics or biology model runs live; what you see is computed. |
| **MODELLED** | A simplified model built from equations (no step-by-step simulation). |
| **RECONSTRUCTED** | A visual driven by dated scientific events; not computed. |
| **ILLUSTRATION** | Artistic in-between frames or a "what the model shows" card. |
| **CONTROLLED · nothing formed** | A card shown in CONTROLLED mode where nothing formed for the chapter to build on. |

### 2.4 The eight chapters on the timeline

| # | Chapter | Badge | Span | Slider share | Playback (normal speed) |
| --- | --- | --- | --- | --- | --- |
| 1 | The Hot Beginning | MODELLED | Big Bang → 380,000 years | 8% | 25 s |
| 2 | The Cosmic Web and First Stars | SIMULATED | 380,000 years → 13 billion years ago | 14% | 35 s |
| 3 | A Galaxy Takes Shape | MODELLED | 13 → 4.57 billion years ago | 10% | 25 s |
| 4 | Birth of the Solar System | SIMULATED | 4.57 → 4.5 billion years ago | 12% | 30 s |
| 5 | Young Earth | RECONSTRUCTED | 4.5 → about 4.1 billion years ago | 8% | 20 s |
| 6 | The Origin of Life | SIMULATED | about 4.1 → 3.5 billion years ago | 16% | 60 s |
| 7 | Evolution: from cells to humans | RECONSTRUCTED + SIMULATED toy model | 3.5 billion → 300,000 years ago | 20% | 70 s |
| 8 | Humans | RECONSTRUCTED | 300,000 years ago → today | 12% | 30 s |

A full play-through at normal speed takes about 5 minutes (295 s measured), plus any wait for background
computation. Inside each chapter, time maps to the slider linearly, logarithmically, or (chapter 7) through
knots placed at the lineage stages, so that short but important stretches (the hominins, the first seconds)
are not squeezed to nothing.

---

## 3. The CONTROLLED / RELEASED switch

### 3.1 The rule

CONTROLLED does not mean "a different universe". It means one thing everywhere: **randomness is removed and
everything starts from a neat layout we designed.** Same physics, same code, same seeds. RELEASED is the normal
app: random starting conditions, noise, ripples, mutations.

All controlled settings live in one table in `src/control/controlMode.ts`. Each chapter asks
`paramsFor(chapter, mode, normalParams)` for its parameters and reads the switch no other way. Each mode has its
own chapter instances and background runs (built at page load), so flipping is instant and deterministic.

### 3.2 Using it

- The opening switch, the top-bar pill, or the **C** key.
- Flipping restarts the current chapter from its start in the other mode, with a 1-second crossfade, and the
  narrator's line changes to the new mode's line.

### 3.3 What CONTROLLED does in each chapter

| Chapter | CONTROLLED setting | What the model then does | The "why" shown on screen |
| --- | --- | --- | --- |
| 1 | No density ripples | The first light is one perfectly uniform glow | Every structure grows from tiny differences in density; here there are none, so later there is nothing for gravity to build on. |
| 2 | Particles on a perfect grid, zero displacement | Nothing clumps; 0 stars; structure stays at 0 for the whole chapter | Every parcel is pulled equally from every side, so the pulls cancel: nothing gathers, no gas becomes dense enough to light a star. |
| 3 | (card) | No galaxy; an even, empty haze | Nothing clumped in the cosmic web, so there is no clump to become a galaxy. |
| 4 | (card) | No Sun, no planets | No stars formed, so there is no Sun and no Solar System. |
| 5 | (card) | No Earth | No Solar System formed, so there is no young Earth. |
| 6 | Neat lattice grouped by type, already settled into its rest state; temperature 0 (no noise); energy source **on** | Vibrates in place; nothing new forms; the order line stays flat | Every particle starts in a neat, settled place with no thermal noise, so nothing is nudged into trying a new arrangement; the energy can only shake the crystal back and forth. |
| 7 | Mutation rate 0; all organisms identical (same genome, grid positions, same age) | One species, single cells, forever; the lineage stays on the first cell under an ILLUSTRATION card | Selection needs differences to choose between; identical creatures that never mutate give it nothing to choose. |
| 8 | (card) | No humans | With no stars, no planet and no variation, nothing could ever lead to people. |

### 3.4 Measured results (full runs, Big Bang to today, both modes)

| Chapter | Counter | CONTROLLED | RELEASED |
| --- | --- | --- | --- |
| 2 | stars formed | **0** | **279** |
| 3 | galaxies formed | **0** | **1** |
| 4 | planetesimals merged / planets | **0** | **774** merges |
| 6 | growth of the largest structure | **+0 particles** | **+353 particles** |
| 7 | new species · mean body segments | **0 · 1.00** | **36 · 2.02** |
| 8 | people | **0** | (the population chart) |

### 3.5 Where reality differed from the plan, and what was decided

Every controlled result comes from running the chapter's real model. Two chapters did not behave as first
expected, and both were reported before any narration was written:

- **Chapter 6.** A neat lattice of mutually attracting particles is *not* at rest: even with no noise and the
  field off, it snaps into a rigid crystal (plus clumps where the type bands meet) within about 1,000 steps,
  then stops. Decision: the designed start is that lattice already settled into its rest state under the same
  conditions (30,000 settling steps before step 0, same physics, same field, no noise). From step 0 it only
  vibrates in place: over a further 40,000 steps its 18 clusters (largest 133 particles) never change, and the
  particles move about an eighth of their spacing. This costs about 60–80 seconds of background preparation
  after page load.
- **Chapter 4.** A neat disk (800 bodies on evenly spaced circular orbits, no eccentricity, no jitter) still
  collided into planets: 197 collisions in the first 10 years, 35 bodies and a 1.5 Earth-mass planet by the end,
  because its orbits are packed tightly and the bodies pull on each other (200× boosted). Decision: CONTROLLED
  chapter 4 follows the story's own logic (no stars in chapter 2, so no Sun) and shows a card. The About panel
  says so honestly.

### 3.6 The honesty line (About panel)

> CONTROLLED mode removes randomness and starts from a neat, designed layout. It shows that in our models,
> structure needs both randomness and a flow of energy. It is a thought experiment, not a claim about what a
> real universe could be.

---

## 4. The chapters in detail

### Chapter 1: The Hot Beginning (MODELLED)

- **What it shows:** an opaque, glowing fog whose colour follows the textbook temperature, cooling until
  electrons settle onto nuclei and the fog clears, revealing the first light: the cosmic microwave background.
- **Model:** radiation era, T ∝ t^(-1/2): `T = 3000 K × sqrt(t_recombination / t)`. Before about 3 × 10⁻¹⁵ years
  the readout says "> 3 × 10¹³ K (beyond tested physics)" instead of inventing a number.
- **The CMB map** is the same random ripple field that chapter 2's gravity grows into the cosmic web, coloured by
  seed density with the Sachs-Wolfe sign (denser spots look slightly colder, blue). It is not the Planck map, and
  the real CMB is smoother on these scales; the screen says so.
- **Disclosed stretch:** the fog is drawn clearing from about 57,000 years so the audience can see it on a
  logarithmic clock; in reality it clears between about 250,000 and 380,000 years.
- **Chart:** temperature of the universe (K) against time, log-log, powers-of-ten labels.

### Chapter 2: The Cosmic Web and First Stars (SIMULATED)

- **What it shows:** gravity turns the first light's tiny ripples into filaments and knots in an expanding
  universe; the first stars ignite in the densest knots. A "no ripples" control (a perfect grid) shows that
  without ripples nothing forms.
- **Model:** a 2D particle-mesh N-body simulation. 128 × 128 = 16,384 particles start on a lattice, displaced by a
  Gaussian random field with power spectrum P(k) ∝ k⁻² (Zel'dovich approximation). Each step deposits mass on a
  128 × 128 grid (cloud-in-cell), solves Poisson's equation with an FFT, and moves particles with a kick-drift-kick
  leapfrog in ln a, in an Einstein-de Sitter universe (a ∝ t^(2/3)):
  `dx/d(ln a) = a·v`, `dv/d(ln a) = −1.5·v − (1.5/a)·∇ψ`, `∇²ψ = δ`. The half-kicks are integrated exactly for the
  Hubble drag. 1,200 steps cover the chapter.
- **Stars:** a grid cell denser than 40× the mean ignites a star on a particle there (at most 6 per step).
  **Largest clump:** connected cells denser than 20× the mean (8-connectivity), so single cells on thin filaments
  do not merge and split separate knots.
- **Tuning (disclosed):** the ripple amplitude (0.014 RMS at recombination) was chosen so the first star ignites
  within the 100–200 million-year estimate. In this run: about 135–139 million years.
- **Checks:** linear growth ∝ a within 10%; the no-ripples control stays still to 10⁻¹²; FFT matches a direct DFT;
  deterministic seeking.
- **Charts:** structure σ²(δ), stars, largest clump (% of mass), with the control in grey.
- **Limits:** 2D gravity is not 3D gravity, and the box has no physical size, so the picture is qualitative.

### Chapter 3: A Galaxy Takes Shape (MODELLED)

- **What it shows:** a puffy cloud of 20,000 stars settles into a thin rotating disk with two spiral arms; a
  smaller galaxy (Gaia-Enceladus) falls in and is torn apart; the chapter ends zoomed in on where the Sun will form.
- **Model (equations, not gravity):** each star's position is a formula of time, so any moment is drawn directly.
  - Settling: from a round cloud to a thin disk (scale length 3 kpc, height 0.3 kpc) by the end of the thin disk's
    date range (10 to 8 billion years ago, debated; a 2024 Gaia study suggests it may be older).
  - Rotation: flat rotation curve `v(r) = 230 km/s × (1 − e^(−r / 1.5 kpc))`, so inner stars lap outer ones; one
    turn at the Sun's distance takes about 220 million years.
  - Spiral arms: a density wave, a two-armed logarithmic spiral (12° pitch) turning rigidly at 25 km/s/kpc. Stars
    bunch up as they pass through it (a "traffic jam"), and gas lights up as young blue stars just after crossing
    an arm.
  - Rotation is drawn about 13× slower than real (the disk really turned about 40 times at the Sun's distance
    during this chapter); the screen says so.
  - The Sun's mark sits at 8.2 kpc (about 27,000 light-years), where it is today; it may have formed closer in.
- **Charts:** disk thickness, young star-forming regions, spiral-arm strength.
- **Limits:** the real Milky Way also has a central bar and minor arms; the Sun sits in a spur between major arms.

### Chapter 4: Birth of the Solar System (SIMULATED)

- **What it shows:** 800 rocky planetesimals orbit the young Sun, collide and merge until a few planets remain;
  Earth is identified; the Moon-forming impact is shown as a magnified RECONSTRUCTED inset (Theia, a flash, a
  debris ring that gathers into the Moon).
- **Model:** real 2D gravity and collisions. 800 bodies (5 Earth masses in total, surface density Σ ∝ r^(-1.5),
  0.4–4 AU) orbit the Sun (units: AU, years, G = 4π²) and attract each other pairwise; kick-drift-kick leapfrog
  (dt = 0.01 yr); bodies that touch merge, conserving mass and momentum. 60,000 steps (600 simulated years) are
  spread over the chapter's 70 million years.
- **Disclosed compression:** collision radii and body-to-body gravity are both 200× real (the Sun's pull and the
  masses shown are real); without this, the bodies stall at dozens of Moon-to-Mars-sized embryos within demo
  time. The gas glow and the Sun's ignition are scripted.
- **Result (seed 5):** 800 → 23 bodies, 774 collisions, Earth 1.39 Earth masses at 1.09 AU, three small bodies
  flung out. Of seeds 1–6, Earth ended in the 0.8–1.2 AU zone in 3 (seed 5 is shown). The Mars analogue is too
  big (0.54 vs 0.107 Earth masses), a known problem in real simulations too ("the small-Mars problem").
- **Determinism across engines:** the disk is built without `Math.sin`, `Math.cos` or `Math.log` (which can differ
  in the last bit between JavaScript engines), so Node and Chrome produce bit-identical runs.
- **Charts:** bodies, largest body (Earth masses), collisions.

### Chapter 5: Young Earth (RECONSTRUCTED)

- **What it shows:** a 3D globe (Three.js, custom shader) going from a molten world through the Moon-forming
  impact, the first oceans and continents under a hazy orange sky, and the late heavy bombardment.
- **How:** a keyframe table whose every date comes from `events.json` sets the shader's inputs (lava, ocean, land,
  ice, plants, city lights, haze, clouds, impacts, sky colour). Bars under the chart show the same surface state
  as numbers. It is a visualisation of dates, not a climate or geology model.
- **Captions** show a milestone only while it is recent (the first 60% of the stretch to the next one), so an old
  milestone is never presented as current news.

### Chapter 6: The Origin of Life (SIMULATED)

- **What it shows:** two copies of the same particle soup, side by side. **DRIVEN:** an oscillating energy field
  pumps energy in (a stand-in for energy sources such as hydrothermal vents). **CONTROL:** identical, field off.
  The driven soup organises into a few compact structures; the control stays a scatter of small clumps.
- **Model:** a 2D "Particle Life" soup with physics: 1,500 particles of 6 types in a periodic box (L = 25), a
  symmetric interaction matrix (×0.3 attraction, so the control is a true equilibrium system), a short-range
  repulsive core, Langevin dynamics (friction and thermal noise at temperature T), and the field
  `E = E0 · sin(2π t / period)` acting on each type's charge. Default preset **Demo A**: seed 1, E0 = 8,
  period 50, T = 0.02. 60,000 steps precompute in a Web Worker (about 3 minutes), with snapshots for exact seeking.
- **Metrics:** energy absorbed from the field (Ẇ = Σ F·v), entropy produced in the bath (net heat / T), and
  **order** (1 − compressed size / raw size of a coarse picture of the particles; about 0.69 is fully random).
- **The main result:** across a sweep of **1,200 driven runs**, each compared with its control (20 seeds × 5 field
  strengths × 3 periods × 4 temperatures), **driven was more ordered than control in 93.3%** of runs; in 20 of 20
  seeds for Demo A.
- **Reverse time:** flips every velocity of the driven run. With friction and noise, the system does not go back
  to chaos and entropy keeps rising; in frictionless mode it retraces for a short while (the arrow of time).
- **Visuals (decoration only):** a "microscope" view: ocean gradient and vignette, glowing particles with short
  trails (brighter when moving fast), positions interpolated between worker frames for smooth 60 FPS, the world
  zoomed to fill the panel (the crop is labelled). The field is drawn as travelling light bands that drift with
  the field's integral and brighten with its strength ("energy flowing in · field →"); the control says "no energy
  flow". Bonds between linked particles, a soft outline around each cluster coloured by its fingerprint (same
  colour = same composition and shape), a ripple with "same shape ×N" when a shape's count goes up, a warm vent
  glow, bubbles, dust, a microscope zoom on the largest structure every 18 seconds of playback, an optional
  magnifier and an optional hum (off by default). A test proves the metrics and state are bit-identical with all
  of this on or off.
- **What was dropped, and why:** a "Repeated structures" chart favoured the control. The driven run condenses into
  a few large clusters (about 4 of 300 particles), so there is little to repeat, while the control's dozens of
  medium clumps produce chance look-alikes. A stricter definition (clusters of at least 12 or 15 particles, with
  shape) was re-tested over the full 1,200-run sweep: driven had more copies in only 29–31% of runs, and no setting
  won both order and copies in more than 12 of 20 seeds. Rather than pick a lucky seed, the chart was removed and
  the story rests on order. The label "same shape" (not "copy") is used because these are look-alike clusters,
  not self-replication.

### Chapter 7: Evolution, from cells to humans (RECONSTRUCTED + SIMULATED toy model)

The chapter has two parts on the timeline.

**7a: Selection at work (the first 15% of the chapter, SIMULATED).** A toy model of natural selection, full
screen, then shrinking into a corner panel where it keeps running.

- Up to 1,500 organisms in a periodic 2D sea. Genome: size, speed, sense range, metabolism, colour (neutral, so
  it drifts and marks lineages), body segments and diet. Each step they steer toward food (or smaller, slower
  prey if their diet allows), eat, and pay for living: a basal cost, movement ∝ metabolism × body × speed²,
  sensing, and an oxygen overhead ∝ (segments − 1)² / oxygen. Above an energy threshold they pay for a child's
  body and split the rest with a mutated copy.
- The environment follows real dates: oxygen ramps up over the Great Oxidation Event (to 10% of today) and the
  Neoproterozoic oxygenation (to 100%), Snowball Earth cuts food to 30%, the Cambrian opens more food patches,
  and the end-Permian and end-Cretaceous extinctions wipe out 90% and 75% of species (whole lineages, chosen at
  random). A census splits a species when its members drift into two distinct groups, building a live tree.
- A **control** run is identical except that oxygen never rises.
- **Result (5 seeds):** mean body segments stay at 1.01–1.04 until the oxygen rise, then climb to about 2–3; the
  control stays at 1.00; the population never falls below about 95. Costs and mutation rates were tuned so this
  mechanism shows clearly; the claim is narrow: in this model, the complexity gain needs the oxygen rise.

**7b: Our lineage (the rest of the chapter, RECONSTRUCTED).** One creature morphs through **24 key stages** from
the first cells (3.5 billion years ago) to Homo sapiens (300,000 years ago): first cells, complex cell, first
many-celled life, sponge-like animal, worm-like animal, jawless fish, jawed fish, fish with limb-like fins, first
four-legged animal, early synapsid, cynodont, early mammal, early primate, early anthropoid, ancestor of Old World
monkeys and apes, early ape, last common ancestor with chimpanzees, Sahelanthropus, Ardipithecus,
Australopithecus afarensis ("Lucy"), Homo habilis, Homo erectus, Homo heidelbergensis, Homo sapiens.

- **The drawings** are our own simple schematics, all made from one parametric creature model (spine, body
  widths, head shape, two limbs, tail, eye), so all 24 have the same six parts with the same point counts
  (`public/lineage/NN-id.svg`). The morph blends the parameters, so limbs grow and swing rather than melt;
  missing parts are tiny and tucked inside the body. Everything is drawn at the same size, with a real-size scale
  bar ("about 2 µm", "about 1.6 m"). Backdrops change with environment: ocean, shore, land, forest, savanna.
- **Time scale:** every stage gets at least 3% of the chapter; the last eight (from the split with chimpanzees)
  about a third; time is logarithmic between stages. Dragging backwards plays the morph in reverse.
- **On screen:** the stage name and a one-line fact fade in at each key frame, and the line *"Key stages from the
  fossil record. Transitions between them are illustrations."*
- **Family tree mini-map:** our ancestors as the trunk; 19 living cousins branch off at their split dates
  (bacteria and archaea, plants, fungi, sponges, jellyfish, insects and other protostomes, sharks, amphibians,
  reptiles and birds, platypus, kangaroos, lemurs, New World monkeys, Old World monkeys, gibbons, orangutans,
  gorillas, chimpanzees and bonobos, and the extinct Neanderthals and Denisovans, faded). A dot travels along the
  trunk; each branch lights up with "… branch off, about N years ago"; clicking a branch shows a note. Icons are
  tiny versions of our own drawings. Key message: monkeys and apes are our cousins, not our ancestors.
- **Brain-size chart** (from the first primates on): fossil cranial capacities with ranges as error bars, a
  modern-chimpanzee reference line (about 370 cm³), Neanderthals faded as a side branch, and a readout of our
  lineage's brain size (from about 350 cm³ for Sahelanthropus to about 1,350 cm³ for Homo sapiens).
- **Narration:** 19 short lines in our own words, one per milestone, plus two theme lines ("Life began as simple,
  disordered chemistry..." and "From a single cell to a human brain: the most complex structure we know"). Every
  date and number in them is a template filled from the data files, so nothing is typed by hand. A line starts
  where its stage's name appears on screen, so label and subtitle change together.
- **Hand-over:** in the last 1.5% the stage fades and the globe comes forward; a closing line still showing
  carries over into chapter 8.

### Chapter 8: Humans (RECONSTRUCTED)

- **What it shows:** the globe with city lights spreading, dated milestones (Homo sapiens, the earliest cave art,
  agriculture, writing, the industrial revolution, the first human in space) and a world-population chart.
- **Data:** rounded figures from Our World in Data (HYDE 3.2 and UN World Population Prospects 2024), plus the
  UN's billion milestones (1927, 1960, 1974, 1987, 1999, 2011, 2022). From 4 million people 12,000 years ago to
  8.2 billion today.

---

## 5. Narration and the narrator (Winston)

- **Per-mode lines:** one short line per chapter for each switch position (`src/data/narration/modes.json`),
  shown in the narrator's panel when a chapter starts or the switch flips; a chapter without a line clears the
  previous one. For example, CONTROLLED chapter 2: *"A perfectly even universe. Gravity pulls the same way
  everywhere, so nothing gathers. No stars."*; RELEASED: *"Tiny random ripples. Gravity finds them, deepens them,
  and the first stars ignite."*
- **Chapter 7 milestone narration** as described above (RELEASED only).
- **Audio is pre-generated, never live:** with `ELEVENLABS_API_KEY` in `.env`, `npm run narration` writes every
  line as an mp3 plus a manifest (same voice and model as the server); the app then plays each clip with its
  subtitle when Winston is on. A clip recorded from older text is not played. Without a key, every line still
  shows as text.
- **Winston (chapter 6):** an AI narrator that comments on the live numbers and answers questions (typed or by
  voice), through a small server that keeps the API keys (Gemini for text, ElevenLabs for voice). Its
  instructions forbid inventing values, claiming the simulation creates life, or claiming the driven run makes
  more repeated structures.
- **All narration is our own words.** No text from the novel is used.

---

## 6. Data and sources

| File | Contents |
| --- | --- |
| `src/data/events.json` | The facts table: every dated event and chapter boundary (Big Bang, recombination, first stars, Sun, Earth, Moon impact, oxygen events, Snowball Earth, Cambrian, extinctions with the share of species lost, hominins, milestones). Single source of truth for every date. |
| `src/data/lineage.json` | The 24 stages: date, date range, group, environment, real size, one-line fact, source key, and the cousins that branch off (with split dates). |
| `src/data/brainSize.json` | Nine cranial capacities with ranges (chimpanzee reference, Sahelanthropus, Ardipithecus, A. afarensis, H. habilis, H. erectus, H. heidelbergensis, Neanderthal, H. sapiens). |
| `src/data/sources.md` | 47 keyed sources (Smithsonian Human Origins, Natural History Museum London, TimeTree, peer-reviewed papers...), a table of every value used, and notes on disagreements. |
| `src/data/population.json` | World population points (Our World in Data / UN). |
| `src/data/narration/*.json` | Narration lines (templates filled from the data files). |

Rules: dates are never typed into components; uncertain dates are stored as ranges and shown with "about";
every number on screen traces back to these files. Two event dates were corrected after verification: the first
four-legged animals (365 million years ago; 375 was Tiktaalik, still a fish) and the human–chimpanzee split
(about 7 million years ago, range 6–8).

---

## 7. Honesty by design

- A badge on every chapter, always visible; SIMULATED only where a model really runs.
- Tuned parameters are disclosed on screen, in the About panel and in the README: the ripple amplitude
  (chapter 2), the fog's clearing time (chapter 1), the slowed rotation (chapter 3), the 200× radii and gravity
  and the chosen seed (chapter 4), the toy model's costs (chapter 7).
- Results that went against the story are reported, not hidden: the dropped repeated-structures chart (29–31%),
  the original Particle Life settings that showed no effect (48.8%, a coin flip), the controlled chapter 4 that
  still built planets, the controlled chapter 6 lattice that snaps into a crystal.
- The morph's in-between frames are labelled as illustrations; monkeys and apes are always cousins; humans never
  "descended from monkeys".
- The model never claims to create life or self-replication; the closing claim is "randomness plus energy flow",
  never randomness alone.

---

## 8. How it is built

- **Stack:** TypeScript and Vite; Web Workers for every simulation; uPlot for charts; Three.js for the globe;
  Vitest for tests; a small Express server as an API proxy. About 10,700 lines of TypeScript in 90 files, plus
  CSS, HTML and data.
- **Workers and time travel:** each simulation runs in its own worker in 12 ms slices, keeps full snapshots
  (for example every 200 steps) and answers frame requests exactly, so the slider can jump anywhere, forwards or
  backwards, and always shows the true state. Playback waits for what has been computed.
- **Determinism:** seeded random numbers only (no `Math.random` in any simulation); the random generator's state
  is part of each snapshot, so seeking gives bit-identical results to a straight run.
- **Chapters** share one interface (init, seek, render, metrics, counters, events, dispose); each switch position
  has its own set of chapter instances.
- **Security:** API keys stay in `.env` on the server, never in the browser.

```
server/index.ts      API proxy: narration, questions, text-to-speech
src/control/         the CONTROLLED / RELEASED switch
src/sim/             chapter 6 physics, metrics, timeline (snapshots and seeking)
src/cosmo/           chapters 1–2: FFT, ripple field, particle-mesh gravity
src/galaxy/          chapter 3: closed-form galaxy model
src/solar/           chapter 4: planetesimal N-body with merging
src/globe/           chapters 5, 7, 8: the globe and its keyframes
src/evo/             chapter 7a: evolution toy model and its schedule
src/lineage/         chapter 7b: creature model, 24 drawings, time knots, narration
src/chapters/        one class per chapter, plus the engines that talk to the workers
src/ui/              main loop, slider, renderers, charts, family tree, brain chart, Winston
src/data/            facts, lineage, brain sizes, population, narration, sources
tests/               75 tests
scripts/             parameter sweep, narration generator, dev checks
```

---

## 9. How it was checked

- **75 automated tests** (Vitest), including: physics conservation and exact time reversal; deterministic seeking
  for every simulation; linear growth and the no-ripples control (chapter 2); momentum conservation and Kepler
  stability (chapter 4); the oxygen gate and its control, extinctions pruning the tree (chapter 7a); all 24
  drawings having identical structure, every lineage date inside its range, at least 3% per stage, narration
  templates filled with no typed numbers; chapter 6 decorations leaving metrics bit-identical; RELEASED
  parameters unchanged by the switch; CONTROLLED chapter 7 keeping one species.
- **Parameter sweeps:** 1,200 driven runs for the order result, and the same again for the stricter
  repeated-structures test.
- **Independent reviews:** each major phase was reviewed by separate agents, with every finding re-checked by a
  skeptic before it was fixed.
- **Screen audit:** 63 moments per mode (every chapter at 5 points and all 23 lineage stages): readouts match the
  time, chapter titles and stage labels are right, no text overflows, is clipped or overlaps. 0 problems in both
  modes.
- **Playthrough timing:** full runs in both modes, sampled every half second: chapters in order, the narrator's
  line always belongs to the chapter on screen, chapter 7 subtitles in step with the stage labels.
- **Frame rate:** 60 FPS throughout chapters 6–8 on a laptop GPU (Apple M3 Max); no console errors.

---

## 10. Running it

```bash
cd origin-sim
npm install
npm run dev          # the app at http://localhost:5173
npm run server       # optional: the narrator's API proxy (needs keys in .env)
npm test             # the 75 tests
npm run narration    # optional: pre-generate narration audio (needs ELEVENLABS_API_KEY)
```

- Deep links: `#ago=4.5e9` opens the story at that many years ago; `#mode=released` or `#mode=controlled` sets the
  switch (deep links skip the opening screen).
- On stage: open the page about 2 minutes early so the background simulations finish (chapter 6 needs about
  3 minutes in RELEASED and 60–80 seconds of settling in CONTROLLED; starting from the Big Bang hides this), and
  do not edit project files while presenting (the dev server reloads the page).

---

## 11. Known limitations and open work

- Narration audio is written but not generated until an ElevenLabs key is added.
- Not built yet: a demo mode with cues, zoom transitions between all chapters, chapter 1's particle soup, the
  optional side-by-side compare view for the switch, and the separate `/show` presentation.
- Both modes' background simulations run from page load, which uses more CPU at startup.
- The hominin drawings are deliberately simple schematics.
- Numbers tuned in Node (chapters 1, 2, 6, 7) can differ slightly in the browser, because `Math.sin`/`cos`/`log`
  can differ in the last bit between engines; the behaviour is the same (for example the first star at 135 vs
  139 million years).
