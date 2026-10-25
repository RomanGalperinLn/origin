// Dev helper: screenshots the app at several "years ago" via the #ago= deep link.
import puppeteer from 'puppeteer-core';
const [outDir, ...agos] = process.argv.slice(2);
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
await page.goto('http://localhost:5173/#ago=' + agos[0], { waitUntil: 'networkidle0' });
for (const ago of agos) {
  await page.evaluate((a) => (location.hash = 'ago=' + a), ago);
  await new Promise((r) => setTimeout(r, 1500));
  const caption = await page.evaluate(() => document.querySelector('.globe-caption')?.textContent + ' | ' + document.getElementById('readout-ago')?.textContent);
  await page.screenshot({ path: `${outDir}/globe_${ago}.png` });
  console.log(ago, '->', caption);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
