#!/usr/bin/env node
// 寫實球員卷 第二階段 2B 動工前交付物 D0：排球動作「文獻 vs 現況」量測腳本（只量、不改 src/）
//
// 做什麼：用**真實**的 createGeoCharacter＋createGeoAnimator 驅動各技術序列，停在每個
// 關鍵階段，讀關節**世界座標**，依各文獻自己的角度定義算角度，再和文獻平均值比。
// 不讀 POSES 的弧度欄位——兩者座標系與定義不同（docs/kickoffs/real-player-stage2-match.md §四）。
//
// 用法（在 repo 根目錄）：
//   node tools/motion-d0-measure.mjs                 量測＋自我檢查，寫 docs/experiments/motion-d0-measure.json
//   node tools/motion-d0-measure.mjs --md            另把產生的對照表區塊印到 stdout
//   node tools/motion-d0-measure.mjs --write-table   把產生的區塊寫進 motion-d0-table.md 的標記區間
//   node tools/motion-d0-measure.mjs --check         比對 motion-d0-table.md 標記區間與本次產出是否逐字相同
// 自我檢查（已知角度）任一項誤差 > 1°（長度 > 1 mm）→ exit 1，且不寫任何檔。
//
// 座標約定（geoCharacter.js:3-5）：角色面向 +Z（網在 +Z 方向）、頭 +Y、**右手側＝−X**。
// 本腳本 root 不轉向、不水平位移；root.y＝animator.update 的回傳值 bodyY（同 matchView 的用法），
// 所以角色矢狀面＝世界 YZ 平面、網＝世界 X 軸方向。比賽中另有 matchView 的夠球補償
// （reachAssist，rally 中最多再加軀幹 0.30 rad、肩 0.55 rad）與魚躍根旋轉，本腳本**不含**，
// 量的是 geoAnimator 的純姿勢；寫實人另有腿部 IK（realPlayer.js），本腳本量的是 IK 前的幾何骨架。
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGeoAnimator, SEQ_HIT, hitLeadTicks } from '../src/render/geoAnimator.js';
import { createGeoPool, createGeoCharacter, BASE_H } from '../src/render/geoCharacter.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = resolve(ROOT, 'docs/experiments/motion-d0-measure.json');
const TABLE_MD = resolve(ROOT, 'docs/experiments/motion-d0-table.md');
// 產生區塊兩段：table＝對照表與圖例；appendix＝附錄 A（自我檢查）與附錄 B（sim 綁定項）
const MARKS = {
  table: ['<!-- d0:table:begin（本區塊由 tools/motion-d0-measure.mjs --write-table 產生，勿手改） -->', '<!-- d0:table:end -->'],
  appendix: ['<!-- d0:appendix:begin（本區塊由 tools/motion-d0-measure.mjs --write-table 產生，勿手改） -->', '<!-- d0:appendix:end -->'],
};
const TICK = 1 / 60;
const PROBE_NAME = 'D0Probe'; // isLeftHanded('D0Probe','D0Probe')===false → 右手（makeCtx 內斷言）
const HEIGHT = BASE_H;        // 1.85 m＝root 縮放 1；角度與等比縮放無關，長度類另除以身高
const DEG = 180 / Math.PI;

// SEQUENCES 的非擊球關鍵幀時間（geoAnimator 未導出，照抄並附行號；擊球幀一律用導出的 SEQ_HIT）。
// 改了序列要同步這裡——JSON 與表頭都記 src 檔 sha1，src 一變 --check 就會紅。
const KEY_AT = {
  overheadLoadEnd: 0.42, // geoAnimator.js:162 overhead { at: 0.42, p: 'setReach' }（推出前最後一個 setReach）
  serveHit: 0.5,         // geoAnimator.js:236 serve { at: 0.5, p: 'spikeHit' }
  serveJumpHit: 0.4,     // geoAnimator.js:239 serveJump { at: 0.4, p: 'spikeHit' }
  serveFloatHit: 0.45,   // geoAnimator.js:240 serveFloat { at: 0.45, p: 'floatPush' }
};
const RELEASE_S = 0.2;   // geoAnimator.js:381 RELEASE_MS（只用來在幀說明裡寫出權重）

// ─────────────────────────── 1. 骨架與驅動（真實引擎） ───────────────────────────

function makeCtx() {
  const scene = new THREE.Scene();
  const pool = createGeoPool(scene, false, 1);
  const rig = createGeoCharacter(pool, PROBE_NAME, 'A', HEIGHT, false, PROBE_NAME);
  scene.add(rig.root);
  if (rig.handed !== 'r') throw new Error(`探針球員 ${PROBE_NAME} 不是右手（handed=${rig.handed}）`);
  const anim = createGeoAnimator(rig);
  rig.root.updateMatrixWorld(true);
  return { rig, anim, scene };
}

// 一幀＝animator.update → root.y＝bodyY → 更新世界矩陣（matchView.js:407、:470 同序）
function step(c, dt, speed = 0) {
  const bodyY = c.anim.update(dt, speed, 0, 1);
  c.rig.root.position.y = bodyY;
  c.rig.root.updateMatrixWorld(true);
  return bodyY;
}
function stepTicks(c, n, speed = 0) { for (let i = 0; i < n; i += 1) step(c, TICK, speed); }

// 走到序列 type 的播放時刻 tTarget（秒）：先整 tick 前進直到該序列在播（例如 windup 播完
// 自動接 spikeHold），再以最後一個「不足一 tick」的步長精準落在 tTarget。
// 斷言播放倍率＝1（本腳本的幀定義都假設原速；擊球弧的壓縮倍率見 geoAnimator startSeq）。
function runTo(c, type, tTarget, speed = 0) {
  let guard = 0;
  while (c.anim.peek()?.type !== type) {
    step(c, TICK, speed);
    guard += 1;
    if (guard > 600) throw new Error(`等不到序列 ${type}（目前 ${c.anim.peek()?.type ?? '閒置'}）`);
  }
  for (;;) {
    const pk = c.anim.peek();
    const remain = tTarget - pk.t;
    if (remain <= 1e-9) break;
    const dt = Math.min(TICK, remain);
    step(c, dt, speed);
    const after = c.anim.peek();
    if (!after || after.type !== type) throw new Error(`${type} 在 t=${tTarget} 之前就結束了`);
    if (Math.abs(after.t - pk.t - dt) > 1e-9) throw new Error(`${type} 播放倍率≠1，幀定義失效`);
    guard += 1;
    if (guard > 1200) throw new Error('runTo 迴圈過長');
  }
  const t = c.anim.peek().t;
  if (Math.abs(t - tTarget) > 1e-6) throw new Error(`${type} 未落在 t=${tTarget}（實際 ${t}）`);
}

// ─────────────────────────── 2. 取點（世界座標） ───────────────────────────
// 關節點＝各關節 Group 的世界原點；另補 4 個由關節局部座標換算的點（偏移值照抄 geoCharacter.js）：
//   踝 rAnkle/lAnkle＝膝局部 (0,−0.44,0)：鞋盒中心高度（:227 鞋在膝下 −0.44），取在脛骨軸線上
//   頭心 headC＝頸局部 (0,0.14,0)（:247）
//   手軸點 rHandAx/lHandAx＝腕局部 (0,−0.1,0)：只代表腕關節轉後的「手軸方向」；幾何人手掌是
//     以腕為球心的球體（:263-264），腕角在幾何人上看不見（寫實人才看得到）
const JOINTS = ['pelvis', 'spine', 'spineUpper', 'neck', 'rShoulder', 'lShoulder', 'rElbow', 'lElbow',
  'rWrist', 'lWrist', 'rHip', 'lHip', 'rKnee', 'lKnee'];
// 質心代理：幾何節段中心 × Dempster 節段質量比（Winter《Biomechanics and Motor Control of Human
// Movement》表 4.1 的常用值，本卷**未重開原書核對**＝未核實常數，只作助跑「重心下降」的代理量）。
// 節段中心＝各膠囊平移後的幾何中心（geoCharacter.js:112-115、:236、:247、:227）。
const SEGMENTS = [
  ['頭頸', 0.081, 'neck', [0, 0.14, 0]],
  ['胸腹（torso 膠囊）', 0.355, 'spine', [0, 0.26, 0]],
  ['骨盆（hips 膠囊）', 0.142, 'pelvis', [0, 0, 0]],
  ['右上臂', 0.028, 'rShoulder', [0, -0.21, 0]], ['左上臂', 0.028, 'lShoulder', [0, -0.21, 0]],
  ['右前臂', 0.016, 'rElbow', [0, -0.19, 0]], ['左前臂', 0.016, 'lElbow', [0, -0.19, 0]],
  ['右手', 0.006, 'rWrist', [0, 0, 0]], ['左手', 0.006, 'lWrist', [0, 0, 0]],
  ['右大腿', 0.1, 'rHip', [0, -0.26, 0]], ['左大腿', 0.1, 'lHip', [0, -0.26, 0]],
  ['右小腿', 0.0465, 'rKnee', [0, -0.25, 0]], ['左小腿', 0.0465, 'lKnee', [0, -0.25, 0]],
  ['右足', 0.0145, 'rKnee', [0, -0.44, 0.05]], ['左足', 0.0145, 'lKnee', [0, -0.44, 0.05]],
];

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function points(rig) {
  rig.root.updateMatrixWorld(true);
  const j = rig.joints;
  const P = {};
  for (const n of JOINTS) P[n] = j[n].getWorldPosition(v3());
  P.rAnkle = j.rKnee.localToWorld(v3(0, -0.44, 0));
  P.lAnkle = j.lKnee.localToWorld(v3(0, -0.44, 0));
  P.headC = j.neck.localToWorld(v3(0, 0.14, 0));
  P.rHandAx = j.rWrist.localToWorld(v3(0, -0.1, 0));
  P.lHandAx = j.lWrist.localToWorld(v3(0, -0.1, 0));
  const com = v3();
  for (const [, m, jn, off] of SEGMENTS) com.addScaledVector(j[jn].localToWorld(v3(...off)), m);
  P.com = com; // 質量比總和＝1
  return P;
}

