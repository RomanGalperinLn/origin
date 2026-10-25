// GLSL for the globe: surface, clouds and atmosphere rim.
// Terrain is seeded 3D simplex noise evaluated on the sphere, so the planet is
// deterministic for a seed and needs no textures.

// 3D simplex noise. Ashima Arts / Stefan Gustavson, MIT licence (webgl-noise).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * snoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

const SPHERE_VERTEX = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vObj = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const SURFACE_VERTEX = SPHERE_VERTEX;

export const SURFACE_FRAGMENT = /* glsl */ `
uniform float uLava, uOcean, uLand, uIce, uVeg, uCity, uImpacts, uHaze, uTime, uMorph;
uniform vec3 uAtmo, uSeed, uSun;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
${NOISE}
vec3 hash3(float n) { return fract(sin(vec3(n, n + 1.7, n + 3.1)) * vec3(43758.5453, 22578.1459, 19642.3490)); }

void main() {
  vec3 p = normalize(vObj);
  vec3 n = normalize(vNormalW);
  // Continents: noise height. uMorph slowly warps the domain (a visual stand-in for drift, not plate tectonics).
  vec3 q = p * 1.5 + uSeed + vec3(sin(uMorph) * 0.4, cos(uMorph * 0.7) * 0.2, cos(uMorph) * 0.4);
  float h = fbm(q);
  float detail = fbm(p * 7.0 + uSeed * 2.0);
  // Height threshold calibrated so the land fraction is about uLand (0.3 -> ~30% like today).
  float thr = 0.7 - 1.87 * uLand;
  float landMask = smoothstep(thr - 0.015, thr + 0.015, h);
  // Water fills the low ground first; at uOcean = 1 it reaches the coastline.
  float waterLevel = mix(-0.9, thr, uOcean);
  float water = (1.0 - landMask) * smoothstep(waterLevel + 0.02, waterLevel - 0.02, h);

  vec3 rock = mix(vec3(0.2, 0.18, 0.17), vec3(0.42, 0.35, 0.27), smoothstep(-0.4, 0.6, h + 0.25 * detail));
  vec3 ocean = mix(vec3(0.015, 0.06, 0.18), vec3(0.05, 0.27, 0.42), smoothstep(waterLevel - 0.4, waterLevel, h));
  float lat = abs(p.y);
  // Plants: green, with drier belts around 25 degrees and none near the poles.
  float dry = smoothstep(0.12, 0.0, abs(lat - 0.42) - 0.05 + 0.12 * detail);
  vec3 plants = mix(vec3(0.1, 0.32, 0.09), vec3(0.55, 0.48, 0.28), dry);
  float vegMask = uVeg * landMask * (1.0 - smoothstep(0.7, 0.85, lat));
  vec3 col = mix(rock, plants, vegMask);
  col = mix(col, ocean, water);

  float iceLine = 1.0 - uIce * 1.08;
  float ice = smoothstep(iceLine, iceLine + 0.06, lat + 0.05 * detail);
  col = mix(col, vec3(0.88, 0.93, 0.97), ice);

  // Sunlight, plus a glint on open water.
  float ndl = dot(n, uSun);
  float day = max(ndl, 0.0);
  vec3 view = normalize(cameraPosition - vPosW);
  float glint = pow(max(dot(reflect(-uSun, n), view), 0.0), 40.0) * water * (1.0 - ice);
  vec3 lit = col * (0.04 + 0.96 * day) + vec3(1.0, 0.9, 0.7) * glint * 0.5 * day;

  // Thick early atmosphere: dims the surface and tints it, rather than painting over it.
  lit = mix(lit, lit * 0.55 + uAtmo * 0.3 * (0.15 + 0.85 * day), uHaze * 0.7);

  // Lava glows by itself (no sunlight needed).
  float cracks = pow(1.0 - abs(snoise(p * 4.0 + uSeed + vec3(0.0, uTime * 0.03, 0.0))), 5.0);
  vec3 lava = mix(vec3(0.22, 0.04, 0.01), vec3(1.0, 0.5, 0.12), cracks);
  lit = mix(lit, lava, uLava);

  // City lights on the night side, clustered on land.
  float night = smoothstep(0.1, -0.15, ndl);
  // Towns cluster in noise hot-spots; more appear as uCity grows.
  float towns = smoothstep(0.7 - 0.22 * uCity, 0.85, fbm(p * 24.0 + uSeed * 3.0) * 0.5 + 0.5);
  float glow = smoothstep(0.55 - 0.15 * uCity, 0.8, fbm(p * 6.0 + uSeed * 3.0) * 0.5 + 0.5);
  lit += vec3(1.0, 0.72, 0.32) * (towns * 2.2 + glow * 0.25) * landMask * (1.0 - ice) * night * uCity;

  // Impact flashes: a few short-lived bright spots, positions from a hash of time.
  float flashes = 0.0;
  for (int k = 0; k < 4; k++) {
    float slot = floor(uTime * 1.3 + float(k) * 0.25);
    vec3 c = normalize(hash3(slot * 7.13 + float(k) * 31.7) - 0.5);
    float age = fract(uTime * 1.3 + float(k) * 0.25);
    float d = distance(p, c);
    flashes += exp(-d * d * 900.0) * (1.0 - age) * 3.0 + exp(-d * d * 120.0) * (1.0 - age) * 0.4;
  }
  lit += vec3(1.0, 0.6, 0.25) * flashes * uImpacts;

  gl_FragColor = vec4(lit, 1.0);
}
`;

export const CLOUD_FRAGMENT = /* glsl */ `
uniform float uClouds, uTime;
uniform vec3 uSeed, uSun, uTint;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
${NOISE}
void main() {
  vec3 p = normalize(vObj);
  vec3 drift = vec3(uTime * 0.012, 0.0, uTime * 0.006);
  float c = fbm(p * 3.2 + uSeed * 1.7 + drift) + 0.35 * fbm(p * 11.0 + uSeed + drift * 2.0);
  // uClouds ~ fraction of the sky covered (0.4 gives about a third). Soft edges, wispy detail.
  float lo = 0.64 - uClouds * 0.3;
  float a = smoothstep(lo, lo + 0.2, c * 0.5 + 0.5) * min(1.0, uClouds * 2.0);
  float day = max(dot(normalize(vNormalW), uSun), 0.0);
  gl_FragColor = vec4(mix(vec3(1.0), uTint, 0.25) * (0.05 + 0.95 * day), a * 0.85);
}
`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uAtmo, uSun;
uniform float uStrength;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 view = normalize(cameraPosition - vPosW);
  // Back faces of a slightly larger shell. x = 0 at the shell's outer edge and grows
  // toward the planet (about 0.45 at the planet's limb), so the glow fades outward.
  float x = -dot(normalize(vNormalW), view);
  float rim = pow(clamp(x * 2.0, 0.0, 1.0), 2.0);
  float lit = 0.25 + 0.75 * max(dot(normalize(vNormalW), uSun), 0.0);
  gl_FragColor = vec4(uAtmo * lit, rim * uStrength);
}
`;
