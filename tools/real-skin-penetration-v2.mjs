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
      const p = [P1[i * 3], P1[i * 3 + 1], P1[i * 3 + 2]];
      const w = windingNumber(T, p);
      if (w > 0.4 && w < 0.6) nearHalf += 1;
      if (!(w > W_IN)) continue;
      const nr = nearestOnSurface(T, bb, p);
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
export async function loadSetup(faces) {
  installNodeFetch();
  const glbUrl = new URL(`../public/models/real/player_${faces}.glb`, import.meta.url);
  const asset = await rp.loadRealPlayerAsset(glbUrl.href);
  const R = lib.bindRegions(asset, rp.LANDMARKS);
  const Sb = torsoSurface(R);
  const Se = hipSurface(asset, rp.BONES, R);
  const RH = { ...R, torsoTris: Se.tris, boundaryEdge: Se.boundaryEdge, boundaryVert: Se.boundaryVert }; // 舊量法 (e) 用
  return { faces, glbUrl, asset, R, Sb, Se, RH };
}
export function poseKey(setup, key) {
  const real = lib.makeReal(MODS, setup.asset);
  const pk = lib.driveKey(MODS, [real], key);
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
  // 自我檢查：①S 的方向一致 ②綁定姿勢下骨盆地標在內、遠點在外（外法線方向正確）
  const P0 = R.P;
  const T0b = surfaceArrays(P0, R.index, Sb.tris); const T0e = surfaceArrays(P0, R.index, Se.tris);
  const selfCheck = {
    orientBad: { b: orientationCheck(R.index, Sb.tris), e: orientationCheck(R.index, Se.tris) },
    bindPelvis: { b: windingNumber(T0b, rp.LANDMARKS.pelvis), e: windingNumber(T0e, rp.LANDMARKS.pelvis) },
    farPoint: { b: windingNumber(T0b, [0, 1, 3]), e: windingNumber(T0e, [0, 1, 3]) },
  };
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
      rows,
    }, null, 1)}\n`);
  }
}
