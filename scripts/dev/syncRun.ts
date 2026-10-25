// Dev check: are texts in step with the picture during playback? Plays the whole story in one
// mode, sampling every 0.5 s, and reports:
//  - chapters out of order or repeated
//  - the narrator's line (Winston panel) not matching the chapter on screen (1 s grace after a change)
//  - chapter 7 subtitles (released) belonging to a stage more than one behind or ahead of the picture
// Usage: GPU=1 npx tsx scripts/dev/syncRun.ts <controlled|released>
import puppeteer from 'puppeteer-core';
import modes from '../../src/data/narration/modes.json';
import { NARRATION } from '../../src/lineage/narration';
import { STAGES } from '../../src/lineage/timeline';

const m = (process.argv[2] ?? 'released') as 'controlled' | 'released';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: process.env.GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1366, height: 768 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e: any) => errors.push(e.message));
page.on('error', (e: any) => console.log(`[PAGE CRASH] ${e?.message}`));
page.on('framenavigated', (f) => f === page.mainFrame() && console.log(`[navigated] ${f.url()}`));
browser.on('disconnected', () => console.log('[browser disconnected]'));
await page.goto(`http://localhost:5173/#mode=${m}&ago=13.8e9`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 90000)); // let the background runs get well ahead
await page.click('#master-play');

const ids = ['hot', 'web', 'galaxy', 'solar', 'earth', 'life', 'evolution', 'humans'];
const lineOf = (i: number) => (modes.chapters as Record<string, Record<string, string>>)[ids[i]]?.[m] ?? null;
const stageIndexOfLine = (text: string) => {
  const l = NARRATION.find((x) => x.text === text);
  if (!l) return null;
  if (l.at === 'chapter' || l.at === 'lineage') return 0;
  if (l.at === 'end') return STAGES.length - 1;
  return STAGES.findIndex((s) => s.id === l.at);
};
const problems: string[] = [];
const seen: number[] = [];
let lastChapter = -1;
let changedAt = 0;
let lagSince: number | null = null;
const t0 = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 500));
  const s = (await page.evaluate(`(() => ({
    title: document.getElementById('chapter-title').textContent,
    ago: document.getElementById('readout-ago').textContent,
    winston: document.getElementById('winston-text').textContent,
    winstonFaded: document.getElementById('winston-text').classList.contains('faded'),
    sub: document.querySelector('.narration.shown')?.textContent ?? '',
    stage: document.querySelector('.lineage-name')?.textContent ?? '',
  }))()`)) as { title: string; ago: string; winston: string; winstonFaded: boolean; sub: string; stage: string };
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const ch = Number(s.title.split('.')[0]) - 1;
  if (ch !== lastChapter) {
    if (seen.includes(ch)) problems.push(`${sec}s: chapter ${ch + 1} shown again`);
    if (ch < lastChapter) problems.push(`${sec}s: went back from chapter ${lastChapter + 1} to ${ch + 1}`);
    seen.push(ch);
    lastChapter = ch;
    changedAt = Date.now();
  }
  // Narrator's line must be this chapter's (after a 1 s grace), unless it has faded out.
  const want = lineOf(ch);
  // A chapter without a line must not keep showing another chapter's line.
  const others = ids.map((_, i) => lineOf(i)).filter((x, i) => x && i !== ch);
  if (!s.winstonFaded && Date.now() - changedAt > 1000 && others.includes(s.winston)) problems.push(`${sec}s ch${ch + 1}: narrator still shows another chapter's line "${s.winston.slice(0, 40)}…"`);
  if (want && !s.winstonFaded && Date.now() - changedAt > 1000 && s.winston !== want) problems.push(`${sec}s ch${ch + 1}: narrator shows "${s.winston.slice(0, 50)}…" (expected this chapter's line)`);
  // Chapter 7 subtitles vs the stage on screen.
  if (ch === 6 && s.sub && s.stage) {
    const k = stageIndexOfLine(s.sub);
    const shownStage = STAGES.findIndex((x) => s.stage.startsWith(x.label));
    // Out of step if a newer line (one for a stage after the subtitle's, up to the stage on screen) exists,
    // allowing the 2 s minimum a line stays up; or if the subtitle is for a stage not yet on screen.
    const lineStages = NARRATION.map((l) => stageIndexOfLine(l.text)).filter((x): x is number => x !== null);
    const newer = k !== null && shownStage >= 0 && lineStages.some((x) => x > k && x <= shownStage);
    if (k !== null && shownStage >= 0 && (k > shownStage || newer)) {
      if (lagSince === null) lagSince = Date.now();
      if (Date.now() - lagSince > 2500 || k > shownStage)
        problems.push(`${sec}s (${s.ago}): subtitle for stage ${k + 1} while stage ${shownStage + 1} (${STAGES[shownStage].id}) is on screen`);
    } else lagSince = null;
  }
  if (s.ago === 'today' || Date.now() - t0 > 900000) break;
}
console.log(`${m.toUpperCase()}: ${((Date.now() - t0) / 1000).toFixed(0)} s, chapters in order: ${seen.map((x) => x + 1).join(' ')}`);
console.log(problems.length ? problems.join('\n') : 'no sync problems');
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
