// 寫實蒙皮修正（docs/kickoffs/real-skin-acceptance.md，使用者 09-28 裁定：熱擴散權重離線烘焙）——權重烘焙器。
// 熱擴散求解只在這支 tools/ 程式裡；src 只讀烘焙檔（public/models/real/player_<faces>.weights.glb）。
//
// 用法：node tools/bake-real-skin-weights.mjs [--faces=20k|5k|all]
//
// 權重怎麼來（全部由綁定姿勢幾何＋src 的地標／骨表決定，不讀任何量測集合）：
//  ① 現行自動權重 computeSkinWeights（src/render/realPlayer.js）給「主骨」：部位上色與接縫拆分沿用它，外觀分區不變。
//  ② 小腿中段以下（綁定 y ≤ LOW_Y）：沿用現行權重（使用者裁定「熱擴散只用在小腿中段以上」；鞋底 IK 頂點不變）。
//  ③ 軀幹頂點（主骨 pelvis／spine／spineUpper／neck）：不帶手臂骨權重（現行值裡的手臂份額補回軀幹骨；驗收 S11：
//     軀幹皮不得被手臂拖走）；腿骨權重維持現行值，而帶腿骨權重的軀幹頂點整組沿用現行權重（骨盆被腿帶動的量與改前相同）；
//     其餘軀幹頂點的軀幹骨間分配改用熱擴散（胸扭轉分到兩段，驗收 S4）。
//  ④ 四肢頂點：bone heat（Baran & Popović 2007；Blender「Automatic Weights」同一演算法）——(L + M·H) w_j = M·H·p_j，
//     L＝餘切拉普拉斯（負權夾 0）、M＝集中面積、H_ii＝c/d_i²（d＝到最近可見骨骨段的距離）、p_j＝最近可見骨指示；
//     ②③ 的頂點當 Dirichlet 邊界（值固定），所以軀幹與四肢之間的過渡全部落在四肢這一側。
//  ⑤ 上臂剛性（驗收修訂 R12，方案 3）：上臂（主骨 r/lShoulder）綁定臂段參數 t ≥ UPPER_RIGID_T 的頂點沿用現行權重、當邊界——
//     上臂皮跟著上臂骨走（S13／S14）；手臂垂下貼胸時的穿入改由執行期碰撞修正處理（realPlayer.js updateSkin、SDF 見
//     tools/bake-real-skin-sdf.mjs）。原本的肩部輔助骨（R2／R10）已移除。
//  最後：夾 [0,1]、對側四肢骨歸零、取前 4、正規化。
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PARAMS = {
  LOW_Y: 0.45, // 小腿中段（綁定 y，m）
  HEAT_C: 1, // 四肢頂點（④）的 H 比例常數（Baran & Popović 的 c；越小過渡帶越寬）
  HEAT_C_ARM: 0.7, // 手臂頂點（主骨 r/l Shoulder／Elbow）的 c：軀幹側固定後腋下過渡全在手臂側，略寬於標準（驗收 S1），
  //                   但上臂中段仍以手臂骨為主（驗收 S13 ≤0.50）
  HEAT_C_TORSO: 6, // 軀幹骨間分配（③）用的無約束熱擴散的 c
  TORSO_ARM_SCALE: 0, // ③ 的軀幹頂點：現行權重裡的手臂骨權重乘上這個比例（其餘補回軀幹骨）
  HAND_KEEP: true, // 手（主骨 r/lWrist）沿用現行權重、當邊界（第一階段 A2(a)(e)：手須與腕關節剛性同動）
  TORSO_LIMB_KEEP: true, // ③ 的軀幹頂點若（去掉手臂份額後）仍帶腿骨權重，整組沿用現行權重（連軀幹骨間分配也不改）
  MIN_D: 0.01, // d 的下限（m）
  UPPER_RIGID_T: 0.7, // ⑤：上臂 t ≥ 此值者沿用現行權重（技術調查 docs/experiments/real-skin-survey-report.md 的 rigid07）
};

