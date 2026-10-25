// The master time slider: Big Bang -> today, one coloured band per chapter,
// event ticks, play/pause at each chapter's own pace, Start / Today, and
// click-a-band-name to jump to a chapter.

import { CHAPTERS, chapterIndexAtU, chapterStartU, timeToSlider } from '../time/chapters';
import { EVENTS, formatWhen } from '../time/cosmic';

const SPEEDS: Record<string, number> = { slow: 0.4, normal: 1, fast: 3 };

export class MasterSlider {
  u = 0;
  playing = false;
  dragging = false;
  private speed = 1;

  private track = document.getElementById('master-track')!;
  private thumb = document.getElementById('master-thumb')!;
  private fill = document.getElementById('master-fill')!;
  private playBtn = document.getElementById('master-play') as HTMLButtonElement;

  constructor() {
    this.buildBands();
    this.buildTicks();

    this.playBtn.addEventListener('click', () => this.setPlaying(!this.playing));
    document.getElementById('master-start')!.addEventListener('click', () => this.setU(0));
    document.getElementById('master-today')!.addEventListener('click', () => {
      this.setPlaying(false);
      this.setU(1);
    });
    const speedSel = document.getElementById('master-speed') as HTMLSelectElement;
    speedSel.addEventListener('change', () => (this.speed = SPEEDS[speedSel.value] ?? 1));

    this.track.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.track.setPointerCapture(e.pointerId);
      this.setU(this.uFromEvent(e));
    });
    this.track.addEventListener('pointermove', (e) => {
      if (this.dragging) this.setU(this.uFromEvent(e));
    });
    const end = () => (this.dragging = false);
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      // Form controls keep their own keys (space toggles a checkbox, arrows change a select).
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        // Otherwise a focused button would also "click" on key-up and toggle twice.
        if (target !== document.body) target.blur();
        this.setPlaying(!this.playing);
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
        this.setU(this.u + (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.01 : 0.002));
      }
    });
    this.draw();
  }

  private buildBands(): void {
    const bands = document.getElementById('master-bands')!;
    const labels = document.getElementById('master-labels')!;
    CHAPTERS.forEach((c, i) => {
      const left = `${100 * chapterStartU(i)}%`;
      const width = `${100 * c.sliderShare}%`;
      const band = document.createElement('div');
      band.className = 'band';
      band.style.left = left;
      band.style.width = width;
      band.style.background = c.color;
      bands.appendChild(band);

      const label = document.createElement('button');
      label.className = 'band-label';
      label.style.left = left;
      label.style.width = width;
      label.textContent = c.shortTitle;
      label.title = `Jump to chapter ${i + 1}: ${c.title} (${c.kind})`;
      label.addEventListener('click', () => this.setU(chapterStartU(i) + 1e-9));
      labels.appendChild(label);
    });
  }

  private buildTicks(): void {
    const ticks = document.getElementById('master-ticks')!;
    for (const e of EVENTS) {
      if (e.id === 'big-bang' || e.id === 'today') continue;
      const tick = document.createElement('div');
      tick.className = 'tick';
      tick.style.left = `${100 * timeToSlider(e.t)}%`;
      tick.title = `${e.label}\n${formatWhen(e.t)}\nCosmic Calendar: ${e.cosmicCalendar}`;
      ticks.appendChild(tick);
    }
  }

  private uFromEvent(e: PointerEvent): number {
    const r = this.track.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
  }

  setU(u: number): void {
    this.u = Math.max(0, Math.min(1, u));
    this.draw();
  }

  setPlaying(p: boolean): void {
    if (p && this.u >= 1) this.u = 0; // play again from the start
    this.playing = p;
    this.playBtn.textContent = p ? '❚❚ Pause' : '▶ Play';
  }

  /**
   * Advances playback by dt seconds. Each chapter crosses its share of the slider
   * in its own playbackSeconds. `maxU` stops playback where a chapter's data ends
   * (e.g. a simulation still computing).
   */
  tick(dt: number, maxU: number): void {
    if (!this.playing || this.dragging) return;
    const c = CHAPTERS[chapterIndexAtU(this.u)];
    const next = this.u + (this.speed * dt * c.sliderShare) / c.playbackSeconds;
    this.u = Math.min(next, Math.max(this.u, maxU), 1);
    if (this.u >= 1) this.setPlaying(false);
    this.draw();
  }

  private draw(): void {
    this.thumb.style.left = `${100 * this.u}%`;
    this.fill.style.width = `${100 * this.u}%`;
  }
}
