// 寫實球員卷：量 Modly 白模的解剖地標（換白模檔時重跑，結果貼回 src/render/realPlayer.js 的 LANDMARKS）。
// 用法：node tools/real-player-landmarks.mjs [public/models/real/player_20k.glb]
// 純 node、零依賴：直接解析 GLB（單一 mesh、indexed、無節點變換），縮放/貼地規則與
// realPlayer.js loadRealPlayerAsset 相同（身高縮放到 BASE_H＝1.85、腳底 y=0、x/z 不平移）。
//
// 量法（身高 H＝1.85 的白模空間；右側＝-X，左側量完鏡像平均成左右對稱地標）：
//  ・兩腿分開處（legSplit）：兩腿之間 |x|<0.015 的最低頂點高度。寬鬆短褲的白模在這裡是
//    「褲管口的布」把兩腿縫起來的高度，**不是胯下**（第二輪誤把它當胯下，髖低了 20cm 以上）
//  ・腿軸：0.20m～legSplit−0.04m 每 2cm 水平截面（同下），該側 x 包圍盒中點最小平方擬合 x(y)
//  ・該側腿的水平截面（網格表面與水平面的交線，每 1cm、3 點平滑）量兩個特徵：
//    - 小腿肚：0.15H～0.25H 之間截面 x 寬最大處（實量 0.38m；人體小腿肚最粗處約 0.20H）
//    - 褲管口（shortsHem，上色用）：0.3m 以上、截面 z 深連續兩片 > 前 5 片中位數 ×1.25 的高度
//  ・膝＝小腿肚＋0.08H（人體平均：髕骨中點高約 0.28H、小腿肚最粗處約 0.20H，NASA 人體計測資料；
//    本白模原圖護膝中心量得 0.523m，可對照）
//  ・踝＝0.045H（腳底定錨；Drillis–Contini 外踝 0.039H，關節中心略高）
//  ・髖＝膝＋(膝−踝)：Drillis–Contini 大腿 0.245H ≈ 小腿 0.246H；x 取腿軸延伸，z 取該高度軀幹截面中點。
//    旁證（只輸出不入值）：臀部最後凸處高度、Drillis–Contini 大轉子 0.530H
//  ・膝／踝 z：各自高度的腿截面 z 包圍盒中點（踝取 0.10m～小腿肚之間 x 寬最細處的截面，避開腳掌）
//  ・腳尖：y<0.05 的該側頂點取最前（+Z）處
//  ・頸基部：由上往下掃，截面半寬首次 >0.12m（肩膀出現）的高度
//  ・骨盆＝髖+0.04（geo 人 pelvis 0.96／hip 0.92 的關係）；spine／spineUpper 依 geo 人的比例
//    （pelvis→spine 0.12、→spineUpper 0.42、→neck 0.62）映射到白模的骨盆→頸基部跨距；
//    軀幹關節 z＝該高度 |x|<0.1 截面的 z 中點；crotch（權重用的骨盆骨段下端）＝髖−0.08
//  ・手臂（A-pose 斜臂）：只取胯下以上；沿「肩參考點→最外側頂點（手）」軸向每 3cm 切片（與軸距 <0.12m、|x|>0.19m 排除軀幹），
//    取切片頂點在軸垂直平面上的包圍盒中點＝臂軸折線；肩關節＝上臂段軸線延伸到 頸基部−0.10m；
//    手尖＝沿軸最遠頂點；肘／腕依人體比例（上臂:前臂:手 ≈ 0.42:0.33:0.25，Drillis & Contini）沿折線取點
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_H = 1.85;
const file = resolve(process.argv[2] || 'public/models/real/player_20k.glb');

function readGlbPositions(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`不是 GLB：${path}`);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error('預期單一 mesh／primitive');
  for (const n of json.nodes || []) {
    if (n.matrix || n.translation || n.rotation || n.scale) throw new Error('節點帶變換，本工具未處理');
  }
  const acc = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  const bv = json.bufferViews[acc.bufferView];
  if (acc.componentType !== 5126 || (bv.byteStride && bv.byteStride !== 12)) throw new Error('POSITION 非緊密 float32');
  const off = b.byteOffset + binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const iacc = json.accessors[json.meshes[0].primitives[0].indices];
  const ibv = json.bufferViews[iacc.bufferView];
  const ioff = b.byteOffset + binStart + (ibv.byteOffset || 0) + (iacc.byteOffset || 0);
  const IT = { 5125: Uint32Array, 5123: Uint16Array }[iacc.componentType];
  if (!IT) throw new Error('indices 型別未支援');
  return {
    raw: new Float32Array(b.buffer.slice(off, off + acc.count * 12)), min: acc.min, max: acc.max,
    index: new IT(b.buffer.slice(ioff, ioff + iacc.count * IT.BYTES_PER_ELEMENT)),
  };
}

