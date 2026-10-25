// Chapter 4 (SIMULATED): the young Sun ignites, its gas disk clears, and rocky planetesimals
// collide and merge into a few planets (2D N-body, time compressed). One of them becomes
// Earth. The Moon-forming impact at the end is a RECONSTRUCTED illustration, not simulated.

import type { Mode } from '../control/controlMode';
import { EVENTS, eventTime, formatWhen, type TimelineEvent } from '../time/cosmic';
import type { ChapterSpan } from '../time/chapters';
import type { SolarMetrics } from '../solar/nbody';
import { SOLAR_SCRIPT } from '../solar/params';
import { SolarRenderer } from '../solar/solarRenderer';
import { BODY_STRIDE } from '../solar/protocol';
import { MiniCharts } from '../ui/miniCharts';
import { fmt } from '../ui/charts';
import type { SolarEngine, SolarFrame } from './solarEngine';
import { ChapterBase, type ViewContext } from './types';
import '../ui/solar.css';

const smooth = (a: number, b: number, x: number) => {
  const f = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return f * f * (3 - 2 * f);
};

export class SolarSystemChapter extends ChapterBase {
  private root: HTMLElement | null = null;
  private renderer: SolarRenderer | null = null;
  private charts: MiniCharts<SolarMetrics> | null = null;
  private eventItems: { e: TimelineEvent; el: HTMLElement }[] = [];
  private lastFrame: SolarFrame | null = null;
  private needFrame = true;
  private step = 0;
  private els: Record<string, HTMLElement> = {};
  /** What was last drawn, so identical frames aren't redrawn. */
  private drawn = { frame: null as SolarFrame | null, key: '', w: 0, h: 0 };

  constructor(
    span: ChapterSpan,
    private engine: SolarEngine,
    mode: Mode = 'released',
  ) {
    super(span, mode);
  }

  /** Myr after the Sun forms. */
  private myr(t: number): number {
    return (t - this.tStart) / 1e6;
  }