const TORSO_NAMES = ['pelvis', 'spine', 'spineUpper', 'neck'];
const SIDE_BONE = /^([rl])(Shoulder|Elbow|Wrist|Hip|Knee|Ankle)$/;

function segDist(p, a, b) {
  const abx = b[0] - a[0]; const aby = b[1] - a[1]; const abz = b[2] - a[2];
  const t = Math.min(Math.max(((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz)
    / (abx * abx + aby * aby + abz * abz), 0), 1);
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t, p[2] - a[2] - abz * t);
}
function boneSegs(L) {
  const seg = {
    pelvis: [[L.crotch, L.spine]], spine: [[L.spine, L.spineUpper]], spineUpper: [[L.spineUpper, L.neck]],
    neck: [[L.neck, [0, L.headTop[1] - 0.07, L.headTop[2]]]],
  };
  for (const s of ['r', 'l']) {
    seg[`${s}Hip`] = [[L[`${s}Hip`], L[`${s}Knee`]]];
    seg[`${s}Knee`] = [[L[`${s}Knee`], L[`${s}Ankle`]]];
    seg[`${s}Ankle`] = [[L[`${s}Ankle`], L[`${s}Toe`]], [L[`${s}Ankle`], [L[`${s}Ankle`][0], 0.04, L[`${s}Ankle`][2] - 0.06]]];
    seg[`${s}Shoulder`] = [[L[`${s}Shoulder`], L[`${s}Elbow`]]];
    seg[`${s}Elbow`] = [[L[`${s}Elbow`], L[`${s}Wrist`]]];
    seg[`${s}Wrist`] = [[L[`${s}Wrist`], L[`${s}HandTip`]]];
  }
  return seg;
}
// 上臂段參數 t（綁定）：p 投影到 a→b 的比例（不夾）
function segT(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2);
}

// 餘切拉普拉斯（CSR，負權夾 0）與集中面積
function laplacian(pos, index) {
  const n = pos.length / 3;
  const nbr = Array.from({ length: n }, () => new Map());
  const mass = new Float64Array(n);
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const cross = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  for (let t = 0; t < index.length; t += 3) {
    const ids = [index[t], index[t + 1], index[t + 2]];
    const v = ids.map(P);
    const e = (a, b) => [v[b][0] - v[a][0], v[b][1] - v[a][1], v[b][2] - v[a][2]];
    const area = 0.5 * Math.hypot(...cross(e(0, 1), e(0, 2)));
    for (const i of ids) mass[i] += area / 3;
    for (let k = 0; k < 3; k += 1) {
      const a = e(k, (k + 1) % 3); const b = e(k, (k + 2) % 3);
      const cr = Math.hypot(...cross(a, b));
      const cot = cr > 1e-12 ? dot(a, b) / cr : 0;
      const i = ids[(k + 1) % 3]; const j = ids[(k + 2) % 3];
      nbr[i].set(j, (nbr[i].get(j) || 0) + 0.5 * cot);
      nbr[j].set(i, (nbr[j].get(i) || 0) + 0.5 * cot);
    }
  }
  const rowPtr = new Int32Array(n + 1); const cols = []; const vals = []; const deg = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    for (const [j, w0] of nbr[i]) { const w = Math.max(w0, 0); if (w > 0) { cols.push(j); vals.push(w); deg[i] += w; } }
    rowPtr[i + 1] = cols.length;
  }
  return { n, rowPtr, cols: Int32Array.from(cols), vals: Float64Array.from(vals), deg, mass };
}

