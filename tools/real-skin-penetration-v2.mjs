// 寫實蒙皮修正 R1：新尺——手臂穿入 (b) 軀幹、(e) 骨盆＋大腿。
// 驗收：docs/kickoffs/real-skin-acceptance.md 修訂紀錄 R1（V1–V5）；V 項操作化：docs/experiments/real-skin-evidence/ruler-v2/V-criteria-frozen.md
//
// 用法：node tools/real-skin-penetration-v2.mjs [--faces=20k|5k] [--json=<path>] [--txt=<path>] [--baseline=<新尺 json>]
//   --baseline：拿同一把新尺的另一份 json（例：ruler-v2/before-20k.json）當現況值，另印 S2(i) 不退步逐項比較。
//
// 與舊量法（tools/real-skin-lib.mjs metricPenetration，最近點＋內插頂點法線定號）只差「點在內或外」這一步：
//  ・內外：generalized winding number（Jacobson, Kavan, Sorkine-Hornung 2013, "Robust Inside-Outside Segmentation
//    using Generalized Winding Numbers"）。w(p)＝Σ_{t∈S} Ω_t(p)／4π，Ω_t＝三角形 t 對 p 的有號立體角
//    （Van Oosterom & Strackee 1983）。封閉、外法線一致的曲面：內部 w＝1、外部 0；S 是開放子集時，開口處
//    由 w 的調和延拓自然「補膜」，w＞0.5＝在內。它是整個表面的積分，不看最近點的局部法線，所以凹處
//    （胯下皺摺、褲管口下緣）的遠處最近點不會再把外面的點讀成在裡面；開口邊也不再需要「無法判定」。
//    選它的理由：①對開放、有洞的子集表面仍有定義（S_b、S_e 都是從整隻白模切出來的開放曲面）；
//    ②只看幾何，不需調參（0.5 是方法本身的門檻）；③精確加總、無隨機，逐位元可重現。
//  ・深度（照舊）：p 到「被穿入表面」最近三角形的精確距離（Ericson, Real-Time Collision Detection 5.1.5）。
//  ・被穿入表面（與舊版相同）：(b) S_b＝lib.bindRegions 的 torsoTris；(e) S_e＝三頂點主骨（skinWeight 最大者）
//    皆 ∈ {pelvis, rHip, lHip} 的三角形（與 tools/real-skin-thigh.mjs 同規則）。手臂頂點＝R.armVerts。
//  ・R3 起一律讀**凍結集合** tools/real-skin-frozen-sets.json（8720597 上以上述規則算好、按三角形／頂點索引落檔；
//    產生器 tools/real-skin-freeze-sets.mjs），不隨實作的新權重或地標重算；完整性（每集合 sha256）、三角形數、
//    綁定位置雜湊任一不符即報錯。loadSetup(faces, { live: true }) 才用現行規則即時計算（只供產生凍結檔）。
//  ・分區（照舊）：手臂部位 → 最近 S 三角形的綁定質心高度（胸 ≥1.15、腹 0.95–1.15、臀腿 <0.95）。
// 姿勢與蒙皮一律走 lib 的 makeReal／driveKey／skinPositions（src/render/realPlayer.js＋geoAnimator 真實路徑），
// 不重抄蒙皮、不改 lib。同表另列舊量法（lib.metricPenetration）的值供對照。
// 輸出不含時間戳：同輸入連跑兩次，txt／json 逐位元相同（V5）。
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import * as ga from '../src/render/geoAnimator.js';
import * as gc from '../src/render/geoCharacter.js';
import * as rp from '../src/render/realPlayer.js';
import * as lib from './real-skin-lib.mjs';

export const W_IN = 0.5; // generalized winding number 的內外門檻（方法本身的定義，不是可調參數）
export const HIP_BONES = ['pelvis', 'rHip', 'lHip'];
const ZONE = (y) => (y >= 1.15 ? '胸' : y >= 0.95 ? '腹' : '臀腿'); // 與 lib.metricPenetration 相同
const PART = ['上臂', '前臂', '手'];

