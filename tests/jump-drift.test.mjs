// 跳躍前飄純函式單測（src/render/jumpDrift.js；驗收 docs/kickoffs/jump-drift-acceptance.md）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJumpDrift, stepJumpDrift, driftKindOf, JUMP_DRIFT } from '../src/render/jumpDrift.js';

const DT = 1 / 60;
// A 隊（side +1，z>0 半場）：sim 在 z=simZ（可給每幀函式模擬助跑／回防），擊球點在 hit
function run({
  seqType, airFrames = 40, hitAt = 22, hit = { x: 0, z: 1.1 }, simZ = 2.0, side = 1, post = 60,
  aim = null, simZAt = null, ball = { x: 0, z: 1.1, vx: 0, vz: 0 },
}) {
  const st = createJumpDrift();
  const out = [];
  let rootX = 0; let rootZ = simZAt ? simZAt(0) : simZ;
  let prevSim = rootZ;
  for (let i = 0; i < airFrames + post; i += 1) {
    const airborne = i < airFrames;
    const sz = simZAt ? simZAt(i) : simZ;
    stepJumpDrift(st, {
      airborne, seqType, simX: 0, simZ: sz, simVx: 0, simVz: (sz - prevSim) / DT, side, dt: DT, nominal: 0.68,
      rootX, rootZ,
      aim: aim && i < hitAt ? { ...aim, tLeft: (hitAt - i) * DT } : null,
      hit: i === hitAt ? hit : null, apexLeft: Math.max(0, (hitAt - i) * DT),
      ballX: ball.x, ballZ: ball.z, ballVx: ball.vx, ballVz: ball.vz, reset: false,
    });
    prevSim = sz;
    rootX = st.x; rootZ = sz + st.z;
    out.push({ x: st.x, z: st.z, rootX, rootZ, simZ: sz, airborne, reachW: st.reachW });
  }
  return out;
}
const STEP = 0.07; // 驗收 J3/J7（修訂 R1）

test('攻擊前飄：擊球幀 root 至少走完 80%，空中不倒退、單幀 ≤0.07 m', () => {
  const f = run({ seqType: 'windup', aim: { x: 0, z: 1.1 } });
  assert.ok(2.0 - f[22].rootZ >= 0.8 * 0.9, `擊球幀前飄 ${2.0 - f[22].rootZ}`);
  for (let i = 1; i < f.length; i += 1) {
    const step = Math.hypot(f[i].rootX - f[i - 1].rootX, f[i].rootZ - f[i - 1].rootZ);
    if (f[i].airborne) {
      assert.ok(step <= STEP + 1e-12, `第 ${i} 幀步長 ${step}`);
      assert.ok(f[i].rootZ <= f[i - 1].rootZ + 1e-12, `第 ${i} 幀倒退`);
    }
  }
});

test('空中完全不跟 sim：sim 擊球後回防，畫面上的人仍停在前方、不倒退', () => {
  const f = run({ seqType: 'windup', aim: { x: 0, z: 1.1 }, simZAt: (i) => (i < 22 ? 2.0 : 2.0 + (i - 22) * 0.06) });
  for (let i = 1; i < 40; i += 1) assert.ok(f[i].rootZ <= f[i - 1].rootZ + 1e-12, `第 ${i} 幀跟著 sim 往後`);
  assert.ok(Math.abs(f[39].rootZ - f[22].rootZ) < 0.02, `擊球後仍停在擊球位置（${f[22].rootZ}→${f[39].rootZ}）`);
});

test('落地後 0.5 s 內併回 sim（殘差 <0.01 m、每幀 ≤0.07 m），reachAssist 權重同步加回 1', () => {
  const f = run({ seqType: 'windup', aim: { x: 0, z: 1.1 }, simZAt: (i) => (i < 22 ? 2.0 : Math.min(2.6, 2.0 + (i - 22) * 0.06)) });
  for (let i = 41; i < f.length; i += 1) {
    assert.ok(Math.hypot(f[i].x - f[i - 1].x, f[i].z - f[i - 1].z) <= STEP + 1e-12, `併回第 ${i} 幀`);
  }
  assert.ok(Math.hypot(f[40 + 30].x, f[40 + 30].z) < 0.01, `落地 0.5 s 殘差 ${Math.hypot(f[70].x, f[70].z)}`);
  assert.equal(f[20].reachW, 0);
  assert.equal(f[75].reachW, 1);
});

test('攔網／歡呼／站發小跳：偏移恆為 0（完全相等），reachAssist 權重恆 1', () => {
  for (const s of ['blockJump', 'blockJumpGraze', 'block', 'cheer', 'serve', 'highfive']) {
    assert.equal(driftKindOf(s), null);
    const f = run({ seqType: s });
    for (const p of f) { assert.equal(p.x, 0); assert.equal(p.z, 0); assert.equal(p.reachW, 1); }
  }
});

