// 真實感卷 批3「觸網犯規」——R3-1~R3-4 的機械斷言
// 凍結檔：docs/kickoffs/realism-kickoff-20260831.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { derivePointInfo } from '../src/ui/pointBanner.js';

// 08-31 Sawmah 裁定「觸網只掛壓手」後改組：預設隊雙 read＝全直臂＝結構性零壓手，
// 觸發治具改用雙 commit（commit 人格攔網恆壓手，ai.js:2734）；並新增「雙 read 恆零觸網」
// 的反向臂——那正是裁定的核心（直臂零觸網＝可歸因）。
function runSets(n, seed0 = 1, profiles = null) {
  const faults = []; // { winner, blockerTeam, spikerTeam }
  for (let seed = seed0; seed < seed0 + n; seed += 1) {
    const g = createGame({ seed, setTarget: 25, ...(profiles ? { aiProfiles: profiles } : {}) });
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

const COMMIT_BOTH = { A: { blockPersona: 'commit' }, B: { blockPersona: 'commit' } };

test('R3-1 觸網犯規存在且判給攻方：每一筆 winner=扣球方、失分方=攔網方（雙 commit＝有壓手）', () => {
  const faults = runSets(10, 1, COMMIT_BOTH);
  assert.ok(faults.length >= 1, '10 局（雙 commit）零觸網＝機制沒接上');
  for (const f of faults) {
    assert.equal(f.winner, f.spikerTeam, '觸網＝攻方得分');
    assert.notEqual(f.winner, f.blockerTeam, '失分方＝觸網的攔網方');
  }
});

test('R3-1 裁定核心反向臂：雙 read（全直臂）＝恆零觸網——懲罰只掛在壓手這個決定上', () => {
  assert.equal(runSets(10).length, 0, '直臂攔網不得觸網');
});

test('R3-2 雙向：NET_FAULT_CHANCE=0 ⇒ 雙 commit 也零觸網（機率閘真的在管事）', () => {
  const keep = TUNING.NET_FAULT_CHANCE;
  try {
    TUNING.NET_FAULT_CHANCE = 0;
    assert.equal(runSets(10, 1, COMMIT_BOTH).length, 0);
  } finally {
    TUNING.NET_FAULT_CHANCE = keep;
  }
});

test('R3-2 決定論：同種子兩跑觸網筆數逐值相同；機率常數存在（調參點防遺失）', () => {
  const a = runSets(3, 42, COMMIT_BOTH).length;
  const b = runSets(3, 42, COMMIT_BOTH).length;
  assert.equal(a, b);
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
