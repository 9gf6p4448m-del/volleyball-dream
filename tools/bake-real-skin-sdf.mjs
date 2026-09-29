// 寫實蒙皮修正（驗收修訂 R12，方案 3）——綁定姿勢軀幹符號距離場（SDF）烘焙器。
// 用法：node tools/bake-real-skin-sdf.mjs [--faces=20k|5k|all]（須在 bake-real-skin-weights.mjs 之後跑：軀幹範圍取載入後的主骨）
//
// 產物：public/models/real/player_<faces>.sdf.glb（GLB 容器，PWA 的 models/real/*.glb 預快取自動涵蓋），格式見
// realPlayer.js SDF_FORMAT。src 只讀這個檔；距離場求解（最近三角形距離＋generalized winding number 定號）只在這支 tools/。
//
// 定義（全部由 src 的載入結果決定，不讀任何量測集合）：
//  ・軀幹表面＝三頂點主骨皆為 pelvis／spine／spineUpper 的三角形（loadRealPlayerAsset 接縫拆分後的網格與主骨）。
//  ・格點＝軀幹頂點包圍盒外擴 PAD，格距 H（綁定空間，m）；值＝到軀幹表面的距離，winding number > 0.5 取負（在內）。
//    離表面 > WN_FAR 的格點不算 winding number、一律視為外（手臂頂點只會查到表面附近）。
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SDF_PARAMS = { H: 0.015, PAD: 0.06, WN_FAR: 0.12 };
const TORSO = ['pelvis', 'spine', 'spineUpper'];

function closestPointTri(p, a, b, c) { // Ericson《Real-Time Collision Detection》5.1.5；回傳重心座標
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const d1 = dot(ab, ap); const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]]; const d3 = dot(ab, bp); const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [1 - v, v, 0]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]; const d5 = dot(ab, cp); const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [1 - w, 0, w]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [0, 1 - w, w]; }
  const den = 1 / (va + vb + vc); const v = vb * den; const w = vc * den;
  return [1 - v - w, v, w];
}
function windingNumber(T, p) { // Jacobson et al. 2013（Van Oosterom–Strackee 立體角）
  let s = 0;
  for (let o = 0; o < T.length; o += 9) {
    const ax = T[o] - p[0]; const ay = T[o + 1] - p[1]; const az = T[o + 2] - p[2];
    const bx = T[o + 3] - p[0]; const by = T[o + 4] - p[1]; const bz = T[o + 5] - p[2];
    const cx = T[o + 6] - p[0]; const cy = T[o + 7] - p[1]; const cz = T[o + 8] - p[2];
    const la = Math.hypot(ax, ay, az); const lb = Math.hypot(bx, by, bz); const lc = Math.hypot(cx, cy, cz);
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (ax * cx + ay * cy + az * cz) * lb + (bx * cx + by * cy + bz * cz) * la;
    s += 2 * Math.atan2(det, den);
  }
  return s / (4 * Math.PI);
}
function nearestDist(T, bb, p) {
  let best2 = Infinity;
  for (let k = 0; k < T.length / 9; k += 1) {
    const o6 = k * 6;
    const dx = Math.max(bb[o6] - p[0], 0, p[0] - bb[o6 + 3]); const dy = Math.max(bb[o6 + 1] - p[1], 0, p[1] - bb[o6 + 4]);
    const dz = Math.max(bb[o6 + 2] - p[2], 0, p[2] - bb[o6 + 5]);
    if (dx * dx + dy * dy + dz * dz >= best2) continue;
    const o = k * 9;
    const A = [T[o], T[o + 1], T[o + 2]]; const B = [T[o + 3], T[o + 4], T[o + 5]]; const C = [T[o + 6], T[o + 7], T[o + 8]];
    const w = closestPointTri(p, A, B, C);
    let d2 = 0;
    for (let d = 0; d < 3; d += 1) { const q = w[0] * A[d] + w[1] * B[d] + w[2] * C[d]; d2 += (p[d] - q) ** 2; }
    if (d2 < best2) best2 = d2;
  }
  return Math.sqrt(best2);
}

