// Dev helper: screenshot any page. Usage: npx tsx scripts/dev/pageShot.ts <url> <out.png> [width] [height] [waitMs]
import puppeteer from 'puppeteer-core';
const [url, out, w, h, wait] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 1400), Number(process.argv[5] ?? 900), Number(process.argv[6] ?? 1000)];
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: w, height: h },
});
const page = await browser.newPage();
const logs: string[] = [];
page.on('pageerror', (e: any) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && logs.push(`[error] ${m.text()}`));
await page.goto(url, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, wait));
await page.screenshot({ path: out, fullPage: true });
console.log(logs.join('\n') || 'no errors');
await browser.close();
