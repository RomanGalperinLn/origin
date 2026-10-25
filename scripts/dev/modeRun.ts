// Dev check for the CONTROLLED / RELEASED switch: plays the whole story in one mode from the
// Big Bang to today and prints each chapter's top-bar counters as it ends, plus console errors.
// Usage: GPU=1 npx tsx scripts/dev/modeRun.ts <controlled|released>
import puppeteer from 'puppeteer-core';
const m = process.argv[2] ?? 'controlled';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: process.env.GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1366, height: 768 },
});
const page = await browser.newPage();
const errors: string[] = [];
let t0 = Date.now();
page.on('pageerror', (e: any) => errors.push(e.message));
page.on('error', (e: any) => console.log(`[PAGE CRASH] ${e?.message}`));
page.on('framenavigated', (f) => f === page.mainFrame() && console.log(`[navigated] ${((Date.now() - t0) / 1000).toFixed(0)} s ${f.url()}`));
page.on('console', (x) => x.type() === 'error' && !/502|Failed to load resource/.test(x.text()) && errors.push(x.text()));
await page.goto(`http://localhost:5173/#mode=${m}&ago=13.8e9`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 5000));
await page.click('#master-play');
t0 = Date.now();
const last = new Map<string, string>();
const lines = new Map<string, string>();
for (;;) {
  await new Promise((r) => setTimeout(r, 1000));
  const [title, counters, readout, line] = await page.evaluate(() => [
    document.getElementById('chapter-title')!.textContent ?? '',
    document.getElementById('chapter-counters')!.textContent ?? '',
    document.getElementById('readout-ago')!.textContent ?? '',
    document.getElementById('winston-text')!.textContent ?? '',
  ]);
  if (!last.has(title)) console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s: ${title}  heap ${await page.evaluate(() => Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1e6))} MB`);
  last.set(title, counters);
  if (line && !lines.has(title)) lines.set(title, line);
  if (readout === 'today' || Date.now() - t0 > 900000) break;
}
console.log(`${m.toUpperCase()}: played to today in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const [title, c] of last) console.log(`  ${title.padEnd(38)} ${c || '(no counters)'}\n      line: ${lines.get(title) ?? '-'}`);
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
