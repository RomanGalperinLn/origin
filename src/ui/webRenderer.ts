// Draws the cosmic web: particle density as a glowing, tone-mapped image (dense
// filaments glow, voids go dark), stars on top, and the CMB ripple map that the
// web grows from. Density uses a fixed brightness scale so growth is visible.

// Density image resolution: one pixel per gravity cell (G = 128), so the particles' starting
// lattice can't alias into moiré stripes; the canvas upscales it smoothly.
const RES = 128;

/** Colour ramp for density: black -> deep blue-violet -> purple -> pink -> white. */
const WEB_STOPS: [number, [number, number, number]][] = [
  [0, [0, 0, 4]],
  [0.25, [18, 13, 54]],
  [0.45, [58, 31, 122]],
  [0.65, [156, 63, 168]],
  [0.82, [242, 160, 200]],
  [1, [255, 255, 255]],
];

/** CMB colour ramp (cold -> hot): deep blue, light blue, cream, orange, red. */
const CMB_STOPS: [number, [number, number, number]][] = [
  [0, [12, 28, 120]],
  [0.3, [80, 150, 230]],
  [0.5, [235, 230, 210]],
  [0.7, [245, 150, 60]],
  [1, [170, 20, 20]],
];

function makeLut(stops: [number, [number, number, number]][]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = c0[c] + f * (c1[c] - c0[c]);
  }
  return lut;
}

const WEB_LUT = makeLut(WEB_STOPS);
const CMB_LUT = makeLut(CMB_STOPS);

export class WebRenderer {
  private ctx: CanvasRenderingContext2D;
  private img = document.createElement('canvas');
  private imgCtx: CanvasRenderingContext2D;
  private cmb = document.createElement('canvas');
  private density = new Float32Array(RES * RES);
  private tmp = new Float32Array(RES * RES);
  private imageData: ImageData;
  /** True once the ripple field (CMB map) has been set. */
  hasField = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.img.width = this.img.height = RES;
    this.imgCtx = this.img.getContext('2d')!;
    this.imageData = this.imgCtx.createImageData(RES, RES);
  }

  /**
   * Builds the CMB map from the ripple field. Sachs-Wolfe effect: light climbing out
   * of an overdense region loses energy, so overdense spots look slightly colder.
   */
  setField(delta: Float32Array, G: number): void {
    this.cmb.width = this.cmb.height = G;
    const c = this.cmb.getContext('2d')!;
    const im = c.createImageData(G, G);
    for (let i = 0; i < G * G; i++) {
      const t = Math.max(0, Math.min(1, 0.5 - delta[i] * 0.18));
      const k = Math.round(t * 255) * 3;
      im.data[i * 4] = CMB_LUT[k];
      im.data[i * 4 + 1] = CMB_LUT[k + 1];
      im.data[i * 4 + 2] = CMB_LUT[k + 2];
      im.data[i * 4 + 3] = 255;
    }
    c.putImageData(im, 0, 0);
    this.hasField = true;
  }

  private fit(): { size: number; ox: number; oy: number } {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const size = Math.min(w, h);
    return { size, ox: Math.floor((w - size) / 2), oy: Math.floor((h - size) / 2) };
  }

  /** Draws only the CMB map (chapter 1), under an optional fog layer. */
  drawCmb(fogAlpha: number, fogColor: string, shimmer: number): void {
    const { size, ox, oy } = this.fit();
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.hasField && fogAlpha < 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.cmb, ox, oy, size, size);
    }
    if (fogAlpha > 0) {
      ctx.globalAlpha = fogAlpha;
      ctx.fillStyle = fogColor;
      ctx.fillRect(ox, oy, size, size);
      // A faint, drifting texture so the fog reads as a glowing plasma, not a flat colour.
      if (this.hasField) {
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = fogAlpha * 0.35;
        const d = (shimmer * 40) % size;
        ctx.drawImage(this.cmb, ox - d, oy, size, size);
        ctx.drawImage(this.cmb, ox - d + size, oy, size, size);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Draws particles as glowing density, optional CMB overlay (fading), and stars. */
  drawWeb(pos: Float32Array, stars: Float32Array, cmbAlpha: number): void {
    const { size, ox, oy } = this.fit();
    const ctx = this.ctx;
    const d = this.density;
    d.fill(0);
    const n = pos.length / 2;
    const perPixel = n / (RES * RES); // mean particles per pixel
    for (let p = 0; p < n; p++) {
      // Cloud-in-cell into the image grid (periodic).
      const u = pos[2 * p] * RES - 0.5;
      const v = pos[2 * p + 1] * RES - 0.5;
      const i0 = Math.floor(u);
      const j0 = Math.floor(v);
      const fx = u - i0;
      const fy = v - j0;
      const i = (i0 + RES) % RES;
      const j = (j0 + RES) % RES;
      const i1 = (i + 1) % RES;
      const j1 = (j + 1) % RES;
      d[i + j * RES] += (1 - fx) * (1 - fy);
      d[i1 + j * RES] += fx * (1 - fy);
      d[i + j1 * RES] += (1 - fx) * fy;
      d[i1 + j1 * RES] += fx * fy;
    }
    // Light [1 2 1] smoothing in x and y: expanding voids hold fewer particles than pixels,
    // which otherwise shows up as a leftover lattice texture.
    const tmp = this.tmp;
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) {
        const c = i + j * RES;
        tmp[c] = 0.25 * d[((i + RES - 1) % RES) + j * RES] + 0.5 * d[c] + 0.25 * d[((i + 1) % RES) + j * RES];
      }
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) {
        const c = i + j * RES;
        d[c] = 0.25 * tmp[i + ((j + RES - 1) % RES) * RES] + 0.5 * tmp[c] + 0.25 * tmp[i + ((j + 1) % RES) * RES];
      }
    const px = this.imageData.data;
    // Tone curve: mean density is dim, near-empty voids go dark, filaments and knots glow.
    const K = 1.2;
    const norm = 1 / Math.log1p(K * 60);
    for (let c = 0; c < RES * RES; c++) {
      const rho = d[c] / perPixel; // in units of the mean density
      const t = Math.min(1, Math.log1p(K * rho) * norm);
      const k = Math.round(t * 255) * 3;
      px[c * 4] = WEB_LUT[k];
      px[c * 4 + 1] = WEB_LUT[k + 1];
      px[c * 4 + 2] = WEB_LUT[k + 2];
      px[c * 4 + 3] = 255;
    }
    this.imgCtx.putImageData(this.imageData, 0, 0);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, ox, oy, size, size);
    // Glow: a blurred copy added on top.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.filter = `blur(${Math.max(2, size / 160)}px)`;
    ctx.drawImage(this.img, ox, oy, size, size);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (cmbAlpha > 0 && this.hasField) {
      ctx.globalAlpha = cmbAlpha;
      ctx.drawImage(this.cmb, ox, oy, size, size);
      ctx.globalAlpha = 1;
    }

    // Stars: soft glow, with a brief flash when they ignite.
    const scale = size;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < stars.length; k += 3) {
      const x = ox + stars[k] * scale;
      const y = oy + stars[k + 1] * scale;
      const age = stars[k + 2];
      const flash = age < 30 ? 1 - age / 30 : 0;
      // Small and fairly dim: many stars share each dense knot and their glows add up.
      const r = (size / 260) * (1 + 1.5 * flash);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, `rgba(255, 250, 225, ${0.55 + 0.4 * flash})`);
      g.addColorStop(0.3, `rgba(255, 215, 140, ${0.18 + 0.3 * flash})`);
      g.addColorStop(1, 'rgba(255, 200, 120, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