// ---------------------------------------------------------------------------
// 幾何核心
// 姿勢後的三角形座標攤平：T[k*9 .. k*9+8]＝第 k 個 S 三角形的 a,b,c
export function surfaceArrays(P1, index, tris) {
  const T = new Float64Array(tris.length * 9);
  for (let k = 0; k < tris.length; k += 1) {
    const t = tris[k];
    for (let e = 0; e < 3; e += 1) {
      const v = index[t * 3 + e] * 3;
      T[k * 9 + e * 3] = P1[v]; T[k * 9 + e * 3 + 1] = P1[v + 1]; T[k * 9 + e * 3 + 2] = P1[v + 2];
    }
  }
  return T;
}
// generalized winding number：固定順序逐三角形加總（決定論）
export function windingNumber(T, p) {
  const px = p[0]; const py = p[1]; const pz = p[2];
  let s = 0;
  for (let o = 0; o < T.length; o += 9) {
    const ax = T[o] - px; const ay = T[o + 1] - py; const az = T[o + 2] - pz;
    const bx = T[o + 3] - px; const by = T[o + 4] - py; const bz = T[o + 5] - pz;
    const cx = T[o + 6] - px; const cy = T[o + 7] - py; const cz = T[o + 8] - pz;
    const la = Math.sqrt(ax * ax + ay * ay + az * az);
    const lb = Math.sqrt(bx * bx + by * by + bz * bz);
    const lc = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (ax * cx + ay * cy + az * cz) * lb + (bx * cx + by * cy + bz * cz) * la;
    s += 2 * Math.atan2(det, den);
  }
  return s / (4 * Math.PI);
}
// 點到三角形最近點的重心座標（Ericson 5.1.5；與 lib 內部同一演算法）
export function closestPointTri(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const d1 = dot(ab, ap); const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]];
  const d3 = dot(ab, bp); const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const d5 = dot(ab, cp); const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom; const w = vc * denom;
  return [1 - v - w, v, w];
}
export function triBoxes(T) {
  const n = T.length / 9;
  const bb = new Float64Array(n * 6);
  for (let k = 0; k < n; k += 1) {
    const o = k * 9;
    for (let d = 0; d < 3; d += 1) {
      bb[k * 6 + d] = Math.min(T[o + d], T[o + 3 + d], T[o + 6 + d]);
      bb[k * 6 + 3 + d] = Math.max(T[o + d], T[o + 3 + d], T[o + 6 + d]);
    }
  }
  return bb;
}
// 最近 S 三角形（不設搜尋上限）：回傳 { d, k（S 內序號）, w（重心）, q（最近點） }
export function nearestOnSurface(T, bb, p) {
  let best2 = Infinity; let bk = -1; let bw = null; let bq = null;
  const n = T.length / 9;
  for (let k = 0; k < n; k += 1) {
    const o6 = k * 6;
    const dx = Math.max(bb[o6] - p[0], 0, p[0] - bb[o6 + 3]);
    const dy = Math.max(bb[o6 + 1] - p[1], 0, p[1] - bb[o6 + 4]);
    const dz = Math.max(bb[o6 + 2] - p[2], 0, p[2] - bb[o6 + 5]);
    if (dx * dx + dy * dy + dz * dz >= best2) continue;
    const o = k * 9;
    const A = [T[o], T[o + 1], T[o + 2]]; const B = [T[o + 3], T[o + 4], T[o + 5]]; const C = [T[o + 6], T[o + 7], T[o + 8]];
    const w = closestPointTri(p, A, B, C);
    const q = [0, 1, 2].map((d) => w[0] * A[d] + w[1] * B[d] + w[2] * C[d]);
    const d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    if (d2 < best2) { best2 = d2; bk = k; bw = w; bq = q; }
  }
  return { d: Math.sqrt(best2), k: bk, w: bw, q: bq };
}

// ---------------------------------------------------------------------------
// 被穿入表面
// (b)：lib.bindRegions 的軀幹子集與其開口邊
export function torsoSurface(R) {
  return { name: '(b) 軀幹', tris: R.torsoTris, boundaryEdge: R.boundaryEdge, boundaryVert: R.boundaryVert };
}
// (e)：三頂點主骨皆 ∈ HIP_BONES 的三角形（與 tools/real-skin-thigh.mjs hipSurface 同規則）＋開口邊
export function hipSurface(asset, bones, R) {
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
  return { name: '(e) 骨盆＋大腿', tris, boundaryEdge, boundaryVert, verts };
}
// 子集表面的方向一致性：同一條內部邊被兩個三角形以相同走向使用＝方向不一致（GWN 需要一致的外向）
export function orientationCheck(index, tris) {
  const dir = new Map(); let bad = 0;
  for (const t of tris) {
    for (let e = 0; e < 3; e += 1) {
      const u = index[t * 3 + e]; const v = index[t * 3 + ((e + 1) % 3)];
      const k = `${u},${v}`;
      if (dir.has(k)) bad += 1; else dir.set(k, 1);
    }
  }
  return bad;
}
// 最近點是否落在 S 的開口邊（同 lib 的判法；新量法不因此排除，只當診斷欄）
function onOpening(R, S, t, w) {
  const tv = [R.index[t * 3], R.index[t * 3 + 1], R.index[t * 3 + 2]];
  const zero = w.map((x) => x < 1e-6);
  const nZero = zero.filter(Boolean).length;
  if (nZero === 1) { const k = zero.indexOf(true); return S.boundaryEdge.has(R.ek(tv[(k + 1) % 3], tv[(k + 2) % 3])); }
  if (nZero === 2) return S.boundaryVert[tv[zero.indexOf(false)]] === 1;
  return false;
}

