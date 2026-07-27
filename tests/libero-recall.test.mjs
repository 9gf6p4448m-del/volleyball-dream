// W4(P4) 07-27 試玩回饋拍板 B — 自由人配對手動回場（FIVB 替換不算換人）：
// recall 合法性／hold 抑制自動換入／窗結束恢復預設／額度不動
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, applyLiberoRecall, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { buildLibero } from '../src/career/careerState.js';

const mkGame = (seed = 5) => createGame({
  seed, liberos: { A: buildLibero('A', 'A隊自由人') },
});

test('recall：換回原對位、清配對、立 hold、不吃換人額度；死球限定/無配對＝deny', () => {
  const g = mkGame();
  const lib = g.liberos.A;
  assert.ok(lib.replacedId, '前提：開局後排 MB 已被自由人換入');
  const backId = lib.replacedId;
  // rally 中不可 recall
  g.phase = 'rally';
  assert.equal(applyLiberoRecall(g, { team: 'A' }).ok, false);
  g.phase = 'serve';
  const r = applyLiberoRecall(g, { team: 'A' });
  assert.ok(r.ok);
  assert.ok(g.match.rotations.A.includes(backId), '原對位回到輪轉');
  assert.ok(!g.match.rotations.A.includes('AL'), '自由人退場');
  assert.equal(lib.replacedId, null);
  assert.equal(lib.hold, true);
  assert.equal(g.subs.A.remaining, TUNING.SUBS_PER_SET, 'FIVB：替換不算換人、不吃額度');
  assert.equal(g.events.filter((e) => e.type === 'LIBERO_SWAP' && e.inId === backId).length, 1);
  // 已無配對＝再按 deny
  assert.equal(applyLiberoRecall(g, { team: 'A' }).ok, false);
});

test('hold 抑制窗：原對位在後排＝不自動換入；轉前排＝窗結束、下一位後排 MB 恢復預設換入', () => {
  const g = mkGame(11);
  const lib = g.liberos.A;
  const backId = lib.replacedId;
  applyLiberoRecall(g, { team: 'A' });
  const ai = createAiState();
  let guard = 0;
  // 打到窗結束：期間每個死球窗驗證「原對位還在後排→自由人不在場上」
  while (guard < 120000 && g.phase !== 'set_over' && lib.hold) {
    stepGame(g, aiCollectIntents(g, ai));
    guard += 1;
    if (g.phase === 'serve' && lib.hold) {
      const rot = g.match.rotations.A;
      if (rot.indexOf(backId) >= 4) {
        assert.ok(!rot.includes('AL'), 'hold 期間不得自動換入');
      }
    }
  }
  assert.equal(lib.hold, false, '原對位輪到前排＝抑制窗結束');
  // 窗結束後：繼續打到下一次後排出現 MB → 預設自動換入恢復
  guard = 0;
  while (guard < 120000 && g.phase !== 'set_over' && lib.replacedId == null) {
    stepGame(g, aiCollectIntents(g, ai));
    guard += 1;
  }
  assert.ok(lib.replacedId != null, '預設自動換入恢復（縫隙只在 hold 窗內）');
});
