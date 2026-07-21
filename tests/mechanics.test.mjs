// 機制包：蓄力輕重（timing→扣球速度）與高低手球質（觸點高度→精度）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, receiveQualityMul, TUNING } from '../src/sim/game.js';
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

test('高低手球質：高手 < 標準低手 < 貼地撲救（散佈乘數遞增）', () => {
  const p = createPlayer({ id: 'T', name: 't', teamId: 'A', height: 1.86 });
  const shoulder = standingReach(p) * 0.62;
  const high = receiveQualityMul(shoulder + 0.2, p);
  const mid = receiveQualityMul(1.0, p);
  const dig = receiveQualityMul(0.3, p);
  assert.ok(high < mid && mid < dig, `${high} / ${mid} / ${dig} 未遞增`);
  assert.equal(high, 0.7);
  assert.equal(mid, 1.0);
  assert.equal(dig, 1.35);
});
