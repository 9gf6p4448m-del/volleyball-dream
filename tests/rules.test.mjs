// D2×game 規則裁決：觸球上限 3、後排攻擊限制（旗標情境直驅 sim，不經 AI）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';

// 佈置一顆 A 半場上空的活球（跳過發球流程）
function rigRally(g, ballPos) {
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 0;
  r.lastTouchTeam = 'B';
  r.lastToucherId = 'B1';
  const b = g.ball;
  b.x = ballPos.x; b.y = ballPos.y; b.z = ballPos.z;
  b.vx = 0; b.vy = -1; b.vz = 0;
  b.px = b.x; b.py = b.y + 0.05; b.pz = b.z;
}

test('觸球上限：同隊第 4 次觸球 → FOUR_HITS、對方得分', () => {
  const g = createGame({ seed: 7 });
  const center = { x: 0.45, z: 5.45 };
  // 四人圍小圈互墊，其他人挪遠避免搶球
  const spots = {
    A1: { x: 0.05, z: 5.05 }, A2: { x: 0.85, z: 5.05 },
    A5: { x: 0.05, z: 5.85 }, A6: { x: 0.85, z: 5.85 },
  };
  for (const [id, s] of Object.entries(spots)) {
    g.actors[id].x = s.x; g.actors[id].z = s.z;
  }
  for (const id of ['A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6']) {
    g.actors[id].x = 3.8; g.actors[id].z = id.startsWith('A') ? 8.6 : -8.6;
  }
  rigRally(g, { x: center.x, y: 3.0, z: center.z });

  let dead = null;
  for (let i = 0; i < 6000 && !dead; i += 1) {
    const intents = Object.keys(spots).map((pid) =>
      createIntent({ playerId: pid, tick: g.tick, action: 'receive', aim: center }),
    );
    dead = stepGame(g, intents).find((e) => e.type === 'DEAD_BALL') ?? null;
  }
  assert.ok(dead, '限時內未出現死球');
  assert.equal(dead.reason, 'FOUR_HITS');
  assert.equal(g.match.score.B, 1);
  assert.equal(g.events.filter((e) => e.type === 'TOUCH').length, 3); // 前三次合法
});

test('後排攻擊限制：後排球員於前區高點扣球 → BACK_ROW_ATTACK', () => {
  const g = createGame({ seed: 3 });
  // A5 是 P5（後排）；站進前區（A 隊半場 z∈(0,3)）
  g.actors.A5.x = 0; g.actors.A5.z = 1.5;
  rigRally(g, { x: 0, y: 2.6, z: 1.5 });
  g.rally.touches = 2; // 第三擊＝攻擊

  const ev = stepGame(g, [
    createIntent({ playerId: 'A5', tick: g.tick, action: 'spike', aim: { x: 0, z: -6 } }),
  ]);
  const dead = ev.find((e) => e.type === 'DEAD_BALL');
  assert.ok(dead && dead.reason === 'BACK_ROW_ATTACK');
  assert.equal(g.match.score.B, 1);
});

test('走位邊界：推整整 10 秒也越不過中線、出不了自由區', () => {
  const g = createGame({ seed: 5 }); // 停在發球等待階段（無人發球），純測走位
  // A2 往對面（-z）與往右（+x）狂推 600 tick
  for (let i = 0; i < 600; i += 1) {
    stepGame(g, [
      createIntent({ playerId: 'A2', tick: g.tick, move: { x: 1, z: -1 }, aim: { x: 0, z: 0 } }),
    ]);
  }
  const a = g.actors.A2;
  assert.ok(a.z >= 0.12, `A 隊球員越過中線：z=${a.z}`);
  assert.ok(a.x <= 4.5 + 3, `跑出自由區：x=${a.x}`);
});

test('對照組：前排球員同高度扣球合法', () => {
  const g = createGame({ seed: 3 });
  // A2 是 P2（前排）
  g.actors.A2.x = 0; g.actors.A2.z = 1.5;
  rigRally(g, { x: 0, y: 2.6, z: 1.5 });
  g.rally.touches = 2;

  const ev = stepGame(g, [
    createIntent({ playerId: 'A2', tick: g.tick, action: 'spike', aim: { x: 0, z: -6 } }),
  ]);
  const touch = ev.find((e) => e.type === 'TOUCH');
  assert.ok(touch && touch.kind === 'spike');
  assert.ok(!ev.some((e) => e.type === 'DEAD_BALL'));
});
