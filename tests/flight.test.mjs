// 彈道工具測試 — predictContactPoint（走位深度：球墜到接球高度時的水平位置）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictContactPoint, predictLanding } from '../src/sim/flight.js';
import { stepBall } from '../src/sim/ball.js';
import { SIM_DT } from '../src/sim/constants.js';

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
