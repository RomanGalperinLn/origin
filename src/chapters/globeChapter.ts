// Chapters that show the Earth globe (RECONSTRUCTED surface):
//   5 Young Earth  - globe + what is happening now
//   7 Evolution    - lineage morph + toy selection model + globe + trees (EvolutionChapter fills the slots)
//   8 Humans       - globe + milestones, population chart
// The globe itself is shared (one WebGL context); each chapter mounts it in its own layout.

import type { Mode } from '../control/controlMode';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { AGE, EVENTS, PRESENT_YEAR, eventTime, formatWhen, type TimelineEvent } from '../time/cosmic';
import type { ChapterSpan } from '../time/chapters';
import { getGlobe, type Globe } from '../globe/globe';
import type { SurfaceState } from '../globe/keyframes';
import { POPULATION_POINTS, populationAt } from '../globe/population';
import { fmt, TITLE_H } from '../ui/charts';
import { ChapterBase, type ViewContext } from './types';

type Layout = 'earth' | 'evolution' | 'humans';

const EARTH_FORMS = eventTime('earth-forms');

/** Bars under the globe: the reconstructed surface state, so the audience can read it as numbers too. */
const BARS: { label: string; value: (s: SurfaceState) => number; color: string }[] = [
  { label: 'Molten surface', value: (s) => s.lava, color: '#ff7a2f' },
  { label: 'Oceans', value: (s) => s.ocean, color: '#3a8fd6' },
  { label: 'Continents', value: (s) => s.land / 0.3, color: '#b08a5a' },
  { label: 'Blue sky (oxygen)', value: (s) => (s.atmo[2] - 0.32) / (1 - 0.32), color: '#6fa8ff' },
  { label: 'Ice', value: (s) => s.ice, color: '#dfe9f2' },
  { label: 'Plants on land', value: (s) => s.veg / 0.65, color: '#4fae4a' },
  { label: 'City lights', value: (s) => s.city, color: '#ffc04d' },
];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class GlobeChapter extends ChapterBase {
  private globe: Globe | null = null;
  protected root: HTMLElement | null = null;
  private bars: HTMLElement[] = [];
  private eventItems: { e: TimelineEvent; el: HTMLElement }[] = [];
  private caption: HTMLElement | null = null;
  private popPlot: uPlot | null = null;
  private popCursor: HTMLElement | null = null;
  private popReadout: HTMLElement | null = null;
  private lastFrame = performance.now();
  private t = 0;

  constructor(
    span: ChapterSpan,
    private layout: Layout,
    mode: Mode = 'released',
  ) {
    super(span, mode);
  }

  async init(view: ViewContext, seed: number): Promise<void> {
    this.globe = getGlobe(seed);
    const root = document.createElement('div');
    root.className = `globe-chapter layout-${this.layout}`;
    const globeBox = `<div class="globe-box"><span class="badge kind-RECONSTRUCTED globe-badge">RECONSTRUCTED</span><div class="globe-host"></div><div class="globe-caption"></div></div>`;
    const events = `<div class="globe-side"><div class="side-title">${this.layout === 'humans' ? 'Milestones' : 'Dated events'}</div><ul class="side-events"></ul></div>`;
    if (this.layout === 'evolution') {
      // Empty slots: EvolutionChapter mounts the lineage stage, the toy simulation and the tree panel.
      root.innerHTML = `<div class="evo-main"><div class="lineage-host"></div><div class="evo-sim"></div></div><div class="evo-right">${globeBox}<div class="evo-tree"></div></div>`;
    } else {
      root.innerHTML = globeBox + events;
    }
    view.main.appendChild(root);
    this.root = root;
    this.caption = root.querySelector('.globe-caption');
    this.globe.mount(root.querySelector('.globe-host') as HTMLElement);

    const list = root.querySelector('.side-events');
    this.eventItems = list
      ? this.events().map((e) => {
          const li = document.createElement('li');
          li.innerHTML = `<b>${e.label}</b><span class="dim">${formatWhen(e.t)} · ${e.cosmicCalendar}</span>`;
          li.title = e.note;
          list.appendChild(li);
          return { e, el: li };
        })
      : [];

    // Bottom-left: surface bars and, for humans, the population chart (evolution draws its own charts).
    if (this.layout === 'evolution') {
      this.lastFrame = performance.now();
      return;
    }
    view.charts.innerHTML = `
      <div class="globe-charts">
        ${this.layout === 'humans' ? '<div class="chart pop-chart"></div>' : ''}
        <div class="surface-bars">
          <div class="side-title">Surface (reconstructed from dated events)</div>
          ${BARS.map((b) => `<div class="bar-row"><span>${b.label}</span><div class="bar"><div style="background:${b.color}"></div></div></div>`).join('')}
        </div>
      </div>`;
    this.bars = [...view.charts.querySelectorAll<HTMLElement>('.bar > div')];
    if (this.layout === 'humans') this.buildPopulationChart(view.charts.querySelector('.pop-chart') as HTMLElement);
    this.lastFrame = performance.now();
  }

  private buildPopulationChart(host: HTMLElement): void {
    // x = years ago (+10 so today fits on a log axis), drawn right-to-left so time runs left to right.
    const pts = [...POPULATION_POINTS].reverse();
    const x = pts.map((p) => PRESENT_YEAR - p.year + 10);
    const y = pts.map((p) => p.population);
    this.popPlot = new uPlot(
      {
        title: 'World population (log scale)',
        width: host.clientWidth,
        height: host.clientHeight - TITLE_H,
        legend: { show: false },
        cursor: { show: false },
        scales: { x: { time: false, distr: 3, dir: -1, range: [10, 12100] }, y: { distr: 3, range: [2e6, 1.2e10] } },
        axes: [
          {
            stroke: '#8a90a2',
            grid: { stroke: '#1c2130' },
            size: 24,
            font: '10px system-ui',
            // Ticks at today, 100, 1,000 and 10,000 years ago only (log axes otherwise tick every minor step).
            splits: () => [10, 110, 1010, 10010],
            values: (_u, v) => v.map((x) => (x <= 10 ? 'today' : `${fmt(x - 10)} yrs ago`)),
          },
          {
            stroke: '#8a90a2',
            grid: { stroke: '#1c2130' },
            size: 40,
            font: '10px system-ui',
            splits: () => [1e7, 1e8, 1e9, 1e10],
            values: (_u, v) => v.map(fmt),
          },
        ],
        series: [{}, { stroke: '#ffc04d', width: 2, points: { show: true, size: 4 } }],
      },
      [x, y],
      host,
    );
    this.popCursor = document.createElement('div');
    this.popCursor.className = 'here-line';
    this.popPlot.over.appendChild(this.popCursor);
    this.popReadout = document.createElement('div');
    this.popReadout.className = 'pop-readout';
    host.appendChild(this.popReadout);
  }

  async seek(t: number): Promise<void> {
    this.t = t;
    // Continents slowly re-shape over billions of years (visual stand-in for drift).
    this.globe?.setTime(t, ((t - EARTH_FORMS) / 1e9) * 0.8);
    if (this.caption) this.caption.textContent = this.globe?.label ?? '';
    for (const { e, el } of this.eventItems) el.classList.toggle('passed', t >= e.t);
    if (this.popPlot && this.popCursor && this.popReadout) {
      const ago = AGE - t;
      const year = PRESENT_YEAR - ago;
      const inData = year >= POPULATION_POINTS[0].year;
      const px = this.popPlot.valToPos(ago + 10, 'x');
      this.popCursor.style.display = inData && Number.isFinite(px) ? 'block' : 'none';
      this.popCursor.style.transform = `translateX(${px}px)`;
      this.popReadout.textContent = inData ? `≈ ${fmt(populationAt(year))} people` : 'before the data (10,000 BCE)';
    }
  }

  render(_view?: ViewContext, _t?: number): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (!this.globe) return;
    this.globe.render(dt);
    const s = this.globe.state;
    BARS.forEach((b, i) => {
      if (this.bars[i]) this.bars[i].style.width = `${100 * clamp01(b.value(s))}%`;
    });
  }

  metrics(): Record<string, number> {
    if (!this.globe) return {};
    const s = this.globe.state;
    const m: Record<string, number> = {};
    BARS.forEach((b) => (m[b.label] = Math.round(100 * clamp01(b.value(s))) / 100));
    if (this.layout === 'humans') m.worldPopulation = Math.round(populationAt(PRESENT_YEAR - (AGE - this.t)));
    return m;
  }

  /** Events whose date (or date range) overlaps this chapter, including ones on its edges. */
  events(): TimelineEvent[] {
    return EVENTS.filter((e) => {
      const [a, b] = e.tRange ?? [e.t, e.t];
      return b >= this.tStart && a <= this.tEnd && e.id !== 'today';
    });
  }

  dispose(): void {
    this.globe?.unmount();
    this.popPlot?.destroy();
    this.popPlot = null;
    this.root?.remove();
    this.root = null;
    this.eventItems = [];
    this.bars = [];
  }
}
