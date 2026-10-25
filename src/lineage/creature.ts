// A parametric creature: ~30 numbers (spine, body widths, head shape, two limbs, tail, eye)
// become six closed outlines, always the same six in the same order with the same number of
// points: body, head, front limb, back limb, tail/fin, eye. Every key-frame drawing is one
// parameter set, so any two can be blended part by part (limbs swing and grow instead of
// melting), which is what makes the morph look continuous. Missing parts are tiny and
// tucked inside the body, so they can grow out. Our own simple infographic style.

export interface Limb {
  /** Where it attaches along the spine (0 = hip/rear, 1 = shoulder/front). */
  at: number;
  /** How far from the spine line toward the belly it attaches (0 = on the line, 1 = belly surface). */
  depth: number;
  /** Upper and lower segment lengths and the foot/hand length. */
  l1: number;
  l2: number;
  foot: number;
  /** Upper segment direction (degrees, y up: -90 = straight down) and the knee/elbow bend. */
  a1: number;
  a2: number;
  /** Width at the root. */
  w: number;
}

export interface CreatureParams {
  // Body: a spine from the rear (hip) end to the front (shoulder) end, with a width profile.
  spineLen: number;
  /** Degrees: 0 = horizontal facing right, 90 = upright. */
  spineAngle: number;
  /** Arch of the spine as a fraction of its length (+ = arched up). */
  spineBend: number;
  wRear: number;
  wMid: number;
  wFront: number;
  /** Bumpy outline (0..1): a clump of cells. */
  lobes: number;
  // Head
  headLen: number;
  headH: number;
  /** Rounded braincase bulging up and back (0..1.3). */
  cranium: number;
  /** Long, narrow snout (0..1). */
  snout: number;
  /** Distance from the spine's front end to the head centre, and its direction relative to the spine. */
  neck: number;
  neckTilt: number;
  /** Facing direction of the head (degrees; 0 = right). */
  headFace: number;
  /** 1 = the "head" sits in the middle of the body: a cell's nucleus. */
  nucleus: number;
  front: Limb;
  back: Limb;
  // Tail (or flagellum, or fish tail): from the rear end, pointing back.
  tailLen: number;
  tailW: number;
  /** Droop below the spine's backward direction (degrees). */
  tailDroop: number;
  /** Fan-shaped fin at the tail's end (half-height). */
  fin: number;
  eye: number;
  /** 0 = floating (in water), 1 = standing on the ground. */
  grounded: number;
  body: string;
  head: string;
  eyeColor: string;
}

export const PART_NAMES = ['body', 'head', 'front limb', 'back limb', 'tail', 'eye'] as const;
/** Painting order, back to front (indices into PART_NAMES): the far limb and tail tuck behind the body. */
export const DRAW_ORDER = [4, 3, 0, 2, 1, 5] as const;
/** Points per outline (fixed, so every drawing has the same structure). */
export const POINTS = { body: 64, head: 40, limb: 28, tail: 28, eye: 14 } as const;

type Pt = [number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const dir = (d: number): Pt => [Math.cos(rad(d)), Math.sin(rad(d))];
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

// --- colour ----------------------------------------------------------------------------

function hexToRgb(h: string): [number, number, number] {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const rgbToHex = (c: number[]) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
export const mixColor = (a: string, b: string, u: number) => {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => lerp(v, cb[i], u)));
};
export const darken = (c: string, k = 0.55) => mixColor(c, '#000000', 1 - k);

// --- blending ------------------------------------------------------------------------

function lerpLimb(a: Limb, b: Limb, u: number): Limb {
  const out = {} as Limb;
  for (const k of Object.keys(a) as (keyof Limb)[]) out[k] = lerp(a[k], b[k], u);
  return out;
}

/** Blends two creatures part by part (numbers linearly, colours in RGB). */
export function blendCreatures(a: CreatureParams, b: CreatureParams, u: number): CreatureParams {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof CreatureParams)[]) {
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number') (out as Record<string, unknown>)[k] = lerp(va, vb as number, u);
    else if (typeof va === 'string') (out as Record<string, unknown>)[k] = mixColor(va, vb as string, u);
    else (out as Record<string, unknown>)[k] = lerpLimb(va as Limb, vb as Limb, u);
  }
  return out;
}

