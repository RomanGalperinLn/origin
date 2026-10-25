// RECONSTRUCTED: the globe's appearance over time, keyed to dated events.
// This is a visualisation of the timeline, not a climate or geology model.
// Every time comes from events.json; values between keyframes are interpolated.

import { AGE, eventTime } from '../time/cosmic';

export interface SurfaceState {
  /** Molten surface, 0..1. */
  lava: number;
  /** How far oceans have filled the low ground, 0..1. */
  ocean: number;
  /** Continental crust coverage, 0..1 (about 0.3 today). */
  land: number;
  /** Ice reaching from the poles toward the equator, 0..1 (1 = Snowball Earth). */
  ice: number;
  /** Plant cover on land, 0..1. */
  veg: number;
  /** Night-side city lights, 0..1. */
  city: number;
  /** Haze over the surface (thick early atmosphere), 0..1. */
  haze: number;
  /** Cloud cover, 0..1. */
  clouds: number;
  /** Background rate of impact flashes, 0..1. */
  impacts: number;
  /** Sky / rim colour: orange haze before oxygen, blue after. */
  atmo: [number, number, number];
}

interface Keyframe {
  t: number;
  /** What the surface looks like from here on (shown as a caption). */
  label?: string;
  state: Partial<SurfaceState>;
}

const ORANGE_GLOW: [number, number, number] = [0.95, 0.38, 0.15];
const ORANGE_HAZE: [number, number, number] = [0.9, 0.6, 0.32];
const BLUE: [number, number, number] = [0.35, 0.6, 1.0];

const KEYFRAMES: Keyframe[] = [
  {
    t: eventTime('earth-forms'),
    label: 'A molten world: no oceans, no continents',
    state: { lava: 1, ocean: 0, land: 0, ice: 0, veg: 0, city: 0, haze: 0.8, clouds: 0.05, impacts: 0.5, atmo: ORANGE_GLOW },
  },
  { t: eventTime('moon-impact'), label: 'The Moon-forming impact melts the surface again', state: { lava: 1, impacts: 0.6 } },
  // Halfway between the impact and the first evidence of water: still cooling.
  { t: (eventTime('moon-impact') + eventTime('zircons')) / 2, state: { lava: 0.6, impacts: 0.3 } },
  {
    t: eventTime('zircons'),
    label: 'The crust cools; the first liquid water collects under a thick, hazy sky',
    state: { lava: 0.08, ocean: 0.7, land: 0.05, haze: 0.6, clouds: 0.45, impacts: 0.15, atmo: ORANGE_HAZE },
  },
  { t: eventTime('late-heavy-bombardment', 'earliest'), label: 'Late heavy bombardment (timing debated)', state: { lava: 0.04, ocean: 0.8, land: 0.08, impacts: 0.8 } },
  { t: eventTime('late-heavy-bombardment', 'latest'), state: { lava: 0.02, impacts: 0.1 } },
  {
    t: eventTime('earliest-life'),
    label: 'Oceans and small continents under an orange, oxygen-free sky',
    state: { lava: 0, ocean: 0.88, land: 0.12, haze: 0.6, clouds: 0.45, impacts: 0.03 },
  },
  { t: eventTime('great-oxidation'), label: 'Great Oxidation Event: oxygen starts to build up', state: { land: 0.24, haze: 0.55, atmo: ORANGE_HAZE } },
  {
    t: eventTime('eukaryotes', 'earliest'),
    label: 'An oxygen atmosphere: the sky turns blue',
    state: { land: 0.27, haze: 0.06, clouds: 0.4, impacts: 0.01, atmo: BLUE },
  },
  { t: eventTime('snowball-earth', 'earliest'), label: 'Snowball Earth begins', state: { ice: 0.15 } },
  { t: eventTime('snowball-earth'), label: 'Snowball Earth: ice may reach the equator', state: { ice: 1, clouds: 0.2 } },
  { t: eventTime('snowball-earth', 'latest'), label: 'The ice retreats', state: { ice: 0.12, clouds: 0.4 } },
  { t: eventTime('cambrian'), label: 'Cambrian explosion in the oceans; the land is still bare', state: { land: 0.29, veg: 0 } },
  { t: eventTime('land-plants'), label: 'The first plants colonise the land', state: { veg: 0.05 } },
  { t: eventTime('tetrapods'), label: 'Forests spread; animals walk onto land', state: { veg: 0.65 } },
  { t: eventTime('end-permian'), label: 'End-Permian extinction', state: { veg: 0.4 } },
  { t: eventTime('first-dinosaurs'), label: 'The age of dinosaurs', state: { veg: 0.65 } },
  { t: eventTime('end-cretaceous'), label: 'An asteroid ends the age of dinosaurs', state: { veg: 0.6 } },
  { t: eventTime('homo-sapiens'), label: 'Ice ages come and go; Homo sapiens appears', state: { ice: 0.2, veg: 0.62, land: 0.3 } },
  { t: eventTime('agriculture'), label: 'Agriculture: the first villages', state: { ice: 0.12, city: 0 } },
  { t: eventTime('writing'), label: 'Writing and the first cities', state: { city: 0.02 } },
  { t: eventTime('industrial-revolution'), label: 'The industrial revolution', state: { city: 0.08 } },
  { t: eventTime('first-human-in-space'), label: 'Electric light spreads across the night side', state: { city: 0.45 } },
  { t: AGE, label: 'Today', state: { city: 1 } },
];

