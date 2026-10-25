// Chapter 7b's brain-size chart (from the primate stages on): cranial capacity (cm³) of
// fossil hominins against time, with ranges as error bars, a modern-chimpanzee reference
// line, and Neanderthals faded as a side branch. Points appear as time reaches them and a
// dot follows our lineage. Real fossil measurements only (brainSize.json, sources.md).

import { STAGES } from '../lineage/timeline';
import { AGE, formatYearsAgo } from '../time/cosmic';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * When an entry belongs on the chart's time line. Our lineage's entries sit at their stage's
 * date (modern humans: the Homo sapiens stage, 300,000 years ago, not the measurement date of
 * today); side branches appear when they split from our line (lineage.json), so both show
 * within chapter 7.
 */
export function revealAgo(e: BrainEntry): number {
  if (e.stageId) {
    const s = STAGES.find((x) => x.id === e.stageId);
    if (s) return s.tAgo;
  }
  if (e.kind === 'side-branch') {
    const split = STAGES.flatMap((x) => x.cousinsBranchingHere).find((c) => c.extinct && c.id.startsWith(e.id.slice(0, 6)));
    if (split) return split.tAgo;
  }
  return e.tAgo;
}

export interface BrainEntry {
  id: string;
  label: string;
  cc: number;
  ccRange: [number, number];
  tAgo: number;
  kind: 'stage' | 'reference' | 'side-branch';
  stageId: string | null;
  sourceKey: string;
}

/** Time axis (years ago, log): from the first primates to the most recent points. */
const AGO_LEFT = 6e7;
const AGO_RIGHT = 1e5;
const CC_MAX = 1800;

export class BrainChart {
  private svg: SVGSVGElement;
  private w = 0;
  private h = 0;
  private points: { e: BrainEntry; g: SVGGElement }[] = [];
  private dot: SVGCircleElement | null = null;
  private dotLabel: SVGTextElement | null = null;
  private note: SVGTextElement | null = null;
  private lastAgo = -1;
  private onResize = () => this.build();

  constructor(
    private host: HTMLElement,
    private entries: BrainEntry[],
  ) {
    host.innerHTML = `<div class="brain-chart"><div class="side-title">Brain size along our line (fossil relatives' skulls, cm³)</div><svg class="brain-svg"></svg></div>`;
    this.svg = host.querySelector('.brain-svg')!;
    window.addEventListener('resize', this.onResize);
    this.build();
  }

  private x(ago: number): number {
    const a = Math.min(AGO_LEFT, Math.max(AGO_RIGHT, ago));
    return 46 + ((Math.log(AGO_LEFT) - Math.log(a)) / (Math.log(AGO_LEFT) - Math.log(AGO_RIGHT))) * (this.w - 46 - 130);
  }

  private y(cc: number): number {
    return 6 + (1 - cc / CC_MAX) * (this.h - 26);
  }

