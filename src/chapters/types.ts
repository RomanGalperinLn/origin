import type { Mode } from '../control/controlMode';
import type { ChapterSpan, ChapterKind } from '../time/chapters';
import type { TimelineEvent } from '../time/cosmic';

/** Where a chapter draws, plus what the master timeline is doing. */
export interface ViewContext {
  /** Main view area (the chapter owns everything inside it while active). */
  main: HTMLElement;
  /** Bottom-left chart area. */
  charts: HTMLElement;
  /** True while playing or dragging: chapters may trade exactness for speed. */
  scrubbing: boolean;
  playing: boolean;
  /** Pause master playback (e.g. when the chapter opens an overlay). */
  pause(): void;
}

/** Every chapter implements this, so the app treats them uniformly. */
export interface Chapter {
  readonly span: ChapterSpan;
  readonly id: string;
  readonly title: string;
  readonly kind: ChapterKind;
  readonly tStart: number;
  readonly tEnd: number;
  /** Mount into the view and get ready to show the chapter. */
  init(view: ViewContext, seed: number): Promise<void>;
  /** Jump to real time t (years since the Big Bang) within the chapter. */
  seek(t: number): Promise<void>;
  /** Called every animation frame while the chapter is active. */
  render(view: ViewContext, t: number): void;
  /** Current numbers, shown on charts and sent to Winston. */
  metrics(): Record<string, number>;
  /** Fixed scientific events in this chapter (from events.json). */
  events(): TimelineEvent[];
  /** Leave the chapter: release what is not worth keeping. */
  dispose(): void;
  /** Counters for the top bar that show what has formed (stars, species...): zero in CONTROLLED mode. */
  counters?(): { label: string; value: string }[];
  /** Header badge text, if not the chapter's kind (e.g. a CONTROLLED-mode card). */
  readonly badge?: string;
  /** Latest time this chapter can show right now (chapters that compute ahead). Default: tEnd. */
  availableUntil?(): number;
}

/** Shared span-derived fields, so chapters only implement behaviour. */
export abstract class ChapterBase implements Chapter {
  /** The switch position this instance was built for (see src/control/controlMode.ts). */
  constructor(
    readonly span: ChapterSpan,
    readonly mode: Mode = 'released',
  ) {}
  get id() {
    return this.span.id;
  }
  get title() {
    return this.span.title;
  }
  get kind() {
    return this.span.kind;
  }
  get tStart() {
    return this.span.tStart;
  }
  get tEnd() {
    return this.span.tEnd;
  }
  abstract init(view: ViewContext, seed: number): Promise<void>;
  abstract seek(t: number): Promise<void>;
  abstract render(view: ViewContext, t: number): void;
  abstract metrics(): Record<string, number>;
  abstract events(): TimelineEvent[];
  abstract dispose(): void;
}
