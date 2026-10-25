// A row of small live charts: a main run in colour vs a control in grey, with a
// "you are here" line. Generic over the metric type, for chapters other than 6.

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { fmt, TITLE_H } from './charts';

export interface MiniDef<M> {
  title: string;
  value: (m: M) => number;
  logY?: boolean;
  /** Y-axis label format (default fmt). */
  format?: (v: number) => string;
}

export interface MiniOptions<M> {
  x: (m: M) => number;
  logX?: boolean;
  xLabel?: (x: number) => string;
  mainColor?: string;
  /** Show the grey control series. */
  control?: boolean;
  /** Legend labels, e.g. ['with ripples', 'no ripples']. */
  legend?: [string, string];
}

const GREY = '#8a90a2';

export class MiniCharts<M> {
  private plots: uPlot[] = [];
  private cursors: HTMLDivElement[] = [];
  private x: number[] = [];
  private main: number[][] = [];
  private ctrl: number[][] = [];
  private nCtrl = 0;
  private dirty = false;
  private cursorX: number | null = null;
  private timer = 0;
  private onResize = () => this.resize();

  constructor(
    private host: HTMLElement,
    private defs: MiniDef<M>[],
    private opts: MiniOptions<M>,
  ) {
    host.innerHTML = `<div class="charts mini" style="grid-template-columns: repeat(${defs.length}, 1fr)">${defs
      .map(() => '<div class="chart"></div>')
      .join('')}</div>${
      opts.legend
        ? `<div class="legend dim"><span class="swatch" style="background:${opts.mainColor ?? '#c79bff'}"></span> ${opts.legend[0]} <span class="swatch control"></span> ${opts.legend[1]}</div>`
        : ''
    }`;
    const cells = host.querySelectorAll<HTMLElement>('.chart');
    this.main = defs.map(() => []);
    this.ctrl = defs.map(() => []);
    defs.forEach((d, i) => {
      const el = cells[i];
      const axis = (log: boolean, size: number, xAxis: boolean, label: (v: number) => string = fmt): uPlot.Axis => ({
        stroke: GREY,
        grid: { stroke: '#1c2130', show: !log },
        ticks: { stroke: '#1c2130', show: !log },
        size,
        font: '10px system-ui',
        values: (_u, v) =>
          v.map((val) => {
            if (val === null) return '';
            // Log axes tick at every 1..9 multiple; label only the powers of ten.
            if (log && Math.abs(Math.log10(Math.abs(val)) - Math.round(Math.log10(Math.abs(val)))) > 1e-6) return '';
            return xAxis && opts.xLabel ? opts.xLabel(val) : label(val);
          }),
      });
      const series: uPlot.Series[] = [{}];
      if (opts.control !== false) series.push({ stroke: GREY, width: 1.5, points: { show: false } });
      series.push({ stroke: opts.mainColor ?? '#c79bff', width: 1.8, points: { show: false } });
      const plot = new uPlot(
        {
          title: d.title,
          width: el.clientWidth,
          height: el.clientHeight - TITLE_H,
          legend: { show: false },
          cursor: { show: false },
          scales: { x: opts.logX ? { time: false, distr: 3 } : { time: false }, y: d.logY ? { distr: 3 } : {} },
          axes: [axis(!!opts.logX, 24, true), axis(!!d.logY, 40, false, d.format)],
          series,
        },
        series.map(() => [] as number[]) as unknown as uPlot.AlignedData,
        el,
      );
      const c = document.createElement('div');
      c.className = 'here-line';
      plot.over.appendChild(c);
      this.plots.push(plot);
      this.cursors.push(c);
    });
    window.addEventListener('resize', this.onResize);
    this.timer = window.setInterval(() => this.flush(), 250);
  }

  add(main: M[], control: M[] = []): void {
    for (const m of main) {
      this.x.push(this.opts.x(m));
      this.defs.forEach((d, i) => this.main[i].push(d.value(m)));
    }
    for (const m of control) this.defs.forEach((d, i) => this.ctrl[i].push(d.value(m)));
    this.nCtrl += control.length;
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const n = this.opts.control === false ? this.x.length : Math.min(this.x.length, this.nCtrl);
    const x = this.x.slice(0, n);
    // Log axes can't show zero: nudge it to a tiny positive value.
    const safe = (arr: number[], log?: boolean) => arr.slice(0, n).map((v) => (log && v <= 0 ? null : v));
    this.plots.forEach((p, i) => {
      const d = this.defs[i];
      const data: (number | null)[][] = [x];
      if (this.opts.control !== false) data.push(safe(this.ctrl[i], d.logY));
      data.push(safe(this.main[i], d.logY));
      p.setData(data as uPlot.AlignedData);
    });
    if (this.cursorX !== null) this.setCursor(this.cursorX);
  }

  setCursor(x: number): void {
    this.cursorX = x;
    this.plots.forEach((p, i) => {
      const left = p.valToPos(x, 'x');
      const c = this.cursors[i];
      c.style.display = Number.isFinite(left) ? 'block' : 'none';
      c.style.transform = `translateX(${left}px)`;
    });
  }

  private resize(): void {
    const cells = this.host.querySelectorAll<HTMLElement>('.chart');
    this.plots.forEach((p, i) => p.setSize({ width: cells[i].clientWidth, height: cells[i].clientHeight - TITLE_H }));
  }

  destroy(): void {
    clearInterval(this.timer);
    window.removeEventListener('resize', this.onResize);
    this.plots.forEach((p) => p.destroy());
    this.plots = [];
  }
}
