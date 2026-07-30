// 彈道工具測試 — predictContactPoint（走位深度）＋解算函式特徵測試（§十-4 動手前鎖現行為）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  predictContactPoint, predictLanding, velocityForApex, velocityForTime,
  spikeVelocity, heightAtNet,
} from '../src/sim/flight.js';
import { stepBall } from '../src/sim/ball.js';
import { SIM_DT, BALL, COURT } from '../src/sim/constants.js';

// 解析位置：初速 v 出發 t 秒後的座標（與 flight.js 同一重力約定）
const posAt = (from, v, t) => ({
  x: from.x + v.vx * t,
  y: from.y + v.vy * t + 0.5 * BALL.GRAVITY * t * t,
  z: from.z + v.vz * t,
});
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg}：${a} vs ${b}`);

const mkBall = (o) => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, px: 0, py: 0, pz: 0, ...o });

test('predictContactPoint：回傳球下墜墜破指定接球高度時的水平位置', () => {
  const ball = mkBall({ y: 3, vx: 0.6, vy: 1, vz: 0.4 }); // 先升後落
  const contactY = 1.2;
  const cp = predictContactPoint(ball, contactY);
  assert.ok(cp, '應找到接觸點');
  // 手動步進到 cp.ticks：球應剛墜破 contactY、正在下墜，且水平位置與回傳一致
  const b = mkBall(ball);
  for (let i = 0; i < cp.ticks; i += 1) stepBall(b, SIM_DT);
  assert.ok(Math.abs(b.y - contactY) < 0.1, `球高 ${b.y} 應≈${contactY}`);
  assert.ok(b.vy < 0, '接觸點應在下墜段');
  assert.ok(Math.abs(b.x - cp.x) < 1e-9 && Math.abs(b.z - cp.z) < 1e-9);
});

test('predictContactPoint：接觸點比地板落點更早（人站更前、真的在球下方）', () => {
  const ball = mkBall({ y: 3, vx: 1.0, vy: 0.5 }); // 持續往 +x 飛
  const cp = predictContactPoint(ball, 1.2);
  const land = predictLanding(ball);
  assert.ok(cp.ticks < land.ticks, '接觸點應早於觸地');
  assert.ok(cp.x < land.x, `接觸點 x=${cp.x} 應 < 地板落點 x=${land.x}`);
});

test('predictContactPoint：低平球全程不及接球高度→回退地板落點', () => {
  const ball = mkBall({ y: 0.5, vx: 2, vy: 0.1 }); // 升幅極小、從未到 1.2
  const cp = predictContactPoint(ball, 1.2);
  const land = predictLanding(ball);
  assert.deepEqual(cp, land);
});

// ==== §十-4 動手前特徵測試：鎖住解算函式的現行為 ====

test('velocityForApex：t=T 恰達目標、弧頂≈要求高度', () => {
  const from = { x: 1, y: 2.0, z: 5 };
  const to = { x: 4, y: BALL.RADIUS, z: -3 };
  const v = velocityForApex(from, to, 4.6);
  const end = posAt(from, v, v.time);
  near(end.x, to.x, 1e-9, '終點 x');
  near(end.y, to.y, 1e-9, '終點 y');
  near(end.z, to.z, 1e-9, '終點 z');
  const tUp = v.vy / (-BALL.GRAVITY);
  near(posAt(from, v, tUp).y, 4.6, 1e-9, '弧頂');
});

test('velocityForApex：apexY 低於起訖點→自動抬升到最低可解弧頂', () => {
  const from = { x: 0, y: 3.0, z: 2 };
  const v = velocityForApex(from, { x: 0, y: 1.0, z: -2 }, 1.5); // 低於起點
  const tUp = v.vy / (-BALL.GRAVITY);
  near(posAt(from, v, tUp).y, 3.15, 1e-9, '最低弧頂＝max(起,訖)+0.15');
});

test('velocityForTime：t=T 恰達目標（vy 含重力補償）', () => {
  const from = { x: 0, y: 2.5, z: 4 };
  const to = { x: 3, y: BALL.RADIUS, z: -5 };
  const v = velocityForTime(from, to, 0.7);
  const end = posAt(from, v, 0.7);
  near(end.x, to.x, 1e-9, '終點 x');
  near(end.y, to.y, 1e-9, '終點 y');
  near(end.z, to.z, 1e-9, '終點 z');
});

test('heightAtNet：回傳彈道通過 z=0 時的高度；不跨網回 null', () => {
  const from = { x: 0, y: 2.8, z: 3 };
  const v = velocityForTime(from, { x: 0, y: BALL.RADIUS, z: -4 }, 0.6);
  const tNet = -from.z / v.vz;
  near(heightAtNet(from, v), posAt(from, v, tNet).y, 1e-9, '網面高度');
  assert.equal(heightAtNet(from, { vx: 1, vy: 0, vz: 0 }), null, 'vz=0 → null');
  assert.equal(heightAtNet({ ...from, z: -1 }, { vx: 0, vy: 0, vz: -2 }), null, '同側遠離 → null');
});

test('spikeVelocity：低手點跨網扣→夾限綁定，網口恰為最低通過高度', () => {
  const from = { x: 0, y: 2.2, z: 3.5 }; // 後排低手點：直線必穿網
  const to = { x: 1, y: BALL.RADIUS, z: -4 };
  const v = spikeVelocity(from, to, 18, 0.18);
  near(heightAtNet(from, v), COURT.NET_HEIGHT + BALL.RADIUS + 0.12, 1e-9, '綁定＝貼夾限');
  const end = posAt(from, v, v.time);
  near(end.y, to.y, 1e-9, '仍恰達目標');
});

test('spikeVelocity：高手點近網直線本就淨空→T 不被拉長、速度全保留', () => {
  const from = { x: 0, y: 3.4, z: 0.6 }; // 前排高點貼網（弦在網面 ≈2.91m，自然淨空）
  const to = { x: 0, y: BALL.RADIUS, z: -3.4 };
  const speed = 20;
  const v = spikeVelocity(from, to, speed, 0.18);
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  near(v.time, d / speed, 1e-9, 'T＝距離/速度（未被夾限抬升）');
  assert.ok(heightAtNet(from, v) > COURT.NET_HEIGHT + BALL.RADIUS + 0.12, '自然淨空');
});
