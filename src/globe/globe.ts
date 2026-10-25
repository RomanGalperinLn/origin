// The Earth globe (RECONSTRUCTED): one Three.js renderer shared by every chapter
// that shows Earth, so moving between chapters never creates a new WebGL context.

import * as THREE from 'three';
import { createRng, nextFloat, uniform } from '../sim/rng';
import { surfaceAt, type SurfaceState } from './keyframes';
import { ATMOSPHERE_FRAGMENT, CLOUD_FRAGMENT, SURFACE_FRAGMENT, SURFACE_VERTEX } from './shaders';

/** Visual spin of the globe (radians per second of real time; not the real day length). */
const SPIN = 0.12;

export class Globe {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private earth: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private clouds: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private host: HTMLElement | null = null;
  private resizeObserver = new ResizeObserver(() => this.resize());
  private time = 0;
  /** Current surface state and caption (for the chapter's side panel and bars). */
  state: SurfaceState = surfaceAt(0).state;
  label = '';

  constructor(seed: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'globe-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);

    const rng = createRng(seed * 7919 + 17);
    const seedVec = new THREE.Vector3(uniform(rng, -50, 50), uniform(rng, -50, 50), uniform(rng, -50, 50));
    // Sun from the left and slightly behind: about half the globe is night, so the
    // terminator and city lights are visible.
    const sun = new THREE.Vector3(-1, 0.25, 0.15).normalize();

    const surfaceUniforms = {
      uLava: { value: 0 }, uOcean: { value: 0 }, uLand: { value: 0 }, uIce: { value: 0 }, uVeg: { value: 0 },
      uCity: { value: 0 }, uImpacts: { value: 0 }, uHaze: { value: 0 }, uTime: { value: 0 }, uMorph: { value: 0 },
      uAtmo: { value: new THREE.Vector3(0.35, 0.6, 1) }, uSeed: { value: seedVec }, uSun: { value: sun },
    };
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 160, 120),
      new THREE.ShaderMaterial({ uniforms: surfaceUniforms, vertexShader: SURFACE_VERTEX, fragmentShader: SURFACE_FRAGMENT }),
    );
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.012, 96, 72),
      new THREE.ShaderMaterial({
        uniforms: { uClouds: { value: 0 }, uTime: { value: 0 }, uSeed: { value: seedVec }, uSun: { value: sun }, uTint: surfaceUniforms.uAtmo },
        vertexShader: SURFACE_VERTEX,
        fragmentShader: CLOUD_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 96, 72),
      new THREE.ShaderMaterial({
        uniforms: { uAtmo: surfaceUniforms.uAtmo, uSun: { value: sun }, uStrength: { value: 0.9 } },
        vertexShader: SURFACE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    // Earth's axis is tilted about 23 degrees.
    const tilt = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(23.4);
    tilt.add(this.earth, this.clouds);
    this.scene.add(tilt, this.atmosphere, this.makeStars(rng));
    this.camera.position.set(0, 0, 4.2);
  }

  private makeStars(rng: ReturnType<typeof createRng>): THREE.Points {
    const n = 1500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Uniform on a big sphere behind the planet.
      const z = uniform(rng, -1, 1);
      const a = nextFloat(rng) * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      pos.set([30 * r * Math.cos(a), 30 * r * Math.sin(a), 30 * z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa3b8, size: 0.06, sizeAttenuation: true }));
  }

  /** Puts the globe's canvas into `el` (and takes it out of wherever it was). */
  mount(el: HTMLElement): void {
    this.unmount();
    this.host = el;
    el.appendChild(this.canvas);
    this.resizeObserver.observe(el);
    this.resize();
  }

  unmount(): void {
    if (!this.host) return;
    this.resizeObserver.disconnect();
    this.canvas.remove();
    this.host = null;
  }

  private resize(): void {
    if (!this.host) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the whole planet (with its glow) in view in narrow panels too.
    this.camera.position.z = w < h ? 4.2 * (h / w) * 0.85 : 4.2;
    this.camera.updateProjectionMatrix();
  }

  /** Sets the surface to its reconstructed state at time t (years since the Big Bang). */
  setTime(t: number, morph: number): void {
    const { state, label } = surfaceAt(t);
    this.state = state;
    this.label = label;
    const u = this.earth.material.uniforms;
    u.uLava.value = state.lava;
    u.uOcean.value = state.ocean;
    u.uLand.value = state.land;
    u.uIce.value = state.ice;
    u.uVeg.value = state.veg;
    u.uCity.value = state.city;
    u.uImpacts.value = state.impacts;
    u.uHaze.value = state.haze;
    u.uMorph.value = morph;
    u.uAtmo.value.set(...state.atmo);
    this.clouds.material.uniforms.uClouds.value = state.clouds;
  }

  /** Advances the visual spin and draws. dt in seconds of real time. */
  render(dt: number): void {
    if (!this.host) return;
    this.time += dt;
    this.earth.rotation.y += dt * SPIN;
    this.clouds.rotation.y += dt * SPIN * 1.15;
    this.earth.material.uniforms.uTime.value = this.time;
    this.clouds.material.uniforms.uTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
  }
}

let shared: Globe | null = null;

/** The one globe instance (created on first use). */
export function getGlobe(seed: number): Globe {
  if (!shared) shared = new Globe(seed);
  return shared;
}
