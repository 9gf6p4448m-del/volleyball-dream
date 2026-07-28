// 幾何動畫 — 魚躍動作（修「按魚躍站著不動」bug 的回歸測試）
// geoAnimator 是純函式（rig 注入），node 可測；驗 dive 動作驅動撲救姿勢
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeoAnimator } from '../src/render/geoAnimator.js';

// 4.7 動作重製新增三關節：pelvis（骨盆獨立轉）／spineUpper（胸椎）／r-lWrist（壓腕）
const JOINT_NAMES = ['rHip', 'lHip', 'rKnee', 'lKnee', 'spine', 'spineUpper', 'neck',
  'pelvis', 'rShoulder', 'lShoulder', 'rElbow', 'lElbow', 'rWrist', 'lWrist'];

function mkRig() {
  const joints = {};
  for (const n of JOINT_NAMES) joints[n] = { rotation: { x: 0, y: 0, z: 0 } };
  return { joints, root: { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } } };
}

test('geoAnimator dive：驅動撲救姿勢（雙臂大幅前伸夠球）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('dive');
  anim.update(0.35, 0); // 播到撲出/觸球段
  // 身體前傾由 matchView 的 root.rotation.x 主導；geoAnimator 負責雙臂大幅前伸救球
  assert.ok(rig.joints.rShoulder.rotation.x < -0.8, `右臂 ${rig.joints.rShoulder.rotation.x} 應大幅前伸`);
  assert.ok(rig.joints.lShoulder.rotation.x < -0.8, '左臂應大幅前伸（雙臂平墊）');
});

test('geoAnimator dive：撲空也演完整套、dur≈倒地時長後回待命', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('dive');
  assert.ok(!anim.isIdle(), '觸發後應在播放中');
  anim.update(0.72, 0); // 播完整段（dur 0.72）
  anim.update(0.01, 0);
  assert.ok(anim.isIdle(), 'dur 後應回待命（不卡在趴地）');
});

test('發球分式動畫：serveJump 高跳、serveFloat 站立零跳、serveReady 可 hold', () => {
  // 跳發：擊球段有明顯騰空（jump 0.55）
  const r1 = mkRig();
  const a1 = createGeoAnimator(r1);
  a1.trigger('serveJump');
  let peak = 0;
  for (let i = 0; i < 17; i += 1) peak = Math.max(peak, a1.update(0.05, 0));
  assert.ok(peak > 0.3, `跳發應高跳（峰值 ${peak.toFixed(2)}）`);
  // 飄浮：站立推擊、全程零騰空
  const r2 = mkRig();
  const a2 = createGeoAnimator(r2);
  a2.trigger('serveFloat');
  let top = -1;
  for (let i = 0; i < 10; i += 1) top = Math.max(top, a2.update(0.05, 0));
  assert.ok(top <= 0.02, `飄浮發球不應騰空（峰值 ${top.toFixed(2)}）`);
  // serveReady：hold 姿勢可用（發球前捧球預備）
  const r3 = mkRig();
  const a3 = createGeoAnimator(r3);
  a3.setHold('serveReady');
  a3.update(0.05, 0);
  assert.ok(r3.joints.rShoulder.rotation.x < -0.5, '捧球預備＝雙臂前伸');
});

test('W7 A4③ 喘氣 idle：hold 姿勢＝深前傾＋撐膝（spine/crouch 明顯大於待命）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.setHold('gasp');
  anim.update(0.05, 0);
  assert.ok(rig.joints.spine.rotation.x > 0.5, `軀幹應深前傾（${rig.joints.spine.rotation.x}）`);
  assert.ok(rig.joints.rElbow.rotation.x < -0.3, '手肘應大彎（撐膝）');
});

test('W7 B4④ 氣勢 dejected idle：垂肩低頭、無下蹲（區別於 gasp 撐膝）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.setHold('dejected');
  anim.update(0.05, 0);
  assert.ok(rig.joints.spine.rotation.x > 0.15 && rig.joints.spine.rotation.x < 0.5,
    `軀幹應輕微前垂但不到喘氣深度（${rig.joints.spine.rotation.x}）`);
  assert.ok(rig.joints.rElbow.rotation.x > -0.3, '手肘不應大彎（非撐膝，鬆垮下垂即可）');
});

test('W7 B4④ highfive：時長明顯長於一般 cheer', () => {
  const rNorm = mkRig();
  const aNorm = createGeoAnimator(rNorm);
  aNorm.trigger('cheer');
  aNorm.update(0.9, 0);
  aNorm.update(0.01, 0);
  assert.ok(aNorm.isIdle(), '一般 cheer 應在 0.9s 後結束');

  const rBoost = mkRig();
  const aBoost = createGeoAnimator(rBoost);
  aBoost.trigger('highfive');
  aBoost.update(0.9, 0);
  assert.ok(!aBoost.isIdle(), 'highfive 在 0.9s 時應仍在播放（時長拉長）');
  aBoost.update(0.5, 0);
  assert.ok(aBoost.isIdle(), 'highfive 在 dur 1.3s 後應結束');
});

