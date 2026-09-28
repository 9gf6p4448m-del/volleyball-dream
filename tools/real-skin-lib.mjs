// 寫實球員蒙皮診斷（docs/experiments/real-skin-diagnosis.md）的共用量測核心。
// node（tools/real-skin-measure.mjs）與瀏覽器截圖台（tools/real-skin-diag.html）共用這一份。
//
// 原則（指標定義凍結於動手前，見報告「量法」節）：
//  ・模組以參數注入（THREE、realPlayer、geoAnimator、geoCharacter）——實驗變體只換 realPlayer
//    模組或加一個逐幀掛勾，量法本身不變。
//  ・不重抄 realPlayer 的權重公式：權重一律讀 loadRealPlayerAsset 產出的 skinIndex／skinWeight；
//    姿勢一律由真實的 createGeoAnimator 逐幀（60 Hz）驅動，寫實人照 matchView 的順序
//    resetLegs → animator.update → root.y → groundLegs。
//  ・量測區域一律由「綁定姿勢幾何＋地標」選取、不讀權重：換權重時選取集合不變。

export const TICK = 1 / 60;
export const PROBE_ID = 'SkinProbe';
const DEG = 180 / Math.PI;

// ---------------------------------------------------------------------------
// 4 時刻 × 關鍵幀（觸發鏈與 tools/motion-2b-poses.html／D0 腳本同一套寫法）
// cam＝截圖用：az 方位角（0＝角色正前方 +Z、−90＝角色右側 −X）、el 仰角、dist 距離、ty 注視高度
export const MOMENTS = [
  {
    id: 'spike', label: '扣球引臂／揮臂',
    keys: [
      {
        id: 'K1a', label: '引臂（spikeHold）', cam: { az: -140, el: 8, dist: 2.6, ty: 1.45 },
        drive: (d) => { d.a.trigger('windup'); d.run('spikeHold', 0.04); },
      },
      {
        id: 'K1b', label: '揮臂擊球（spike 擊球幀）', cam: { az: -140, el: 8, dist: 2.6, ty: 1.5 },
        drive: (d) => {
          d.a.trigger('windup'); d.ticks(11);
          d.a.trigger('spike', { hitInTicks: d.ga.hitLeadTicks('spike') });
          d.run('spike', d.ga.SEQ_HIT.spike * 0.45);
        },
      },
    ],
  },
  {
    id: 'serve', label: '發球拋球／起手',
    keys: [
      {
        id: 'K2a', label: '持球預備（serveReady）', cam: { az: -35, el: 6, dist: 2.4, ty: 1.2 },
        drive: (d) => { d.a.setHold('serveReady'); d.ticks(30); },
      },
      {
        id: 'K2b', label: '起手（serveJump t=0.10 s）', cam: { az: -140, el: 8, dist: 2.6, ty: 1.45 },
        drive: (d) => { d.a.setHold('serveReady'); d.ticks(30); d.a.trigger('serveJump'); d.run('serveJump', 0.10); },
      },
    ],
  },
  {
    id: 'run', label: '跑步擺臂',
    keys: [
      { id: 'K3a', label: '跑步・右臂後擺（5 m/s）', cam: { az: -60, el: 4, dist: 2.4, ty: 1.15 }, drive: (d) => d.runPhase(5.0, 'back') },
      { id: 'K3b', label: '跑步・右臂前擺（5 m/s）', cam: { az: -60, el: 4, dist: 2.4, ty: 1.15 }, drive: (d) => d.runPhase(5.0, 'fwd') },
    ],
  },
  {
    id: 'ready', label: '待命／接球',
    keys: [
      { id: 'K4a', label: '待命（無動作）', cam: { az: -20, el: 4, dist: 2.3, ty: 1.15 }, drive: (d) => { d.ticks(60); } },
      {
        id: 'K4b', label: '接球預備（receiveReady）', cam: { az: -35, el: 6, dist: 2.3, ty: 1.05 },
        drive: (d) => { d.a.trigger('receiveReady'); d.run('receiveReady', 0.3); },
      },
      {
        id: 'K4c', label: '墊球觸球幀（bump）', cam: { az: -35, el: 6, dist: 2.3, ty: 1.05 },
        drive: (d) => {
          d.a.trigger('receiveReady'); d.run('receiveReady', 0.3);
          d.a.trigger('bump'); d.run('bump', d.ga.SEQ_HIT.bump * 0.5);
        },
      },
    ],
  },
];
export const ALL_KEYS = MOMENTS.flatMap((m) => m.keys.map((k) => ({ ...k, moment: m.id, momentLabel: m.label })));

// ---------------------------------------------------------------------------
// 受測者：寫實人（真實 createRealPlayer）與同輸入驅動的參考幾何人（真實 createGeoCharacter）
export function makeReal(mods, asset, { hook = null, id = PROBE_ID } = {}) {
  const p = mods.rp.createRealPlayer(asset, { playerId: id, teamId: 'A', height: 1.85, name: id, number: 7 });
  const anim = mods.ga.createGeoAnimator(p.rig);
  // hook＝函式（animator 之後、蒙皮之前改關節）或 { pre, post }（pre 在 animator 之前）
  const hPre = typeof hook === 'object' && hook ? hook.pre : null;
  const hPost = typeof hook === 'function' ? hook : hook?.post ?? null;
  return {
    kind: 'real', p, rig: p.rig, anim,
    pre() { p.resetLegs(); if (hPre) hPre(p.rig.joints, p); },
    post(bodyY) {
      if (hPost) hPost(p.rig.joints, p);
      p.rig.root.position.y = bodyY;
      p.rig.root.updateMatrixWorld(true);
      p.groundLegs();
      p.rig.root.updateMatrixWorld(true);
    },
  };
}
export function makeGeo(mods, pool, { id = PROBE_ID } = {}) {
  const stub = pool || { claim: (key) => ({ key, index: 0 }) };
  const rig = mods.gc.createGeoCharacter(stub, id, 'A', 1.85, false, id, null, 7);
  const anim = mods.ga.createGeoAnimator(rig);
  return {
    kind: 'geo', rig, anim, pool,
    pre() {},
    post(bodyY) {
      rig.root.position.y = bodyY;
      rig.root.updateMatrixWorld(true);
      if (pool) { for (const part of rig.parts) pool.writeMatrix(part, part.node.matrixWorld); pool.markDirty(); }
    },
  };
}

