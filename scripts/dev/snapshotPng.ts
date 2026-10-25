import { zlibSync } from 'fflate';
import { writeFileSync } from 'node:fs';
import { makeParams } from '../../src/sim/params';
import { createState, type SimState } from '../../src/sim/state';
import { stepSim } from '../../src/sim/physics';
const COLORS = [[255,90,90],[255,200,60],[90,220,120],[80,170,255],[200,110,255],[255,140,220]];
function crc32(b: Uint8Array) { let c, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function png(w: number, h: number, rgb: Uint8Array) {
  const raw = new Uint8Array((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1); }
  const chunk = (t: string, d: Uint8Array) => { const out = new Uint8Array(12 + d.length); const dv = new DataView(out.buffer); dv.setUint32(0, d.length); for (let i = 0; i < 4; i++) out[4 + i] = t.charCodeAt(i); out.set(d, 8); dv.setUint32(8 + d.length, crc32(out.subarray(4, 8 + d.length))); return out; };
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())];
  const tot = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(tot); let off = 0; for (const p of parts) { o.set(p, off); off += p.length; } return o;
}
const extra = JSON.parse(process.argv[2]); const checkpoints: number[] = JSON.parse(process.argv[3]); const out = process.argv[4];
const S = 300, pad = 6; const runs = [extra.E0, 0].map((E0: number) => createState(makeParams({ ...extra, E0 })));
const W = 2 * S + pad, H = checkpoints.length * (S + pad); const img = new Uint8Array(W * H * 3).fill(30);
let done = 0;
checkpoints.forEach((cp, row) => {
  runs.forEach((r: SimState, col) => {
    stepSim(r, cp - done); 
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const o = ((row * (S + pad) + y) * W + col * (S + pad) + x) * 3; img[o] = img[o + 1] = img[o + 2] = 8; }
    for (let i = 0; i < r.params.N; i++) { const px = Math.floor(r.x[i] / r.params.L * S), py = Math.floor(r.y[i] / r.params.L * S); const c = COLORS[r.type[i]];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = px + dx, Y = py + dy; if (X < 0 || Y < 0 || X >= S || Y >= S) continue; const o = ((row * (S + pad) + Y) * W + col * (S + pad) + X) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; } }
  });
  done = cp;
});
writeFileSync(out, png(W, H, img)); console.log('wrote', out);
