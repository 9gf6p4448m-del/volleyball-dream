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

test('geoAnimator dive：觸發後驅動撲救姿勢（前傾＋身體下沉＋手臂前伸）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('dive');
  const bodyY = anim.update(0.35, 0); // 播到撲出/趴地段
  assert.ok(rig.joints.spine.rotation.x < -0.1, `spine ${rig.joints.spine.rotation.x} 應前傾（撲低）`);
  assert.ok(bodyY < -0.1, `bodyY ${bodyY} 應下沉（趴地）`);
  assert.ok(rig.joints.rShoulder.rotation.x < -0.5, '手臂應前伸救球');
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

test('geoAnimator：未知動作不崩（trigger 防呆）', () => {
  const rig = mkRig();
  const anim = createGeoAnimator(rig);
  anim.trigger('nonexistent');
  assert.ok(anim.isIdle());
  anim.update(0.1, 0); // 不應丟例外
});
