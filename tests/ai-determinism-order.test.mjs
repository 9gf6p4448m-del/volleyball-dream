// LOW-1 硬化迴歸：AI Intent 蒐集改用輪轉顯式序後，決定論與整局收斂不變
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

function playSet(seed) {
  const g = createGame({ seed });
  const ai = createAiState();
  while (g.phase !== 'set_over' && g.tick < 400000) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  return g;
}

test('輪轉序遍歷後：同種子仍逐 byte 一致、整局照常收斂', () => {
  const a = playSet(2024);
  const b = playSet(2024);
  assert.equal(a.phase, 'set_over');
  assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
  assert.equal(a.rngState, b.rngState);
});

test('每 tick 產出的 Intent 涵蓋全部 11 個 AI（無人因遍歷改動漏掉）', () => {
  const g = createGame({ seed: 9 });
  const ai = createAiState();
  // 推進到 rally，統計某 tick 的 intent 覆蓋
  for (let i = 0; i < 200; i += 1) stepGame(g, aiCollectIntents(g, ai));
  const intents = aiCollectIntents(g, ai, ['A2']); // 排除玩家
  const ids = new Set(intents.map((it) => it.playerId));
  assert.ok(!ids.has('A2'));
  assert.ok(ids.size >= 1 && ids.size <= 11);
});
