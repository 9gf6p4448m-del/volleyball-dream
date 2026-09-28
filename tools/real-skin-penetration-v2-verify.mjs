// 新尺（tools/real-skin-penetration-v2.mjs）的 V1–V4 驗證證據產生器。定義（實跑前凍結）：
// docs/experiments/real-skin-evidence/ruler-v2/V-criteria-frozen.md。V5（決定性）＝本檔與量尺 CLI 各連跑兩次比 sha256（見 README）。
//
// 用法：node tools/real-skin-penetration-v2-verify.mjs --faces=20k|5k --out=<目錄> [--tag=<檔名標籤>] [--only=V0,V1,V2,V3,V4]
//        [--oldref=<舊證據目錄>] [--oldprefix=before|after-step3]
//   V0：自我檢查＋舊值重現（新工具內用 lib 算的舊 (b)(e) 對 <oldref>/<oldprefix>-{faces}.json、thigh-<oldprefix>-{faces}.json 逐幀逐臂比對）
//
// 獨立參考 B_c（不是受測物）：去臂網格（全身三角形中三頂點都不在 R.armVerts 者）＋兩個臂根開口以環頂點質心扇形封口，
// 固定 3 方向射線（Möller–Trumbore）交點奇偶、3 票多數。與受測的 GWN 是不同演算法、不同表面。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { deflateSync } from 'node:zlib';
import * as THREE from 'three';
import * as rp from '../src/render/realPlayer.js';
import * as lib from './real-skin-lib.mjs';
import * as V2 from './real-skin-penetration-v2.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const faces = args.faces === '5k' ? '5k' : '20k';
const outDir = args.out;
if (!outDir || outDir === '1') throw new Error('需要 --out=<目錄>');
const tag = args.tag && args.tag !== '1' ? `-${args.tag}` : '';
const label = args.label && args.label !== '1' ? args.label : 'SRC';
const only = args.only ? new Set(args.only.split(',')) : new Set(['V0', 'V1', 'V2', 'V3', 'V4']);
await mkdir(outDir, { recursive: true });
const name = (v, ext) => join(outDir, `${v}${tag}-${faces}.${ext}`);

const setup = await V2.loadSetup(faces);
const { R, Sb, Se, RH } = setup;
const KEY = Object.fromEntries(lib.ALL_KEYS.map((k) => [k.id, k]));
const cm = (m) => (m * 100).toFixed(1);
const f3 = (x) => Number(x).toFixed(3);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const vtx = (P, i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];

// ---------------------------------------------------------------------------
// 獨立參考 B_c
const armV = new Uint8Array(R.n);
for (const s of ['r', 'l']) for (const i of R.armVerts[s]) armV[i] = 1;
const Btris = [];
for (let t = 0; t < R.index.length / 3; t += 1) if (!armV[R.index[t * 3]] && !armV[R.index[t * 3 + 1]] && !armV[R.index[t * 3 + 2]]) Btris.push(t);
const Bloops = (() => {
  const cnt = new Map();
  for (const t of Btris) for (let e = 0; e < 3; e += 1) { const k = R.ek(R.index[t * 3 + e], R.index[t * 3 + ((e + 1) % 3)]); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const edges = []; for (const [k, c] of cnt) if (c === 1) edges.push([Math.floor(k / 1048576), k % 1048576]);
  const par = new Map(); const f = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const [u, v] of edges) { if (!par.has(u)) par.set(u, u); if (!par.has(v)) par.set(v, v); par.set(f(u), f(v)); }
  const comp = new Map();
  for (const [u, v] of edges) { const r = f(u); if (!comp.has(r)) comp.set(r, { edges: [], verts: new Set() }); const c = comp.get(r); c.edges.push([u, v]); c.verts.add(u); c.verts.add(v); }
  return [...comp.values()].map((c) => ({ edges: c.edges, verts: [...c.verts].sort((a, b) => a - b) }));
})();
function buildBc(P1) {
  const tris = [];
  for (const t of Btris) { const a = R.index[t * 3]; const b = R.index[t * 3 + 1]; const c = R.index[t * 3 + 2]; tris.push([...vtx(P1, a), ...vtx(P1, b), ...vtx(P1, c)]); }
  for (const L of Bloops) {
    const m = [0, 0, 0];
    for (const v of L.verts) for (let d = 0; d < 3; d += 1) m[d] += P1[v * 3 + d] / L.verts.length;
    for (const [u, v] of L.edges) tris.push([...m, ...vtx(P1, u), ...vtx(P1, v)]);
  }
  return Float64Array.from(tris.flat());
}
const RAYS = [[0.5377, 0.8328, 0.1311], [-0.2931, 0.1987, 0.9352], [0.8660, -0.4082, 0.2887]].map(norm);
function rayHits(T, p, d) {
  let n = 0;
  for (let o = 0; o < T.length; o += 9) {
    const e1x = T[o + 3] - T[o]; const e1y = T[o + 4] - T[o + 1]; const e1z = T[o + 5] - T[o + 2];
    const e2x = T[o + 6] - T[o]; const e2y = T[o + 7] - T[o + 1]; const e2z = T[o + 8] - T[o + 2];
    const hx = d[1] * e2z - d[2] * e2y; const hy = d[2] * e2x - d[0] * e2z; const hz = d[0] * e2y - d[1] * e2x;
    const a = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(a) < 1e-14) continue;
    const fi = 1 / a; const sx = p[0] - T[o]; const sy = p[1] - T[o + 1]; const sz = p[2] - T[o + 2];
    const u = fi * (sx * hx + sy * hy + sz * hz); if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y; const qy = sz * e1x - sx * e1z; const qz = sx * e1y - sy * e1x;
    const v = fi * (d[0] * qx + d[1] * qy + d[2] * qz); if (v < 0 || u + v > 1) continue;
    const t = fi * (e2x * qx + e2y * qy + e2z * qz);
    if (t > 1e-9) n += 1;
  }
  return n;
}
function bcParity(Tbc, p) {
  const odd = RAYS.map((d) => rayHits(Tbc, p, d) % 2);
  const s = odd[0] + odd[1] + odd[2];
  return { inside: s >= 2, votes: odd.join('') };
}

