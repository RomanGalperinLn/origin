// Dev helper: presses Play at a given point and measures FPS for a few seconds.
// Usage: GPU=1 npx tsx scripts/dev/playFps.ts <ago> [seconds] [speed option value]
import puppeteer from 'puppeteer-core';
const [ago, secs, speed] = [process.argv[2] ?? '3.9e9', Number(process.argv[3] ?? 4), process.argv[4]];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: process.env.GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1366, height: 768 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e: any) => errors.push(e.message));
await page.goto(`http://localhost:5173/#ago=${ago}`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 15000));
if (speed) await page.select('#master-speed', speed);
await page.click('#master-play');
const fps = await page.evaluate(`new Promise((done) => { const t0 = performance.now(); let n = 0; const f = (now) => { n++; if (now - t0 < ${secs} * 1000) requestAnimationFrame(f); else done(n / ((now - t0) / 1000)); }; requestAnimationFrame(f); })`);
console.log(`playing from ${ago}${speed ? ` at speed ${speed}` : ''}: ${Number(fps).toFixed(1)} fps`);
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
