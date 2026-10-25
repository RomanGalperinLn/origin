// Draws one run's particles like a view down a microscope into a primordial ocean:
// an ocean-gradient background, glowing particles (soft sprites, additive blending)
// that leave short fading trails, and a vignette. The square world is zoomed to fill
// the panel's width (top and bottom are cropped). Positions are interpolated between
// the last two frames from the worker, so motion is smooth at the display's frame rate.
// Driven panel: the oscillating field is drawn as travelling light bands. Structures:
// bonds between linked neighbours and a soft outline around each cluster, coloured by
// its fingerprint (same colour = same composition and shape), with a ripple when a
// shape's count goes up. Purely visual: nothing here touches the simulation or metrics.

import type { FrameStructures } from '../worker/protocol';

export const TYPE_COLORS = ['#ff5a5a', '#ffc83c', '#5adc78', '#50aaff', '#c86eff', '#ff8cdc'];

/** Frames further apart than this many steps are not interpolated (a jump, not motion). */
const MAX_INTERP_STEPS = 400;
/** Fraction of the trail layer erased each frame (lower = longer trails). */
const TRAIL_FADE = 0.15;

interface Frame {
  xy: Float32Array;
  step: number;
  at: number;
  rings: Float32Array | null;
  structures?: FrameStructures | null;
}

/** The driving field, for drawing (E = E0 sin(2π t / period) along fieldAngle). */
export interface FieldInfo {
  E0: number;
  period: number;
  dt: number;
  angle: number;
}

interface Ripple {
  x: number;
  y: number;
  at: number;
  text: string;
  hue: number;
}

/** Microscope moment zoom. */
const ZOOM = 2.5;
/** Clusters this big or bigger get an outline ("membrane"). */
const MEMBRANE_MIN = 8;
/** At most one "same shape" label per this many ms per panel. */
const EVENT_GAP_MS = 1000;