// 同一組輸入逐幀驅動多個受測者（決定論：同輸入＝同動作狀態）；peek 看第一個
export function driveKey(mods, subjects, key) {
  const step = (dt, speed = 0) => {
    for (const s of subjects) { s.pre(); const y = s.anim.update(dt, speed, 0, 1); s.post(y); }
  };
  const ticks = (n, speed = 0) => { for (let i = 0; i < n; i += 1) step(TICK, speed); };
  const a0 = subjects[0].anim;
  const d = {
    ga: mods.ga,
    a: {
      trigger: (type, opts) => { for (const s of subjects) s.anim.trigger(type, opts); },
      setHold: (type) => { for (const s of subjects) s.anim.setHold(type); },
    },
    ticks,
    run(type, tTarget) {
      let guard = 0;
      while (a0.peek()?.type !== type) { step(TICK); if ((guard += 1) > 600) throw new Error(`等不到 ${type}`); }
      for (;;) {
        const remain = tTarget - a0.peek().t;
        if (remain <= 1e-9) break;
        step(Math.min(TICK, remain));
        if ((guard += 1) > 1200) throw new Error('run 過長');
      }
    },
    // 穩態跑步：暖身 30 tick 後以 speed 跑 60 tick 讓 runW→1，再往後 30 tick 內找右肩 x 的極值幀
    // （x 正＝往後擺）。先用一次性的幾何動畫器試跑定位極值 tick（決定論），再讓受測者走到同一幀
    runPhase(speed, which) {
      const rig = mods.gc.createGeoCharacter({ claim: (key) => ({ key, index: 0 }) }, PROBE_ID, 'A', 1.85, false, PROBE_ID, null, null);
      const scout = mods.ga.createGeoAnimator(rig);
      let bestT = 0; let bestV = which === 'back' ? -Infinity : Infinity;
      for (let t = 0; t < 30 + 60 + 30; t += 1) {
        scout.update(TICK, t < 30 ? 0 : speed, 0, 1);
        if (t >= 30 + 60) {
          const v = rig.joints.rShoulder.rotation.x;
          if (which === 'back' ? v > bestV : v < bestV) { bestV = v; bestT = t; }
        }
      }
      ticks(bestT - 30 + 1, speed); // 受測者已暖身 30 次 update：再跑 bestT−29 次＝試跑的第 bestT 次 update 後
    },
  };
  ticks(30); // 暖身（同 motion-2b-poses）
  key.drive(d);
  return a0.peek();
}

// ---------------------------------------------------------------------------
// 綁定姿勢的區域選取（只看幾何＋地標）
function closestOnSeg(p, a, b) {
  const abx = b[0] - a[0]; const aby = b[1] - a[1]; const abz = b[2] - a[2];
  const t = Math.min(Math.max(((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz)
    / (abx * abx + aby * aby + abz * abz), 0), 1);
  const c = [a[0] + abx * t, a[1] + aby * t, a[2] + abz * t];
  return { t, c, d: Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) };
}
export const REGION = {
  shoulderR: 0.16, // (a) 肩部區：三角形綁定質心距肩地標
  armDist: 0.09, armT: 0.3, // (b) 手臂頂點：距臂軸折線、上臂段參數下限
  torsoX: 0.21, torsoY0: 0.75, torsoY1: 1.55, // (b) 軀幹三角形（修訂 1：原 0.95–1.50）
  sliceX: 0.14, sliceY0: 0.95, sliceY1: 1.53, sliceStep: 0.02, sliceHalf: 0.01, sliceSide: 0.05, // (c)
  twistBand: 0.04, // (c) 關節上下 ±4 cm
  searchMax: 0.25, // (b) 最近點搜尋上限
};
export function bindRegions(asset, L) {
  const g = asset.geometry;
  const P = g.attributes.position.array;
  const index = g.index.array;
  const n = P.length / 3;
  const armSide = new Int8Array(n); // 0＝非手臂、-1＝右臂、+1＝左臂
  const armPart = new Int8Array(n); // 0 上臂、1 前臂、2 手（最近的臂軸段）
  const armVerts = { r: [], l: [] };
  const p = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    p[0] = P[i * 3]; p[1] = P[i * 3 + 1]; p[2] = P[i * 3 + 2];
    const s = p[0] < 0 ? 'r' : 'l';
    const chain = [L[`${s}Shoulder`], L[`${s}Elbow`], L[`${s}Wrist`], L[`${s}HandTip`]];
    let best = null;
    for (let k = 0; k < 3; k += 1) {
      const r = closestOnSeg(p, chain[k], chain[k + 1]);
      if (!best || r.d < best.d) best = { ...r, seg: k };
    }
    if (best.d <= REGION.armDist && (best.seg > 0 || best.t >= REGION.armT)) {
      armSide[i] = s === 'r' ? -1 : 1;
      armPart[i] = best.seg;
      armVerts[s].push(i);
    }
  }
  const nt = index.length / 3;
  const torsoTris = [];
  const shoulderTris = [];
  const shR = [L.rShoulder, L.lShoulder];
  for (let t = 0; t < nt; t += 1) {
    const a = index[t * 3]; const b = index[t * 3 + 1]; const c = index[t * 3 + 2];
    let torso = true;
    for (const v of [a, b, c]) {
      const x = P[v * 3]; const y = P[v * 3 + 1];
      if (Math.abs(x) > REGION.torsoX || y < REGION.torsoY0 || y > REGION.torsoY1 || armSide[v] !== 0) torso = false;
    }
    if (torso) torsoTris.push(t);
    const cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
    const cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
    const cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
    for (const s of shR) {
      if (Math.hypot(cx - s[0], cy - s[1], cz - s[2]) <= REGION.shoulderR) { shoulderTris.push(t); break; }
    }
  }
  // (b) 軀幹子集的邊界邊／邊界頂點（只被一個子集三角形使用的邊）：最近點落在這裡＝無法判定內外
  const edgeCount = new Map();
  const ek = (u, v) => (u < v ? u * 1048576 + v : v * 1048576 + u);
  for (const t of torsoTris) {
    for (let e = 0; e < 3; e += 1) {
      const k = ek(index[t * 3 + e], index[t * 3 + ((e + 1) % 3)]);
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  }
  const boundaryEdge = new Set();
  const boundaryVert = new Uint8Array(n);
  for (const [k, c] of edgeCount) {
    if (c !== 1) continue;
    boundaryEdge.add(k);
    boundaryVert[Math.floor(k / 1048576)] = 1; boundaryVert[k % 1048576] = 1;
  }
  // (c) 軀幹切片
  const slices = [];
  for (let y0 = REGION.sliceY0; y0 <= REGION.sliceY1 + 1e-9; y0 += REGION.sliceStep) {
    const left = []; const right = []; const all = [];
    for (let i = 0; i < n; i += 1) {
      const x = P[i * 3]; const y = P[i * 3 + 1];
      if (Math.abs(y - y0) > REGION.sliceHalf || Math.abs(x) > REGION.sliceX || armSide[i] !== 0) continue;
      all.push(i);
      if (x > REGION.sliceSide) left.push(i); else if (x < -REGION.sliceSide) right.push(i);
    }
    slices.push({ y: Math.round(y0 * 1000) / 1000, left, right, all });
  }
  // B3(a)／A2(e) 手部頂點群：綁定姿勢該側 |x| ≥ max|x| − 0.10；B3(b) 鞋底 y ≤ 0.03
  const hand = { r: [], l: [] };
  let maxR = 0; let maxL = 0;
  for (let i = 0; i < n; i += 1) { const x = P[i * 3]; if (x < 0) maxR = Math.max(maxR, -x); else maxL = Math.max(maxL, x); }
  const sole = [];
  for (let i = 0; i < n; i += 1) {
    const x = P[i * 3];
    if (x < 0 && -x >= maxR - 0.10) hand.r.push(i);
    if (x > 0 && x >= maxL - 0.10) hand.l.push(i);
    if (P[i * 3 + 1] <= 0.03) sole.push(i);
  }
  return { P, index, n, armSide, armPart, armVerts, torsoTris, shoulderTris, slices, hand, sole, boundaryEdge, boundaryVert, ek };
}

