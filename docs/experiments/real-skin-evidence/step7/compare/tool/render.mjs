// 用法：PLAYWRIGHT_MODULE=<playwright> node render.mjs <dump 資料夾> <raw 輸出資料夾>
// 以 repo 根為 vite root（取 three），page.html 先複製成根目錄的 zz-step7-page.html（結束即刪）；dump 以 /@fs/ 讀
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { CLOSEUPS } from './shots.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [dump, out] = process.argv.slice(2);
const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const man = JSON.parse(await readFile(join(dump, 'manifest.json'), 'utf8'));
await mkdir(out, { recursive: true });
const page0 = join(root, 'zz-step7-page.html');
await copyFile(fileURLToPath(new URL('./page.html', import.meta.url)), page0);
const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5198, strictPort: true, fs: { strict: false } } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const dir = dump.split('\\').join('/');
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 760 } });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:5198/zz-step7-page.html', { timeout: 180000 });
  await page.waitForFunction(() => window.__s?.ready === true, null, { timeout: 60000 });
  for (const s of man.shots) for (const c of man.cols) {
    const marks = CLOSEUPS.has(s.name) ? ['r', 'l'].map((k) => s.marks[c.id][k].pos) : null;
    const r = await page.evaluate((a) => window.__s.shot(...a), [dir, c.id, s.key, s.cam, s.rootY, marks]);
    await writeFile(join(out, `${c.id}-${s.name}.png`), Buffer.from(r.url.split(',')[1], 'base64'));
  }
  console.log('errors', JSON.stringify(errors));
} finally { await browser.close(); await server.close(); await rm(page0, { force: true }); }
