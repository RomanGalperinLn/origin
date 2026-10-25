// Draws the evolution model: a sea with food (green specks) and organisms. Each organism
// is a chain of `segments` cells in its genome colour, trailing behind its heading, so
// complexity is visible at a glance. Predators get a red rim.

import { FRAME_STRIDE } from '../evo/protocol';

export interface EvoScene {
  org: Float32Array;
  food: Float32Array;
  /** Box side in simulation units. */
  L: number;
  /** 0..1: tints the water from murky green-brown (little oxygen) to clear blue. */
  oxygen: number;
  snowball: boolean;
  predationDiet: number;
}

export class EvoRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  draw(sc: EvoScene): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, w, h);
    // Fill the stage: the (periodic) world is cropped to the stage's shape, so the
    // creatures are big enough to see their segments. The label says so.
    const size = Math.max(w, h);
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;
    const k = size / sc.L;

    // Water: murky before oxygen, clear blue after; pale and icy during Snowball Earth.
    const o = Math.max(0, Math.min(1, sc.oxygen));
    const water = sc.snowball ? [70, 96, 120] : [Math.round(28 - 18 * o), Math.round(40 + 6 * o), Math.round(38 + 52 * o)];
    const g = ctx.createRadialGradient(ox + size / 2, oy + size / 2, size * 0.1, ox + size / 2, oy + size / 2, size * 0.75);
    g.addColorStop(0, `rgb(${water[0] + 14}, ${water[1] + 16}, ${water[2] + 20})`);
    g.addColorStop(1, `rgb(${water[0]}, ${water[1]}, ${water[2]})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Food.
    ctx.fillStyle = sc.snowball ? 'rgba(190, 230, 210, 0.7)' : 'rgba(120, 220, 110, 0.75)';
    const fr = Math.max(1, 0.35 * k);
    for (let i = 0; i < sc.food.length; i += 2) ctx.fillRect(ox + sc.food[i] * k - fr / 2, oy + sc.food[i + 1] * k - fr / 2, fr, fr);

    // Organisms: segment chains.
    const n = sc.org.length / FRAME_STRIDE;
    for (let i = 0; i < n; i++) {
      const f = i * FRAME_STRIDE;
      const x = sc.org[f];
      const y = sc.org[f + 1];
      const hd = sc.org[f + 2];
      const r = Math.max(1.2, 0.6 * Math.sqrt(sc.org[f + 3]) * k);
      const segs = sc.org[f + 4];
      const col = `rgb(${Math.round(60 + 195 * sc.org[f + 5])}, ${Math.round(60 + 195 * sc.org[f + 6])}, ${Math.round(60 + 195 * sc.org[f + 7])})`;
      const predator = sc.org[f + 8] >= sc.predationDiet;
      const dx = -Math.cos(hd) * r * 1.5;
      const dy = -Math.sin(hd) * r * 1.5;
      ctx.fillStyle = col;
      for (let s = 0; s < segs; s++) {
        // Wrap each cell so chains crossing the edge draw on the near side.
        const cx = ox + (((x * k + s * dx) % size) + size) % size;
        const cy = oy + (((y * k + s * dy) % size) + size) % size;
        ctx.beginPath();
        ctx.arc(cx, cy, s === 0 ? r : r * 0.85, 0, 2 * Math.PI);
        ctx.fill();
        if (predator && s === 0) {
          ctx.strokeStyle = '#ff4d4d';
          ctx.lineWidth = Math.max(1, r * 0.35);
          ctx.stroke();
        }
      }
    }
    if (size > Math.min(w, h) * 1.05 && w > 500 * dpr) {
      ctx.font = `${11 * dpr}px system-ui`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.textAlign = 'right';
      ctx.fillText(`zoomed in: ${Math.round((100 * Math.min(w, h)) / size)}% of the world shown`, w - 8 * dpr, 16 * dpr);
      ctx.textAlign = 'left';
    }
  }
}
