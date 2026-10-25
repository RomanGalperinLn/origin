// Chapter 1 (MODELLED): the hot, opaque early universe cooling until the first atoms
// form and light breaks free (recombination), revealing the cosmic microwave background.
// The CMB map is the same ripple field that chapter 2's gravity grows into the cosmic web.
// The particle soup (quarks -> protons -> nuclei, H/He bar) is added in phase 6.

import { paramsFor, type Mode } from '../control/controlMode';
import { EVENTS, eventTime, formatAge, formatWhen, type TimelineEvent } from '../time/cosmic';
import type { ChapterSpan } from '../time/chapters';
import { WebRenderer } from '../ui/webRenderer';
import { MiniCharts } from '../ui/miniCharts';
import { fmt, sci } from '../ui/charts';
import type { CosmoEngine } from './cosmoEngine';
import { ChapterBase, type ViewContext } from './types';

/** Temperature of the universe at recombination (K): textbook ~3000 K. */
const T_RECOMBINATION = 3000;
/**
 * Fog clears from this fraction of the recombination time to recombination itself.
 * Physically the clearing runs from roughly 250,000 years: on the log clock that would
 * flash by in a quarter of a second, so it is drawn starting earlier (~1 s of playback).
 * Disclosed in the side text, the About panel and the README.
 */
const CLEAR_FROM = 0.15;

/** Radiation era: T ∝ 1/a and a ∝ t^(1/2), so T ∝ t^(-1/2). */
export function temperatureAt(t: number, tRec: number): number {
  return T_RECOMBINATION * Math.sqrt(tRec / Math.max(t, 1e-20));
}

/** Fog colour from temperature: violet-white (hottest) -> white -> yellow -> orange -> deep orange. */
const FOG: [number, [number, number, number]][] = [
  [13, [200, 185, 255]],
  [9, [255, 250, 238]],
  [6, [255, 226, 150]],
  [4, [255, 150, 60]],
  [3.4, [225, 85, 35]],
];