// Dirichlet 版 bone heat：fixed[i]=1 的頂點權重固定為 W0[j][i]；其餘解 (L+MH) w = MH p − (邊界項)
function solveHeat(lap, H, near, nb, fixed, W0, { tol = 1e-8, maxIter = 6000 } = {}) {
  const { n, rowPtr, cols, vals, deg, mass } = lap;
  const diag = new Float64Array(n);
  for (let i = 0; i < n; i += 1) diag[i] = deg[i] + mass[i] * H[i];
  const W = Array.from({ length: nb }, () => new Float64Array(n));
  const r = new Float64Array(n); const z = new Float64Array(n); const pv = new Float64Array(n); const Ap = new Float64Array(n);
  const mul = (x, y) => { // 只在自由頂點上的 A·x（固定頂點的列＝單位、x 在固定處為 0）
    for (let i = 0; i < n; i += 1) {
      if (fixed[i]) { y[i] = 0; continue; }
      let s = diag[i] * x[i];
      for (let k = rowPtr[i]; k < rowPtr[i + 1]; k += 1) { const j = cols[k]; if (!fixed[j]) s -= vals[k] * x[j]; }
      y[i] = s;
    }
  };
  let worst = 0;
  for (let j = 0; j < nb; j += 1) {
    const x = W[j];
    const b = new Float64Array(n);
    let any = false;
    for (let i = 0; i < n; i += 1) {
      if (fixed[i]) { x[i] = W0[j][i]; continue; }
      let s = near[i] === j ? mass[i] * H[i] : 0;
      for (let k = rowPtr[i]; k < rowPtr[i + 1]; k += 1) { const q = cols[k]; if (fixed[q]) s += vals[k] * W0[j][q]; }
      b[i] = s; if (s !== 0) any = true;
    }
    if (!any) { for (let i = 0; i < n; i += 1) if (!fixed[i]) x[i] = 0; continue; }
    const xf = new Float64Array(n);
    for (let i = 0; i < n; i += 1) if (!fixed[i]) xf[i] = near[i] === j ? 1 : 0;
    mul(xf, Ap);
    let bn = 0; for (let i = 0; i < n; i += 1) bn += b[i] * b[i]; bn = Math.sqrt(bn);
    for (let i = 0; i < n; i += 1) { r[i] = fixed[i] ? 0 : b[i] - Ap[i]; z[i] = fixed[i] ? 0 : r[i] / diag[i]; pv[i] = z[i]; }
    let rz = 0; for (let i = 0; i < n; i += 1) rz += r[i] * z[i];
    let it = 0;
    for (; it < maxIter; it += 1) {
      mul(pv, Ap);
      let pAp = 0; for (let i = 0; i < n; i += 1) pAp += pv[i] * Ap[i];
      if (pAp <= 0) break;
      const alpha = rz / pAp;
      let rn = 0;
      for (let i = 0; i < n; i += 1) { xf[i] += alpha * pv[i]; r[i] -= alpha * Ap[i]; rn += r[i] * r[i]; }
      if (Math.sqrt(rn) / bn < tol) break;
      let rz2 = 0; for (let i = 0; i < n; i += 1) { z[i] = fixed[i] ? 0 : r[i] / diag[i]; rz2 += r[i] * z[i]; }
      const beta = rz2 / rz; rz = rz2;
      for (let i = 0; i < n; i += 1) pv[i] = z[i] + beta * pv[i];
    }
    worst = Math.max(worst, it);
    for (let i = 0; i < n; i += 1) if (!fixed[i]) x[i] = xf[i];
  }
  return { W, worst };
}

