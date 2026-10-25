// The live tree of life, built from the simulation's actual lineages: one horizontal line
// per species (in its colour) from birth to extinction or "now", branching off its parent.
// Time runs left to right along the chapter; dated environment events are marked.

import type { SpeciesNode } from '../evo/world';

export interface TreeMarker {
  step: number;
  /** Optional end step: drawn as a band (e.g. Snowball Earth). */
  end?: number;
  label: string;
  color: string;
}

export class TreeOfLife {
  private ctx: CanvasRenderingContext2D;
  private lanes = new Map<number, number>();
  private laneCount = 1;
  private laidOut = -1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private steps: number,
    private markers: TreeMarker[],
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Depth-first lanes: each species sits just below its parent, children in birth order. */
  private layout(tree: SpeciesNode[]): void {
    if (tree.length === this.laidOut) return;
    this.laidOut = tree.length;
    const kids = new Map<number, SpeciesNode[]>();
    for (const n of tree) {
      if (n.parent < 0) continue;
      let k = kids.get(n.parent);
      if (!k) kids.set(n.parent, (k = []));
      k.push(n);
    }
    this.lanes.clear();
    let lane = 0;
    const visit = (n: SpeciesNode) => {
      this.lanes.set(n.id, lane++);
      for (const c of (kids.get(n.id) ?? []).sort((a, b) => a.born - b.born)) visit(c);
    };
    for (const root of tree.filter((n) => n.parent < 0)) visit(root);
    this.laneCount = Math.max(1, lane);
  }

  draw(tree: SpeciesNode[], step: number): { alive: number; extinct: number } {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    this.layout(tree);
    const top = 26 * dpr;
    const xOf = (s: number) => (s / this.steps) * (w - 2) + 1;
    const yOf = (id: number) => top + ((this.lanes.get(id) ?? 0) + 0.5) * ((h - top - 2) / this.laneCount);

    // Event markers (bands and lines), labelled along the top.
    ctx.font = `${9 * dpr}px system-ui`;
    ctx.textBaseline = 'top';
    // Labels go on the first of two rows where they don't overlap the previous label.
    const rowEnd = [-Infinity, -Infinity];
    for (const m of this.markers) {
      const x = xOf(m.step);
      if (m.end !== undefined) {
        ctx.fillStyle = m.color + '22';
        ctx.fillRect(x, top, Math.max(1, xOf(m.end) - x), h - top);
      } else {
        ctx.fillStyle = m.color + '88';
        ctx.fillRect(x, top, Math.max(1, dpr), h - top);
      }
      const tw = ctx.measureText(m.label).width;
      const lx = Math.min(x, w - tw);
      const row = rowEnd.findIndex((end) => lx > end + 4 * dpr);
      if (row >= 0) {
        ctx.fillStyle = m.color;
        ctx.fillText(m.label, lx, 1 + row * 12 * dpr);
        rowEnd[row] = lx + tw;
      }
    }

    // Species lines.
    let alive = 0;
    let extinct = 0;
    const lw = Math.max(1, Math.min(2.5 * dpr, ((h - top) / this.laneCount) * 0.6));
    ctx.lineWidth = lw;
    for (const n of tree) {
      if (n.born > step) continue;
      const gone = n.died >= 0 && n.died <= step;
      if (gone) extinct++;
      else alive++;
      const end = gone ? n.died : step;
      const y = yOf(n.id);
      const col = `rgb(${Math.round(60 + 195 * n.r)}, ${Math.round(60 + 195 * n.g)}, ${Math.round(60 + 195 * n.b)})`;
      ctx.strokeStyle = col;
      ctx.globalAlpha = gone ? 0.45 : 1;
      ctx.beginPath();
      if (n.parent >= 0) {
        ctx.moveTo(xOf(n.born), yOf(n.parent));
        ctx.lineTo(xOf(n.born), y);
      } else ctx.moveTo(xOf(n.born), y);
      ctx.lineTo(xOf(end), y);
      ctx.stroke();
      if (gone) {
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(xOf(end) - lw, y - lw, 2 * lw, 2 * lw);
      }
    }
    ctx.globalAlpha = 1;

    // You are here.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(xOf(step), top, Math.max(1, dpr), h - top);
    return { alive, extinct };
  }
}
