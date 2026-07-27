// W4(P4) 07-27 試玩修正 — 暫停同一分防重：同隊同分至多一次／兩隊各自可喊／
// 下一分恢復／跨局歸零（timeoutUsedThisPoint＝sim 與 UI 反灰共用的單一事實源）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, stepGame, applyTimeout, startNextSet, timeoutUsedThisPoint, TUNING,
} from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

test('同一分同隊喊兩次＝deny；另一隊仍可喊；換分後恢復', () => {
  const g = createGame({ seed: 3 });
  assert.ok(applyTimeout(g, { team: 'A' }).ok);
  assert.equal(timeoutUsedThisPoint(g, 'A'), true);
  const again = applyTimeout(g, { team: 'A' });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'already-this-point');
  assert.equal(g.timeouts.A.remaining, TUNING.TIMEOUTS_PER_SET - 1, '第二次不得扣額度');
  // 兩隊各自可喊（同一分）
  assert.ok(applyTimeout(g, { team: 'B' }).ok);
  // 打完一分 → A 恢復可喊
  const ai = createAiState();
  const before = g.match.score.A + g.match.score.B;
  let guard = 0;
  while (g.match.score.A + g.match.score.B === before && guard < 60000 && g.phase !== 'set_over') {
    stepGame(g, aiCollectIntents(g, ai));
    guard += 1;
  }
  assert.equal(timeoutUsedThisPoint(g, 'A'), false, '換分＝防重解除');
  assert.ok(applyTimeout(g, { team: 'A' }).ok, '下一分可再喊（額度內）');
});

test('跨局歸零：新局 0:0 不被上一局的 0:0 key 誤擋', () => {
  const g = createGame({ seed: 7, setTarget: 15, series: { bestOf: 3 } });
  assert.ok(applyTimeout(g, { team: 'A' }).ok, '第 1 局 0:0 喊過');
  // 直接推到局間（系列語意由 match-sets 背書；本測聚焦跨局 key）
  const ai = createAiState();
  let guard = 0;
  while (g.phase !== 'set_break' && g.phase !== 'set_over' && guard < 120000) {
    stepGame(g, aiCollectIntents(g, ai));
    guard += 1;
  }
  assert.equal(g.phase, 'set_break');
  startNextSet(g);
  assert.equal(timeoutUsedThisPoint(g, 'A'), false, '新局 0:0 不受上一局 0:0 影響');
  assert.ok(applyTimeout(g, { team: 'A' }).ok, '新局額度重置後可喊');
});
