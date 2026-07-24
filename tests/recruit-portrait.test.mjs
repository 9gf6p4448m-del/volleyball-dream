// 開卡儀式立繪 — 純邏輯測試（姿勢挑選／入隊台詞決定論）。
// createRecruitPortrait 本身需要真實 canvas/WebGL，不在此測（node --check 過即可，見任務驗收）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  idHashLocal, pickPortraitPose, applyPortraitPose, pickJoinLine, ROLE_POSES, DEFAULT_POSE,
} from '../src/render/recruitPortrait.js';

function mkJoints() {
  const names = ['rShoulder', 'lShoulder', 'rElbow', 'lElbow', 'spine', 'neck'];
  const j = {};
  for (const n of names) j[n] = { rotation: { x: 0, y: 0, z: 0 } };
  return j;
}

test('pickPortraitPose：已知角色回傳對應姿勢，未知角色回退 DEFAULT_POSE', () => {
  assert.equal(pickPortraitPose('middle'), ROLE_POSES.middle);
  assert.equal(pickPortraitPose('setter'), ROLE_POSES.setter);
  assert.equal(pickPortraitPose('unknown-role'), DEFAULT_POSE);
  assert.equal(pickPortraitPose(undefined), DEFAULT_POSE);
});

test('applyPortraitPose：把姿勢寫進 joints（middle 攔網雙手高舉，rSh/lSh x 分量大幅前伸）', () => {
  const joints = mkJoints();
  applyPortraitPose(joints, pickPortraitPose('middle'));
  assert.equal(joints.rShoulder.rotation.x, ROLE_POSES.middle.rSh[0]);
  assert.equal(joints.lShoulder.rotation.x, ROLE_POSES.middle.lSh[0]);
  assert.equal(joints.spine.rotation.x, ROLE_POSES.middle.spine);
  assert.ok(joints.rShoulder.rotation.x < -2, '攔網手應大幅高舉（x 大幅負值）');
});

test('applyPortraitPose：libero 為抱胸防守姿，肘部大彎（區別於 outside 單手高舉）', () => {
  const joints = mkJoints();
  applyPortraitPose(joints, pickPortraitPose('libero'));
  assert.ok(joints.rElbow.rotation.x < -1, `自由人肘部應大彎抱胸（${joints.rElbow.rotation.x}）`);

  const outsideJoints = mkJoints();
  applyPortraitPose(outsideJoints, pickPortraitPose('outside'));
  assert.ok(outsideJoints.rElbow.rotation.x > -1, '主攻單手高舉肘部不應大彎（區別於自由人）');
});

test('idHashLocal：同 id 恆同值（決定論），不同 id 通常不同值', () => {
  assert.equal(idHashLocal('R3'), idHashLocal('R3'));
  assert.notEqual(idHashLocal('R3'), idHashLocal('R4'));
});

test('pickJoinLine：同一成員（id/role 相同）每次挑同一句——決定論，同存檔重演一致', () => {
  const member = { id: 'R7', role: 'middle' };
  const first = pickJoinLine(member);
  for (let i = 0; i < 5; i += 1) assert.equal(pickJoinLine(member), first);
});

test('pickJoinLine：不同角色從各自台詞池挑選，未知角色回退預設句', () => {
  const setterLine = pickJoinLine({ id: 'R1', role: 'setter' });
  const middleLine = pickJoinLine({ id: 'R1', role: 'middle' });
  assert.notEqual(setterLine, middleLine); // 不同角色台詞池不重疊
  const fallback = pickJoinLine({ id: 'RX', role: 'unknown-role' });
  assert.equal(fallback, '——以後，我們是一隊了。');
});
