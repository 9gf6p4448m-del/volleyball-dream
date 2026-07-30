// 夠球視覺補償的量化驗收（07-29）：觸球瞬間「手到球心」的距離，補償前 vs 補償後。
// 用法：node tools/reach-probe.mjs [seeds]
//
// 為什麼量手不量身體中心：Sawmah 的回報是「還沒碰到手上就接起來」——落差發生在
// **手與球之間**。sim 只判身體中心到球的水平距離（REACH_RADIUS 1.3m），所以要驗的是
// 表現層把手挪到多接近球。
//
// 做法：跑真實 sim 收 TOUCH 樣本（球心、球員位置、身高、觸球型別），再用**與遊戲同一份
// 程式碼**（geoCharacter 骨架＋geoAnimator 動作＋reachAssist 偏置）把該球員擺到「觸球
// 關鍵幀」，讀腕關節的 matrixWorld 量距離。補償前＝不套 reachAssist，補償後＝套。
import * as THREE from 'three';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createGeoCharacter, BASE_H } from '../src/render/geoCharacter.js';
import { createGeoAnimator } from '../src/render/geoAnimator.js';
import {
  REACH, reachWindow, reachBias, applyReachBias, localBallOffset, worldReachOffset,
} from '../src/render/reachAssist.js';

const SEEDS = Number(process.argv[2] ?? 5);
const DT = 1 / 60;
// 觸球那一幀身體長什麼樣：matchView 是在 TOUCH 事件**當下**才 trigger 正式動作，
// 所以要量的是「預備段撐到觸球 → 正式動作剛接手第一幀」的姿勢，不是動作播到一半的
// 擊球關鍵幀（那時球早就飛走了）。預備段提前量沿用 matchLoop 的 RECEIVE_READY_LEAD 26／
// SET_READY_LEAD 34／TAKEOFF_LEAD 24 tick。
const OVERHAND_Y = 1.6; // 同 matchView：擊球點高於此＝高手動作，低於＝低手墊球
const BUMP = { ready: 'receiveReady', readyT: 26 / 60, pose: 'bump', kind: 'both' };
const OVER_RECV = { ready: 'receiveReady', readyT: 26 / 60, pose: 'overhead', kind: 'both' };
const SET = { ready: 'setReady', readyT: 34 / 60, pose: 'overhead', kind: 'both' };
// hitFrame＝取樣點推到擊球關鍵幀（三段式的擊球弧從頭播，見 measure() 內註解）
const SPIKE = { ready: 'windup', readyT: 24 / 60, pose: 'spike', kind: 'dominant', hitFrame: true };
const contactSpec = (kind, ballY) => (kind === 'spike' ? SPIKE
  : kind === 'set' ? SET
    : ballY >= OVERHAND_Y ? OVER_RECV : BUMP);

// ---- 1) 跑 sim 收樣本 ----
const samples = [];
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const wSm = {}; // 每人的包絡平滑值（模擬 matchView 逐幀收斂）
  for (const id of Object.keys(g.players)) wSm[id] = 0;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const events = stepGame(g, aiCollectIntents(g, ai));
    const b = g.ball;
    for (const [id, a] of Object.entries(g.actors)) {
      const rally = g.phase === 'rally';
      const h = g.players[id].height.current;
      // 腳底高度：sim 沒有球員 y（跳躍純表現層），這裡保守取 0＝低估高球的窗
      const target = rally ? reachWindow(Math.hypot(b.x - a.x, b.z - a.z), b.y, h) : 0;
      wSm[id] += (target - wSm[id]) * (1 - Math.exp(-REACH.SMOOTH_K * DT));
    }
    for (const e of events) {
      if (e.type !== 'TOUCH' || !['receive', 'set', 'spike'].includes(e.kind)) continue;
      const a = g.actors[e.playerId];
      samples.push({
        kind: e.kind,
        ball: { x: b.x, y: b.y, z: b.z },
        ax: a.x,
        az: a.z,
        height: g.players[e.playerId].height.current,
        pid: e.playerId,
        w: wSm[e.playerId],
      });
    }
  }
}

