// 寫實蒙皮修正 S3：新指標 (e)「手埋短褲」——手臂（含手）頂點穿入骨盆＋左右大腿表面。
// 驗收：docs/kickoffs/real-skin-acceptance.md S3。用法：
//   node tools/real-skin-thigh.mjs [--faces=20k|5k] [--json=<path>]
// 量法比照 (b)，而且直接重用 tools/real-skin-lib.mjs 的 metricPenetration（最近點＋內插頂點法線定號、
// 最近點落在子集邊界＝無法判定），只把「被穿入的表面」換成：三頂點的主骨（skinWeight 最大者）皆為
// pelvis／rHip／lHip 的三角形。手臂頂點集合＝lib 的 bindRegions（與 (b) 同一套，含手）。
// 姿勢一律由 lib 的 makeReal／driveKey 走真實路徑（src/render/realPlayer.js＋geoAnimator），不改 lib。
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import * as ga from '../src/render/geoAnimator.js';
import * as gc from '../src/render/geoCharacter.js';
import * as rp from '../src/render/realPlayer.js';
import * as lib from './real-skin-lib.mjs';

// node 端補兩個瀏覽器 API（同 tools/real-skin-measure.mjs），讓 GLTFLoader 讀得到本機 glb 與其他本機檔
if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class extends Event { constructor(t, i = {}) { super(t); Object.assign(this, i); } };
}
const netFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('file:')) return new Response(await readFile(fileURLToPath(url)), { status: 200 });
  return netFetch(input, init);
};

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const faces = args.faces === '5k' ? '5k' : '20k';
const glbUrl = new URL(`../public/models/real/player_${faces}.glb`, import.meta.url).href;
const HIP_BONES = ['pelvis', 'rHip', 'lHip'];

// 骨盆＋大腿表面：三頂點主骨皆屬 HIP_BONES 的三角形；並算該子集的邊界邊／邊界頂點（供 metricPenetration 判定無法判定）
function hipSurface(asset, bones, R) {
  const g = asset.geometry;
  const SI = g.attributes.skinIndex.array;
  const SW = g.attributes.skinWeight.array;
  const n = g.attributes.position.count;
  const want = new Set(HIP_BONES.map((b) => bones.indexOf(b)));
  const inSet = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    let best = -1; let bw = -1;
    for (let k = 0; k < 4; k += 1) if (SW[i * 4 + k] > bw) { bw = SW[i * 4 + k]; best = SI[i * 4 + k]; }
    if (want.has(best)) inSet[i] = 1;
  }
  const idx = R.index;
  const tris = [];
  for (let t = 0; t < idx.length / 3; t += 1) {
    if (inSet[idx[t * 3]] && inSet[idx[t * 3 + 1]] && inSet[idx[t * 3 + 2]]) tris.push(t);
  }
  const count = new Map();
  for (const t of tris) {
    for (let e = 0; e < 3; e += 1) {
      const k = R.ek(idx[t * 3 + e], idx[t * 3 + ((e + 1) % 3)]);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const boundaryEdge = new Set();
  const boundaryVert = new Uint8Array(n);
  for (const [k, c] of count) {
    if (c !== 1) continue;
    boundaryEdge.add(k);
    boundaryVert[Math.floor(k / 1048576)] = 1; boundaryVert[k % 1048576] = 1;
  }
  let verts = 0; for (let i = 0; i < n; i += 1) verts += inSet[i];
  return { tris, boundaryEdge, boundaryVert, verts };
}

const asset = await rp.loadRealPlayerAsset(glbUrl);
const R = lib.bindRegions(asset, rp.LANDMARKS);
const hip = hipSurface(asset, rp.BONES, R);
// 換掉被穿入的表面，其餘（手臂集合、索引、綁定位置、ek）沿用 (b) 的同一份
const RH = { ...R, torsoTris: hip.tris, boundaryEdge: hip.boundaryEdge, boundaryVert: hip.boundaryVert };
const mods = { THREE, rp, ga, gc };
const rows = {};
for (const key of lib.ALL_KEYS) {
  const real = lib.makeReal(mods, asset);
  const pk = lib.driveKey(mods, [real], key);
  const P1 = lib.skinPositions(THREE, real.p);
  const N1 = lib.vertexNormals(P1, R.index);
  const e = lib.metricPenetration(RH, P1, N1);
  delete e.flagged;
  rows[key.id] = { seq: pk?.type ?? null, t: pk?.t ?? null, r: e.r, l: e.l };
}

const cm = (m) => (m * 100).toFixed(1);
const out = [];
out.push(`# real-skin-thigh (e) 手臂穿入骨盆＋大腿（faces=${faces}，${new Date().toISOString()}）`);
out.push(`表面：主骨∈{${HIP_BONES.join(', ')}} 的頂點 ${hip.verts} 個、三角形 ${hip.tris.length} 個、邊界邊 ${hip.boundaryEdge.size}；手臂頂點 右 ${R.armVerts.r.length}／左 ${R.armVerts.l.length}`);
out.push('| 幀 | 序列 | 右 穿入點 | 右 >1cm | 右 最深 cm | 右 無法判定 | 左 穿入點 | 左 >1cm | 左 最深 cm | 左 無法判定 | 分區（右｜左） |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [id, v] of Object.entries(rows)) {
  const z = (s) => Object.entries(v[s].zones).map(([zk, zz]) => `${zk.split('→')[0]} ${zz.n}/${cm(zz.max)}`).join('、') || '無';
  out.push(`| ${id} | ${v.seq ?? '待命'} | ${v.r.inside} | ${v.r.deeper1cm} | ${cm(v.r.maxDepth)} | ${v.r.undetermined} | ${v.l.inside} | ${v.l.deeper1cm} | ${cm(v.l.maxDepth)} | ${v.l.undetermined} | ${z('r')}｜${z('l')} |`);
}
// 驗收判讀（S3）：鑑別力兩面＋門檻
const k4bTotal = rows.K4b.r.inside + rows.K4b.l.inside;
out.push('');
out.push(`鑑別力（未修改 src 時應為：K4b >0、K1b 右臂 =0）：K4b 穿入點 右+左＝${k4bTotal}；K1b 右臂穿入點＝${rows.K1b.r.inside}`);
const gate = ['K4a', 'K4b', 'K4c'].map((id) => {
  const ok = ['r', 'l'].every((s) => rows[id][s].inside <= 10 && Number(cm(rows[id][s].maxDepth)) <= 1.0);
  return `${id} ${ok ? '過' : '不過'}`;
});
out.push(`S3 門檻（K4a／K4b／K4c 每臂 ≤10 點且最深 ≤1.0 cm）：${gate.join('、')}`);
console.log(out.join('\n'));
if (args.json && args.json !== '1') {
  await writeFile(args.json, JSON.stringify({ faces, hipSurface: { verts: hip.verts, tris: hip.tris.length, boundaryEdges: hip.boundaryEdge.size }, rows }, null, 1));
  console.log(`\nJSON：${args.json}`);
}