const { raw, min, max, index } = readGlbPositions(file);
const S = BASE_H / (max[1] - min[1]);
const V = [];
for (let i = 0; i < raw.length; i += 3) V.push([raw[i] * S, (raw[i + 1] - min[1]) * S, raw[i + 2] * S]);
const H = BASE_H;
// 水平剖面：三角形與平面 y=c 的交線端點（用網格表面而非頂點，減面檔點稀也量得穩）
function section(c) {
  const out = [];
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const p = V[index[t + e]]; const q = V[index[t + ((e + 1) % 3)]];
      if ((p[1] - c) * (q[1] - c) < 0) {
        const k = (c - p[1]) / (q[1] - p[1]);
        out.push([p[0] + (q[0] - p[0]) * k, c, p[2] + (q[2] - p[2]) * k]);
      }
    }
  }
  return out;
}
const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / len(a));
const mid = (arr, k) => { let lo = Infinity; let hi = -Infinity; for (const p of arr) { lo = Math.min(lo, p[k]); hi = Math.max(hi, p[k]); } return (lo + hi) / 2; };
function fitLine(pts) { // x = a + b·y 的最小平方（各軸分開）
  const n = pts.length; const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const out = {};
  for (const k of ['x', 'z']) {
    const mk = pts.reduce((s, p) => s + p[k], 0) / n;
    let num = 0; let den = 0;
    for (const p of pts) { num += (p.y - my) * (p[k] - mk); den += (p.y - my) ** 2; }
    const slope = num / den; out[k] = (y) => mk + slope * (y - my);
  }
  return out;
}

const coreZ = (y, halfX = 0.1) => {
  const sl = V.filter((p) => Math.abs(p[1] - y) < 0.02 && Math.abs(p[0]) < halfX);
  return mid(sl, 2);
};

// ---- 兩腿分開處與腿 ----
const legSplitY = Math.min(...V.filter((p) => Math.abs(p[0]) < 0.015 && p[1] > 0.2).map((p) => p[1]));
function legSide(s) {
  // 腿軸 x(y)：褲管口以下的橫切包圍盒中點
  const pts = [];
  for (let y = 0.2; y < legSplitY - 0.04; y += 0.02) {
    const sl = section(y).filter((p) => p[0] * s > 0.01);
    if (sl.length < 6) continue;
    pts.push({ y, x: mid(sl, 0), z: mid(sl, 2) });
  }
  const f = fitLine(pts);
  // 水平截面剖面（該側、±1.5cm）：x 寬與 z 深，3 點平滑
  const prof = [];
  for (let y = 0.1; y < legSplitY + 0.1; y += 0.01) {
    const sl = section(y).filter((p) => p[0] * s > 0.01 && p[0] * s < 0.36);
    if (sl.length < 5) continue;
    const xs = sl.map((p) => p[0]); const zs = sl.map((p) => p[2]);
    prof.push({ y, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) });
  }
  const sm = prof.map((q, i) => {
    const win = prof.slice(Math.max(0, i - 1), i + 2);
    return { y: q.y, w: win.reduce((a, b) => a + b.w, 0) / win.length };
  });
  let hemY = null;
  for (let i = 5; i < prof.length - 1; i += 1) {
    const prev = prof.slice(i - 5, i).map((q) => q.d).sort((a, b) => a - b)[2];
    // 跳升須連續兩片成立（寬鬆褲管是一整圈擴張，不是單片雜訊）
    if (prof[i].y > 0.3 && prof[i].d > prev * 1.25 && prof[i + 1].d > prev * 1.25) { hemY = prof[i].y; break; }
  }
  if (hemY == null) throw new Error('找不到褲管口（截面 z 深跳升）');
  const inRange = (lo, hi) => sm.filter((q) => q.y >= lo - 1e-9 && q.y <= hi + 1e-9);
  const calf = inRange(0.15 * H, 0.25 * H).reduce((a, b) => (b.w > a.w ? b : a));
  const shank = inRange(0.1, calf.y).reduce((a, b) => (b.w < a.w ? b : a)); // 小腿最細處
  const kneeY = calf.y + 0.08 * H;
  const ankleY = 0.045 * H;
  const hipY = kneeY + (kneeY - ankleY);
  // z：各自高度的截面包圍盒中點
  const sliceZ = (y) => mid(section(y).filter((p) => p[0] * s > 0.01 && p[0] * s < 0.36), 2);
  const knee = [f.x(kneeY), kneeY, sliceZ(kneeY)];
  const ankle = [f.x(ankleY), ankleY, sliceZ(shank.y)];
  const hip = [f.x(hipY), hipY, coreZ(hipY, 0.15)];
  const foot = V.filter((p) => p[1] < 0.05 && p[0] * s > 0);
  const zMax = Math.max(...foot.map((p) => p[2]));
  const front = foot.filter((p) => p[2] > zMax - 0.03);
  const toe = [front.reduce((a, p) => a + p[0], 0) / front.length, 0.02, zMax - 0.02];
  return {
    hip, knee, ankle, toe, hemY, calfY: calf.y, shankY: shank.y, legSlices: pts.length,
  };
}
// 臀部最後凸處（旁證）：|x|<0.15 截面 z 最小值最小的高度（褲管口以上）
function buttockMaxY(fromY) {
  let best = null;
  for (let y = fromY; y < fromY + 0.5; y += 0.01) {
    const sl = V.filter((p) => Math.abs(p[1] - y) <= 0.005 && Math.abs(p[0]) < 0.15);
    if (!sl.length) continue;
    const zMin = Math.min(...sl.map((p) => p[2]));
    if (!best || zMin < best.z) best = { y, z: zMin };
  }
  return best.y;
}

