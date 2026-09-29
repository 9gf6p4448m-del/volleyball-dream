// S10 對照截圖（step7）前置：四欄 × 各時刻，在 node 端算好「該欄管線實際會畫的」頂點位置與法線，存成二進位給 page.html 畫。
//  ・現況 8720597：git 上 8720597 的 src/render/realPlayer.js（SkinnedMesh；GPU LBS 的等價 CPU 版：lib.skinPositions＋同權重混合法線）
//  ・方案 3：src 現行版，直接取 p.renderedPositions()／renderedNormals()（就是遊戲送進 GPU 的那兩個陣列）
//  ・DQS、DQS＋碰撞修正：step7/harness/exp-dqs.mjs 的比較原型（不在 src）
// 四欄都走同一條 lib.makeReal → driveKey 姿勢路徑（createRealPlayer＋geoAnimator 逐幀＋groundLegs）。
// 另存每欄各時刻 S14 逐點 δ 最大的點（左右臂，照 armpit-web 算法）供近拍標記。
// 用法：node dump.mjs <out 資料夾> [faces=20k]
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { loadSetup, lib, V2, WT_PATH } from '../../harness/evalx.mjs';
import { variantRp, DQS_WEIGHTS, skinDQS, skinDQSCollide, boneMatrices } from '../../harness/exp-dqs.mjs';
import { deltas } from '../../harness/s14delta.mjs';
import { SHOTS } from './shots.mjs';

const out = process.argv[2]; const faces = process.argv[3] || '20k';
await mkdir(out, { recursive: true });
const NM = realpathSync(`${WT_PATH}node_modules/three`).split('\\').join('/');
// 8720597 的 realPlayer.js（git show，只換 import 路徑）
let old = execFileSync('git', ['show', '8720597:src/render/realPlayer.js'], { cwd: WT_PATH, encoding: 'utf8', maxBuffer: 1 << 26 });
for (const [f, r] of [["from 'three';", `from '${pathToFileURL(`${NM}/build/three.module.js`).href}';`],
  ["from 'three/addons/loaders/GLTFLoader.js';", `from '${pathToFileURL(`${NM}/examples/jsm/loaders/GLTFLoader.js`).href}';`],
  ["from './geoCharacter.js';", `from '${pathToFileURL(`${WT_PATH}src/render/geoCharacter.js`).href}';`]]) {
  if (old.split(f).length !== 2) throw new Error(`8720597 副本替換失敗：${f}`);
  old = old.replace(f, () => r);
}
const oldFile = `${tmpdir()}/real-skin-step7-rp8720597.mjs`;
await writeFile(oldFile, old);
const rpOld = await import(pathToFileURL(oldFile).href);
const rpSrc = await import('../../../../../../src/render/realPlayer.js');
const rpDqs = await variantRp(DQS_WEIGHTS);
V2.installNodeFetch();
const glb = new URL(`../../../../../../public/models/real/player_${faces}.glb`, import.meta.url).href;
const assetOld = await rpOld.loadRealPlayerAsset(glb);
const setupSrc = await loadSetup(faces, rpSrc);
const setupDqs = await loadSetup(faces, rpDqs);

function lbsOld(p) { // 8720597：SkinnedMesh 的 GPU LBS 等價（位置＝lib.skinPositions；法線＝同權重混合 3×3 後正規化）
  const P = lib.skinPositions(V2.MODS.THREE, p);
  const g = p.mesh.geometry; const Nn = g.attributes.normal.array; const SI = g.attributes.skinIndex.array; const SW = g.attributes.skinWeight.array;
  const MB = boneMatrices(p.mesh.skeleton); const N = new Float32Array(Nn.length);
  for (let i = 0; i < Nn.length / 3; i += 1) {
    let x = 0; let y = 0; let z = 0;
    for (let k = 0; k < 4; k += 1) {
      const w = SW[i * 4 + k]; if (!w) continue; const e = SI[i * 4 + k] * 16; const u = Nn[i * 3]; const v = Nn[i * 3 + 1]; const t = Nn[i * 3 + 2];
      x += w * (MB[e] * u + MB[e + 4] * v + MB[e + 8] * t); y += w * (MB[e + 1] * u + MB[e + 5] * v + MB[e + 9] * t); z += w * (MB[e + 2] * u + MB[e + 6] * v + MB[e + 10] * t);
    }
    const l = Math.hypot(x, y, z) || 1; N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
  }
  return { P, N };
}
const COLS = [
  ['cur', '現況 8720597', rpOld, assetOld, (p) => lbsOld(p)],
  ['s3', '方案3（正式實作）', rpSrc, setupSrc.loaded, (p) => ({ P: Float32Array.from(p.renderedPositions()), N: Float32Array.from(p.renderedNormals()) })],
  ['dqs', 'DQS（比較原型）', rpDqs, setupDqs.loaded, (p) => skinDQS(p)],
  ['dqsc', 'DQS＋碰撞修正（比較原型）', rpDqs, setupDqs.loaded, (p) => skinDQSCollide(p, rpDqs, setupDqs.loaded)],
];
const man = { faces, cols: COLS.map(([id, label]) => ({ id, label })), shots: [] };
const done = new Set();
for (const [name, keyId, cam] of SHOTS) {
  const key = lib.ALL_KEYS.find((k) => k.id === keyId);
  const shot = { name, key: keyId, cam: cam || key.cam, marks: {} };
  for (const [id, , rp, asset, skin] of COLS) {
    const real = lib.makeReal({ ...V2.MODS, rp }, asset);
    lib.driveKey({ ...V2.MODS, rp }, [real], key);
    const r = skin(real.p);
    shot.rootY = real.rig.root.position.y;
    const sk = real.p.skeleton ?? real.p.mesh.skeleton;
    const dd = deltas(setupSrc, sk, r.P, faces);
    shot.marks[id] = Object.fromEntries(['r', 'l'].map((s) => {
      const m = dd[s].reduce((a, b) => (b.d > a.d ? b : a));
      return [s, { d: +(m.d * 100).toFixed(1), pos: m.pos, off: dd[s].filter((x) => x.d > 0.02).length }];
    }));
    const base = `${id}-${keyId}`;
    if (!done.has(base)) {
      done.add(base);
      const g = real.p.mesh.geometry;
      await writeFile(`${out}/${base}.pos.bin`, Buffer.from(Float32Array.from(r.P).buffer));
      await writeFile(`${out}/${base}.nor.bin`, Buffer.from(Float32Array.from(r.N).buffer));
      await writeFile(`${out}/${base}.col.bin`, Buffer.from(Float32Array.from(g.attributes.color.array).buffer));
      await writeFile(`${out}/${base}.idx.bin`, Buffer.from(Uint32Array.from(g.index.array).buffer));
    }
  }
  man.shots.push(shot);
}
await writeFile(`${out}/manifest.json`, JSON.stringify(man, null, 1));
console.log(JSON.stringify(man.shots.map((s) => [s.name, s.marks])));
