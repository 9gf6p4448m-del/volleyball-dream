// B1 決定論（最關鍵）：同種子＋同 Intent 生成流程 → 事件流與最終比分完全一致
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const MAX_TICKS = 400000;

function playSet(seed) {
  const g = createGame({ seed });
  const ai = createAiState();
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  return g;
}

test('同種子重跑兩次：最終比分與完整事件流逐 byte 相同', () => {
  const a = playSet(777);
  const b = playSet(777);
  assert.equal(a.phase, 'set_over');
  assert.deepEqual(a.match.score, b.match.score);
  assert.equal(a.tick, b.tick);
  assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
  // 終局世界狀態也一致（rng 消耗軌跡、所有球員位置、球體）
  assert.equal(a.rngState, b.rngState);
  assert.deepEqual(a.actors, b.actors);
  assert.deepEqual(a.ball, b.ball);
});

test('不同種子 → 不同對局（rng 有實際參與，非死劇本）', () => {
  const a = playSet(1);
  const b = playSet(2);
  assert.notEqual(JSON.stringify(a.events), JSON.stringify(b.events));
});