// ---- 頸基部與軀幹 ----
let neckY = null;
for (let y = H - 0.05; y > 1.0; y -= 0.01) {
  const sl = V.filter((p) => p[1] >= y && p[1] < y + 0.01 && Math.abs(p[0]) < 0.35);
  if (sl.length && Math.max(...sl.map((p) => Math.abs(p[0]))) > 0.12) { neckY = y; break; }
}

// ---- 手臂 ----
function armSide(s) {
  // 胯下以上、|x|>0.19 的該側頂點（腳與腿不進來；軀幹側面靠「與軸距離」再篩）
  const pool = V.filter((p) => p[0] * s > 0.19 && p[1] > legSplitY);
  const a0 = [s * 0.2, neckY - 0.1, coreZ(neckY - 0.1)];
  // 初始軸：肩參考點→最外側（|x| 最大）的臂側頂點＝手
  let tip = pool[0];
  for (const p of pool) if (p[0] * s > tip[0] * s) tip = p;
  let dir = norm(sub(tip, a0));
  let axis = [];
  for (let pass = 0; pass < 2; pass += 1) {
    axis = [];
    const L = dot(sub(tip, a0), dir);
    for (let t = 0.06; t < L; t += 0.03) {
      const c = add(a0, mul(dir, t));
      const sl = pool.filter((p) => {
        const d = sub(p, a0); const tt = dot(d, dir);
        return tt >= t - 0.015 && tt < t + 0.015 && len(sub(d, mul(dir, tt))) < 0.12;
      });
      if (sl.length < 6) continue;
      // 軸垂直平面上的包圍盒中點（兩個正交方向 u、w）
      const u = norm([dir[1], -dir[0], 0]);
      const w = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
      const pu = sl.map((p) => dot(sub(p, c), u)); const pw = sl.map((p) => dot(sub(p, c), w));
      const cu = (Math.min(...pu) + Math.max(...pu)) / 2; const cw = (Math.min(...pw) + Math.max(...pw)) / 2;
      const width = Math.max(...pu) - Math.min(...pu);
      axis.push({ t, p: add(c, add(mul(u, cu), mul(w, cw))), width, n: sl.length });
    }
    // 以折線前段（上臂、已離開軀幹）與末段重估方向再切一次
    const first = axis[Math.floor(axis.length * 0.15)].p; const last = axis[axis.length - 3].p;
    dir = norm(sub(last, first));
  }
  // 手尖：沿最終軸最遠頂點
  let tMax = -Infinity;
  for (const p of pool) tMax = Math.max(tMax, dot(sub(p, a0), dir));
  // 上臂段軸線：折線 15%～40% 的點擬合方向，延伸到肩關節高度
  const upper = axis.filter((q, i) => i >= axis.length * 0.15 && i <= axis.length * 0.4).map((q) => q.p);
  const ua0 = upper[0]; const ua1 = upper[upper.length - 1];
  const udir = norm(sub(ua1, ua0));
  const shY = neckY - 0.1;
  const shoulder = add(ua0, mul(udir, (shY - ua0[1]) / udir[1]));
  const lastP = axis[axis.length - 1].p;
  const tipPt = add(lastP, mul(dir, tMax - dot(sub(lastP, a0), dir)));
  // 沿折線（肩→各切片中點→手尖）按弧長取點
  const poly = [shoulder, ...axis.map((q) => q.p).filter((p) => dot(sub(p, shoulder), dir) > 0.02), tipPt];
  const seg = []; let total = 0;
  for (let i = 1; i < poly.length; i += 1) { const l = len(sub(poly[i], poly[i - 1])); seg.push(l); total += l; }
  const at = (frac) => {
    let rem = frac * total;
    for (let i = 0; i < seg.length; i += 1) {
      if (rem <= seg[i]) return add(poly[i], mul(sub(poly[i + 1], poly[i]), rem / seg[i]));
      rem -= seg[i];
    }
    return poly[poly.length - 1];
  };
  return {
    shoulder, elbow: at(0.42), wrist: at(0.75), handTip: tipPt, armLength: total,
    abductionDeg: Math.acos(-dir[1]) * 180 / Math.PI,
    widths: axis.map((q) => `${q.t.toFixed(2)}:${q.width.toFixed(3)}`).join(' '),
  };
}

