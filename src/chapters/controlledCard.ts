// CONTROLLED mode: chapters that cannot happen because nothing formed before them (no stars,
// so no galaxy, no Sun, no Earth, no people). A short card says why; the galaxy chapter shows
// the even, empty haze that chapter 2's controlled run leaves behind. Not a simulation.

import { EVENTS, formatWhen, type TimelineEvent } from '../time/cosmic';
import { chapterProgress, CHAPTERS, type ChapterSpan } from '../time/chapters';
import { ChapterBase, type ViewContext } from './types';

export class ControlledCard extends ChapterBase {
  private root: HTMLElement | null = null;
  private bar: HTMLElement | null = null;
  private index: number;
  /** Header badge for this card. */
  readonly badge = 'CONTROLLED · nothing formed';

  constructor(
    span: ChapterSpan,
    private heading: string,
    private message: string,
    private haze = false,
  ) {
    super(span, 'controlled');
    this.index = CHAPTERS.indexOf(span);
  }

  async init(view: ViewContext): Promise<void> {
    const root = document.createElement('div');
    root.className = `controlled-card${this.haze ? ' haze' : ''}`;
    root.innerHTML = `
      <div class="placeholder-card">
        <div class="placeholder-kicker">Chapter ${this.index + 1} · ${this.span.title}</div>
        <h2>${this.heading}</h2>
        <p>${this.message}</p>
        <div class="placeholder-span dim">${formatWhen(this.span.tStart)} → ${formatWhen(this.span.tEnd)}</div>
        <div class="placeholder-progress"><div></div></div>
        <p class="dim small">CONTROLLED mode: the randomness is removed, so nothing formed earlier for this chapter to build on.
          Flip the switch (C) to see what happens when chaos is allowed in.</p>
      </div>`;
    view.main.appendChild(root);
    view.charts.innerHTML = '<div class="no-charts dim">Nothing to measure: nothing formed.</div>';
    this.root = root;
    this.bar = root.querySelector('.placeholder-progress > div');
  }

  async seek(): Promise<void> {}

  render(_view: ViewContext, t: number): void {
    if (this.bar) this.bar.style.width = `${100 * chapterProgress(this.index, t)}%`;
  }

  counters(): { label: string; value: string }[] {
    const label = ({ galaxy: 'galaxies formed', solar: 'planets formed', earth: 'oceans formed', humans: 'people' } as Record<string, string>)[this.id];
    return label ? [{ label, value: '0' }] : [];
  }

  metrics(): Record<string, number> {
    return {};
  }

  events(): TimelineEvent[] {
    return EVENTS.filter((e) => e.chapter === this.id);
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
    this.bar = null;
  }
}
