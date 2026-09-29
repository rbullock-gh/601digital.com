// Screenshot helper for visual checks: node scripts/shoot.mjs <outDir> <theme> <width> <path...>
import { chromium } from 'playwright';

const [outDir, theme = 'light', width = '1440', ...paths] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://127.0.0.1:4321';
const w = Number(width);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 860 : 900 }, deviceScaleFactor: w < 600 ? 2 : 1, hasTouch: w < 600, isMobile: w < 600 });
await ctx.addInitScript((t) => localStorage.setItem('almanac-theme', t), theme);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
for (const p of paths) {
  const [path, action] = p.split('|');
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  if (action) {
    for (const step of action.split(';')) {
      const i = step.indexOf('='); const kind = step.slice(0, i); const arg = step.slice(i + 1);
      if (kind === 'click') await page.click(arg);
      if (kind === 'key') await page.keyboard.press(arg);
      if (kind === 'type') await page.keyboard.type(arg);
      if (kind === 'wait') await page.waitForTimeout(Number(arg));
      if (kind === 'hover') await page.hover(arg);
      if (kind === 'scrollall') {
        const h = await page.evaluate(() => document.body.scrollHeight);
        for (let y = 0; y < h; y += 400) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await page.waitForTimeout(120);
        }
        await page.waitForTimeout(1200);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }
    await page.waitForTimeout(500);
  }
  const name = `${path.replace(/[^a-z0-9]+/gi, '_') || 'root'}${action ? '_' + action.replace(/[^a-z0-9]+/gi, '_').slice(0, 30) : ''}-${theme}-${w}.png`;
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: process.env.FULL !== '0' });
  console.log('shot', name);
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