test('geoAnimator：未知動作不崩（trigger 防呆）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('nonexistent');
  assert.ok(anim.isIdle());
  anim.update(0.1, 0); // 不應丟例外
});

// 4.7 動作重製（工單 §7「動作正確性」）：鞭打順序與落地緩衝
test('鞭打順序：肩→肘→腕的角速度峰值嚴格遞增（不得同幀一起轉）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('spike');
  const dt = 1 / 60;
  const prev = { sh: 0, el: 0, wr: 0 };
  const peak = { sh: { v: -1, t: -1 }, el: { v: -1, t: -1 }, wr: { v: -1, t: -1 } };
  for (let i = 0; i < 40; i += 1) {
    anim.update(dt, 0);
    const cur = {
      sh: rig.joints.rShoulder.rotation.x,
      el: rig.joints.rElbow.rotation.x,
      wr: rig.joints.rWrist.rotation.x,
    };
    for (const k of ['sh', 'el', 'wr']) {
      const v = Math.abs(cur[k] - prev[k]);
      if (i > 0 && v > peak[k].v) peak[k] = { v, t: i };
      prev[k] = cur[k];
    }
  }
  assert.ok(peak.sh.t >= 0 && peak.el.t >= 0 && peak.wr.t >= 0, '三關節都要有動作');
  assert.ok(peak.sh.t <= peak.el.t, `肩(${peak.sh.t}) 不得晚於肘(${peak.el.t})`);
  assert.ok(peak.el.t <= peak.wr.t, `肘(${peak.el.t}) 不得晚於腕(${peak.wr.t})`);
  assert.ok(peak.wr.t > peak.sh.t, '腕的峰值必須嚴格晚於肩＝鞭打不是同幀一起轉');
});

test('落地緩衝：扣球落地後膝角持續低於站立值（不得瞬間回站姿）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  const dt = 1 / 60;
  anim.update(dt, 0);
  const standKnee = rig.joints.rKnee.rotation.x;
  anim.trigger('spike');
  const knees = [];
  for (let i = 0; i < 48; i += 1) { // spike 0.6s ＋ 自動接的落地緩衝 0.26s
    anim.update(dt, 0);
    knees.push(rig.joints.rKnee.rotation.x);
  }
  // 落地段（spike 尾 + landSoft）：屈膝吸收＝膝角明顯大於站立，且持續 ≥10 tick
  const tail = knees.slice(36, 48);
  assert.ok(tail.filter((k) => k > standKnee + 0.05).length >= 10,
    `落地段應有連續屈膝吸收（實際 ${tail.map((k) => k.toFixed(2)).join(',')}）`);
});

test('步幅匹配：擺腿振幅隨移速上升（滑冰的成因是步幅不匹配）', () => {
  const sample = (speed) => {
    const rig = mkRig();
    const anim = createGeoAnimator(rig);
    let max = 0;
    for (let i = 0; i < 120; i += 1) {
      anim.update(1 / 60, speed);
      max = Math.max(max, Math.abs(rig.joints.rHip.rotation.x));
    }
    return max;
  };
  const slow = sample(1.2);
  const fast = sample(4.2);
  assert.ok(fast > slow, `快跑的擺腿幅度要大於慢走（slow=${slow.toFixed(2)} fast=${fast.toFixed(2)}）`);
});

test('側併步：橫移時髖關節側開、前後擺腿明顯減弱（沿網移動不是前跑）', () => {
  const sample = (lateral) => {
    const rig = mkRig();
    const anim = createGeoAnimator(rig);
    let maxX = 0;
    let maxZ = 0;
    for (let i = 0; i < 120; i += 1) {
      anim.update(1 / 60, 3.5, lateral);
      maxX = Math.max(maxX, Math.abs(rig.joints.rHip.rotation.x));
      maxZ = Math.max(maxZ, Math.abs(rig.joints.rHip.rotation.z));
    }
    return { maxX, maxZ };
  };
  const fwd = sample(0);
  const side = sample(1);
  assert.ok(side.maxZ > 0.1, `純橫移要有側開動作（實際 ${side.maxZ.toFixed(3)}）`);
  assert.ok(fwd.maxZ < 0.01, `純前進不得有側開（實際 ${fwd.maxZ.toFixed(3)}）`);
  assert.ok(side.maxX < fwd.maxX, `橫移的前後擺腿要比前進小（側 ${side.maxX.toFixed(2)} vs 前 ${fwd.maxX.toFixed(2)}）`);
});
