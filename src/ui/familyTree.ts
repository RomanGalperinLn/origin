// Chapter 7b's family-tree mini-map. The trunk (our ancestors) runs along the bottom, laid
// out on the same positions as the master slider; each living cousin branches off where its
// lineage split from ours and runs on to today, labelled "cousin" (never "ancestor"). A dot
// travels the trunk with the slider; a branch lights up as the dot passes its split, with a
// short "… branch off" label. Clicking a branch shows its one-line note.
// Icons are tiny versions of our own key-frame drawings (no outside artwork).

import { blendCreatures, creatureShape, smoothPath, type CreatureParams } from '../lineage/creature';
import { STAGE_ART } from '../lineage/stages';
import type { Cousin, Knot, Stage } from '../lineage/timeline';
import { knotFraction, SEL_SHARE } from '../lineage/timeline';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Which of our drawings stands in for each cousin's icon (matched on id/label), with a colour. */
const ICONS: [RegExp, string, string][] = [
  [/bacteri|archae/i, 'first-cells', '#7fd6a3'],
  [/plant/i, 'eukaryote', '#5fbf5a'],
  [/fung/i, 'eukaryote', '#c9a27a'],
  [/sponge/i, 'sponge-like', '#e3a35a'],
  [/jelly|cnidar/i, 'sponge-like', '#d98be0'],
  [/insect|protostom|snail|octop/i, 'worm-like', '#c7a04a'],
  [/shark|cartilag/i, 'jawed-fish', '#7f98a8'],
  [/frog|amphib|salamand/i, 'tetrapod', '#69a33f'],
  [/reptil|bird|sauropsid|dinosaur/i, 'synapsid', '#7aa05a'],
  [/platypus|monotrem/i, 'early-mammal', '#7b6a58'],
  [/kangaroo|marsupial/i, 'early-mammal', '#b08a62'],
  [/lemur|strepsirrhin/i, 'early-primate', '#9a9088'],
  [/new.world/i, 'anthropoid', '#a8784e'],
  [/old.world/i, 'catarrhine-ancestor', '#a39070'],
  [/gibbon/i, 'early-ape', '#6d5a4a'],
  [/orangutan/i, 'early-ape', '#b5652e'],
  [/gorilla/i, 'chimp-lca', '#3c3a3a'],
  [/chimp|bonobo/i, 'chimp-lca', '#4b3a30'],
  [/neander|denisov/i, 'heidelbergensis', '#8a7a68'],
];

function iconFor(c: Cousin): CreatureParams {
  const hit = ICONS.find(([re]) => re.test(c.id) || re.test(c.label));
  const art = STAGE_ART[hit?.[1] ?? 'first-cells'];
  const color = hit?.[2] ?? '#999999';
  return { ...blendCreatures(art, art, 0), body: color, head: art.head === art.body ? color : art.head };
}

interface Branch {
  c: Cousin;
  f: number;
  lane: number;
  g: SVGGElement;
  passed: boolean;
}

export class FamilyTree {
  private svg: SVGSVGElement;
  private branches: Branch[] = [];
  private dot: SVGCircleElement | null = null;
  private trunkLit: SVGLineElement | null = null;
  private toast: HTMLElement;
  private note: HTMLElement;
  private toastUntil = 0;
  private W = 480;
  private H = 300;
  private lastF = -1;
  private cousins: Cousin[];
  private observer = new ResizeObserver(() => {
    // Built at the panel's real size: rebuild when it appears (it is hidden during 7a) or resizes.
    if (this.svg.clientWidth && (this.svg.clientWidth !== this.W || this.svg.clientHeight !== this.H)) this.build();
  });

  constructor(
    host: HTMLElement,
    stages: Stage[],
    private knots: Knot[],
    private agoLabel: (ago: number) => string,
  ) {
    host.innerHTML = `
      <div class="family-tree">
        <div class="tree-head"><span class="side-title">Family tree: our ancestors and today's cousins</span></div>
        <svg class="ft-svg"></svg>
        <div class="ft-toast"></div>
        <div class="ft-note dim">Monkeys and apes are our cousins, not our ancestors: we share ancestors with them. Click a branch.</div>
      </div>`;
    this.svg = host.querySelector('.ft-svg')!;
    this.toast = host.querySelector('.ft-toast')!;
    this.note = host.querySelector('.ft-note')!;
    this.cousins = stages.flatMap((s) => s.cousinsBranchingHere).sort((a, b) => b.tAgo - a.tAgo);
    this.observer.observe(this.svg);
    this.build();
  }

