// S15（R13）：桌機 node 單執行緒每人每幀 updateSkin 耗時（暖機 50、量 300 次取平均；K1a、K4b），12 人合計＝單人×12。
// 新正式版＝src；對照＝3eaff0a3（方案 3）的 realPlayer.js（git show，只換 import 路徑；權重檔同一份，耗時與權重數值無關，
// 與權重非零個數有關——兩版烘焙器相同，非零數差異很小）。三輪各跑一次，列最小／最大。
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { loadSetup, lib, V2, WT_PATH } from '../../step7/harness/evalx.mjs';
const faces = process.argv[2] || '5k';
const NM = realpathSync(`${WT_PATH}node_modules/three`).split(String.fromCharCode(92)).join('/');
let t = execFileSync('git', ['show', '3eaff0a3:src/render/realPlayer.js'], { cwd: WT_PATH, encoding: 'utf8', maxBuffer: 1 << 26 });
for (const [f, r] of [["from 'three';", `from '${pathToFileURL(`${NM}/build/three.module.js`).href}';`],
  ["from 'three/addons/loaders/GLTFLoader.js';", `from '${pathToFileURL(`${NM}/examples/jsm/loaders/GLTFLoader.js`).href}';`],
  ["from './geoCharacter.js';", `from '${pathToFileURL(`${WT_PATH}src/render/geoCharacter.js`).href}';`]]) t = t.replace(f, () => r);
const f3 = `${tmpdir()}/rp-3eaff0a3-perf.mjs`; await writeFile(f3, t);
const rp3 = await import(pathToFileURL(f3).href);
const src = await import('../../../../../src/render/realPlayer.js');
const sN = await loadSetup(faces, src); const s3 = await loadSetup(faces, rp3);
const time = (f) => { for (let i = 0; i < 50; i += 1) f(); const a = performance.now(); for (let i = 0; i < 300; i += 1) f(); return (performance.now() - a) / 300; };
const res = {};
for (let round = 0; round < 3; round += 1) {
  for (const key of lib.ALL_KEYS.filter((k) => ['K1a', 'K4b'].includes(k.id))) {
    for (const [name, s] of [['new', sN], ['s3', s3]]) {
      const r = lib.makeReal(s.mods, s.loaded); lib.driveKey(s.mods, [r], key);
      const ms = time(() => r.p.updateSkin());
      const k = `${key.id} ${name}`; (res[k] = res[k] || []).push(ms);
      res[`${k} hits`] = [r.p.skinStats().hits];
    }
  }
}
const f2 = (x) => x.toFixed(2);
console.log(`S15 ${faces}（頂點 ${sN.G.attributes.position.count}；node ${process.version}；${process.platform}；3 輪）`);
for (const key of ['K1a', 'K4b']) {
  const a = res[`${key} new`]; const b = res[`${key} s3`];
  console.log(`${key}：新正式版 DQS＋碰撞 每人 ${f2(Math.min(...a))}–${f2(Math.max(...a))} ms → 12 人 ${f2(12 * Math.min(...a))}–${f2(12 * Math.max(...a))} ms（碰撞群組 ${res[`${key} new hits`]}）｜方案3（3eaff0a3，同場重量）每人 ${f2(Math.min(...b))}–${f2(Math.max(...b))} → 12 人 ${f2(12 * Math.min(...b))}–${f2(12 * Math.max(...b))} ms`);
}
