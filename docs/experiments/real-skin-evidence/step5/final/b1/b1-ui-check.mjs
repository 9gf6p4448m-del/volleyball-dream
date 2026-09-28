// S7 B1 重跑（原治具未入庫，依 docs/experiments/real-match-report.md「B1 開關與預設」步驟①–④重寫；生涯首頁／生涯出戰 ⑤ 未做）。
// 用法：node tools/real-skin-with-vite.mjs --port=<p> -- node <本檔> <輸出 json>
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL;
const out = { steps: [], errors: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(String(e)));
  await page.goto(`${base}/`);
  const btn = page.getByRole('button', { name: /球員外觀：/ }).first();
  await btn.waitFor({ timeout: 60000 });
  out.menuDefaultLabel = (await btn.textContent()).trim(); out.steps.push('① 主選單預設');
  await btn.click();
  out.menuAfterClickLabel = (await btn.textContent()).trim();
  out.localStorageAfterClick = await page.evaluate(() => localStorage.getItem('vd-player-appearance')); out.steps.push('② 點擊');
  await page.reload();
  const btn2 = page.getByRole('button', { name: /球員外觀：/ }).first();
  await btn2.waitFor({ timeout: 60000 });
  out.menuAfterReloadLabel = (await btn2.textContent()).trim(); out.steps.push('③ 重整');
  await page.goto(`${base}/?quick=1&autopilot=1`);
  await page.waitForFunction(() => window.__phase1?.loop?.()?.stage?.matchView?.debug?.appearance != null, null, { timeout: 120000 });
  out.quickMatchAppearance = await page.evaluate(() => window.__phase1.loop().stage.matchView.debug.appearance); out.steps.push('④ 快速比賽');
} finally { await browser.close(); }
out.pass = out.menuDefaultLabel === '球員外觀：幾何' && out.menuAfterClickLabel === '球員外觀：寫實' && out.localStorageAfterClick === 'real'
  && out.menuAfterReloadLabel === '球員外觀：寫實' && out.quickMatchAppearance === 'real' && out.errors.length === 0;
await writeFile(process.argv[2], JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
process.exit(out.pass ? 0 : 1);
