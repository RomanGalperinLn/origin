// Dev audit: visits many moments in one mode and checks what is on screen.
//  - readouts (years ago) match the requested time; chapter title matches the time's chapter
//  - chapter 7: the stage label shown matches the stage at that time
//  - layout: visible text elements that overflow their box, sit outside the viewport, or overlap
// Prints every problem found, and takes a screenshot per chapter (mid-chapter).
// Usage: GPU=1 npx tsx scripts/dev/audit.ts <controlled|released> <shotDir>
import puppeteer from 'puppeteer-core';
import { CHAPTERS, chapterStartU, sliderToTime } from '../../src/time/chapters';
import { AGE, formatYearsAgo } from '../../src/time/cosmic';
import { STAGES, stagePositions } from '../../src/lineage/timeline';

const [mode, shots] = [process.argv[2] ?? 'released', process.argv[3]];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: process.env.GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1366, height: 768 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e: any) => errors.push(e.message));
page.on('console', (x) => x.type() === 'error' && !/502|Failed to load resource/.test(x.text()) && errors.push(x.text()));
await page.goto(`http://localhost:5173/#mode=${mode}&ago=13.8e9`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 30000)); // background runs precompute

// Moments: each chapter at 2%, 25%, 50%, 75%, 98%; chapter 7 also at every lineage stage.
const moments: { t: number; why: string }[] = [];
CHAPTERS.forEach((c, i) => {
  for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) moments.push({ t: sliderToTime(chapterStartU(i) + f * c.sliderShare), why: `ch${i + 1} @${Math.round(f * 100)}%` });
});
const evoI = CHAPTERS.findIndex((c) => c.id === 'evolution');
const pos = stagePositions();
STAGES.forEach((s, k) => {
  if (k === 0) return;
  // Just after the stage's key frame (inside the hold), the label must be this stage.
  const f = Math.min(0.999, pos[k] + 0.004);
  moments.push({ t: sliderToTime(chapterStartU(evoI) + f * CHAPTERS[evoI].sliderShare), why: `ch7 stage ${k + 1} ${s.id}` });
});

// The page-side probe is a string: tsx adds a __name helper to functions, which the page doesn't have.
const PROBE = `(() => {
    const txt = (id) => document.getElementById(id)?.textContent ?? '';
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
    };
    // Text elements to check for overflow / off-screen.
    const sel = ['.readout-ago', '.chapter-title', '#chapter-badge', '#chapter-counters', '.readout-cal', '.web-caption', '.globe-caption', '.evo-caption', '.lineage-name', '.lineage-fact', '.lineage-note', '.lineage-scale', '.narration.shown', '.placeholder-card h2', '.side-title', '.tree-head', '.ft-note', 'figcaption', '.ch6-toolbar', '#winston-text'];
    const issues = [];
    const boxes = [];
    for (const s of sel)
      document.querySelectorAll(s).forEach((el) => {
        if (!visible(el)) return;
        const r = el.getBoundingClientRect();
        const he = el;
        if (he.scrollWidth > he.clientWidth + 2 && getComputedStyle(he).overflow !== 'visible') issues.push(\`\${s} text overflows its box\`);
        if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) issues.push(\`\${s} outside the viewport (\${Math.round(r.left)},\${Math.round(r.top)} \${Math.round(r.width)}x\${Math.round(r.height)})\`);
        boxes.push({ name: s, r });
      });
    // Overlaps between overlay texts that should never cover each other.
    const overlayNames = ['.lineage-name', '.lineage-fact', '.lineage-note', '.narration.shown', '.web-caption', '.evo-caption', '.globe-caption'];
    const ov = boxes.filter((b) => overlayNames.includes(b.name));
    for (let a = 0; a < ov.length; a++)
      for (let b = a + 1; b < ov.length; b++) {
        const A = ov[a].r;
        const B = ov[b].r;
        const ix = Math.min(A.right, B.right) - Math.max(A.left, B.left);
        const iy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (ix > 4 && iy > 4) issues.push(\`\${ov[a].name} overlaps \${ov[b].name}\`);
      }
    return { ago: txt('readout-ago'), title: txt('chapter-title'), stage: txt('lineage-name') || (document.querySelector('.lineage-name')?.textContent ?? ''), issues };
  })()`;

const problems: string[] = [];
let shotChapter = -1;
for (const m of moments) {
  const ago = AGE - m.t;
  await page.evaluate(`location.hash = 'mode=${mode}&ago=${ago.toPrecision(10)}'`);
  await new Promise((r) => setTimeout(r, 900));
  const info = (await page.evaluate(PROBE)) as { ago: string; title: string; stage: string; issues: string[] };

  const want = formatYearsAgo(m.t);
  if (info.ago !== want) problems.push(`[${m.why}] readout "${info.ago}" but expected "${want}"`);
  const ci = CHAPTERS.findIndex((c) => m.t >= c.tStart && m.t < c.tEnd);
  if (!info.title.startsWith(`${ci + 1}.`)) problems.push(`[${m.why}] title "${info.title}" but time is in chapter ${ci + 1}`);
  if (m.why.includes('stage') && mode === 'released') {
    const id = m.why.split(' ').pop()!;
    const s = STAGES.find((x) => x.id === id)!;
    if (!info.stage.startsWith(s.label)) problems.push(`[${m.why}] stage label "${info.stage}" but expected "${s.label}"`);
  }
  for (const i of info.issues) problems.push(`[${m.why}] ${i}`);
  if (shots && ci !== shotChapter && m.why.endsWith('@50%')) {
    shotChapter = ci;
    await page.screenshot({ path: `${shots}/audit_${mode}_ch${ci + 1}.png` });
  }
}
console.log(`${mode.toUpperCase()}: ${moments.length} moments checked, ${problems.length} problems`);
console.log([...new Set(problems)].join('\n') || '(none)');
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
