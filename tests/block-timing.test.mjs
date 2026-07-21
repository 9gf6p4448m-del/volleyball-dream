// CRITICAL 迴歸（冷審發現）：攔網與落地判定不得同 tick 交錯；低於網的球不可被攔
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';

// 佈置：A 隊已完成第三擊（扣球球路），低平球飛向 B 半場，B2 在網前持續開攔網窗
function rigLowSpike(seed, y, vy) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'spike';
  r.possession = 'A';
  r.touches = 3;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A2';
  g.actors.B2.x = 0; g.actors.B2.z = -0.6; // P2 前排攔網位
  const b = g.ball;
  b.x = 0; b.y = y; b.z = 0.6;
  b.vx = 0; b.vy = vy; b.vz = -12;
  b.px = b.x; b.py = b.y; b.pz = b.z + 0.2;
  return g;
}

function runUntilDead(g, maxTicks = 900) {
  for (let i = 0; i < maxTicks && g.phase === 'rally'; i += 1) {
    stepGame(g, [
      createIntent({ playerId: 'B2', tick: g.tick, action: 'block', aim: { x: 0, z: 0 } }),
    ]);
  }
}

test('低於網的球不可被攔：網下穿越只會落地判分，無 BLOCK_TOUCH', () => {
  const g = rigLowSpike(11, 0.8, -1.5);
  runUntilDead(g);
  assert.ok(!g.events.some((e) => e.type === 'BLOCK_TOUCH'), '網下球被攔到了');
  assert.ok(g.events.some((e) => e.type === 'DEAD_BALL'));
  assert.equal(g.match.score.A, 1); // 球落 B 半場界內 → A 得分
});

test('掃描各高度/速度組合：BLOCK_TOUCH 不得與 DEAD_BALL/SCORE 同 tick', () => {
  let blockedCases = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    for (const y of [0.5, 0.9, 1.4, 2.0, 2.35, 2.5, 2.7, 2.9]) {
      const g = rigLowSpike(seed * 7, y, -0.8 - (seed % 5) * 0.7);
      runUntilDead(g);
      if (g.events.some((e) => e.type === 'BLOCK_TOUCH')) blockedCases += 1;
      const byTick = new Map();
      for (const e of g.events) {
        if (!byTick.has(e.tick)) byTick.set(e.tick, new Set());
        byTick.get(e.tick).add(e.type);
      }
      for (const [tick, types] of byTick) {
        if (types.has('BLOCK_TOUCH')) {
          assert.ok(
            !types.has('DEAD_BALL') && !types.has('SCORE'),
            `y=${y} seed=${seed} tick=${tick} 攔網與判分同 tick 交錯`,
          );
        }
      }
    }
  }
  assert.ok(blockedCases > 0, '掃描組合中應存在真的攔到球的案例（測試才有覆蓋力）');
});
