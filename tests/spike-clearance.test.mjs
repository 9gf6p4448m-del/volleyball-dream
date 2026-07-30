// §十-4 彈道自由度 — 目標過網高度模型（B 案）行為測試
// 裁定依據：docs/kickoffs/phase5-section10-4-discussion-brief.md §六.5
// 驗收閘＝相對序（吊<快<兩翼<後排）＋硬地板；絕對帶值為調參項不在此鎖死
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING, spikeRouteAt, spikeClearanceFor } from '../src/sim/game.js';
import { spikeVelocity, heightAtNet } from '../src/sim/flight.js';
import { COURT, BALL } from '../src/sim/constants.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg}：${a} vs ${b}`);
const HARD_FLOOR = COURT.NET_HEIGHT + BALL.RADIUS + 0.04; // 帶下緣最低淨空（擦網防線）

test('SPIKE_CLEARANCE 帶：相對序（吊<快<兩翼<後排）與硬地板', () => {
  const { tip, quick, wing, back } = TUNING.SPIKE_CLEARANCE;
  for (const [name, [lo, hi]] of Object.entries(TUNING.SPIKE_CLEARANCE)) {
    assert.ok(lo < hi, `${name} 帶 lo<hi`);
    assert.ok(lo >= HARD_FLOOR, `${name} 帶下緣 ${lo} 不得低於硬地板 ${HARD_FLOOR}`);
  }
  assert.ok(tip[0] < quick[0] && quick[0] < wing[0] && wing[0] < back[0], '帶下緣相對序');
  assert.ok(tip[1] < wing[0], '吊球帶整帶低於兩翼帶（相對序的分離保證）');
});

test('spikeClearanceFor：timing 好→帶下緣、差→帶上緣；輕吊帶內同理', () => {
  const t = TUNING.TIP_CLEAR_T;
  const { quick, wing, back, tip } = TUNING.SPIKE_CLEARANCE;
  near(spikeClearanceFor('wing', 1), wing[0], 1e-9, '滿蓄兩翼＝下緣');
  near(spikeClearanceFor('wing', t + 1e-9), wing[1], 1e-6, '剛過吊球檔＝上緣');
  near(spikeClearanceFor('quick', 1), quick[0], 1e-9, '滿蓄快攻＝下緣');
  near(spikeClearanceFor('back', 1), back[0], 1e-9, '滿蓄後排＝下緣');
  near(spikeClearanceFor('tip', t), tip[0], 1e-9, '吊球蓄滿檔＝下緣（尖銳吊）');
  near(spikeClearanceFor('tip', 0), tip[1], 1e-9, '零蓄吊球＝上緣');
  // 帶內單調：品質越好過網越低（同型態內恆成立）
  assert.ok(spikeClearanceFor('back', 0.9) < spikeClearanceFor('back', 0.6), '帶內單調');
});

test('spikeRouteAt：tip 檔／攻擊線後＝back／快攻舉球＝quick／其餘＝wing', () => {
  const mk = (lastSetKind) => ({ rally: { lastSetKind } });
  assert.equal(spikeRouteAt(mk(null), 'A', 1.0, 0.3), 'tip', '輕蓄力＝吊球（優先於位置）');
  assert.equal(spikeRouteAt(mk(null), 'A', COURT.ATTACK_LINE + 0.5, 1), 'back', '攻擊線後');
  assert.equal(spikeRouteAt(mk(null), 'A', -(COURT.ATTACK_LINE + 0.5), 1), 'back', '負 z 側同判');
  assert.equal(
    spikeRouteAt(mk({ team: 'A', kind: 'quick' }), 'A', 1.0, 1), 'quick', '我方快攻舉球',
  );
  assert.equal(
    spikeRouteAt(mk({ team: 'B', kind: 'quick' }), 'A', 1.0, 1), 'wing', '對方的快攻舉球不外溢',
  );
  assert.equal(spikeRouteAt(mk({ team: 'A', kind: 'high' }), 'A', 1.0, 1), 'wing', '高舉＝兩翼');
});

test('spikeVelocity＋clearance：後排低手點被拉到目標帶、目標仍恰達', () => {
  const from = { x: 0, y: 2.6, z: 3.6 }; // 後排起扣（自然彈道遠低於後排帶）
  const to = { x: 1, y: BALL.RADIUS, z: -4 };
  const c = spikeClearanceFor('back', 1); // 2.75
  const v = spikeVelocity(from, to, 20, TUNING.SPIKE_MIN_TIME, c);
  near(heightAtNet(from, v), c, 1e-9, '過網高度＝目標帶值');
  const end = {
    y: from.y + v.vy * v.time + 0.5 * BALL.GRAVITY * v.time * v.time,
  };
  near(end.y, to.y, 1e-9, '落點不變');
  // 差 timing 的同型態扣球要過得更高（帶上緣）——分佈存在的最小證明
  const vPoor = spikeVelocity(from, to, 20, TUNING.SPIKE_MIN_TIME, spikeClearanceFor('back', 0.5));
  assert.ok(heightAtNet(from, vPoor) > heightAtNet(from, v) + 0.05, '差品質過網更高');
});
