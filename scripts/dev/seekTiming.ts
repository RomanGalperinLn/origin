// Dev helper: measures slider seek latency in the running app.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, defaultViewport: { width: 1366, height: 768 } });
const page = await browser.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, Number(process.argv[2] ?? 30000)));
const res = await page.evaluate(async () => {
  const slider = document.getElementById('time-slider') as HTMLInputElement;
  const label = document.getElementById('step-label')!;
  const out: string[] = [];
  for (const v of [3000, 700, 1999, 50, 1234, 2500]) {
    const before = label.textContent;
    const t0 = performance.now();
    slider.value = String(v);
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));
    while (label.textContent === before && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 5));
    const t1 = performance.now();
    // Wait for the exact frame (label stays, but give it time) by requesting play/pause-free idle.
    await new Promise((r) => setTimeout(r, 1500));
    out.push(`slider ${v} -> ${label.textContent} first frame ${(t1 - t0).toFixed(0)} ms`);
  }
  return out;
});
console.log(res.join('\n'));
await browser.close();