test('跳舉：偏移 ≤SET_MAX（≤0.15 m），即使 sim 在空中移動也不累積', () => {
  const f = run({ seqType: 'overheadJump', ball: { x: 0.6, z: 1.0, vx: 0, vz: 0 }, hit: { x: 0.6, z: 1.0 }, simZAt: (i) => 2.0 + i * 0.03 });
  for (const p of f) assert.ok(Math.hypot(p.x, p.z) <= JUMP_DRIFT.SET_MAX + 1e-9);
  assert.ok(Math.hypot(f[f.length - 1].x, f[f.length - 1].z) < 1e-9);
});

test('跳發：沿發球方向往場內飄 0.6–1.5 m', () => {
  const f = run({ seqType: 'serveJump', simZ: 9.5, airFrames: 50, ball: { x: 0, z: 9.3, vx: 0, vz: -15 } });
  const d = 9.5 - f[49].rootZ;
  assert.ok(d >= 0.6 && d <= 1.5, `跳發前飄 ${d}`);
});

test('不過網：擊球點貼網時 root 停在離網 ≥0.15 m 的己方側', () => {
  const f = run({ seqType: 'windup', simZ: 0.6, aim: { x: 0, z: 0.02 }, hit: { x: 0, z: 0.02 } });
  for (const p of f) assert.ok(p.rootZ >= 0.15, `root z ${p.rootZ}`);
  const g = run({ seqType: 'windup', side: -1, simZ: -0.6, aim: { x: 0, z: -0.02 }, hit: { x: 0, z: -0.02 } });
  for (const p of g) assert.ok(p.rootZ <= -0.15, `B 隊 root z ${p.rootZ}`);
});

test('得分後重新佈陣（sim 瞬移）：前飄當場作廢', () => {
  const st = createJumpDrift();
  const base = { seqType: 'windup', simX: 0, side: 1, dt: DT, nominal: 0.68, aim: { x: 0, z: 1.1, tLeft: 0.3 }, hit: null, apexLeft: 0.3, reset: false, rootX: 0, rootZ: 2.0 };
  for (let i = 0; i < 20; i += 1) stepJumpDrift(st, { ...base, airborne: true, simZ: 2.0 });
  assert.ok(Math.hypot(st.x, st.z) > 0.1);
  stepJumpDrift(st, { ...base, airborne: true, simZ: 6.0 });
  assert.equal(st.x, 0); assert.equal(st.z, 0); assert.equal(st.reachW, 1);
});

test('慢動作（dt＝0.0064）：步長綁畫面幀，18 幀內仍飄到擊球點的 80% 以上', () => {
  const st = createJumpDrift();
  let rootZ = 2.0;
  for (let i = 0; i < 18; i += 1) {
    stepJumpDrift(st, {
      airborne: true, seqType: 'windup', simX: 0, simZ: 2.0, simVx: 0, simVz: 0, side: 1, dt: 0.0064, nominal: 0.68,
      rootX: 0, rootZ, aim: { x: 0, z: 1.1, tLeft: 0.1 }, hit: null, apexLeft: 0.1, reset: false,
    });
    rootZ = 2.0 + st.z;
  }
  assert.ok(2.0 - rootZ >= 0.72, `慢動作 18 幀前飄 ${2.0 - rootZ}`);
});

test('跳發：發球員斜向跑位時，沿發球方向的位移仍不超過 1.5 m', () => {
  const st = createJumpDrift();
  const dir = [0.33, -0.944]; // A 隊往 −z 發球、斜向
  let rx = 0; let rz = 9.5; let sx = 0; let sz = 9.5;
  for (let i = 0; i < 52; i += 1) {
    const nsx = sx + 0.06; const nsz = sz - 0.03; // sim 發球員往場內斜跑
    stepJumpDrift(st, {
      airborne: true, seqType: 'serveJump', simX: nsx, simZ: nsz, simVx: 3.6, simVz: -1.8, side: 1, dt: 1 / 60, nominal: 0.68,
      rootX: rx, rootZ: rz, aim: null, hit: null, apexLeft: 0.3, ballX: 0, ballZ: 9, ballVx: dir[0] * 20, ballVz: dir[1] * 20, reset: false,
    });
    sx = nsx; sz = nsz; rx = sx + st.x; rz = sz + st.z;
  }
  const along = rx * dir[0] + (rz - 9.5) * dir[1];
  assert.ok(along >= 0.6 && along <= 1.5 + 1e-9, `沿發球方向 ${along}`);
});
