// Chapter 7: from cells to humans.
//  7a (SIMULATED, the first part of the chapter): a toy model of natural selection, full
//     screen, so the audience sees how selection works. Real dates (oxygen, Snowball Earth,
//     Cambrian, extinctions) drive its environment; a no-oxygen control runs alongside.
//  7b (RECONSTRUCTED, the rest): our own lineage as one creature morphing through 24 key
//     stages (dates in lineage.json), with living cousins branching off on a family tree.
//     The toy model shrinks into a corner and keeps running; the globe shows Earth events.

import type { Mode } from '../control/controlMode';
import { CHAPTERS, chapterProgress, type ChapterSpan } from '../time/chapters';
import { STAGES, lineageStateAt, stagePositions, type LineageState, type Stage } from '../lineage/timeline';
import { LineageStage } from '../ui/lineageStage';
import { FamilyTree } from '../ui/familyTree';
import { BrainChart, type BrainEntry } from '../ui/brainChart';
import brainData from '../data/brainSize.json';
import { NARRATION, type NarrationLine } from '../lineage/narration';
import { SEL_SHARE } from '../lineage/timeline';

/** The last part of the chapter hands over to chapter 8: the stage fades, the globe comes forward. */
const HANDOFF_FROM = 0.985;
/** The closing line triggers here, so it is read before chapter 8 takes over. */
const NARRATION_END = 0.975;
/** A newer line replaces the one showing once it has been up this long (keeps text in step with the picture). */
const MIN_SHOW_MS = 2000;
import { formatYearsAgo } from '../time/cosmic';
import { environmentAt, type EvoMetrics } from '../evo/world';
import { FRAME_STRIDE, type EvoRun } from '../evo/protocol';
import { EvoRenderer } from '../ui/evoRenderer';
import { TreeOfLife } from '../ui/treeOfLife';
import { MiniCharts } from '../ui/miniCharts';
import { fmt } from '../ui/charts';
import { AGE } from '../time/cosmic';
import { GlobeChapter } from './globeChapter';
import type { EvoEngine, EvoFrame } from './evoEngine';
import type { ViewContext } from './types';

/** Steps after a mass extinction during which the caption names it. */
const EXTINCTION_CAPTION_STEPS = 400;

export class EvolutionChapter extends GlobeChapter {
  private renderer: EvoRenderer | null = null;
  private treeView: TreeOfLife | null = null;
  private charts: MiniCharts<EvoMetrics> | null = null;
  private run: EvoRun = 'oxygen';
  private step = 0;
  private evoFrame: EvoFrame | null = null;
  private drawnFrame: EvoFrame | null = null;
  private drawnTree = { step: -1, nodes: -1, w: 0, h: 0 };
  private needFrame = true;
  private els: Record<string, HTMLElement> = {};
  private stage: LineageStage | null = null;
  private positions = stagePositions();
  private chapterIndex = CHAPTERS.findIndex((c) => c.id === 'evolution');
  private lineage: LineageState = { i: 0, u: 0, raw: 0, selection: true };
  private main: HTMLElement | null = null;
  private familyTree: FamilyTree | null = null;
  private brain: BrainChart | null = null;
  /** Bottom charts: the toy model's charts, or (from the first primates on) brain size. */
  private chartsMode: 'evo' | 'brain' | null = null;
  private view: ViewContext | null = null;
  /** Narration: where each line triggers (fraction through the chapter), the queue, what is showing. */
  private prevF = -1;
  private queue: { line: NarrationLine; at: number }[] = [];
  private showing: { line: NarrationLine; shownAt: number; until: number } | null = null;
  private subtitle: HTMLElement | null = null;
  /** Pre-generated clips: id -> the text it was recorded from (played only if it still matches). */
  private audioText: Map<string, string> | null = null;
  private audio: HTMLAudioElement | null = null;

  constructor(
    span: ChapterSpan,
    private engine: EvoEngine,
    mode: Mode = 'released',
  ) {
    super(span, 'evolution', mode);
  }