// ─────────────────────────── 3. 角度定義（代號見 DEFS） ───────────────────────────
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
function angleBetween(a, b) {
  const d = a.length() * b.length();
  return d < 1e-12 ? NaN : Math.acos(clamp1(a.dot(b) / d)) * DEG;
}
const sub = (a, b) => a.clone().sub(b);
const sag = (v) => v3(0, v.y, v.z); // 矢狀面投影（丟 X）
function included3D(a, b, c) { return angleBetween(sub(a, b), sub(c, b)); }
function included2D(a, b, c) { return angleBetween(sag(sub(a, b)), sag(sub(c, b))); }
// 線段 a→b 相對鉛直向上的前傾角（矢狀面；正＝往 +Z 前傾）
function inclFromUp(a, b) { const d = sub(b, a); return Math.atan2(d.z, d.y) * DEG; }
// 線段 a→b 相對鉛直向下的前擺角（矢狀面；正＝往 +Z 前擺，即屈）
function inclFromDown(a, b) { const d = sub(b, a); return Math.atan2(d.z, -d.y) * DEG; }

// 軀幹座標系（ASMI 定義用）：T＝髖中點→肩中點；R＝左肩→右肩對 T 正交化（指向角色右側）；
// F＝T×R（右手座標：上×右＝前，零姿勢時＝+Z）
function trunkFrame(P) {
  const hipMid = P.rHip.clone().add(P.lHip).multiplyScalar(0.5);
  const shMid = P.rShoulder.clone().add(P.lShoulder).multiplyScalar(0.5);
  const T = sub(shMid, hipMid).normalize();
  const Rraw = sub(P.rShoulder, P.lShoulder);
  const R = Rraw.sub(T.clone().multiplyScalar(Rraw.dot(T))).normalize();
  const F = T.clone().cross(R).normalize();
  return { T, R, F };
}
// 擊球側（右）上臂相對軀幹：冠狀面外展、3D 上舉角、水平內收、矢狀面肩屈
function shoulderVsTrunk(P) {
  const { T, R, F } = trunkFrame(P);
  const U = sub(P.rElbow, P.rShoulder);
  const down = T.clone().negate();
  const Uf = U.clone().sub(F.clone().multiplyScalar(U.dot(F)));  // 投影到冠狀面 span(T,R)
  const Ut = U.clone().sub(T.clone().multiplyScalar(U.dot(T)));  // 投影到橫切面 span(R,F)
  const Us = U.clone().sub(R.clone().multiplyScalar(U.dot(R)));  // 投影到矢狀面 span(T,F)
  const flex = Math.atan2(Us.dot(F), Us.dot(down)) * DEG;        // 0＝下垂、90＝前平舉、180＝上舉
  return {
    abdFrontal: angleBetween(Uf, down),
    elev3D: angleBetween(U, down),
    hAdd: Math.atan2(Ut.dot(F), Ut.dot(R)) * DEG,                 // 0＝上臂在冠狀面、正＝往前
    hAddProjRatio: Ut.length() / U.length(),                      // 橫切面投影長度比（小＝該角不穩）
    shFlexSag: flex < -90 ? flex + 360 : flex,
    elbowFlex: 180 - included3D(P.rShoulder, P.rElbow, P.rWrist),
  };
}
// 肩線／髖線對網角（Zahálka 2017）：水平投影後與網（世界 X 軸）夾角。定向：180°＝與網平行；
// ψ＝擊球側（右）在後（離網遠）為正，角＝180−ψ。
function netLine(pHit, pOther) {
  const hx = pHit.x - pOther.x;
  const hz = pHit.z - pOther.z;
  const psi = Math.atan2(-hz, -hx) * DEG; // 右側在 −X：平行時 (−hx>0, hz=0) → ψ=0
  return 180 - psi;
}
// 腕：手軸相對前臂的彎角，帶世界前後號（正＝手往 +Z／朝網方向彎）
function wristBend(P) {
  const f = sub(P.rWrist, P.rElbow).normalize();
  const h = sub(P.rHandAx, P.rWrist).normalize();
  const perp = h.clone().sub(f.clone().multiplyScalar(h.dot(f)));
  const sign = perp.length() < 1e-9 ? 0 : Math.sign(perp.z);
  return sign * angleBetween(f, h);
}

function metrics(P) {
  const sh = shoulderVsTrunk(P);
  const shLine = netLine(P.rShoulder, P.lShoulder);
  const hipLine = netLine(P.rHip, P.lHip);
  return {
    head: inclFromUp(P.neck, P.headC),
    trunk: inclFromUp(P.rHip, P.rShoulder),
    upperArm: inclFromDown(P.rShoulder, P.rElbow),
    elbow2D: included2D(P.rShoulder, P.rElbow, P.rWrist),
    elbow3D: included3D(P.rShoulder, P.rElbow, P.rWrist),
    thigh: inclFromDown(P.rHip, P.rKnee),
    knee2D: included2D(P.rHip, P.rKnee, P.rAnkle),
    knee3D: included3D(P.rHip, P.rKnee, P.rAnkle),
    ...sh,
    shLine,
    hipLine,
    sep: hipLine - shLine,
    wristSpan: P.rWrist.distanceTo(P.lWrist),
    shoulderSpan: P.rShoulder.distanceTo(P.lShoulder),
    wristBend: wristBend(P),
    comY: P.com.y,
    pelvisY: P.pelvis.y,
  };
}

// ─────────────────────────── 4. 遊戲幀（技術 × 關鍵階段） ───────────────────────────
// 每一幀都從全新骨架開始（先待命 0.5 s），照比賽中的觸發鏈驅動；w＝動作層權重（由
// geoAnimator.js:600-602 的公式推得，寫在說明欄）。擊球幀一律取 t＝SEQ_HIT×dur（擊球關鍵幀；
// matchLoop 以 hitLeadTicks 提前觸發讓它落在 sim 觸球 tick，取整誤差 ≤0.5 tick）。
const FRAME_DEFS = [
  {
    id: 'bump-start', seqLabel: 'receiveReady t=0.30 s',
    how: '接球預備 receiveReady 撐住段（兩關鍵幀皆 bumpReady），即 bump 觸發前一幀', w: '1',
    drive(c) { c.anim.trigger('receiveReady'); runTo(c, 'receiveReady', 0.3); },
  },
  {
    id: 'bump-contact', seqLabel: 'bump t=hit×dur',
    how: 'receiveReady 撐 0.30 s 後觸發 bump，停在擊球關鍵幀 bumpHit', w: '1（預備段交棒 w0=1）',
    drive(c) {
      c.anim.trigger('receiveReady'); runTo(c, 'receiveReady', 0.3);
      c.anim.trigger('bump'); runTo(c, 'bump', SEQ_HIT.bump * c.anim.peek().dur);
    },
  },
  {
    id: 'bump-end', seqLabel: 'bump t=dur−1 tick',
    how: '同上，停在 bump 最後一幀（遊戲無隨揮姿勢：at=1 回 bumpReady，且已在 RELEASE 淡出）',
    w: `${(TICK / RELEASE_S).toFixed(3)}（(dur−t)/RELEASE）`,
    drive(c) {
      c.anim.trigger('receiveReady'); runTo(c, 'receiveReady', 0.3);
      c.anim.trigger('bump'); const { dur } = c.anim.peek(); runTo(c, 'bump', dur - TICK);
    },
  },
  {
    id: 'set-load', seqLabel: 'overhead t=0.42×dur',
    how: 'setReady 撐 0.30 s 後觸發 overhead，停在推出前最後一個 setReach 關鍵幀', w: '1（交棒 w0=1）',
    drive(c) {
      c.anim.trigger('setReady'); runTo(c, 'setReady', 0.3);
      c.anim.trigger('overhead'); runTo(c, 'overhead', KEY_AT.overheadLoadEnd * c.anim.peek().dur);
    },
  },
  {
    id: 'set-push', seqLabel: 'overhead t=hit×dur',
    how: '同上，停在擊球關鍵幀 setPush', w: '1',
    drive(c) {
      c.anim.trigger('setReady'); runTo(c, 'setReady', 0.3);
      c.anim.trigger('overhead'); runTo(c, 'overhead', SEQ_HIT.overhead * c.anim.peek().dur);
    },
  },
  {
    id: 'spike-wind', seqLabel: 'spikeHold t=0.04 s',
    how: 'windup 起跳（0.1 s）自動接滯空 hold spikeHold，停在 hold 內（姿勢＝spikeWind 引臂）', w: '1（chain 交棒）',
    drive(c) { c.anim.trigger('windup'); runTo(c, 'spikeHold', 0.04); },
  },
  {
    id: 'spike-hit', seqLabel: 'spike t=hit×dur',
    how: 'windup 後 11 tick 觸發擊球弧 spike（hitInTicks=11，倍率 1），停在擊球關鍵幀 spikeHit', w: '1（airborne 交棒）',
    drive(c) {
      c.anim.trigger('windup'); stepTicks(c, 11);
      c.anim.trigger('spike', { hitInTicks: hitLeadTicks('spike') });
      runTo(c, 'spike', SEQ_HIT.spike * c.anim.peek().dur);
    },
  },
  {
    id: 'tip-hit', seqLabel: 'tip t=hit×dur',
    how: 'windup 後 12 tick 觸發 tip（hitInTicks=10，倍率 1），停在擊球關鍵幀 tipHit', w: '1（airborne 交棒）',
    drive(c) {
      c.anim.trigger('windup'); stepTicks(c, 12);
      c.anim.trigger('tip', { hitInTicks: hitLeadTicks('tip') });
      runTo(c, 'tip', SEQ_HIT.tip * c.anim.peek().dur);
    },
  },
  {
    id: 'block-top', seqLabel: 'blockJump t=0.20 s',
    how: '攔網待命 hold 中觸發 blockJump，停在跳躍弧頂（airDur 0.4 的一半；姿勢在 blockPunch→blockUp 的 7.7% 處）', w: '1',
    drive(c) { c.anim.setHold('block'); stepTicks(c, 6); c.anim.trigger('blockJump'); runTo(c, 'blockJump', 0.2); },
  },
  {
    id: 'servejump-hit', seqLabel: 'serveJump t=0.40×dur',
    how: 'serveReady 持球 hold 中觸發 serveJump，停在 spikeHit 關鍵幀（此序列無 hit 欄位；sim 的擊球＝SERVE 事件在序列 t=0）', w: '1',
    drive(c) {
      c.anim.setHold('serveReady'); stepTicks(c, 6);
      c.anim.trigger('serveJump'); runTo(c, 'serveJump', KEY_AT.serveJumpHit * c.anim.peek().dur);
    },
  },
  {
    id: 'servefloat-hit', seqLabel: 'serveFloat t=0.45×dur',
    how: '同上觸發 serveFloat，停在 floatPush 關鍵幀（sim 擊球在序列 t=0）', w: '1',
    drive(c) {
      c.anim.setHold('serveReady'); stepTicks(c, 6);
      c.anim.trigger('serveFloat'); runTo(c, 'serveFloat', KEY_AT.serveFloatHit * c.anim.peek().dur);
    },
  },
  {
    id: 'serve-hit', seqLabel: 'serve t=0.50×dur',
    how: '同上觸發一般發球 serve，停在 spikeHit 關鍵幀（sim 擊球在序列 t=0）', w: '1',
    drive(c) {
      c.anim.setHold('serveReady'); stepTicks(c, 6);
      c.anim.trigger('serve'); runTo(c, 'serve', KEY_AT.serveHit * c.anim.peek().dur);
    },
  },
];

