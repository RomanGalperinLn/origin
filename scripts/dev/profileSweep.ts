// Dev helper: CPU-profiles a slider sweep (like a drag) and lists the top functions by self time.
// Usage: npx tsx scripts/dev/profileSweep.ts <fromAgo> <toAgo>
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 1366, height: 768 } });
const page = await browser.newPage();
await page.goto(`http://localhost:5173/#ago=${process.argv[2] ?? 3e6}`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 15000));
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.evaluate(`new Promise((done) => { const t0 = performance.now(); const step = (now) => { const u = Math.min(1, (now - t0) / 3000); location.hash = 'ago=' + Math.exp(Math.log(${process.argv[2] ?? 3e6}) + u * (Math.log(${process.argv[3] ?? 4e5}) - Math.log(${process.argv[2] ?? 3e6}))).toPrecision(6); if (u < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); })`);
const { profile } = (await cdp.send('Profiler.stop')) as any;
const self = new Map<string, number>();
const byId = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
const dt = profile.timeDeltas as number[];
profile.samples.forEach((id: number, i: number) => {
  const n = byId.get(id);
  const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
});
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n'));
await browser.close();