function lighten(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => Math.round(x + (255 - x) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function hexAlpha(hex: string, a: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private trail = document.createElement('canvas');
  private trailCtx: CanvasRenderingContext2D;
  private bg = document.createElement('canvas');
  private sprites: HTMLCanvasElement[] = [];
  private spriteR = 0;
  private types: Uint8Array = new Uint8Array(0);
  private L = 1;
  private a: Frame | null = null;
  private b: Frame | null = null;
  private pos = new Float32Array(0);
  private speed = new Float32Array(0);
  /** Set by the chapter: shown in a corner when the world is cropped. */
  cropNote = true;
  /** The driving field (driven panel), or null (control: "no energy flow"). */
  field: FieldInfo | null = null;
  /** Draw bonds, outlines and match ripples. */
  showStructures = true;
  private rLink = 0.5;
  /** Bonded pairs (particle indices) of the current frame, and each cluster's members. */
  private bonds = new Int32Array(0);
  private members: Int32Array[] = [];
  private ripples: Ripple[] = [];
  private lastEventAt = -Infinity;
  /** Camera (world units): centre and zoom. Default: whole panel. */
  private camX = 0;
  private camY = 0;
  private camZ = 1;
  /** Microscope moment: start time and the structure followed (world position). */
  private focusAt = -Infinity;
  private target: [number, number] | null = null;
  private camTx: number | null = null;
  private camTy: number | null = null;
  private vignette = document.createElement('canvas');
  /** Circular magnifier inset following the largest structure. */
  magnifier = false;
  private dust: Float32Array;
  private bubbles: { x: number; born: number; wobble: number }[] = [];
  private lastBubble = 0;

  constructor(readonly canvas: HTMLCanvasElement, seed = 1) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.trailCtx = this.trail.getContext('2d')!;
    // Background dust: fixed pseudo-random specks (decoration, not part of the simulation).
    let r = seed * 2654435761;
    const rand = () => ((r = Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296;
    this.dust = Float32Array.from({ length: 4 * 70 }, () => rand());
  }

  setup(types: Uint8Array, _K: number, L: number, rLink = 0.5): void {
    this.types = types;
    this.L = L;
    this.camX = this.camY = L / 2;
    this.camZ = 1;
    this.focusAt = -Infinity;
    this.rLink = rLink;
    this.bonds = new Int32Array(0);
    this.members = [];
    this.ripples = [];
    this.a = this.b = null;
    this.pos = new Float32Array(2 * types.length);
    this.speed = new Float32Array(types.length);
    this.trail.width = 0; // clear trails on a new run
  }

  /** A new frame from the worker. */
  push(xy: Float32Array, step: number, rings: Float32Array | null, now = performance.now(), structures: FrameStructures | null = null): void {
    const f: Frame = { xy, step, at: now, rings, structures };
    if (structures) this.updateStructures(f, now);
    if (this.b && Math.abs(step - this.b.step) <= MAX_INTERP_STEPS && step !== this.b.step) {
      // Continue smoothly from what is on screen now toward the new frame.
      this.a = { xy: this.pos.slice(), step: this.b.step, at: now - Math.max(16, Math.min(250, now - this.b.at)), rings: null };
      this.b = f;
      this.updateSpeeds();
    } else {
      this.a = null;
      this.b = f;
      this.speed.fill(0);
    }
  }

  /** Bonds and members of the new frame's clusters, and a ripple where a shape's count went up. */
  private updateStructures(f: Frame, now: number): void {
    const st = f.structures!;
    const { L } = this;
    const n = st.hue.length;
    const lists: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < st.label.length; i++) if (st.label[i] >= 0) lists[st.label[i]].push(i);
    this.members = lists.map((l) => Int32Array.from(l));
    // Bonds: pairs within the link distance in the same cluster, found with a cell grid
    // (cell side >= rLink, so only the 3x3 neighbouring cells need checking): O(N), any cluster size.
    const r2 = this.rLink * this.rLink;
    const G = Math.max(1, Math.floor(L / this.rLink));
    const cellOf = (i: number) => (Math.min(G - 1, Math.floor((f.xy[2 * i] / L) * G)) + G * Math.min(G - 1, Math.floor((f.xy[2 * i + 1] / L) * G)));
    const cells = new Map<number, number[]>();
    for (let i = 0; i < st.label.length; i++) {
      if (st.label[i] < 0) continue;
      const c = cellOf(i);
      const list = cells.get(c);
      if (list) list.push(i);
      else cells.set(c, [i]);
    }
    const pairs: number[] = [];
    for (const [c, list] of cells) {
      const cx = c % G;
      const cy = Math.floor(c / G);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const other = cells.get(((cx + ox + G) % G) + G * ((cy + oy + G) % G));
          if (!other) continue;
          for (const i of list)
            for (const j of other) {
              if (j <= i || st.label[i] !== st.label[j]) continue;
              const dx = this.wrapD(f.xy[2 * j] - f.xy[2 * i]);
              const dy = this.wrapD(f.xy[2 * j + 1] - f.xy[2 * i + 1]);
              if (dx * dx + dy * dy < r2) pairs.push(i, j);
            }
        }
    }
    this.bonds = Int32Array.from(pairs);
    // A shape's count went up since the previous frame (moving forward in time): ripple at one of them.
    const prev = this.b?.structures;
    if (prev && f.step > (this.b?.step ?? 0) && f.step - this.b!.step <= MAX_INTERP_STEPS && now - this.lastEventAt > EVENT_GAP_MS) {
      const before = new Map<number, number>();
      prev.hue.forEach((h, c) => before.set(h, prev.matches[c]));
      for (let c = 0; c < n; c++) {
        if (st.matches[c] < 2 || st.matches[c] <= (before.get(st.hue[c]) ?? 0) || lists[c].length < MEMBRANE_MIN) continue;
        const i0 = lists[c][0];
        this.ripples.push({ x: f.xy[2 * i0], y: f.xy[2 * i0 + 1], at: now, text: `same shape ×${st.matches[c]}`, hue: st.hue[c] });
        this.lastEventAt = now;
        break;
      }
    }
  }

  /** Per-particle speed between the two frames (in world units per step), for brightness. */
  private updateSpeeds(): void {
    if (!this.a || !this.b) return;
    const { L } = this;
    const steps = Math.max(1, Math.abs(this.b.step - this.a.step));
    for (let i = 0; i < this.speed.length; i++) {
      let dx = this.b.xy[2 * i] - this.a.xy[2 * i];
      let dy = this.b.xy[2 * i + 1] - this.a.xy[2 * i + 1];
      if (dx > L / 2) dx -= L;
      else if (dx < -L / 2) dx += L;
      if (dy > L / 2) dy -= L;
      else if (dy < -L / 2) dy += L;
      this.speed[i] = Math.hypot(dx, dy) / steps;
    }
  }

  /** Keeps the backing stores matched to the displayed size; rebuilds cached layers on resize. */
  private resize(): number {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h || this.trail.width !== w) {
      this.canvas.width = this.trail.width = this.bg.width = w;
      this.canvas.height = this.trail.height = this.bg.height = h;
      this.buildBackground(w, h);
      this.vignette.width = w;
      this.vignette.height = h;
      const vc = this.vignette.getContext('2d')!;
      const vg = vc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
      vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vg.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
      vc.fillStyle = vg;
      vc.fillRect(0, 0, w, h);
      this.spriteR = 0;
    }
    return dpr;
  }

  private buildBackground(w: number, h: number): void {
    const c = this.bg.getContext('2d')!;
    // Ocean: slightly lighter teal in the centre, dark navy at the edges.
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, '#0f3a46');
    g.addColorStop(0.55, '#0a2236');
    g.addColorStop(1, '#040a18');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }

  /** One soft glow sprite per type: light centre, the type's colour, fading to transparent. */
  private buildSprites(r: number): void {
    this.spriteR = r;
    const size = Math.ceil(2 * r);
    this.sprites = TYPE_COLORS.map((col) => {
      const s = document.createElement('canvas');
      s.width = s.height = size;
      const c = s.getContext('2d')!;
      const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, lighten(col, 0.55));
      g.addColorStop(0.25, hexAlpha(col, 0.75));
      g.addColorStop(0.55, hexAlpha(col, 0.22));
      g.addColorStop(1, hexAlpha(col, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
      return s;
    });
  }

  /** World -> canvas transform: fill the width (or height), zoomed and centred on the camera. */
  private view(): { k: number; ox: number; oy: number } {
    const { width: w, height: h } = this.canvas;
    const k = (Math.max(w, h) / this.L) * this.camZ;
    return { k, ox: w / 2 - this.camX * k, oy: h / 2 - this.camY * k };
  }

  /** Shortest periodic offset. */
  private wrapD(d: number): number {
    const L = this.L;
    return d - L * Math.round(d / L);
  }

  /** Screen x / y of a world point: the periodic copy nearest the camera's centre is drawn. */
  private sx(x: number, k: number, ox: number): number {
    return ox + (this.camX + this.wrapD(x - this.camX)) * k;
  }
  private sy(y: number, k: number, oy: number): number {
    return oy + (this.camY + this.wrapD(y - this.camY)) * k;
  }

  /** Starts a microscope moment: zoom in on the largest repeated structure (or the largest one). */
  focus(now = performance.now()): void {
    const t = this.pickStructure();
    if (!t) return;
    this.target = t;
    this.camTx = this.camTy = null;
    this.focusAt = now;
  }

  /** Centre of the cluster to look at: prefer one whose shape repeats, then the biggest. */
  private pickStructure(near?: [number, number]): [number, number] | null {
    const st = this.b?.structures;
    if (!st) return null;
    let best = -1;
    let bestScore = -Infinity;
    for (let c = 0; c < this.members.length; c++) {
      const m = this.members[c];
      if (m.length < MEMBRANE_MIN) continue;
      const centre = this.centroid(m);
      const score = near
        ? -Math.hypot(this.wrapD(centre[0] - near[0]), this.wrapD(centre[1] - near[1]))
        : (st.matches[c] >= 2 ? 1e6 : 0) + m.length;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best >= 0 ? this.centroid(this.members[best]) : null;
  }

  private centroid(m: Int32Array): [number, number] {
    const pos = this.pos;
    const x0 = pos[2 * m[0]];
    const y0 = pos[2 * m[0] + 1];
    let cx = 0;
    let cy = 0;
    for (let q = 0; q < m.length; q++) {
      cx += this.wrapD(pos[2 * m[q]] - x0);
      cy += this.wrapD(pos[2 * m[q] + 1] - y0);
    }
    return [x0 + cx / m.length, y0 + cy / m.length];
  }

  /** Camera for this moment: in (1.2 s), hold (3 s), out (1.2 s), following the structure. */
  private updateCamera(now: number): boolean {
    const L = this.L;
    const t = now - this.focusAt;
    const IN = 1200;
    const HOLD = 3000;
    const OUT = 1200;
    let p = 0;
    if (t >= 0 && t < IN + HOLD + OUT) {
      const e = (x: number) => x * x * (3 - 2 * x);
      p = t < IN ? e(t / IN) : t < IN + HOLD ? 1 : e(1 - (t - IN - HOLD) / OUT);
      if (this.target) this.target = this.pickStructure(this.target) ?? this.target;
    }
    // Follow the target continuously (no jump of a whole box when it crosses an edge).
    if (this.target) {
      this.camTx = this.camTx === null ? L / 2 + this.wrapD(this.target[0] - L / 2) : this.camTx + this.wrapD(this.target[0] - this.camTx);
      this.camTy = this.camTy === null ? L / 2 + this.wrapD(this.target[1] - L / 2) : this.camTy + this.wrapD(this.target[1] - this.camTy);
    }
    const tx = this.camTx ?? L / 2;
    const ty = this.camTy ?? L / 2;
    this.camX = L / 2 + (tx - L / 2) * p;
    this.camY = L / 2 + (ty - L / 2) * p;
    this.camZ = 1 + (ZOOM - 1) * p;
    return p > 0 && p < 1;
  }

  /** Interpolated positions for this moment. */
  private positionsAt(now: number): Float32Array {
    const { a, b, L } = this;
    if (!b) return this.pos;
    if (!a) {
      this.pos.set(b.xy);
      return this.pos;
    }
    const u = Math.max(0, Math.min(1, (now - b.at) / Math.max(16, b.at - a.at)));
    for (let i = 0; i < this.pos.length; i++) {
      let d = b.xy[i] - a.xy[i];
      if (d > L / 2) d -= L;
      else if (d < -L / 2) d += L;
      let v = a.xy[i] + d * u;
      if (v < 0) v += L;
      else if (v >= L) v -= L;
      this.pos[i] = v;
    }
    return this.pos;
  }

  draw(now = performance.now()): void {
    const dpr = this.resize();
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (this.b) this.positionsAt(now);
    const moving = this.updateCamera(now);
    const { k, ox, oy } = this.view();
    const r = Math.max(4, Math.min(9, w / 110)) * dpr * Math.sqrt(this.camZ);
    if (Math.abs(r - this.spriteR) > 0.5) this.buildSprites(r);

    // Trails: fade what was there, then add this frame's glow (faster fade while the camera moves).
    const t = this.trailCtx;
    t.globalCompositeOperation = 'destination-out';
    t.fillStyle = `rgba(0, 0, 0, ${moving ? 0.5 : TRAIL_FADE})`;
    t.fillRect(0, 0, w, h);
    t.globalCompositeOperation = 'lighter';
    if (this.b) {
      const pos = this.positionsAt(now);
      // Brightness follows speed (kinetic energy): particles flare when the field pumps them.
      let mean = 0;
      for (let i = 0; i < this.speed.length; i++) mean += this.speed[i];
      mean = mean / Math.max(1, this.speed.length) || 1;
      const size = 2 * r;
      for (let i = 0; i < this.types.length; i++) {
        const px = this.sx(pos[2 * i], k, ox);
        const py = this.sy(pos[2 * i + 1], k, oy);
        if (px < -r || py < -r || px > w + r || py > h + r) continue;
        // Dimmer sprites keep dense clusters coloured instead of blowing out to white.
        t.globalAlpha = this.a ? 0.38 + 0.42 * Math.min(1, this.speed[i] / (2 * mean)) : 0.6;
        t.drawImage(this.sprites[this.types[i] % this.sprites.length], px - r, py - r, size, size);
      }
      t.globalAlpha = 1;
    }
    t.globalCompositeOperation = 'source-over';

    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bg, 0, 0);
    this.drawDust(now, dpr);
    const E = this.fieldNow(now);
    if (this.field) this.drawField(E, dpr);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.trail, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (this.showStructures && this.b?.structures) this.drawStructures(k, ox, oy, dpr, E, now);

    // Highlighted structures (from the worker), as soft white rings.
    const rings = this.b?.rings;
    if (rings) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let j = 0; j + 2 < rings.length; j += 3) {
        const px = this.sx(rings[j], k, ox);
        const py = this.sy(rings[j + 1], k, oy);
        const pr = rings[j + 2] * k;
        ctx.moveTo(px + pr, py);
        ctx.arc(px, py, pr, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    // Vignette.
    ctx.drawImage(this.vignette, 0, 0);

    if (this.field) this.drawBubbles(now, dpr);
    if (this.magnifier) this.drawMagnifier(k, ox, oy, dpr);

    // Energy label.
    ctx.font = `${11 * dpr}px system-ui`;
    ctx.fillStyle = this.field ? 'rgba(255, 205, 130, 0.85)' : 'rgba(200, 210, 225, 0.6)';
    ctx.fillText(this.field ? `energy flowing in · field ${E >= 0 ? '→' : '←'}` : 'no energy flow', 8 * dpr, 16 * dpr);

    if (this.cropNote && this.L * k > Math.min(w, h) * 1.02) {
      ctx.font = `${10 * dpr}px system-ui`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round((100 * Math.min(w, h)) / (this.L * k))}% of the world shown`, w - 6 * dpr, h - 6 * dpr);
      ctx.textAlign = 'left';
    }
  }

  /** Faint drifting dust in the background, moving slower than the camera (parallax). Decoration. */
  private drawDust(now: number, dpr: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const par = 0.3 * (this.camZ - 1);
    ctx.fillStyle = 'rgba(190, 220, 230, 0.16)';
    for (let i = 0; i < this.dust.length; i += 4) {
      const x = (((this.dust[i] * w + now * 0.004 * (this.dust[i + 2] - 0.5) * dpr - par * (this.camX - this.L / 2) * 20) % w) + w) % w;
      const y = (((this.dust[i + 1] * h + now * 0.003 * dpr - par * (this.camY - this.L / 2) * 20) % h) + h) % h;
      const s = (0.6 + 1.6 * this.dust[i + 3]) * dpr;
      ctx.fillRect(x, y, s, s);
    }
  }

  /** Occasional bubbles rising from the vent edge (driven panel). Decoration. */
  private drawBubbles(now: number, dpr: number): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (now - this.lastBubble > 2600) {
      this.lastBubble = now;
      const f = (Math.sin(now * 0.0137) + 1) / 2;
      this.bubbles.push({ x: (0.1 + 0.8 * f) * w, born: now, wobble: f * 10 });
    }
    this.bubbles = this.bubbles.filter((b) => now - b.born < 7000);
    for (const b of this.bubbles) {
      const age = (now - b.born) / 7000;
      const y = h - age * h * 1.05;
      const x = b.x + Math.sin(age * 12 + b.wobble) * 6 * dpr;
      const rad = (2.5 + 3 * age) * dpr;
      ctx.strokeStyle = `rgba(210, 240, 255, ${(0.45 * (1 - age)).toFixed(3)})`;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** A circular magnifier in the corner showing a structure at 3x (one whose shape repeats, else the largest). */
  private drawMagnifier(k: number, ox: number, oy: number, dpr: number): void {
    const target = this.pickStructure();
    if (!target) return;
    const { ctx, canvas } = this;
    const R = 62 * dpr;
    const cx = canvas.width - R - 10 * dpr;
    const cy = canvas.height - R - 22 * dpr;
    const tx = this.sx(target[0], k, ox);
    const ty = this.sy(target[1], k, oy);
    const src = R / 3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#04101c';
    ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.drawImage(canvas, tx - src, ty - src, 2 * src, 2 * src, cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `${10 * dpr}px system-ui`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('×3', cx + R * 0.55, cy - R * 0.75);
  }

  /** The simulation step on screen (interpolated between frames). */
  private displayStep(now: number): number {
    const { a, b } = this;
    if (!b) return 0;
    if (!a) return b.step;
    const u = Math.max(0, Math.min(1, (now - b.at) / Math.max(16, b.at - a.at)));
    return a.step + (b.step - a.step) * u;
  }

  /** Field strength as a fraction of E0 (-1..1) at the step on screen; 0 without a field. */
  private fieldNow(now: number): number {
    const f = this.field;
    if (!f || !f.E0) return 0;
    return Math.sin(((2 * Math.PI) / f.period) * this.displayStep(now) * f.dt);
  }

  /**
   * Soft light bands across the panel, perpendicular to the field. They drift with the
   * field's integral (forward while it is positive, back while negative), like a charge
   * pushed back and forth, and brighten with the field's strength.
   */
  private drawField(E: number, dpr: number): void {
    const f = this.field!;
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const phase = ((2 * Math.PI) / f.period) * this.displayStep(performance.now()) * f.dt;
    const spacing = Math.max(w, h) / 3;
    const drift = (1 - Math.cos(phase)) * spacing * 0.9;
    const strength = Math.abs(E);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(f.angle);
    const span = Math.hypot(w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let x = -span / 2 - spacing + (drift % spacing); x < span / 2 + spacing; x += spacing) {
      const g = ctx.createLinearGradient(x - spacing * 0.35, 0, x + spacing * 0.35, 0);
      const a = 0.05 + 0.3 * strength;
      g.addColorStop(0, 'rgba(255, 190, 100, 0)');
      g.addColorStop(0.35, `rgba(255, 190, 100, ${(a * 0.6).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255, 200, 120, ${a.toFixed(3)})`);
      g.addColorStop(0.65, `rgba(255, 190, 100, ${(a * 0.6).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 190, 100, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - spacing * 0.35, -span / 2, spacing * 0.7, span);
    }
    ctx.restore();
    // A warm glow along the bottom edge, like a hydrothermal vent (decorative).
    const v = ctx.createLinearGradient(0, h, 0, h - 60 * dpr);
    v.addColorStop(0, `rgba(255, 140, 60, ${(0.18 + 0.12 * strength).toFixed(3)})`);
    v.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = v;
    ctx.fillRect(0, h - 60 * dpr, w, 60 * dpr);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Bonds, outlines (convex hull, smoothed) coloured by fingerprint, and match ripples. */
  private drawStructures(k: number, ox: number, oy: number, dpr: number, E: number, now: number): void {
    const { ctx, L } = this;
    const pos = this.pos;
    // Bonds, pulsing gently with the field in the driven panel.
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(200, 235, 255, ${(0.16 + 0.22 * Math.abs(E)).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, 0.9 * dpr);
    ctx.beginPath();
    for (let j = 0; j + 1 < this.bonds.length; j += 2) {
      const a = this.bonds[j];
      const b = this.bonds[j + 1];
      // Bonds across the periodic edge are drawn from the near copy, like the outlines.
      const dx = this.wrapD(pos[2 * b] - pos[2 * a]);
      const dy = this.wrapD(pos[2 * b + 1] - pos[2 * a + 1]);
      const x0 = this.sx(pos[2 * a], k, ox);
      const y0 = this.sy(pos[2 * a + 1], k, oy);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + dx * k, y0 + dy * k);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    // Membranes.
    const st = this.b!.structures!;
    const pad = 0.38 * k;
    for (let c = 0; c < this.members.length; c++) {
      const m = this.members[c];
      if (m.length < MEMBRANE_MIN) continue;
      // Unwrap around the first member (clusters are much smaller than the box).
      const x0 = pos[2 * m[0]];
      const y0 = pos[2 * m[0] + 1];
      const pts: [number, number][] = [];
      for (let q = 0; q < m.length; q++) {
        let dx = pos[2 * m[q]] - x0;
        let dy = pos[2 * m[q] + 1] - y0;
        if (dx > L / 2) dx -= L;
        else if (dx < -L / 2) dx += L;
        if (dy > L / 2) dy -= L;
        else if (dy < -L / 2) dy += L;
        pts.push([this.sx(x0, k, ox) + dx * k, this.sy(y0, k, oy) + dy * k]);
      }
      const hull = convexHull(pts);
      if (hull.length < 3) continue;
      // Push the hull outward a little so the outline wraps the particles' glow.
      let cx = 0;
      let cy = 0;
      for (const [x, y] of hull) {
        cx += x / hull.length;
        cy += y / hull.length;
      }
      const grown = hull.map(([x, y]): [number, number] => {
        const d = Math.hypot(x - cx, y - cy) || 1;
        return [x + ((x - cx) / d) * pad, y + ((y - cy) / d) * pad];
      });
      const hue = Math.round(st.hue[c] * 360);
      ctx.beginPath();
      catmullRom(ctx, grown);
      ctx.fillStyle = `hsla(${hue}, 75%, 62%, 0.09)`;
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue}, 85%, 72%, ${st.matches[c] >= 2 ? 0.75 : 0.35})`;
      ctx.lineWidth = (st.matches[c] >= 2 ? 1.8 : 1.1) * dpr;
      ctx.stroke();
    }

    // Ripples and "same shape" labels (2 s).
    this.ripples = this.ripples.filter((r) => now - r.at < 2000);
    for (const r of this.ripples) {
      const age = (now - r.at) / 2000;
      const x = this.sx(r.x, k, ox);
      const y = this.sy(r.y, k, oy);
      const hue = Math.round(r.hue * 360);
      ctx.strokeStyle = `hsla(${hue}, 90%, 75%, ${(1 - age).toFixed(3)})`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(x, y, (10 + 50 * age) * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `${12 * dpr}px system-ui`;
      ctx.fillStyle = `rgba(255, 255, 255, ${(1 - age).toFixed(3)})`;
      ctx.fillText(r.text, x + 12 * dpr, y - (14 + 24 * age) * dpr);
    }
  }
}

/** Convex hull (monotone chain), counter-clockwise. */
function convexHull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Closed Catmull-Rom curve through the points, as Béziers on the current path. */
function catmullRom(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  const n = pts.length;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  ctx.closePath();
}
