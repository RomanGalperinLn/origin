// Chapter 3 (MODELLED): a puffy cloud of stars settles into a rotating disk with
// density-wave spiral arms, a smaller galaxy falls in, and the chapter ends zoomed in on
// the neighbourhood where the Sun will form. Equations, not a gravity simulation.

import type { Mode } from '../control/controlMode';
import { AGE, EVENTS, formatWhen, type TimelineEvent } from '../time/cosmic';
import type { ChapterSpan } from '../time/chapters';
import { makeGalaxyParams, type GalaxyParams } from '../galaxy/params';
import { OUT_STRIDE, createGalaxy, galaxyAt, galaxyTiming, rotationSlowdown, sunPosition, type Galaxy, type GalaxyMetrics, type GalaxyTiming } from '../galaxy/model';
import { GalaxyRenderer } from '../ui/galaxyRenderer';
import { MiniCharts } from '../ui/miniCharts';
import { fmt } from '../ui/charts';
import { ChapterBase, type ViewContext } from './types';

/** Light-years per kiloparsec. */
const LY_PER_KPC = 3262;
/** The last fraction of the chapter zooms in on the Sun's neighbourhood. */
const ZOOM_FROM = 0.92;

interface GalaxySample extends GalaxyMetrics {
  t: number;
}

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** Chart samples, computed once per page from a smaller copy of the galaxy (counts scaled up). */
let chartSamples: GalaxySample[] | null = null;
function samplesFor(p: GalaxyParams, tm: GalaxyTiming): GalaxySample[] {
  if (chartSamples) return chartSamples;
  const small = createGalaxy({ ...p, stars: 4000, satelliteStars: 0 });
  const buf = new Float32Array(small.n * OUT_STRIDE);
  const scale = p.stars / 4000;
  chartSamples = [];
  for (let k = 0; k <= 80; k++) {
    const t = tm.tStart + ((tm.tEnd - tm.tStart) * k) / 80;
    const m = galaxyAt(small, tm, t, buf);
    chartSamples.push({ ...m, starForming: Math.round(m.starForming * scale), t });
  }
  return chartSamples;
}

export class GalaxyChapter extends ChapterBase {
  private p = makeGalaxyParams();
  private tm = galaxyTiming();
  private galaxy: Galaxy | null = null;
  private buf: Float32Array | null = null;
  private root: HTMLElement | null = null;
  private renderer: GalaxyRenderer | null = null;
  private charts: MiniCharts<GalaxySample> | null = null;
  private eventItems: { e: TimelineEvent; el: HTMLElement }[] = [];
  private els: Record<string, HTMLElement> = {};
  private drawn = { t: -1, w: 0, h: 0 };
  private t = 0;
  private last: GalaxyMetrics | null = null;
  private sunLy = Math.round((this.p.sunRadius * LY_PER_KPC) / 1000) * 1000;

  constructor(span: ChapterSpan, mode: Mode = 'released') {
    super(span, mode);
  }

  async init(view: ViewContext): Promise<void> {
    this.galaxy ??= createGalaxy(this.p);
    this.buf ??= new Float32Array(this.galaxy.n * OUT_STRIDE);
    const slow = Math.round(rotationSlowdown(this.p, this.tm));
    const sunLy = this.sunLy;
    const root = document.createElement('div');
    root.className = 'web-chapter';
    root.innerHTML = `
      <div class="web-box"><canvas class="web-canvas"></canvas><div class="web-caption"></div></div>
      <div class="web-side">
        <div class="side-title">What you are seeing</div>
        <p>A puffy, slowly turning cloud of stars and gas settles into a thin spinning disk: the Milky Way. Inner
          stars go round faster than outer ones. The spiral arms are not fixed objects but a <b>density wave</b>, like a
          traffic jam: stars drive through the arms, slow down and bunch up there, and gas squeezed in the arms forms
          bright blue stars that fade as they move on.</p>
        <div class="web-stats">
          <div><span class="dim">disk thickness</span> <b class="g-thick">0</b></div>
          <div><span class="dim">young star regions</span> <b class="g-sf">0</b></div>
          <div><span class="dim">turns at Sun's distance</span> <b class="g-turns">0</b></div>
          <div><span class="dim">spiral arms</span> <b class="g-arms">0%</b></div>
        </div>
        <ul class="side-events"></ul>
        <p class="dim small">MODELLED: a picture built from equations, not a simulation of gravity. Real ingredients:
          a flat rotation curve (${this.p.v0} km/s), so inner stars lap outer ones; a two-armed spiral density wave with a
          ${this.p.pitchDeg}° pitch turning at ${this.p.patternSpeed} km/s per kiloparsec; disk and bulge sizes like the
          Milky Way's. The rotation is drawn about ${slow}× slower than real (at the Sun's distance the disk really turned
          about ${Math.round(this.p.visualTurns * slow)} times in this chapter). The real Milky Way also has a central
          bar and minor arms. When the disk settled is debated. The Sun's mark is where it sits today, about
          ${sunLy.toLocaleString('en-GB')} light-years out; it may have formed closer in and drifted.</p>
      </div>`;
    view.main.appendChild(root);
    this.root = root;
    for (const k of ['thick', 'sf', 'turns', 'arms']) this.els[k] = root.querySelector(`.g-${k}`)!;
    this.els.caption = root.querySelector('.web-caption')!;
    const list = root.querySelector('.side-events')!;
    this.eventItems = this.events().map((e) => {
      const li = document.createElement('li');
      li.innerHTML = `<b>${e.label}</b><span class="dim">${formatWhen(e.t)} · ${e.cosmicCalendar}</span>`;
      li.title = e.note;
      list.appendChild(li);
      return { e, el: li };
    });
    this.renderer = new GalaxyRenderer(root.querySelector('.web-canvas') as HTMLCanvasElement);

    this.charts = new MiniCharts<GalaxySample>(
      view.charts,
      [
        { title: 'Disk thickness (kpc, RMS height)', value: (m) => m.thickness },
        { title: 'Young star-forming regions', value: (m) => m.starForming },
        { title: 'Spiral-arm strength (%)', value: (m) => 100 * m.arms },
      ],
      { x: (m) => m.t, xLabel: (v) => `${fmt(AGE - v)} ya`, mainColor: '#8fb8ff', control: false },
    );
    this.charts.add(samplesFor(this.p, this.tm));
    this.charts.flush();
    this.drawn = { t: -1, w: 0, h: 0 };
  }

