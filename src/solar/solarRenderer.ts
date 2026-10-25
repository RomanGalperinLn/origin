// Draws chapter 4: the young Sun, the fading gas disk (scripted), the simulated bodies with
// their orbits and collision flashes, and the Moon-forming impact as an inset illustration.

import { orbitOf } from './nbody';
import { BODY_STRIDE } from './protocol';

/** Half-width of the view (AU). The disk reaches 4 AU. */
const VIEW_AU = 4.4;
/** Bodies above this mass (Earth masses) get their orbit drawn. */
const ORBIT_MASS = 0.05;
/** Steps a collision flash lasts. */
const FLASH_STEPS = 60;

export interface SolarDrawOptions {
  /** Sun brightness 0..1 (scripted ignition). */
  sun: number;
  /** Gas-disk glow 0..1 (scripted clearing). */
  gas: number;
  /** Body index of Earth (-1 if not known yet) and its label (null = not labelled yet). */
  earth: number;
  earthLabel: string | null;
  /** Moon-forming impact illustration progress 0..1, or null when not shown. */
  impact: number | null;
}

/** Deterministic pseudo-random in [0, 1) from an integer (rendering only). */
function hash(k: number): number {
  let t = (k * 0x9e3779b1 + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const smooth = (a: number, b: number, x: number) => {
  const f = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return f * f * (3 - 2 * f);
};

export class SolarRenderer {
  private ctx: CanvasRenderingContext2D;
  private stars = document.createElement('canvas');
  private starsSize = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  private fit(): { size: number; ox: number; oy: number; dpr: number } {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const size = Math.min(w, h);
    return { size, ox: Math.floor((w - size) / 2), oy: Math.floor((h - size) / 2), dpr };
  }

  /** A faint, fixed star field behind everything. */
  private starField(size: number): HTMLCanvasElement {
    if (this.starsSize === size) return this.stars;
    this.stars.width = this.stars.height = size;
    const c = this.stars.getContext('2d')!;
    c.fillStyle = '#000';
    c.fillRect(0, 0, size, size);
    for (let k = 0; k < 260; k++) {
      const b = 0.15 + 0.45 * hash(3 * k + 2);
      c.fillStyle = `rgba(220, 225, 255, ${b})`;
      c.fillRect(hash(3 * k) * size, hash(3 * k + 1) * size, size / 700 + 0.5, size / 700 + 0.5);
    }
    this.starsSize = size;
    return this.stars;
  }

  /**
   * Draws a frame. Returns the impact inset's box in CSS pixels (for the RECONSTRUCTED badge),
   * or null when the inset is hidden.
   */
  draw(bodies: Float32Array | null, o: SolarDrawOptions): { x: number; y: number; r: number } | null {
    const { size, ox, oy, dpr } = this.fit();
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.starField(size), ox, oy);
    const cx = ox + size / 2;
    const cy = oy + size / 2;
    const scale = size / 2 / VIEW_AU; // px per AU
    const u = size / 600; // size unit

    // Gas disk: warm glow that fades as the young Sun blows it away (scripted).
    if (o.gas > 0) {
      const g = ctx.createRadialGradient(cx, cy, 0.2 * scale, cx, cy, 4.6 * scale);
      g.addColorStop(0, `rgba(255, 196, 130, ${0.42 * o.gas})`);
      g.addColorStop(0.35, `rgba(205, 120, 70, ${0.26 * o.gas})`);
      g.addColorStop(1, 'rgba(90, 40, 30, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.6 * scale, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Distance guides: 1, 2, 3, 4 AU.
    ctx.strokeStyle = 'rgba(140, 150, 180, 0.13)';
    ctx.lineWidth = Math.max(1, u * 0.8);
    ctx.setLineDash([3 * u, 5 * u]);
    for (let r = 1; r <= 4; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(160, 170, 200, 0.45)';
    ctx.font = `${Math.round(10 * u * 1.1)}px system-ui`;
    for (let r = 1; r <= 4; r++) ctx.fillText(`${r} AU`, cx + 3 * u, cy - r * scale - 3 * u);

    // The Sun: a dim red protostar brightening to yellow-white.
    const sr = (5 + 4 * o.sun) * u;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr * 7);
    glow.addColorStop(0, `rgba(255, ${Math.round(150 + 100 * o.sun)}, ${Math.round(80 + 140 * o.sun)}, ${0.5 + 0.5 * o.sun})`);
    glow.addColorStop(0.15, `rgba(255, ${Math.round(120 + 100 * o.sun)}, 80, ${0.25 + 0.35 * o.sun})`);
    glow.addColorStop(1, 'rgba(255, 140, 60, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - sr * 7, cy - sr * 7, sr * 14, sr * 14);
    ctx.fillStyle = `rgb(255, ${Math.round(170 + 85 * o.sun)}, ${Math.round(110 + 135 * o.sun)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, sr, 0, 2 * Math.PI);
    ctx.fill();

    if (!bodies) return null;
    let earthX = NaN;
    let earthY = NaN;

    // Orbits of the bigger bodies (osculating ellipses around the Sun).
    for (let k = 0; k < bodies.length; k += BODY_STRIDE) {
      const m = bodies[k + 5];
      const isEarth = bodies[k] === o.earth && o.earthLabel !== null;
      if (m < ORBIT_MASS && !isEarth) continue;
      const { a, e, w } = orbitOf(bodies[k + 1], bodies[k + 2], bodies[k + 3], bodies[k + 4]);
      if (!(a > 0 && e < 0.95 && a < 2 * VIEW_AU)) continue;
      const b = a * Math.sqrt(1 - e * e);
      ctx.strokeStyle = isEarth ? 'rgba(111, 182, 255, 0.85)' : 'rgba(210, 190, 160, 0.16)';
      ctx.lineWidth = (isEarth ? 1.6 : 1) * Math.max(1, u);
      ctx.beginPath();
      ctx.ellipse(cx - a * e * Math.cos(w) * scale, cy + a * e * Math.sin(w) * scale, a * scale, b * scale, -w, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Bodies: size grows with mass (not to scale); recent mergers flash.
    for (let k = 0; k < bodies.length; k += BODY_STRIDE) {
      const x = cx + bodies[k + 1] * scale;
      const y = cy - bodies[k + 2] * scale;
      const m = bodies[k + 5];
      const since = bodies[k + 6];
      const isEarth = bodies[k] === o.earth && o.earthLabel !== null;
      const r = (0.9 + 3.6 * Math.cbrt(m)) * u;
      if (since < FLASH_STEPS) {
        const f = 1 - since / FLASH_STEPS;
        const fg = ctx.createRadialGradient(x, y, 0, x, y, r * (3 + 4 * f));
        fg.addColorStop(0, `rgba(255, 235, 170, ${0.85 * f})`);
        fg.addColorStop(1, 'rgba(255, 160, 80, 0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(x, y, r * (3 + 4 * f), 0, 2 * Math.PI);
        ctx.fill();
      }
      const shade = Math.min(1, 0.35 + 0.65 * Math.cbrt(m));
      ctx.fillStyle = isEarth
        ? '#8fcaff'
        : `rgb(${Math.round(150 + 90 * shade)}, ${Math.round(130 + 75 * shade)}, ${Math.round(110 + 50 * shade)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
      if (isEarth) {
        earthX = x;
        earthY = y;
        ctx.strokeStyle = 'rgba(143, 202, 255, 0.9)';
        ctx.lineWidth = Math.max(1, 1.2 * u);
        ctx.beginPath();
        ctx.arc(x, y, r + 4 * u, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = '#cfe6ff';
        ctx.font = `600 ${Math.round(12 * u * 1.1)}px system-ui`;
        ctx.fillText(o.earthLabel!, x + r + 7 * u, y + 4 * u);
      }
    }

    if (o.impact === null || !Number.isFinite(earthX)) return null;
    return this.drawImpact(o.impact, earthX, earthY, ox, oy, size, u, dpr);
  }

  /**
   * The Moon-forming impact, as an illustration in a magnified inset (not simulated):
   * Theia approaches, flash, a debris ring forms and gathers into the Moon.
   */
  private drawImpact(f: number, ex: number, ey: number, ox: number, oy: number, size: number, u: number, dpr: number) {
    const ctx = this.ctx;
    const R = 0.21 * size;
    // In the empty margin beside the system if there is room, else over its top-right corner.
    const margin = this.canvas.width - (ox + size);
    const inMargin = margin >= 2 * R + 24 * u;
    const icx = inMargin ? ox + size + margin / 2 : ox + size - R - 14 * u;
    const icy = inMargin ? oy + size * 0.36 : oy + R + 14 * u;
    const fade = smooth(0, 0.06, f);

    // Leader line from Earth to the inset.
    ctx.globalAlpha = fade;
    ctx.strokeStyle = 'rgba(143, 202, 255, 0.5)';
    ctx.lineWidth = Math.max(1, u);
    const ang = Math.atan2(ey - icy, ex - icx);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(icx + R * Math.cos(ang), icy + R * Math.sin(ang));
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(icx, icy, R, 0, 2 * Math.PI);
    ctx.fillStyle = '#04060c';
    ctx.fill();
    ctx.clip();

    const e = 0.2 * R; // Earth's radius in the inset
    const th = 0.53 * e; // Theia: about Mars-sized
    const hit = 0.36; // contact moment
    // Theia comes in from the upper left on a grazing path.
    if (f < hit + 0.04) {
      const p = smooth(0.02, hit, f);
      const d = (1 - p) * 1.25 * R + p * (e + th * 0.55);
      const a0 = (-150 * Math.PI) / 180;
      const tx = icx + d * Math.cos(a0) + (1 - p) * 0.25 * R;
      const ty = icy + d * Math.sin(a0) + 0.35 * e;
      const tg = ctx.createRadialGradient(tx - th * 0.3, ty - th * 0.3, th * 0.1, tx, ty, th);
      tg.addColorStop(0, '#b9a089');
      tg.addColorStop(1, '#5d4a3d');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.arc(tx, ty, th, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Debris: particles thrown out from the impact point into a ring (seen tilted), then
    // gathering into the Moon. The back half is drawn behind Earth, the front half in front.
    const TILT = 0.4;
    const moonR = 0.27 * e; // the Moon's radius is about 0.27 Earth radii
    const moonOrbit = 3 * e; // the Moon probably formed within a few Earth radii
    const moonAng = -0.6 + 2.2 * f;
    const ND = 260;
    const out = smooth(hit, 0.55, f);
    const gather = smooth(0.66, 0.97, f);
    const front: number[] = [];
    const back: number[] = [];
    if (f > hit) {
      const ix = icx + (e + 0.2 * th) * Math.cos((-150 * Math.PI) / 180);
      const iy = icy + (e + 0.2 * th) * Math.sin((-150 * Math.PI) / 180) + 0.3 * e;
      for (let k = 0; k < ND; k++) {
        const r0 = e * (1.5 + 1.3 * hash(5 * k + 1) * hash(5 * k + 1));
        const spin = (3.2 / Math.pow(r0 / e, 1.5)) * f;
        const a = 2 * Math.PI * hash(5 * k) + spin;
        // Ring position, pulled toward the Moon as it gathers.
        const rr = r0 + (moonOrbit - r0) * gather;
        let da = a - moonAng;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const aa = moonAng + da * (1 - gather);
        const rx = icx + rr * Math.cos(aa);
        const ry = icy + rr * Math.sin(aa) * TILT;
        (Math.sin(aa) < 0 ? back : front).push(ix + (rx - ix) * out, iy + (ry - iy) * out, k);
      }
    }
    const drawDebris = (list: number[]) => {
      for (let n = 0; n < list.length; n += 3) {
        const k = list[n + 2];
        const b = (0.45 + 0.5 * hash(5 * k + 2)) * (1 - 0.85 * gather);
        ctx.fillStyle = `rgba(255, ${Math.round(170 + 60 * hash(5 * k + 3))}, 120, ${b})`;
        const s = (1 + hash(5 * k + 4)) * u;
        ctx.fillRect(list[n] - s / 2, list[n + 1] - s / 2, s, s);
      }
    };
    const mx = icx + moonOrbit * Math.cos(moonAng);
    const my = icy + moonOrbit * Math.sin(moonAng) * TILT;
    const drawMoon = () => {
      if (gather <= 0.05) return;
      const mr = moonR * Math.min(1, gather * 1.1);
      const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      mg.addColorStop(0, '#d9d4cc');
      mg.addColorStop(1, '#7b766f');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, 2 * Math.PI);
      ctx.fill();
    };
    const moonBehind = Math.sin(moonAng) < 0;
    drawDebris(back);
    if (moonBehind) drawMoon();

    // The young Earth: a molten glow, hotter after the impact.
    const heat = f > hit ? 1 - 0.5 * smooth(hit, 1, f) : 0.3;
    const eg = ctx.createRadialGradient(icx - e * 0.3, icy - e * 0.3, e * 0.1, icx, icy, e * (1 + 0.15 * heat));
    eg.addColorStop(0, `rgb(255, ${Math.round(150 + 60 * heat)}, ${Math.round(80 + 40 * heat)})`);
    eg.addColorStop(0.6, '#a2401a');
    eg.addColorStop(1, '#3a1208');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(icx, icy, e * (1 + 0.08 * heat), 0, 2 * Math.PI);
    ctx.fill();
    drawDebris(front);
    if (!moonBehind) drawMoon();

    // Flash at contact.
    const flash = Math.max(0, 1 - Math.abs(f - (hit + 0.03)) / 0.07);
    if (flash > 0) {
      const fx = icx - 0.75 * e;
      const fy = icy - 0.2 * e;
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * 0.9);
      fg.addColorStop(0, `rgba(255, 255, 240, ${flash})`);
      fg.addColorStop(0.3, `rgba(255, 220, 160, ${0.6 * flash})`);
      fg.addColorStop(1, 'rgba(255, 180, 100, 0)');
      ctx.fillStyle = fg;
      ctx.fillRect(icx - R, icy - R, 2 * R, 2 * R);
    }

    ctx.fillStyle = 'rgba(200, 210, 230, 0.6)';
    ctx.font = `${Math.round(10 * u * 1.1)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('magnified, not to scale', icx, icy + R - 22 * u);
    ctx.textAlign = 'start';
    ctx.restore();

    ctx.strokeStyle = 'rgba(143, 202, 255, 0.55)';
    ctx.lineWidth = Math.max(1, 1.2 * u);
    ctx.beginPath();
    ctx.arc(icx, icy, R, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return { x: icx / dpr, y: (icy - R) / dpr, r: R / dpr };
  }
}