export function bakeSdf(rp, asset, params = SDF_PARAMS) {
  const P = asset.geometry.attributes.position.array; const index = asset.geometry.index.array;
  const torso = new Set(TORSO.map((b) => rp.BONES.indexOf(b)));
  const tris = [];
  for (let t = 0; t < index.length / 3; t += 1) {
    if (torso.has(asset.primary[index[t * 3]]) && torso.has(asset.primary[index[t * 3 + 1]]) && torso.has(asset.primary[index[t * 3 + 2]])) tris.push(t);
  }
  const T = new Float64Array(tris.length * 9);
  tris.forEach((t, k) => { for (let e = 0; e < 3; e += 1) for (let d = 0; d < 3; d += 1) T[k * 9 + e * 3 + d] = P[index[t * 3 + e] * 3 + d]; });
  const bb = new Float64Array(tris.length * 6);
  for (let k = 0; k < tris.length; k += 1) for (let d = 0; d < 3; d += 1) {
    bb[k * 6 + d] = Math.min(T[k * 9 + d], T[k * 9 + 3 + d], T[k * 9 + 6 + d]);
    bb[k * 6 + 3 + d] = Math.max(T[k * 9 + d], T[k * 9 + 3 + d], T[k * 9 + 6 + d]);
  }
  let mn = [Infinity, Infinity, Infinity]; let mx = [-Infinity, -Infinity, -Infinity];
  for (let o = 0; o < T.length; o += 3) for (let d = 0; d < 3; d += 1) { mn[d] = Math.min(mn[d], T[o + d]); mx[d] = Math.max(mx[d], T[o + d]); }
  mn = mn.map((x) => x - params.PAD); mx = mx.map((x) => x + params.PAD);
  const dims = mn.map((x, d) => Math.ceil((mx[d] - x) / params.H) + 1);
  const sdf = new Float32Array(dims[0] * dims[1] * dims[2]);
  for (let k = 0; k < dims[2]; k += 1) for (let j = 0; j < dims[1]; j += 1) for (let i = 0; i < dims[0]; i += 1) {
    const p = [mn[0] + i * params.H, mn[1] + j * params.H, mn[2] + k * params.H];
    const d = nearestDist(T, bb, p);
    const w = d < params.WN_FAR ? windingNumber(T, p) : 0;
    sdf[(k * dims[1] + j) * dims[0] + i] = w > 0.5 ? -d : d;
  }
  return { sdf, min: mn, h: params.H, dims, torsoTris: tris.length };
}

export async function writeSdfGlb(path, rp, pos, s, meta = {}) {
  const pad4 = (x) => (x + 3) & ~3;
  const binLen = pad4(s.sdf.byteLength);
  const json = {
    asset: { version: '2.0', generator: 'tools/bake-real-skin-sdf.mjs' },
    buffers: [{ byteLength: binLen }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: s.sdf.byteLength }],
    accessors: [{ name: '_SDF', bufferView: 0, componentType: 5126, count: s.sdf.length, type: 'SCALAR' }],
    extras: {
      format: rp.SDF_FORMAT, vertexCount: pos.length / 3, positionHash: rp.positionHash(pos),
      min: s.min, h: s.h, dims: s.dims, torsoBones: TORSO, ...meta,
    },
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = pad4(jsonBytes.length);
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20); for (let i = jsonBytes.length; i < jsonLen; i += 1) out[20 + i] = 0x20;
  const b0 = 20 + jsonLen;
  dv.setUint32(b0, binLen, true); dv.setUint32(b0 + 4, 0x004e4942, true);
  out.set(new Uint8Array(s.sdf.buffer), b0 + 8);
  await writeFile(path, out);
  return total;
}

// ---- CLI ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!globalThis.ProgressEvent) {
    globalThis.ProgressEvent = class extends Event { constructor(t, i = {}) { super(t); Object.assign(this, i); } };
  }
  const netFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('file:')) {
      try { return new Response(await readFile(fileURLToPath(url)), { status: 200 }); } catch { return new Response(null, { status: 404 }); }
    }
    return netFetch(input, init);
  };
  const rp = await import('../src/render/realPlayer.js');
  const arg = (process.argv.find((a) => a.startsWith('--faces=')) || '--faces=all').split('=')[1];
  for (const faces of arg === 'all' ? ['20k', '5k'] : [arg]) {
    const glb = new URL(`../public/models/real/player_${faces}.glb`, import.meta.url);
    const asset = await rp.loadRealPlayerAsset(glb.href, { sdf: false });
    if (asset.weightsSource !== 'baked') throw new Error(`${faces}：權重不是烘焙檔（先跑 bake-real-skin-weights.mjs）`);
    const t0 = performance.now();
    const s = bakeSdf(rp, asset);
    const ms = performance.now() - t0;
    const out = fileURLToPath(new URL(`../public/models/real/player_${faces}.sdf.glb`, import.meta.url));
    const bytes = await writeSdfGlb(out, rp, asset.geometry.attributes.position.array, s, { source: `player_${faces}.glb`, params: SDF_PARAMS });
    console.log(`${faces}：${out}（${bytes} bytes；格點 ${s.dims.join('×')}；軀幹三角形 ${s.torsoTris}；${ms.toFixed(0)} ms）`);
  }
}