// ---- 2) 用遊戲同一份表現層程式碼擺姿勢、量手到球 ----
const stubPool = { claim: (key) => ({ key, index: 0 }) };
const rig = createGeoCharacter(stubPool, 'probe', 'A', BASE_H, false);
const v = new THREE.Vector3();

// 量測點：雙手動作（墊球平台／舉球）＝**兩掌中點**（球該落在兩手之間），
// 單手動作（扣球）＝慣用手掌心
const v2 = new THREE.Vector3();
function contactPoint(rig, kind) {
  v.setFromMatrixPosition(rig.joints.rWrist.matrixWorld);
  if (kind !== 'both') return v.clone();
  v2.setFromMatrixPosition(rig.joints.lWrist.matrixWorld);
  return v.clone().add(v2).multiplyScalar(0.5);
}
const dist3 = (p, ball) => Math.hypot(p.x - ball.x, p.y - ball.y, p.z - ball.z);
// 落差拆解：手到球的水平分量／垂直分量（水平才是本層補得到的；垂直是動作編排的事）
const split = (p, ball) => ({ h: Math.hypot(p.x - ball.x, p.z - ball.z), dy: p.y - ball.y });

function measure(s) {
  const spec = contactSpec(s.kind, s.ball.y);
  const anim = createGeoAnimator(rig);
  anim.trigger(spec.ready);                                   // 預備段（球到之前先擺好）
  let bodyY = 0;
  for (let t = 0; t < spec.readyT; t += DT) bodyY = anim.update(DT, 0, 0);
  anim.trigger(spec.pose);                                    // TOUCH 當下才接正式動作
  bodyY = anim.update(DT, 0, 0);                              // ＝觸球那一幀
  // Phase 5 W2 核心-1（三段式）追修：扣球的擊球弧改成**提前觸發、從頭播**，所以
  // trigger 之後那一幀是引臂（spikeWind、手還在後面）而不是擊球姿勢。要量的一直是
  // 「觸球那一幀的手在哪」＝擊球關鍵幀 ⇒ 推到 hit 再取樣（沿用 animator 自己的
  // catchUpToHit，不在探針重算一份擊球幀位置）。
  // ★ 只改扣球那一列 ★：receive/set 這裡沿用「trigger 後第一幀」是 07-29 提前量上線
  // **之前**的模型（檔頭註解仍是舊的），實際上它們也早就在觸球幀播到擊球關鍵幀
  // （contact-frame-probe 實測 bump t=0.500 vs hit 0.45）——那是本輪之前就存在的
  // 量測偏差，且 reachAssist 校準（W2 裁定 1）正拿這兩列的數字在談，不在本輪順手改。
  if (spec.hitFrame) {
    anim.catchUpToHit();
    bodyY = anim.update(DT, 0, 0);
  }
  const yaw = Math.atan2(s.ball.x - s.ax, s.ball.z - s.az); // 觸球幀的 matchView 目標角
  rig.root.scale.setScalar(s.height / BASE_H);
  rig.root.rotation.set(0, yaw, 0);

  // 補償前
  rig.root.position.set(s.ax, bodyY, s.az);
  rig.root.updateMatrixWorld(true);
  const pBefore = contactPoint(rig, spec.kind);
  const before = dist3(pBefore, s.ball);
  const sBefore = split(pBefore, s.ball);

  // 補償後（w 用逐 tick 平滑後的真實值；高度閘改用真正的腳底高度）
  const w = s.w * (reachWindow(0, s.ball.y - bodyY, s.height) > 0 ? 1 : 0);
  const off = localBallOffset(s.ball.x - s.ax, s.ball.z - s.az, yaw);
  const bias = reachBias({
    right: off.right,
    fwd: off.fwd,
    up: s.ball.y - bodyY,
    w,
    kind: spec.kind,
    armXR: rig.joints.rShoulder.rotation.x,
    armXL: rig.joints.lShoulder.rotation.x,
    elbowXR: rig.joints.rElbow.rotation.x,
    elbowXL: rig.joints.lElbow.rotation.x,
    trunkX: rig.joints.spine.rotation.x + rig.joints.spineUpper.rotation.x,
    scale: s.height / BASE_H,
  });
  applyReachBias(rig.joints, bias);
  const rOff = worldReachOffset(bias.rootRight, bias.rootFwd, yaw);
  rig.root.position.set(s.ax + rOff.dx, bodyY + bias.rootUp, s.az + rOff.dz);
  rig.root.updateMatrixWorld(true);
  const pAfter = contactPoint(rig, spec.kind);
  const after = dist3(pAfter, s.ball);
  const sAfter = split(pAfter, s.ball);
  return {
    before,
    after,
    w,
    rootShift: Math.hypot(rOff.dx, rOff.dz),
    lift: bias.rootUp,
    dyAfter: sAfter.dy,
    center: Math.hypot(s.ball.x - s.ax, s.ball.z - s.az),
    ballY: s.ball.y,
    hBefore: sBefore.h,
    dyBefore: sBefore.dy,
    hAfter: sAfter.h,
  };
}

