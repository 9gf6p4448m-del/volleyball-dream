// 寫實球員卷：量 Modly 白模的解剖地標（換白模檔時重跑，結果貼回 src/render/realPlayer.js 的 LANDMARKS）。
// 用法：node tools/real-player-landmarks.mjs [public/models/real/player_20k.glb]
// 純 node、零依賴：直接解析 GLB（單一 mesh、indexed、無節點變換），縮放/貼地規則與
// realPlayer.js loadRealPlayerAsset 相同（身高縮放到 BASE_H＝1.85、腳底 y=0、x/z 不平移）。
//
// 量法（身高 H＝1.85 的白模空間；右側＝-X，左側量完鏡像平均成左右對稱地標）：
//  ・胯下：兩腿之間 |x|<0.015 的最低頂點高度
//  ・腿軸：胯下以下 0.20m～胯下−0.04m 每 2cm 橫切，取該側截面 x/z 包圍盒中點，最小平方擬合直線
//    x(y)、z(y)；髖關節＝腿軸延伸到 胯下+0.035H；踝＝腿軸在 0.05H；膝＝髖踝中點（人體大腿≈小腿）
//  ・腳尖：y<0.05 的該側頂點取最前（+Z）處
//  ・頸基部：由上往下掃，截面半寬首次 >0.12m（肩膀出現）的高度
//  ・骨盆＝髖+0.05；spine／spineUpper 依 geo 人的比例（pelvis→spine 0.12、→spineUpper 0.42、
//    →neck 0.62）映射到白模的骨盆→頸基部跨距；軀幹關節 z＝該高度 |x|<0.1 截面的 z 中點
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
  return { raw: new Float32Array(b.buffer.slice(off, off + acc.count * 12)), min: acc.min, max: acc.max };
}

const { raw, min, max } = readGlbPositions(file);
const S = BASE_H / (max[1] - min[1]);
const V = [];
for (let i = 0; i < raw.length; i += 3) V.push([raw[i] * S, (raw[i + 1] - min[1]) * S, raw[i + 2] * S]);
const H = BASE_H;
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

// ---- 胯下與腿 ----
const crotchY = Math.min(...V.filter((p) => Math.abs(p[0]) < 0.015 && p[1] > 0.2).map((p) => p[1]));
function legSide(s) {
  const pts = [];
  for (let y = 0.2; y < crotchY - 0.04; y += 0.02) {
    const sl = V.filter((p) => p[1] >= y && p[1] < y + 0.02 && p[0] * s > 0.01);
    if (sl.length < 6) continue;
    pts.push({ y: y + 0.01, x: mid(sl, 0), z: mid(sl, 2) });
  }
  const f = fitLine(pts);
  const hipY = crotchY + 0.035 * H;
  const ankleY = 0.05 * H;
  const hip = [f.x(hipY), hipY, f.z(hipY)];
  const ankle = [f.x(ankleY), ankleY, f.z(ankleY)];
  const knee = mul(add(hip, ankle), 0.5);
  const foot = V.filter((p) => p[1] < 0.05 && p[0] * s > 0);
  const zMax = Math.max(...foot.map((p) => p[2]));
  const front = foot.filter((p) => p[2] > zMax - 0.03);
  const toe = [front.reduce((a, p) => a + p[0], 0) / front.length, 0.02, zMax - 0.02];
  return { hip, knee, ankle, toe, legSlices: pts.length };
}

// ---- 頸基部與軀幹 ----
let neckY = null;
for (let y = H - 0.05; y > 1.0; y -= 0.01) {
  const sl = V.filter((p) => p[1] >= y && p[1] < y + 0.01 && Math.abs(p[0]) < 0.35);
  if (sl.length && Math.max(...sl.map((p) => Math.abs(p[0]))) > 0.12) { neckY = y; break; }
}
const coreZ = (y, halfX = 0.1) => {
  const sl = V.filter((p) => Math.abs(p[1] - y) < 0.02 && Math.abs(p[0]) < halfX);
  return mid(sl, 2);
};

// ---- 手臂 ----
function armSide(s) {
  // 胯下以上、|x|>0.19 的該側頂點（腳與腿不進來；軀幹側面靠「與軸距離」再篩）
  const pool = V.filter((p) => p[0] * s > 0.19 && p[1] > crotchY);
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
const pelvisY = R.leg.hip[1] + 0.05;
const span = neckY - pelvisY;
const spineY = pelvisY + (0.12 / 0.62) * span;
const spineUpperY = pelvisY + (0.42 / 0.62) * span;
const LM = {
  pelvis: r3([0, pelvisY, coreZ(pelvisY)]),
  spine: r3([0, spineY, coreZ(spineY)]),
  spineUpper: r3([0, spineUpperY, coreZ(spineUpperY)]),
  neck: r3([0, neckY, coreZ(neckY, 0.05)]),
  headTop: r3([0, H, coreZ(H - 0.03, 0.05)]),
  crotch: r3([0, crotchY, coreZ(crotchY)]),
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
  file, verts: V.length, scale: S, crotchY: +crotchY.toFixed(3), neckY: +neckY.toFixed(3),
  armAbductionDeg: { r: +R.arm.abductionDeg.toFixed(1), l: +Lf.arm.abductionDeg.toFixed(1) },
  armLength: { r: +R.arm.armLength.toFixed(3), l: +Lf.arm.armLength.toFixed(3) },
}, null, 1));
console.log('leftRightAsymmetry', JSON.stringify(asym));
console.log('rArm widths', R.arm.widths);
console.log(`\n// 貼回 src/render/realPlayer.js（量自 ${file.replace(/\\/g, '/').split('/').slice(-3).join('/')}）`);
console.log('export const LANDMARKS = {');
for (const [k, v] of Object.entries(LM)) console.log(`  ${k}: [${v.join(', ')}],`);
console.log('};');