// ---------------------------------------------------------------------------
// 新量法：手臂頂點（R.armVerts）穿入 S
export function penetrationV2(R, S, P1) {
  const T = surfaceArrays(P1, R.index, S.tris);
  const bb = triBoxes(T);
  const out = {};
  const flagged = [];
  for (const s of ['r', 'l']) {
    let inside = 0; let deeper1cm = 0; let maxDepth = 0; let atOpening = 0; let atOpeningMax = 0; let nearHalf = 0;
    const zones = {};
    for (const i of R.armVerts[s]) {
      // 以凍結頂點為單位（第 2 輪 N1）：它的每個被畫出的代表點（原頂點＋對回它的複製點）都判內外；
      // 任一代表判內就算一點，深度取判內代表中最深者；近½＝任一代表 w∈(0.4,0.6)。未套凍結集合（live）時代表＝自己
      const repsI = R.reps ? R.reps.get(i) : [i];
      let w = -Infinity; let nr = null; let near = false;
      for (const v of repsI) {
        const pv = [P1[v * 3], P1[v * 3 + 1], P1[v * 3 + 2]];
        const wv = windingNumber(T, pv);
        if (wv > 0.4 && wv < 0.6) near = true;
        if (!(wv > W_IN)) continue;
        const nv = nearestOnSurface(T, bb, pv);
        if (!nr || nv.d > nr.d) { nr = nv; w = wv; }
      }
      if (near) nearHalf += 1;
      if (!nr) continue;
      const t = S.tris[nr.k];
      const ia = R.index[t * 3]; const ib = R.index[t * 3 + 1]; const ic = R.index[t * 3 + 2];
      const by = (R.P[ia * 3 + 1] + R.P[ib * 3 + 1] + R.P[ic * 3 + 1]) / 3;
      const zk = `${PART[R.armPart[i]]}→${ZONE(by)}`;
      const zz = zones[zk] || (zones[zk] = { n: 0, max: 0 });
      zz.n += 1; zz.max = Math.max(zz.max, nr.d);
      inside += 1;
      if (nr.d > 0.01) deeper1cm += 1;
      if (nr.d > maxDepth) maxDepth = nr.d;
      const op = onOpening(R, S, t, nr.w);
      if (op) { atOpening += 1; atOpeningMax = Math.max(atOpeningMax, nr.d); }
      flagged.push({ i, side: s, w, depth: nr.d, tri: t, opening: op });
    }
    out[s] = { armVerts: R.armVerts[s].length, inside, deeper1cm, maxDepth, zones, atOpening, atOpeningMax, nearHalf };
  }
  return { ...out, flagged };
}

