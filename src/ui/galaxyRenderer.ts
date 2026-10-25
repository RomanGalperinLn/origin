// Draws the galaxy model: star points splatted additively into an image (so dense regions
// glow), tone-mapped, with a soft blurred glow on top, viewed at a tilt. Optional marker
// for the Sun's neighbourhood.

import { OUT_STRIDE } from '../galaxy/model';

export interface GalaxyView {
  /** Viewing tilt in radians: 0 = face-on, π/2 = edge-on. */
  inclination: number;
  /** Half-width of the view (kpc) and its centre (kpc, in the projected plane). */
  radius: number;
  cx: number;
  cy: number;
  /** Sun marker (kpc, disk plane) and its opacity (0 hides it). */
  sun: [number, number] | null;
  sunAlpha: number;
  sunLabel: string;
}

/** Image width in pixels (height follows the canvas aspect). */
const RES = 520;

export class GalaxyRenderer {
  private ctx: CanvasRenderingContext2D;
  private img = document.createElement('canvas');
  private imgCtx: CanvasRenderingContext2D;
  private acc = new Float32Array(0);
  private imageData: ImageData | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.imgCtx = this.img.getContext('2d')!;
  }

  draw(points: Float32Array, n: number, v: GalaxyView): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const W = RES;
    const H = Math.max(1, Math.round((RES * h) / w));
    if (this.img.width !== W || this.img.height !== H) {
      this.img.width = W;
      this.img.height = H;
      this.acc = new Float32Array(W * H * 3);
      this.imageData = this.imgCtx.createImageData(W, H);
    }
    const acc = this.acc;
    acc.fill(0);
    const ci = Math.cos(v.inclination);
    const si = Math.sin(v.inclination);
    const scale = W / 2 / v.radius; // pixels per kpc
    // Zoomed in, each pixel covers less sky and holds fewer stars: brighten points to compensate (partly).
    const gain = 0.9 * Math.pow(17 / v.radius, 1.2);
    for (let i = 0; i < n; i++) {
      const o = i * OUT_STRIDE;
      const X = points[o];
      const Y = points[o + 1] * ci + points[o + 2] * si;
      const u = (X - v.cx) * scale + W / 2 - 0.5;
      const q = (Y - v.cy) * scale + H / 2 - 0.5;
      if (u < 0 || q < 0 || u >= W - 1 || q >= H - 1) continue;
      const i0 = Math.floor(u);
      const j0 = Math.floor(q);
      const fx = u - i0;
      const fy = q - j0;
      const b = points[o + 3] * gain;
      const r = points[o + 4] * b;
      const g = points[o + 5] * b;
      const bl = points[o + 6] * b;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      let c = (i0 + j0 * W) * 3;
      acc[c] += r * w00;
      acc[c + 1] += g * w00;
      acc[c + 2] += bl * w00;
      acc[c + 3] += r * w10;
      acc[c + 4] += g * w10;
      acc[c + 5] += bl * w10;
      c += W * 3;
      acc[c] += r * w01;
      acc[c + 1] += g * w01;
      acc[c + 2] += bl * w01;
      acc[c + 3] += r * w11;
      acc[c + 4] += g * w11;
      acc[c + 5] += bl * w11;
    }
    // Tone map: 1 - exp(-k x) keeps the crowded centre from blowing out.
    const px = this.imageData!.data;
    for (let k = 0, m = 0; k < W * H; k++, m += 3) {
      px[k * 4] = 255 * (1 - Math.exp(-acc[m]));
      px[k * 4 + 1] = 255 * (1 - Math.exp(-acc[m + 1]));
      px[k * 4 + 2] = 255 * (1 - Math.exp(-acc[m + 2]));
      px[k * 4 + 3] = 255;
    }
    this.imgCtx.putImageData(this.imageData!, 0, 0);

    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, 0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.filter = `blur(${Math.max(3, w / 140)}px)`;
    ctx.drawImage(this.img, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (v.sun && v.sunAlpha > 0) {
      const k = (w / W) * scale;
      const sx = (v.sun[0] - v.cx) * k + w / 2;
      const sy = (v.sun[1] * ci - v.cy) * k + h / 2;
      ctx.globalAlpha = v.sunAlpha;
      ctx.strokeStyle = '#ffd36b';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(sx, sy, 9 * dpr, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5 * dpr, 0, 2 * Math.PI);
      ctx.fill();
      ctx.font = `${12 * dpr}px system-ui`;
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(v.sunLabel, sx + 13 * dpr, sy + 4 * dpr);
      ctx.globalAlpha = 1;
    }
  }
}
