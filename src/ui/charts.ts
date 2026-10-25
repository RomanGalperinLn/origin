import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { MetricSample } from '../sim/metrics';

// Three live charts, driven (colour) vs control (grey) on the same axes,
// with a "you are here" line at the displayed step.

const DRIVEN = '#ffb547';
const CONTROL = '#8a90a2';

interface ChartDef {
  el: string;
  title: string;
  value: (m: MetricSample) => number;
  smooth: boolean;
}

const DEFS: ChartDef[] = [
  { el: 'chart-entropy', title: 'Entropy produced (per period)', value: (m) => m.S_dot, smooth: true },
  { el: 'chart-energy', title: 'Energy absorbed (per period)', value: (m) => m.W_dot, smooth: true },
  { el: 'chart-order', title: 'Order (compression)', value: (m) => m.order, smooth: false },
];

/**
 * Running moving average, extended as samples arrive. The power curves
 * oscillate with the field, so they are averaged over one full field period
 * to show the trend.
 */
class Smoother {
  out: number[] = [];
  private raw: number[] = [];
  private sum = 0;
  constructor(private window: number) {}
  push(v: number): void {
    this.raw.push(v);
    this.sum += v;
    if (this.raw.length > this.window) this.sum -= this.raw[this.raw.length - 1 - this.window];
    this.out.push(this.sum / Math.min(this.raw.length, this.window));
  }
}

/** uPlot draws the title outside `height`, so leave room for it or the x axis gets clipped. */
export const TITLE_H = 22;

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** Scientific notation with superscript exponents: "10⁻¹⁴", "1.2 × 10¹³". */
export function sci(v: number, digits = 1): string {
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  const pow = `10${String(e).replace(/./g, (c) => SUP[c])}`;
  const mant = m.toFixed(digits).replace(/\.0+$/, '');
  return mant === '1' ? pow : `${mant} × ${pow}`;
}

export function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return ''; // uPlot can pass null splits on log axes
  const a = Math.abs(v);
  // Far outside everyday ranges (early-universe times and temperatures): powers of ten.
  if (a >= 1e12 || (a > 0 && a < 0.01)) return sci(v);
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  return a >= 10 || v === 0 ? v.toFixed(0) : v.toFixed(2);
}

interface Series {
  driven: number[] | Smoother;
  control: number[] | Smoother;
}

const values = (s: number[] | Smoother) => (s instanceof Smoother ? s.out : s);

export class Charts {
  private plots: uPlot[] = [];
  private cursors: HTMLDivElement[] = [];
  private x: number[] = [];
  private series: Series[] = [];
  private nControl = 0;
  private log = false;
  private dirty = false;
  private window = 20;
  private cursorStep: number | null = null;

  private onResize = () => this.resize();

  constructor() {
    this.build();
    window.addEventListener('resize', this.onResize);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.plots.forEach((p) => p.destroy());
    this.plots = [];
  }

  private build(): void {
    this.plots.forEach((p) => p.destroy());
    this.plots = [];
    this.cursors = [];
    for (const def of DEFS) {
      const host = document.getElementById(def.el)!;
      host.innerHTML = '';
      const opts: uPlot.Options = {
        title: def.title,
        width: host.clientWidth,
        height: host.clientHeight - TITLE_H,
        legend: { show: false },
        cursor: { show: false },
        scales: { x: this.log ? { time: false, distr: 3 } : { time: false } },
        axes: [
          {
            stroke: CONTROL,
            // Log mode would draw a grid line at every minor tick.
            grid: { stroke: '#1c2130', show: !this.log },
            ticks: { stroke: '#1c2130', show: !this.log },
            size: 28,
            font: '10px system-ui',
            values: (_u, splits) => splits.map((v) => (this.log && !/^10*$/.test(String(v)) ? '' : fmt(v))),
          },
          {
            stroke: CONTROL,
            grid: { stroke: '#1c2130' },
            ticks: { stroke: '#1c2130' },
            size: 40,
            font: '10px system-ui',
            values: (_u, splits) => splits.map(fmt),
          },
        ],
        series: [
          {},
          { stroke: CONTROL, width: 1.5, points: { show: false } },
          { stroke: DRIVEN, width: 1.5, points: { show: false } },
        ],
      };
      const plot = new uPlot(opts, [[], [], []], host);
      const cursor = document.createElement('div');
      cursor.className = 'here-line';
      plot.over.appendChild(cursor);
      this.plots.push(plot);
      this.cursors.push(cursor);
    }
    this.dirty = true;
  }

  /** smoothWindow: samples per field period. */
  reset(smoothWindow: number): void {
    this.window = Math.max(1, Math.round(smoothWindow));
    this.x = [];
    this.nControl = 0;
    this.series = DEFS.map((d) => ({
      driven: d.smooth ? new Smoother(this.window) : [],
      control: d.smooth ? new Smoother(this.window) : [],
    }));
    this.dirty = true;
  }

  add(driven: MetricSample[], control: MetricSample[]): void {
    if (this.series.length === 0) this.reset(this.window);
    for (const m of driven) {
      // Log x axis can't show step 0; plot it at step 1.
      this.x.push(Math.max(1, m.step));
      DEFS.forEach((d, i) => {
        const s = this.series[i].driven;
        if (s instanceof Smoother) s.push(d.value(m));
        else s.push(d.value(m));
      });
    }
    for (const m of control) {
      DEFS.forEach((d, i) => {
        const s = this.series[i].control;
        if (s instanceof Smoother) s.push(d.value(m));
        else s.push(d.value(m));
      });
    }
    this.nControl += control.length;
    this.dirty = true;
  }

  setLog(log: boolean): void {
    if (log === this.log) return;
    this.log = log;
    this.build();
  }

  /** Pushes new data to the plots (call at most a few times per second). */
  flush(): void {
    if (!this.dirty || this.series.length === 0) return;
    this.dirty = false;
    // Runs advance in lockstep, but trim to the shorter one just in case.
    const n = Math.min(this.x.length, this.nControl);
    const x = this.x.slice(0, n);
    this.plots.forEach((p, i) => {
      const s = this.series[i];
      p.setData([x, values(s.control).slice(0, n), values(s.driven).slice(0, n)]);
    });
    // New data rescales the x axis, so the cursor has to be placed again.
    if (this.cursorStep !== null) this.setCursor(this.cursorStep);
  }

  /** Moves the "you are here" line (cheap: no chart redraw). */
  setCursor(step: number): void {
    this.cursorStep = step;
    this.plots.forEach((p, i) => {
      const left = p.valToPos(Math.max(1, step), 'x');
      const c = this.cursors[i];
      if (!Number.isFinite(left)) {
        c.style.display = 'none';
        return;
      }
      c.style.display = 'block';
      c.style.transform = `translateX(${left}px)`;
    });
  }

  resize(): void {
    DEFS.forEach((d, i) => {
      const host = document.getElementById(d.el)!;
      this.plots[i]?.setSize({ width: host.clientWidth, height: host.clientHeight - TITLE_H });
    });
  }
}