// --- geometry (y up) ----------------------------------------------------------------

interface Spine {
  at(s: number): Pt;
  tangent(s: number): Pt;
  width(s: number): number;
}

function makeSpine(p: CreatureParams): Spine {
  const t = dir(p.spineAngle);
  const n: Pt = [-t[1], t[0]];
  const L = Math.max(0.5, p.spineLen);
  const c: Pt = [t[0] * L * 0.5 + n[0] * p.spineBend * L * 2, t[1] * L * 0.5 + n[1] * p.spineBend * L * 2];
  const e: Pt = [t[0] * L, t[1] * L];
  // Width: a quadratic through rear, mid and front values.
  const wm = 2 * p.wMid - (p.wRear + p.wFront) / 2;
  return {
    at: (s) => {
      const b = 2 * s * (1 - s);
      const d = s * s;
      return [b * c[0] + d * e[0], b * c[1] + d * e[1]];
    },
    tangent: (s) => {
      const x = 2 * (1 - s) * c[0] + 2 * s * (e[0] - c[0]);
      const y = 2 * (1 - s) * c[1] + 2 * s * (e[1] - c[1]);
      const m = Math.hypot(x, y) || 1;
      return [x / m, y / m];
    },
    width: (s) => Math.max(0.5, (1 - s) * (1 - s) * p.wRear + 2 * s * (1 - s) * wm + s * s * p.wFront),
  };
}

/** Body outline: top edge rear-to-front, front cap, bottom edge front-to-rear, rear cap. */
function bodyOutline(p: CreatureParams, sp: Spine): Pt[] {
  const side = 22;
  const cap = POINTS.body / 2 - side;
  const pts: Pt[] = [];
  const edge = (s: number, sign: number): Pt => {
    const q = sp.at(s);
    const t = sp.tangent(s);
    const w = sp.width(s);
    return [q[0] - t[1] * w * sign, q[1] + t[0] * w * sign];
  };
  for (let i = 0; i < side; i++) pts.push(edge(i / (side - 1), 1));
  const capAt = (s: number, from: number) => {
    const q = sp.at(s);
    const t = sp.tangent(s);
    const w = sp.width(s);
    const base = Math.atan2(t[1], t[0]);
    for (let i = 1; i <= cap; i++) {
      const a = base + from - (Math.PI * i) / (cap + 1);
      pts.push([q[0] + Math.cos(a) * w, q[1] + Math.sin(a) * w]);
    }
  };
  capAt(1, Math.PI / 2);
  for (let i = side - 1; i >= 0; i--) pts.push(edge(i / (side - 1), -1));
  capAt(0, -Math.PI / 2);
  if (p.lobes > 0.001) {
    // A clump of cells: bump the outline in and out around its centre.
    let cx = 0;
    let cy = 0;
    for (const q of pts) {
      cx += q[0] / pts.length;
      cy += q[1] / pts.length;
    }
    pts.forEach((q, i) => {
      const k = 1 + p.lobes * 0.1 * Math.cos(7 * Math.atan2(q[1] - cy, q[0] - cx));
      pts[i] = [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k];
    });
  }
  return pts;
}

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const q of pts) {
    x += q[0];
    y += q[1];
  }
  return [x / pts.length, y / pts.length];
}

function headOutline(p: CreatureParams, c: Pt): Pt[] {
  const a = Math.max(0.5, p.headLen / 2);
  const b = Math.max(0.5, p.headH / 2);
  const face = rad(p.headFace);
  const pts: Pt[] = [];
  for (let i = 0; i < POINTS.head; i++) {
    const f = (i / POINTS.head) * 2 * Math.PI;
    const cf = Math.cos(f);
    const sf = Math.sin(f);
    const fwd = Math.max(0, cf);
    let x = a * cf * (1 + p.snout * 0.7 * fwd * fwd);
    let y = b * sf * (1 - p.snout * 0.45 * fwd);
    // Braincase: the top and back swell.
    if (sf > 0) y += p.cranium * b * 0.32 * sf * (1 - 0.7 * fwd);
    if (cf < 0) x -= p.cranium * a * 0.18 * cf * cf * Math.max(0, sf + 0.3);
    pts.push([c[0] + x * Math.cos(face) - y * Math.sin(face), c[1] + x * Math.sin(face) + y * Math.cos(face)]);
  }
  return pts;
}