// ---------------------------------------------------------------------------
// CPU 蒙皮（three.js SkinnedMesh.applyBoneTransform 同式；mesh 綁定矩陣＝單位、mesh 不掛父層）
export function skinPositions(THREE, player, out = null) {
  const { mesh } = player;
  const sk = mesh.skeleton;
  const g = mesh.geometry;
  const M = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]).elements);
  const P = g.attributes.position.array;
  const SI = g.attributes.skinIndex.array;
  const SW = g.attributes.skinWeight.array;
  const n = P.length / 3;
  const o = out || new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const x = P[i * 3]; const y = P[i * 3 + 1]; const z = P[i * 3 + 2];
    let ox = 0; let oy = 0; let oz = 0;
    for (let k = 0; k < 4; k += 1) {
      const w = SW[i * 4 + k];
      if (!w) continue;
      const e = M[SI[i * 4 + k]];
      ox += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
      oy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      oz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
    o[i * 3] = ox; o[i * 3 + 1] = oy; o[i * 3 + 2] = oz;
  }
  return o;
}
export function vertexNormals(P, index, out = null) {
  const n = P.length / 3;
  const N = out || new Float32Array(n * 3);
  N.fill(0);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3; const b = index[t + 1] * 3; const c = index[t + 2] * 3;
    const ux = P[b] - P[a]; const uy = P[b + 1] - P[a + 1]; const uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a]; const vy = P[c + 1] - P[a + 1]; const vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { N[v] += nx; N[v + 1] += ny; N[v + 2] += nz; }
  }
  for (let i = 0; i < n; i += 1) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
  return N;
}