  async seek(t: number): Promise<void> {
    this.t = t;
    for (const { e, el } of this.eventItems) el.classList.toggle('passed', t >= e.t);
  }

  render(_view: ViewContext, t: number): void {
    if (!this.renderer || !this.galaxy || !this.buf) return;
    const canvas = this.renderer.canvas;
    const d = this.drawn;
    if (t === d.t && canvas.clientWidth === d.w && canvas.clientHeight === d.h) return;
    this.drawn = { t, w: canvas.clientWidth, h: canvas.clientHeight };

    const tm = this.tm;
    const m = galaxyAt(this.galaxy, tm, t, this.buf);
    this.last = m;
    const progress = (t - tm.tStart) / (tm.tEnd - tm.tStart);
    // Camera: start fairly edge-on (to see the cloud flatten), tilt toward face-on as the arms grow,
    // then zoom in on the Sun's neighbourhood at the very end.
    const settle = smooth((t - tm.tStart) / (tm.armsFull - tm.tStart));
    const inclination = ((70 - 48 * settle) * Math.PI) / 180;
    const zoom = smooth((progress - ZOOM_FROM) / (1 - ZOOM_FROM));
    const sun = sunPosition(this.p, tm, t);
    const ci = Math.cos(inclination);
    const radius = 17 * Math.pow(6 / 17, zoom);
    this.renderer.draw(this.buf, this.galaxy.n, {
      inclination,
      radius,
      cx: sun[0] * zoom,
      cy: sun[1] * ci * zoom,
      sun,
      sunAlpha: smooth((progress - 0.8) / 0.08),
      sunLabel: 'Where the Sun will form',
    });

    this.charts?.setCursor(t);
    const kpcLy = Math.round((m.thickness * LY_PER_KPC) / 100) * 100;
    this.els.thick.textContent = `${m.thickness.toFixed(2)} kpc (${kpcLy.toLocaleString('en-GB')} ly)`;
    this.els.sf.textContent = String(m.starForming);
    this.els.turns.textContent = m.turnsAtSun.toFixed(1);
    this.els.arms.textContent = `${Math.round(100 * m.arms)}%`;
    this.els.caption.textContent = this.caption(t, zoom);
  }

  private caption(t: number, zoom: number): string {
    const tm = this.tm;
    if (zoom > 0.05) return `Our Sun's neighbourhood, about ${this.sunLy.toLocaleString('en-GB')} light-years from the centre`;
    if (t >= tm.mergerStart && t < tm.mergerEnd) return 'A smaller galaxy falls in and is torn apart (Gaia-Enceladus)';
    if (t < tm.mergerStart) return 'A puffy, slowly turning cloud of young stars and gas';
    if (t < tm.armsStart) return 'Gas settles into a thinner, spinning disk';
    if (t < tm.armsFull) return 'Spiral arms appear: a density wave, like a traffic jam';
    return 'Stars drive through the arms; gas squeezed there forms bright blue stars';
  }

  counters(): { label: string; value: string }[] {
    // The disk counts as a galaxy once it has settled thin (the model's disk-formation dates).
    return [{ label: 'galaxies formed', value: this.last && this.last.thickness < 1 ? '1' : '0' }];
  }

  metrics(): Record<string, number> {
    const m = this.last;
    return m ? { diskThicknessKpc: m.thickness, starFormingRegions: m.starForming, turnsAtSun: m.turnsAtSun, armStrength: m.arms } : {};
  }

  events(): TimelineEvent[] {
    return EVENTS.filter((e) => e.chapter === this.id);
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