// 一幀的共用資料
function frame(keyId) {
  const { real, pk, P1, N1 } = V2.poseKey(setup, KEY[keyId]);
  const Tb = V2.surfaceArrays(P1, R.index, Sb.tris); const Te = V2.surfaceArrays(P1, R.index, Se.tris);
  return { keyId, real, pk, P1, N1, Tb, Te, bbB: V2.triBoxes(Tb), bbE: V2.triBoxes(Te), Tbc: buildBc(P1) };
}
const bindCentroid = (t) => [0, 1, 2].map((d) => (R.P[R.index[t * 3] * 3 + d] + R.P[R.index[t * 3 + 1] * 3 + d] + R.P[R.index[t * 3 + 2] * 3 + d]) / 3);
const zoneOf = (y) => (y >= 1.15 ? '胸' : y >= 0.95 ? '腹' : '臀腿');

const report = { faces, tag: args.tag ?? null };
const txt = [];
const say = (s = '') => txt.push(s);

// ---------------------------------------------------------------------------
// V0：自我檢查＋舊值重現
if (only.has('V0')) {
  say(`# V0 自我檢查與舊值重現（faces=${faces}${tag}）`);
  const P0 = R.P;
  const T0b = V2.surfaceArrays(P0, R.index, Sb.tris); const T0e = V2.surfaceArrays(P0, R.index, Se.tris);
  const Tall = V2.surfaceArrays(P0, R.index, Array.from({ length: R.index.length / 3 }, (_, t) => t));
  const checks = {
    orientBad: { b: V2.orientationCheck(R.index, Sb.tris), e: V2.orientationCheck(R.index, Se.tris), all: V2.orientationCheck(R.index, Array.from({ length: R.index.length / 3 }, (_, t) => t)) },
    wFullMeshAtPelvis: V2.windingNumber(Tall, rp.LANDMARKS.pelvis),
    wFullMeshFar: V2.windingNumber(Tall, [0.3, 1.2, 2.0]),
    wBindPelvis: { b: V2.windingNumber(T0b, rp.LANDMARKS.pelvis), e: V2.windingNumber(T0e, rp.LANDMARKS.pelvis) },
    Bc: { tris: Btris.length, loops: Bloops.map((L) => L.verts.length) },
  };
  say(`- 方向一致（內部邊兩側走向相反）：不一致邊 全身 ${checks.orientBad.all}、S_b ${checks.orientBad.b}、S_e ${checks.orientBad.e}`);
  say(`- 全身封閉網格（綁定姿勢）GWN：pelvis 地標 ${checks.wFullMeshAtPelvis.toFixed(6)}（應＝1）、身外 (0.3,1.2,2.0) ${checks.wFullMeshFar.toFixed(6)}（應＝0）`);
  say(`- 子集（綁定姿勢）GWN at pelvis 地標：S_b ${checks.wBindPelvis.b.toFixed(3)}、S_e ${checks.wBindPelvis.e.toFixed(3)}（應 >0.5）`);
  say(`- B_c：去臂三角形 ${checks.Bc.tris}、封口環 ${checks.Bc.loops.length} 個（頂點 ${checks.Bc.loops.join('／')}）`);
  if (args.oldref && args.oldref !== '1') {
    const pre = args.oldprefix && args.oldprefix !== '1' ? args.oldprefix : 'before';
    const ob = JSON.parse(await readFile(join(args.oldref, `${pre}-${faces}.json`), 'utf8'));
    const oe = JSON.parse(await readFile(join(args.oldref, `thigh-${pre}-${faces}.json`), 'utf8'));
    const refB = ob.results.base.keys; const refE = oe.rows;
    let same = 0; const diff = [];
    for (const k of lib.ALL_KEYS) {
      const { P1, N1 } = V2.poseKey(setup, k);
      const b = lib.metricPenetration(R, P1, N1); const e = lib.metricPenetration(RH, P1, N1);
      for (const s of ['r', 'l']) {
        for (const [m, cur, ref] of [['b', b[s], refB[k.id].b[s]], ['e', e[s], refE[k.id][s]]]) {
          if (cur.inside === ref.inside && cur.maxDepth === ref.maxDepth && cur.undetermined === ref.undetermined) same += 1;
          else diff.push(`${k.id}${s}(${m}) 新工具 ${cur.inside}/${cur.maxDepth}/${cur.undetermined} vs 舊檔 ${ref.inside}/${ref.maxDepth}/${ref.undetermined}`);
        }
      }
    }
    checks.oldReproduce = { ref: [`${pre}-${faces}.json`, `thigh-${pre}-${faces}.json`], same, diff, hipSurfaceRef: oe.hipSurface, hipSurfaceNow: { verts: Se.verts, tris: Se.tris.length, boundaryEdges: Se.boundaryEdge.size } };
    say(`- 舊值重現（lib.metricPenetration 在本工具的姿勢上重算 vs ${pre}-${faces}.json／thigh-${pre}-${faces}.json；點數、最深（全精度）、不定數逐項）：${same}/36 項完全相同${diff.length ? `；不同：${diff.join('；')}` : ''}`);
    say(`- S_e 與舊版同一份：舊檔 頂點 ${oe.hipSurface.verts}／三角形 ${oe.hipSurface.tris}／開口邊 ${oe.hipSurface.boundaryEdges}；本工具 ${Se.verts}／${Se.tris.length}／${Se.boundaryEdge.size}`);
  }
  report.V0 = checks;
  say('');
}

