// 真實感卷 批3「觸網犯規」——R3-1~R3-4 的機械斷言
// 凍結檔：docs/kickoffs/realism-kickoff-20260831.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { derivePointInfo } from '../src/ui/pointBanner.js';

function runSets(n, seed0 = 1) {
  const faults = []; // { winner, blockerTeam, spikerTeam }
  for (let seed = seed0; seed < seed0 + n; seed += 1) {
    const g = createGame({ seed, setTarget: 25 });
    const ai = createAiState();
    let lastSpikeTeam = null;
    let lastBlockTeam = null;
    while (g.phase !== 'set_over' && g.tick < 300000) {
      const events = stepGame(g, aiCollectIntents(g, ai));
      let winner = null;
      for (const e of events) if (e.type === 'SCORE') winner = e.team;
      for (const e of events) {
        if (e.type === 'TOUCH' && e.kind === 'spike') lastSpikeTeam = e.team;
        if (e.type === 'BLOCK_TOUCH') lastBlockTeam = e.team;
        if (e.type === 'DEAD_BALL' && e.reason === 'NET_FAULT') {
          faults.push({ winner, blockerTeam: lastBlockTeam, spikerTeam: lastSpikeTeam });
        }
      }
    }
  }
  return faults;
}

test('R3-1 觸網犯規存在且判給攻方：每一筆 winner=扣球方、失分方=攔網方', () => {
  const faults = runSets(10);
  assert.ok(faults.length >= 1, `10 局零觸網＝機制沒接上（期望均值 ~10 次）`);
  for (const f of faults) {
    assert.equal(f.winner, f.spikerTeam, '觸網＝攻方得分');
    assert.notEqual(f.winner, f.blockerTeam, '失分方＝觸網的攔網方');
  }
});

test('R3-2 雙向：NET_FAULT_CHANCE=0 ⇒ 同一批局零觸網（機率閘真的在管事）', () => {
  const keep = TUNING.NET_FAULT_CHANCE;
  try {
    TUNING.NET_FAULT_CHANCE = 0;
    assert.equal(runSets(10).length, 0);
  } finally {
    TUNING.NET_FAULT_CHANCE = keep;
  }
});

test('R3-2 決定論：同種子兩跑觸網筆數逐值相同；壓手倍率常數存在且 >1（調參點防遺失）', () => {
  const a = runSets(3, 42).length;
  const b = runSets(3, 42).length;
  assert.equal(a, b);
  assert.ok(TUNING.NET_FAULT_PRESS_MUL > 1);
  assert.ok(TUNING.NET_FAULT_CHANCE > 0);
});

test('R3-4 字卡消費端：NET_FAULT 有專屬文案，不落到內部代號或別的犯規', () => {
  const info = derivePointInfo({
    reason: 'NET_FAULT', winner: 'A', myTeam: 'A',
    lastTouch: { team: 'B', playerId: 'B3', kind: 'block' }, controlledId: null,
    score: { A: 1, B: 0 },
  });
  assert.ok(info.title.includes('觸網'), `字卡標題=${info.title}`);
  assert.ok(!info.title.includes('NET_FAULT'), '不得漏內部代號');
});