// ---------------------------------------------------------------------------
// 共用：載入、驅動一幀
export function installNodeFetch() {
  if (!globalThis.ProgressEvent) {
    globalThis.ProgressEvent = class extends Event { constructor(t, i = {}) { super(t); Object.assign(this, i); } };
  }
  if (globalThis.__rsV2Fetch) return;
  const netFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('file:')) return new Response(await readFile(fileURLToPath(url)), { status: 200 });
    return netFetch(input, init);
  };
  globalThis.__rsV2Fetch = true;
}
export const MODS = { THREE, rp, ga, gc };
export const FROZEN_URL = new URL('./real-skin-frozen-sets.json', import.meta.url);
// 開口邊：只被一個子集三角形使用的邊（與 lib.bindRegions／hipSurface 同判法）
export function surfaceBoundary(R, tris) {
  const count = new Map();
  for (const t of tris) {
    for (let e = 0; e < 3; e += 1) {
      const k = R.ek(R.index[t * 3 + e], R.index[t * 3 + ((e + 1) % 3)]);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const boundaryEdge = new Set();
  const boundaryVert = new Uint8Array(R.n);
  for (const [k, c] of count) {
    if (c !== 1) continue;
    boundaryEdge.add(k);
    boundaryVert[Math.floor(k / 1048576)] = 1; boundaryVert[k % 1048576] = 1;
  }
  return { boundaryEdge, boundaryVert };
}
// 綁定位置雜湊：前 nVerts 個頂點的 Float32 位元組（splitBridges 若多出複製頂點只會接在尾端）
export function bindPosSha(P, nVerts) {
  return createHash('sha256').update(Buffer.from(P.buffer, P.byteOffset, nVerts * 12)).digest('hex').slice(0, 16);
}
// 凍結檔每個欄位的 sha256（完整 64 碼）：集合＝排序後 Int32 ID（前 12 碼＝setPrint 的集合指紋）；其餘＝該欄 JSON 字串
export function frozenShas(F) {
  const ids = (a) => createHash('sha256').update(Buffer.from(Int32Array.from([...a].sort((x, y) => x - y)).buffer)).digest('hex');
  const js = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  return {
    Sb: ids(F.Sb.tris), Se: ids(F.Se.tris), armR: ids(F.arm.r), armL: ids(F.arm.l), SbVerts: ids(F.SbVerts.ids),
    armRPart: js(F.arm.rPart), armLPart: js(F.arm.lPart), SbMainBone: js(F.SbVerts.mainBone), SbNormal: js(F.SbVerts.normal), SeVerts: js(F.Se.verts),
    indexSha: js(F.indexSha),
  };
}
// glb 原索引（GLTFLoader 讀進來、loadRealPlayerAsset 接縫拆分前的三角形頂點三元組）與原頂點數
export async function glbIndex(url) {
  const buf = await readFile(fileURLToPath(url));
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  if (j.meshes.length !== 1 || j.meshes[0].primitives.length !== 1) throw new Error('glb 不是單一 mesh／primitive');
  const prim = j.meshes[0].primitives[0];
  const acc = j.accessors[prim.indices]; const bv = j.bufferViews[acc.bufferView];
  const off = 20 + jl + 8 + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const rd = { 5121: [1, (o) => buf.readUInt8(o)], 5123: [2, (o) => buf.readUInt16LE(o)], 5125: [4, (o) => buf.readUInt32LE(o)] }[acc.componentType];
  if (!rd) throw new Error(`glb 索引型別 ${acc.componentType} 不支援`);
  const index = new Uint32Array(acc.count);
  for (let k = 0; k < acc.count; k += 1) index[k] = rd[1](off + k * rd[0]);
  return { index, verts: j.accessors[prim.attributes.POSITION].count };
}
export const u32Sha = (a) => createHash('sha256').update(Buffer.from(Uint32Array.from(a).buffer)).digest('hex');
// 讀凍結檔並驗每個欄位的 sha256（完整性）；任一不符或缺欄即報錯停止
export async function loadFrozen(url = FROZEN_URL) {
  const buf = await readFile(fileURLToPath(url));
  let fz;
  try { fz = JSON.parse(buf.toString('utf8')); } catch (e) { throw new Error(`凍結檔 ${fileURLToPath(url)} 不是合法 JSON：${e.message}`); }
  for (const faces of ['20k', '5k']) {
    const F = fz[faces];
    if (!F?.sha) throw new Error(`凍結檔缺 ${faces} 或其 sha 欄`);
    let got;
    try { got = frozenShas(F); } catch (e) { throw new Error(`凍結檔 ${faces} 缺欄位：${e.message}`); }
    for (const [k, v] of Object.entries(got)) {
      if (v !== F.sha[k]) throw new Error(`凍結集合 ${faces}.${k} 的 sha256 與內容不符（檔案被改過？）`);
    }
    if (F.SbVerts.normal.length !== F.SbVerts.ids.length * 3 || F.SbVerts.mainBone.length !== F.SbVerts.ids.length
      || F.arm.rPart.length !== F.arm.r.length || F.arm.lPart.length !== F.arm.l.length) throw new Error(`凍結檔 ${faces} 欄位長度不一致`);
  }
  const fileSha = createHash('sha256').update(Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex');
  return { fz, fileSha };
}
// 把凍結集合套到當前白模：被穿入表面、手臂頂點（含左右與部位）都換成凍結的。
// gi＝glbIndex()：凍結時的索引（8720597 上 R.index 與 glb 原索引逐項相同，雜湊存於 F.indexSha）
export function applyFrozen(R, F, gi) {
  if (R.index.length / 3 !== F.tris) throw new Error(`凍結集合與白模不相容：三角形 ${R.index.length / 3} ≠ ${F.tris}`);
  if (R.n < F.verts || bindPosSha(R.P, F.verts) !== F.bindPosSha) throw new Error('凍結集合與白模不相容：綁定位置不同');
  if (!gi || gi.verts !== F.verts || u32Sha(gi.index) !== F.indexSha) throw new Error('凍結集合與白模不相容：glb 原索引與凍結時不同');
  // 索引對應（R3 對抗審查 F2／F3，第 2 輪 N1／N2）：每個三角形在當前索引上必須是凍結時的同一個三角形——
  // 允許角序旋轉（繞行方向不變＝同一個三角形）；每個角要嘛就是凍結時的頂點，要嘛是接在尾端的複製點
  // （綁定位置逐位元等於來源、同一複製點只能對回同一來源＝splitBridges 的合法拆分）。反轉繞行方向或換頂點即停止。
  const dupSrc = new Int32Array(R.n).fill(-1);
  const used = new Uint8Array(R.n);
  const samePos = (a, e) => R.P[a * 3] === R.P[e * 3] && R.P[a * 3 + 1] === R.P[e * 3 + 1] && R.P[a * 3 + 2] === R.P[e * 3 + 2];
  const cornerOk = (a, e) => a === e || (a >= F.verts && samePos(a, e) && (dupSrc[a] === -1 || dupSrc[a] === e));
  let dupSlots = 0; let rotated = 0;
  for (let t = 0; t < R.index.length / 3; t += 1) {
    const A = [R.index[t * 3], R.index[t * 3 + 1], R.index[t * 3 + 2]];
    const E = [gi.index[t * 3], gi.index[t * 3 + 1], gi.index[t * 3 + 2]];
    let rot = -1;
    for (let r = 0; r < 3 && rot < 0; r += 1) if ([0, 1, 2].every((k) => cornerOk(A[(k + r) % 3], E[k]))) rot = r;
    if (rot < 0) throw new Error(`凍結集合與白模不相容：索引被改動（三角形 ${t}：當前 ${A.join(',')}、凍結時 ${E.join(',')}；只容許角序旋轉與對回來源的複製點）`);
    if (rot) rotated += 1;
    for (let k = 0; k < 3; k += 1) {
      const a = A[(k + rot) % 3]; used[a] = 1;
      if (a !== E[k]) { dupSrc[a] = E[k]; dupSlots += 1; }
    }
  }
  // 代表點：凍結頂點 v 的代表＝當前被畫出的 v 本身＋所有對回 v 的被畫出的複製點。量尺對每個代表都量、取最差（N1）。
  // 每個凍結頂點至少要有一個被畫出的代表點，否則停止（N2：原頂點被合法拆光時由複製點代表，不再誤停）
  const reps = new Map();
  const frozenVerts = new Set([...F.SbVerts.ids, ...F.arm.r, ...F.arm.l]);
  for (const t of F.Se.tris) for (let k = 0; k < 3; k += 1) frozenVerts.add(gi.index[t * 3 + k]);
  for (const v of frozenVerts) reps.set(v, used[v] ? [v] : []);
  for (let a = F.verts; a < R.n; a += 1) if (used[a] && dupSrc[a] >= 0 && reps.has(dupSrc[a])) reps.get(dupSrc[a]).push(a);
  const orphans = [...frozenVerts].filter((v) => !reps.get(v).length);
  if (orphans.length) throw new Error(`凍結集合與白模不相容：${orphans.length} 個凍結頂點沒有任何被畫出的代表點（原頂點與複製點都不被三角形引用，例 ${orphans.slice(0, 5).join(', ')}）`);
  const armSide = new Int8Array(R.n); const armPart = new Int8Array(R.n);
  F.arm.r.forEach((i, k) => { armSide[i] = -1; armPart[i] = F.arm.rPart[k]; });
  F.arm.l.forEach((i, k) => { armSide[i] = 1; armPart[i] = F.arm.lPart[k]; });
  const bB = surfaceBoundary(R, F.Sb.tris);
  const R2 = { ...R, armVerts: { r: F.arm.r, l: F.arm.l }, armSide, armPart, torsoTris: F.Sb.tris, boundaryEdge: bB.boundaryEdge, boundaryVert: bB.boundaryVert, reps };
  const Sb = torsoSurface(R2);
  const bE = surfaceBoundary(R2, F.Se.tris);
  const Se = { name: '(e) 骨盆＋大腿', tris: F.Se.tris, boundaryEdge: bE.boundaryEdge, boundaryVert: bE.boundaryVert, verts: F.Se.verts };
  return { R: R2, Sb, Se, dupSlots, rotated };
}
// 權重合法性（第 2 輪 N4）：每個頂點權重非負、總和 1±1e-4，不符即停止
export function weightCheck(g) {
  const SW = g.attributes.skinWeight.array; const n = SW.length / 4;
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let k = 0; k < 4; k += 1) { const w = SW[i * 4 + k]; if (!(w >= 0)) throw new Error(`權重不合法：頂點 ${i} 第 ${k} 個權重 ${w} < 0 或非數`); s += w; }
    if (Math.abs(s - 1) > 1e-4) throw new Error(`權重不合法：頂點 ${i} 權重總和 ${s}（應 1±1e-4）`);
  }
}
// live＝現行規則即時計算（只供產生凍結檔）；rpMod＝要載入的 realPlayer 模組（預設 src 現行版）
export async function loadSetup(faces, { live = false, rpMod = rp } = {}) {
  installNodeFetch();
  const glbUrl = new URL(`../public/models/real/player_${faces}.glb`, import.meta.url);
  const asset = await rpMod.loadRealPlayerAsset(glbUrl.href);
  weightCheck(asset.geometry);
  const R0 = lib.bindRegions(asset, rpMod.LANDMARKS);
  let R; let Sb; let Se; let frozen = null; let content = null;
  if (live) {
    R = R0; Sb = torsoSurface(R); Se = hipSurface(asset, rpMod.BONES, R);
  } else {
    frozen = await loadFrozen();
    ({ R, Sb, Se } = applyFrozen(R0, frozen.fz[faces], await glbIndex(glbUrl)));
    // 內容指紋：凍結三角形在「當前」索引上的頂點三元組（依凍結順序），任何改指都會變
    const tri = (tris) => u32Sha(tris.flatMap((t) => [R.index[t * 3], R.index[t * 3 + 1], R.index[t * 3 + 2]])).slice(0, 12);
    content = { Sb: tri(Sb.tris), Se: tri(Se.tris) };
  }
  const RH = { ...R, torsoTris: Se.tris, boundaryEdge: Se.boundaryEdge, boundaryVert: Se.boundaryVert }; // 舊量法 (e) 用
  return { faces, glbUrl, asset, R, Sb, Se, RH, frozen, content, mods: { THREE, rp: rpMod, ga, gc } };
}
export function poseKey(setup, key) {
  const mods = setup.mods ?? MODS;
  const real = lib.makeReal(mods, setup.asset);
  const pk = lib.driveKey(mods, [real], key);
  const P1 = lib.skinPositions(THREE, real.p);
  const N1 = lib.vertexNormals(P1, setup.R.index);
  return { real, pk, P1, N1 };
}
export async function sha12(url) {
  let buf = await readFile(fileURLToPath(url));
  // 文字檔先把 CRLF 換成 LF 再算（repo core.autocrlf=true：不同 checkout 的換行不同，雜湊只該反映內容）；glb 用原位元組
  if (!/\.glb$/i.test(url.pathname)) buf = Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
}
// 集合指紋（MEDIUM-4）：被穿入表面與手臂頂點都由 src 的地標／權重決定，修模型時可能跟著變；
// 輸出排序後的 ID 清單與雜湊，--baseline 時逐集合比對，讓「在不同表面上比較」看得見（定義不變，只揭露）
export function setPrint(ids) {
  const a = Int32Array.from([...ids].sort((x, y) => x - y));
  return { n: a.length, sha: createHash('sha256').update(Buffer.from(a.buffer)).digest('hex').slice(0, 12), ids: Array.from(a) };
}

// ---------------------------------------------------------------------------
// CLI
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
  }));
  const faces = args.faces === '5k' ? '5k' : '20k';
  const setup = await loadSetup(faces);
  const { R, Sb, Se, RH } = setup;
  const hashes = {};
  for (const [k, rel] of [['realPlayer.js', '../src/render/realPlayer.js'], ['geoAnimator.js', '../src/render/geoAnimator.js'],
    ['geoCharacter.js', '../src/render/geoCharacter.js'], [`player_${faces}.glb`, `../public/models/real/player_${faces}.glb`],
    ['real-skin-lib.mjs', './real-skin-lib.mjs'], ['real-skin-penetration-v2.mjs', './real-skin-penetration-v2.mjs']]) {
    hashes[k] = await sha12(new URL(rel, import.meta.url));
  }
  hashes['real-skin-frozen-sets.json'] = setup.frozen ? setup.frozen.fileSha.slice(0, 12) : '（live 模式，未讀凍結檔）';
  // 自我檢查：①S 的方向一致 ②綁定姿勢下骨盆地標在內、遠點在外（外法線方向正確）
  const P0 = R.P;
  const T0b = surfaceArrays(P0, R.index, Sb.tris); const T0e = surfaceArrays(P0, R.index, Se.tris);
  const selfCheck = {
    orientBad: { b: orientationCheck(R.index, Sb.tris), e: orientationCheck(R.index, Se.tris) },
    bindPelvis: { b: windingNumber(T0b, rp.LANDMARKS.pelvis), e: windingNumber(T0e, rp.LANDMARKS.pelvis) },
    farPoint: { b: windingNumber(T0b, [0, 1, 3]), e: windingNumber(T0e, [0, 1, 3]) },
  };
  // 自我檢查不過就停止（R3 對抗審查 F3）：方向不一致、綁定姿勢骨盆地標不在內、遠點不在外＝表面或索引已壞
  const selfBad = [];
  for (const m of ['b', 'e']) {
    if (selfCheck.orientBad[m] !== 0) selfBad.push(`(${m}) 方向不一致邊 ${selfCheck.orientBad[m]}`);
    if (!(selfCheck.bindPelvis[m] > W_IN)) selfBad.push(`(${m}) pelvis 地標 w ${selfCheck.bindPelvis[m].toFixed(3)}（應 >0.5）`);
    if (!(Math.abs(selfCheck.farPoint[m]) < W_IN)) selfBad.push(`(${m}) 遠點 w ${selfCheck.farPoint[m].toFixed(3)}（應 ≈0）`);
  }
  if (selfBad.length) throw new Error(`量尺自我檢查不過，停止：${selfBad.join('；')}`);
  const sets = { Sb: setPrint(Sb.tris), Se: setPrint(Se.tris), armR: setPrint(R.armVerts.r), armL: setPrint(R.armVerts.l) };
  const rows = {};
  for (const key of lib.ALL_KEYS) {
    const { pk, P1, N1 } = poseKey(setup, key);
    const row = { seq: pk?.type ?? null, t: pk?.t ?? null };
    for (const [m, S, RR] of [['b', Sb, R], ['e', Se, RH]]) {
      const nv = penetrationV2(R, S, P1);
      const ov = lib.metricPenetration(RR, P1, N1);
      const pick = (x) => ({ inside: x.inside, deeper1cm: x.deeper1cm, maxDepth: x.maxDepth, zones: x.zones });
      row[m] = {
        new: { r: { ...pick(nv.r), atOpening: nv.r.atOpening, atOpeningMax: nv.r.atOpeningMax, nearHalf: nv.r.nearHalf }, l: { ...pick(nv.l), atOpening: nv.l.atOpening, atOpeningMax: nv.l.atOpeningMax, nearHalf: nv.l.nearHalf } },
        old: { r: { ...pick(ov.r), undetermined: ov.r.undetermined }, l: { ...pick(ov.l), undetermined: ov.l.undetermined } },
        newFlagged: nv.flagged.map((f) => [f.i, Number(f.w.toFixed(4)), Number(f.depth.toFixed(5)), f.opening ? 1 : 0, f.tri]),
        oldFlagged: [...ov.flagged.arm],
      };
    }
    rows[key.id] = row;
  }

  // ---- 輸出 ----
  const cm = (m) => (m * 100).toFixed(1);
  const out = [];
  out.push(`# real-skin-penetration-v2（faces=${faces}）`);
  out.push('量法：內外＝generalized winding number（w>0.5 在內；Jacobson 2013，立體角 Van Oosterom–Strackee 1983）；深度＝到最近「被穿入表面」三角形的距離（照舊）；分區照舊');
  out.push(`輸入 sha256 前 12 碼：${Object.entries(hashes).map(([k, v]) => `${k} ${v}`).join('、')}`);
  out.push(`自我檢查：子集方向不一致邊 (b) ${selfCheck.orientBad.b}／(e) ${selfCheck.orientBad.e}；綁定姿勢 pelvis 地標 w (b) ${selfCheck.bindPelvis.b.toFixed(3)}／(e) ${selfCheck.bindPelvis.e.toFixed(3)}（應 >0.5）；遠點 (0,1,3) w (b) ${selfCheck.farPoint.b.toFixed(3)}／(e) ${selfCheck.farPoint.e.toFixed(3)}（應 ≈0）`);
  out.push(`表面：(b) 軀幹子集 三角形 ${Sb.tris.length}、開口邊 ${Sb.boundaryEdge.size}；(e) 主骨∈{${HIP_BONES.join(', ')}} 頂點 ${Se.verts}、三角形 ${Se.tris.length}、開口邊 ${Se.boundaryEdge.size}；手臂頂點 右 ${R.armVerts.r.length}／左 ${R.armVerts.l.length}`);
  out.push(`集合指紋（排序後 ID 的 sha256 前 12 碼）：S_b ${sets.Sb.sha}、S_e ${sets.Se.sha}、手臂 右 ${sets.armR.sha}／左 ${sets.armL.sha}（S_e 依當前權重的主骨、S_b 與手臂依 src 地標選取；--baseline 會逐集合比對）`);
  if (setup.content) out.push(`內容指紋（凍結三角形在當前索引上的頂點三元組 sha256 前 12 碼；索引改指即變）：S_b ${setup.content.Sb}、S_e ${setup.content.Se}`);
  const zs = (z) => Object.entries(z).map(([k, v]) => `${k} ${v.n}/${cm(v.max)}`).join('、') || '無';
  for (const [m, title] of [['b', '(b) 手臂穿入軀幹'], ['e', '(e) 手臂穿入骨盆＋大腿（手埋短褲）']]) {
    out.push('', `## ${title}`);
    out.push('格式：穿入點/>1cm/最深 cm。「新」＝本尺；「舊」＝lib.metricPenetration（凹處會誤判，只供對照；舊「不定」＝最近點落在開口邊未計）。');
    out.push('診斷欄（不影響判定）：開口＝新計入點中最近點落在 S 開口邊的點數／其中最深 cm（舊量法對這些點一律「無法判定」不計）；近½＝該臂 w∈(0.4,0.6) 的頂點數（離門檻近、姿勢微調就可能翻面）。');
    out.push('| 幀 | 序列 | 右 新 | 右 舊（不定） | 左 新 | 左 舊（不定） | 診斷 右 開口/最深/近½ | 診斷 左 開口/最深/近½ |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const [id, row] of Object.entries(rows)) {
      const v = row[m];
      const f = (x) => `${x.inside}/${x.deeper1cm}/${cm(x.maxDepth)}`;
      out.push(`| ${id} | ${row.seq ?? '待命'} | ${f(v.new.r)} | ${f(v.old.r)}（${v.old.r.undetermined}） | ${f(v.new.l)} | ${f(v.old.l)}（${v.old.l.undetermined}） | ${v.new.r.atOpening}/${cm(v.new.r.atOpeningMax)}/${v.new.r.nearHalf} | ${v.new.l.atOpening}/${cm(v.new.l.atOpeningMax)}/${v.new.l.nearHalf} |`);
    }
    out.push('', `${m === 'b' ? '(b)' : '(e)'} 新量法分區（手臂部位→最近面所在區：點數／最深 cm）`);
    for (const [id, row] of Object.entries(rows)) out.push(`- ${id} 右：${zs(row[m].new.r.zones)}｜左：${zs(row[m].new.l.zones)}`);
  }
  // 門檻試算（驗收檔 S2(ii)(iii)、S3；比較精度照驗收檔：點數整數、深度 0.1 cm）
  const d1 = (m) => Number(cm(m));
  const gate = (m, ids, nMax, dMax) => ids.map((id) => {
    const ok = ['r', 'l'].every((s) => rows[id][m].new[s].inside <= nMax && d1(rows[id][m].new[s].maxDepth) <= dMax);
    return `${id} ${ok ? '過' : '不過'}`;
  }).join('、');
  out.push('', '## 門檻試算（新量法；只供參考，正式判定以驗收檔為準）');
  out.push(`- S2(ii) (b) K3a／K3b／K4a 每臂 ≤10 點且 ≤1.0 cm：${gate('b', ['K3a', 'K3b', 'K4a'], 10, 1.0)}`);
  out.push(`- S2(iii) (b) K4b／K4c 每臂 ≤30 點且 ≤2.0 cm：${gate('b', ['K4b', 'K4c'], 30, 2.0)}`);
  out.push(`- S3 (e) K4a／K4b／K4c 每臂 ≤10 點且 ≤1.0 cm：${gate('e', ['K4a', 'K4b', 'K4c'], 10, 1.0)}`);
  out.push(`- S3 鑑別（未改 src 時應 K4b >0、K1b 右臂 =0）：K4b (e) 右＋左＝${rows.K4b.e.new.r.inside + rows.K4b.e.new.l.inside}；K1b 右臂 (e)＝${rows.K1b.e.new.r.inside}`);
  let baseline = null;
  if (args.baseline && args.baseline !== '1') {
    baseline = JSON.parse(await readFile(args.baseline, 'utf8'));
    if (baseline.faces !== faces) throw new Error(`--baseline 面數 ${baseline.faces} ≠ ${faces}`);
    out.push('', `## 被穿入表面與手臂頂點集合（對照 ${args.baseline}）`);
    for (const [k, nm] of [['Sb', 'S_b 三角形'], ['Se', 'S_e 三角形'], ['armR', '右臂頂點'], ['armL', '左臂頂點']]) {
      const z = baseline.sets?.[k];
      if (!z) { out.push(`- ${nm}：現況檔沒有集合清單，無法比對`); continue; }
      if (z.sha === sets[k].sha) { out.push(`- ${nm}：與現況相同（${z.n}）`); continue; }
      const A = new Set(z.ids); const B = new Set(sets[k].ids);
      const lost = z.ids.filter((x) => !B.has(x)).length; const gained = sets[k].ids.filter((x) => !A.has(x)).length;
      out.push(`- ${nm}：**與現況不同**（現況 ${z.n}、本次 ${sets[k].n}；少 ${lost}、多 ${gained}）——以下比較是在不同集合上做的`);
    }
    out.push('', `## S2(i) 不退步（(b) 新量法，對照 ${args.baseline}；點數與最深都要 ≤ 現況，深度比 0.1 cm）`);
    const bad = [];
    for (const id of Object.keys(rows)) {
      for (const s of ['r', 'l']) {
        const a = rows[id].b.new[s]; const z = baseline.rows[id].b.new[s];
        if (a.inside > z.inside || d1(a.maxDepth) > d1(z.maxDepth)) bad.push(`${id}${s === 'r' ? '右' : '左'} ${a.inside}/${cm(a.maxDepth)} > 現況 ${z.inside}/${cm(z.maxDepth)}`);
      }
    }
    out.push(bad.length ? `- 退步 ${bad.length} 項：${bad.join('；')}` : '- 18 項（9 幀×左右臂）全部 ≤ 現況');
  }
  const text = out.join('\n') + '\n';
  process.stdout.write(text);
  if (args.txt && args.txt !== '1') await writeFile(args.txt, text);
  if (args.json && args.json !== '1') {
    await writeFile(args.json, `${JSON.stringify({
      faces, method: 'generalized winding number (w>0.5), depth = distance to nearest penetrated-surface triangle', hashes, selfCheck,
      surfaces: { b: { tris: Sb.tris.length, boundaryEdges: Sb.boundaryEdge.size }, e: { verts: Se.verts, tris: Se.tris.length, boundaryEdges: Se.boundaryEdge.size } },
      armVerts: { r: R.armVerts.r.length, l: R.armVerts.l.length },
      sets,
      ...(setup.content ? { content: setup.content } : {}),
      rows,
    }, null, 1)}\n`);
  }
}
