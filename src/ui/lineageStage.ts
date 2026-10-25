// Chapter 7b's main stage: the morphing creature (an inline SVG with the six parts), an
// environment backdrop that blends between stages (ocean, shore, land, forest, savanna),
// a real-size scale bar, and the stage name and fact that fade in at each key frame.

import { DRAW_ORDER, PART_NAMES, VIEW, blendCreatures, creatureShape, mixColor, smoothPath } from '../lineage/creature';
import { STAGE_ART } from '../lineage/stages';
import type { Environment, LineageState, Stage } from '../lineage/timeline';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Backdrop colours: sky (or water) top and bottom, and the ground strip. */
const ENV: Record<Environment, { top: string; bottom: string; ground: string }> = {
  ocean: { top: '#0b2f55', bottom: '#06182d', ground: '#1d3346' },
  shore: { top: '#2d6c8f', bottom: '#5b8fa4', ground: '#b9a77a' },
  land: { top: '#5b7f9e', bottom: '#a7b9b4', ground: '#6f7a44' },
  forest: { top: '#1f4a2e', bottom: '#2f6a3c', ground: '#3b3020' },
  savanna: { top: '#86a9c6', bottom: '#e8d6a2', ground: '#b8963f' },
};

/** "about 2 µm", "about 8 mm", "about 10 cm", "about 1.2 m". */
export function formatSize(cm: number): string {
  const r = (v: number) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1).replace(/\.0$/, ''));
  if (cm < 0.1) return `about ${r(cm * 1e4)} µm`;
  if (cm < 1) return `about ${r(cm * 10)} mm`;
  if (cm < 100) return `about ${r(cm)} cm`;
  return `about ${r(cm / 100)} m`;
}

export class LineageStage {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private paths: SVGPathElement[] = [];
  private ground: SVGRectElement;
  private labelBox: HTMLElement;
  private name: HTMLElement;
  private fact: HTMLElement;
  private scale: HTMLElement;
  private last = '';

  constructor(
    host: HTMLElement,
    private stages: Stage[],
    private when: (s: Stage) => string,
  ) {
    host.innerHTML = `
      <div class="lineage-stage">
        <svg class="lineage-svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" preserveAspectRatio="xMidYMid meet"></svg>
        <div class="lineage-label"><div class="lineage-name"></div><div class="lineage-fact"></div></div>
        <div class="lineage-scale"></div>
        <div class="lineage-note">Key stages from the fossil record. Transitions between them are illustrations.</div>
      </div>`;
    this.el = host.querySelector('.lineage-stage')!;
    this.svg = host.querySelector('.lineage-svg')!;
    this.labelBox = host.querySelector('.lineage-label')!;
    this.name = host.querySelector('.lineage-name')!;
    this.fact = host.querySelector('.lineage-fact')!;
    this.scale = host.querySelector('.lineage-scale')!;
    this.ground = document.createElementNS(SVG_NS, 'rect');
    this.ground.setAttribute('x', '-2000');
    this.ground.setAttribute('width', '4400');
    this.ground.setAttribute('y', String(VIEW.ground));
    this.ground.setAttribute('height', '2000');
    this.svg.appendChild(this.ground);
    for (const i of DRAW_ORDER) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('data-part', PART_NAMES[i]);
      p.setAttribute('stroke-linejoin', 'round');
      this.svg.appendChild(p);
      this.paths[i] = p;
    }
  }

  draw(st: LineageState): void {
    const key = `${st.i}:${st.u.toFixed(4)}:${st.raw.toFixed(3)}`;
    if (key === this.last) return;
    this.last = key;
    const a = this.stages[st.i];
    const b = this.stages[Math.min(st.i + 1, this.stages.length - 1)];
    const params = blendCreatures(STAGE_ART[a.id], STAGE_ART[b.id], st.u);
    const shape = creatureShape(params);
    for (const i of DRAW_ORDER) {
      const p = this.paths[i];
      p.setAttribute('d', smoothPath(shape.parts[i]));
      p.setAttribute('fill', shape.fills[i]);
      p.setAttribute('stroke', shape.stroke);
      p.setAttribute('stroke-width', shape.strokeWidths[i].toFixed(2));
    }

    // Backdrop and ground blend between the two stages' environments.
    const ea = ENV[a.environment];
    const eb = ENV[b.environment];
    const top = mixColor(ea.top, eb.top, st.u);
    const bottom = mixColor(ea.bottom, eb.bottom, st.u);
    this.el.style.background = `linear-gradient(${top}, ${bottom})`;
    this.ground.setAttribute('fill', mixColor(ea.ground, eb.ground, st.u));
    // Floating creatures (cells, fish) have no ground under them: fade the strip with "grounded".
    this.ground.setAttribute('opacity', (0.35 + 0.65 * Math.min(1, params.grounded)).toFixed(2));

    // Real size (log-blended): every creature is drawn the same size on screen.
    const cm = Math.exp(Math.log(a.scaleCm) + st.u * (Math.log(b.scaleCm) - Math.log(a.scaleCm)));
    this.scale.textContent = `Real size: ${formatSize(cm)}`;

    // Name and fact of the nearest key frame, fading out mid-morph.
    const near = st.raw < 0.5 ? a : b;
    const d = Math.min(st.raw, 1 - st.raw);
    const opacity = st.i >= this.stages.length - 1 ? 1 : Math.max(0, Math.min(1, 1 - (d - 0.22) / 0.12));
    this.labelBox.style.opacity = opacity.toFixed(2);
    this.name.textContent = `${near.label} · ${this.when(near)}`;
    this.fact.textContent = near.fact;
  }
}
