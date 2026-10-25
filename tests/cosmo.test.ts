import { describe, expect, it } from 'vitest';
import { fft1d, fft2d } from '../src/cosmo/fft';
import { gaussianField } from '../src/cosmo/field';
import { makeCosmoParams } from '../src/cosmo/params';
import { cloneCosmo, copyCosmoInto, cosmoMetrics, createCosmo, stepCosmo, type CosmoState, type CosmoMetrics } from '../src/cosmo/pm';
import { GenericTimeline } from '../src/sim/timeline';

describe('FFT', () => {
  it('matches a naive DFT and inverts exactly', () => {
    const n = 16;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin(i * 1.3) + 0.1 * i;
      im[i] = Math.cos(i * 0.7);
    }
    const r0 = re.slice();
    const i0 = im.slice();
    fft1d(re, im, n);
    for (let k = 0; k < n; k++) {
      let sr = 0;
      let si = 0;
      for (let j = 0; j < n; j++) {
        const ang = (-2 * Math.PI * j * k) / n;
        sr += r0[j] * Math.cos(ang) - i0[j] * Math.sin(ang);
        si += r0[j] * Math.sin(ang) + i0[j] * Math.cos(ang);
      }
      expect(re[k]).toBeCloseTo(sr, 9);
      expect(im[k]).toBeCloseTo(si, 9);
    }
    fft1d(re, im, n, 0, 1, true);
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(r0[i], 12);
      expect(im[i]).toBeCloseTo(i0[i], 12);
    }
  });

  it('2D round trip', () => {
    const n = 32;
    const re = Float64Array.from({ length: n * n }, (_, i) => Math.sin(i * 0.37));
    const im = new Float64Array(n * n);
    const r0 = re.slice();
    fft2d(re, im, n);
    fft2d(re, im, n, true);
    for (let i = 0; i < n * n; i++) expect(re[i]).toBeCloseTo(r0[i], 12);
  });
});

describe('ripple field', () => {
  it('is zero-mean, unit-RMS and deterministic per seed', () => {
    const a = gaussianField(3, 64, -2, 1);
    const b = gaussianField(3, 64, -2, 1);
    const c = gaussianField(4, 64, -2, 1);
    const mean = a.reduce((s, v) => s + v, 0) / a.length;
    const rms = Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    expect(Math.abs(mean)).toBeLessThan(1e-12);
    expect(rms).toBeCloseTo(1, 10);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});

const small = makeCosmoParams({ G: 64, amplitude: 0.002, aFinal: 30, steps: 400 });

describe('particle-mesh gravity', () => {
  it('grows small ripples in proportion to the scale factor (linear theory)', () => {
    const s = createCosmo(small);
    const s0 = Math.sqrt(cosmoMetrics(s).sigma2);
    // a = 30^(k/400): after 200 steps a ≈ 5.48.
    stepCosmo(s, 200);
    const m = cosmoMetrics(s);
    const growth = Math.sqrt(m.sigma2) / s0;
    expect(growth / m.a).toBeGreaterThan(0.9);
    expect(growth / m.a).toBeLessThan(1.1);
  });

  it('with no ripples nothing forms: the lattice stays exactly still', () => {
    const s = createCosmo({ ...small, ripples: false });
    const x0 = s.x.slice();
    stepCosmo(s, 400);
    let maxMove = 0;
    for (let i = 0; i < s.x.length; i++) maxMove = Math.max(maxMove, Math.abs(s.x[i] - x0[i]));
    expect(maxMove).toBeLessThan(1e-12);
    expect(s.nStars).toBe(0);
    expect(cosmoMetrics(s).sigma2).toBeLessThan(1e-20);
  });

  it('with real ripples, clumps and stars form', () => {
    const s = createCosmo(makeCosmoParams({ G: 64, steps: 300 }));
    stepCosmo(s, 300);
    const m = cosmoMetrics(s);
    expect(m.sigma2).toBeGreaterThan(1);
    expect(m.nStars).toBeGreaterThan(0);
  });

  it('is deterministic and seeks exactly through the generic timeline', () => {
    const p = makeCosmoParams({ G: 32, steps: 200, snapshotEvery: 50, metricsEvery: 5 });
    const direct = createCosmo(p);
    stepCosmo(direct, 137);
    const tl = new GenericTimeline<CosmoState, CosmoMetrics>(
      { step: stepCosmo, stepOf: (s) => s.step, clone: cloneCosmo, copyInto: copyCosmoInto, metrics: cosmoMetrics, metricsEvery: 5, snapshotEvery: 50 },
      createCosmo(p),
    );
    tl.advance(200);
    const view = cloneCosmo(tl.head);
    tl.seek(view, 30);
    tl.seek(view, 137);
    expect(Array.from(view.x)).toEqual(Array.from(direct.x));
    expect(Array.from(view.vy)).toEqual(Array.from(direct.vy));
    expect(view.nStars).toBe(direct.nStars);
  });
});