function captureFrame(def) {
  const c = makeCtx();
  stepTicks(c, 30); // 待命 0.5 s（決定論：相位與呼吸皆由固定步長決定）
  def.drive(c);
  const pk = c.anim.peek();
  const P = points(c.rig);
  return {
    id: def.id, seqLabel: def.seqLabel, how: def.how, w: def.w,
    seq: pk?.type ?? null, t: pk?.t ?? null, dur: pk?.dur ?? null, tNorm: pk?.tNorm ?? null,
    rootY: c.rig.root.position.y,
    m: metrics(P),
    P: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v.toArray()])),
  };
}

// 助跑三步（approach3）重心最低點：站定待命 1 s 取站姿質心 → 以 speed 跑 0.5 s（跑姿權重
// 收斂）→ 觸發 approach3、持續以 speed 餵入，取序列內質心最低的一幀。步相擺腿與下沉都乘
// runW（geoAnimator.js:646），所以結果隨 matchView 餵的速度而變——主值取文獻首步速度 2.55 m/s。
function approachComDrop(speed) {
  const c = makeCtx();
  stepTicks(c, 60, 0);
  const standComY = points(c.rig).com.y;
  const standPelvisY = c.rig.joints.pelvis.getWorldPosition(v3()).y;
  stepTicks(c, 30, speed);
  c.anim.trigger('approach3');
  let best = null;
  for (let i = 0; i < 120; i += 1) {
    step(c, TICK, speed);
    const pk = c.anim.peek();
    if (!pk || pk.type !== 'approach3') break;
    const P = points(c.rig);
    if (!best || P.com.y < best.comY) best = { comY: P.com.y, pelvisY: P.pelvis.y, t: pk.t, tNorm: pk.tNorm };
  }
  const drop = standComY - best.comY;
  return {
    speed, standComY, minComY: best.comY, atT: best.t, atTNorm: best.tNorm,
    drop, dropPct: (100 * drop) / HEIGHT,
    pelvisDrop: standPelvisY - best.pelvisY,
  };
}

// sim 綁定項（Q4-2，本卷不改）的現況：峰值 bodyY 與 bodyY>2 cm 的時間
function arcOf(type, opts = null) {
  const c = makeCtx();
  stepTicks(c, 30);
  c.anim.trigger(type, opts);
  let peak = -Infinity;
  let tPeak = 0;
  let above = 0;
  for (let i = 1; i <= 150; i += 1) {
    const y = step(c, TICK, 0);
    if (y > peak) { peak = y; tPeak = i * TICK; }
    if (y > 0.02) above += TICK;
  }
  return { type, peak, tPeak, airAbove2cm: above };
}

// ─────────────────────────── 5. 文獻、定義、裁定、列 ───────────────────────────

