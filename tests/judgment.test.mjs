// 出界判斷與喊球：明顯出界放球、壓線寧接（寧搶錯）、玩家喊球搶下鎖定
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { velocityForApex } from '../src/sim/flight.js';

// 佈置：A 隊送往 B 半場的來球，落點指定（用同一套彈道解算，落點即準確落點）
function rigIncoming(seed, targetZ, targetX = 0) {
  const g = createGame({ seed });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'arc';
  r.possession = 'A';
  r.touches = 0;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A1';
  const b = g.ball;
  b.x = 0; b.y = 2.5; b.z = 5;
  const v = velocityForApex(b, { x: targetX, y: 0.105, z: targetZ }, 5);
  b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  r.flightId += 1; // 新 flight → AI 重新規劃
  return g;
}

test('明顯出界（超出底線 1.5m）：無人接、全隊放球', () => {
  for (const seed of [1, 5, 9]) {
    const g = rigIncoming(seed, -10.5);
    const ai = createAiState();
    aiCollectIntents(g, ai);
    assert.equal(ai.claimId, null, `seed ${seed} 出界球還有人去接`);
    assert.equal(ai.letDrop, true);
  }
});

test('界內深球（底線內 0.5m）：正常指派接球', () => {
  const g = rigIncoming(2, -8.5);
  const ai = createAiState();
  aiCollectIntents(g, ai);
  assert.ok(ai.claimId?.startsWith('B'), `應由 B 隊接，實得 ${ai.claimId}`);
  assert.equal(ai.letDrop, false);
});

test('壓線邊際球（出界 5cm）：寧可接（誤判空間下限保護）', () => {
  for (const seed of [3, 11, 27]) {
    const g = rigIncoming(seed, -9.05);
    const ai = createAiState();
    aiCollectIntents(g, ai);
    assert.ok(ai.claimId, `seed ${seed} 壓線球沒人接（違反寧搶錯）`);
  }
});

test('玩家喊球：搶下本 flight 鎖定、同球不反悔、放球判斷被蓋過', () => {
  // 出界球也硬喊——喊了就是你的（出界與否自己負責）
  const g = rigIncoming(4, 9.5); // 落 A 半場外側（A2 是 A 隊）
  const ai = createAiState();
  aiCollectIntents(g, ai); // 先讓 AI 規劃（可能放球）
  aiCollectIntents(g, ai, [], 'A2');
  assert.equal(ai.claimId, 'A2');
  assert.equal(ai.letDrop, false);
  assert.equal(ai.calledFlight, ai.flightId);
  // 同 flight 內鎖定不因後續 collect 改變
  aiCollectIntents(g, ai, []);
  assert.equal(ai.claimId, 'A2');
});

test('喊球只對自己半場的來球有效（對面場的球喊不到）', () => {
  const g = rigIncoming(6, -8.5); // 落 B 半場
  const ai = createAiState();
  aiCollectIntents(g, ai, [], 'A2');
  assert.ok(ai.claimId?.startsWith('B'), '喊球不該搶到對面半場的球');
});

test('放球後整球流程：落地判 OUT、送球方失分', () => {
  const g = rigIncoming(8, -10.5);
  const ai = createAiState();
  for (let i = 0; i < 900 && g.phase === 'rally'; i += 1) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  const dead = g.events.find((e) => e.type === 'DEAD_BALL');
  assert.ok(dead && dead.reason === 'OUT');
  assert.equal(g.match.score.B, 1, '放球方（B）應得分');
});
