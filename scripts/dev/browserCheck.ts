// Dev helper: loads the app in headless Chrome, runs optional actions, reports console errors + screenshot.
import puppeteer from 'puppeteer-core';
const [url, out, waitMs, actions] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 8000), process.argv[5] ?? ''];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  // GPU=1: hardware rendering (Metal on macOS) instead of software SwiftShader.
  args: ['--window-size=1366,768', '--autoplay-policy=no-user-gesture-required', ...(process.env.GPU ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])],
  defaultViewport: { width: 1366, height: 768 },
});
const page = await browser.newPage();
const logs: string[] = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e: any) => logs.push(`[pageerror] ${e.message}`));
page.on('error', (e: any) => console.log('[PAGE CRASH]', e?.message));
page.on('close', () => console.log('[PAGE CLOSED]'));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(url, { waitUntil: 'networkidle0' });
for (const a of actions.split(';').filter(Boolean)) {
  const [kind, arg, arg2] = a.split('|');
  if (kind === 'click') await page.click(arg);
  if (kind === 'wait') await new Promise((r) => setTimeout(r, Number(arg)));
  if (kind === 'eval') console.log('eval:', JSON.stringify(await page.evaluate(arg)));
  if (kind === 'shot') await page.screenshot({ path: arg });
  if (kind === 'type') await page.type(arg, arg2);
  if (kind === 'mem') console.log('mem MB:', await page.evaluate(() => Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1e6)));
}
await new Promise((r) => setTimeout(r, waitMs));
console.log('texts:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.status')].map((e) => e.textContent))));
await page.screenshot({ path: out });
console.log(logs.join('\n') || '(no console output)');
await browser.close();
