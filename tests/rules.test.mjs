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

test('後排攻擊誤判修正：起跳前在線後、觸球時已助跑飄過線 → 不判 BACK_ROW_ATTACK', () => {
  const g = createGame({ seed: 3 });
  g.actors.A5.x = 0; g.actors.A5.z = 5; // 起跳前：合法後排位置（z>3）
  rigRally(g, { x: 0, y: 2.6, z: 1.5 });
  g.rally.touches = 2; // 第三擊＝攻擊

  // 助跑：20 tick（< TAKEOFF_LOOKBACK_TICKS=24）內線性跑出前區；每 tick 固定球高，
  // 隔絕物理墜球對「ball.y > NET_HEIGHT」判定的干擾，單純測位置回溯窗
  const steps = 20;
  for (let i = 1; i <= steps; i += 1) {
    g.actors.A5.z = 5 - (5 - 1.5) * (i / steps);
    g.ball.x = 0; g.ball.y = 2.6; g.ball.z = 1.5; g.ball.vx = 0; g.ball.vy = -1; g.ball.vz = 0;
    stepGame(g, []);
  }
  assert.ok(g.actors.A5.z < 3, '助跑後應已進入前區（測試前提）');

  g.ball.x = 0; g.ball.y = 2.6; g.ball.z = 1.5; g.ball.vx = 0; g.ball.vy = -1; g.ball.vz = 0;
  const ev = stepGame(g, [
    createIntent({ playerId: 'A5', tick: g.tick, action: 'spike', aim: { x: 0, z: -6 } }),
  ]);
  const foul = ev.find((e) => e.type === 'DEAD_BALL' && e.reason === 'BACK_ROW_ATTACK');
  assert.equal(foul, undefined, '起跳當下在線後、觸球時前飄過線應視為合法後排攻擊');
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

test('隔網禁觸：對方組織中的球（未過網）防守方碰不到、不得誤吹四擊', () => {
  const g = createGame({ seed: 11 });
  // 佈景：B 隊已三擊、扣球剛出手仍在 B 半場網前；A 網前防守者在可及範圍
  // （實掃 30 種子 173 次誤吹的標準現場——修前此景必吹 A 隊 FOUR_HITS）
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'spike';
  r.possession = 'B';
  r.touches = 3;
  r.lastTouchTeam = 'B';
  r.lastToucherId = 'B2';
  const b = g.ball;
  b.x = 1.4; b.y = 2.5; b.z = -0.3;
  b.vx = 0; b.vy = -0.5; b.vz = 4.5;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 1.5; g.actors.A3.z = 0.6;

  const ev = stepGame(g, [
    createIntent({ playerId: 'A3', tick: g.tick, action: 'receive', aim: { x: 0, z: 6 } }),
  ]);
  assert.equal(ev.find((e) => e.type === 'DEAD_BALL'), undefined, '不得吹任何犯規');
  assert.equal(ev.find((e) => e.type === 'TOUCH'), undefined, '球在對方半場不得觸球');
});

test('觸球計數隨持球方重置：換邊第一觸＝1，不繼承對方計數', () => {
  const g = createGame({ seed: 12 });
  // 佈景：球在 A 半場、possession 仍掛 B 且 touches=3（攔網回彈落對側類情境）
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'B';
  r.touches = 3;
  r.lastTouchTeam = 'B';
  r.lastToucherId = 'B1';
  const b = g.ball;
  b.x = 0; b.y = 1.5; b.z = 4;
  b.vx = 0; b.vy = -1; b.vz = 0;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A5.x = 0; g.actors.A5.z = 4.2;

  const ev = stepGame(g, [
    createIntent({ playerId: 'A5', tick: g.tick, action: 'receive', aim: { x: 0, z: 2 } }),
  ]);
  const touch = ev.find((e) => e.type === 'TOUCH');
  assert.ok(touch, '本方半場的球可以觸');
  assert.equal(touch.touches, 1, '換權第一觸應計 1');
  assert.equal(ev.find((e) => e.type === 'DEAD_BALL'), undefined);
});
