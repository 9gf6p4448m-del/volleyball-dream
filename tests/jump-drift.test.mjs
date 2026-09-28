// 跳躍前飄純函式單測（src/render/jumpDrift.js；驗收 docs/kickoffs/jump-drift-acceptance.md）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJumpDrift, stepJumpDrift, driftKindOf, JUMP_DRIFT } from '../src/render/jumpDrift.js';

const DT = 1 / 60;
// A 隊（side +1，z>0 半場）：sim 停在 z=2.0，擊球點在 z=1.1（前 0.9 m）
function run({ seqType, airFrames = 40, hitAt = 22, hit = { x: 0, z: 1.1 }, simZ = 2.0, side = 1, post = 60, aim = null }) {
  const st = createJumpDrift();
  const out = [];
  for (let i = 0; i < airFrames + post; i += 1) {
    const airborne = i < airFrames;
    stepJumpDrift(st, {
      airborne, seqType, simX: 0, simZ, side, dt: DT, nominal: 0.68,
      aim: aim && i < hitAt ? { ...aim, tLeft: (hitAt - i) * DT } : null,
      hit: i === hitAt ? hit : null, apexLeft: Math.max(0, (hitAt - i) * DT), reset: false,
    });
    out.push({ x: st.x, z: st.z, rootZ: simZ + st.z, airborne });
  }
  return out;
}

test('攻擊前飄：擊球幀 root 至少走完 sim 到擊球點的 80%，且不倒退、單幀 ≤0.05 m', () => {
  const f = run({ seqType: 'windup', aim: { x: 0, z: 1.1 } });
  const atHit = 2.0 - f[22].rootZ;
  assert.ok(atHit >= 0.8 * 0.9, `擊球幀前飄 ${atHit}`);
  for (let i = 1; i < f.length; i += 1) {
    const step = Math.hypot(f[i].x - f[i - 1].x, f[i].z - f[i - 1].z);
    assert.ok(step <= 0.05 + 1e-12, `第 ${i} 幀步長 ${step}`);
    if (f[i].airborne) assert.ok(f[i].rootZ <= f[i - 1].rootZ + 1e-12, `第 ${i} 幀倒退`);
  }
});

test('落地後 0.5 s 內併回 sim（殘差 <0.01 m）', () => {
  const f = run({ seqType: 'windup', aim: { x: 0, z: 1.1 } });
  const at = f[40 + 30];
  assert.ok(Math.hypot(at.x, at.z) < 0.01, `落地 0.5 s 殘差 ${Math.hypot(at.x, at.z)}`);
});

test('攔網／歡呼／站發小跳：偏移恆為 0（完全相等）', () => {
  for (const s of ['blockJump', 'blockJumpGraze', 'block', 'cheer', 'serve']) {
    assert.equal(driftKindOf(s), null);
    const f = run({ seqType: s });
    for (const p of f) { assert.equal(p.x, 0); assert.equal(p.z, 0); }
  }
});

test('跳舉：偏移上限 SET_MAX（≤0.15 m）', () => {
  const f = run({ seqType: 'overheadJump', aim: { x: 0.6, z: 1.0 }, hit: { x: 0.6, z: 1.0 } });
  for (const p of f) assert.ok(Math.hypot(p.x, p.z) <= JUMP_DRIFT.SET_MAX + 1e-9);
});

test('不過網：擊球點貼網時 root 停在離網 ≥0.15 m 的己方側', () => {
  const f = run({ seqType: 'windup', simZ: 0.6, aim: { x: 0, z: 0.02 }, hit: { x: 0, z: 0.02 } });
  for (const p of f) assert.ok(p.rootZ >= 0.15, `root z ${p.rootZ}`);
  const g = run({ seqType: 'windup', side: -1, simZ: -0.6, aim: { x: 0, z: -0.02 }, hit: { x: 0, z: -0.02 } });
  for (const p of g) assert.ok(p.rootZ <= -0.15, `B 隊 root z ${p.rootZ}`);
});

test('得分後重新佈陣（sim 瞬移）：前飄當場作廢', () => {
  const st = createJumpDrift();
  const base = { seqType: 'windup', simX: 0, side: 1, dt: DT, nominal: 0.68, aim: { x: 0, z: 1.1, tLeft: 0.3 }, hit: null, apexLeft: 0.3, reset: false };
  for (let i = 0; i < 20; i += 1) stepJumpDrift(st, { ...base, airborne: true, simZ: 2.0 });
  assert.ok(Math.hypot(st.x, st.z) > 0.1);
  stepJumpDrift(st, { ...base, airborne: true, simZ: 6.0 });
  assert.equal(st.x, 0); assert.equal(st.z, 0);
});
