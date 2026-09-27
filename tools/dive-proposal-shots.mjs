// 魚躍提案截圖治具：驅動 ?mode=divelab 逐幀決定論截圖（headless Chromium）。
// 用法：先起 dev server（npx vite --host 127.0.0.1 --port 5241 --strictPort），再
//   node tools/dive-proposal-shots.mjs <輸出目錄> [styles=now,a,b,c,c-low] [figs=geo,real] [views=portrait,desktop] [frames=key|all] [cam=side]
// 環境變數：DIVE_BASE_URL（預設 http://127.0.0.1:5241）、PLAYWRIGHT_MODULE（既有 Playwright 安裝路徑）。
// 輸出：<目錄>/<view>/<style>-<fig>-<cam>-f<NN>.png ＋ shots.json（每幀 seq、接地補償量、全身最低點、
// 寫實人手部質心離腕距離＝第一階段 A2(e) 定義）。
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DIVE_BASE_URL || 'http://127.0.0.1:5241';
const [outArg, stylesArg = 'now,a,b,c,c-low', figsArg = 'geo,real', viewsArg = 'portrait,desktop', framesArg = 'key', cam = 'side'] = process.argv.slice(2);
const out = resolve(outArg || 'dive-shots');
export const KEY_FRAMES = { 起動: 2, 撲出: 4, 觸球: 6, 著地滑行: 18, 撐地: 28, 起身: 34 };
const VIEWS = { portrait: { width: 390, height: 844 }, desktop: { width: 1280, height: 720 } };
const frameList = framesArg === 'all' ? Array.from({ length: 44 }, (_, i) => i) : Object.values(KEY_FRAMES);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const report = { base, keyFrames: KEY_FRAMES, shots: [] };
try {
  for (const view of viewsArg.split(',')) {
    await mkdir(join(out, view), { recursive: true });
    for (const fig of figsArg.split(',')) {
      for (const styleTag of stylesArg.split(',')) {
        const [style, ballY] = styleTag === 'c-low' ? ['c', '0.2'] : [styleTag, '1.1'];
        const page = await browser.newPage({ viewport: VIEWS[view] });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`${base}/?mode=divelab&dive=${style}&ball=${ballY}&fig=${fig}&cam=${cam}`);
        await page.waitForFunction(() => window.__diveLab, null, { timeout: 120000 });
        await page.evaluate(() => { window.__diveLab.pause(); });
        await page.addStyleTag({ content: '#divelab-bar,#hud,#vd-boot-logo{display:none!important}' });
        for (const f of frameList) {
          const info = await page.evaluate((fr) => {
            const lab = window.__diveLab;
            const r = lab.seek(fr);
            let hand = null;
            const real = lab.real();
            if (real && lab.state.fig === 'real') {
              // A2(e)：綁定姿勢下該側 |x| ≥ max|x| − 0.10 的頂點群（幾何選取、不讀權重），
              // CPU 蒙皮質心到同側腕關節世界座標的距離
              const { THREE } = lab;
              const pos = real.mesh.geometry.attributes.position;
              if (!window.__handIdx) {
                let maxR = 0; let maxL = 0;
                for (let i = 0; i < pos.count; i += 1) { const x = pos.getX(i); if (x < 0) maxR = Math.max(maxR, -x); else maxL = Math.max(maxL, x); }
                const r2 = []; const l2 = [];
                for (let i = 0; i < pos.count; i += 1) { const x = pos.getX(i); if (x < 0 && -x >= maxR - 0.1) r2.push(i); if (x > 0 && x >= maxL - 0.1) l2.push(i); }
                window.__handIdx = { r: r2, l: l2 };
              }
              const v = new THREE.Vector3();
              const cen = (idx) => { const c = new THREE.Vector3(); for (const i of idx) { real.mesh.getVertexPosition(i, v); c.add(v); } return c.divideScalar(idx.length); };
              const w = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
              hand = {
                r: cen(window.__handIdx.r).distanceTo(w(real.rig.joints.rWrist)),
                l: cen(window.__handIdx.l).distanceTo(w(real.rig.joints.lWrist)),
                n: [window.__handIdx.r.length, window.__handIdx.l.length],
              };
            }
            lab.render();
            return { ...r, hand };
          }, f);
          const file = join(view, `${styleTag}-${fig}-${cam}-f${String(f).padStart(2, '0')}.png`);
          await page.screenshot({ path: join(out, file) });
          report.shots.push({ view, fig, style: styleTag, cam, frame: f, file, ...info });
        }
        report.shots.push({ view, fig, style: styleTag, errors });
        if (errors.length) console.log('頁面錯誤', styleTag, fig, view, errors);
        await page.close();
        console.log('完成', view, fig, styleTag);
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(join(out, `shots-${viewsArg.replace(/,/g, '_')}-${framesArg}-${cam}.json`), JSON.stringify(report, null, 1));
console.log('輸出', out);
