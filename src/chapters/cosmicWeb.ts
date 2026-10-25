// Chapter 2 (SIMULATED): gravity turns the first light's tiny ripples into a web of
// filaments and clumps, where the first stars ignite. 2D particle-mesh N-body in an
// expanding box (qualitative: 2D). Toggle "no ripples" for the control: nothing forms.

import { paramsFor, type Mode } from '../control/controlMode';
import { EVENTS, eventTime, formatAge, type TimelineEvent } from '../time/cosmic';
import type { ChapterSpan } from '../time/chapters';
import type { CosmoMetrics } from '../cosmo/pm';
import type { CosmoRun } from '../cosmo/protocol';
import { WebRenderer } from '../ui/webRenderer';
import { MiniCharts } from '../ui/miniCharts';
import { fmt } from '../ui/charts';
import type { CosmoEngine, CosmoFrame } from './cosmoEngine';
import { ChapterBase, type ViewContext } from './types';

/** The CMB overlay fades out over the chapter's first steps (a = 1 -> 3). */
const CMB_FADE_A = 3;

export class CosmicWebChapter extends ChapterBase {
  private root: HTMLElement | null = null;
  private renderer: WebRenderer | null = null;
  private charts: MiniCharts<CosmoMetrics> | null = null;
  private run: CosmoRun = 'ripples';
  /** The run this mode shows: with ripples (RELEASED) or the perfectly smooth grid (CONTROLLED). */
  private readonly baseRun: CosmoRun;
  private step = 0;
  private lastFrame: CosmoFrame | null = null;
  /** What was last drawn, so identical frames aren't redrawn. */
  private drawn = { frame: null as CosmoFrame | null, cmb: -1, w: 0, h: 0 };
  private els: Record<string, HTMLElement> = {};
  /** Set on (re)entry: the first frame request must go out even if it repeats the last one. */
  private needFrame = true;

  constructor(
    span: ChapterSpan,
    private engine: CosmoEngine,
    mode: Mode = 'released',
  ) {
    super(span, mode);
    this.baseRun = paramsFor('web', mode, { run: 'ripples' as CosmoRun }).run;
    this.run = this.baseRun;
  }

  async init(view: ViewContext): Promise<void> {
    const root = document.createElement('div');
    root.className = 'web-chapter';
    const range = eventTime('first-stars', 'earliest');
    const range2 = eventTime('first-stars', 'latest');
    root.innerHTML = `
      <div class="web-box"><canvas class="web-canvas"></canvas><div class="web-caption"></div></div>
      <div class="web-side">
        <div class="side-title">What you are seeing</div>
        ${this.baseRun === 'smooth'
          ? `<p class="why"><b>Why nothing forms (CONTROLLED):</b> every parcel of matter starts on a perfect grid, exactly
          evenly spaced. Each one is pulled equally from every side, so the pulls cancel: nothing moves toward anything,
          no region gets denser, and no gas ever becomes dense enough to light a star. In the released universe tiny
          random ripples break this balance and gravity deepens them; here there are none to deepen.</p>`
          : `<p>The glow shows where matter is: brighter means denser. The tiny ripples in the first light are slightly
          denser regions (drawn blue: light climbing out of them loses a little energy, so they look slightly colder).
          Gravity pulls matter toward them while the universe expands, so dense regions get denser and
          empty regions emptier: a web of filaments and clumps. Where gas gets dense enough, the first stars
          ignite (the bright points).</p>
        <label class="check web-toggle"><input type="checkbox" class="web-smooth" /> No ripples (control): a perfectly smooth start</label>`}
        <div class="web-stats">
          <div><span class="dim">scale factor a</span> <b class="w-a">1</b></div>
          <div><span class="dim">structure σ²(δ)</span> <b class="w-s">0</b></div>
          <div><span class="dim">stars</span> <b class="w-n">0</b></div>
          <div><span class="dim">largest clump</span> <b class="w-c">0%</b></div>
        </div>
        <p class="dim small">2D gravity in an expanding box: the mechanism is real, the picture is qualitative.
          ${this.baseRun === 'smooth'
            ? 'Same gravity code and expansion as the released run; only the ripples are removed.'
            : `The ripple amplitude was tuned so the first star ignites ${formatAge(range).replace(' years', '')}–${formatAge(range2)}
          after the Big Bang, the range astronomers estimate.`} <span class="w-first"></span></p>
      </div>`;
    view.main.appendChild(root);
    this.root = root;
    for (const k of ['a', 's', 'n', 'c', 'first']) this.els[k] = root.querySelector(`.w-${k}`)!;
    this.renderer = new WebRenderer(root.querySelector('.web-canvas') as HTMLCanvasElement);
    const G = this.engine.params.G;
    if (this.engine.field) this.renderer.setField(this.baseRun === 'ripples' ? this.engine.field : new Float32Array(G * G), G);
    const toggle = root.querySelector('.web-smooth') as HTMLInputElement | null;
    if (toggle) toggle.checked = this.run === 'smooth';
    toggle?.addEventListener('change', (e) => {
      this.run = (e.target as HTMLInputElement).checked ? 'smooth' : 'ripples';
      this.lastFrame = null;
      this.engine.requestFrame(this.step, this.run, true);
    });

    this.charts = new MiniCharts<CosmoMetrics>(
      view.charts,
      [
        { title: 'Structure σ²(δ)', value: (m) => m.sigma2, logY: true },
        { title: 'Stars', value: (m) => m.nStars },
        { title: 'Largest clump (% of mass)', value: (m) => 100 * m.largestClump },
      ],
      this.baseRun === 'smooth'
        ? { x: (m) => m.t / 1e6, logX: true, xLabel: (v) => `${fmt(v)} Myr`, mainColor: '#9aa8bd', control: false }
        : { x: (m) => m.t / 1e6, logX: true, xLabel: (v) => `${fmt(v)} Myr`, mainColor: '#c79bff', legend: ['with ripples', 'no ripples (stays at zero)'] },
    );
    // CONTROLLED shows only its own (smooth) run.
    if (this.baseRun === 'smooth') {
      this.charts.add(this.engine.history.smooth);
      this.engine.onMetrics = (_r, s) => this.charts?.add(s);
    } else {
      this.charts.add(this.engine.history.ripples, this.engine.history.smooth);
      this.engine.onMetrics = (r, s) => this.charts?.add(r, s);
    }
    this.engine.onFrame = (f) => {
      if (f.run === this.run) this.lastFrame = f;
    };
    // The first render() requests the frame for the current time (not the previous visit's step).
    this.needFrame = true;
  }