// ---------------------------------------------------------------------------
// V1：凸處往內／往外構造點
// 獨立距離（不同於量尺的 Ericson 分區法）：投影到三角形平面，落在三角形內＝平面距離，否則＝到三邊線段距離的最小值；
// 全部三角形暴力比、不剪枝。用來證明量尺的深度＝真實最近距離。
function segDist(p, a, b) {
  const ab = sub(b, a); const t = Math.min(Math.max(dotv(sub(p, a), ab) / dotv(ab, ab), 0), 1);
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
}
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
function distAlt(T, p) {
  let best = Infinity;
  for (let o = 0; o < T.length; o += 9) {
    const a = [T[o], T[o + 1], T[o + 2]]; const b = [T[o + 3], T[o + 4], T[o + 5]]; const c = [T[o + 6], T[o + 7], T[o + 8]];
    const n = cross(sub(b, a), sub(c, a));
    const nl = Math.hypot(...n);
    let d;
    if (nl < 1e-15) d = Math.min(segDist(p, a, b), segDist(p, b, c), segDist(p, c, a));
    else {
      const nn = n.map((x) => x / nl); const h = dotv(sub(p, a), nn); const q = sub(p, nn.map((x) => x * h));
      const s0 = dotv(cross(sub(b, q), sub(c, q)), nn); const s1 = dotv(cross(sub(c, q), sub(a, q)), nn); const s2 = dotv(cross(sub(a, q), sub(b, q)), nn);
      d = s0 >= 0 && s1 >= 0 && s2 >= 0 ? Math.abs(h) : Math.min(segDist(p, a, b), segDist(p, b, c), segDist(p, c, a));
    }
    if (d < best) best = d;
  }
  return best;
}
// mode＝'face'：修正 1 後的正式構造（三角形質心＋面法線＋以獨立距離確認的 5 cm 淨空；見 V-criteria-frozen.md 修正 1）
// mode＝'vertex'：凍結時的原構造（頂點＋lib.vertexNormals），保留以揭露其缺陷，不作判定
function v1Run(S, which, regions, label, mode) {
  const sVerts = [...new Set(S.tris.flatMap((t) => [R.index[t * 3], R.index[t * 3 + 1], R.index[t * 3 + 2]]))].sort((a, b) => a - b);
  const rows = []; let nIn = 0; let nOut = 0; const fails = []; const noSample = [];
  for (const k of lib.ALL_KEYS) {
    const F = frame(k.id);
    const T = which === 'b' ? F.Tb : F.Te; const bb = which === 'b' ? F.bbB : F.bbE;
    const SV = sVerts.map((q) => vtx(F.P1, q));
    for (const [reg, sel] of Object.entries(regions)) {
      // 種子：vertex 模式＝S 頂點（綁定位置在區內）；face 模式＝S 三角形（綁定質心在區內）
      const seeds = mode === 'vertex'
        ? sVerts.filter((i) => sel(R.P[i * 3], R.P[i * 3 + 1], R.P[i * 3 + 2])).map((i) => ({ id: i, p: vtx(F.P1, i), n: vtx(F.N1, i) }))
        : [...S.tris].sort((a, b) => a - b).filter((t) => { const c = bindCentroid(t); return sel(c[0], c[1], c[2]); }).map((t) => {
          const A = vtx(F.P1, R.index[t * 3]); const B = vtx(F.P1, R.index[t * 3 + 1]); const C = vtx(F.P1, R.index[t * 3 + 2]);
          return { id: t, p: [0, 1, 2].map((d) => (A[d] + B[d] + C[d]) / 3), n: norm(cross(sub(B, A), sub(C, A))) };
        });
      const ok = [];
      for (const sd of seeds) {
        const pin5 = add(sd.p, sd.n, -0.05); const pout5 = add(sd.p, sd.n, 0.05);
        let good = true;
        for (const pq of SV) {
          const dq = Math.hypot(pq[0] - sd.p[0], pq[1] - sd.p[1], pq[2] - sd.p[2]);
          if (dq <= 0.06 && dotv(sub(pq, sd.p), sd.n) > 0.003) { good = false; break; }
          if (mode === 'vertex' && dq > 0.06 && Math.hypot(pq[0] - pin5[0], pq[1] - pin5[1], pq[2] - pin5[2]) < 0.053) { good = false; break; }
        }
        // face 模式的淨空：往內／往外 5 cm 點到 S 的真實距離（獨立演算法 distAlt，不是量尺）都要 ≥ 4.95 cm，
        // 即半徑 5 cm 的球除了切點外碰不到 S；球沿法線巢狀，d＝1／3 cm 的點也就在真實深度 d（誤差 ≤0.5 mm）
        if (good && mode === 'face' && (distAlt(T, pin5) < 0.0495 || distAlt(T, pout5) < 0.0495)) good = false;
        if (good) ok.push(sd);
      }
      if (!ok.length) { noSample.push(`${k.id} ${reg}（候選 ${seeds.length}）`); continue; }
      const pick = ok.length <= 8 ? ok : Array.from({ length: 8 }, (_, j) => ok[Math.floor((j * ok.length) / 8)]);
      for (const sd of pick) {
        for (const d of [0.01, 0.03, 0.05]) {
          const pin = add(sd.p, sd.n, -d); const pout = add(sd.p, sd.n, d);
          const wi = V2.windingNumber(T, pin); const wo = V2.windingNumber(T, pout);
          const depth = V2.nearestOnSurface(T, bb, pin).d;
          const alt = distAlt(T, pin);
          const bi = bcParity(F.Tbc, pin); const bo = bcParity(F.Tbc, pout);
          const inOk = wi > V2.W_IN && Math.abs(depth - d) <= 0.003; const outOk = !(wo > V2.W_IN);
          nIn += 1; nOut += 1;
          const sid = `${mode === 'vertex' ? 'v' : 't'}${sd.id}`;
          if (!inOk) fails.push(`${k.id} ${reg} ${sid} 往內 ${Math.round(d * 100)}cm：w=${wi.toFixed(3)} 深度=${cm(depth)} cm、獨立距離=${cm(alt)} cm（B_c ${bi.inside ? '內' : '外'}）`);
          if (!outOk) fails.push(`${k.id} ${reg} ${sid} 往外 ${Math.round(d * 100)}cm：w=${wo.toFixed(3)}（B_c ${bo.inside ? '內' : '外'}）`);
          rows.push({ key: k.id, region: reg, seed: sid, d, wIn: Number(wi.toFixed(4)), depthIn: Number(depth.toFixed(5)), errCm: Number(((depth - d) * 100).toFixed(3)), altDiffCm: Number((Math.abs(depth - alt) * 100).toFixed(6)), altErrCm: Number(((alt - d) * 100).toFixed(3)), bcIn: bi.inside, wOut: Number(wo.toFixed(4)), bcOut: bo.inside });
        }
      }
    }
  }
  const mx = (f) => (rows.length ? Math.max(...rows.map(f)) : null);
  const inMiss = rows.filter((r) => !(r.wIn > V2.W_IN)).length; const outMiss = rows.filter((r) => r.wOut > V2.W_IN).length;
  const depthMiss = rows.filter((r) => Math.abs(r.errCm) > 0.3).length;
  return {
    label, mode, pass: fails.length === 0 && rows.length > 0, nIn, nOut, inMiss, outMiss, depthMiss, fails, noSample,
    errMaxCm: mx((r) => Math.abs(r.errCm)), altDiffMaxCm: mx((r) => r.altDiffCm), altErrMaxCm: mx((r) => Math.abs(r.altErrCm)),
    wInMin: rows.length ? Math.min(...rows.map((r) => r.wIn)) : null, wOutMax: mx((r) => r.wOut),
    bcAgree: rows.filter((r) => r.bcIn && !r.bcOut).length, samples: rows.length / 3, rows,
  };
}
if (only.has('V1')) {
  const regB = {
    胸: (x, y, z) => z > 0 && y >= 1.20 && y <= 1.38 && Math.abs(x) >= 0.04 && Math.abs(x) <= 0.14,
    背: (x, y, z) => z < 0 && y >= 1.15 && y <= 1.40 && Math.abs(x) >= 0.04 && Math.abs(x) <= 0.14,
    側腰: (x, y) => y >= 1.02 && y <= 1.15 && Math.abs(x) >= 0.15,
  };
  const regE = {
    臀: (x, y, z) => z < 0 && y >= 0.80 && y <= 0.95 && Math.abs(x) >= 0.04 && Math.abs(x) <= 0.15,
    大腿前: (x, y, z) => z > 0 && y >= 0.66 && y <= 0.85 && Math.abs(x) >= 0.06 && Math.abs(x) <= 0.16,
    大腿外側: (x, y) => y >= 0.66 && y <= 0.90 && Math.abs(x) >= 0.17,
  };
  const r1 = v1Run(Sb, 'b', regB, 'V1 (b) S_b 胸／背／側腰——正式（修正 1：三角形質心＋面法線）', 'face');
  const r1v = v1Run(Sb, 'b', regB, 'V1 原構造（凍結時：頂點＋頂點法線）——保留以揭露構造缺陷，不作判定', 'vertex');
  const r1e = v1Run(Se, 'e', regE, 'V1 補充 (e) S_e 臀／大腿前／大腿外側（驗收檔未要求，不計入 V1；面法線構造）', 'face');
  report.V1 = r1; report.V1orig = r1v; report.V1e = r1e;
  for (const r of [r1, r1v, r1e]) {
    say(`# ${r.label}（faces=${faces}${tag}）`);
    say(`- 判定：${r.mode === 'vertex' ? `（不作判定；照原判準會是${r.pass ? '過' : '不過'}）` : r.pass ? '過' : '不過'}；樣本 ${r.samples}（9 幀×3 區×≤8），往內點 ${r.nIn}、往外點 ${r.nOut}（d＝1／3／5 cm）`);
    say(`- 往內判外 ${r.inMiss}、往外判內 ${r.outMiss}、深度誤差 >0.3 cm ${r.depthMiss}；往內最小 w ${r.wInMin?.toFixed(3)}（須 >0.5）、往外最大 w ${r.wOutMax?.toFixed(3)}（須 ≤0.5）、深度誤差最大 ${r.errMaxCm?.toFixed(3)} cm（須 ≤0.3）`);
    say(`- 量尺深度 vs 獨立距離（投影法、全三角形暴力比）最大差 ${r.altDiffMaxCm?.toExponential(2)} cm；獨立距離 vs 構造深度 d 最大差 ${r.altErrMaxCm?.toFixed(3)} cm（＝構造本身的誤差）`);
    say(`- 獨立參考 B_c 與構造一致（往內在內且往外在外）：${r.bcAgree}/${r.rows.length}`);
    say(`- 無合格樣本：${r.noSample.length ? r.noSample.join('、') : '無'}`);
    say(`- 不符點（${r.fails.length}）：${r.fails.length ? r.fails.slice(0, 40).join('；') + (r.fails.length > 40 ? `；…另 ${r.fails.length - 40} 點見 json` : '') : '無'}`);
    const byKey = {};
    for (const row of r.rows) { const k = `${row.key} ${row.region}`; (byKey[k] || (byKey[k] = [])).push(row); }
    say('| 幀 區 | 樣本 | 往內 w 最小 | 往外 w 最大 | 深度誤差最大 cm |');
    say('|---|---|---|---|---|');
    for (const [k, rs] of Object.entries(byKey)) say(`| ${k} | ${rs.length / 3} | ${Math.min(...rs.map((x) => x.wIn)).toFixed(3)} | ${Math.max(...rs.map((x) => x.wOut)).toFixed(3)} | ${Math.max(...rs.map((x) => Math.abs(x.errCm))).toFixed(3)} |`);
    say('');
  }
}

