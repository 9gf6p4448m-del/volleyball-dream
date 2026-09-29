// J9 回歸：2A B1（開關與預設）重驗——原 b1-ui-check 的腳本未入 repo，這裡照
// docs/experiments/real-match-report.md「### B1」的步驟①–⑤重做（Playwright 實際點 UI）
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const base = process.env.B1_BASE || 'http://127.0.0.1:5185';
const out = process.argv[2];
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const r = {};
const btn = () => page.locator('button', { hasText: '球員外觀' }).first();
await page.goto(base, { timeout: 120000 });
await btn().waitFor({ timeout: 60000 });
r.menuDefaultLabel = (await btn().textContent()).trim();
await btn().click();
r.afterClickLabel = (await btn().textContent()).trim();
r.storage = await page.evaluate(() => localStorage.getItem('vd-player-appearance'));
await page.reload();
await btn().waitFor({ timeout: 60000 });
r.afterReloadLabel = (await btn().textContent()).trim();
await page.goto(`${base}/?quick=1&autopilot=1`, { timeout: 120000 });
await page.waitForFunction(() => window.__phase1?.loop?.()?.stage?.matchView?.debug?.appearance, null, { timeout: 120000 });
r.quickAppearance = await page.evaluate(() => window.__phase1.loop().stage.matchView.debug.appearance);
r.errors = errors.filter((e) => !/favicon/.test(e));
r.pass = r.menuDefaultLabel === '球員外觀：幾何' && r.afterClickLabel === '球員外觀：寫實' && r.storage === 'real'
  && r.afterReloadLabel === '球員外觀：寫實' && r.quickAppearance === 'real' && r.errors.length === 0;
await browser.close();
writeFileSync(out, JSON.stringify(r, null, 1));
console.log(JSON.stringify(r));
