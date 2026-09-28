// 寫實蒙皮診斷：4 個時刻的「寫實｜幾何」並排截圖（問題區標紅），驅動 tools/real-skin-diag.html。
// 用法：node tools/real-skin-shots.mjs --out=<輸出資料夾> [--faces=20k|5k] [--port=5181] [--variant=base|heatCombo8]
// 自己起 vite dev server（程式內 createServer，結束即關）＋ headless Chromium（PLAYWRIGHT_MODULE 指到既有安裝，
// 同 tools/real-player-browser.mjs）。輸出 <時刻序號>-<id>-<中文時刻名>.png 與 manifest.json。
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const out = resolve(args.out || join(tmpdir(), 'real-skin-diag'));
const faces = args.faces === '5k' ? '5k' : '20k';
const port = Number(args.port || 5181);
const variant = args.variant || 'base';
const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(out, { recursive: true });

const NAMES = { spike: '扣球引臂揮臂', serve: '發球拋球起手', run: '跑步擺臂', ready: '待命接球' };
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const manifest = { createdAt: new Date().toISOString(), faces, variant, shots: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/tools/real-skin-diag.html`);
  await page.waitForFunction(() => window.__skinDiagReady === true, null, { timeout: 60000 });
  const ids = await page.evaluate(() => window.__skinDiag.moments);
  for (const [i, id] of ids.entries()) {
    const info = await page.evaluate(([m, f, v]) => window.__skinDiag.renderMoment(m, { faces: f, variant: v }), [id, faces, variant]);
    await page.setViewportSize({ width: info.width, height: info.height });
    const file = join(out, `${variant === 'base' ? '' : 'after-'}${i + 1}-${id}-${NAMES[id] ?? id}${variant === 'base' ? '' : `-${variant}`}.png`);
    await page.locator('#wrap').screenshot({ path: file });
    manifest.shots.push({ file, ...info });
    console.log(`${file}  ${info.width}×${info.height}  ${info.summary.map((s) => `${s.key}:a${s.a.over2}/b${s.b.r.inside}+${s.b.l.inside}`).join(' ')}`);
  }
  manifest.errors = errors;
  if (errors.length) console.log(`頁面錯誤 ${errors.length}：\n${errors.join('\n')}`);
} finally {
  await browser.close();
  await server.close();
}
const mf = join(out, variant === 'base' ? 'manifest.json' : `manifest-${variant}.json`);
await writeFile(mf, JSON.stringify(manifest, null, 1));
console.log(`manifest：${mf}`);
