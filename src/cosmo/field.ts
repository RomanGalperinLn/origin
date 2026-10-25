// The primordial ripples: a 2D Gaussian random field with P(k) ∝ k^slope.
// Chapter 1 draws it as the CMB temperature map; chapter 2 uses the very same
// field as the initial density contrast for gravity.

import { createRng, gaussian } from '../sim/rng';
import { fft2d, waveNumber } from './fft';

/**
 * Density contrast δ on a G x G grid (row-major), zero mean, RMS 1.
 * Built in Fourier space: each mode gets a complex Gaussian amplitude scaled by
 * sqrt(P(k)), then the field is transformed back and its real part kept.
 */
export function gaussianField(seed: number, G: number, slope: number, smoothCells: number): Float64Array {
  const rng = createRng((seed * 2654435761) >>> 0);
  const re = new Float64Array(G * G);
  const im = new Float64Array(G * G);
  for (let y = 0; y < G; y++) {
    const ky = waveNumber(y, G);
    for (let x = 0; x < G; x++) {
      const kx = waveNumber(x, G);
      const k2 = kx * kx + ky * ky;
      const i = x + y * G;
      if (k2 === 0) {
        // Zero mean, but still consume the random numbers so the field doesn't depend on this branch.
        gaussian(rng);
        gaussian(rng);
        continue;
      }
      // Gaussian smoothing over `smoothCells` grid cells (k in radians per cell).
      const kCells = (2 * Math.PI * Math.sqrt(k2)) / G;
      const window = Math.exp(-0.5 * (kCells * smoothCells) ** 2);
      // Amplitude ∝ sqrt(P(k)) with P ∝ k^slope.
      const amp = Math.pow(k2, slope / 4) * window;
      re[i] = gaussian(rng) * amp;
      im[i] = gaussian(rng) * amp;
    }
  }
  fft2d(re, im, G, true);
  // Taking the real part of a random complex field gives a real Gaussian field with the same spectrum shape.
  let mean = 0;
  for (let i = 0; i < G * G; i++) mean += re[i];
  mean /= G * G;
  let v = 0;
  for (let i = 0; i < G * G; i++) {
    re[i] -= mean;
    v += re[i] * re[i];
  }
  const rms = Math.sqrt(v / (G * G)) || 1;
  for (let i = 0; i < G * G; i++) re[i] /= rms;
  return re;
}
