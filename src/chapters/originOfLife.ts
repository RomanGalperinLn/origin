// Chapter 6 (SIMULATED): the driven particle simulation, driven vs control.
// The master timeline maps this chapter's real-time span linearly onto sim steps.
// The worker starts precomputing at page load; leaving the chapter only detaches
// the DOM, because recomputing the run would take minutes.

import { paramsFor, type Mode } from '../control/controlMode';
import { makeParams, PRESETS, type SimParams } from '../sim/params';
import type { MetricSample } from '../sim/metrics';
import type { FromWorker, ToWorker } from '../worker/protocol';
import { EVENTS, type TimelineEvent } from '../time/cosmic';
import type { ChapterSpan } from '../time/chapters';
import { Renderer } from '../ui/renderer';
import { Charts } from '../ui/charts';
import { ReverseOverlay } from '../ui/reverse';
import { AmbientHum } from '../ui/hum';

/** Seconds of playback between microscope moments (zoom in on a structure, hold, zoom out). */
const MICROSCOPE_EVERY = 18;
import { ChapterBase, type ViewContext } from './types';

export const TARGET_STEPS = 60_000;

const VIEW_HTML = `
  <div class="ch6-toolbar row">
    <select class="ch6-preset" title="Parameter preset"></select>
    <span class="status"><span class="ch6-step">step 0</span> · <span class="ch6-simtime">sim time 0</span></span>
    <span class="status dim ch6-compute"></span>
    <span class="spacer"></span>
    <label class="check"><input type="checkbox" class="ch6-log" /> log scale</label>
    <label class="check" title="Bonds between linked particles and an outline around each cluster; clusters with the same composition and shape share a colour"><input type="checkbox" class="ch6-highlight" checked /> show structures (same colour = same shape)</label>
    <label class="check" title="A round inset that follows a structure (one whose shape repeats, else the largest), magnified 3x"><input type="checkbox" class="ch6-magnifier" /> magnifier</label>
    <button class="ch6-hum" title="Ambient hum whose volume follows the entropy production rate (off by default)" aria-pressed="false">♪ hum</button>
    <button class="ch6-reverse" title="Flip every velocity of the driven run">⟲ Reverse time</button>
  </div>
  <div class="ch6-panels">
    <figure class="panel">
      <figcaption><b class="driven-label">DRIVEN</b> oscillating energy field on <span class="dim">(a stand-in for energy sources such as hydrothermal vents)</span></figcaption>
      <canvas class="ch6-canvas-driven"></canvas>
    </figure>
    <figure class="panel">
      <figcaption><b class="control-label">CONTROL</b> energy field off</figcaption>
      <canvas class="ch6-canvas-control"></canvas>
    </figure>
  </div>`;

const CHARTS_HTML = `
  <div class="charts">
    <div class="chart" id="chart-entropy"></div>
    <div class="chart" id="chart-energy"></div>
    <div class="chart" id="chart-order"></div>
  </div>
  <div class="legend dim"><span class="swatch driven"></span> driven <span class="swatch control"></span> control</div>`;

export class OriginOfLifeChapter extends ChapterBase {
  /** Full metric history of both runs (charts, reverse overlay, Winston). */
  readonly history: { driven: MetricSample[]; control: MetricSample[] } = { driven: [], control: [] };
  params: SimParams;
  /** Step currently requested for display. */
  step = 0;
  headStep = 0;
  active = false;

  /** Called when something happens Winston should hear about. */
  onEvent: ((text: string) => void) | null = null;
  /** Called when the preset changes (Winston resets its event memory). */
  onReset: (() => void) | null = null;

  private worker = new Worker(new URL('../worker/simWorker.ts', import.meta.url), { type: 'module' });
  private runId = 0;
  private ready = false;
  private frameInFlight = false;
  private lastShown = { step: -1, exact: false, highlight: false };
  /** Show structures (bonds, outlines, matching colours): on by default. */
  private highlight = true;
  private types: { types: Uint8Array; K: number; L: number } | null = null;

