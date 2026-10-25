// Small in-place radix-2 complex FFT (1D and 2D) on separate re/im arrays.
// Deterministic, no dependencies; sizes must be powers of two.

const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array }>();

function plan(n: number) {
  let p = twiddleCache.get(n);
  if (!p) {
    if (n & (n - 1)) throw new Error(`FFT size ${n} is not a power of two`);
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      cos[k] = Math.cos((2 * Math.PI * k) / n);
      sin[k] = Math.sin((2 * Math.PI * k) / n);
    }
    const bits = Math.log2(n);
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    p = { cos, sin, rev };
    twiddleCache.set(n, p);
  }
  return p;
}

/**
 * In-place FFT of n complex values stored at re[off + i*stride], im[off + i*stride].
 * Forward uses exp(-2πi jk/n); inverse uses exp(+2πi jk/n) and divides by n.
 */
export function fft1d(re: Float64Array, im: Float64Array, n: number, off = 0, stride = 1, inverse = false): void {
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const a = off + i * stride;
      const b = off + j * stride;
      let t = re[a];
      re[a] = re[b];
      re[b] = t;
      t = im[a];
      im[a] = im[b];
      im[b] = t;
    }
  }
  const sgn = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sgn * sin[k * step];
        const a = off + (start + k) * stride;
        const b = off + (start + k + half) * stride;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[off + i * stride] /= n;
      im[off + i * stride] /= n;
    }
  }
}

/** In-place 2D FFT of an n x n grid stored row-major (index = x + y*n). */
export function fft2d(re: Float64Array, im: Float64Array, n: number, inverse = false): void {
  for (let y = 0; y < n; y++) fft1d(re, im, n, y * n, 1, inverse);
  for (let x = 0; x < n; x++) fft1d(re, im, n, x, n, inverse);
}

/** Wavenumber (in units of 2π / box) for FFT index i on an n-point grid. */
export function waveNumber(i: number, n: number): number {
  return i <= n / 2 ? i : i - n;
}
