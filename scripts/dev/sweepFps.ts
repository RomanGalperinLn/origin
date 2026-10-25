// Dev helper: sweeps the slider through a range of "years ago" (like a drag) and measures FPS.
// Usage: npx tsx scripts/dev/sweepFps.ts <fromAgo> <toAgo> <seconds> [shotDir|-] [css to inject, e.g. to hide a part]
import puppeteer from 'puppeteer-core';
const [from, to, secs, shotArg, css] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4] ?? 4), process.argv[5], process.argv[6]];
const shots = shotArg && shotArg !== '-' ? shotArg : undefined;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  // GPU=1: hardware rendering (Metal on macOS) instead of software SwiftShader.
  args: process.env.GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1366, height: 768 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e: any) => errors.push(e.message));
await page.goto(`http://localhost:5173/#ago=${from}`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 15000));
console.log('renderer:', await page.evaluate(`(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`));
if (css) await page.addStyleTag({ content: css });
// The sweep runs inside the page: log-interpolate years ago, one hash change per animation frame.
const fps = await page.evaluate(`new Promise((done) => {
  const t0 = performance.now(); let frames = 0;
  const step = (now) => {
    const u = Math.min(1, (now - t0) / (${secs} * 1000));
    const ago = Math.exp(Math.log(${from}) + u * (Math.log(${to}) - Math.log(${from})));
    location.hash = 'ago=' + ago.toPrecision(6);
    frames++;
    if (u < 1) requestAnimationFrame(step); else done(frames / ((now - t0) / 1000));
  };
  requestAnimationFrame(step);
})`);
console.log(`sweep ${from} -> ${to} in ${secs}s: ${Number(fps).toFixed(1)} fps`);
if (shots) {
  for (const ago of [2.2e8, 3.7e8, 5.4e8]) {
    await page.evaluate(`location.hash = 'ago=${ago}'`);
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: `${shots}/rev_${ago}.png` });
  }
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
