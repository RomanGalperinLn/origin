// Title card for chapters that are not built yet: title, badge, time span and
// the real events that fall inside it. Honest about being a placeholder.

import { EVENTS, cosmicCalendar, formatWhen, type TimelineEvent } from '../time/cosmic';
import { chapterProgress, CHAPTERS, type ChapterSpan } from '../time/chapters';
import { ChapterBase, type ViewContext } from './types';

const PLANNED_PHASE: Record<string, number> = {
  hot: 6, web: 3,
};

export class PlaceholderChapter extends ChapterBase {
  private root: HTMLElement | null = null;
  private bar: HTMLElement | null = null;
  private index: number;

  constructor(span: ChapterSpan) {
    super(span);
    this.index = CHAPTERS.indexOf(span);
  }

  async init(view: ViewContext): Promise<void> {
    const s = this.span;
    const root = document.createElement('div');
    root.className = 'placeholder';
    root.style.setProperty('--chapter-color', s.color);
    const items = this.events()
      .map((e) => `<li><b>${e.label}</b> <span class="dim">${formatWhen(e.t)} · ${e.cosmicCalendar}</span></li>`)
      .join('');
    root.innerHTML = `
      <div class="placeholder-card">
        <div class="placeholder-kicker">Chapter ${this.index + 1}</div>
        <h2>${s.title}</h2>
        <div class="placeholder-span dim">${formatWhen(s.tStart)} → ${formatWhen(s.tEnd)}
          <br />Cosmic Calendar ${cosmicCalendar(s.tStart)} → ${cosmicCalendar(s.tEnd)}</div>
        ${items ? `<ul class="placeholder-events">${items}</ul>` : ''}
        <div class="placeholder-progress"><div></div></div>
        <p class="dim placeholder-note">Placeholder: this chapter's visual is built in phase ${PLANNED_PHASE[s.id] ?? '?'}.
          Its badge shows what it will be.</p>
      </div>`;
    view.main.appendChild(root);
    view.charts.innerHTML = '<div class="no-charts dim">No charts for this chapter yet.</div>';
    this.root = root;
    this.bar = root.querySelector('.placeholder-progress > div');
  }

  async seek(): Promise<void> {}

  render(_view: ViewContext, t: number): void {
    if (this.bar) this.bar.style.width = `${100 * chapterProgress(this.index, t)}%`;
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
