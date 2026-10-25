import { CHAPTERS, chapterIndexAtU, chapterStartU, sliderToTime, timeToSlider } from '../time/chapters';
import { cosmicCalendar, formatAge, formatYearsAgo, AGE, YEARS_PER_CALENDAR_SECOND } from '../time/cosmic';
import type { Chapter, ViewContext } from '../chapters/types';
import { PlaceholderChapter } from '../chapters/placeholder';
import { OriginOfLifeChapter } from '../chapters/originOfLife';
import { GlobeChapter } from '../chapters/globeChapter';
import { CosmoEngine } from '../chapters/cosmoEngine';
import { CosmicWebChapter } from '../chapters/cosmicWeb';
import { HotBeginningChapter } from '../chapters/hotBeginning';
import { SolarEngine } from '../chapters/solarEngine';
import { SolarSystemChapter } from '../chapters/solarSystem';
import { EvoEngine } from '../chapters/evoEngine';
import { EvolutionChapter } from '../chapters/evolution';
import { GalaxyChapter } from '../chapters/galaxy';
import { ControlledCard } from '../chapters/controlledCard';
import modeLines from '../data/narration/modes.json';
import { MasterSlider } from './masterSlider';
import { Winston } from './winston';
import { mode, onModeChange, setMode, toggleMode, type Mode } from '../control/controlMode';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SEED = 1;

// Each switch position has its own chapter instances (and background runs), built for that
// mode: flipping the switch swaps sets and restarts the current chapter, deterministically.
interface ChapterSet {
  chapters: Chapter[];
  life: OriginOfLifeChapter;
}

// The cosmic web engine computes both runs (with ripples, and perfectly smooth) and is shared.
const webSpan = CHAPTERS.find((c) => c.id === 'web')!;
const cosmo = new CosmoEngine(webSpan.tStart, webSpan.tEnd, SEED);

function buildSet(m: Mode): ChapterSet {
  // Chapter 6 is created up front so its simulation precomputes while the story plays.
  const life = new OriginOfLifeChapter(CHAPTERS.find((c) => c.id === 'life')!, m);
  // Chapter 4's accretion run also precomputes from page load (about 10 seconds).
  const solarSpan = CHAPTERS.find((c) => c.id === 'solar')!;
  const solar = new SolarEngine(solarSpan.tStart, solarSpan.tEnd, m);
  // Chapter 7's evolution model (and its no-oxygen control) precomputes from page load too (a few seconds).
  const evo = new EvoEngine(SEED, m);
  const chapters = CHAPTERS.map((span): Chapter => {
    if (span.id === 'life') return life;
    // CONTROLLED: no stars formed in chapter 2, so later chapters that need them are cards.
    if (m === 'controlled') {
      if (span.id === 'galaxy')
        return new ControlledCard(span, 'No galaxy', 'Nothing clumped in the cosmic web, so there is no clump to become a galaxy: just an even, empty haze.', true);
      if (span.id === 'solar') return new ControlledCard(span, 'No Sun, no planets', 'No stars formed, so there is no Sun and no Solar System.');
      if (span.id === 'earth') return new ControlledCard(span, 'No Earth', 'No Solar System formed in controlled mode, so there is no young Earth.');
      if (span.id === 'humans') return new ControlledCard(span, 'No humans', 'No humans in a controlled universe: with no stars, no planet and no variation, nothing could ever lead to people.');
    }
    if (span.id === 'hot') return new HotBeginningChapter(span, cosmo, m);
    if (span.id === 'web') return new CosmicWebChapter(span, cosmo, m);
    if (span.id === 'galaxy') return new GalaxyChapter(span, m);
    if (span.id === 'solar') return new SolarSystemChapter(span, solar, m);
    if (span.id === 'evolution') return new EvolutionChapter(span, evo, m);
    if (span.id === 'earth' || span.id === 'humans') return new GlobeChapter(span, span.id, m);
    return new PlaceholderChapter(span);
  });
  return { chapters, life };
}

