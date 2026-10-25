// Dev helper: the final check for chapters 6-8. Waits for the background runs to precompute,
// presses Play at the start of a chapter and plays to "today", logging FPS every second,
// the chapter on screen and any console errors.
// Usage: GPU=1 npx tsx scripts/dev/fullRun.ts [startAgo] [precomputeSeconds]
import puppeteer from 'puppeteer-core';
const [ago, wait] = [process.argv[2] ?? '4.1e9', Number(process.argv[3] ?? 200)];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: process.env.GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1366, height: 768 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e: any) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/502|Failed to load resource/.test(m.text()) && errors.push(m.text()));
await page.goto(`http://localhost:5173/#ago=${ago}`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, wait * 1000));
await page.evaluate(`window.__frames = 0; (function f() { window.__frames++; requestAnimationFrame(f); })()`);
await page.click('#master-play');
const t0 = Date.now();
const perChapter = new Map<string, number[]>();
let last = 0;
for (;;) {
  await new Promise((r) => setTimeout(r, 1000));
  const frames = (await page.evaluate('window.__frames')) as number;
  const fps = frames - last;
  last = frames;
  const title = await page.$eval('#chapter-title', (e) => e.textContent ?? '');
  const readout = await page.$eval('#readout-ago', (e) => e.textContent ?? '');
  if (!perChapter.has(title)) perChapter.set(title, []);
  perChapter.get(title)!.push(fps);
  if (readout === 'today' || Date.now() - t0 > 400000) break;
}
console.log(`played to "today" in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const [title, f] of perChapter)
  console.log(`  ${title.padEnd(36)} ${f.length} s  min ${Math.min(...f)} fps  mean ${(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1)} fps`);
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
