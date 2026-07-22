// 強力發球（玩家決策「強○」）：timing>1.1 → 低平快弧＋散佈放大；AI/穩定發球不受影響
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { serverId } from '../src/sim/match.js';
import { localToWorld } from '../src/sim/rotation.js';

function serveWith(timing, seed = 41) {
  const g = createGame({ seed });
  g.serveReadyTick = 0; // 免等哨音間隔
  const sid = serverId(g.match);
  const aim = localToWorld('B', 0, 7.8);
  stepGame(g, [createIntent({ playerId: sid, tick: g.tick, action: 'serve', aim, timing })]);
  return g;
}

test('強力發球（timing 1.2）：水平速度明顯高於穩定發球、飛行更平', () => {
  const std = serveWith(1);
  const pow = serveWith(1.2);
  assert.equal(std.rally.profile, 'serve');
  assert.equal(pow.rally.profile, 'serve');
  const hSpeed = (g) => Math.hypot(g.ball.vx, g.ball.vz);
  assert.ok(hSpeed(pow) > hSpeed(std) * 1.15,
    `強力發球應明顯更快（強 ${hSpeed(pow).toFixed(2)} vs 穩 ${hSpeed(std).toFixed(2)} m/s）`);
  assert.ok(pow.ball.vy < std.ball.vy, '強力發球初始上拋分量應更小（低平弧）');
});

test('強力發球決定論：同種子同輸入逐值一致', () => {
  const a = serveWith(1.2, 77);
  const b = serveWith(1.2, 77);
  assert.deepEqual(
    [a.ball.vx, a.ball.vy, a.ball.vz, a.rngState],
    [b.ball.vx, b.ball.vy, b.ball.vz, b.rngState],
  );
});