const SRC = {
  RH1987: {
    name: 'Ridgway & Hamilton 1987',
    cite: 'Ridgway ME, Hamilton N. The Kinematics of Forearm Passing in Low Skilled and High Skilled Volleyball Players. ISBS 1987 論文集 pp.227–236',
    url: 'https://ojs.ub.uni-konstanz.de/cpa/article/view/2336/2167',
    sample: '女性；高技術 HS＝NCAA D-I n=7、低技術 LS＝國中/JV n=7；每人 3 次；16 mm 底片 200 fps、攝影機垂直矢狀面（2D）、身體右側節段端點',
    checked: '下載原 PDF（掃描＋OCR 文字層），Table 2（PDF 第 5 頁、印刷頁 231）以頁面影像逐格目視核對；方法段逐字：肘、膝角＝「關節與相鄰關節連線所夾」；頭、軀幹、上臂、大腿＝「相對鉛直、繞各自關節」的傾角。任務單所列 19.8／172／147／50.7 全屬 **HS 組觸球瞬間**',
  },
  LZ2026: {
    name: 'Lanzani et al. 2026',
    cite: 'Lanzani V, Brambilla C, Moscatelli N, Scano A. A Protocol for the Biomechanical Evaluation of the Types of Setting Motions in Volleyball Based on Kinematics and Muscle Synergies. Methods Protoc 2026;9(1):6',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12821510/',
    sample: '**n=1**（女、27 歲、1.60 m、區域 D 級、非職業舉球員）；實驗室**無球**模擬、雙腳不離地、IMU 100 Hz；每種舉球 10 次；只給「約」值，無受試者間 SD',
    checked: 'PMC 全文結果段逐字：pipe 收勢肩屈約 150°；quick「雙臂上舉時肘屈約 60°→再屈到約 100°→收勢約 70°」；fast/seven「肘屈約 100° 裝填→收勢約 40°」；肩旋轉峰值約 60° 屬 high back／back-row（對角）、fast 約 50°。原筆記把「快球約 60°」寫成肩的角度＝**錯置**（那是肘）',
  },
  OZ2019: {
    name: 'Ozawa et al. 2019',
    cite: 'Ozawa Y, Uchiyama S, Ogawara K, Kanosue K, Yamada H. Biomechanical analysis of volleyball overhead pass. Sports Biomech 2021;20(7):844–857（2019 線上）',
    url: 'https://pubmed.ncbi.nlm.nih.gov/31066350/',
    sample: '熟練／非熟練兩組（摘要未給人數）；EMG＋動作',
    checked: 'PubMed 摘要（eutils 取回全文摘要）：觸球期分拉（球降到最低點前）、推兩期；拉期腕呈背伸但腕屈肌活性高於伸肌＝腕的伸張—收縮循環。**無角度數字**；全文未取得',
  },
  ZH2017: {
    name: 'Zahálka et al. 2017',
    cite: 'Zahálka F, Malý T, Malá L, Ejem M, Zawartka M. Kinematic Analysis of Volleyball Attack in the Net Center with Various Types of Take-Off. J Hum Kinet 2017;58:261–271',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5548173/',
    sample: '男、捷克頂級聯賽 n=12（身高 196.6±5.6 cm），分一般助跑 RA／goofy 助跑 GA 兩組；3 台 50 fps 攝影機 3D DLT；中間快攻 set No.54；角度與速度多為**平均曲線讀值、無 SD**',
    checked: 'PMC 全文逐字＋圖 5 影像：「肩角／髖角」＝**左右肩（髖）連線相對網的水平夾角**（171°≈與網平行），不是肩關節屈曲；最大後擺 RA 肩 105°／髖 157°；擊球 RA 肩 137°／髖 157°、GA 肩 150°／髖 164°；重心自起始下降約 0.25 m；首步約 2.55 m/s；最大垂直速度 RA 2.91、GA 2.96 m/s。**這篇不是 Wagner 2009**（Wagner 只是其參考文獻 24）',
  },
  RS2010: {
    name: 'Reeser et al. 2010',
    cite: 'Reeser JC, Fleisig GS, Bolt B, Ruan M. Upper Limb Biomechanics During the Volleyball Serve and Spike. Sports Health 2010;2(5):368–374（ResearchGate 231215653 同一篇，該站 403）',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3445065/',
    sample: '女、NCAA D-I n=14（1.78±0.08 m；13 右手 1 左手）；跳發只有 n=5；8 台 240 Hz 3D；每技術 5 次',
    checked: 'PMC 全文 Table 2 逐格核對（擊球瞬間肩外展、肘屈、肩水平內收；最大外旋）。**原筆記「cocking 期外旋約 90°」原文查無**：Table 2 最大外旋為 160±10（斜線扣）、163±10（直線扣）、164±11（跳發）、158±12（飄球）、129±32（吊球）。角度定義原文只寫「as previously described」（引 Dillman 1993 等，未取得），以同團隊 ASMI2022 圖說佐證',
  },
  ASMI2022: {
    name: 'Diffendaffer et al. 2022（ASMI 定義佐證）',
    cite: "Diffendaffer AZ, Bagwell MS, Fleisig GS, et al. The Clinician's Guide to Baseball Pitching Biomechanics. Sports Health 2023;15(2):274–281",
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9950989/',
    sample: '（定義來源，非排球數據）',
    checked: '圖 5 圖說逐字：Shoulder abduction is measured as the angle between the upper arm and trunk in the frontal plane；圖 6：external rotation＝上臂繞長軸旋轉。水平內收的正式定義本卷未取得原文，採 ASMI 慣用「上臂在軀幹橫切面相對肩線的前移角」＝推定',
  },
  FK2014: {
    name: 'Ficklin et al. 2014',
    cite: 'Ficklin T, Lund R, Schipper M. A Comparison of Jump Height, Takeoff Velocities, and Blocking Coverage in the Swing and Traditional Volleyball Blocking Techniques. J Sports Sci Med 2014;13(1):78–83',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3918571/',
    sample: '女、NCAA D-I n=9；60 Hz 2D；每法 3 次',
    checked: 'PMC 全文結果段逐字：垂直起跳速度 揮臂式 2.73±0.19、傳統 2.51±0.21 m/s；質心跳高 0.38±0.05／0.32±0.05 m；雙手在網上時間 0.46±0.04／0.40±0.04 s；傳統式助跑時雙手「中立地放在肩前」。**無關節角度**',
  },
  HH2007: {
    name: 'Huang & Hu 2007',
    cite: 'Huang C, Hu L-H. Kinematic Analysis of Volleyball Jump Topspin and Float Serve. XXV ISBS Symposium 2007（Ouro Preto）pp.333–336',
    url: 'https://ojs.ub.uni-konstanz.de/cpa/article/view/476/416',
    sample: '男、國家隊（台灣、委內瑞拉）跳發 n=13（193.3±6.1 cm）、跳飄 n=3；120 Hz 2D；每人 1 次',
    checked: 'PDF 文字層 Table 3 版面錯位，以 pdfminer 座標逐列對齊後核對：垂直起跳速度 跳發 3.3±0.4、跳飄 2.6±0.2 m/s；質心跳高 54.3±9.1／26.7±4.5 cm；擊球高度 303.8±28.2／297.4±32.6 cm（與內文 303.8／297.4 一致）',
  },
  JVA: {
    name: 'JVA（beach）',
    cite: 'Junior Volleyball Association. 5 Keys to Forearm Passing in Beach Volleyball',
    url: 'https://jvavolleyball.org/5-keys-to-forearm-passing-in-beach-volleyball/',
    sample: '教學文章（定性）',
    checked: '逐字：extend your arms and put the heels of your hands together presenting a solid platform',
  },
  IYV: {
    name: 'Improve Your Volley',
    cite: 'The Dig and Dive Volleyball Digging Using The Sprawl And The Extension',
    url: 'https://www.improveyourvolley.com/dig-and-dive-volleyball.html',
    sample: '教學文章（定性）',
    checked: '逐字：sprawl＝比跨步更快地降到地面，把防守平台手臂伸到球下方。無數字',
  },
  LEB2025: {
    name: 'Lebedew 2025',
    cite: 'Mark Lebedew. How the Pancake Destroyed Defence（2025-08-01）',
    url: 'https://marklebedew.com/2025/08/01/how-the-pancake-destroyed-defence/',
    sample: '教練評論（定性）',
    checked: '逐字：pancake＝手掌貼地讓球從手上彈起；經典 dive 為「誇張的背弓與撐接」完全離地。無數字',
  },
  BLOCKREF: {
    name: 'docs/blocking-reference.md §5',
    cite: '本 repo 內部參考文件（未附外部來源）',
    url: 'docs/blocking-reference.md:64-74',
    sample: '內部文件',
    checked: '逐字：肩膀鎖緊上聳、手臂盡量打直伸過網；手掌張開、虎口對齊肩寬。**不是文獻**，只作定性',
  },
};

const STATUS = {
  V: '✅ 已核實',
  VD: '⚠️ 數字已核實；定義依同團隊文獻推定',
  VA: '⚠️ 已核實（原文約值、n=1）',
  VX: '⚠️ 推導值（由已核實數字換算）',
  Q: '定性（無數字）',
  N: '查無',
};

const DEFS = {
  'D-head': '頭前傾（矢狀面投影）：頸關節→頭心連線相對鉛直向上；0＝正直，正＝前傾（屈），負＝後仰。點：neck、headC',
  'D-trunk': '軀幹前傾（矢狀面投影）：右髖關節→右肩關節連線相對鉛直向上；正＝前傾。點：rHip、rShoulder（原文為身體右側節段端點）',
  'D-uarm': '上臂前擺（矢狀面投影）：右肩→右肘連線相對鉛直向下；0＝下垂、90＝前平舉，正＝往前。點：rShoulder、rElbow',
  'D-elbow': '肘角（矢狀面投影）：右肩—右肘—右腕三點夾角，180°＝伸直。點：rShoulder、rElbow、rWrist',
  'D-thigh': '大腿前擺（矢狀面投影）：右髖→右膝連線相對鉛直向下；正＝往前（髖屈）。點：rHip、rKnee',
  'D-knee': '膝角（矢狀面投影）：右髖—右膝—右踝三點夾角，180°＝伸直。點：rHip、rKnee、rAnkle',
  'D-span': '雙腕間距：左右腕關節世界座標距離（m）；對照肩寬 = 左右肩關節距離。點：rWrist、lWrist',
  'D-elflex': '肘屈（3D）：180° −（右肩—右肘—右腕 3D 夾角）；0＝完全伸直。點：rShoulder、rElbow、rWrist',
  'D-abd': '肩外展（ASMI：上臂與軀幹在冠狀面的夾角）：軀幹縱軸 T＝髖中點→肩中點；右向 R＝左肩→右肩對 T 正交化；前向 F＝T×R。上臂 U＝右肩→右肘投影到 span(T,R) 後與 −T 的夾角；0＝垂於體側、90＝側平舉、180＝正上舉。點：rHip、lHip、rShoulder、lShoulder、rElbow',
  'D-hadd': '肩水平內收（ASMI 慣用，推定）：U 投影到軀幹橫切面 span(R,F)，自 R（往擊球側外側）量到 F 的角；0＝上臂在冠狀面內、正＝往前。點同 D-abd',
  'D-shflex': '肩屈（矢狀面，相對軀幹）：U 投影到 span(T,F) 後自 −T 往 F 量；0＝下垂、90＝前平舉、180＝正上舉。點同 D-abd（原文 IMU 軟體輸出、未給精確定義）',
  'D-shline': '肩線對網角（Zahálka）：左右肩關節連線的水平投影與網（世界 X 軸）夾角；180°＝與網平行，<180＝擊球側（右）肩在後。**假設 root 正對網**（比賽中朝向由 matchView facingTarget 決定）。點：rShoulder、lShoulder',
  'D-hipline': '髖線對網角：同 D-shline，改用左右髖關節。點：rHip、lHip',
  'D-sep': '髖肩分離：髖線角 − 肩線角（正＝肩比髖多轉向後，X-factor 方向）。與 root 朝向無關',
  'D-wrist': '腕：手軸（腕局部 −Y）相對前臂（肘→腕）的彎角，正＝手往前（+Z，朝網）彎、負＝往後倒。幾何人看不見（手掌是以腕為心的球體），寫實人看得見。點：rElbow、rWrist、rHandAx',
  'D-comdrop': '助跑重心下降：站定待命（速度 0）質心高 − approach3 期間質心最低高，除以身高（%）。質心＝幾何節段中心 × Dempster 節段質量比（常數未核實，代理量）；另報骨盆關節下降',
  'D-2C': '肩關節最大外旋（上臂繞長軸旋轉）：現有骨架**無此自由度**（2C 的 shoulder.y），不量',
};