// ---------------------------------------------------------------------------
// (a) 三角形主拉伸比：變形梯度 F（綁定三角形局部 2D → 姿勢 3D）的奇異值
function triStretch(P0, P1, a, b, c) {
  const e1 = [P0[b * 3] - P0[a * 3], P0[b * 3 + 1] - P0[a * 3 + 1], P0[b * 3 + 2] - P0[a * 3 + 2]];
  const e2 = [P0[c * 3] - P0[a * 3], P0[c * 3 + 1] - P0[a * 3 + 1], P0[c * 3 + 2] - P0[a * 3 + 2]];
  const l1 = Math.hypot(...e1);
  if (l1 < 1e-9) return null;
  const u = e1.map((x) => x / l1);
  const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const ln = Math.hypot(...nrm);
  if (ln < 1e-12) return null;
  const v = [nrm[1] * u[2] - nrm[2] * u[1], nrm[2] * u[0] - nrm[0] * u[2], nrm[0] * u[1] - nrm[1] * u[0]].map((x) => x / ln);
  const bu = e2[0] * u[0] + e2[1] * u[1] + e2[2] * u[2];
  const bv = e2[0] * v[0] + e2[1] * v[1] + e2[2] * v[2];
  const det = l1 * bv;
  if (Math.abs(det) < 1e-12) return null;
  const f1 = [P1[b * 3] - P1[a * 3], P1[b * 3 + 1] - P1[a * 3 + 1], P1[b * 3 + 2] - P1[a * 3 + 2]];
  const f2 = [P1[c * 3] - P1[a * 3], P1[c * 3 + 1] - P1[a * 3 + 1], P1[c * 3 + 2] - P1[a * 3 + 2]];
  const c1 = f1.map((x) => (x * bv) / det);
  const c2 = f1.map((x, k) => (-x * bu + f2[k] * l1) / det);
  const A = c1[0] * c1[0] + c1[1] * c1[1] + c1[2] * c1[2];
  const B = c1[0] * c2[0] + c1[1] * c2[1] + c1[2] * c2[2];
  const C = c2[0] * c2[0] + c2[1] * c2[1] + c2[2] * c2[2];
  const m = (A + C) / 2; const r = Math.sqrt(((A - C) / 2) ** 2 + B * B);
  const edges = [Math.hypot(...f1), Math.hypot(...f2), Math.hypot(f2[0] - f1[0], f2[1] - f1[1], f2[2] - f1[2])];
  return { s1: Math.sqrt(Math.max(m + r, 0)), s2: Math.sqrt(Math.max(m - r, 0)), maxEdge: Math.max(...edges) };
}
export function metricStretch(R, P1) {
  let maxS = 0; let over2 = 0; let crushed = 0; let maxEdge = 0; let over2Area = 0;
  const flagged = []; const all = [];
  for (const t of R.shoulderTris) {
    const a = R.index[t * 3]; const b = R.index[t * 3 + 1]; const c = R.index[t * 3 + 2];
    const s = triStretch(R.P, P1, a, b, c);
    if (!s) continue;
    all.push(s.s1);
    if (s.s1 > maxS) maxS = s.s1;
    if (s.s1 > 2) {
      over2 += 1; flagged.push(t);
      const ux = R.P[b * 3] - R.P[a * 3]; const uy = R.P[b * 3 + 1] - R.P[a * 3 + 1]; const uz = R.P[b * 3 + 2] - R.P[a * 3 + 2];
      const vx = R.P[c * 3] - R.P[a * 3]; const vy = R.P[c * 3 + 1] - R.P[a * 3 + 1]; const vz = R.P[c * 3 + 2] - R.P[a * 3 + 2];
      over2Area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    if (s.s2 < 0.5) crushed += 1;
    if (s.maxEdge > maxEdge) maxEdge = s.maxEdge;
  }
  all.sort((x, y) => x - y);
  const p99 = all.length ? all[Math.min(all.length - 1, Math.floor(0.99 * all.length))] : 0;
  return { tris: R.shoulderTris.length, maxStretch: maxS, p99, over2, over2AreaCm2: over2Area * 1e4, crushed, maxEdge, flagged };
}

// ---------------------------------------------------------------------------
// (b) 手臂穿入軀幹：最近點＋內插頂點法線定號
function closestPointTri(p, a, b, c) {
  // Ericson, Real-Time Collision Detection 5.1.5
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
export function metricPenetration(R, P1, N1) {
  const nt = R.torsoTris.length;
  const bb = new Float32Array(nt * 6);
  R.torsoTris.forEach((t, k) => {
    let mnx = Infinity; let mny = Infinity; let mnz = Infinity; let mxx = -Infinity; let mxy = -Infinity; let mxz = -Infinity;
    for (let e = 0; e < 3; e += 1) {
      const v = R.index[t * 3 + e] * 3;
      mnx = Math.min(mnx, P1[v]); mny = Math.min(mny, P1[v + 1]); mnz = Math.min(mnz, P1[v + 2]);
      mxx = Math.max(mxx, P1[v]); mxy = Math.max(mxy, P1[v + 1]); mxz = Math.max(mxz, P1[v + 2]);
    }
    bb.set([mnx, mny, mnz, mxx, mxy, mxz], k * 6);
  });
  const out = {};
  const inside = { arm: [], torso: [] };
  for (const s of ['r', 'l']) {
    let maxDepth = 0; let count = 0; let deep = 0; let undetermined = 0;
    const zones = {};
    for (const i of R.armVerts[s]) {
      const p = [P1[i * 3], P1[i * 3 + 1], P1[i * 3 + 2]];
      let best2 = REGION.searchMax * REGION.searchMax; let bt = -1; let bw = null;
      for (let k = 0; k < nt; k += 1) {
        const o = k * 6;
        const dx = Math.max(bb[o] - p[0], 0, p[0] - bb[o + 3]);
        const dy = Math.max(bb[o + 1] - p[1], 0, p[1] - bb[o + 4]);
        const dz = Math.max(bb[o + 2] - p[2], 0, p[2] - bb[o + 5]);
        if (dx * dx + dy * dy + dz * dz >= best2) continue;
        const t = R.torsoTris[k];
        const ia = R.index[t * 3]; const ib = R.index[t * 3 + 1]; const ic = R.index[t * 3 + 2];
        const A = [P1[ia * 3], P1[ia * 3 + 1], P1[ia * 3 + 2]];
        const B = [P1[ib * 3], P1[ib * 3 + 1], P1[ib * 3 + 2]];
        const C = [P1[ic * 3], P1[ic * 3 + 1], P1[ic * 3 + 2]];
        const w = closestPointTri(p, A, B, C);
        const q = [0, 1, 2].map((d) => w[0] * A[d] + w[1] * B[d] + w[2] * C[d]);
        const d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d2 < best2) { best2 = d2; bt = t; bw = { w, q }; }
      }
      if (bt < 0) continue;
      const ia = R.index[bt * 3]; const ib = R.index[bt * 3 + 1]; const ic = R.index[bt * 3 + 2];
      // 最近點落在子集邊界（邊界邊或邊界頂點）＝無法判定（修訂 1）
      const tv = [ia, ib, ic];
      const zero = bw.w.map((x) => x < 1e-6);
      const nZero = zero.filter(Boolean).length;
      if (nZero === 1) {
        const k = zero.indexOf(true);
        if (R.boundaryEdge.has(R.ek(tv[(k + 1) % 3], tv[(k + 2) % 3]))) { undetermined += 1; continue; }
      } else if (nZero === 2) {
        if (R.boundaryVert[tv[zero.indexOf(false)]]) { undetermined += 1; continue; }
      }
      const nx = bw.w[0] * N1[ia * 3] + bw.w[1] * N1[ib * 3] + bw.w[2] * N1[ic * 3];
      const ny = bw.w[0] * N1[ia * 3 + 1] + bw.w[1] * N1[ib * 3 + 1] + bw.w[2] * N1[ic * 3 + 1];
      const nz = bw.w[0] * N1[ia * 3 + 2] + bw.w[1] * N1[ib * 3 + 2] + bw.w[2] * N1[ic * 3 + 2];
      const sd = (p[0] - bw.q[0]) * nx + (p[1] - bw.q[1]) * ny + (p[2] - bw.q[2]) * nz;
      if (sd < 0) {
        const depth = Math.sqrt(best2);
        // 分區：手臂部位 × 最近軀幹面的綁定高度（胸 ≥1.15、腹 0.95–1.15、臀／大腿 <0.95）
        const by = (R.P[ia * 3 + 1] + R.P[ib * 3 + 1] + R.P[ic * 3 + 1]) / 3;
        const zk = `${['上臂', '前臂', '手'][R.armPart[i]]}→${by >= 1.15 ? '胸' : by >= 0.95 ? '腹' : '臀腿'}`;
        const zz = zones[zk] || (zones[zk] = { n: 0, max: 0 });
        zz.n += 1; zz.max = Math.max(zz.max, depth);
        count += 1;
        if (depth > 0.01) deep += 1;
        if (depth > maxDepth) maxDepth = depth;
        inside.arm.push(i);
        inside.torso.push(ia, ib, ic);
      }
    }
    out[s] = { armVerts: R.armVerts[s].length, maxDepth, inside: count, deeper1cm: deep, undetermined, zones };
  }
  return { ...out, flagged: inside };
}

// ---------------------------------------------------------------------------
// (c) 脊椎旋轉分布
function swingTwist(THREE, q) {
  // twist 軸＝局部 Y
  const tw = new THREE.Quaternion(0, q.y, 0, q.w);
  const l = Math.hypot(tw.y, tw.w);
  if (l < 1e-9) return { twist: 180, swing: 2 * Math.acos(Math.min(Math.abs(q.w), 1)) * DEG };
  tw.set(0, q.y / l, 0, q.w / l);
  const twist = 2 * Math.atan2(tw.y, tw.w) * DEG;
  const sw = q.clone().multiply(tw.clone().invert());
  const swing = 2 * Math.acos(Math.min(Math.abs(sw.w), 1)) * DEG;
  return { twist, swing };
}
export function metricSpineJoints(THREE, rig) {
  const out = {};
  for (const b of ['pelvis', 'spine', 'spineUpper']) {
    const st = swingTwist(THREE, rig.joints[b].quaternion);
    out[b] = { twist: st.twist, swing: st.swing };
  }
  return out;
}
// 4×4 對稱矩陣 Jacobi 特徵分解：回傳最大特徵值的特徵向量
function maxEigen4(A) {
  const a = A.map((r) => r.slice());
  const V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let off = 0;
    for (let p = 0; p < 4; p += 1) for (let q = p + 1; q < 4; q += 1) off += a[p][q] * a[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < 4; p += 1) {
      for (let q = p + 1; q < 4; q += 1) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1); const sn = t * c;
        for (let k = 0; k < 4; k += 1) {
          const akp = a[k][p]; const akq = a[k][q];
          a[k][p] = c * akp - sn * akq; a[k][q] = sn * akp + c * akq;
        }
        for (let k = 0; k < 4; k += 1) {
          const apk = a[p][k]; const aqk = a[q][k];
          a[p][k] = c * apk - sn * aqk; a[q][k] = sn * apk + c * aqk;
        }
        for (let k = 0; k < 4; k += 1) {
          const vkp = V[k][p]; const vkq = V[k][q];
          V[k][p] = c * vkp - sn * vkq; V[k][q] = sn * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let k = 1; k < 4; k += 1) if (a[k][k] > a[best][best]) best = k;
  return [V[0][best], V[1][best], V[2][best], V[3][best]];
}
// Horn（1987）四元數法：綁定點集 → 姿勢點集的最佳剛體旋轉，回傳 [w, x, y, z]
function hornRotation(B, Q, ids) {
  const cb = [0, 0, 0]; const cq = [0, 0, 0];
  for (const i of ids) for (let d = 0; d < 3; d += 1) { cb[d] += B[i * 3 + d]; cq[d] += Q[i * 3 + d]; }
  for (let d = 0; d < 3; d += 1) { cb[d] /= ids.length; cq[d] /= ids.length; }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const i of ids) {
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) S[r][c] += (B[i * 3 + r] - cb[r]) * (Q[i * 3 + c] - cq[c]);
  }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const q = maxEigen4(N);
  const l = Math.hypot(...q);
  return { q: q.map((x) => x / l), c: cq };
}
const qMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qInv = (a) => [a[0], -a[1], -a[2], -a[3]];
const qAngle = (a) => 2 * Math.acos(Math.min(Math.abs(a[0]), 1)) * DEG;
const wrap = (d) => ((d + 540) % 360) - 180;
export function metricSpineSkin(R, P1, spineUpperY = 1.39, spineY = 1.121) {
  const rows = [];
  for (const s of R.slices) {
    if (s.all.length < 8) continue;
    const { q, c } = hornRotation(R.P, P1, s.all);
    // swing–twist（twist 軸＝世界 Y）
    const tl = Math.hypot(q[0], q[2]);
    const tw = tl < 1e-9 ? [1, 0, 0, 0] : [q[0] / tl, 0, q[2] / tl, 0];
    const twist = wrap(2 * Math.atan2(tw[2], tw[0]) * DEG);
    const swing = qAngle(qMul(q, qInv(tw)));
    rows.push({ y: s.y, q, twist, swing, c });
  }
  let maxJump = 0; let maxJumpY = null; let maxFold = 0; let maxFoldY = null;
  for (let k = 1; k < rows.length; k += 1) {
    const d = wrap(rows[k].twist - rows[k - 1].twist);
    if (Math.abs(d) > Math.abs(maxJump)) { maxJump = d; maxJumpY = (rows[k].y + rows[k - 1].y) / 2; }
    const rel = qAngle(qMul(rows[k].q, qInv(rows[k - 1].q))); // 相鄰片相對旋轉（扭＋彎）
    if (rel > maxFold) { maxFold = rel; maxFoldY = (rows[k].y + rows[k - 1].y) / 2; }
  }
  const total = rows.length ? wrap(rows[rows.length - 1].twist - rows[0].twist) : 0;
  const band = (y0) => {
    let acc = 0;
    for (let k = 1; k < rows.length; k += 1) {
      const ym = (rows[k].y + rows[k - 1].y) / 2;
      if (Math.abs(ym - y0) <= REGION.twistBand + 1e-9) acc += wrap(rows[k].twist - rows[k - 1].twist);
    }
    return acc;
  };
  return {
    slices: rows.length, total, maxJump, maxJumpY, maxFold, maxFoldY,
    shareUpper: Math.abs(total) > 3 ? band(spineUpperY) / total : null,
    shareSpine: Math.abs(total) > 3 ? band(spineY) / total : null,
    profile: rows.map((r) => [r.y, Math.round(r.twist * 10) / 10, Math.round(r.swing * 10) / 10]),
  };
}

