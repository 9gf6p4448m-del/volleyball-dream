#!/usr/bin/env node
// 寫實球員卷 2B · E7 並排對照截圖（docs/kickoffs/real-player-stage2-match.md「### 2B 驗收」E7）
//
// 用法：先起 dev server（node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5206 --strictPort），再
//   node tools/motion-2b-shots.mjs
// 環境變數：SHOTS_BASE（預設 http://127.0.0.1:5206）、PLAYWRIGHT_MODULE、
//   REF_DIR（真人參考照片與其 manifest.json 所在的本機資料夾；**不在 repo 內**）、
//   REF_OUT（含參考照片的並排圖輸出資料夾；**不在 repo 內**）。
// 輸出：docs/experiments/motion-2b-evidence/ 下的遊戲截圖（幾何／寫實 × 桌機 1280×720／直式 390×844）、
//   幾何＋寫實並排圖、manifest.json（只記參考照片的來源 URL 與對應關係，不含照片本身）；
//   REF_OUT 下另有「參考＋幾何＋寫實」三格並排圖（版權：參考照片不進 repo）。
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.SHOTS_BASE || 'http://127.0.0.1:5206';
const OUT = resolve('docs/experiments/motion-2b-evidence');
const REF_DIR = process.env.REF_DIR;
const REF_OUT = process.env.REF_OUT;
if (!REF_DIR || !REF_OUT) throw new Error('需要 REF_DIR 與 REF_OUT（本機、repo 外）');
if (resolve(REF_OUT).startsWith(resolve('.'))) throw new Error('REF_OUT 不得在 repo 內（參考照片版權）');
await mkdir(OUT, { recursive: true });
await mkdir(REF_OUT, { recursive: true });

// 技術 → D0 幀、預期序列、參考照片（manifest 的 technique 與 phase 關鍵字）
const PLAN = [
  { tech: 'bump', d0: 'bump-contact', seq: 'bump', ref: ['bump', null] },
  { tech: 'set', d0: 'set-push', seq: 'overhead', ref: ['set', null] },
  { tech: 'spike', d0: 'spike-hit', seq: 'spike', ref: ['spike', '擊球'] },
  { tech: 'spikeWind', d0: 'spike-wind', seq: 'spikeHold', ref: ['spike', '引臂'] },
  { tech: 'block', d0: 'block-top', seq: 'blockJump', ref: ['block', null] },
  { tech: 'servejump', d0: 'servejump-hit', seq: 'serveJump', ref: ['servejump', null] },
  { tech: 'servefloat', d0: 'servefloat-hit', seq: 'serveFloat', ref: ['servefloat', null] },
  { tech: 'tip', d0: 'tip-hit', seq: 'tip', ref: ['tip', null] },
];
const VIEWPORTS = [{ name: 'desktop', width: 1280, height: 720 }, { name: 'portrait', width: 390, height: 844 }];

