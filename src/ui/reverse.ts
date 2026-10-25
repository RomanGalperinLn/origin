// "Reverse time" overlay: plays back the branch the worker computes after
// flipping every velocity, with two small charts.

import uPlot from 'uplot';
import type { BranchSample, FromWorker } from '../worker/protocol';
import { Renderer } from './renderer';
import { fmt, TITLE_H } from './charts';

type BranchMsg = Extract<FromWorker, { type: 'branch' }>;

const DRIVEN = '#ffb547';
const GREY = '#8a90a2';

const TEXT_REAL =
  'Every velocity was flipped. If physics ran backwards perfectly, the particles would retrace their path back to the ' +
  'starting chaos and the entropy curve would run back down (grey). They don’t: friction and the heat bath keep turning ' +
  'motion into heat, the entropy produced keeps rising (orange), and the distance from the past keeps growing. That ' +
  'one-way street is the arrow of time.';
const TEXT_FRICTIONLESS =
  'Frictionless, no noise, no field: the system runs 100 steps forward, every velocity is flipped, and it runs 100 steps ' +
  'back. The distance from the start returns to almost exactly zero: without a heat bath, the motion is reversible. ' +
  '(Try longer and chaos wins anyway: tiny rounding errors grow until the retrace fails.)';

export class ReverseOverlay {
  private root = document.getElementById('reverse-overlay')!;
  private renderer = new Renderer(document.getElementById('canvas-reverse') as HTMLCanvasElement);
  private distPlot: uPlot | null = null;
  private entropyPlot: uPlot | null = null;
  private frames: Float32Array[] = [];
  private samples: BranchSample[] = [];
  private shown = 0; // index of the frame on screen
  /** Whether frame `shown` has been handed to the renderer yet. */
  private pushed = false;
  private framesPerSample = 1;
  private branchId = -1;
  private frictionless = false;
  private startStep = 0;
  private done = false;

  /** Driven run's cumulative entropy at a given step (from the metric history). */
  pastEntropy: (step: number) => number = () => 0;
  onReplay: ((frictionless: boolean) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor() {
    document.getElementById('reverse-close')!.addEventListener('click', () => this.close());
    document.getElementById('reverse-replay')!.addEventListener('click', () =>
      this.onReplay?.((document.getElementById('reverse-frictionless') as HTMLInputElement).checked),
    );
    document.getElementById('reverse-frictionless')!.addEventListener('change', (e) =>
      this.onReplay?.((e.target as HTMLInputElement).checked),
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }

  setup(types: Uint8Array, K: number, L: number): void {
    this.renderer.setup(types, K, L);
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Opens the overlay and waits for branch data. */
  open(frictionless: boolean): void {
    this.root.hidden = false;
    this.frames = [];
    this.samples = [];
    this.shown = 0;
    this.pushed = false;
    this.branchId = -1;
    this.done = false;
    this.frictionless = frictionless;
    (document.getElementById('reverse-frictionless') as HTMLInputElement).checked = frictionless;
    document.getElementById('reverse-text')!.textContent = frictionless ? TEXT_FRICTIONLESS : TEXT_REAL;
    document.getElementById('reverse-status')!.textContent = 'computing…';
    this.buildPlots();
  }

  close(): void {
    this.root.hidden = true;
    this.onClose?.();
  }

  receive(msg: BranchMsg): void {
    if (!this.isOpen()) return;
    if (msg.branchId !== this.branchId) {
      // First chunk of a new branch.
      this.branchId = msg.branchId;
      this.startStep = msg.startStep;
      this.frictionless = msg.frictionless;
      this.frames = [];
      this.samples = [];
      this.shown = 0;
    this.pushed = false;
      this.framesPerSample = msg.frictionless ? 5 : 10;
    }
    this.frames.push(...msg.frames);
    this.samples.push(...msg.samples);
    this.done = msg.done;
  }

  /** Called every animation frame: shows the next branch frame. */
  tick(): void {
    if (!this.isOpen() || this.frames.length === 0) return;
    if (this.shown < this.frames.length - 1 || !this.pushed) {
      if (this.pushed) this.shown++;
      this.renderer.push(this.frames[this.shown], this.shown, null);
      this.pushed = true;
    }
    this.renderer.draw();
    const framesTotal = this.frictionless ? 200 : 300;
    const k = this.frictionless ? this.shown : this.shown * 10;
    let status: string;
    if (this.frictionless) status = this.shown < 100 ? `running forward… step ${k}` : `velocities flipped, running back… ${k - 100} / 100`;
    else status = `${k.toLocaleString('en-GB')} steps after the flip (flipped at step ${this.startStep.toLocaleString('en-GB')})`;
    if (this.done && this.shown >= framesTotal) status += ' · done';
    document.getElementById('reverse-status')!.textContent = status;
    this.updatePlots(Math.floor(this.shown / this.framesPerSample));
  }

  private buildPlots(): void {
    this.distPlot?.destroy();
    this.entropyPlot?.destroy();
    const axes: uPlot.Axis[] = [
      { stroke: GREY, grid: { stroke: '#1c2130' }, ticks: { stroke: '#1c2130' }, size: 26, font: '10px system-ui' },
      { stroke: GREY, grid: { stroke: '#1c2130' }, ticks: { stroke: '#1c2130' }, size: 44, font: '10px system-ui', values: (_u, v) => v.map(fmt) },
    ];
    const make = (id: string, title: string, series: uPlot.Series[]) => {
      const host = document.getElementById(id)!;
      host.innerHTML = '';
      return new uPlot(
        {
          title,
          width: host.clientWidth,
          height: host.clientHeight - TITLE_H,
          legend: { show: false },
          cursor: { show: false },
          scales: { x: { time: false } },
          axes,
          series: [{}, ...series],
        },
        [[], ...series.map(() => [])] as uPlot.AlignedData,
        host,
      );
    };
    this.distPlot = make('reverse-dist', 'Distance from the past (mean, per particle)', [
      { stroke: DRIVEN, width: 2, points: { show: false } },
    ]);
    const entropyHost = document.getElementById('reverse-entropy')!;
    entropyHost.hidden = this.frictionless;
    this.entropyPlot = this.frictionless
      ? null
      : make('reverse-entropy', 'Entropy since the flip: actual vs. what reversal needs', [
          { stroke: GREY, width: 1.5, dash: [4, 4], points: { show: false } },
          { stroke: DRIVEN, width: 2, points: { show: false } },
        ]);
  }

  private updatePlots(upto: number): void {
    const s = this.samples.slice(0, upto + 1);
    const k = s.map((x) => x.k);
    this.distPlot?.setData([k, s.map((x) => (Number.isFinite(x.dist) ? x.dist : null))] as uPlot.AlignedData);
    if (this.entropyPlot) {
      // A true reversal would un-produce the entropy made on the way here.
      const S0 = this.pastEntropy(this.startStep);
      const needed = s.map((x) => (this.startStep - x.k >= 0 ? this.pastEntropy(this.startStep - x.k) - S0 : null));
      this.entropyPlot.setData([k, needed, s.map((x) => x.S)] as uPlot.AlignedData);
    }
  }
}