// ---------------------------------------------------------------------------
// V2：K4b 凹處
if (only.has('V2')) {
  const F = frame('K4b');
  const sk = F.real.p.mesh.skeleton;
  const boneM = (b) => new THREE.Matrix4().multiplyMatrices(sk.bones[rp.BONES.indexOf(b)].matrixWorld, sk.boneInverses[rp.BONES.indexOf(b)]);
  const xf = (M, p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(M).toArray();
  const xd = (M, d) => new THREE.Vector3(d[0], d[1], d[2]).transformDirection(M).toArray();
  const judge = (p) => {
    const wb = V2.windingNumber(F.Tb, p); const we = V2.windingNumber(F.Te, p);
    return { wb, we, inB: wb > V2.W_IN, inE: we > V2.W_IN, db: V2.nearestOnSurface(F.Tb, F.bbB, p).d, de: V2.nearestOnSurface(F.Te, F.bbE, p).d, bc: bcParity(F.Tbc, p) };
  };
  // (a) 舊量法 >10 cm 點
  const a = {};
  say(`# V2 凹處不誤判（K4b，faces=${faces}${tag}）`);
  say('## (a) 舊量法在 K4b 讀成 >10 cm 的點逐點重判');
  say('欄位：頂點、臂/部位、舊深度（到 S 最近距離）、最近點所在三角形的綁定質心 (x,y,z) 與分區、最近點內插法線 n（姿勢）與 cos∠(p−q, n)（<0＝舊法判內的原因）、新 w、新判定、B_c 奇偶（獨立參考）');
  let aPass = true; let aCount = 0;
  for (const [m, S, RR, T, bb] of [['b', Sb, R, F.Tb, F.bbB], ['e', Se, RH, F.Te, F.bbE]]) {
    const old = lib.metricPenetration(RR, F.P1, F.N1);
    const list = [];
    let oldMaxCheck = { r: 0, l: 0 };
    for (const i of old.flagged.arm) {
      const p = vtx(F.P1, i);
      const nr = V2.nearestOnSurface(T, bb, p);
      const s = R.armSide[i] < 0 ? 'r' : 'l';
      oldMaxCheck[s] = Math.max(oldMaxCheck[s], nr.d);
      if (!(nr.d > 0.10)) continue;
      const t = S.tris[nr.k];
      const tv = [R.index[t * 3], R.index[t * 3 + 1], R.index[t * 3 + 2]];
      const n = norm([0, 1, 2].map((d) => nr.w[0] * F.N1[tv[0] * 3 + d] + nr.w[1] * F.N1[tv[1] * 3 + d] + nr.w[2] * F.N1[tv[2] * 3 + d]));
      const pq = sub(p, nr.q); const cos = dotv(pq, n) / Math.hypot(...pq);
      const w = V2.windingNumber(T, p);
      const bc = bcParity(F.Tbc, p);
      const expectOut = !bc.inside;
      const ok = expectOut ? !(w > V2.W_IN) : null;
      if (ok === false) aPass = false;
      if (ok === null) aPass = false; // B_c 為內：不自動算過，另行說明
      aCount += 1;
      const c = bindCentroid(t);
      list.push({ i, side: s, part: ['上臂', '前臂', '手'][R.armPart[i]], oldDepth: Number(nr.d.toFixed(5)), nearestBind: c.map((x) => Number(x.toFixed(3))), zone: zoneOf(c[1]), n: n.map((x) => Number(x.toFixed(3))), cos: Number(cos.toFixed(3)), w: Number(w.toFixed(4)), newInside: w > V2.W_IN, bc: bc.inside, bcVotes: bc.votes, ok });
    }
    list.sort((x, y) => y.oldDepth - x.oldDepth || x.i - y.i);
    a[m] = { oldReported: { r: old.r.maxDepth, l: old.l.maxDepth }, oldMaxRecomputed: oldMaxCheck, list };
    say(`### ${m === 'b' ? '(b) 軀幹' : '(e) 骨盆＋大腿'}：${list.length} 點（舊量法本幀最深 右 ${cm(old.r.maxDepth)}／左 ${cm(old.l.maxDepth)} cm；本工具重算舊標記點最近距離最大 右 ${cm(oldMaxCheck.r)}／左 ${cm(oldMaxCheck.l)} cm）`);
    if (list.length) {
      say('| 頂點 | 臂/部位 | 舊深度 cm | 最近點綁定質心 (x,y,z) | 分區 | 法線 n | cos | 新 w | 新判定 | B_c | 一致 |');
      say('|---|---|---|---|---|---|---|---|---|---|---|');
      for (const r of list) say(`| ${r.i} | ${r.side === 'r' ? '右' : '左'}${r.part} | ${cm(r.oldDepth)} | (${r.nearestBind.join(', ')}) | ${r.zone} | (${r.n.join(', ')}) | ${r.cos} | ${r.w.toFixed(3)} | ${r.newInside ? '內' : '外'} | ${r.bc ? '內' : '外'}(${r.bcVotes}) | ${r.ok === null ? 'B_c 內，另述' : r.ok ? '是' : '否'} |`);
    }
  }
  // (b) 構造點
  const Mp = boneM('pelvis');
  const fwd = xd(Mp, [0, 0, 1]); const down = xd(Mp, [0, -1, 0]);
  const sbVerts = new Uint8Array(R.n); for (const t of Sb.tris) for (let e = 0; e < 3; e += 1) sbVerts[R.index[t * 3 + e]] = 1;
  let cf = -1;
  for (let i = 0; i < R.n; i += 1) {
    if (!sbVerts[i] || Math.abs(R.P[i * 3]) > 0.02 || R.P[i * 3 + 1] > 0.80) continue;
    if (cf < 0 || R.P[i * 3 + 2] > R.P[cf * 3 + 2]) cf = i;
  }
  const c0 = vtx(F.P1, cf);
  const pts = [];
  for (const ang of [0, 30, 60]) {
    const aa = (ang * Math.PI) / 180;
    const dir = [0, 1, 2].map((k) => Math.cos(aa) * fwd[k] + Math.sin(aa) * down[k]);
    for (const d of [0.05, 0.10, 0.15, 0.20, 0.25]) pts.push({ set: '胯下前方', desc: `下傾 ${ang}° ${Math.round(d * 100)} cm`, p: add(c0, dir, d), expect: 'outIfBcOut' });
  }
  const hemInfo = {};
  for (const s of ['r', 'l']) {
    const Hb = rp.LANDMARKS[`${s}Hip`]; const Kb = rp.LANDMARKS[`${s}Knee`];
    const H1 = xf(boneM(`${s}Hip`), Hb); const K1 = xf(boneM(`${s}Knee`), Kb);
    const Lh = Math.hypot(K1[0] - H1[0], K1[1] - H1[1], K1[2] - H1[2]); const u = norm(sub(K1, H1));
    const th = (Hb[1] - 0.645) / (Hb[1] - Kb[1]);
    const ub = norm(sub(Kb, Hb));
    let Rh = 0;
    for (let i = 0; i < R.n; i += 1) {
      if (armV[i]) continue;
      const x = R.P[i * 3]; if ((s === 'r') !== (x < 0)) continue;
      const y = R.P[i * 3 + 1]; if (y < 0.64 || y > 0.66) continue;
      const dd = sub(vtx(R.P, i), Hb); const t = dotv(dd, ub);
      Rh = Math.max(Rh, Math.hypot(dd[0] - t * ub[0], dd[1] - t * ub[1], dd[2] - t * ub[2]));
    }
    const hc = add(H1, u, th * Lh);
    const A = norm(sub(fwd, u.map((x) => x * dotv(fwd, u))));
    const o = xd(Mp, [s === 'r' ? -1 : 1, 0, 0]);
    const B = norm(sub(sub(o, u.map((x) => x * dotv(o, u))), A.map((x) => x * dotv(o, A))));
    hemInfo[s] = { Rh: Number(Rh.toFixed(4)), th: Number(th.toFixed(4)) };
    for (const [nm, dir] of [['前', A], ['外側', B]]) {
      for (const d of [0.05, 0.10, 0.15, 0.20, 0.25]) pts.push({ set: '褲管口下方', desc: `${s === 'r' ? '右' : '左'}腿 ${nm} ${Math.round(d * 100)} cm`, p: add(add(hc, u, d), dir, Rh), expect: 'outIfBcOut' });
    }
  }
  const cr = rp.LANDMARKS.crotch; const pv = rp.LANDMARKS.pelvis;
  for (const t of [0, 0.25, 0.5, 0.75, 1]) pts.push({ set: '骨盆軸線', desc: `t=${t}`, p: xf(Mp, [0, 1, 2].map((k) => cr[k] + t * (pv[k] - cr[k]))), expect: 'in' });
  let bPass = true;
  const bRows = [];
  for (const q of pts) {
    const j = judge(q.p);
    let ok; let counted = true;
    if (q.expect === 'in') ok = j.inB && j.inE;
    else if (!j.bc.inside) ok = !j.inB && !j.inE;
    else { ok = null; counted = false; }
    if (ok === false) bPass = false;
    bRows.push({ ...q, p: q.p.map((x) => Number(x.toFixed(4))), wb: Number(j.wb.toFixed(4)), we: Number(j.we.toFixed(4)), inB: j.inB, inE: j.inE, db: Number(j.db.toFixed(4)), de: Number(j.de.toFixed(4)), bc: j.bc.inside, bcVotes: j.bc.votes, counted, ok });
  }
  say('## (b) 構造點（K4b 姿勢）');
  say(`胯下起點：S_b 頂點 ${cf}（綁定 ${vtx(R.P, cf).map(f3).join(', ')}）；pelvis 前方 (${fwd.map(f3).join(', ')})、下方 (${down.map(f3).join(', ')})；褲管口 R_h 右 ${hemInfo.r.Rh}／左 ${hemInfo.l.Rh} m、t_h ${hemInfo.r.th}`);
  say('| 組 | 點 | 姿勢座標 | w_b | w_e | (b) | (e) | 到 S_b／S_e 最近 cm | B_c | 應判 | 一致 |');
  say('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of bRows) {
    const expect = r.expect === 'in' ? '內' : r.counted ? '外' : '（B_c 內：不在「應判外」集合）';
    say(`| ${r.set} | ${r.desc} | (${r.p.map(f3).join(', ')}) | ${r.wb.toFixed(3)} | ${r.we.toFixed(3)} | ${r.inB ? '內' : '外'} | ${r.inE ? '內' : '外'} | ${cm(r.db)}／${cm(r.de)} | ${r.bc ? '內' : '外'}(${r.bcVotes}) | ${expect} | ${r.ok === null ? '—' : r.ok ? '是' : '否'} |`);
  }
  const outSet = bRows.filter((r) => r.expect !== 'in' && r.counted);
  const inSet = bRows.filter((r) => r.expect === 'in');
  const excluded = bRows.filter((r) => !r.counted);
  say('');
  say(`- (a) 判定：${aPass ? '過' : '不過'}（${aCount} 點；B_c 為外者新量法須判外）`);
  say(`- (b) 判定：${bPass ? '過' : '不過'}（應判外 ${outSet.length} 點：${outSet.filter((r) => r.ok).length} 點一致；骨盆軸線 ${inSet.length} 點：${inSet.filter((r) => r.ok).length} 點一致；B_c 為內而不列入「應判外」的構造點 ${excluded.length} 點）`);
  report.V2 = { a, aPass, aCount, b: bRows, bPass, hemInfo, crotchStart: cf, pass: aPass && bPass };
  say(`- V2 綜合：${aPass && bPass ? '過' : '不過'}`);
  say('');
}

// ---------------------------------------------------------------------------
// V3：K4a 側腰新舊標記集合重疊
if (only.has('V3')) {
  const F = frame('K4a');
  const old = lib.metricPenetration(R, F.P1, F.N1);
  const O = new Set(old.flagged.arm);
  const region = []; const N = new Set();
  for (const s of ['r', 'l']) {
    for (const i of R.armVerts[s]) {
      const p = vtx(F.P1, i);
      const nr = V2.nearestOnSurface(F.Tb, F.bbB, p);
      const c = bindCentroid(Sb.tris[nr.k]);
      if (!(c[1] >= 0.95 && c[1] < 1.15 && Math.abs(c[0]) >= 0.12)) continue;
      region.push(i);
      if (V2.windingNumber(F.Tb, p) > V2.W_IN) N.add(i);
    }
  }
  const stat = (ids) => {
    const o = ids.filter((i) => O.has(i)); const n = ids.filter((i) => N.has(i));
    const both = o.filter((i) => N.has(i)).length; const uni = new Set([...o, ...n]).size;
    return { region: ids.length, old: o.length, new: n.length, both, union: uni, jaccard: uni ? both / uni : null, oldRecall: o.length ? both / o.length : null, newPrecision: n.length ? both / n.length : null, oldOnly: o.filter((i) => !N.has(i)), newOnly: n.filter((i) => !O.has(i)) };
  };
  const all = stat(region);
  const per = { r: stat(region.filter((i) => R.armSide[i] < 0)), l: stat(region.filter((i) => R.armSide[i] > 0)) };
  const pass = all.jaccard !== null && all.jaccard >= 0.90;
  report.V3 = { all, per, pass };
  const p = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
  say(`# V3 可靠處一致（K4a 側腰：到 S_b 最近三角形綁定質心 y∈[0.95,1.15)、|x|≥0.12；faces=${faces}${tag}）`);
  say(`- 判定：${pass ? '過' : '不過'}（兩臂合計 Jaccard ${p(all.jaccard)}，須 ≥90%）`);
  say(`- 兩臂合計：區域內手臂頂點 ${all.region}、舊標記 ${all.old}、新標記 ${all.new}、交集 ${all.both}、聯集 ${all.union}；|O∩N|/|O| ${p(all.oldRecall)}、|O∩N|/|N| ${p(all.newPrecision)}`);
  for (const s of ['r', 'l']) say(`- ${s === 'r' ? '右' : '左'}臂（只供參考）：區域 ${per[s].region}、舊 ${per[s].old}、新 ${per[s].new}、交集 ${per[s].both}、Jaccard ${p(per[s].jaccard)}`);
  say(`- 只有舊標：${all.oldOnly.length ? all.oldOnly.join(', ') : '無'}；只有新標：${all.newOnly.length ? all.newOnly.join(', ') : '無'}`);
  say('');
}

// ---------------------------------------------------------------------------
// V4：圖（軟體光柵，決定論；PNG 自編碼）
const FONT = {
  A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
  D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
  G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '01110,00100,00100,00100,00100,00100,01110',
  J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110',
  P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001',
  S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100', U: '10001,10001,10001,10001,10001,10001,01110',
  V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001',
  Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
  0: '01110,10001,10011,10101,11001,10001,01110', 1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111',
  3: '11111,00010,00100,00010,00001,10001,01110', 4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110',
  6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110',
  9: '01110,10001,10001,01111,00001,00010,01100', '(': '00010,00100,01000,01000,01000,00100,00010', ')': '01000,00100,00010,00010,00010,00100,01000',
  '+': '00000,00100,00100,11111,00100,00100,00000', '-': '00000,00000,00000,11111,00000,00000,00000', '/': '00001,00001,00010,00100,01000,10000,10000',
  '.': '00000,00000,00000,00000,00000,01100,01100', ':': '00000,01100,01100,00000,01100,01100,00000', '=': '00000,00000,11111,00000,11111,00000,00000',
  ' ': '00000,00000,00000,00000,00000,00000,00000',
};
function canvas(w, h, bg) { const rgb = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i += 1) rgb.set(bg, i * 3); return { w, h, rgb, z: new Float64Array(w * h).fill(Infinity) }; }
function px(cv, x, y, c) { if (x < 0 || y < 0 || x >= cv.w || y >= cv.h) return; cv.rgb.set(c, (y * cv.w + x) * 3); }
function text(cv, x0, y0, s, c, sc = 3) {
  let x = x0;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' '];
    g.split(',').forEach((row, ry) => { for (let rx = 0; rx < 5; rx += 1) if (row[rx] === '1') for (let a = 0; a < sc; a += 1) for (let b = 0; b < sc; b += 1) px(cv, x + rx * sc + a, y0 + ry * sc + b, c); });
    x += 6 * sc;
  }
}
function box(cv, x0, y0, x1, y1, c) { for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) px(cv, x, y, c); }
function cam(az, el, center, scale, w, h) {
  const a = (az * Math.PI) / 180; const e = (el * Math.PI) / 180;
  const fw = [-Math.sin(a) * Math.cos(e), -Math.sin(e), -Math.cos(a) * Math.cos(e)];
  const rt = [Math.cos(a), 0, -Math.sin(a)];
  const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  return { fw, proj: (p) => { const d = sub(p, center); return [w / 2 + scale * dotv(d, rt), h / 2 - scale * dotv(d, up), dotv(d, fw)]; } };
}
function fillTri(cv, p0, p1, p2, c) {
  const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
  if (Math.abs(area) < 1e-12) return;
  const x0 = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0]))); const x1 = Math.min(cv.w - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
  const y0 = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1]))); const y1 = Math.min(cv.h - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const sx = x + 0.5; const sy = y + 0.5;
      const w0 = ((p1[0] - sx) * (p2[1] - sy) - (p2[0] - sx) * (p1[1] - sy)) / area;
      const w1 = ((p2[0] - sx) * (p0[1] - sy) - (p0[0] - sx) * (p2[1] - sy)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const d = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]; const k = y * cv.w + x;
      if (d >= cv.z[k]) continue;
      cv.z[k] = d; cv.rgb.set(c, k * 3);
    }
  }
}
function disc(cv, sx, sy, r, c) { for (let y = Math.floor(sy - r); y <= Math.ceil(sy + r); y += 1) for (let x = Math.floor(sx - r); x <= Math.ceil(sx + r); x += 1) if ((x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2 <= r * r) px(cv, x, y, c); }
function seg(cv, a, b, c) { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1; for (let i = 0; i <= n; i += 1) disc(cv, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, 1, c); }
function paste(dst, src, ox, oy) { for (let y = 0; y < src.h; y += 1) for (let x = 0; x < src.w; x += 1) { const s = (y * src.w + x) * 3; px(dst, ox + x, oy + y, [src.rgb[s], src.rgb[s + 1], src.rgb[s + 2]]); } }
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i += 1) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function png(cv) {
  const raw = Buffer.alloc((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y += 1) { raw[y * (cv.w * 3 + 1)] = 0; Buffer.from(cv.rgb.buffer, y * cv.w * 3, cv.w * 3).copy(raw, y * (cv.w * 3 + 1) + 1); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, cr]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(cv.w, 0); ih.writeUInt32BE(cv.h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const COL = { old: [230, 30, 30], new: [20, 90, 255], both: [140, 0, 170], open: [0, 150, 0], S: [150, 170, 205], arm: [228, 200, 168], other: [206, 206, 206], ink: [30, 30, 30] };
if (only.has('V4')) {
  report.V4 = {};
  const VW = 600; const VH = 800; const SCALE = 360; const TOP = 70; const ROWH = VH + 44;
  for (const keyId of ['K4b', 'K1a', 'K1b']) {
    const F = frame(keyId);
    const pj = F.real.p.rig.joints.pelvis.getWorldPosition(new THREE.Vector3());
    const center = [pj.x, pj.y + 0.2, pj.z];
    const views = [[0, 5, 'FRONT'], [-90, 5, 'RIGHT SIDE'], [90, 5, 'LEFT SIDE']];
    const img = canvas(VW * 3 + 16, TOP + ROWH * 2, [255, 255, 255]);
    text(img, 12, 12, `${keyId} ${faces} ${label}`, COL.ink, 4);
    let lx = 12; const ly = 46;
    for (const [c, s] of [[COL.old, 'OLD ONLY'], [COL.new, 'NEW ONLY'], [COL.both, 'BOTH'], [COL.open, 'S OPENING EDGE'], [COL.S, 'S SURFACE'], [COL.arm, 'ARM']]) { box(img, lx, ly, lx + 16, ly + 16, c); text(img, lx + 22, ly + 1, s, COL.ink, 2); lx += 22 + s.length * 12 + 26; }
    const counts = {};
    [['b', Sb, R, F.Tb], ['e', Se, RH, F.Te]].forEach(([m, S, RR, T], row) => {
      const oldS = new Set(lib.metricPenetration(RR, F.P1, F.N1).flagged.arm);
      const newS = new Set();
      for (const s of ['r', 'l']) for (const i of R.armVerts[s]) if (V2.windingNumber(T, vtx(F.P1, i)) > V2.W_IN) newS.add(i);
      const both = [...oldS].filter((i) => newS.has(i)).length;
      counts[m] = { old: oldS.size, new: newS.size, both };
      const isS = new Uint8Array(R.index.length / 3); for (const t of S.tris) isS[t] = 1;
      const y0 = TOP + row * ROWH;
      text(img, 12, y0 + 8, `${m === 'b' ? '(B) TORSO' : '(E) PELVIS+THIGH'}   OLD ${oldS.size}  NEW ${newS.size}  BOTH ${both}`, COL.ink, 3);
      views.forEach(([az, el, vname], vi) => {
        const C = cam(az, el, center, SCALE, VW, VH);
        const cv = canvas(VW, VH, [248, 248, 248]);
        const Ld = C.fw.map((x) => -x);
        for (let t = 0; t < R.index.length / 3; t += 1) {
          const ia = R.index[t * 3]; const ib = R.index[t * 3 + 1]; const ic = R.index[t * 3 + 2];
          const A = vtx(F.P1, ia); const B = vtx(F.P1, ib); const Cc = vtx(F.P1, ic);
          const u = sub(B, A); const w = sub(Cc, A);
          const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
          const lam = Math.abs(dotv(n, Ld)) / (Math.hypot(...n) || 1);
          const base = isS[t] ? COL.S : (armV[ia] || armV[ib] || armV[ic]) ? COL.arm : COL.other;
          const k = 0.35 + 0.65 * lam;
          fillTri(cv, C.proj(A), C.proj(B), C.proj(Cc), base.map((x) => Math.round(x * k)));
        }
        for (const key of S.boundaryEdge) { const u = Math.floor(key / 1048576); const v = key % 1048576; seg(cv, C.proj(vtx(F.P1, u)), C.proj(vtx(F.P1, v)), COL.open); }
        const ids = [...new Set([...oldS, ...newS])].sort((a, b) => a - b);
        for (const i of ids) { const q = C.proj(vtx(F.P1, i)); disc(cv, q[0], q[1], 2.4, oldS.has(i) && newS.has(i) ? COL.both : oldS.has(i) ? COL.old : COL.new); }
        text(cv, 8, VH - 26, vname, COL.ink, 2);
        paste(img, cv, vi * (VW + 8), y0 + 40);
      });
    });
    const file = name(`v4-${keyId}`, 'png');
    await writeFile(file, png(img));
    report.V4[keyId] = { file: basename(file), counts };
  }
  say(`# V4 圖（faces=${faces}${tag}）`);
  for (const [k, v] of Object.entries(report.V4)) say(`- ${k}：${v.file}；(b) 舊 ${v.counts.b.old}／新 ${v.counts.b.new}／兩者 ${v.counts.b.both}；(e) 舊 ${v.counts.e.old}／新 ${v.counts.e.new}／兩者 ${v.counts.e.both}`);
  say('');
}

// ---------------------------------------------------------------------------
const body = `${txt.join('\n')}\n`;
process.stdout.write(body);
const stem = [...only].sort().join('');
await writeFile(name(`verify-${stem}`, 'txt'), body);
await writeFile(name(`verify-${stem}`, 'json'), `${JSON.stringify(report, null, 1)}\n`);
