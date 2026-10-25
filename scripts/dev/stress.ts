// Dev helper: hops across chapter boundaries many times, then measures FPS on a globe chapter.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1366, height: 768 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e: any) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('502') && errors.push(m.text()));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
const agos = ['13.7e9', '4.3e9', '3.8e9', '2e9', '1e5', '4.3e9', '3.6e9', '13e9', '100', '6.8e8', '3.9e9', '4.45e9', '0'];
for (let round = 0; round < 3; round++)
  for (const a of agos) {
    await page.evaluate((x) => (location.hash = 'ago=' + x), a);
    await new Promise((r) => setTimeout(r, 120));
  }
const fpsAgo = process.argv[2] ?? '100';
await page.evaluate((a) => (location.hash = 'ago=' + a), fpsAgo);
await new Promise((r) => setTimeout(r, 800));
// Passed as a string: tsx would otherwise inject a __name helper the page doesn't have.
const fps = (await page.evaluate(`new Promise((res) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); };
  requestAnimationFrame(f);
})`)) as number;
const canvases = await page.evaluate(() => document.querySelectorAll('canvas.globe-canvas').length);
console.log(`globe canvases in DOM: ${canvases}; FPS at ${fpsAgo} years ago (software GL): ${fps.toFixed(1)}`);
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
await browser.close();
