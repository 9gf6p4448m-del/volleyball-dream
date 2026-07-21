// 排球物理行為：地板反彈衰減、球網攔阻、過網不受干擾
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBall, stepBall } from '../src/sim/ball.js';
import { SIM_DT, COURT, BALL } from '../src/sim/constants.js';

function makeBall(state) {
  const b = createBall();
  Object.assign(b, state, { px: state.x, py: state.y, pz: state.z });
  return b;
}

test('自由落體觸地後反彈，且反彈高度低於落下高度', () => {
  const b = makeBall({ x: 0, y: 2, z: 5, vx: 0, vy: 0, vz: 0 });
  let peakAfterBounce = 0;
  let bounced = false;
  for (let i = 0; i < 60 * 4; i += 1) {
    stepBall(b, SIM_DT);
    if (b.y === BALL.RADIUS && b.vy > 0) bounced = true;
    if (bounced) peakAfterBounce = Math.max(peakAfterBounce, b.y);
  }
  assert.ok(bounced, '球從未觸地反彈');
  assert.ok(peakAfterBounce > 0.5, `反彈高度過低：${peakAfterBounce}`);
  assert.ok(peakAfterBounce < 2, `反彈高度未衰減：${peakAfterBounce}`);
});

test('低於網上緣的平飛球被網擋回原側', () => {
  // 從 z>0 側以 1.8m 高度平射向對面：0.25 秒後穿越 z=0，高度約 1.49m，
  // 落在網面範圍（網下緣 1.43m ～ 網上緣 2.43m）內 → 必觸網
  const b = makeBall({ x: 0, y: 1.8, z: 3, vx: 0, vy: 0, vz: -12 });
  for (let i = 0; i < 60 * 2; i += 1) stepBall(b, SIM_DT);
  assert.ok(b.z > 0, `球應被擋回 z>0 側，實際 z=${b.z}`);
});

test('高於網上緣的球正常過網', () => {
  const b = makeBall({ x: 0, y: 3.2, z: 3, vx: 0, vy: 1, vz: -10 });
  let crossed = false;
  for (let i = 0; i < 60; i += 1) {
    stepBall(b, SIM_DT);
    if (b.z < -0.5) { crossed = true; break; }
  }
  assert.ok(crossed, '球應飛越球網進入對面半場');
});

test('從網下緣以下通過（無網面阻擋）', () => {
  const netBottom = COURT.NET_HEIGHT - COURT.NET_BAND; // 1.43m
  const b = makeBall({ x: 0, y: 0.5, z: 1, vx: 0, vy: 2, vz: -6 });
  let crossed = false;
  for (let i = 0; i < 30; i += 1) {
    stepBall(b, SIM_DT);
    if (b.z < -0.3) { crossed = true; break; }
  }
  assert.ok(b.y < netBottom + 1, '測試前提：穿越時高度需在網下緣附近');
  assert.ok(crossed, '網下緣以下應可通過');
});