const refs = JSON.parse(await readFile(resolve(REF_DIR, 'manifest.json'), 'utf8'));
function pickRef([technique, phaseKey]) {
  const c = refs.filter((r) => r.technique === technique && (!phaseKey || String(r.phase).includes(phaseKey)));
  return c[0] ?? null;
}
const dataUrl = async (path) => {
  const buf = await readFile(path);
  const ext = path.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  return `data:image/${ext};base64,${buf.toString('base64')}`;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const manifest = {
  createdAt: new Date().toISOString(),
  head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  dirty: execSync('git status --porcelain -- src tools', { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  note: '遊戲截圖由 tools/motion-2b-poses.html（真實 createGeoCharacter／createRealPlayer＋createGeoAnimator，觸發鏈同 D0 腳本 FRAME_DEFS）產生。真人參考照片只存本機、不進 repo；此處只記來源。',
  shots: [],
  composites: [],
  references: {},
};
const errors = [];
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.on('pageerror', (e) => errors.push(`${vp.name} pageerror ${e.message}`));
  await page.goto(`${BASE}/tools/motion-2b-poses.html`);
  await page.waitForFunction(() => window.__posesReady === true, null, { timeout: 60000 });
  for (const item of PLAN) {
    const files = {};
    for (const kind of ['geo', 'real']) {
      const meta = await page.evaluate(([t, k]) => window.__poses.show(t, k), [item.tech, kind]);
      if (meta.seq !== item.seq) errors.push(`${item.tech}/${kind}/${vp.name}：播放中序列 ${meta.seq} ≠ 預期 ${item.seq}`);
      const file = `${item.tech}-${kind}-${vp.name}.png`;
      await page.screenshot({ path: resolve(OUT, file) });
      files[kind] = file;
      manifest.shots.push({ file, tech: item.tech, d0Frame: item.d0, kind, viewport: vp.name, ...meta });
    }
    const ref = pickRef(item.ref);
    const imgs = [await dataUrl(resolve(OUT, files.geo)), await dataUrl(resolve(OUT, files.real))];
    const caps = ['幾何', '寫實'];
    const compose = async (list, captions) => {
      const cp = await browser.newPage({ viewport: { width: 400, height: 300 } });
      const url = await cp.evaluate(async ([srcs, cs]) => {
        const load = (s) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = s; });
        const ims = await Promise.all(srcs.map(load));
        const H = 720;
        const ws = ims.map((im) => Math.round(im.width * (H / im.height)));
        const cv = document.createElement('canvas');
        cv.width = ws.reduce((a, b) => a + b, 0) + 12 * (ims.length - 1);
        cv.height = H + 40;
        const g = cv.getContext('2d');
        g.fillStyle = '#0d1119'; g.fillRect(0, 0, cv.width, cv.height);
        let x = 0;
        ims.forEach((im, i) => {
          g.drawImage(im, x, 40, ws[i], H);
          g.fillStyle = '#eef2fa'; g.font = '600 24px system-ui, sans-serif';
          g.fillText(cs[i], x + 10, 29);
          x += ws[i] + 12;
        });
        return cv.toDataURL('image/png');
      }, [list, captions]);
      await cp.close();
      return Buffer.from(url.split(',')[1], 'base64');
    };
    const repoFile = `${item.tech}-${vp.name}-geo-real.png`;
    await writeFile(resolve(OUT, repoFile), await compose(imgs, caps));
    const comp = { tech: item.tech, viewport: vp.name, d0Frame: item.d0, repoFile, reference: null };
    if (ref) {
      const refPath = resolve(REF_DIR, ref.file);
      if (existsSync(refPath)) {
        const scratchFile = `${item.tech}-${vp.name}-ref-geo-real.png`;
        await writeFile(resolve(REF_OUT, scratchFile), await compose([await dataUrl(refPath), ...imgs], [`真人參考（${ref.phase}）`, ...caps]));
        comp.reference = { localFile: basename(scratchFile), pageUrl: ref.pageUrl, imageUrl: ref.imageUrl, license: ref.license, author: ref.author, view: ref.view, phase: ref.phase, note: ref.note };
      }
    } else {
      errors.push(`${item.tech}：找不到參考照片`);
    }
    manifest.composites.push(comp);
  }
  await page.close();
}
for (const r of refs) {
  manifest.references[r.technique] = manifest.references[r.technique] ?? [];
  manifest.references[r.technique].push({ phase: r.phase, view: r.view, pageUrl: r.pageUrl, imageUrl: r.imageUrl, license: r.license, author: r.author, note: r.note });
}
manifest.errors = errors;
await writeFile(resolve(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
console.log(`[E7] 截圖 ${manifest.shots.length} 張、並排 ${manifest.composites.length} 組（含參考 ${manifest.composites.filter((c) => c.reference).length} 組）；錯誤 ${errors.length}`);
for (const e of errors) console.log(`  ${e}`);
process.exit(errors.length ? 1 : 0);
