// 幾何動畫 — 魚躍動作（修「按魚躍站著不動」bug 的回歸測試）
// geoAnimator 是純函式（rig 注入），node 可測；驗 dive 動作驅動撲救姿勢
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeoAnimator } from '../src/render/geoAnimator.js';

const JOINT_NAMES = ['rHip', 'lHip', 'rKnee', 'lKnee', 'spine', 'neck',
  'rShoulder', 'lShoulder', 'rElbow', 'lElbow'];

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

test('geoAnimator：未知動作不崩（trigger 防呆）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('nonexistent');
  assert.ok(anim.isIdle());
  anim.update(0.1, 0); // 不應丟例外
});