const RULINGS = {
  'R-none-prep': '無姿勢裁定。僅時序：1310aa5／8aa8b2e（07-28「兩次抬手」→預備段撐住＋交棒，geoAnimator.js:294-299）；姿勢值自 2eebe75（07-22）建立，ec8efc7（07-28）只加 spineUp／wrist 欄位',
  'R-none-spike': '無姿勢裁定。姿勢值出自 1fd5da6（07-28 依「扣球動作重製」工單 §5 撰寫）後未再改；07-30「三段式」為結構／時序裁定（geoAnimator.js:175、docs/kickoffs/phase5-w2-kickoff-v2.md:70,84）；docs/phase4_7-actions-status.md:132 列為「待 Sawmah 試玩」，查無試玩後結論',
  'R-tip': '無試玩紀錄；但這組吊球姿勢是**你本人的帳號**在 09-10 直接加進來的（commit fcd15cb，沒有 Claude 共同作者標記、英文訊息，不是 Claude Code 的產出），所以當作你已經決定過，保守起見視同裁定',
  'R-block': '**試玩裁定**：aafd231（07-30）「Sawmah 試玩裁定原窄手型較好看」寬臂案否決、z→0＝雙手在肩正上方（當時以身高 1.75 m 量得跨距 0.426 m；本表探針身高 1.85 m 量得 0.450 m，0.450×1.75/1.85＝0.426，是同一個姿勢）、同輪 FK 實測「肘角 0 全直」；geoAnimator.js:73-84。另 07-27「單人攔網感」：block hold t=0 必須是舉手 blockUp（geoAnimator.js:248-250、docs/phase4_5B-status.md:242-246）',
  'R-none-serve': '無姿勢裁定。82f22fb（07-24「Sawmah 回饋」）新增三式分化動畫＝回饋觸發的新功能，未記原話、無角度否決；之後數值未改',
  'R-none-approach': '無姿勢裁定。5518279（07-28「原地左右左右跳舞」）只加 stepW=runW 權重閘門，STEP_CROUCH／approachBack 數值自 def75f0／77a4c30 建立後未改。注意連動：docs/real-player-stage1-acceptance.md:38（A10 寫實人 IK 須保住 geo 蹲深）',
  'R-dive': '**試玩裁定**：3bcb6e5（07-23「Sawmah 回報動作太奇怪」→前撲 DIVE_LUNGE 1.35 m、前傾 DIVE_TILT 1.2 rad、diveReach／diveSprawl 現值）、451cd70（「像殭屍」→divePush）、c07bae6（「爬起太快」Sawmah 拍板純視覺）；geoAnimator.js:327-331、matchView.js:35-36',
  'R-na': '—',
};

// 列：metric＝FRAME 的量測鍵；kind＝angle｜qual｜2C｜comdrop｜none
const ROWS = [];
function addRow(r) { ROWS.push({ kind: 'angle', ...r }); }

// ── A 低手接球（RH1987 HS 組為主，LS 附註）；字串照原文 Table 2 的小數位 ──
const RH = {
  start: { head: ['7.23', '5.52', '3.87', '1.96'], trunk: ['28.46', '6.91', '15.15', '4.26'], uarm: ['9.06', '6.15', '10.21', '5.19'],
    elbow: ['158.83', '11.59', '151.34', '7.76'], thigh: ['46.29', '6.42', '46.56', '4.55'], knee: ['134.82', '7.48', '125.61', '10.40'] },
  contact: { head: ['2.19', '4.91', '-2.46', '3.67'], trunk: ['19.84', '10.19', '8.75', '4.66'], uarm: ['50.71', '6.13', '58.03', '7.89'],
    elbow: ['172.44', '5.08', '161.29', '7.46'], thigh: ['30.68', '9.28', '31.56', '4.23'], knee: ['147.38', '10.61', '143.18', '11.74'] },
  end: { head: ['-6.50', '10.03', '-10.12', '5.3'], trunk: ['20.02', '11.31', '4.41', '6.28'], uarm: ['85.66', '10.82', '95.86', '11.43'],
    elbow: ['170.22', '6.39', '166.62', '9.25'], thigh: ['18.76', '7.19', '22.84', '7.03'], knee: ['158.91', '11.19', '154.31', '13.89'] },
};
const RH_VARS = [
  ['head', '頭傾角', 'D-head', 'head'], ['trunk', '軀幹前傾', 'D-trunk', 'trunk'], ['uarm', '上臂前擺', 'D-uarm', 'upperArm'],
  ['elbow', '肘角', 'D-elbow', 'elbow2D'], ['thigh', '大腿前擺', 'D-thigh', 'thigh'], ['knee', '膝角', 'D-knee', 'knee2D'],
];
const RH_PHASE = [['start', '起始（準備期末、最大屈）', 'bump-start'], ['contact', '觸球', 'bump-contact'], ['end', '收勢（隨揮末）', 'bump-end']];
for (const [ph, phLabel, frame] of RH_PHASE) {
  for (const [k, label, def, metric] of RH_VARS) {
    const [m, sd, lm, lsd] = RH[ph][k];
    addRow({
      id: `bump.${ph}.${k}`, tech: '低手接球', phase: phLabel, frame, variable: label, def, metric,
      lit: { mean: Number(m), sd: Number(sd), shown: `${m}±${sd}` }, src: 'RH1987', status: 'V',
      note: `HS 組；LS 組 ${lm}±${lsd}`, ruling: 'R-none-prep',
    });
  }
}
addRow({
  id: 'bump.contact.span', tech: '低手接球', phase: '觸球', frame: 'bump-contact', variable: '雙腕間距（平台）', def: 'D-span',
  metric: 'wristSpan', kind: 'qual', unit: 'm', lit: { text: '雙手掌根併攏成平台（≈0）' }, src: 'JVA', status: 'Q',
  note: '見「量測中的發現 1」', ruling: 'R-none-prep',
});

// ── B 高手舉球（LZ2026 n=1；OZ2019 定性） ──
addRow({ id: 'set.load.elflex', tech: '高手舉球', phase: '裝填（最大肘屈）', frame: 'set-load', variable: '肘屈', def: 'D-elflex', metric: 'elbowFlex',
  lit: { mean: 100, sd: null }, src: 'LZ2026', status: 'VA', note: 'fast／seven／quick 皆「約 100°」', ruling: 'R-none-prep' });
addRow({ id: 'set.push.elflex.fast', tech: '高手舉球', phase: '出手收勢', frame: 'set-push', variable: '肘屈（fast／seven 型）', def: 'D-elflex', metric: 'elbowFlex',
  lit: { mean: 40, sd: null }, src: 'LZ2026', status: 'VA', note: '遊戲所有舉球共用一支動畫', ruling: 'R-none-prep' });
addRow({ id: 'set.push.elflex.quick', tech: '高手舉球', phase: '出手收勢', frame: 'set-push', variable: '肘屈（quick 型）', def: 'D-elflex', metric: 'elbowFlex',
  lit: { mean: 70, sd: null }, src: 'LZ2026', status: 'VA', note: '同上', ruling: 'R-none-prep' });
addRow({ id: 'set.push.shflex', tech: '高手舉球', phase: '出手收勢', frame: 'set-push', variable: '肩屈（pipe 型）', def: 'D-shflex', metric: 'shFlexSag',
  lit: { mean: 150, sd: null }, src: 'LZ2026', status: 'VA', note: '原文僅 pipe 給收勢肩屈', ruling: 'R-none-prep' });
addRow({ id: 'set.load.wrist', tech: '高手舉球', phase: '裝填（拉球期）', frame: 'set-load', variable: '腕', def: 'D-wrist', metric: 'wristBend', kind: 'qual',
  lit: { text: '拉球期腕背伸（手往後倒）' }, src: 'OZ2019', status: 'Q', note: '幾何人看不見腕角', ruling: 'R-none-prep' });
addRow({ id: 'set.push.wrist', tech: '高手舉球', phase: '出手（推球期）', frame: 'set-push', variable: '腕', def: 'D-wrist', metric: 'wristBend', kind: 'qual',
  lit: { text: '推球期腕屈肌釋放（手往前推）' }, src: 'OZ2019', status: 'Q', note: '同上', ruling: 'R-none-prep' });

// ── C 扣球（ZH2017 肩線／髖線；RS2010 擊球瞬間上肢） ──
addRow({ id: 'spike.wind.shline', tech: '扣球', phase: '最大後擺', frame: 'spike-wind', variable: '肩線對網角', def: 'D-shline', metric: 'shLine',
  lit: { mean: 105, sd: null }, src: 'ZH2017', status: 'V', note: 'RA 組；GA 未給；絕對角假設 root 正對網，可靠度低於髖肩分離', ruling: 'R-none-spike' });
addRow({ id: 'spike.wind.hipline', tech: '扣球', phase: '最大後擺', frame: 'spike-wind', variable: '髖線對網角', def: 'D-hipline', metric: 'hipLine',
  lit: { mean: 157, sd: null }, src: 'ZH2017', status: 'V', note: 'RA 組；絕對角假設 root 正對網', ruling: 'R-none-spike' });
addRow({ id: 'spike.wind.sep', tech: '扣球', phase: '最大後擺', frame: 'spike-wind', variable: '髖肩分離', def: 'D-sep', metric: 'sep',
  lit: { mean: 52, sd: null }, src: 'ZH2017', status: 'VX', note: '157−105（RA）', ruling: 'R-none-spike' });
addRow({ id: 'spike.wind.er', tech: '扣球', phase: '最大後擺（cocking 末）', frame: null, variable: '肩最大外旋', def: 'D-2C', kind: '2C',
  lit: { mean: 160, sd: 10 }, src: 'RS2010', status: 'VD', note: '斜線扣；直線扣 163±10', ruling: 'R-none-spike' });
addRow({ id: 'spike.hit.abd', tech: '扣球', phase: '擊球', frame: 'spike-hit', variable: '肩外展', def: 'D-abd', metric: 'abdFrontal',
  lit: { mean: 130, sd: 8 }, src: 'RS2010', status: 'VD', note: '斜線扣；直線扣 133±7', ruling: 'R-none-spike' });
