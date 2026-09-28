// 寫實蒙皮診斷 · 實驗變體「甲-4 熱擴散權重」：Baran & Popović 2007〈Automatic Rigging and Animation of
// 3D Characters〉的 bone heat（Blender「Automatic Weights」採用同一演算法，見報告出處）的精簡 JS 實作。
// 只供 tools/real-skin-measure.mjs 做實驗比較，不是正式實作。
//
// 對每根骨 j 解 (L + M·H) w_j = M·H·p_j：
//  ・L＝餘切拉普拉斯（對稱半正定；負的餘切權重夾到 0 以保正定）、M＝頂點集中面積
//  ・H_ii＝1/d_i²，d_i＝頂點到「最近可見骨」骨軸線段的距離；p_j(i)＝1 若 j 是該頂點最近可見骨
//  ・「最近可見骨」直接沿用真實 computeSkinWeights 的 primary（它用法線測試近似可見性）——
//    不重抄現行的 exp 權重公式，只借它的最近骨判定
// 之後：夾 [0,1]、對側四肢骨歸零（A3）、取前 4、正規化。

const SIDE_BONE = /^([rl])(Shoulder|Elbow|Wrist|Hip|Knee|Ankle|Clav)$/;

function segDist(p, a, b) {
  const abx = b[0] - a[0]; const aby = b[1] - a[1]; const abz = b[2] - a[2];
  const t = Math.min(Math.max(((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz)
    / (abx * abx + aby * aby + abz * abz), 0), 1);
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t, p[2] - a[2] - abz * t);
}

// 骨軸線段（與 realPlayer.js SEGMENTS 的骨段位置相同的解剖地標；軀幹骨取中軸）
function boneSegments(L, bones) {
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
    if (L[`${s}Clav`]) seg[`${s}Clav`] = [[L[`${s}Clav`], L[`${s}Shoulder`]]];
  }
  return bones.map((b) => seg[b]);
}

export function heatWeightsFactory(rpMod, { c = 1, tol = 1e-7, maxIter = 4000 } = {}) {
  const L = rpMod.LANDMARKS; const BONES = rpMod.BONES;
  return (pos, nor, index) => {
    const n = pos.length / 3;
    const nb = BONES.length;
    const segs = boneSegments(L, BONES);
    const near = rpMod.computeSkinWeights(pos, nor).primary; // 真實的最近可見骨
    // 餘切拉普拉斯（CSR 前的鄰接表）與集中面積
    const nbr = Array.from({ length: n }, () => new Map());
    const mass = new Float64Array(n);
    const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    for (let t = 0; t < index.length; t += 3) {
      const ids = [index[t], index[t + 1], index[t + 2]];
      const v = ids.map(P);
      const e = (a, b) => [v[b][0] - v[a][0], v[b][1] - v[a][1], v[b][2] - v[a][2]];
      const cross = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
      const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
      const area = 0.5 * Math.hypot(...cross(e(0, 1), e(0, 2)));
      for (const i of ids) mass[i] += area / 3;
      for (let k = 0; k < 3; k += 1) {
        // 角 k 的餘切，作用在對邊 (k+1, k+2)
        const a = e(k, (k + 1) % 3); const b = e(k, (k + 2) % 3);
        const cr = Math.hypot(...cross(a, b));
        const cot = cr > 1e-12 ? dot(a, b) / cr : 0;
        const i = ids[(k + 1) % 3]; const j = ids[(k + 2) % 3];
        nbr[i].set(j, (nbr[i].get(j) || 0) + 0.5 * cot);
        nbr[j].set(i, (nbr[j].get(i) || 0) + 0.5 * cot);
      }
    }
    // CSR（負權重夾 0；對角＝鄰接權重和＋M·H）
    const rowPtr = new Int32Array(n + 1); const cols = []; const vals = [];
    const diag = new Float64Array(n);
    const H = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const d = Math.max(Math.min(...segs[near[i]].map(([a, b]) => segDist(P(i), a, b))), 0.01);
      H[i] = c / (d * d);
      let s = 0;
      for (const [j, w0] of nbr[i]) { const w = Math.max(w0, 0); if (w > 0) { cols.push(j); vals.push(-w); s += w; } }
      rowPtr[i + 1] = cols.length;
      diag[i] = s + mass[i] * H[i];
    }
    const C = Int32Array.from(cols); const V = Float64Array.from(vals);
    const mul = (x, y) => {
      for (let i = 0; i < n; i += 1) {
        let s = diag[i] * x[i];
        for (let k = rowPtr[i]; k < rowPtr[i + 1]; k += 1) s += V[k] * x[C[k]];
        y[i] = s;
      }
    };
    const W = Array.from({ length: nb }, () => new Float64Array(n));
    const r = new Float64Array(n); const z = new Float64Array(n); const pv = new Float64Array(n); const Ap = new Float64Array(n);
    let worstIter = 0;
    for (let j = 0; j < nb; j += 1) {
      const x = W[j];
      const bvec = new Float64Array(n);
      let bn = 0;
      for (let i = 0; i < n; i += 1) { if (near[i] === j) { bvec[i] = mass[i] * H[i]; bn += bvec[i] ** 2; } }
      if (bn === 0) continue;
      bn = Math.sqrt(bn);
      // 初值：p_j 本身；Jacobi 預條件 CG
      for (let i = 0; i < n; i += 1) x[i] = near[i] === j ? 1 : 0;
      mul(x, Ap);
      for (let i = 0; i < n; i += 1) { r[i] = bvec[i] - Ap[i]; z[i] = r[i] / diag[i]; pv[i] = z[i]; }
      let rz = 0; for (let i = 0; i < n; i += 1) rz += r[i] * z[i];
      let it = 0;
      for (; it < maxIter; it += 1) {
        mul(pv, Ap);
        let pAp = 0; for (let i = 0; i < n; i += 1) pAp += pv[i] * Ap[i];
        const alpha = rz / pAp;
        let rn = 0;
        for (let i = 0; i < n; i += 1) { x[i] += alpha * pv[i]; r[i] -= alpha * Ap[i]; rn += r[i] * r[i]; }
        if (Math.sqrt(rn) / bn < tol) break;
        let rz2 = 0; for (let i = 0; i < n; i += 1) { z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
        const beta = rz2 / rz; rz = rz2;
        for (let i = 0; i < n; i += 1) pv[i] = z[i] + beta * pv[i];
      }
      worstIter = Math.max(worstIter, it);
    }
    const skinIndex = new Uint16Array(n * 4); const skinWeight = new Float32Array(n * 4); const primary = new Uint8Array(n);
    const sideOf = BONES.map((b) => (SIDE_BONE.test(b) ? b[0] : null));
    for (let i = 0; i < n; i += 1) {
      const x = pos[i * 3];
      const vs = side => (x < -0.02 && side === 'l') || (x > 0.02 && side === 'r');
      const cand = [];
      for (let j = 0; j < nb; j += 1) {
        const w = Math.min(Math.max(W[j][i], 0), 1);
        if (w < 0.01 || vs(sideOf[j])) continue;
        cand.push([j, w]);
      }
      if (!cand.length) cand.push([near[i], 1]);
      cand.sort((a, b) => b[1] - a[1]);
      cand.length = Math.min(cand.length, 4);
      const s = cand.reduce((acc, e) => acc + e[1], 0);
      cand.forEach(([j, w], k) => { skinIndex[i * 4 + k] = j; skinWeight[i * 4 + k] = w / s; });
      primary[i] = cand[0][0];
    }
    heatWeightsFactory.lastStats = { worstIter };
    return { skinIndex, skinWeight, primary };
  };
}