const sets: Partial<Record<Mode, ChapterSet>> = {};
let onSetBuilt: ((set: ChapterSet) => void) | null = null;
function setFor(m: Mode): ChapterSet {
  if (!sets[m]) {
    sets[m] = buildSet(m);
    onSetBuilt?.(sets[m]!);
  }
  return sets[m]!;
}
setFor(mode());
// Warm up the other mode's background runs a little later, so both are ready to flip to.
window.setTimeout(() => setFor(mode() === 'controlled' ? 'released' : 'controlled'), 4000);
const chapters = () => setFor(mode()).chapters;
const life = () => setFor(mode()).life;

const slider = new MasterSlider();

// Deep link: #ago=4.5e9 opens the story at that many years ago (handy on stage and for testing).
// #mode=released / #mode=controlled sets the switch (also for testing).
function applyHash(): void {
  const md = /mode=(controlled|released)/i.exec(location.hash);
  if (md) setMode(md[1].toLowerCase() as Mode);
  const m = /ago=([\d.e+]+)/i.exec(location.hash);
  if (m) slider.setU(timeToSlider(AGE - Number(m[1])));
}
applyHash();
window.addEventListener('hashchange', applyHash);

const view: ViewContext = {
  main: $('view'),
  charts: $('chapter-charts'),
  scrubbing: false,
  playing: false,
  pause: () => slider.setPlaying(false),
};

const winston = new Winston({
  history: () => life().history,
  params: () => life().params,
  step: () => life().step,
  playing: () => slider.playing,
  active: () => active === life(),
});
onSetBuilt = (set) => {
  set.life.onEvent = (text) => winston.event(text);
  set.life.onReset = () => winston.reset();
};
for (const set of Object.values(sets)) onSetBuilt(set!);

let active: Chapter | null = null;
let activeLife: Chapter | null = null;
let lastT = -1;

/** Switches chapters when the slider crosses a boundary (drags cut directly). */
function activate(i: number): void {
  const next = chapters()[i];
  if (next === active) return;
  if (active && active === activeLife) winston.deactivate();
  activeLife = life();
  active?.dispose();
  active = next;
  view.main.style.setProperty('--chapter-color', next.span.color);
  next.init(view, SEED).catch((e) => console.error(`[chapter ${next.id}] init failed`, e));
  $('chapter-title').textContent = `${i + 1}. ${next.title}`;
  sayModeLine(next.id);
  const badge = $('chapter-badge');
  badge.textContent = next.badge ?? (next.span.kindNote ? `${next.kind} ${next.span.kindNote}` : next.kind);
  badge.className = next.badge ? 'badge kind-CONTROLLED' : `badge kind-${next.kind}`;
}

function updateReadouts(t: number): void {
  $('readout-ago').textContent = formatYearsAgo(t);
  $('readout-age').textContent = formatAge(t);
  $('readout-calendar').textContent = cosmicCalendar(t);
}

$('calendar-label').title = `The whole ${AGE / 1e9} billion years squeezed into one year (Carl Sagan). 1 second ≈ ${Math.round(YEARS_PER_CALENDAR_SECOND)} years.`;

// About
const about = $('about-overlay');
$('btn-about').addEventListener('click', () => (about.hidden = false));
$('about-close').addEventListener('click', () => (about.hidden = true));
about.addEventListener('click', (e) => {
  if (e.target === about) about.hidden = true;
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') about.hidden = true;
});

// ---------------------------------------------------------------------------
// The CONTROLLED / RELEASED switch

