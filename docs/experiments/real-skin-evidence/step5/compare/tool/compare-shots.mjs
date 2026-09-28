// 用法：node compare-shots.mjs --root=<工作樹> --out=<資料夾> --tag=<before|after> [--port=5195]
// 以 <工作樹> 為 vite root 起 dev server，載入本資料夾的 compare-page.html（先複製到 <工作樹>/zz-compare-page.html，結束即刪），
// 逐張拍 SHOTS 寫成 <tag>-<名稱>.png。PLAYWRIGHT_MODULE 同 tools/real-player-browser.mjs。
import { createRequire } from 'node:module';
import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a, '1']; }));
const root = resolve(args.root); const out = resolve(args.out); const tag = args.tag; const port = Number(args.port || 5195);
export const SHOTS = [
  ['1-扣球引臂-K1a', 'K1a', null],
  ['1b-扣球引臂-K1a-左臂胸口近拍-正前', 'K1a', { az: 15, el: 8, dist: 1.25, ty: 1.4, tx: 0.1, tz: 0.02 }],
  ['1c-扣球引臂-K1a-左臂胸口近拍-左前', 'K1a', { az: 55, el: 8, dist: 1.25, ty: 1.4, tx: 0.1, tz: 0.02 }],
  ['2-揮臂擊球-K1b', 'K1b', null],
  ['3-發球起手-K2b', 'K2b', null],
  ['4-跑步擺臂-後擺-K3a', 'K3a', null],
  ['4b-跑步擺臂-前擺-K3b', 'K3b', null],
  ['5-待命接球-K4b', 'K4b', null],
];
await mkdir(out, { recursive: true });
const page0 = join(root, 'zz-compare-page.html');
await copyFile(fileURLToPath(new URL('./compare-page.html', import.meta.url)), page0);
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const manifest = { tag, root, shots: [] };
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 760 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/zz-compare-page.html`, { timeout: 180000 });
  await page.waitForFunction(() => window.__cmp?.ready === true, null, { timeout: 60000 });
  for (const [name, key, cam] of SHOTS) {
    const r = await page.evaluate(([k, c]) => window.__cmp.shot(k, c), [key, cam]);
    await writeFile(join(out, `${tag}-${name}.png`), Buffer.from(r.url.split(',')[1], 'base64'));
    manifest.shots.push({ name, key, cam, weightsSource: r.weightsSource });
  }
  manifest.errors = errors;
} finally { await browser.close(); await server.close(); await rm(page0, { force: true }); }
await writeFile(join(out, `manifest-${tag}.json`), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify(manifest));
