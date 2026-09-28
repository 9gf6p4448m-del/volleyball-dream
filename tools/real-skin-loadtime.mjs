// 寫實蒙皮修正 S8：寫實模型載入耗時（只記錄、不設門檻；docs/kickoffs/real-skin-acceptance.md S8）。
// 用法：node tools/real-skin-loadtime.mjs [--runs=7]
// 量 src/render/realPlayer.js 的 loadRealPlayerAsset（讀 glb＋解析＋法線＋權重＋部位標籤＋接縫拆分＋鞋底集合）
// 在本機 node 的耗時：20k、5k 各先暖機 1 次，再跑 runs 次取中位數與最小／最大。非手機數字，只作改前／改後相對比較。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as rp from '../src/render/realPlayer.js';

if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class extends Event { constructor(t, i = {}) { super(t); Object.assign(this, i); } };
}
const netFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('file:')) return new Response(await readFile(fileURLToPath(url)), { status: 200 });
  return netFetch(input, init);
};
const runs = Number((process.argv.find((a) => a.startsWith('--runs=')) || '--runs=7').split('=')[1]);
const out = [`# real-skin-loadtime（本機 node ${process.version}，${new Date().toISOString()}）`];
for (const faces of ['20k', '5k']) {
  const url = new URL(`../public/models/real/player_${faces}.glb`, import.meta.url).href;
  await rp.loadRealPlayerAsset(url); // 暖機
  const ms = [];
  for (let i = 0; i < runs; i += 1) {
    const t = performance.now();
    await rp.loadRealPlayerAsset(url);
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  out.push(`- ${faces}：中位數 ${ms[Math.floor(ms.length / 2)].toFixed(1)} ms（最小 ${ms[0].toFixed(1)}、最大 ${ms[ms.length - 1].toFixed(1)}，${runs} 次）`);
}
console.log(out.join('\n'));