addRow({ id: 'spike.hit.elflex', tech: '扣球', phase: '擊球', frame: 'spike-hit', variable: '肘屈', def: 'D-elflex', metric: 'elbowFlex',
  lit: { mean: 34, sd: 10 }, src: 'RS2010', status: 'VD', note: '斜線與直線扣同為 34±10', ruling: 'R-none-spike' });
addRow({ id: 'spike.hit.hadd', tech: '扣球', phase: '擊球', frame: 'spike-hit', variable: '肩水平內收', def: 'D-hadd', metric: 'hAdd',
  lit: { mean: 29, sd: 14 }, src: 'RS2010', status: 'VD', note: '斜線扣；直線扣 33±15', ruling: 'R-none-spike' });
addRow({ id: 'spike.hit.shline', tech: '扣球', phase: '擊球', frame: 'spike-hit', variable: '肩線對網角', def: 'D-shline', metric: 'shLine',
  lit: { mean: 137, sd: null }, src: 'ZH2017', status: 'V', note: 'RA 組；GA 150；絕對角假設 root 正對網', ruling: 'R-none-spike' });
addRow({ id: 'spike.hit.hipline', tech: '扣球', phase: '擊球', frame: 'spike-hit', variable: '髖線對網角', def: 'D-hipline', metric: 'hipLine',
  lit: { mean: 157, sd: null }, src: 'ZH2017', status: 'V', note: 'RA 組；GA 164；絕對角假設 root 正對網', ruling: 'R-none-spike' });
addRow({ id: 'spike.hit.sep', tech: '扣球', phase: '擊球', frame: 'spike-hit', variable: '髖肩分離', def: 'D-sep', metric: 'sep',
  lit: { mean: 20, sd: null }, src: 'ZH2017', status: 'VX', note: '157−137（RA）；GA 164−150=14', ruling: 'R-none-spike' });
addRow({ id: 'spike.approach.comdrop', tech: '扣球', phase: '助跑最低點', frame: 'approach-low', variable: '重心下降／身高', def: 'D-comdrop', metric: 'dropPct',
  kind: 'comdrop', unit: '%', lit: { mean: 12.7, sd: null }, src: 'ZH2017', status: 'VX',
  note: '原文「約 0.25 m」÷ 平均身高 1.966 m', ruling: 'R-none-approach' });

// ── D 吊球（RS2010 roll shot） ──
addRow({ id: 'tip.hit.abd', tech: '吊球', phase: '擊球', frame: 'tip-hit', variable: '肩外展', def: 'D-abd', metric: 'abdFrontal',
  lit: { mean: 122, sd: 9 }, src: 'RS2010', status: 'VD', note: 'roll shot（遊戲註解自稱 Tip／Roll Shot）', ruling: 'R-tip' });
addRow({ id: 'tip.hit.elflex', tech: '吊球', phase: '擊球', frame: 'tip-hit', variable: '肘屈', def: 'D-elflex', metric: 'elbowFlex',
  lit: { mean: 43, sd: 12 }, src: 'RS2010', status: 'VD', note: '', ruling: 'R-tip' });
addRow({ id: 'tip.hit.hadd', tech: '吊球', phase: '擊球', frame: 'tip-hit', variable: '肩水平內收', def: 'D-hadd', metric: 'hAdd',
  lit: { mean: 43, sd: 15 }, src: 'RS2010', status: 'VD', note: '', ruling: 'R-tip' });
addRow({ id: 'tip.wind.er', tech: '吊球', phase: '最大後擺', frame: null, variable: '肩最大外旋', def: 'D-2C', kind: '2C',
  lit: { mean: 129, sd: 32 }, src: 'RS2010', status: 'VD', note: 'tip 序列自 spikeWind 起手', ruling: 'R-tip' });

// ── E 攔網（無量化文獻） ──
addRow({ id: 'block.top.elflex', tech: '攔網', phase: '最高點', frame: 'block-top', variable: '肘屈（手臂打直）', def: 'D-elflex', metric: 'elbowFlex',
  kind: 'qual', lit: { text: '手臂盡量打直伸過網（≈0）' }, src: 'BLOCKREF', status: 'Q', note: 'FK2014 只有質心量，無角度', ruling: 'R-block' });
addRow({ id: 'block.top.span', tech: '攔網', phase: '最高點', frame: 'block-top', variable: '雙腕間距', def: 'D-span', metric: 'wristSpan',
  kind: 'qual', unit: 'm', lit: { text: '虎口對齊肩寬' }, src: 'BLOCKREF', status: 'Q', note: '肩寬＝肩關節距 0.450 m', ruling: 'R-block' });

// ── F 發球（RS2010） ──
for (const [key, label, frame, a, e, h, er, n, extra] of [
  ['servejump', '跳發', 'servejump-hit', [129, 11], [48, 26], [23, 24], [164, 11], 'n=5', ''],
  ['servefloat', '飄球', 'servefloat-hit', [133, 11], [50, 17], [30, 16], [158, 12], 'n=14', '原文未寫站立或跳飄（稱 traditional float serve）；遊戲飄球為站立'],
]) {
  addRow({ id: `${key}.hit.abd`, tech: `發球・${label}`, phase: '擊球', frame, variable: '肩外展', def: 'D-abd', metric: 'abdFrontal',
    lit: { mean: a[0], sd: a[1] }, src: 'RS2010', status: 'VD', note: [n, extra].filter(Boolean).join('；'), ruling: 'R-none-serve' });
  addRow({ id: `${key}.hit.elflex`, tech: `發球・${label}`, phase: '擊球', frame, variable: '肘屈', def: 'D-elflex', metric: 'elbowFlex',
    lit: { mean: e[0], sd: e[1] }, src: 'RS2010', status: 'VD', note: n, ruling: 'R-none-serve' });
  addRow({ id: `${key}.hit.hadd`, tech: `發球・${label}`, phase: '擊球', frame, variable: '肩水平內收', def: 'D-hadd', metric: 'hAdd',
    lit: { mean: h[0], sd: h[1] }, src: 'RS2010', status: 'VD', note: n, ruling: 'R-none-serve' });
  addRow({ id: `${key}.wind.er`, tech: `發球・${label}`, phase: '引臂末（cocking）', frame: null, variable: '肩最大外旋', def: 'D-2C', kind: '2C',
    lit: { mean: er[0], sd: er[1] }, src: 'RS2010', status: 'VD', note: n, ruling: 'R-none-serve' });
}
addRow({ id: 'serve.hit.none', tech: '發球・一般（穩定）', phase: '擊球', frame: 'serve-hit', variable: '—', def: null, kind: 'none',
  lit: { text: '查無對應文獻（遊戲自訂的「穩定」發球，跳 0.3 m）' }, src: null, status: 'N', note: '現況值見 JSON frames.serve-hit', ruling: 'R-none-serve' });

// ── G 魚躍（無量化文獻） ──
addRow({ id: 'dive.none', tech: '魚躍', phase: '撲出／觸球／著地', frame: null, variable: '—', def: null, kind: 'none',
  lit: { text: '查無數字。定性：sprawl＝快速降到地面、平台伸到球下（IYV）；pancake＝手掌貼地（LEB2025）；經典 dive 背弓撐接' },
  src: 'IYV、LEB2025', status: 'Q', note: '軀幹前傾由 matchView DIVE_TILT 驅動、不在 animator 內，本表不量', ruling: 'R-dive' });

// sim 綁定項（Q4-2）：文獻值與現況量測並列，本卷不改
const SIM_BOUND = [
  { id: 'sb.spike.vy', item: '扣球起跳垂直速度', lit: 'RA 2.91、GA 2.96 m/s（無 SD）→ 等效彈道滯空 2v/g＝0.59–0.60 s、質心升高 v²/2g＝0.43–0.45 m（推導）', src: 'ZH2017', arc: 'windup' },
  { id: 'sb.spike.step', item: '扣球助跑首步速度', lit: '約 2.55 m/s；起跳後水平速度約 1.71 m/s', src: 'ZH2017', arc: null },
  { id: 'sb.block.h', item: '攔網跳高／滯空', lit: '傳統 0.32±0.05 m、揮臂式 0.38±0.05 m；垂直速度 2.51±0.21／2.73±0.19 m/s；雙手在網上 0.40±0.04／0.46±0.04 s', src: 'FK2014', arc: 'blockJump' },
  { id: 'sb.servejump.h', item: '跳發跳高／擊球高', lit: '質心跳高 54.3±9.1 cm；垂直速度 3.3±0.4 m/s；擊球高 303.8±28.2 cm', src: 'HH2007', arc: 'serveJump' },
  { id: 'sb.float.h', item: '跳飄跳高', lit: '26.7±4.5 cm；2.6±0.2 m/s；擊球高 297.4±32.6 cm（遊戲飄球為站立、零跳）', src: 'HH2007', arc: 'serveFloat' },
  { id: 'sb.serve.h', item: '一般發球跳高', lit: '查無對應', src: null, arc: 'serve' },
  { id: 'sb.set.jump', item: '跳舉跳高', lit: '查無（本卷未查到量化文獻）', src: null, arc: 'overheadJump' },
];