const byKind = { receive: [], set: [], spike: [] };
for (const s of samples) byKind[s.kind].push(measure(s));

// ---- 3) 報表 ----
const q = (arr, p) => {
  if (!arr.length) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
};
const f = (n) => (Number.isFinite(n) ? n.toFixed(2) : 'n/a');

console.log(`樣本：${SEEDS} 場單局、共 ${samples.length} 次觸球（receive/set/spike）`);
console.log('');
console.log('【觸球瞬間「手→球心」距離（m）】雙手動作取兩掌中點、扣球取慣用手掌心');
console.log('型別      n     修前 p50/p90/max        修後 p50/p90/max        p50 縮短');
for (const [kind, rows] of Object.entries(byKind)) {
  if (!rows.length) continue;
  const b = rows.map((r) => r.before);
  const a = rows.map((r) => r.after);
  const cut = q(b, 0.5) - q(a, 0.5);
  const pct = ((cut / q(b, 0.5)) * 100).toFixed(0);
  console.log(
    `${kind.padEnd(9)} ${String(rows.length).padEnd(5)} `
    + `${f(q(b, 0.5))}/${f(q(b, 0.9))}/${f(Math.max(...b))}      `
    + `${f(q(a, 0.5))}/${f(q(a, 0.9))}/${f(Math.max(...a))}      `
    + `−${f(cut)}m（−${pct}%）`,
  );
}
console.log('');
console.log('【對照：球心到球員中心的水平距離（sim 判定用的那個量，本輪不動）】');
for (const [kind, rows] of Object.entries(byKind)) {
  if (!rows.length) continue;
  const c = rows.map((r) => r.center);
  console.log(`${kind.padEnd(9)} p50=${f(q(c, 0.5))}  p90=${f(q(c, 0.9))}  max=${f(Math.max(...c))}`);
}
console.log('');
console.log('【落差拆解（修前）】手→球的水平分量 vs 垂直分量（＋＝手在球上方）；水平才是本層補得到的');
for (const [kind, rows] of Object.entries(byKind)) {
  if (!rows.length) continue;
  const h = rows.map((r) => r.hBefore);
  const dy = rows.map((r) => r.dyBefore);
  const hA = rows.map((r) => r.hAfter);
  const by = rows.map((r) => r.ballY);
  console.log(
    `${kind.padEnd(9)} 水平 p50=${f(q(h, 0.5))}→修後 ${f(q(hA, 0.5))}  `
    + `垂直 p50=${f(q(dy, 0.5))}→修後 ${f(q(rows.map((r) => r.dyAfter), 0.5))}  `
    + `擊球高度 p50=${f(q(by, 0.5))}`,
  );
}
console.log('');
console.log('【補償實際用量】包絡權重 w／根位移（上限 %s m）'.replace('%s', REACH.ROOT_MAX));
for (const [kind, rows] of Object.entries(byKind)) {
  if (!rows.length) continue;
  const w = rows.map((r) => r.w);
  const rs = rows.map((r) => r.rootShift);
  console.log(
    `${kind.padEnd(9)} w p50=${f(q(w, 0.5))} min=${f(Math.min(...w))}  `
    + `水平位移 p50=${f(q(rs, 0.5))} max=${f(Math.max(...rs))}  `
    + `垂直伸展 p50=${f(q(rows.map((r) => r.lift), 0.5))} max=${f(Math.max(...rows.map((r) => r.lift)))}`,
  );
}
