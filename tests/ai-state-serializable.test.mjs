// aiState 必須可結構化複製（2026-08-03 真人試玩踩坑後補的護欄）
//
// 為什麼需要這一條：`src/app/rallyTape.js:66` 每個 rally 開頭都做
// `ai: structuredClone(aiState ?? createAiState())`（情蒐錄影帶）。只要 sim 往 aiState 上
// 掛了任何**不可結構化複製**的東西（函式、閉包、class 實例、Symbol、DOM 參照），
// 瀏覽器每一幀都會丟例外、畫面停在原地——而 node 端的 1000+ 個測試與治具的幾百條生涯
// **一個都不會紅**，因為它們從來不呼叫 structuredClone。
//
// 實際踩到的：卷六把「逐 pid 求賭注」的閉包存進 `aiState.blockPlan.resolveX`，
// 真人打第一分落地就當機（188 次 `Failed to execute 'structuredClone' on 'Window'`）。
// 修法＝閉包只當參數傳、不入狀態。這條測試就是那個修法的守門人。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

test('aiState 可結構化複製——不得往狀態上掛函式／閉包（rallyTape 每個 rally 都要 clone 它）', () => {
  const game = createGame({ seed: 4 });
  const ai = createAiState();
  // 實跑到攔網計畫真的建起來為止：空的 aiState 當然 clone 得動，那樣等於沒驗。
  let sawPlan = false;
  for (let i = 0; i < 20000 && !sawPlan; i += 1) {
    const intents = aiCollectIntents(game, ai);
    stepGame(game, intents);
    if (ai.blockPlan && Object.keys(ai.blockPlan.byPid ?? {}).length > 0) sawPlan = true;
  }
  assert.ok(sawPlan, '跑了 20000 tick 都沒建起任何 blockPlan.byPid——這條測試沒驗到東西');

  // 這一行就是瀏覽器每個 rally 在做的事（rallyTape.js:66）
  assert.doesNotThrow(() => structuredClone(ai),
    'aiState 結構化複製失敗＝錄影帶會在真機上每一幀丟例外，而 node 測試不會紅');

  // 順帶把 game 也驗一次（rallyTape.js:65 同樣 clone 它）
  assert.doesNotThrow(() => structuredClone({ ...game, events: [] }),
    'game 快照結構化複製失敗（rallyTape.js:65 同一條路）');
});