// ─────────────────────────── 6. 自我檢查（手動設已知角度） ───────────────────────────
function selftest() {
  const out = [];
  const add = (name, setup, expected, measured, unit = '°') => {
    const tol = unit === '°' ? 1 : 0.001;
    out.push({ name, setup, expected, measured, err: measured - expected, unit, ok: Math.abs(measured - expected) <= tol });
  };
  const fresh = () => { const c = makeCtx(); return c; }; // 新骨架：所有關節 rotation 為 0、未經 animator
  const P = (c) => points(c.rig);
  { // 膝
    const c = fresh(); c.rig.joints.rKnee.rotation.x = 0; c.rig.root.updateMatrixWorld(true);
    add('膝伸直', 'rKnee.x=0', 180, metrics(P(c)).knee2D);
    c.rig.joints.rKnee.rotation.x = Math.PI / 2; c.rig.root.updateMatrixWorld(true);
    add('膝 90°（2D）', 'rKnee.x=π/2', 90, metrics(P(c)).knee2D);
    add('膝 90°（3D）', 'rKnee.x=π/2', 90, metrics(P(c)).knee3D);
    c.rig.joints.rHip.rotation.x = -Math.PI / 2; c.rig.root.updateMatrixWorld(true);
    add('大腿前平舉', 'rHip.x=−π/2', 90, metrics(P(c)).thigh);
  }
  { // 肘
    const c = fresh(); c.rig.joints.rElbow.rotation.x = -Math.PI / 2; c.rig.root.updateMatrixWorld(true);
    const m = metrics(P(c));
    add('肘 90°（2D 夾角）', 'rElbow.x=−π/2', 90, m.elbow2D);
    add('肘屈 90°（3D）', 'rElbow.x=−π/2', 90, m.elbowFlex);
    c.rig.joints.rElbow.rotation.x = -0.6; c.rig.root.updateMatrixWorld(true);
    add('肘屈 34.4°（3D）', 'rElbow.x=−0.6', 0.6 * DEG, metrics(P(c)).elbowFlex);
  }
  { // 上臂、矢狀面肩屈
    const c = fresh(); c.rig.joints.rShoulder.rotation.x = -Math.PI / 2; c.rig.root.updateMatrixWorld(true);
    let m = metrics(P(c));
    add('上臂前平舉（矢狀面）', 'rShoulder.x=−π/2', 90, m.upperArm);
    add('肩屈前平舉（相對軀幹）', 'rShoulder.x=−π/2', 90, m.shFlexSag);
    c.rig.joints.rShoulder.rotation.x = -150 / DEG; c.rig.root.updateMatrixWorld(true);
    m = metrics(P(c));
    add('肩屈 150°（相對軀幹）', 'rShoulder.x=−150°', 150, m.shFlexSag);
  }
  { // 整體前傾：軀幹、頭、大腿傾角一起變
    const c = fresh(); c.rig.root.rotation.x = 0.5; c.rig.root.updateMatrixWorld(true);
    const m = metrics(P(c));
    add('整體前傾 0.5 rad → 軀幹', 'root.x=0.5', 0.5 * DEG, m.trunk);
    add('整體前傾 0.5 rad → 頭', 'root.x=0.5', 0.5 * DEG, m.head);
    add('整體前傾 0.5 rad → 大腿（往後）', 'root.x=0.5', -0.5 * DEG, m.thigh);
  }
  { // ASMI 肩外展／水平內收（先繞 z 外展，再繞 y 水平前移）
    const c = fresh(); c.rig.joints.rShoulder.rotation.set(0, 0, -Math.PI / 2); c.rig.root.updateMatrixWorld(true);
    let m = metrics(P(c));
    add('側平舉 → 肩外展', 'rShoulder=(0,0,−π/2)', 90, m.abdFrontal);
    add('側平舉 → 水平內收', 'rShoulder=(0,0,−π/2)', 0, m.hAdd);
    c.rig.joints.rShoulder.rotation.set(0, Math.PI / 6, -Math.PI / 2); c.rig.root.updateMatrixWorld(true);
    m = metrics(P(c));
    add('側平舉前移 30° → 肩外展', 'rShoulder=(0,π/6,−π/2)', 90, m.abdFrontal);
    add('側平舉前移 30° → 水平內收', 'rShoulder=(0,π/6,−π/2)', 30, m.hAdd);
    c.rig.joints.rShoulder.rotation.set(-Math.PI, 0, 0); c.rig.root.updateMatrixWorld(true);
    add('正上舉 → 肩外展', 'rShoulder=(−π,0,0)', 180, metrics(P(c)).abdFrontal);
  }
  { // 肩線／髖線對網角與分離
    const c = fresh(); c.rig.joints.pelvis.rotation.y = -Math.PI / 6; c.rig.root.updateMatrixWorld(true);
    let m = metrics(P(c));
    add('骨盆右側後轉 30° → 髖線', 'pelvis.y=−π/6', 150, m.hipLine);
    add('骨盆右側後轉 30° → 肩線', 'pelvis.y=−π/6', 150, m.shLine);
    c.rig.joints.spineUpper.rotation.y = -Math.PI / 9; c.rig.root.updateMatrixWorld(true);
    m = metrics(P(c));
    add('胸椎再後轉 20° → 肩線', '+spineUpper.y=−π/9', 130, m.shLine);
    add('胸椎再後轉 20° → 髖肩分離', '+spineUpper.y=−π/9', 20, m.sep);
  }
  { // 長度：雙腕間距（零姿勢雙臂下垂＝肩關節距）、質心隨 root 平移
    const c = fresh(); c.rig.root.updateMatrixWorld(true);
    const m0 = metrics(P(c));
    add('零姿勢雙腕間距＝肩寬', '全關節 0', m0.shoulderSpan, m0.wristSpan, 'm');
    c.rig.root.position.y = 0.1; c.rig.root.updateMatrixWorld(true);
    add('root 上移 0.1 m → 質心上移', 'root.y=0.1', m0.comY + 0.1, metrics(P(c)).comY, 'm');
  }
  return out;
}

// ─────────────────────────── 7. 組表與輸出 ───────────────────────────
const r1 = (x) => Math.round(x * 10) / 10;
const f1 = (x) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1);
const sgn1 = (x) => (x > 0.05 ? `+${x.toFixed(1)}` : x < -0.05 ? x.toFixed(1) : '0.0');
function roundDeep(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x;
  if (Array.isArray(x)) return x.map(roundDeep);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundDeep(v)]));
  return x;
}
function sha1(path) { return createHash('sha1').update(readFileSync(resolve(ROOT, path))).digest('hex'); }

function evaluate(frames, approach) {
  return ROWS.map((r) => {
    const out = { ...r };
    if (r.kind === 'angle' || r.kind === 'comdrop') {
      const v = r.kind === 'comdrop' ? approach.primary.dropPct : frames[r.frame].m[r.metric];
      const cur = r1(v);
      const diff = r1(cur - r.lit.mean);
      out.current = cur;
      out.diff = diff;
      if (r.kind === 'angle') {
        out.tol = Math.max(r.lit.sd ?? 0, 10);
        out.out = Math.abs(diff) > out.tol;
      } else {
        out.tol = null; out.out = null; // 非角度：±10° 規則不適用，容差待使用者訂
      }
    } else if (r.kind === 'qual' && r.metric) {
      out.current = r1(r.unit === 'm' ? frames[r.frame].m[r.metric] * 1000 : frames[r.frame].m[r.metric]);
      out.out = null;
    } else {
      out.current = null; out.out = null;
    }
    return out;
  });
}