function circle(c: Pt, r: number, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const f = (i / n) * 2 * Math.PI;
    pts.push([c[0] + Math.cos(f) * r, c[1] + Math.sin(f) * r]);
  }
  return pts;
}

/** A tapered polyline (root -> knee -> ankle -> toe) as a closed outline. */
function strokeOutline(path: Pt[], w0: number, w1: number, n: number): Pt[] {
  // Resample the polyline at n/2 points by arc length.
  const seg: number[] = [0];
  for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = Math.max(1e-6, seg[seg.length - 1]);
  const half = n / 2;
  const centre: Pt[] = [];
  const tang: Pt[] = [];
  for (let k = 0; k < half; k++) {
    const d = (k / (half - 1)) * total;
    let j = 1;
    while (j < seg.length - 1 && seg[j] < d) j++;
    const u = Math.min(1, Math.max(0, (d - seg[j - 1]) / Math.max(1e-6, seg[j] - seg[j - 1])));
    centre.push([lerp(path[j - 1][0], path[j][0], u), lerp(path[j - 1][1], path[j][1], u)]);
    const tx = path[j][0] - path[j - 1][0];
    const ty = path[j][1] - path[j - 1][1];
    const m = Math.hypot(tx, ty) || 1;
    tang.push([tx / m, ty / m]);
  }
  const width = (k: number) => lerp(w0, w1, k / (half - 1)) * (k === half - 1 ? 0.6 : 1);
  const pts: Pt[] = [];
  for (let k = 0; k < half; k++) pts.push([centre[k][0] - tang[k][1] * width(k), centre[k][1] + tang[k][0] * width(k)]);
  for (let k = half - 1; k >= 0; k--) pts.push([centre[k][0] + tang[k][1] * width(k), centre[k][1] - tang[k][0] * width(k)]);
  return pts;
}

function limbOutline(l: Limb, sp: Spine): Pt[] {
  const q = sp.at(l.at);
  const t = sp.tangent(l.at);
  const w = sp.width(l.at);
  // Belly side is the right-hand normal of the spine direction.
  const root: Pt = [q[0] + t[1] * w * l.depth, q[1] - t[0] * w * l.depth];
  const d1 = dir(l.a1);
  const knee: Pt = [root[0] + d1[0] * l.l1, root[1] + d1[1] * l.l1];
  const d2 = dir(l.a1 + l.a2);
  const ankle: Pt = [knee[0] + d2[0] * l.l2, knee[1] + d2[1] * l.l2];
  const toe: Pt = [ankle[0] + l.foot, ankle[1]];
  return strokeOutline([root, knee, ankle, toe], Math.max(0.5, l.w), Math.max(0.4, l.w * 0.55), POINTS.limb);
}

function tailOutline(p: CreatureParams, sp: Spine): Pt[] {
  // Starts just inside the rear surface of the body (a flagellum grows from the cell's edge).
  const r0 = sp.at(0);
  const t0 = sp.tangent(0);
  const inset = sp.width(0) * 0.7;
  const base: Pt = [r0[0] - t0[0] * inset, r0[1] - t0[1] * inset];
  const back = p.spineAngle + 180 + p.tailDroop;
  const half = POINTS.tail / 2;
  const centre: Pt[] = [];
  const tang: Pt[] = [];
  // A gentle curve: the droop increases along the tail.
  let pos: Pt = base;
  const step = Math.max(0.3, p.tailLen) / (half - 1);
  for (let k = 0; k < half; k++) {
    const a = back + p.tailDroop * 0.6 * (k / (half - 1));
    const d = dir(a);
    centre.push(pos);
    tang.push(d);
    pos = [pos[0] + d[0] * step, pos[1] + d[1] * step];
  }
  const width = (k: number) => {
    const s = k / (half - 1);
    const taper = lerp(Math.max(0.5, p.tailW), Math.max(0.3, p.tailW * 0.18), s);
    const fan = p.fin * Math.max(0, Math.min(1, (s - 0.55) / 0.45)) ** 1.5;
    return taper + fan;
  };
  const pts: Pt[] = [];
  for (let k = 0; k < half; k++) pts.push([centre[k][0] - tang[k][1] * width(k), centre[k][1] + tang[k][0] * width(k)]);
  for (let k = half - 1; k >= 0; k--) pts.push([centre[k][0] + tang[k][1] * width(k), centre[k][1] - tang[k][0] * width(k)]);
  return pts;
}