  private root: HTMLElement;
  private drivenRenderer: Renderer;
  private controlRenderer: Renderer;
  private charts: Charts | null = null;
  private chartsTimer = 0;
  private reverse = new ReverseOverlay();
  private hum = new AmbientHum();
  /** Seconds of playback in this chapter, and when the last microscope moment started. */
  private playClock = 0;
  private lastMicroscope = 0;
  private lastRender = performance.now();
  private view: ViewContext | null = null;

  constructor(span: ChapterSpan, mode: Mode = 'released') {
    super(span, mode);
    this.params = paramsFor('life', mode, makeParams(PRESETS[0].params));
    this.root = document.createElement('div');
    this.root.className = 'ch6';
    this.root.innerHTML = VIEW_HTML;
    if (mode === 'controlled') {
      // Why nothing forms here: shown under the panels in CONTROLLED mode.
      const why = document.createElement('p');
      why.className = 'why ch6-why';
      why.innerHTML = `<b>Why nothing new forms (CONTROLLED):</b> every particle starts in a neat, settled place and there is
        no thermal noise (temperature zero), so nothing is ever nudged into trying a new arrangement. The energy still flows
        in on the left, but it can only shake the crystal back and forth in place. With randomness <i>and</i> the energy flow
        (RELEASED), particles wander, meet and build larger structures; with the energy alone, they stay where we put them.`;
      this.root.appendChild(why);
      this.q('.ch6-panels figure:first-child figcaption').insertAdjacentHTML('beforeend', ' <span class="dim">· neat start, no noise</span>');
      this.q('.ch6-panels figure:last-child figcaption').insertAdjacentHTML('beforeend', ' <span class="dim">· neat start, no noise</span>');
    }
    this.drivenRenderer = new Renderer(this.q<HTMLCanvasElement>('.ch6-canvas-driven'), 1);
    this.controlRenderer = new Renderer(this.q<HTMLCanvasElement>('.ch6-canvas-control'), 2);
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onWorker(e.data);
    this.wireToolbar();
    this.reverse.onReplay = (f) => this.runReverse(f);
    this.reverse.pastEntropy = (step) => this.history.driven[Math.floor(step / this.params.metricsEvery)]?.S ?? 0;
    this.start(this.params);
  }