// Fill each keyframe with everything inherited from the ones before it.
const FULL: { t: number; label: string; state: SurfaceState }[] = [];
{
  let prev = KEYFRAMES[0].state as SurfaceState;
  let label = KEYFRAMES[0].label!;
  for (const k of [...KEYFRAMES].sort((a, b) => a.t - b.t)) {
    prev = { ...prev, ...k.state };
    label = k.label ?? label;
    FULL.push({ t: k.t, label, state: prev });
  }
}

/** Short bursts of impact flashes at single dated impacts (± 10% of their age). */
const IMPACT_SPIKES = [eventTime('moon-impact'), eventTime('end-cretaceous')];

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Surface state and caption at time t (years since the Big Bang). */
export function surfaceAt(t: number): { state: SurfaceState; label: string } {
  if (t <= FULL[0].t) return { state: FULL[0].state, label: FULL[0].label };
  const last = FULL[FULL.length - 1];
  if (t >= last.t) return { state: last.state, label: last.label };
  let i = 0;
  while (FULL[i + 1].t <= t) i++;
  const a = FULL[i];
  const b = FULL[i + 1];
  const f = (t - a.t) / (b.t - a.t);
  const s: SurfaceState = {
    lava: lerp(a.state.lava, b.state.lava, f),
    ocean: lerp(a.state.ocean, b.state.ocean, f),
    land: lerp(a.state.land, b.state.land, f),
    ice: lerp(a.state.ice, b.state.ice, f),
    veg: lerp(a.state.veg, b.state.veg, f),
    city: lerp(a.state.city, b.state.city, f),
    haze: lerp(a.state.haze, b.state.haze, f),
    clouds: lerp(a.state.clouds, b.state.clouds, f),
    impacts: lerp(a.state.impacts, b.state.impacts, f),
    atmo: [0, 1, 2].map((k) => lerp(a.state.atmo[k], b.state.atmo[k], f)) as [number, number, number],
  };
  for (const ti of IMPACT_SPIKES) {
    const ago = AGE - ti;
    const d = Math.abs(t - ti) / (0.1 * ago);
    if (d < 1) s.impacts = Math.max(s.impacts, 1 - d);
  }
  return { state: s, label: freshLabel(t) };
}

/** Captioned milestones, in time order. */
const CAPTIONED = KEYFRAMES.filter((k) => k.label).map((k) => ({ t: k.t, label: k.label! }));

/**
 * The caption for time t: the latest milestone, but only during the first 60% of the stretch until the
 * next one, so an old milestone is not presented as current news (empty in between).
 */
function freshLabel(t: number): string {
  let i = -1;
  while (i + 1 < CAPTIONED.length && CAPTIONED[i + 1].t <= t) i++;
  if (i < 0) return CAPTIONED[0].label;
  const next = CAPTIONED[i + 1];
  if (!next) return CAPTIONED[i].label;
  return (t - CAPTIONED[i].t) / (next.t - CAPTIONED[i].t) <= 0.6 ? CAPTIONED[i].label : '';
}