function fogColor(T: number): string {
  const l = Math.log10(T);
  let k = 0;
  while (k < FOG.length - 2 && l < FOG[k + 1][0]) k++;
  const [l0, c0] = FOG[k];
  const [l1, c1] = FOG[k + 1];
  const f = Math.max(0, Math.min(1, (l0 - l) / (l0 - l1)));
  const c = c0.map((v, i) => Math.round(v + f * (c1[i] - v)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

interface TempSample {
  t: number;
  T: number;
}

export class HotBeginningChapter extends ChapterBase {
  private root: HTMLElement | null = null;
  private renderer: WebRenderer | null = null;
  private charts: MiniCharts<TempSample> | null = null;
  private eventItems: { e: TimelineEvent; el: HTMLElement }[] = [];
  private tempEl: HTMLElement | null = null;
  private caption: HTMLElement | null = null;
  private tRec = eventTime('recombination');
  private clock = 0;
  private t = 0;
  private lastNow = performance.now();

  constructor(
    span: ChapterSpan,
    private engine: CosmoEngine,
    mode: Mode = 'released',
  ) {
    super(span, mode);
  }

  async init(view: ViewContext): Promise<void> {
    const root = document.createElement('div');
    root.className = 'web-chapter';
    root.innerHTML = `
      <div class="web-box"><canvas class="web-canvas"></canvas><div class="web-caption"></div></div>
      <div class="web-side">
        <div class="side-title">Temperature</div>
        <div class="hot-temp"></div>
        ${this.mode === 'controlled' ? `<p class="why"><b>Why nothing will grow (CONTROLLED):</b> we removed the randomness, so the hot soup
          is perfectly even, without a single ripple. It cools and the fog clears at about ${formatAge(eventTime('recombination'))}
          exactly as before, but the first light is one smooth, featureless glow. Every structure in the universe grows
          from tiny differences in density: here there are none, so later there is nothing for gravity to build on.</p>`
          : `<p>The young universe is a hot, dense soup. Light cannot travel far: it keeps bouncing off free electrons,
          like light in fog. As space expands, everything cools. At about ${formatAge(eventTime('recombination'))}, electrons
          settle onto nuclei, the fog clears, and light travels freely for the first time. We still see that light
          today: the cosmic microwave background.</p>`}
        <ul class="side-events"></ul>
        <p class="dim small"${this.mode === 'controlled' ? ' hidden' : ''}>The map is a random field, not the Planck satellite's map. Its colours show the seed
          density: denser spots are drawn slightly colder (blue), as the Sachs-Wolfe effect predicts, and the real
          CMB is smoother on these scales. These same ripples are the seeds that grow into the cosmic web in the
          next chapter. The fog is drawn clearing more slowly than it really did, so you can see it: in reality it
          clears between about 250,000 and ${formatAge(eventTime('recombination'))}. The particle soup itself arrives in phase 6.</p>
      </div>`;
    view.main.appendChild(root);
    this.root = root;
    this.tempEl = root.querySelector('.hot-temp');
    this.caption = root.querySelector('.web-caption');
    const list = root.querySelector('.side-events')!;
    this.eventItems = this.events().map((e) => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${e.label}</b><span class="dim">${formatWhen(e.t)}</span>`;
      li.title = e.note;
      list.appendChild(li);
      return { e, el: li };
    });
    this.renderer = new WebRenderer(root.querySelector('.web-canvas') as HTMLCanvasElement);

    this.charts = new MiniCharts<TempSample>(
      view.charts,
      [{ title: 'Temperature of the universe (K)', value: (m) => m.T, logY: true, format: (v) => (v >= 1e6 ? sci(v, 0) : fmt(v)) }],
      { x: (m) => m.t, logX: true, xLabel: (v) => `${fmt(v)} yr`, mainColor: '#ff9a4d', control: false },
    );
    const samples: TempSample[] = [];
    const t0 = eventTime('protons') / 10;
    for (let k = 0; k <= 200; k++) {
      const t = t0 * Math.pow(this.tRec / t0, k / 200);
      samples.push({ t, T: temperatureAt(t, this.tRec) });
    }
    this.charts.add(samples);
    this.charts.flush();
  }

  async seek(t: number): Promise<void> {
    this.t = t;
    for (const { e, el } of this.eventItems) el.classList.toggle('passed', t >= e.t);
  }

  render(_view: ViewContext, t: number): void {
    const now = performance.now();
    this.clock += (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (!this.renderer) return;
    // CONTROLLED: no ripples, so the first light is perfectly uniform (an all-zero field).
    const { ripples } = paramsFor('hot', this.mode, { ripples: true });
    const G = this.engine.params.G;
    if (this.engine.field && !this.renderer.hasField) this.renderer.setField(ripples ? this.engine.field : new Float32Array(G * G), G);
    const T = temperatureAt(t, this.tRec);
    const start = CLEAR_FROM * this.tRec;
    const f = Math.max(0, Math.min(1, (t - start) / (this.tRec - start)));
    const fog = 1 - f * f * (3 - 2 * f);
    this.renderer.drawCmb(fog, fogColor(T), this.clock);
    // Before the earliest charted moment the formula has no physical footing: say so instead of a number.
    const tMin = eventTime('protons') / 10;
    if (this.tempEl)
      this.tempEl.textContent = t < tMin ? `> ${sci(temperatureAt(tMin, this.tRec), 0)} K (beyond tested physics)` : `≈ ${T >= 1e6 ? sci(T) : fmt(T)} K`;
    this.charts?.setCursor(Math.max(t, tMin));
    if (this.caption)
      this.caption.textContent =
        fog > 0.98 ? 'A hot, opaque soup: light cannot get through' : fog > 0.02 ? 'The fog clears…' : 'First light: the cosmic microwave background';
  }

  metrics(): Record<string, number> {
    return { temperatureK: temperatureAt(this.t, this.tRec) };
  }

  events(): TimelineEvent[] {
    return EVENTS.filter((e) => e.chapter === this.id && e.id !== 'big-bang');
  }

  dispose(): void {
    this.charts?.destroy();
    this.charts = null;
    this.root?.remove();
    this.root = null;
    this.renderer = null;
    this.eventItems = [];
  }
}
