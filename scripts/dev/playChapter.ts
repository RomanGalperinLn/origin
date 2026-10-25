// Dev helper: plays from a point until the chapter title changes, timing it; screenshots on the way.
// Usage: GPU=1 npx tsx scripts/dev/playChapter.ts <startAgo> <untilTitlePrefix> [shotDir] [shotEverySec]
import puppeteer from 'puppeteer-core';
const [ago, until, shots, every] = [process.argv[2], process.argv[3] ?? '8.', process.argv[4], Number(process.argv[5] ?? 12)];
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
await new Promise((r) => setTimeout(r, 20000)); // let background runs precompute
await page.click('#master-play');
const t0 = Date.now();
let n = 0;
let title = '';
while (Date.now() - t0 < 180000) {
  await new Promise((r) => setTimeout(r, 500));
  title = await page.$eval('#chapter-title', (e) => e.textContent ?? '');
  if (shots && (Date.now() - t0) / 1000 >= (n + 1) * every) await page.screenshot({ path: `${shots}/play_${String(++n).padStart(2, '0')}.png` });
  if (title.startsWith(until)) break;
}
console.log(`reached "${title}" after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
