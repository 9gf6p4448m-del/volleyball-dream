// step7 比較用原型（不進 src；使用者 09-29 追加要求）：DQS、DQS＋碰撞修正。
//  ・權重＝技術調查的「同權重＋DQS」：熱擴散（手臂 c=0.7）、無輔助骨、上臂不剛性（烘焙器 UPPER_RIGID_T=null，即時算）。
//  ・DQS＝Kavan et al. 2008（等比縮放拆出、以主骨為符號參考避免對蹠、法線用混合後的旋轉）。
//  ・碰撞修正＝src 匯出的 collideArms（與方案 3 正式實作同一份程式碼、同一份 SDF），套在 DQS 結果上。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { WT_PATH } from './evalx.mjs';

const NM = realpathSync(`${WT_PATH}node_modules/three`).split('\\').join('/');
const THREE = await import(pathToFileURL(`${NM}/build/three.module.js`).href);
const BK = await import(pathToFileURL(`${WT_PATH}tools/bake-real-skin-weights.mjs`).href);

// src/render/realPlayer.js 的暫存副本：只把權重來源換成即時烘焙（params 覆寫），其餘一字不改
let seq = 0;
export async function variantRp(bakeOverride) {
  let text = await readFile(`${WT_PATH}src/render/realPlayer.js`, 'utf8');
  const reps = [
    ["from 'three';", `from '${pathToFileURL(`${NM}/build/three.module.js`).href}';`],
    ["from 'three/addons/loaders/GLTFLoader.js';", `from '${pathToFileURL(`${NM}/examples/jsm/loaders/GLTFLoader.js`).href}';`],
    ["from './geoCharacter.js';", `from '${pathToFileURL(`${WT_PATH}src/render/geoCharacter.js`).href}';`],
    ['const baked = await loadBakedWeights(url, pos);', 'const baked = globalThis.__stepW(pos, nor, geometry.index.array);'],
  ];
  for (const [f, r] of reps) {
    const n = text.split(f).length - 1;
    if (n !== 1) throw new Error(`副本替換命中 ${n} 次：${f}`);
    text = text.replace(f, () => r);
  }
  const dir = `${tmpdir()}/real-skin-step7-mods`;
  await mkdir(dir, { recursive: true });
  const file = `${dir}/rp${process.pid}_${seq += 1}.mjs`;
  await writeFile(file, text);
  const rp = await import(pathToFileURL(file).href);
  const params = { ...BK.PARAMS, ...bakeOverride };
  globalThis.__stepW = (pos, nor, index) => BK.bakeWeights(rp, pos, nor, index, params);
  return rp;
}
export const DQS_WEIGHTS = { UPPER_RIGID_T: null };

// 各骨 matrixWorld·boneInverse（與 src updateSkin 同一個定義）
export function boneMatrices(skeleton) {
  const nb = skeleton.bones.length; const MB = new Float64Array(nb * 16); const m = new THREE.Matrix4();
  for (let b = 0; b < nb; b += 1) { m.multiplyMatrices(skeleton.bones[b].matrixWorld, skeleton.boneInverses[b]); MB.set(m.elements, b * 16); }
  return MB;
}
function boneDQ(MB, nb) {
  const out = []; let s0 = null;
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const sc = new THREE.Vector3();
  for (let i = 0; i < nb; i += 1) {
    m.fromArray(MB, i * 16); m.decompose(p, q, sc);
    if (Math.abs(sc.x - sc.y) > 1e-5 || Math.abs(sc.x - sc.z) > 1e-5) throw new Error(`骨 ${i} 非等比縮放`);
    if (s0 === null) s0 = sc.x; else if (Math.abs(sc.x - s0) > 1e-5) throw new Error(`骨 ${i} 縮放不一致`);
    const tx = p.x / s0; const ty = p.y / s0; const tz = p.z / s0; const x = q.x; const y = q.y; const z = q.z; const w = q.w;
    out.push({ r: [x, y, z, w], d: [0.5 * (tx * w + ty * z - tz * y), 0.5 * (-tx * z + ty * w + tz * x), 0.5 * (tx * y - ty * x + tz * w), -0.5 * (tx * x + ty * y + tz * z)] });
  }
  return { B: out, s: s0 };
}
// 回傳 { P, N, MB }（世界座標）
export function skinDQS(p) {
  const G = p.bindGeometry; const P = G.attributes.position.array; const Nn = G.attributes.normal.array;
  const SI = G.attributes.skinIndex.array; const SW = G.attributes.skinWeight.array;
  const MB = boneMatrices(p.skeleton);
  const { B, s } = boneDQ(MB, p.skeleton.bones.length);
  const n = P.length / 3; const o = new Float32Array(n * 3); const on = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const x = P[i * 3]; const y = P[i * 3 + 1]; const z = P[i * 3 + 2];
    let km = 0; for (let k = 1; k < 4; k += 1) if (SW[i * 4 + k] > SW[i * 4 + km]) km = k;
    const r0 = B[SI[i * 4 + km]].r;
    let bx = 0; let by = 0; let bz = 0; let bw = 0; let ex = 0; let ey = 0; let ez = 0; let ew = 0;
    for (let k = 0; k < 4; k += 1) {
      let w = SW[i * 4 + k]; if (!w) continue; const bq = B[SI[i * 4 + k]];
      if (bq.r[0] * r0[0] + bq.r[1] * r0[1] + bq.r[2] * r0[2] + bq.r[3] * r0[3] < 0) w = -w;
      bx += w * bq.r[0]; by += w * bq.r[1]; bz += w * bq.r[2]; bw += w * bq.r[3];
      ex += w * bq.d[0]; ey += w * bq.d[1]; ez += w * bq.d[2]; ew += w * bq.d[3];
    }
    const len = Math.hypot(bx, by, bz, bw);
    bx /= len; by /= len; bz /= len; bw /= len; ex /= len; ey /= len; ez /= len; ew /= len;
    const rot = (u, v, t) => {
      const cx = by * t - bz * v + bw * u; const cy = bz * u - bx * t + bw * v; const cz = bx * v - by * u + bw * t;
      return [u + 2 * (by * cz - bz * cy), v + 2 * (bz * cx - bx * cz), t + 2 * (bx * cy - by * cx)];
    };
    const pr = rot(x, y, z);
    const tx = 2 * (bw * ex - ew * bx + (by * ez - bz * ey)); const ty = 2 * (bw * ey - ew * by + (bz * ex - bx * ez)); const tz = 2 * (bw * ez - ew * bz + (bx * ey - by * ex));
    o[i * 3] = s * (pr[0] + tx); o[i * 3 + 1] = s * (pr[1] + ty); o[i * 3 + 2] = s * (pr[2] + tz);
    const nr = rot(Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]); const nl = Math.hypot(...nr) || 1;
    on[i * 3] = nr[0] / nl; on[i * 3 + 1] = nr[1] / nl; on[i * 3 + 2] = nr[2] / nl;
  }
  return { P: o, N: on, MB };
}
const works = new WeakMap();
export function skinDQSCollide(p, rp, loaded) {
  const r = skinDQS(p);
  const C = loaded.collide;
  if (!C) throw new Error('沒有 SDF（asset.collide）');
  let w = works.get(C); if (!w) { w = rp.collideWork(C); works.set(C, w); }
  rp.collideArms(C, r.MB, r.P, r.N, p.bindGeometry.index.array, w);
  return { ...r, stats: { ...w.stats } };
}