  async init(view: ViewContext): Promise<void> {
    const p = this.engine.params;
    const root = document.createElement('div');
    root.className = 'web-chapter solar-chapter';
    root.innerHTML = `
      <div class="web-box"><canvas class="web-canvas"></canvas>
        <span class="badge kind-RECONSTRUCTED solar-impact-badge" hidden>RECONSTRUCTED</span>
        <div class="web-caption"></div></div>
      <div class="web-side">
        <div class="side-title">What you are seeing</div>
        <p>The Sun has just formed, surrounded by a disk of gas and dust. Its light and wind clear the gas
          within a few million years. What is left are ${p.N} rocky planetesimals orbiting the Sun. Their gravity
          pulls on each other, orbits cross, and bodies that collide stick together. Over tens of millions of
          years a few planets are left on stable orbits. One of them is Earth.</p>
        <div class="web-stats">
          <div><span class="dim">bodies</span> <b class="s-n">${p.N}</b></div>
          <div><span class="dim">collisions</span> <b class="s-c">0</b></div>
          <div><span class="dim">largest</span> <b class="s-m">0</b></div>
          <div title="Small bodies flung out of the system (past 30 AU) or swallowed by the Sun: normal in real planet formation"><span class="dim">flung out</span> <b class="s-l">0</b></div>
        </div>
        <ul class="side-events"></ul>
        <p class="dim small">Real gravity and real collisions (N-body, leapfrog), but in 2D and time compressed:
          the real process took about 10 to 100 million years; here it is ${Math.round((p.steps * p.dt) / 10) * 10} orbits
          of the Earth. To fit that in, collision radii are ${p.radiusInflation}× larger than real rocks and the
          bodies pull on each other ${p.gravityBoost}× harder than their real masses would (the Sun's pull is real).
          The gas disk's glow is scripted. The Moon-forming impact is an illustration (RECONSTRUCTED), not simulated.
          Seed ${p.seed} is shown, picked from seeds 1–6 as the clearest result; Earth ended between
          ${p.earthZone[0]} and ${p.earthZone[1]} AU in 3 of those 6 runs.
          <span class="s-earth"></span></p>
      </div>`;
    view.main.appendChild(root);
    this.root = root;
    for (const k of ['n', 'c', 'm', 'l', 'earth']) this.els[k] = root.querySelector(`.s-${k}`)!;
    this.renderer = new SolarRenderer(root.querySelector('.web-canvas') as HTMLCanvasElement);
    const list = root.querySelector('.side-events')!;
    this.eventItems = this.events().map((e) => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${e.label}</b><span class="dim">${formatWhen(e.t)} · ${e.cosmicCalendar}</span>`;
      li.title = e.note;
      list.appendChild(li);
      return { e, el: li };
    });

    this.charts = new MiniCharts<SolarMetrics>(
      view.charts,
      [
        { title: 'Bodies', value: (m) => m.nBodies, logY: true },
        { title: 'Largest body (Earth masses)', value: (m) => m.largestMass },
        { title: 'Collisions', value: (m) => m.collisions },
      ],
      {
        x: (m) => this.myr(this.engine.timeAt(m.step)),
        xLabel: (v) => `${fmt(v)} Myr`,
        mainColor: '#e0b45c',
        control: false,
      },
    );
    this.charts.add(this.engine.history);
    this.engine.onMetrics = (samples) => this.charts?.add(samples);
    this.engine.onFrame = (f) => (this.lastFrame = f);
    this.needFrame = true;
  }

  async seek(t: number): Promise<void> {
    this.step = this.engine.stepAt(t);
    for (const { e, el } of this.eventItems) el.classList.toggle('passed', t >= e.t);
  }

  render(_view: ViewContext, t: number): void {
    if (!this.renderer || !this.root) return;
    const eng = this.engine;
    this.step = eng.stepAt(t);
    if (eng.requestFrame(this.step, this.needFrame)) this.needFrame = false;
    const f = this.lastFrame;
    const shown = f ? f.step : 0;
    // Scripted parts follow the time actually on screen, so they stay in step with the bodies.
    const myr = this.myr(eng.timeAt(shown));
    const sun = smooth(0, SOLAR_SCRIPT.sunIgniteMyr, myr);
    const gas = 1 - smooth(SOLAR_SCRIPT.gasClearFromMyr, SOLAR_SCRIPT.gasClearToMyr, myr);
    const impactStart = this.myr(this.tEnd) - SOLAR_SCRIPT.impactLeadMyr;
    const impact = eng.done && eng.earth >= 0 && myr >= impactStart ? Math.min(1, (myr - impactStart) / SOLAR_SCRIPT.impactLeadMyr) : null;
    const earthFormed = eng.timeAt(shown) >= eventTime('earth-forms');
    const earthLabel = eng.earth < 0 ? null : earthFormed ? 'Earth' : 'proto-Earth';

    const canvas = this.renderer.canvas;
    const key = `${sun.toFixed(3)}|${gas.toFixed(3)}|${earthLabel}|${impact?.toFixed(4)}`;
    const d = this.drawn;
    if (f !== d.frame || key !== d.key || canvas.clientWidth !== d.w || canvas.clientHeight !== d.h) {
      const inset = this.renderer.draw(f?.bodies ?? null, { sun, gas, earth: eng.earth, earthLabel, impact });
      this.drawn = { frame: f, key, w: canvas.clientWidth, h: canvas.clientHeight };
      const badge = this.root.querySelector('.solar-impact-badge') as HTMLElement;
      badge.hidden = !inset;
      if (inset) {
        badge.style.left = `${inset.x}px`;
        badge.style.top = `${inset.y}px`;
      }
    }
    this.charts?.setCursor(myr);

    const m = eng.metricAt(shown);
    if (m) {
      this.els.n.textContent = String(m.nBodies);
      this.els.c.textContent = String(m.collisions);
      this.els.m.textContent = `${m.largestMass.toFixed(2)} M⊕`;
      this.els.l.textContent = String(m.lost);
    }
    if (!eng.done) this.els.earth.textContent = `Computing… ${Math.round((100 * eng.headStep) / eng.params.steps)}%`;
    else if (eng.earth >= 0 && f) {
      const k = this.bodyOffset(f, eng.earth);
      const mass = k >= 0 ? f.bodies[k + 5] : NaN;
      this.els.earth.textContent = eng.earthInZone
        ? `Earth is the largest body that ended between ${eng.params.earthZone[0]} and ${eng.params.earthZone[1]} AU${Number.isFinite(mass) ? ` (now ${mass.toFixed(2)} Earth masses)` : ''}.`
        : `No body ended between ${eng.params.earthZone[0]} and ${eng.params.earthZone[1]} AU in this run; Earth is marked as the planet closest to 1 AU.`;
    }

    const caption = this.root.querySelector('.web-caption')!;
    caption.textContent =
      this.step > eng.headStep
        ? 'Still computing: showing an earlier moment'
        : impact !== null
          ? impact < 0.36
            ? 'Theia, a Mars-sized body, heads for the young Earth'
            : impact < 0.66
              ? 'The impact throws molten debris into orbit'
              : 'The debris ring gathers into the Moon'
          : gas > 0.05
            ? 'The young Sun ignites and clears the leftover gas'
            : m && m.nBodies > 30
              ? 'Planetesimals collide and merge'
              : 'A few planets remain on stable orbits';
  }

  private bodyOffset(f: SolarFrame, index: number): number {
    for (let k = 0; k < f.bodies.length; k += BODY_STRIDE) if (f.bodies[k] === index) return k;
    return -1;
  }

  counters(): { label: string; value: string }[] {
    const m = this.engine.metricAt(this.step);
    return [{ label: 'planetesimals merged', value: String(m?.collisions ?? 0) }];
  }

  metrics(): Record<string, number> {
    const m = this.engine.metricAt(this.step);
    return m ? { bodies: m.nBodies, largestBodyEarthMasses: m.largestMass, collisions: m.collisions, lost: m.lost } : {};
  }

  events(): TimelineEvent[] {
    return EVENTS.filter((e) => e.chapter === this.id);
  }

  availableUntil(): number {
    return this.engine.timeAt(this.engine.headStep);
  }

  dispose(): void {
    this.engine.onMetrics = null;
    this.engine.onFrame = null;
    this.charts?.destroy();
    this.charts = null;
    this.root?.remove();
    this.root = null;
    this.renderer = null;
    this.lastFrame = null;
    this.eventItems = [];
    this.drawn = { frame: null, key: '', w: 0, h: 0 };
  }
}