// ---------------------------------------------------------------------------
// (d) 權重統計（讀 asset 的 skinIndex／skinWeight，對照綁定幾何）
export const JOINT_PAIRS = [
  ['pelvis', 'spine', 'spine', 'spineUpper'],
  ['spine', 'spineUpper', 'spineUpper', 'neck'],
  ['spineUpper', 'neck', 'neck', 'headTop'],
  ['spineUpper', 'rShoulder', 'rShoulder', 'rElbow'],
  ['rShoulder', 'rElbow', 'rElbow', 'rWrist'],
  ['rElbow', 'rWrist', 'rWrist', 'rHandTip'],
  ['pelvis', 'rHip', 'rHip', 'rKnee'],
  ['rHip', 'rKnee', 'rKnee', 'rAnkle'],
  ['rKnee', 'rAnkle', 'rAnkle', 'rToe'],
];
export function metricWeights(asset, bones, L, extraPairs = []) {
  const g = asset.geometry;
  const P = g.attributes.position.array;
  const SI = g.attributes.skinIndex.array;
  const SW = g.attributes.skinWeight.array;
  const n = P.length / 3;
  let multi2 = 0; let multi3 = 0;
  const wOf = (i, b) => { let w = 0; for (let k = 0; k < 4; k += 1) if (SI[i * 4 + k] === b && SW[i * 4 + k] > 0) w += SW[i * 4 + k]; return w; };
  for (let i = 0; i < n; i += 1) {
    let c = 0;
    for (let k = 0; k < 4; k += 1) if (SW[i * 4 + k] >= 0.05) c += 1;
    if (c >= 2) multi2 += 1;
    if (c >= 3) multi3 += 1;
  }
  const pairs = {};
  for (const [pa, ch, a0, a1] of [...JOINT_PAIRS, ...extraPairs]) {
    const bp = bones.indexOf(pa); const bc = bones.indexOf(ch);
    if (bp < 0 || bc < 0) continue;
    const o = L[a0]; const e = L[a1];
    const ax = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
    const al = Math.hypot(...ax);
    const u = ax.map((x) => x / al);
    const proj = []; const bins = new Map();
    for (let i = 0; i < n; i += 1) {
      const wp = wOf(i, bp); const wc = wOf(i, bc);
      const s = (P[i * 3] - o[0]) * u[0] + (P[i * 3 + 1] - o[1]) * u[1] + (P[i * 3 + 2] - o[2]) * u[2];
      if (wp >= 0.05 && wc >= 0.05) proj.push(s);
      if (wp + wc >= 0.5 && Math.abs(s) < 0.4) {
        const k = Math.round(s * 100);
        const cur = bins.get(k) || [0, 0];
        cur[0] += wc / (wp + wc); cur[1] += 1;
        bins.set(k, cur);
      }
    }
    proj.sort((x, y) => x - y);
    const pct = (q) => (proj.length ? proj[Math.min(proj.length - 1, Math.floor(q * proj.length))] : null);
    const keys = [...bins.keys()].sort((x, y) => x - y);
    let s10 = null; let s90 = null;
    for (const k of keys) {
      const [sum, cnt] = bins.get(k);
      if (cnt < 3) continue;
      const m = sum / cnt;
      if (s10 === null && m >= 0.1) s10 = k;
      if (s90 === null && m >= 0.9) s90 = k;
    }
    // 局部銳利度：沿網格邊的子骨權重比例梯度（只看至少一端在 5%–95% 之間的邊）
    const grads = [];
    const idx = asset.geometry.index.array;
    const fr = (i) => { const wp = wOf(i, bp); const wc = wOf(i, bc); return wp + wc >= 0.5 ? wc / (wp + wc) : null; };
    const seen = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      for (let e = 0; e < 3; e += 1) {
        const i = idx[t + e]; const j = idx[t + ((e + 1) % 3)];
        const key = i < j ? i * 1048576 + j : j * 1048576 + i;
        if (seen.has(key)) continue;
        seen.add(key);
        const fi = fr(i); const fj = fr(j);
        if (fi === null || fj === null) continue;
        if (!((fi > 0.05 && fi < 0.95) || (fj > 0.05 && fj < 0.95))) continue;
        const len = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
        if (len > 1e-6) grads.push(Math.abs(fi - fj) / len);
      }
    }
    grads.sort((x, y) => x - y);
    const g90 = grads.length ? grads[Math.floor(0.9 * (grads.length - 1))] : null;
    pairs[`${pa}→${ch}`] = {
      localWidthCm: g90 ? (0.8 / g90) * 100 : null,
      blendVerts: proj.length,
      bandCm: proj.length ? (pct(0.95) - pct(0.05)) * 100 : 0,
      transitionCm: s10 !== null && s90 !== null ? s90 - s10 : null,
    };
  }
  return { verts: n, multi2: multi2 / n, multi3: multi3 / n, pairs };
}

