// 機制包：蓄力輕重（timing→扣球速度）與高低手球質（觸點高度→精度）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, stepGame, receiveQualityMul, timingQualityMul, blockTimingMul,
  receivePerfectMul, TUNING,
} from '../src/sim/game.js';
import { createPlayer, standingReach } from '../src/sim/player.js';
import { createIntent } from '../src/sim/intent.js';

function rigThirdHit(seed) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 2;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A1';
  g.actors.A2.x = 0; g.actors.A2.z = 1.2;
  const b = g.ball;
  b.x = 0; b.y = 3.0; b.z = 1.2;
  b.vx = 0; b.vy = -0.5; b.vz = 0;
  b.px = b.x; b.py = b.y + 0.05; b.pz = b.z;
  return g;
}

function spikeSpeedWithTiming(seed, timing) {
  const g = rigThirdHit(seed);
  const ev = stepGame(g, [
    createIntent({
      playerId: 'A2', tick: g.tick, action: 'spike', aim: { x: 0, z: -6.5 }, timing,
    }),
  ]);
  assert.ok(ev.some((e) => e.type === 'TOUCH' && e.kind === 'spike'), '扣球未成立');
  const b = g.ball;
  return Math.hypot(b.vx, b.vy, b.vz);
}

test('蓄力輕重：timing 蓄滿的扣球明顯快於輕點（輕吊）', () => {
  for (const seed of [1, 7, 42]) {
    const hard = spikeSpeedWithTiming(seed, 1);
    const tip = spikeSpeedWithTiming(seed, 0.05);
    assert.ok(
      tip < hard * 0.75,
      `輕吊未變慢：重扣 ${hard.toFixed(1)} vs 輕吊 ${tip.toFixed(1)} m/s`,
    );
    // 輕吊速度下限守住（不會慢到物理荒謬）
    assert.ok(tip > hard * (TUNING.TIP_SPEED_MIN - 0.08));
  }
});

test('TOUCH 事件帶 power（表現層分輕吊/重扣音效）', () => {
  const g = rigThirdHit(3);
  const ev = stepGame(g, [
    createIntent({
      playerId: 'A2', tick: g.tick, action: 'spike', aim: { x: 0, z: -6.5 }, timing: 0.3,
    }),
  ]);
  const touch = ev.find((e) => e.type === 'TOUCH');
  assert.equal(touch.power, 0.3);
});

test('出手品質：甜蜜區最準、超蓄最飄、其餘標準', () => {
  assert.equal(timingQualityMul(0.85), TUNING.SWEET_ACC);  // 甜蜜區
  assert.equal(timingQualityMul(0.3), 1.0);                // 提前放
  assert.equal(timingQualityMul(1.3), TUNING.OVER_ACC);    // 超蓄
  assert.ok(TUNING.SWEET_ACC < 1 && TUNING.OVER_ACC > 1);
});

test('超蓄懲罰：timing 1.3 的扣球比蓄滿慢（力度掉到 0.85）', () => {
  const full = spikeSpeedWithTiming(21, 1);
  const over = spikeSpeedWithTiming(21, 1.3);
  assert.ok(over < full, `超蓄未變慢：${over.toFixed(1)} vs ${full.toFixed(1)}`);
});

test('攔網時機：太晚/甜蜜/太早的成功率乘數', () => {
  assert.equal(blockTimingMul(1), TUNING.BLOCK_LATE_MUL);
  assert.equal(blockTimingMul(12), 1.0);
  assert.equal(blockTimingMul(40), TUNING.BLOCK_EARLY_MUL);
});

test('Perfect 接球：timing≥0.95 一傳更準；AI 基準 0.75 拿不到', () => {
  assert.equal(receivePerfectMul(1), TUNING.PERFECT_RECV_ACC);
  assert.equal(receivePerfectMul(0.95), TUNING.PERFECT_RECV_ACC);
  assert.equal(receivePerfectMul(0.75), 1);
  assert.equal(receivePerfectMul(0.6), 1);
});

test('接球品質吃技術屬性：高 control+reaction 球員接球明顯較準（自由人最強）', () => {
  const reach = TUNING.REACH_RADIUS;
  const libero = createPlayer({ id: 'L', name: 'l', teamId: 'A', height: 1.72, attributes: { control: 72, reaction: 74 } });
  const normal = createPlayer({ id: 'N', name: 'n', teamId: 'A', height: 1.9, attributes: { control: 65, reaction: 60 } });
  // 同樣的到位程度，自由人（技術高）散佈乘數明顯較低＝接得準
  assert.ok(receiveQualityMul(1.0, reach, libero) < receiveQualityMul(1.0, reach, normal));
});

test('接球品質：到位程度為次要修正（走到位＜勉強搆，但不主導）', () => {
  const p = createPlayer({ id: 'T', name: 't', teamId: 'A', height: 1.86, attributes: { control: 66, reaction: 62 } });
  const reach = TUNING.REACH_RADIUS;
  const onpoint = receiveQualityMul(0, reach, p);        // 走到球正下方
  const stretch = receiveQualityMul(reach, reach, p);    // 極限勉強搆
  assert.ok(onpoint < stretch, `到位 ${onpoint} 應優於勉強 ${stretch}`);
  // 但到位修正是次要（±10% 量級），不像技術屬性那樣拉開大差距
  assert.ok(stretch / onpoint < 1.3, '到位修正應為次要（<30% 差距）');
  // 魚躍（dist 超過正常 reach）＝到位比例 clamp 到 1
  assert.equal(receiveQualityMul(reach * 1.8, reach, p), stretch);
});