  async seek(t: number): Promise<void> {
    this.step = this.engine.stepAt(t);
  }

  render(_view: ViewContext, t: number): void {
    if (!this.renderer) return;
    this.step = this.engine.stepAt(t);
    if (this.engine.requestFrame(this.step, this.run, this.needFrame)) this.needFrame = false;
    if (this.engine.field && !this.renderer.hasField)
      this.renderer.setField(this.baseRun === 'ripples' ? this.engine.field : new Float32Array(this.engine.params.G ** 2), this.engine.params.G);
    const f = this.lastFrame;
    const shown = f ? f.step : 0;
    const a = Math.pow(this.engine.timeAt(shown) / this.engine.params.tStart, 2 / 3);
    const cmbAlpha = this.run === 'ripples' ? Math.max(0, 1 - Math.log(a) / Math.log(CMB_FADE_A)) * 0.85 : 0;
    const canvas = this.renderer.canvas;
    const d = this.drawn;
    if (f && (f !== d.frame || cmbAlpha !== d.cmb || canvas.clientWidth !== d.w || canvas.clientHeight !== d.h)) {
      this.renderer.drawWeb(f.pos, f.stars, cmbAlpha);
      this.drawn = { frame: f, cmb: cmbAlpha, w: canvas.clientWidth, h: canvas.clientHeight };
    }
    this.charts?.setCursor(this.engine.timeAt(shown) / 1e6);

    const m = this.engine.metricAt(this.run, shown);
    if (m) {
      this.els.a.textContent = m.a.toFixed(1);
      this.els.s.textContent = m.sigma2 === 0 ? '0' : m.sigma2 < 0.01 ? m.sigma2.toExponential(1) : m.sigma2.toFixed(2);
      this.els.n.textContent = String(m.nStars);
      this.els.c.textContent = `${(100 * m.largestClump).toFixed(1)}%`;
    }
    const first = this.engine.history[this.baseRun].find((x) => x.nStars > 0);
    this.els.first.textContent = first ? `In this run the first star ignites about ${formatAge(first.t)} after the Big Bang.` : '';
    const caption = this.root?.querySelector('.web-caption');
    if (caption)
      caption.textContent =
        this.run === 'smooth'
          ? 'No ripples: perfectly smooth matter has nothing to fall toward. Nothing forms.'
          : cmbAlpha > 0.05
            ? 'The ripples in the first light are the seeds…'
            : m && m.nStars > 0
              ? 'The first stars ignite in the densest knots of the web'
              : 'Gravity grows the ripples into a web';
    if (this.engine.headStep < this.engine.params.steps)
      this.els.first.textContent = `computing… ${Math.round((100 * this.engine.headStep) / this.engine.params.steps)}%`;
    // Dragged ahead of the background run: say which moment is actually on screen.
    if (caption && this.step > this.engine.headStep)
      caption.textContent = `Still computing: showing ${formatAge(this.engine.timeAt(shown))} after the Big Bang`;
  }

  counters(): { label: string; value: string }[] {
    const m = this.engine.metricAt(this.run, this.lastFrame ? this.lastFrame.step : 0);
    return [{ label: 'stars formed', value: String(m?.nStars ?? 0) }];
  }

  metrics(): Record<string, number> {
    const m = this.engine.metricAt(this.run, this.step);
    return m ? { scaleFactor: m.a, structureVariance: m.sigma2, stars: m.nStars, largestClumpPercent: 100 * m.largestClump } : {};
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
    this.drawn = { frame: null, cmb: -1, w: 0, h: 0 };
  }
}