const R = { leg: legSide(-1), arm: armSide(-1) };
const Lf = { leg: legSide(1), arm: armSide(1) };
const sym = (a, b) => r3([(a[0] - b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]); // 右側（-X）左右平均
const pelvisY = (R.leg.hip[1] + Lf.leg.hip[1]) / 2 + 0.04;
const span = neckY - pelvisY;
const spineY = pelvisY + (0.12 / 0.62) * span;
const spineUpperY = pelvisY + (0.42 / 0.62) * span;
const LM = {
  pelvis: r3([0, pelvisY, coreZ(pelvisY)]),
  spine: r3([0, spineY, coreZ(spineY)]),
  spineUpper: r3([0, spineUpperY, coreZ(spineUpperY)]),
  neck: r3([0, neckY, coreZ(neckY, 0.05)]),
  headTop: r3([0, H, coreZ(H - 0.03, 0.05)]),
  crotch: r3([0, (R.leg.hip[1] + Lf.leg.hip[1]) / 2 - 0.08, coreZ((R.leg.hip[1] + Lf.leg.hip[1]) / 2 - 0.08)]),
  shortsHem: r3([0, (R.leg.hemY + Lf.leg.hemY) / 2, 0]),
  rHip: sym(R.leg.hip, Lf.leg.hip),
  rKnee: sym(R.leg.knee, Lf.leg.knee),
  rAnkle: sym(R.leg.ankle, Lf.leg.ankle),
  rToe: sym(R.leg.toe, Lf.leg.toe),
  rShoulder: sym(R.arm.shoulder, Lf.arm.shoulder),
  rElbow: sym(R.arm.elbow, Lf.arm.elbow),
  rWrist: sym(R.arm.wrist, Lf.arm.wrist),
  rHandTip: sym(R.arm.handTip, Lf.arm.handTip),
};
const asym = {};
// 左右不對稱量（右側＋鏡像左側之差，0＝完全對稱）
const diffLR = (a, b) => r3([a[0] + b[0], a[1] - b[1], a[2] - b[2]]);
for (const k of ['hip', 'knee', 'ankle', 'toe']) asym[k] = diffLR(R.leg[k], Lf.leg[k]);
for (const k of ['shoulder', 'elbow', 'wrist', 'handTip']) asym[k] = diffLR(R.arm[k], Lf.arm[k]);
console.log(JSON.stringify({
  file, verts: V.length, scale: S, legSplitY: +legSplitY.toFixed(3), neckY: +neckY.toFixed(3),
  legFeatures: Object.fromEntries(['hemY', 'calfY', 'shankY'].map((k) => [k, [+R.leg[k].toFixed(3), +Lf.leg[k].toFixed(3)]])),
  hipCrossCheck: { buttockMaxY: +buttockMaxY(R.leg.hemY).toFixed(3), drillisTrochanter: +(0.530 * H).toFixed(3) },
  armAbductionDeg: { r: +R.arm.abductionDeg.toFixed(1), l: +Lf.arm.abductionDeg.toFixed(1) },
  armLength: { r: +R.arm.armLength.toFixed(3), l: +Lf.arm.armLength.toFixed(3) },
}, null, 1));
console.log('leftRightAsymmetry', JSON.stringify(asym));
console.log('rArm widths', R.arm.widths);
console.log(`\n// 貼回 src/render/realPlayer.js（量自 ${file.replace(/\\/g, '/').split('/').slice(-3).join('/')}）`);
console.log('export const LANDMARKS = {');
for (const [k, v] of Object.entries(LM)) console.log(`  ${k}: [${v.join(', ')}],`);
console.log('};');