// 主函式：回傳 { skinIndex:Uint16Array(n*4), skinWeight:Float32Array(n*4), primary:Uint8Array(n), stats }
export function bakeWeights(rp, pos, nor, index, params = PARAMS) {
  const { BONES, LANDMARKS: L } = rp;
  const n = pos.length / 3;
  const nb = BONES.length;
  const bi = (b) => BONES.indexOf(b);
  const TORSO = new Set(TORSO_NAMES.map(bi));
  const HAND = new Set([bi('rWrist'), bi('lWrist')]);
  const ARM = new Set(BONES.map((b, j) => (/^[rl](Shoulder|Elbow|Wrist)$/.test(b) ? j : -1)).filter((j) => j >= 0));
  const c = rp.computeSkinWeights(pos, nor);
  const segs = boneSegs(L);
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const lap = laplacian(pos, index);
  const H = new Float64Array(n); const H0 = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const d = Math.max(Math.min(...segs[BONES[c.primary[i]]].map(([a, b]) => segDist(P(i), a, b))), params.MIN_D);
    const arm = /^[rl](Shoulder|Elbow|Wrist)$/.test(BONES[c.primary[i]]);
    H[i] = (arm ? params.HEAT_C_ARM : params.HEAT_C) / (d * d);
    H0[i] = params.HEAT_C_TORSO / (d * d);
  }
  // 無約束熱擴散：只取軀幹頂點的「軀幹骨間分配」
  const free0 = new Uint8Array(n);
  const W00 = Array.from({ length: nb }, () => new Float64Array(n));
  const heat0 = solveHeat(lap, H0, c.primary, nb, free0, W00);
  // 邊界：②③
  const fixed = new Uint8Array(n);
  const W0 = Array.from({ length: nb }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    const pb = BONES[c.primary[i]];
    const rigidUpper = params.UPPER_RIGID_T != null && /^[rl]Shoulder$/.test(pb)
      && segT(P(i), L[`${pb[0]}Shoulder`], L[`${pb[0]}Elbow`]) >= params.UPPER_RIGID_T;
    const low = pos[i * 3 + 1] <= params.LOW_Y || (params.HAND_KEEP && HAND.has(c.primary[i])) || rigidUpper;
    const torso = TORSO.has(c.primary[i]);
    if (!low && !torso) continue;
    fixed[i] = 1;
    let limb = 0;
    const cw = new Float64Array(nb);
    for (let k = 0; k < 4; k += 1) { const w = c.skinWeight[i * 4 + k]; if (w > 0) cw[c.skinIndex[i * 4 + k]] += w; }
    if (!low && torso && params.TORSO_ARM_SCALE !== 1) {
      let moved = 0;
      for (let j = 0; j < nb; j += 1) if (ARM.has(j)) { moved += cw[j] * (1 - params.TORSO_ARM_SCALE); cw[j] *= params.TORSO_ARM_SCALE; }
      if (moved > 0) { let ts = 0; for (const j of TORSO) ts += cw[j]; for (const j of TORSO) cw[j] += ts > 0 ? moved * (cw[j] / ts) : (j === c.primary[i] ? moved : 0); }
    }
    if (low) { for (let j = 0; j < nb; j += 1) W0[j][i] = cw[j]; continue; }
    for (let j = 0; j < nb; j += 1) if (!TORSO.has(j)) { W0[j][i] = cw[j]; limb += cw[j]; }
    if (limb > 0 && params.TORSO_LIMB_KEEP) { for (const j of TORSO) W0[j][i] = cw[j]; continue; }
    let ts = 0; for (const j of TORSO) ts += Math.min(Math.max(heat0.W[j][i], 0), 1);
    if (ts > 1e-9) { for (const j of TORSO) W0[j][i] = (Math.min(Math.max(heat0.W[j][i], 0), 1) / ts) * (1 - limb); }
    else { let cs = 0; for (const j of TORSO) cs += cw[j]; for (const j of TORSO) W0[j][i] = cs > 0 ? (cw[j] / cs) * (1 - limb) : 0; }
  }
  const heat = solveHeat(lap, H, c.primary, nb, fixed, W0);
  // 收尾：夾 [0,1]、對側歸零、取前 4、正規化（固定頂點照 W0）
  const sideOf = BONES.map((b) => (SIDE_BONE.test(b) ? b[0] : null));
  const skinIndex = new Uint16Array(n * 4); const skinWeight = new Float32Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const x = pos[i * 3];
    const opp = (s) => (x < -0.02 && s === 'l') || (x > 0.02 && s === 'r');
    let cand = [];
    for (let j = 0; j < nb; j += 1) {
      const w = Math.min(Math.max(heat.W[j][i], 0), 1);
      if (w < (fixed[i] ? 1e-9 : 0.01) || opp(sideOf[j])) continue;
      cand.push([j, w]);
    }
    if (!cand.length) cand.push([c.primary[i], 1]);
    cand.sort((a, b) => b[1] - a[1]);
    cand = cand.slice(0, 4);
    const s = cand.reduce((acc, e) => acc + e[1], 0);
    cand.forEach(([j, w], k) => { skinIndex[i * 4 + k] = j; skinWeight[i * 4 + k] = w / s; });
  }
  return { skinIndex, skinWeight, primary: c.primary, stats: { iters: [heat0.worst, heat.worst], fixed: fixed.reduce((a, b) => a + b, 0) } };
}
// 寫權重 GLB（格式見 realPlayer.js WEIGHTS_FORMAT）；權重量化成正規化 UNSIGNED_SHORT（每頂點和＝65535）
export async function writeWeightsGlb(path, rp, pos, w, meta = {}) {
  const n = pos.length / 3;
  const J = new Uint8Array(n * 4); const W = new Uint16Array(n * 4); const P = Uint8Array.from(w.primary);
  for (let i = 0; i < n; i += 1) {
    const q = [0, 0, 0, 0]; let s = 0;
    for (let k = 0; k < 4; k += 1) { J[i * 4 + k] = w.skinIndex[i * 4 + k]; q[k] = Math.round(w.skinWeight[i * 4 + k] * 65535); s += q[k]; }
    q[0] += 65535 - s; // 捨入誤差歸給最大那格（skinWeight 由大到小）
    for (let k = 0; k < 4; k += 1) W[i * 4 + k] = Math.max(0, q[k]);
  }
  const pad4 = (x) => (x + 3) & ~3;
  const oJ = 0; const oW = pad4(J.byteLength); const oP = oW + pad4(W.byteLength); const binLen = pad4(oP + P.byteLength);
  const json = {
    asset: { version: '2.0', generator: 'tools/bake-real-skin-weights.mjs' },
    buffers: [{ byteLength: binLen }],
    bufferViews: [
      { buffer: 0, byteOffset: oJ, byteLength: J.byteLength },
      { buffer: 0, byteOffset: oW, byteLength: W.byteLength },
      { buffer: 0, byteOffset: oP, byteLength: P.byteLength },
    ],
    accessors: [
      { name: 'JOINTS_0', bufferView: 0, componentType: 5121, count: n, type: 'VEC4' },
      { name: 'WEIGHTS_0', bufferView: 1, componentType: 5123, normalized: true, count: n, type: 'VEC4' },
      { name: '_PRIMARY', bufferView: 2, componentType: 5121, count: n, type: 'SCALAR' },
    ],
    extras: { format: rp.WEIGHTS_FORMAT, bones: rp.BONES, vertexCount: n, positionHash: rp.positionHash(pos), ...meta },
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
  out.set(J, b0 + 8 + oJ); out.set(new Uint8Array(W.buffer), b0 + 8 + oW); out.set(P, b0 + 8 + oP);
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
    if (url.startsWith('file:')) return new Response(await readFile(fileURLToPath(url)), { status: 200 });
    return netFetch(input, init);
  };
  const rp = await import('../src/render/realPlayer.js');
  const arg = (process.argv.find((a) => a.startsWith('--faces=')) || '--faces=all').split('=')[1];
  for (const faces of arg === 'all' ? ['20k', '5k'] : [arg]) {
    const glb = new URL(`../public/models/real/player_${faces}.glb`, import.meta.url);
    const g = await rp.loadRealGeometry(glb.href); // 只取綁定位置／法線／索引（與權重來源無關）
    const pos = g.attributes.position.array;
    const t0 = performance.now();
    const w = bakeWeights(rp, pos, g.attributes.normal.array, g.index.array);
    const ms = performance.now() - t0;
    const out = fileURLToPath(new URL(`../public/models/real/player_${faces}.weights.glb`, import.meta.url));
    const bytes = await writeWeightsGlb(out, rp, pos, w, { source: `player_${faces}.glb`, params: PARAMS, cgWorstIter: w.stats.iters });
    console.log(`${faces}：${out}（${bytes} bytes；求解 ${ms.toFixed(0)} ms；CG 最多迭代 ${w.stats.iters.join('／')}；固定頂點 ${w.stats.fixed}）`);
  }
}
