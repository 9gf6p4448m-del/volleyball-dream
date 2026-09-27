#!/usr/bin/env node
// 寫實球員卷 2B 自然度：三版本動態對照的逐幀截圖（改前 f4ccbec／2B 現況／本輪）。
// 每個版本各起一個 dev server（副本根目錄需放 tools/motion-2b-anim.html），本腳本依序截圖：
//   GIF_SOURCES='[{"label":"改前 f4ccbec","url":"http://127.0.0.1:5207"}, ...]'
//   GIF_OUT=<逐幀 PNG 輸出資料夾（本機、repo 外）>  PLAYWRIGHT_MODULE=<既有 Playwright>
//   node tools/motion-2b-gif.mjs
// 輸出：GIF_OUT/<版本序>/<情境>-<geo|real>/NNN.png（直式 390×844，每 2 tick 一張＝30 fps）與 frames.json。
// 合成 GIF：python tools/motion-2b-gif-compose.py（見該檔）。
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SOURCES = JSON.parse(process.env.GIF_SOURCES || '[]');
const OUT = process.env.GIF_OUT;
if (!OUT || !SOURCES.length) throw new Error('需要 GIF_SOURCES 與 GIF_OUT');
const SCENARIOS = (process.env.GIF_SCENARIOS || 'spike,bump,servejump').split(',');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const meta = { sources: SOURCES, scenarios: SCENARIOS, runs: [] };
for (const [vi, src] of SOURCES.entries()) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${src.url}/tools/motion-2b-anim.html`);
  await page.waitForFunction(() => window.__animReady === true, null, { timeout: 90000 });
  for (const scn of SCENARIOS) {
    for (const kind of ['geo', 'real']) {
      await page.evaluate(([s, k]) => window.__anim.setup(s, k), [scn, kind]);
      const dir = resolve(OUT, String(vi), `${scn}-${kind}`);
      await mkdir(dir, { recursive: true });
      const seqs = [];
      for (let f = 0; f < 400; f += 1) {
        const r = await page.evaluate(() => window.__anim.step(2));
        await page.screenshot({ path: resolve(dir, `${String(f).padStart(3, '0')}.png`) });
        seqs.push(r.seq);
        if (r.done) break;
      }
      meta.runs.push({ version: vi, label: src.label, scenario: scn, kind, frames: seqs.length, seqs });
      console.log(`[gif] ${src.label} ${scn}/${kind}：${seqs.length} 幀`);
    }
  }
  meta.runs.push({ version: vi, errors });
  await page.close();
}
await writeFile(resolve(OUT, 'frames.json'), `${JSON.stringify(meta, null, 2)}\n`);
await browser.close();