  private q<T extends HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T;
  }

  private send(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  /** (Re)starts the simulation with new parameters; precompute begins immediately. */
  private start(p: SimParams): void {
    this.params = p;
    this.ready = false;
    this.history.driven = [];
    this.history.control = [];
    this.lastShown = { step: -1, exact: false, highlight: false };
    this.headStep = 0;
    this.charts?.reset(this.chartWindow());
    this.runId++;
    this.send({ type: 'init', runId: this.runId, params: p, targetSteps: TARGET_STEPS });
    // CONTROLLED: the worker first lets the neat layout settle into its rest state (see initialState).
    this.q('.ch6-compute').textContent = p.settleSteps > 0 ? 'settling the designed start…' : '';
    // The driven panel's field is known from the parameters: label it right away, not only once the run is ready.
    this.drivenRenderer.field = { E0: p.E0, period: p.period, dt: p.dt, angle: p.fieldAngle };
    this.onReset?.();
  }

  private chartWindow(): number {
    const p = this.params;
    return p.period / (p.dt * p.metricsEvery);
  }

  private onWorker(msg: FromWorker): void {
    if (msg.type === 'frame') this.frameInFlight = false;
    if (msg.runId !== this.runId) return; // from before a preset change
    switch (msg.type) {
      case 'ready':
        this.types = { types: msg.types, K: msg.K, L: msg.L };
        this.drivenRenderer.setup(msg.types, msg.K, msg.L, this.params.rLink);
        this.controlRenderer.setup(msg.types, msg.K, msg.L, this.params.rLink);
        const p = this.params;
        this.drivenRenderer.field = { E0: p.E0, period: p.period, dt: p.dt, angle: p.fieldAngle };
        this.controlRenderer.field = null;
        this.reverse.setup(msg.types, msg.K, msg.L);
        this.ready = true;
        break;
      case 'metrics':
        this.history.driven.push(...msg.driven);
        this.history.control.push(...msg.control);
        this.charts?.add(msg.driven, msg.control);
        this.headStep = msg.headStep;
        this.q('.ch6-compute').textContent =
          msg.headStep < msg.targetSteps ? `computing… ${Math.round((100 * msg.headStep) / msg.targetSteps)}%` : '';
        break;
      case 'frame':
        if (!this.active) break;
        // Drawn every animation frame in render(): the renderers interpolate between frames.
        this.drivenRenderer.push(msg.driven, msg.step, msg.drivenRings, undefined, msg.drivenStructures);
        this.controlRenderer.push(msg.control, msg.step, msg.controlRings, undefined, msg.controlStructures);
        this.charts?.setCursor(msg.step);
        this.q('.ch6-step').textContent = `step ${msg.step.toLocaleString('en-GB')}`;
        this.q('.ch6-simtime').textContent = `sim time ${Math.round(msg.step * this.params.dt).toLocaleString('en-GB')}`;
        break;
      case 'branch':
        this.reverse.receive(msg);
        break;
    }
  }

  private wireToolbar(): void {
    const preset = this.q<HTMLSelectElement>('.ch6-preset');
    PRESETS.forEach((p, i) => preset.add(new Option(p.name, String(i))));
    preset.title = PRESETS[0].description;
    preset.addEventListener('change', () => {
      const p = PRESETS[Number(preset.value)];
      preset.title = p.description;
      this.reverse.close();
      this.start(paramsFor('life', this.mode, makeParams(p.params)));
    });
    this.q<HTMLInputElement>('.ch6-highlight').addEventListener('change', (e) => {
      this.highlight = (e.target as HTMLInputElement).checked;
      this.drivenRenderer.showStructures = this.controlRenderer.showStructures = this.highlight;
    });
    this.q<HTMLInputElement>('.ch6-log').addEventListener('change', (e) => {
      this.charts?.setLog((e.target as HTMLInputElement).checked);
      this.lastShown.step = -1; // redraw the cursor on the rebuilt charts
    });
    this.q('.ch6-reverse').addEventListener('click', () => this.runReverse(false));
    this.q<HTMLInputElement>('.ch6-magnifier').addEventListener('change', (e) => {
      this.drivenRenderer.magnifier = this.controlRenderer.magnifier = (e.target as HTMLInputElement).checked;
    });
    const humBtn = this.q<HTMLButtonElement>('.ch6-hum');
    humBtn.addEventListener('click', () => {
      if (this.hum.on) this.hum.stop();
      else this.hum.start();
      humBtn.setAttribute('aria-pressed', String(this.hum.on));
      humBtn.classList.toggle('on', this.hum.on);
    });
  }

  private runReverse(frictionless: boolean): void {
    this.view?.pause();
    this.reverse.open(frictionless);
    this.send({ type: 'reverse', step: this.step, frictionless });
    this.onEvent?.(
      frictionless
        ? 'The audience switched to frictionless mode: no friction, no noise, no field. The system runs 100 steps, every velocity is flipped, and it runs 100 steps back; the distance from the start returns to almost exactly zero.'
        : `The audience pressed "Reverse time" at step ${this.step}: every velocity in the driven run was flipped. With friction and the heat bath, the particles do not retrace their path; the entropy produced keeps rising and the distance from the past keeps growing.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Chapter interface

  async init(view: ViewContext): Promise<void> {
    this.view = view;
    this.active = true;
    view.main.appendChild(this.root);
    view.charts.innerHTML = CHARTS_HTML;
    this.charts = new Charts();
    this.charts.reset(this.chartWindow());
    this.charts.add(this.history.driven, this.history.control);
    this.charts.setLog(this.q<HTMLInputElement>('.ch6-log').checked);
    this.charts.flush();
    this.chartsTimer = window.setInterval(() => this.charts?.flush(), 250);
    // At T = 0 (CONTROLLED) entropy production, heat / T, is not defined: say so instead of showing a flat 0.
    if (this.params.T === 0)
      view.charts.querySelector('#chart-entropy')?.insertAdjacentHTML('beforeend', '<div class="chart-note">temperature is zero here: entropy production (heat ÷ temperature) is not defined</div>');
    this.lastShown.step = -1;
    if (this.types) this.reverse.setup(this.types.types, this.types.K, this.types.L);
  }

  private stepAt(t: number): number {
    const f = (t - this.tStart) / (this.tEnd - this.tStart);
    return Math.max(0, Math.min(TARGET_STEPS, Math.round(f * TARGET_STEPS)));
  }

  async seek(t: number): Promise<void> {
    this.step = Math.min(this.stepAt(t), this.headStep);
  }

  /** Microscope moment on cue (also used by demo mode): both panels zoom in at the same time, for a fair comparison. */
  microscope(): void {
    const now = performance.now();
    this.drivenRenderer.focus(now);
    this.controlRenderer.focus(now);
    this.lastMicroscope = this.playClock;
  }

  render(view: ViewContext, t: number): void {
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - this.lastRender) / 1000);
    this.lastRender = nowMs;
    if (view.playing) {
      this.playClock += dt;
      if (this.playClock - this.lastMicroscope >= MICROSCOPE_EVERY) this.microscope();
    }
    if (this.hum.on) {
      // Volume follows the driven run's entropy production rate, relative to its peak after the
      // start-up transient (the first two field periods), so it varies over the run.
      const i = Math.floor(this.step / this.params.metricsEvery);
      const d = this.history.driven;
      const skip = Math.ceil((2 * this.params.period) / (this.params.dt * this.params.metricsEvery));
      let peak = 1;
      for (let k = skip; k < d.length; k += 25) peak = Math.max(peak, d[k].S_dot);
      this.hum.setLevel(d[i] ? d[i].S_dot / peak : 0);
    }
    this.step = Math.min(this.stepAt(t), this.headStep);
    const exact = !view.scrubbing || this.step >= this.headStep;
    const changed =
      this.step !== this.lastShown.step || (exact && !this.lastShown.exact) || this.highlight !== this.lastShown.highlight;
    if (this.ready && !this.frameInFlight && changed) {
      this.frameInFlight = true;
      this.lastShown = { step: this.step, exact, highlight: this.highlight };
      // Structures (clusters with colours) replace the old white highlight rings.
      // Structures are always sent (the microscope and magnifier use them); the checkbox only controls drawing.
      this.send({ type: 'frame', step: this.step, exact, highlight: false, structures: true });
    }
    const now = performance.now();
    this.drivenRenderer.draw(now);
    this.controlRenderer.draw(now);
    this.reverse.tick();
  }

  counters(): { label: string; value: string }[] {
    // How much the driven run's largest structure has grown since the chapter began.
    const d = this.history.driven;
    const now = d[Math.min(d.length - 1, Math.floor(this.step / this.params.metricsEvery))];
    const grew = now && d[0] ? Math.max(0, now.largestCluster - d[0].largestCluster) : 0;
    return [{ label: 'largest structure grew by', value: `+${grew} particles` }];
  }

  metrics(): Record<string, number> {
    const i = Math.floor(this.step / this.params.metricsEvery);
    const d = this.history.driven[i];
    const c = this.history.control[i];
    if (!d || !c) return {};
    return { step: this.step, orderDriven: d.order, orderControl: c.order, clustersDriven: d.nClusters, clustersControl: c.nClusters };
  }

  events(): TimelineEvent[] {
    return EVENTS.filter((e) => e.chapter === this.id);
  }

  /** The run is computed ahead in the worker; playback can't pass the computed head. */
  availableUntil(): number {
    return this.tStart + (this.headStep / TARGET_STEPS) * (this.tEnd - this.tStart);
  }

  dispose(): void {
    this.active = false;
    this.hum.stop();
    this.q('.ch6-hum').setAttribute('aria-pressed', 'false');
    this.q('.ch6-hum').classList.remove('on');
    this.reverse.close();
    clearInterval(this.chartsTimer);
    this.charts?.destroy();
    this.charts = null;
    this.root.remove();
    this.view = null;
  }
}
