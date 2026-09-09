import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLaunchVelocity,
  predictLandingAnalytical,
  evaluateTiming,
  calculateSpikeVelocity,
  TIMING_GRADE,
} from '../src/sim/physicsMath.js';

test('calculateLaunchVelocity：拋物線頂點與落點時間精確解算', () => {
  const start = { x: 0, y: 1.0, z: 0 };
  const target = { x: 5, y: 1.0, z: 0 };
  const apex = 4.0;
  const gravity = 9.81;

  const vel = calculateLaunchVelocity(start, target, apex, gravity);

  // 垂直速度應為 sqrt(2 * g * (apex - start.y))
  const expectedVy = Math.sqrt(2 * gravity * (apex - start.y));
  assert.ok(Math.abs(vel.vy - expectedVy) < 1e-4, `vy應為${expectedVy}，得到${vel.vy}`);

  // 飛行時間對稱：tUp = vy / g, tDown = tUp
  const expectedTime = 2 * (expectedVy / gravity);
  assert.ok(Math.abs(vel.time - expectedTime) < 1e-4, `時間應為${expectedTime}，得到${vel.time}`);

  // 水平速度 vx * time 應恰為 5
  assert.ok(Math.abs(vel.vx * vel.time - 5) < 1e-4, 'vx * time 應恰好到達目標 x');
  assert.equal(vel.vz, 0, 'vz 應為 0');
});

test('predictLandingAnalytical：解析落點與剩餘時間正確', () => {
  const pos = { x: 0, y: 4.0, z: 0 };
  const vel = { vx: 2, vy: 0, vz: 0 }; // 水平初速，從 4m 下落
  const gravity = 9.81;

  const pred = predictLandingAnalytical(pos, vel, 0, gravity);
  const expectedT = Math.sqrt((2 * 4.0) / gravity);
  assert.ok(Math.abs(pred.time - expectedT) < 1e-4, `落地時間應為${expectedT}，得到${pred.time}`);
  assert.ok(Math.abs(pred.x - 2 * expectedT) < 1e-4, 'x 落點應為 vx * t');
  assert.equal(pred.z, 0);
});

test('evaluateTiming：時機分級閾值驗證 (PERFECT/GOOD/LATE/EARLY)', () => {
  const sweetSpot = 2.0;
  const perfect = 0.08;
  const good = 0.18;

  // 正中甜蜜點
  const t1 = evaluateTiming(2.0, sweetSpot, perfect, good);
  assert.equal(t1.grade, TIMING_GRADE.PERFECT);
  assert.equal(t1.score, 1.0);

  // 偏離 0.05s（仍屬 Perfect）
  const t2 = evaluateTiming(2.05, sweetSpot, perfect, good);
  assert.equal(t2.grade, TIMING_GRADE.PERFECT);
  assert.ok(t2.score > 0.7);

  // 偏離 0.12s（屬 Good）
  const t3 = evaluateTiming(2.12, sweetSpot, perfect, good);
  assert.equal(t3.grade, TIMING_GRADE.GOOD);

  // 太晚 (+0.25s)
  const t4 = evaluateTiming(2.25, sweetSpot, perfect, good);
  assert.equal(t4.grade, TIMING_GRADE.LATE);
  assert.equal(t4.score, 0);

  // 太早 (-0.25s)
  const t5 = evaluateTiming(1.75, sweetSpot, perfect, good);
  assert.equal(t5.grade, TIMING_GRADE.EARLY);
  assert.equal(t5.score, 0);
});

test('calculateSpikeVelocity：Perfect 下釘獲得超速與向下推進角', () => {
  const from = { x: 0, y: 3.0, z: 0 };
  const target = { x: 0, z: -5 };

  const spikePerf = calculateSpikeVelocity(from, target, 20, 1.0, TIMING_GRADE.PERFECT);
  const spikeLate = calculateSpikeVelocity(from, target, 20, 0, TIMING_GRADE.LATE);

  assert.ok(spikePerf.speed > spikeLate.speed, 'Perfect扣殺速度應高於Late扣殺');
  assert.ok(spikePerf.vy < 0, '扣殺初始垂直速度應具有向下分量');
});