  private el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private build(): void {
    this.w = Math.max(200, this.svg.clientWidth);
    this.h = Math.max(80, this.svg.clientHeight);
    this.svg.setAttribute('viewBox', `0 0 ${this.w} ${this.h}`);
    this.svg.innerHTML = '';
    // Axes and grid.
    for (const cc of [0, 500, 1000, 1500]) {
      this.svg.appendChild(this.el('line', { x1: 46, x2: this.w - 130, y1: this.y(cc), y2: this.y(cc), class: 'bc-grid' }));
      this.svg.appendChild(this.el('text', { x: 40, y: this.y(cc) + 3, class: 'bc-axis', 'text-anchor': 'end' }, String(cc)));
    }
    for (const ago of [5e7, 1e7, 3e6, 1e6, 3e5]) {
      const lbl = ago >= 1e6 ? `${ago / 1e6}M ya` : `${ago / 1e3}k ya`;
      this.svg.appendChild(this.el('text', { x: this.x(ago), y: this.h - 4, class: 'bc-axis', 'text-anchor': 'middle' }, lbl));
    }
    // Before the hominin record: say so instead of leaving a blank.
    const first = Math.max(...this.entries.filter((e) => e.kind === 'stage').map(revealAgo));
    this.note = this.el('text', { x: this.x(5.5e7) + 4, y: this.y(1500), class: 'bc-axis' }, `No hominin skulls yet: the record starts about ${formatYearsAgo(AGE - first)}`);
    this.svg.appendChild(this.note);
    // Modern chimpanzee reference line.
    const chimp = this.entries.find((e) => e.kind === 'reference');
    if (chimp) {
      this.svg.appendChild(this.el('line', { x1: 46, x2: this.w - 130, y1: this.y(chimp.cc), y2: this.y(chimp.cc), class: 'bc-ref' }));
      this.svg.appendChild(this.el('text', { x: this.w - 126, y: this.y(chimp.cc) + 3, class: 'bc-ref-label' }, `chimpanzee today ≈ ${chimp.cc}`));
    }
    // Fossil points with ranges (hidden until time reaches them).
    this.points = [];
    const sorted = this.entries.filter((e) => e.kind !== 'reference').sort((a, b) => b.tAgo - a.tAgo);
    let labelRight = -Infinity;
    for (const e of sorted) {
      const g = this.el('g', { class: `bc-point${e.kind === 'side-branch' ? ' side' : ''}` });
      const x = this.x(revealAgo(e));
      g.appendChild(this.el('line', { x1: x, x2: x, y1: this.y(e.ccRange[0]), y2: this.y(e.ccRange[1]), class: 'bc-bar' }));
      g.appendChild(this.el('circle', { cx: x, cy: this.y(e.cc), r: 3.5 }));
      // Labels: alternate above/below when crowded.
      const short = e.label.replace(/^Homo /, 'H. ').replace(/^Australopithecus /, 'A. ').replace(/ \(.*\)$/, '');
      const above = x > labelRight + 4;
      g.appendChild(this.el('text', { x: x + 5, y: this.y(e.cc) + (above ? -6 : 12), class: 'bc-label' }, short));
      if (above) labelRight = x + 5 + short.length * 5.2;
      this.svg.appendChild(g);
      this.points.push({ e, g });
    }
    this.dot = this.el('circle', { r: 5.5, class: 'bc-dot' });
    this.dotLabel = this.el('text', { x: 52, y: this.y(1650), class: 'bc-dot-label' });
    this.svg.appendChild(this.dot);
    this.svg.appendChild(this.dotLabel);
    const ago = this.lastAgo;
    this.lastAgo = -1;
    if (ago >= 0) this.update(ago);
  }

  /** Brain size along our lineage at `ago` (log-time interpolation between our ancestors' entries). */
  static lineageCc(entries: BrainEntry[], ago: number): number | null {
    const line = entries
      .filter((e) => e.kind === 'stage')
      .map((e) => ({ cc: e.cc, at: Math.max(1, revealAgo(e)) }))
      .sort((a, b) => b.at - a.at);
    if (!line.length || ago > line[0].at) return null;
    for (let k = 1; k < line.length; k++)
      if (ago >= line[k].at) {
        const u = (Math.log(line[k - 1].at) - Math.log(ago)) / (Math.log(line[k - 1].at) - Math.log(line[k].at));
        return line[k - 1].cc + u * (line[k].cc - line[k - 1].cc);
      }
    return line[line.length - 1].cc;
  }

  update(ago: number): void {
    if (ago === this.lastAgo) return;
    this.lastAgo = ago;
    for (const { e, g } of this.points) g.classList.toggle('shown', ago <= revealAgo(e) * 1.0001);
    const cc = BrainChart.lineageCc(this.entries, ago);
    if (this.note) this.note.style.display = cc === null ? '' : 'none';
    if (this.dot && this.dotLabel) {
      const show = cc !== null;
      this.dot.style.display = show ? '' : 'none';
      this.dotLabel.style.display = show ? '' : 'none';
      if (show) {
        this.dot.setAttribute('cx', String(this.x(ago)));
        this.dot.setAttribute('cy', String(this.y(cc!)));
        this.dotLabel.textContent = `our lineage now ≈ ${Math.round(cc! / 10) * 10} cm³`;
      }
    }
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.host.innerHTML = '';
  }
}