export interface CreatureShape {
  /** Six outlines in PART_NAMES order, already placed in the view box (y down). */
  parts: Pt[][];
  fills: string[];
  stroke: string;
  /** Outline width per part: thinner for tiny parts, so hidden ones vanish. */
  strokeWidths: number[];
}

export const VIEW = { w: 400, h: 260, ground: 236 } as const;

/** Builds the six outlines, scales the creature to a fixed on-screen size and places it. */
export function creatureShape(p: CreatureParams): CreatureShape {
  const sp = makeSpine(p);
  const body = bodyOutline(p, sp);
  // Head: at the end of the neck, or (as a nucleus) inside the body.
  const front = sp.at(1);
  const nd = dir(p.spineAngle + p.neckTilt);
  const neckEnd: Pt = [front[0] + nd[0] * p.neck, front[1] + nd[1] * p.neck];
  const mid = centroid(body);
  const hc: Pt = [lerp(neckEnd[0], mid[0], p.nucleus), lerp(neckEnd[1], mid[1], p.nucleus)];
  const head = headOutline(p, hc);
  const face = rad(p.headFace);
  const ex = p.headLen * 0.24 * (1 + p.snout * 0.2);
  const ey = p.headH * 0.12;
  const eye = circle([hc[0] + ex * Math.cos(face) - ey * Math.sin(face), hc[1] + ex * Math.sin(face) + ey * Math.cos(face)], Math.max(0.25, p.eye), POINTS.eye);
  const parts = [body, head, limbOutline(p.front, sp), limbOutline(p.back, sp), tailOutline(p, sp), eye];

  // Fit: same on-screen size for every creature (real size is shown on a scale bar).
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const part of parts)
    for (const [x, y] of part) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const k = Math.min(300 / Math.max(1, x1 - x0), 178 / Math.max(1, y1 - y0));
  const cx = (x0 + x1) / 2;
  // Floating creatures sit mid-frame; grounded ones stand on the ground line.
  const H = (y1 - y0) * k;
  const floatTop = (VIEW.h - 20 - H) / 2;
  const standTop = VIEW.ground - H;
  const top = lerp(floatTop, standTop, Math.max(0, Math.min(1, p.grounded)));
  const placed = parts.map((part) => part.map(([x, y]): Pt => [VIEW.w / 2 + 14 + (x - cx) * k, top + (y1 - y) * k]));
  const strokeWidths = placed.map((part) => {
    let a = Infinity;
    let b = -Infinity;
    let c = Infinity;
    let d = -Infinity;
    for (const [x, y] of part) {
      a = Math.min(a, x);
      b = Math.max(b, x);
      c = Math.min(c, y);
      d = Math.max(d, y);
    }
    const size = Math.max(b - a, d - c);
    return Math.max(0, Math.min(2, (size - 6) * 0.3));
  });
  // Very small parts are hidden entirely (fill too), so tucked-away limbs don't show as dots.
  const fills = [p.body, p.head, p.body, p.body, p.body, p.eyeColor].map((f, i) => (strokeWidths[i] <= 0 ? 'none' : f));
  return { parts: placed, fills, stroke: darken(p.body), strokeWidths };
}

/** Smooth closed path through the points (Catmull-Rom as cubic Béziers). Same command count for the same point count. */
export function smoothPath(pts: Pt[]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

/** A standalone SVG for one creature (used for the key-frame files). */
export function creatureSvg(p: CreatureParams, title: string): string {
  const s = creatureShape(p);
  const paths = DRAW_ORDER.map(
    (i) => `  <path id="${PART_NAMES[i].replace(' ', '-')}" d="${smoothPath(s.parts[i])}" fill="${s.fills[i]}" stroke="${s.stroke}" stroke-width="${s.strokeWidths[i].toFixed(2)}" stroke-linejoin="round"/>`,
  ).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="${VIEW.w}" height="${VIEW.h}">\n  <title>${title}</title>\n${paths}\n</svg>\n`;
}