let releasedOnce = false;
function applyModeUI(): void {
  const m = mode();
  document.body.classList.toggle('mode-controlled', m === 'controlled');
  $('mode-pill').textContent = m === 'controlled' ? 'CONTROLLED' : 'RELEASED';
  $('mode-pill').className = `mode-pill ${m}`;
  $('mode-label').textContent = m === 'controlled' ? 'CONTROLLED — no randomness' : 'RELEASED — chaos allowed';
  $('opening-controlled').classList.toggle('on', m === 'controlled');
  $('opening-released').classList.toggle('on', m === 'released');
  if (m === 'released' && !releasedOnce) {
    releasedOnce = true;
    $('opening-line').textContent = 'Now we let go.';
  }
}

// Flipping restarts the current chapter from its start in the other mode, with a short crossfade.
onModeChange(() => {
  applyModeUI();
  const i = chapterIndexAtU(slider.u);
  if (active && active === activeLife) winston.deactivate();
  active?.dispose();
  active = null;
  lastT = -1;
  slider.setU(chapterStartU(i) + 1e-9);
  view.main.classList.remove('mode-fade');
  void view.main.offsetWidth; // restart the animation
  view.main.classList.add('mode-fade');
});

$('mode-pill').addEventListener('click', () => toggleMode());
$('opening-controlled').addEventListener('click', () => setMode('controlled'));
$('opening-released').addEventListener('click', () => setMode('released'));
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'c' || e.key === 'C') toggleMode();
});

// Opening screen (skipped for deep links such as #ago=..., which are used on stage and in tests).
const opening = $('opening');
opening.hidden = /ago=/.test(location.hash);
$('opening-begin').addEventListener('click', () => {
  opening.hidden = true;
  slider.setU(0);
  slider.setPlaying(true);
});
applyModeUI();

// Per-mode line for the chapter on screen (shown when it starts or the switch flips; played once generated).
let narrationTimer = 0;
let modeAudio: HTMLAudioElement | null = null;
let modeManifest: Set<string> | null = null;
fetch('/narration/modes/manifest.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((m) => (modeManifest = new Set(m ? (m.lines as { id: string }[]).map((l) => l.id) : [])))
  .catch(() => (modeManifest = new Set()));
function sayModeLine(chapter: string): void {
  const lines = (modeLines.chapters as Record<string, Partial<Record<Mode, string>>>)[chapter];
  const text = lines?.[mode()];
  // The narrator's line goes in the narrator's place (Winston's panel), where it never covers the picture.
  const el = $('winston-text');
  clearTimeout(narrationTimer);
  if (!text) {
    // No line for this chapter: clear the previous chapter's, so it never lingers on the wrong picture.
    el.textContent = '';
    return;
  }
  el.textContent = text;
  el.classList.remove('faded');
  narrationTimer = window.setTimeout(() => el.classList.add('faded'), 12000);
  const id = `${chapter}-${mode()}`;
  modeAudio?.pause();
  if (($('winston-on') as HTMLInputElement).checked && modeManifest?.has(id)) {
    modeAudio = new Audio(`/narration/modes/${id}.mp3`);
    void modeAudio.play().catch(() => {});
  }
}

// Top-bar counters for the chapter on screen, a few times a second.
let lastCounters = 0;
function updateCounters(now: number): void {
  if (now - lastCounters < 250) return;
  lastCounters = now;
  const c = active?.counters?.() ?? [];
  $('chapter-counters').innerHTML = c.map((x) => `<span><span class="dim">${x.label}</span> <b>${x.value}</b></span>`).join(' · ');
}

let prevFrame = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.1, (now - prevFrame) / 1000);
  prevFrame = now;

  // Playback can't run past what the current chapter has computed.
  const i = chapterIndexAtU(slider.u);
  const until = chapters()[i].availableUntil?.();
  slider.tick(dt, until === undefined ? 1 : timeToSlider(until));

  view.playing = slider.playing;
  view.scrubbing = slider.playing || slider.dragging;
  const t = sliderToTime(slider.u);
  activate(chapterIndexAtU(slider.u));
  if (t !== lastT) {
    updateReadouts(t);
    active!.seek(t);
    lastT = t;
  }
  active!.render(view, t);
  updateCounters(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