function mdTable(rows, frames, approach, sim, tests, meta) {
  const L = [];
  const outCount = rows.filter((r) => r.out === true).length;
  const numRows = rows.filter((r) => r.kind === 'angle' || r.kind === 'comdrop').length;
  L.push(`量測來源：\`src/render/geoAnimator.js\` sha1 \`${meta.src['src/render/geoAnimator.js']}\`、\`src/render/geoCharacter.js\` sha1 \`${meta.src['src/render/geoCharacter.js']}\`；探針球員 ${PROBE_NAME}（右手、身高 ${HEIGHT} m）。`);
  L.push('');
  L.push(`共 ${rows.length} 列：有數字可比 ${numRows} 列（角度 ${numRows - 1}＋重心下降 1），其中**超出「平均 ± max(1 SD, 10°)」${outCount} 列**；定性 ${rows.filter((r) => r.status === 'Q').length} 列、查無 ${rows.filter((r) => r.status === 'N').length} 列、骨架表達不了（2C）${rows.filter((r) => r.kind === '2C').length} 列。`);
  L.push('');
  L.push('### 對照表');
  L.push('');
  L.push('讀法：「定義」代號（D-…）見下方〈角度／量測定義〉、「來源」代號見〈文獻來源與核實〉、「試玩裁定」代號（R-…）見〈試玩裁定出處〉、「遊戲幀」見〈遊戲幀定義〉。差值＝現況−文獻平均；判定用「平均 ± max(1 SD, 10°)」。');
  L.push('');
  L.push('| ID | 技術・階段（遊戲幀） | 變數 | 定義 | 文獻值 | 來源 | 核實 | 現況 | 差值 | 容許 | 判定 | 試玩裁定 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const litStr = r.lit.text != null ? r.lit.text
      : r.lit.shown != null ? r.lit.shown
        : r.kind === 'comdrop' ? `${r.lit.mean}%`
          : `${r.lit.mean}${r.lit.sd != null ? `±${r.lit.sd}` : '（無 SD）'}`;
    const unit = r.kind === 'comdrop' ? '%' : r.unit === 'm' ? ' mm' : '°';
    const cur = r.current == null ? (r.kind === '2C' ? '—（無此自由度）' : '—') : `${f1(r.current)}${unit}`;
    const diff = r.diff == null ? '—' : sgn1(r.diff);
    const tol = r.tol == null ? '—' : `±${r.tol}`;
    const verdict = r.kind === 'angle' ? (r.out ? '**超出**' : '範圍內')
      : r.kind === 'comdrop' ? '—（非角度，容差待訂）'
        : r.kind === '2C' ? '—（2C）' : '—';
    const phase = r.frame ? `${r.tech}・${r.phase}（\`${r.frame}\`）` : `${r.tech}・${r.phase}`;
    const lit = r.note ? `${litStr}；${r.note}` : litStr;
    L.push(`| \`${r.id}\` | ${phase} | ${r.variable} | ${r.def ?? '—'} | ${lit} | ${r.src ?? '—'} | ${STATUS[r.status]} | ${cur} | ${diff} | ${tol} | ${verdict} | ${r.ruling} |`);
  }
  L.push('');
  L.push('### 遊戲幀定義');
  L.push('');
  L.push('| 幀 | 序列與時刻 | 怎麼驅動 | 播放時刻 t／dur（t/dur） | 動作層權重 w | root 高（m） |');
  L.push('|---|---|---|---|---|---|');
  for (const f of Object.values(frames)) {
    L.push(`| \`${f.id}\` | ${f.seqLabel} | ${f.how} | ${f.seq} ${f.t.toFixed(4)} s／${f.dur} s（${f.tNorm.toFixed(3)}） | ${f.w} | ${f.rootY.toFixed(3)} |`);
  }
  const a = approach.primary;
  const b = approach.secondary;
  L.push(`| \`approach-low\` | approach3 內質心最低幀 | 站定 1 s 取站姿質心 → 以速度 v 跑 0.5 s → 觸發 approach3 並持續餵 v，取質心最低幀 | v=${a.speed}：t=${a.atT.toFixed(4)} s（${a.atTNorm.toFixed(3)}）；v=${b.speed}：t=${b.atT.toFixed(4)} s（${b.atTNorm.toFixed(3)}） | 步相權重＝runW（隨速度） | — |`);
  L.push('');
  L.push(`助跑重心下降明細：v=${a.speed} m/s 質心降 ${a.drop.toFixed(3)} m（${a.dropPct.toFixed(1)}% 身高）、骨盆關節降 ${a.pelvisDrop.toFixed(3)} m；v=${b.speed} m/s（跑姿權重飽和）質心降 ${b.drop.toFixed(3)} m（${b.dropPct.toFixed(1)}%）、骨盆降 ${b.pelvisDrop.toFixed(3)} m。文獻換算到身高 ${HEIGHT} m＝${(0.127 * HEIGHT).toFixed(3)} m。`);
  L.push('');
  L.push('### 角度／量測定義');
  L.push('');
  L.push('| 代號 | 定義與關節點 |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(DEFS)) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('### 文獻來源與核實');
  L.push('');
  L.push('| 代號 | 出處 | URL | 樣本 | 本卷核對了什麼 |');
  L.push('|---|---|---|---|---|');
  for (const [k, s] of Object.entries(SRC)) L.push(`| ${k} | ${s.cite} | ${s.url} | ${s.sample} | ${s.checked} |`);
  L.push('');
  L.push('### 試玩裁定出處');
  L.push('');
  L.push('| 代號 | 出處 |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(RULINGS)) if (k !== 'R-na') L.push(`| ${k} | ${v} |`);
  const main = L.join('\n');
  L.length = 0;
  L.push('### 附錄 A：量法自我檢查（手動設已知角度，容差 ±1°／±1 mm）');
  L.push('');
  L.push('| 檢查 | 關節設定（其餘為 0、未經 animator） | 預期 | 量得 | 誤差 | 通過 |');
  L.push('|---|---|---|---|---|---|');
  for (const t of tests) {
    const noNegZero = (s) => (/^-0\.0+$/.test(s) ? s.slice(1) : s);
    const fmt = (x) => (t.unit === 'm' ? `${noNegZero(x.toFixed(4))} m` : `${noNegZero(x.toFixed(2))}°`);
    const err = t.unit === 'm' ? `${noNegZero((t.err * 1000).toFixed(3))} mm` : `${noNegZero(t.err.toFixed(3))}°`;
    L.push(`| ${t.name} | ${t.setup} | ${fmt(t.expected)} | ${fmt(t.measured)} | ${err} | ${t.ok ? '✅' : '❌'} |`);
  }
  L.push('');
  L.push('### 附錄 B：sim 綁定項（Q4-2 本卷不改）的文獻值與現況');
  L.push('');
  L.push('| 項目 | 文獻值 | 來源 | 現況序列 | 峰值 bodyY（m） | 峰值時刻（s） | bodyY>2 cm 時長（s） |');
  L.push('|---|---|---|---|---|---|---|');
  for (const s of SIM_BOUND) {
    const arc = s.arc ? sim[s.arc] : null;
    L.push(`| ${s.item} | ${s.lit} | ${s.src ?? '—'} | ${s.arc ?? '（sim 走位）'} | ${arc ? arc.peak.toFixed(3) : '—'} | ${arc ? arc.tPeak.toFixed(3) : '—'} | ${arc ? arc.airAbove2cm.toFixed(3) : '—'} |`);
  }
  return { table: main, appendix: L.join('\n') };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const tests = selftest();
  const failed = tests.filter((t) => !t.ok);
  for (const t of tests) {
    const u = t.unit === 'm' ? ' m' : '°';
    console.log(`[selftest] ${t.ok ? 'OK ' : 'FAIL'} ${t.name}: 預期 ${t.expected.toFixed(4)}${u} 量得 ${t.measured.toFixed(4)}${u}`);
  }
  if (failed.length) {
    console.error(`[selftest] ${failed.length} 項失敗——量法本身有誤，不輸出任何檔案`);
    process.exit(1);
  }

  const frames = {};
  for (const def of FRAME_DEFS) frames[def.id] = captureFrame(def);
  const approach = { primary: approachComDrop(2.55), secondary: approachComDrop(4.5) };
  const sim = {};
  for (const s of SIM_BOUND) if (s.arc) sim[s.arc] = arcOf(s.arc);
  const rows = evaluate(frames, approach);
  const meta = {
    tool: 'tools/motion-d0-measure.mjs',
    src: {
      'src/render/geoAnimator.js': sha1('src/render/geoAnimator.js'),
      'src/render/geoCharacter.js': sha1('src/render/geoCharacter.js'),
    },
    probe: { name: PROBE_NAME, handed: 'r', height: HEIGHT },
    conventions: '角色面向 +Z（網）、上 +Y、右手側 −X；root 不轉向不平移，root.y＝bodyY；不含 reachAssist／魚躍根旋轉／寫實人腿部 IK',
  };
  const json = roundDeep({ meta, selftest: tests, frames, approach, simBound: sim, rows });
  writeFileSync(OUT_JSON, `${JSON.stringify(json, null, 2)}\n`);
  const md = mdTable(rows, frames, approach, sim, tests, meta);

  for (const r of rows) {
    if (r.kind === 'angle' || r.kind === 'comdrop') {
      console.log(`${r.id.padEnd(26)} 現況 ${f1(r.current).padStart(6)}  文獻 ${String(r.lit.mean).padStart(6)}  差 ${sgn1(r.diff).padStart(6)}  ${r.out === true ? '超出' : r.out === false ? '範圍內' : '—'}`);
    }
  }
  console.log(`[d0] 寫出 ${OUT_JSON}`);

  if (args.has('--md')) console.log(`${md.table}\n\n${md.appendix}`);
  const blocks = Object.fromEntries(Object.entries(MARKS).map(([k, [b, e]]) => [k, `${b}\n${md[k]}\n${e}`]));
  const locate = (doc, k) => {
    const [b, e] = MARKS[k];
    const i = doc.indexOf(b);
    const j = doc.indexOf(e);
    return i < 0 || j < i ? null : [i, j + e.length];
  };
  if (args.has('--write-table')) {
    let doc = readFileSync(TABLE_MD, 'utf8');
    for (const k of Object.keys(MARKS)) {
      const at = locate(doc, k);
      if (!at) throw new Error(`motion-d0-table.md 找不到 ${k} 產生區塊標記`);
      doc = doc.slice(0, at[0]) + blocks[k] + doc.slice(at[1]);
    }
    writeFileSync(TABLE_MD, doc);
    console.log(`[d0] 已更新 ${TABLE_MD} 的產生區塊（${Object.keys(MARKS).join('、')}）`);
  }
  if (args.has('--check')) {
    const doc = readFileSync(TABLE_MD, 'utf8').replace(/\r\n/g, '\n');
    let lines = 0;
    for (const k of Object.keys(MARKS)) {
      const at = locate(doc, k);
      if (!at) { console.error(`[check] 找不到 ${k} 產生區塊標記`); process.exit(1); }
      const have = doc.slice(at[0], at[1]);
      if (have !== blocks[k]) {
        const a = have.split('\n');
        const b = blocks[k].split('\n');
        const n = a.findIndex((line, idx) => line !== b[idx]);
        console.error(`[check] ${k} 區塊不一致：區塊內第 ${n + 1} 行\n  表中：${a[n]}\n  重跑：${b[n]}`);
        process.exit(1);
      }
      lines += blocks[k].split('\n').length;
    }
    console.log(`[check] OK：表中兩段產生區塊（共 ${lines} 行）與本次重跑逐字一致`);
  }
}

main();