  async init(view: ViewContext, seed: number): Promise<void> {
    await super.init(view, seed);
    const root = this.root!;
    const sim = root.querySelector('.evo-sim') as HTMLElement;
    sim.innerHTML = `
      <div class="evo-stage">
        <canvas class="evo-canvas"></canvas>
        <span class="badge kind-SIMULATED evo-badge">SIMULATED · toy model</span>
        <div class="evo-caption"></div>
      </div>
      <div class="evo-panel">
        <div class="evo-env">
          <div class="bar-row"><span>Oxygen (vs today)</span><div class="bar"><div class="e-oxygen" style="background:#6fa8ff"></div></div></div>
          <div class="bar-row"><span>Food supply</span><div class="bar"><div class="e-food" style="background:#78dc6e"></div></div></div>
        </div>
        <div class="evo-stats">
          <div><span class="dim">organisms</span> <b class="e-pop">0</b></div>
          <div><span class="dim">species</span> <b class="e-sp">1</b></div>
          <div><span class="dim">mean segments</span> <b class="e-seg">1</b></div>
          <div><span class="dim">predators</span> <b class="e-pred">0%</b></div>
        </div>
        <label class="check"><input type="checkbox" class="evo-control" /> Control: oxygen never rises</label>
        ${this.mode === 'controlled' ? `<p class="why"><b>Why nothing evolves (CONTROLLED):</b> every creature starts identical and
          nothing ever mutates. Selection can only keep the better of different variants; with no differences there is
          nothing to choose between. The population can grow, but it never changes: one species of single cells, forever.</p>` : ''}
        <p class="dim small">A toy model of selection, not real species: genes for size, speed, senses, metabolism,
          colour, body segments and diet; mutation and competition for food do the rest (predators, red rims, can evolve
          but are rare). Only the dates are real: oxygen rises, Snowball Earth, the Cambrian and two mass extinctions
          (90% and 75% of species wiped out, chosen at random) come from the facts table. Extra segments need oxygen, so
          complex bodies only pay off once it rises. The model gets more steps per million years toward the present
          (the slider is logarithmic), so the shape of its curves over time is not to scale; numbers are capped at
          ${this.engine.params.maxPopulation.toLocaleString('en-GB')} organisms. <span class="e-status"></span></p>
      </div>`;
    const tree = root.querySelector('.evo-tree') as HTMLElement;
    tree.innerHTML = `
      <div class="sim-tree">
        <div class="tree-head"><span class="side-title">Tree of life: the model's own lineages (oxygen run)</span><span class="dim tree-count"></span></div>
        <canvas class="tree-canvas"></canvas>
      </div>
      <div class="family-tree-host"></div>`;
    this.main = root.querySelector('.evo-main');
    this.stage = new LineageStage(root.querySelector('.lineage-host') as HTMLElement, STAGES, (st: Stage) => this.when(st));
    if (this.mode === 'controlled') {
      root.classList.add('controlled');
      const card = document.createElement('div');
      card.className = 'lineage-controlled';
      card.innerHTML = `<span class="badge kind-ILLUSTRATION">ILLUSTRATION</span>
        <h3>No variation, no evolution. The model stops here.</h3>
        <p class="dim">Every creature is identical and nothing mutates, so selection has nothing to choose from: the first cell is where the story ends.</p>`;
      root.querySelector('.lineage-host')!.appendChild(card);
      root.querySelector('.evo-right')!.insertAdjacentHTML('beforeend', '<p class="why controlled-noearth">No Earth in the controlled universe (no stars, no planets), so there is no globe and no family tree: the toy model on the left runs on its own.</p>');
    }
    this.familyTree = new FamilyTree(root.querySelector('.family-tree-host') as HTMLElement, STAGES, this.span.knots!, (ago) => `about ${formatYearsAgo(AGE - ago)}`);
    this.view = view;
    this.chartsMode = null; // the first render builds whichever charts fit the current time
    this.subtitle = document.createElement('div');
    this.subtitle.className = 'narration';
    this.main!.appendChild(this.subtitle);
    this.prevF = -2; // set on the first render
    this.queue = [];
    this.showing = null;
    // Pre-generated narration audio, if it has been generated (npm run narration).
    if (this.audioText === null)
      fetch('/narration/evolution/manifest.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => (this.audioText = new Map(m ? (m.lines as { id: string; text: string }[]).map((l) => [l.id, l.text]) : [])))
        .catch(() => (this.audioText = new Map()));
    for (const k of ['oxygen', 'food', 'pop', 'sp', 'seg', 'pred', 'status']) this.els[k] = root.querySelector(`.e-${k}`)!;
    this.els.caption = root.querySelector('.evo-caption')!;
    this.els.treeCount = root.querySelector('.tree-count')!;
    this.renderer = new EvoRenderer(root.querySelector('.evo-canvas') as HTMLCanvasElement);

    const sc = this.engine.params.schedule;
    const extinctLabel: Record<string, string> = { 'end-permian': 'End-Permian', 'end-cretaceous': 'End-Cretaceous' };
    this.treeView = new TreeOfLife(root.querySelector('.tree-canvas') as HTMLCanvasElement, this.engine.params.steps, [
      { step: sc.goe[0], end: sc.goe[1], label: 'O₂ appears', color: '#6fa8ff' },
      { step: sc.snowball[0], end: sc.snowball[1], label: 'Snowball', color: '#dfe9f2' },
      { step: sc.noe[0], end: sc.noe[1], label: 'O₂ rises', color: '#6fa8ff' },
      { step: sc.cambrian, label: 'Cambrian', color: '#78dc6e' },
      ...sc.extinctions.map((e) => ({ step: e.step, label: extinctLabel[e.id] ?? e.id, color: '#ff6b6b' })),
    ].sort((a, b) => a.step - b.step));

    const toggle = root.querySelector('.evo-control') as HTMLInputElement;
    toggle.checked = this.run === 'control';
    toggle.addEventListener('change', () => {
      this.run = toggle.checked ? 'control' : 'oxygen';
      this.evoFrame = null;
      this.engine.requestFrame(this.step, this.run, true);
    });

    this.engine.onMetrics = (o, c) => this.charts?.add(o, c);
    this.engine.onFrame = (f) => {
      if (f.run === this.run) this.evoFrame = f;
    };
    this.needFrame = true;
  }

  private buildEvoCharts(view: ViewContext): void {
    this.charts = new MiniCharts<EvoMetrics>(
      view.charts,
      [
        { title: 'Complexity (mean body segments)', value: (m) => m.meanSegments },
        { title: 'Species', value: (m) => m.species },
        { title: 'Organisms', value: (m) => m.population },
      ],
      {
        x: (m) => m.step,
        xLabel: (v) => `${fmt(AGE - this.engine.timeAt(v))} ya`,
        mainColor: '#78dc6e',
        legend: ['oxygen rises (real dates)', 'control: oxygen never rises'],
      },
    );
    this.charts.add(this.engine.history.oxygen, this.engine.history.control);
  }

  /** Swaps the bottom charts when the lineage reaches (or goes back before) the first primates. */
  private setChartsMode(mode: 'evo' | 'brain'): void {
    if (mode === this.chartsMode || !this.view) return;
    this.chartsMode = mode;
    this.charts?.destroy();
    this.charts = null;
    this.brain?.destroy();
    this.brain = null;
    if (mode === 'brain') this.brain = new BrainChart(this.view.charts, brainData.entries as BrainEntry[]);
    else this.buildEvoCharts(this.view);
  }

  async seek(t: number): Promise<void> {
    await super.seek(t);
    this.step = this.engine.stepAt(t);
    this.lineage = lineageStateAt(chapterProgress(this.chapterIndex, t), this.positions);
  }

  /** Where a narration line triggers, as a fraction through the chapter. */
  private triggerAt(line: NarrationLine): number {
    if (line.at === 'chapter') return 0;
    if (line.at === 'lineage') return SEL_SHARE;
    if (line.at === 'end') return NARRATION_END;
    // A stage's line starts where its name appears on screen: halfway from the previous key frame,
    // where the stage label switches to the stage being approached. Label and subtitle change together.
    const k = STAGES.findIndex((s) => s.id === line.at);
    if (k < 0) return 2;
    return k === 0 ? this.positions[0] : (this.positions[k - 1] + this.positions[k]) / 2;
  }

  /** Queues lines whose trigger the slider just passed moving forward, and shows them one at a time as subtitles. */
  private narrate(f: number): void {
    // CONTROLLED: the milestone narration describes a lineage that never happens; the mode line is used instead.
    if (this.mode === 'controlled') return;
    const now = performance.now();
    if (this.prevF === -2) this.prevF = f < 0.01 ? -1 : f; // entering at the start: play the opening lines
    if (f > this.prevF && f - this.prevF < 0.08)
      for (const line of NARRATION) {
        const at = this.triggerAt(line);
        if (at > this.prevF && at <= f) this.queue.push({ line, at: now + (line.delay ?? 0) * 1000 });
      }
    else this.queue = []; // dragging back or a big jump: drop what was pending
    this.prevF = f;
    if (this.showing && now > this.showing.until) this.showing = null;
    // Newest wins: when several lines are due, only the latest is worth showing; a line that
    // has been up for MIN_SHOW_MS gives way, so the subtitle never trails the picture.
    const due = this.queue.filter((q) => q.at <= now);
    if (due.length && (!this.showing || now - this.showing.shownAt >= MIN_SHOW_MS)) {
      const { line } = due[due.length - 1];
      this.queue = this.queue.filter((q) => q.at > now);
      const words = line.text.split(/\s+/).length;
      this.showing = { line, shownAt: now, until: now + Math.max(3500, words * 320) };
      if (this.subtitle) this.subtitle.textContent = line.text;
      this.playAudio(line);
    }
    this.subtitle?.classList.toggle('shown', this.showing !== null);
  }

  private playAudio(line: NarrationLine): void {
    const on = (document.getElementById('winston-on') as HTMLInputElement | null)?.checked;
    // A clip recorded from older text would contradict its subtitle: subtitle only until regenerated.
    if (!on || this.audioText?.get(line.id) !== line.text) return;
    const id = line.id;
    this.audio?.pause();
    this.audio = new Audio(`/narration/evolution/${id}.mp3`);
    void this.audio.play().catch(() => {});
  }

  /** "about 430 million years ago" (Homo sapiens: "about 300,000 years ago"). */
  private when(s: Stage): string {
    return `about ${formatYearsAgo(AGE - s.tAgo)}`;
  }

  render(_view: ViewContext, t: number): void {
    super.render();
    if (!this.renderer || !this.treeView) return;
    // 7a or 7b: the toy model fills the stage, or sits in the corner while our lineage morphs.
    const fNow = chapterProgress(this.chapterIndex, t);
    // CONTROLLED: no variation, so the lineage never leaves the first cell.
    const st = this.mode === 'controlled' ? { ...lineageStateAt(fNow, this.positions), i: 0, u: 0, raw: 0 } : lineageStateAt(fNow, this.positions);
    this.lineage = st;
    this.main?.classList.toggle('phase-b', !st.selection);
    this.root?.classList.toggle('phase-b', !st.selection);
    if (!st.selection) this.stage?.draw(st);
    const progress = chapterProgress(this.chapterIndex, t);
    this.familyTree?.update(progress);
    this.narrate(progress);
    this.root?.classList.toggle('handoff', progress >= HANDOFF_FROM);
    const primates = STAGES.findIndex((s) => s.id === 'early-primate');
    this.setChartsMode(this.mode !== 'controlled' && !st.selection && st.i + (st.raw >= 0.5 ? 1 : 0) >= primates ? 'brain' : 'evo');
    this.brain?.update(AGE - t);
    this.step = this.engine.stepAt(t);
    if (this.engine.requestFrame(this.step, this.run, this.needFrame)) this.needFrame = false;
    const p = this.engine.params;
    const f = this.evoFrame;
    // Until the first frame (or the other run's frame) arrives, stay at the requested step.
    const shown = f ? f.step : Math.min(this.step, this.engine.headStep);
    const env = environmentAt(this.run === 'control' ? { ...p, oxygenRises: false } : p, shown);
    if (f && f !== this.drawnFrame) {
      this.renderer.draw({ org: f.org, food: f.food, L: p.L, oxygen: env.oxygen, snowball: env.snowball, predationDiet: p.predationDiet });
      this.drawnFrame = f;
    }

    // The tree follows the real (oxygen) run.
    const canvas = this.treeView.canvas;
    const d = this.drawnTree;
    const treeStep = Math.min(shown, this.engine.headStep);
    if (treeStep !== d.step || this.engine.tree.length !== d.nodes || canvas.clientWidth !== d.w || canvas.clientHeight !== d.h) {
      const { alive, extinct } = this.treeView.draw(this.engine.tree, treeStep);
      this.els.treeCount.textContent = `${alive} living · ${extinct} extinct`;
      this.drawnTree = { step: treeStep, nodes: this.engine.tree.length, w: canvas.clientWidth, h: canvas.clientHeight };
    }

    this.charts?.setCursor(shown);
    const m = this.engine.metricAt(this.run, shown);
    this.els.oxygen.style.width = `${100 * env.oxygen}%`;
    this.els.food.style.width = `${(100 * env.foodRate) / (p.foodRate * p.cambrianFood)}%`;
    // Organism numbers come from the frame on screen (metric samples are every few steps).
    if (f) {
      const n = f.org.length / FRAME_STRIDE;
      let seg = 0;
      let pred = 0;
      for (let i = 0; i < n; i++) {
        seg += f.org[i * FRAME_STRIDE + 4];
        if (f.org[i * FRAME_STRIDE + 8] >= p.predationDiet) pred++;
      }
      this.els.pop.textContent = String(n);
      this.els.seg.textContent = n ? (seg / n).toFixed(2) : '–';
      this.els.pred.textContent = `${n ? Math.round((100 * pred) / n) : 0}%`;
    }
    if (m) this.els.sp.textContent = String(m.species);
    this.els.caption.textContent = this.captionFor(shown, env.snowball);
    this.els.status.textContent =
      this.engine.headStep < p.steps ? `Computing… ${Math.round((100 * this.engine.headStep) / p.steps)}%` : '';
  }

  private captionFor(step: number, snowball: boolean): string {
    const sc = this.engine.params.schedule;
    for (const e of sc.extinctions)
      if (step >= e.step && step < e.step + EXTINCTION_CAPTION_STEPS)
        return `Mass extinction: ${Math.round(100 * e.fraction)}% of species wiped out at random. Survivors re-radiate.`;
    if (snowball) return 'Snowball Earth: ice cuts the food supply';
    if (this.mode === 'controlled') return 'Identical creatures, no mutations: generation after generation, nothing changes';
    if (this.run === 'control')
      return step < sc.noe[0] ? 'Control run: identical, except oxygen will never rise' : 'Control: no oxygen rise, so many-celled bodies never pay off';
    if (step < sc.goe[0]) return 'Single cells in a sea with almost no oxygen';
    if (step < sc.goe[1]) return 'Great Oxidation Event: oxygen starts to build up';
    if (step < sc.noe[0]) return 'A little oxygen, still too little for many-celled bodies';
    if (step < sc.cambrian) return 'Oxygen climbs toward today’s level: many-celled bodies start to pay off';
    if (step < sc.cambrian + 600) return 'Cambrian explosion: new niches open up (more food patches)';
    return 'Selection at work: bodies grow more complex, lineages branch and die out';
  }

  counters(): { label: string; value: string }[] {
    const m = this.engine.metricAt(this.run, this.step);
    // Species that branched off during the run (the tree's nodes beyond the first).
    return [{ label: 'new species', value: String(Math.max(0, this.engine.tree.filter((n) => n.born <= this.step).length - 1)) }, { label: 'mean segments', value: m ? m.meanSegments.toFixed(2) : '1.00' }];
  }

  metrics(): Record<string, number> {
    const m = this.engine.metricAt(this.run, this.step);
    const base: Record<string, number> = { ...super.metrics(), lineageStage: this.lineage.selection ? 0 : this.lineage.i + 1 };
    return m
      ? { ...base, organisms: m.population, species: m.species, meanSegments: m.meanSegments, predatorFraction: m.predators, oxygen: m.oxygen }
      : base;
  }

  availableUntil(): number {
    return this.engine.headStep >= this.engine.params.steps ? this.tEnd : this.engine.timeAt(this.engine.headStep);
  }

  dispose(): void {
    this.engine.onMetrics = null;
    this.engine.onFrame = null;
    this.charts?.destroy();
    this.charts = null;
    this.renderer = null;
    this.treeView = null;
    this.evoFrame = null;
    this.drawnFrame = null;
    this.drawnTree = { step: -1, nodes: -1, w: 0, h: 0 };
    this.stage = null;
    this.main = null;
    this.familyTree?.destroy();
    this.familyTree = null;
    this.brain?.destroy();
    this.brain = null;
    // A line still showing (the closing line, at the hand-over) carries over into chapter 8 for
    // its remaining time instead of being cut off; its audio keeps playing.
    const left = this.showing ? this.showing.until - performance.now() : 0;
    if (this.subtitle && this.view && left > 300) {
      const sub = this.subtitle;
      sub.classList.add('carry');
      this.view.main.appendChild(sub);
      window.setTimeout(() => sub.classList.remove('shown'), left);
      window.setTimeout(() => sub.remove(), left + 600);
    } else this.audio?.pause();
    this.view = null;
    this.audio = null;
    this.subtitle = null;
    this.queue = [];
    this.showing = null;
    super.dispose();
  }
}