  /** Lays the tree out at the panel's real pixel size (rebuilt on resize). */
  private build(): void {
    this.W = Math.max(240, this.svg.clientWidth);
    this.H = Math.max(120, this.svg.clientHeight);
    this.svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    this.svg.innerHTML = '';
    this.branches = [];
    const cousins = this.cousins;
    const top = 4;
    const trunkY = this.H - 16;
    const laneH = (trunkY - 10 - top) / Math.max(1, cousins.length);
    const font = Math.max(8, Math.min(11, laneH - 1.5));

    // Trunk: dim, with a lit part up to the current time.
    this.svg.appendChild(this.line(this.x(SEL_SHARE), trunkY, this.x(1), trunkY, '#4a5568', 3));
    this.trunkLit = this.line(this.x(SEL_SHARE), trunkY, this.x(SEL_SHARE), trunkY, '#ffd36b', 3);
    this.svg.appendChild(this.trunkLit);
    const trunkLabel = document.createElementNS(SVG_NS, 'text');
    trunkLabel.setAttribute('x', String(this.x(SEL_SHARE)));
    trunkLabel.setAttribute('y', String(trunkY + 12));
    trunkLabel.setAttribute('class', 'ft-trunk-label');
    trunkLabel.textContent = 'Our ancestors (first cells → Homo sapiens)';
    this.svg.appendChild(trunkLabel);

    const xEnd = this.x(1) + 10;
    cousins.forEach((c, k) => {
      const f = Math.max(SEL_SHARE, knotFraction(this.knots, c.tAgo));
      const y = top + (k + 0.5) * laneH;
      const x0 = this.x(f);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', `ft-branch${c.extinct ? ' extinct' : ''}`);
      // Up from the trunk where the lineages split, then on to today, ending in an icon and a name.
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M${x0},${trunkY} L${x0},${y} L${xEnd},${y}`);
      path.setAttribute('class', 'ft-line');
      g.appendChild(path);
      const hit = document.createElementNS(SVG_NS, 'rect');
      hit.setAttribute('x', String(x0));
      hit.setAttribute('y', String(y - laneH / 2));
      hit.setAttribute('width', String(this.W - x0));
      hit.setAttribute('height', String(laneH));
      hit.setAttribute('fill', 'transparent');
      g.appendChild(hit);
      const icon = creatureShape(iconFor(c));
      const ig = document.createElementNS(SVG_NS, 'g');
      // Fit the icon's own bounds into a small box at the end of the branch.
      let bx0 = Infinity;
      let bx1 = -Infinity;
      let by0 = Infinity;
      let by1 = -Infinity;
      for (const part of icon.parts.slice(0, 5))
        for (const [px, py] of part) {
          bx0 = Math.min(bx0, px);
          bx1 = Math.max(bx1, px);
          by0 = Math.min(by0, py);
          by1 = Math.max(by1, py);
        }
      const boxH = Math.min(laneH * 0.95, 14);
      const sc = Math.min(18 / (bx1 - bx0), boxH / (by1 - by0));
      ig.setAttribute('transform', `translate(${xEnd + 3 - bx0 * sc},${y - ((by0 + by1) / 2) * sc}) scale(${sc})`);
      for (const i of [4, 3, 0, 2, 1]) {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', smoothPath(icon.parts[i]));
        p.setAttribute('fill', icon.fills[i]);
        ig.appendChild(p);
      }
      g.appendChild(ig);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(xEnd + 24));
      label.setAttribute('y', String(y + font * 0.35));
      label.setAttribute('class', 'ft-label');
      label.setAttribute('font-size', String(font));
      // Short names on the map; the full name and note come on click.
      const name = c.label.replace(/\s*\(.*\)\s*/g, '');
      label.textContent = c.extinct ? `${name} (extinct)` : name;
      g.appendChild(label);
      g.addEventListener('click', () => {
        this.note.textContent = `${c.label}: split from our line ${this.agoLabel(c.tAgo)}. ${c.note}`;
      });
      this.svg.appendChild(g);
      this.branches.push({ c, f, lane: k, g, passed: false });
    });

    this.dot = document.createElementNS(SVG_NS, 'circle');
    this.dot.setAttribute('r', '4.5');
    this.dot.setAttribute('cy', String(trunkY));
    this.dot.setAttribute('class', 'ft-dot');
    this.svg.appendChild(this.dot);
    const f = this.lastF;
    this.lastF = -1;
    if (f >= 0) this.update(f, 0, false);
  }

  private x(f: number): number {
    // The trunk spans 7b's part of the chapter, leaving room for names on the right.
    const x0 = 6;
    const x1 = this.W - 195;
    return x0 + ((f - SEL_SHARE) / (1 - SEL_SHARE)) * (x1 - x0);
  }

  private line(x1: number, y1: number, x2: number, y2: number, stroke: string, w: number): SVGLineElement {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('x1', String(x1));
    l.setAttribute('y1', String(y1));
    l.setAttribute('x2', String(x2));
    l.setAttribute('y2', String(y2));
    l.setAttribute('stroke', stroke);
    l.setAttribute('stroke-width', String(w));
    l.setAttribute('stroke-linecap', 'round');
    return l;
  }

  /** f: fraction through the chapter (same as the slider). */
  update(f: number, now = performance.now(), announce = true): void {
    const fc = Math.max(SEL_SHARE, Math.min(1, f));
    if (fc !== this.lastF && this.dot && this.trunkLit) {
      const forward = fc > this.lastF;
      const x = this.x(fc);
      this.dot.setAttribute('cx', String(x));
      this.trunkLit.setAttribute('x2', String(x));
      for (const b of this.branches) {
        const passed = fc >= b.f;
        if (passed !== b.passed) {
          b.passed = passed;
          b.g.classList.toggle('passed', passed);
          // Announce a split as the dot reaches it (playing or dragging forward).
          if (passed && forward && announce && this.lastF >= 0) {
            b.g.classList.add('flash');
            window.setTimeout(() => b.g.classList.remove('flash'), 1600);
            this.toast.textContent = `${b.c.label.replace(/\s*\(.*\)\s*/g, '')} branch off, ${this.agoLabel(b.c.tAgo)}`;
            this.toastUntil = now + 1800;
          }
        }
      }
      this.lastF = fc;
    }
    this.toast.style.opacity = now < this.toastUntil ? '1' : '0';
  }

  destroy(): void {
    this.observer.disconnect();
  }
}
