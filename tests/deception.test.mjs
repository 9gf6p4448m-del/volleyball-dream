// H3 視線欺敵：騙敵線性、失誤平方；看左打右能騙開攔網、且自身失誤確實上升
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, computeDeception, TUNING } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';

test('computeDeception 曲線形狀：騙敵線性、失誤平方、θmax 封頂', () => {
  const from = { x: 0, y: 3, z: 1 };
  const aimF = { x: 0, z: -7 }; // 正前方

  const none = computeDeception(from, aimF, aimF);
  assert.deepEqual([none.theta, none.deceiveP, none.errorBoost], [0, 0, 0]);
  assert.deepEqual(computeDeception(from, aimF, null), { theta: 0, deceiveP: 0, errorBoost: 0 });

  // 45°（＝θmax）：deceiveP=gain、errorBoost=error_gain
  const at45 = computeDeception(from, aimF, { x: -8, z: -7 }); // 往左看約 45°
  assert.ok(at45.theta > 40 && at45.theta < 50, `θ=${at45.theta}`);
  const t45 = Math.min(at45.theta / TUNING.THETA_MAX_DEG, 1);
  assert.ok(Math.abs(at45.deceiveP - t45 * TUNING.DECEIVE_GAIN) < 1e-9);
  assert.ok(Math.abs(at45.errorBoost - t45 * t45 * TUNING.ERROR_GAIN) < 1e-9);

  // 半角（≈22.5°）：騙敵約一半、失誤約四分之一——線性 vs 平方的形狀差
  const half = computeDeception(from, aimF, { x: -3.31, z: -7 });
  const tH = Math.min(half.theta / TUNING.THETA_MAX_DEG, 1);
  assert.ok(Math.abs(half.deceiveP / (tH * TUNING.DECEIVE_GAIN) - 1) < 1e-9);
  assert.ok(Math.abs(half.errorBoost / (tH * tH * TUNING.ERROR_GAIN) - 1) < 1e-9);

  // 超過 θmax 封頂
  const wide = computeDeception(from, aimF, { x: 0, z: 7 }); // 180°
  assert.equal(wide.deceiveP, TUNING.DECEIVE_GAIN);
  assert.equal(wide.errorBoost, TUNING.ERROR_GAIN);

  // 退化護欄：瞄準點/視線點與擊球點重合 → 零欺敵（不假拉滿）
  assert.deepEqual(
    computeDeception(from, { x: from.x, z: from.z }, { x: -5, z: -5 }),
    { theta: 0, deceiveP: 0, errorBoost: 0 },
  );
  assert.deepEqual(
    computeDeception(from, aimF, { x: from.x, z: from.z }),
    { theta: 0, deceiveP: 0, errorBoost: 0 },
  );
});

// 佈置一顆 A 隊第三擊扣球情境：A2 高點扣；withBlock 時 B2 網前開攔網窗
function rigSpike(seed, gaze, withBlock = true) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 2;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A1';
  g.actors.A2.x = 0; g.actors.A2.z = 1.2;
  g.actors.B2.x = 0; g.actors.B2.z = -0.6;
  const b = g.ball;
  b.x = 0; b.y = 3.0; b.z = 1.2;
  b.vx = 0; b.vy = -0.5; b.vz = 0;
  b.px = b.x; b.py = b.y + 0.05; b.pz = b.z;
  const aim = { x: 0, z: -6.5 }; // 實際打正前方深區
  if (withBlock) {
    stepGame(g, [
      createIntent({ playerId: 'B2', tick: g.tick, action: 'block', aim: { x: 0, z: 0 } }),
    ]);
  } else {
    stepGame(g, []);
  }
  stepGame(g, [
    createIntent({ playerId: 'A2', tick: g.tick, action: 'spike', aim, gaze }),
  ]);
  return { g, aim };
}

test('看左打右：騙敵機率進 rally 狀態，攔網成功率確實下降', () => {
  const gazeLeft = { x: -10, z: -3 }; // 看向左側斜線（與 aim 夾角約 67° > θmax，封頂）
  let blockedStraight = 0;
  let blockedDeceived = 0;
  for (let seed = 1; seed <= 300; seed += 1) {
    const a = rigSpike(seed, null);
    assert.equal(a.g.rally.deceiveP, 0);
    if (runToDead(a.g).some((e) => e.type === 'BLOCK_TOUCH')) blockedStraight += 1;

    const d = rigSpike(seed, gazeLeft);
    assert.ok(Math.abs(d.g.rally.deceiveP - TUNING.DECEIVE_GAIN) < 1e-9);
    if (runToDead(d.g).some((e) => e.type === 'BLOCK_TOUCH')) blockedDeceived += 1;
  }
  assert.ok(blockedStraight > 0, '對照組應存在成功攔網');
  assert.ok(
    blockedDeceived < blockedStraight * 0.55,
    `欺敵未生效：直視被攔 ${blockedStraight}、欺敵被攔 ${blockedDeceived}`,
  );
});

test('失誤平方：帶大角度 gaze 的扣球，落點偏離目標的平均距離變大（無攔網、純散佈）', () => {
  const gazeLeft = { x: -10, z: -3 };
  let missStraight = 0;
  let missDeceived = 0;
  const N = 300;
  for (let seed = 1000; seed < 1000 + N; seed += 1) {
    missStraight += landingMiss(rigSpike(seed, null, false));
    missDeceived += landingMiss(rigSpike(seed, gazeLeft, false));
  }
  assert.ok(
    missDeceived / N > (missStraight / N) * 1.5,
    `失誤未上升：直視平均偏差 ${(missStraight / N).toFixed(2)}m、欺敵 ${(missDeceived / N).toFixed(2)}m`,
  );
});

function runToDead(g, maxTicks = 900) {
  const out = [];
  for (let i = 0; i < maxTicks && g.phase === 'rally'; i += 1) out.push(...stepGame(g, []));
  return out;
}

// 落點（DEAD_BALL 事件附帶座標）與瞄準點的水平距離
function landingMiss({ g, aim }) {
  const dead = runToDead(g).find((e) => e.type === 'DEAD_BALL');
  assert.ok(dead && dead.at, '應有帶座標的 DEAD_BALL');
  return Math.hypot(dead.at.x - aim.x, dead.at.z - aim.z);
}
