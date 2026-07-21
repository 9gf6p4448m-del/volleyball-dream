// 垂直切片核心驗收：餵 Intent 序列（全 AI）在純 node 打完一整局（驗收單 A2/D/E 區）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const MAX_TICKS = 400000; // 失控保險（正常一局 ~4 萬 tick）

export function runFullSet(seed) {
  const g = createGame({ seed });
  const ai = createAiState();
  const claimByFlight = new Map();

  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    const intents = aiCollectIntents(g, ai);
    if (g.phase === 'rally') {
      // 例外：落點方觸球數已用盡（如扣球掛網彈回）→ 依規則放球讓它落地，不算互讓
      const exhausted =
        ai.landingTeam &&
        g.rally.possession === ai.landingTeam &&
        g.rally.touches >= 3;
      // E2 不互讓：可合法觸球時，永遠有唯一被呼叫鎖定的接球者
      if (!exhausted) {
        assert.ok(ai.claimId, `tick ${g.tick} 沒有人被指派接球（互讓破綻）`);
      }
      // E3 不打架：同一 flight 的指派不可撤銷、不換人
      if (ai.claimId) {
        const prev = claimByFlight.get(ai.flightId);
        assert.ok(!prev || prev === ai.claimId, `flight ${ai.flightId} 指派中途換人`);
        claimByFlight.set(ai.flightId, ai.claimId);
      }
    }
    stepGame(g, intents);
  }
  return g;
}

test('全 AI 打完一整局：規則正確、比分收斂（25+ 且領先 2）', () => {
  const g = runFullSet(20260721);
  assert.equal(g.phase, 'set_over', `一局未在 ${MAX_TICKS} tick 內打完`);

  const { score } = g.match;
  const winner = g.match.winner;
  const loser = winner === 'A' ? 'B' : 'A';
  assert.ok(score[winner] >= 25, `勝方比分 ${score[winner]} < 25`);
  assert.ok(score[winner] - score[loser] >= 2, `未領先 2 分：${score[winner]}-${score[loser]}`);

  // 事件流健全：每分恰有一次 SCORE；每球恰有一次 SERVE；死球原因齊備
  const count = (type) => g.events.filter((e) => e.type === type).length;
  assert.equal(count('SCORE'), score.A + score.B);
  assert.equal(count('SERVE'), score.A + score.B); // rally point：每球必有發球、必得一分
  assert.equal(count('DEAD_BALL'), score.A + score.B);
  assert.ok(count('SET_END') === 1);

  // 攔網與判分不得同 tick 交錯（冷審 CRITICAL 的整局層級檢查）
  const deadTicks = new Set(
    g.events.filter((e) => e.type === 'DEAD_BALL').map((e) => e.tick),
  );
  for (const e of g.events) {
    if (e.type === 'BLOCK_TOUCH') {
      assert.ok(!deadTicks.has(e.tick), `tick ${e.tick} 攔網與判分同 tick`);
    }
  }
});

test('11 人 AI 都在動：雙方都有觸球、參與者眾', () => {
  const g = runFullSet(42);
  const touches = g.events.filter((e) => e.type === 'TOUCH' || e.type === 'BLOCK_TOUCH');
  assert.ok(touches.some((e) => e.team === 'A') && touches.some((e) => e.team === 'B'));
  const actors = new Set(
    g.events
      .filter((e) => ['TOUCH', 'SERVE', 'BLOCK_TOUCH'].includes(e.type))
      .map((e) => e.playerId),
  );
  assert.ok(actors.size >= 8, `參與觸球/發球的球員僅 ${actors.size}/12 人`);
  // E5 堪打不弱智：多回合往返（接得起來），非每球一觸即死
  const overNet = g.events.filter((e) => e.type === 'BALL_OVER_NET').length;
  const points = g.match.score.A + g.match.score.B;
  assert.ok(overNet > points, `過網次數 ${overNet} 未超過分數 ${points}，形同無來回`);
});