// ---------------------------------------------------------------------------
// 2A 驗收的相關量（B3(a) 手部質心離腕、B3(b) 鞋底最低、B5 背號到最近蒙皮頂點）
export function metric2A(THREE, R, P1, player) {
  const { joints } = player.rig;
  const out = {};
  for (const s of ['r', 'l']) {
    const ids = R.hand[s];
    const c = [0, 0, 0];
    for (const i of ids) { c[0] += P1[i * 3]; c[1] += P1[i * 3 + 1]; c[2] += P1[i * 3 + 2]; }
    for (let k = 0; k < 3; k += 1) c[k] /= ids.length;
    const w = joints[`${s}Wrist`].getWorldPosition(new THREE.Vector3());
    out[`hand_${s}`] = Math.hypot(c[0] - w.x, c[1] - w.y, c[2] - w.z);
  }
  let sole = Infinity;
  for (const i of R.sole) sole = Math.min(sole, P1[i * 3 + 1]);
  out.soleMin = sole;
  const slots = player.rig.numberSlots;
  if (slots) {
    for (const k of ['back', 'front']) {
      const q = slots[k].node.getWorldPosition(new THREE.Vector3());
      let best = Infinity;
      for (let i = 0; i < R.n; i += 1) {
        const d = (P1[i * 3] - q.x) ** 2 + (P1[i * 3 + 1] - q.y) ** 2 + (P1[i * 3 + 2] - q.z) ** 2;
        if (d < best) best = d;
      }
      out[`plate_${k}`] = Math.sqrt(best);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 幾何人參考：手臂膠囊頂點落在軀幹／骨盆膠囊內的深度（膠囊 SDF 在部件局部座標算，
// 再乘該方向的縮放近似回世界距離）。只當對照，不當判準
export function geoPenetration(THREE, geoRig, geoms) {
  const parts = geoRig.parts;
  const bodies = parts.filter((p) => p.key === 'torso' || p.key === 'hips').map((p) => ({
    key: p.key, inv: p.node.matrixWorld.clone().invert(), m: p.node.matrixWorld,
    r: geoms[p.key].parameters.radius, h: geoms[p.key].parameters.height / 2,
  }));
  const out = { r: { maxDepth: 0, inside: 0, samples: 0 }, l: { maxDepth: 0, inside: 0, samples: 0 } };
  const v = new THREE.Vector3(); const lp = new THREE.Vector3();
  for (const p of parts) {
    if (p.key !== 'upperArm' && p.key !== 'forearm') continue;
    const side = p.node.getWorldPosition(new THREE.Vector3()).x < 0 ? 'r' : 'l';
    const pos = geoms[p.key].attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(p.node.matrixWorld);
      out[side].samples += 1;
      let worst = 0;
      for (const b of bodies) {
        lp.copy(v).applyMatrix4(b.inv);
        const cy = Math.min(Math.max(lp.y, -b.h), b.h);
        const dx = lp.x; const dy = lp.y - cy; const dz = lp.z;
        const dist = Math.hypot(dx, dy, dz);
        const sdLocal = dist - b.r;
        if (sdLocal < 0) {
          // 局部 → 世界：沿梯度方向的縮放
          const gdir = new THREE.Vector3(dx, dy, dz).normalize();
          const sc = new THREE.Vector3(); b.m.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
          const f = Math.hypot(gdir.x * sc.x, gdir.y * sc.y, gdir.z * sc.z);
          worst = Math.max(worst, -sdLocal * f);
        }
      }
      if (worst > 0) { out[side].inside += 1; out[side].maxDepth = Math.max(out[side].maxDepth, worst); }
    }
  }
  return out;
}
export function geoSpineYaw(THREE, geoRig) {
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const yawOf = (name) => { geoRig.joints[name].getWorldQuaternion(q); e.setFromQuaternion(q, 'YXZ'); return e.y * DEG; };
  return { torsoCapsule: yawOf('spine'), chest: yawOf('spineUpper') };
}

// ---------------------------------------------------------------------------
// 一個關鍵幀的全部指標（寫實）＋可選幾何對照
export function measureKey(mods, asset, R, key, { hook = null, geoms = null } = {}) {
  const { THREE } = mods;
  const real = makeReal(mods, asset, { hook });
  const geo = makeGeo(mods, null);
  const pk = driveKey(mods, [real, geo], key);
  const P1 = skinPositions(THREE, real.p);
  const N1 = vertexNormals(P1, R.index);
  const a = metricStretch(R, P1);
  const b = metricPenetration(R, P1, N1);
  const c = { joints: metricSpineJoints(THREE, real.rig), skin: metricSpineSkin(R, P1) };
  const twoA = metric2A(THREE, R, P1, real.p);
  // (d) 逐時刻：本幀 (a)(b) 標出的問題頂點中，多骨影響（≥2 骨且 w≥0.05）的比例——問題區是不是剛性綁定
  const SW = asset.geometry.attributes.skinWeight.array;
  const prob = new Set(b.flagged.arm);
  for (const t of a.flagged) for (let e = 0; e < 3; e += 1) prob.add(R.index[t * 3 + e]);
  let multi = 0;
  for (const i of prob) { let c = 0; for (let k = 0; k < 4; k += 1) if (SW[i * 4 + k] >= 0.05) c += 1; if (c >= 2) multi += 1; }
  const dKey = { problemVerts: prob.size, multiFrac: prob.size ? multi / prob.size : null };
  const geoRef = geoms ? { pen: geoPenetration(THREE, geo.rig, geoms), yaw: geoSpineYaw(THREE, geo.rig) } : null;
  return { key: key.id, seq: pk?.type ?? null, t: pk?.t ?? null, a, b, c, d: dKey, twoA, geo: geoRef, P1, real, geoSubject: geo };
}

// ---------------------------------------------------------------------------
// 實驗用逐幀掛勾（animator 寫完、蒙皮前改寫實人的關節；只作用在寫實人）。node 量測與截圖台共用
export function makeHooks(THREE) {
  const RAD = Math.PI / 180;
  const v = new THREE.Vector3(); const q = new THREE.Quaternion(); const q2 = new THREE.Quaternion();
  // 上臂在 spineUpper 框架中與「正下方」的夾角（rad）：只看 animator 寫的肩 Euler（animator 假設父層＝spineUpper）
  const armElevation = (joints, side) => {
    v.set(0, -1, 0).applyEuler(joints[`${side}Shoulder`].rotation);
    return Math.acos(Math.min(Math.max(-v.y, -1), 1));
  };
  // 己：綁定零姿勢修正——手臂下垂時肩外展 deg，隨抬舉角 cos φ 淡出（舉到水平以上歸零，不改高舉動作）
  const restAbduct = (deg) => (joints) => {
    for (const side of ['r', 'l']) {
      const k = Math.max(0, Math.cos(armElevation(joints, side)));
      joints[`${side}Shoulder`].rotation.z += (side === 'r' ? -1 : 1) * deg * RAD * k;
    }
  };
  // 乙-2：胸椎扭轉（spineUpper.y）分 share 到 spine（animator 每幀都會重寫這兩個值，無累積）
  const twistSplit = (share) => (joints) => {
    const cy = joints.spineUpper.rotation.y;
    joints.spine.rotation.y += cy * share;
    joints.spineUpper.rotation.y = cy * (1 - share);
  };
  // 乙-1：鎖骨／肩帶骨（需要鎖骨變體模組）。ε＝肩帶上提角：上臂抬舉 φ 超過 startDeg 後線性增加，
  // φ＝startDeg+spanDeg 時達 maxDeg；盂肱局部旋轉反向補償＝上臂世界方向不變，只有肩關節中心隨肩帶上移。
  // pre：animator 只寫肩的 x/z，補償寫進去的 y 要在 animator 前歸零（否則殘留到下一幀與慣性過渡快照）
  // 預設 maxDeg 15°＝Ludewig et al. 2004（JOSPT 34(3):140）上舉全程鎖骨上提 11–15° 的上限；startDeg 30°＝Inman 1944 外展 setting phase
  const clavicle = ({ maxDeg = 15, startDeg = 30, spanDeg = 150 } = {}) => ({
    pre: (joints) => { joints.rShoulder.rotation.y = 0; joints.lShoulder.rotation.y = 0; },
    post: (joints) => {
      for (const side of ['r', 'l']) {
        const clav = joints[`${side}Clav`];
        const sh = joints[`${side}Shoulder`];
        const phi = armElevation(joints, side) / RAD;
        const e = Math.min(Math.max((phi - startDeg) / spanDeg, 0), 1) * maxDeg * RAD;
        clav.rotation.set(0, 0, (side === 'r' ? -1 : 1) * e); // 右側外端（−X）上抬＝繞 +Z 轉 −ε
        q.setFromEuler(sh.rotation);
        q2.copy(clav.quaternion).invert().multiply(q);
        sh.quaternion.copy(q2);
      }
    },
  });
  const chain = (...hs) => {
    const pres = hs.map((h) => (typeof h === 'object' ? h.pre : null)).filter(Boolean);
    const posts = hs.map((h) => (typeof h === 'function' ? h : h.post));
    return { pre: (j, p) => pres.forEach((f) => f(j, p)), post: (j, p) => posts.forEach((f) => f(j, p)) };
  };
  return { armElevation, restAbduct, twistSplit, clavicle, chain };
}

// ---------------------------------------------------------------------------
// 白模本身：拓樸（焊接後的非流形邊、開口邊、分離塊）與「融合」幾何——
// 水平截面的封閉迴圈：腋下由上往下掃，手臂截面第一次自成一圈的高度＝腋窩頂；
// 胯下由下往上掃，兩腿截面最後一次各自成圈的高度＝兩腿分開處。
export function meshFusion(asset, L) {
  const g = asset.geometry;
  const P = g.attributes.position.array;
  const idx = g.index.array;
  const n = P.length / 3;
  // 依位置焊接（glb 可能在 UV 縫拆點）
  const key = new Map(); const weld = new Int32Array(n);
  let uniq = 0;
  for (let i = 0; i < n; i += 1) {
    const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`;
    if (!key.has(k)) key.set(k, uniq++);
    weld[i] = key.get(k);
  }
  const pos = new Float64Array(uniq * 3);
  for (let i = 0; i < n; i += 1) for (let d = 0; d < 3; d += 1) pos[weld[i] * 3 + d] = P[i * 3 + d];
  const tris = [];
  let degenerate = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = weld[idx[t]]; const b = weld[idx[t + 1]]; const c = weld[idx[t + 2]];
    if (a === b || b === c || a === c) { degenerate += 1; continue; }
    tris.push([a, b, c]);
  }
  const ek = (u, v) => (u < v ? u * 1048576 + v : v * 1048576 + u);
  const edgeUse = new Map();
  for (const [a, b, c] of tris) for (const [u, v] of [[a, b], [b, c], [c, a]]) edgeUse.set(ek(u, v), (edgeUse.get(ek(u, v)) || 0) + 1);
  let open = 0; let nonManifold = 0;
  for (const c of edgeUse.values()) { if (c === 1) open += 1; else if (c > 2) nonManifold += 1; }
  // 分離塊
  const parent = new Int32Array(uniq).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [a, b, c] of tris) { parent[find(b)] = find(a); parent[find(c)] = find(a); }
  const comps = new Map();
  for (let i = 0; i < uniq; i += 1) comps.set(find(i), (comps.get(find(i)) || 0) + 1);
  // 截面迴圈
  function section(c0) {
    const c = c0 + 1e-7;
    const up = new Map(); const pts = new Map();
    const f2 = (x) => { if (!up.has(x)) up.set(x, x); let r = x; while (up.get(r) !== r) r = up.get(r); up.set(x, r); return r; };
    for (const tri of tris) {
      const hit = [];
      for (const [u, v] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
        const yu = pos[u * 3 + 1]; const yv = pos[v * 3 + 1];
        if ((yu - c) * (yv - c) < 0) {
          const k = ek(u, v);
          if (!pts.has(k)) {
            const s = (c - yu) / (yv - yu);
            pts.set(k, [pos[u * 3] + (pos[v * 3] - pos[u * 3]) * s, c0, pos[u * 3 + 2] + (pos[v * 3 + 2] - pos[u * 3 + 2]) * s]);
          }
          hit.push(k);
        }
      }
      if (hit.length === 2) { const ra = f2(hit[0]); const rb = f2(hit[1]); if (ra !== rb) up.set(ra, rb); }
    }
    const loops = new Map();
    for (const [k, p] of pts) {
      const r = f2(k);
      if (!loops.has(r)) loops.set(r, { n: 0, xmin: Infinity, xmax: -Infinity, sx: 0 });
      const o = loops.get(r);
      o.n += 1; o.xmin = Math.min(o.xmin, p[0]); o.xmax = Math.max(o.xmax, p[0]); o.sx += p[0];
    }
    return [...loops.values()].map((o) => ({ n: o.n, xmin: o.xmin, xmax: o.xmax, cx: o.sx / o.n }));
  }
  // 腋下：由肩往下掃，找手臂自成一圈的最高高度；同時記錄該高度以下手臂圈與軀幹圈的最小水平間距
  const armpit = {};
  for (const s of ['r', 'l']) {
    const sg = s === 'r' ? -1 : 1;
    let apex = null; const trace = [];
    for (let y = L.rShoulder[1]; y >= 1.0; y -= 0.005) {
      const loops = section(y);
      const arm = loops.filter((o) => sg * o.cx > 0.2 && sg * (sg > 0 ? o.xmin : o.xmax) > 0.14);
      const torso = loops.filter((o) => o.xmin < -0.05 && o.xmax > 0.05);
      const sep = arm.length > 0 && torso.length > 0;
      if (sep && apex === null) apex = y;
      if (Math.abs((y * 100) % 2) < 0.26 || (apex !== null && Math.abs(y - apex) < 1e-9)) {
        const t = torso[0]; const a = arm[0];
        const gap = sep ? (sg < 0 ? t.xmin - a.xmax : a.xmin - t.xmax) : null;
        trace.push({ y: Math.round(y * 1000) / 1000, loops: loops.length, sep, gap: gap == null ? null : Math.round(gap * 1000) / 1000, torsoHalf: t ? Math.round((sg < 0 ? -t.xmin : t.xmax) * 1000) / 1000 : null });
      }
    }
    armpit[s] = { apexY: apex, belowShoulder: apex == null ? null : L.rShoulder[1] - apex, trace };
  }
  // 胯下：由下往上掃，兩腿各自成圈的最高高度（排除 |cx|>0.3 的手）
  let legSplit = null; const legTrace = [];
  for (let y = 0.55; y <= 1.0; y += 0.005) {
    const loops = section(y).filter((o) => Math.abs(o.cx) < 0.3);
    const right = loops.filter((o) => o.xmax < 0.02 && o.cx < 0);
    const left = loops.filter((o) => o.xmin > -0.02 && o.cx > 0);
    const spanning = loops.filter((o) => o.xmin < -0.05 && o.xmax > 0.05);
    const separate = right.length > 0 && left.length > 0 && spanning.length === 0;
    if (separate) legSplit = y;
    if (Math.abs((y * 100) % 2) < 0.26) legTrace.push({ y: Math.round(y * 1000) / 1000, loops: loops.length, separate });
  }
  return {
    verts: n, weldedVerts: uniq, tris: tris.length, degenerate, openEdges: open, nonManifoldEdges: nonManifold,
    components: [...comps.values()].sort((a, b) => b - a),
    armpit, crotch: { legSplitY: legSplit, crotchLandmark: L.crotch[1], shortsHem: L.shortsHem[1], trace: legTrace },
  };
}
