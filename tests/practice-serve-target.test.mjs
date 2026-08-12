// 練習賽指名發球（2026-08-13）——「教練說要練接發，球就要真的發到你手上」
//
// ★ 為什麼要這一檔 ★ 真人試玩教學局第一步「跑到位置，接起 1 球」，打到第三球（3:3）
//   還是 0/1。量測（tools/tut-receive-probe.mjs，200 seeds）挖出來的不是機率低而是
//   結構恆零：偏置 `serveToPlayer` 借道 trust ⇒ serveTargetPidOf ⇒ attackPointsOf，
//   而那個池要求 techniques.pipe >= 1，生涯新人 pipe=0 ⇒ 指名次數 0/4727。
//
// ★ 鑑別力 ★ 最後一段是**行為斷言**（跨 seed 實跑真實比賽，玩家幾球內接到球），
//   不是「有沒有設到那個欄位」。修前的三段實測：
//     借道 trust        平均 5.45／中位數 4／最壞 27
//     只加指名參數      平均 4.52／中位數 4／最壞 7
//     ＋後排開場        平均 2.06／中位數 2／最壞 3
//   所以「≤3 球」這條線在修前必紅（修前最壞 27、中位數 4）、修後有 2 球餘裕。
//   每條「有設到」的斷言旁邊都配一條反向對照（沒開偏置時不得設），否則一支
//   無條件寫死的假實作也會全綠。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  practiceMatchSetup, receiveFirstRotationStart, tutorialDrills, practiceBiasFor,
} from '../src/career/practiceMatch.js';
import { effectiveOrder } from '../src/career/lineup.js';
import { createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, forcedServeTargetPidOf } from '../src/sim/ai.js';

const PID = 'A2'; // 玩家在紅隊 six 裡的 sim 端 id（同 tools/tut-receive-probe.mjs）

function setupFor({ drills, seed = 1, tutorial = true }) {
  return practiceMatchSetup({
    player: createCareerPlayer('測試員', { seed }),
    members: buildStarterMembers(),
    lineup: null,
    drills,
    seasonIndex: 1,
    seed,
    tutorial,
  });
}

// ════════════════════════════════════════════════════════════
// 一、sim 端的讀取器：未注入＝完全走原路徑（sim-hash 不動的依據）
// ════════════════════════════════════════════════════════════

test('forcedServeTargetPidOf：沒注入就回 null（快速比賽／正式賽零改變）', () => {
  const g = { aiProfiles: null };
  assert.equal(forcedServeTargetPidOf(g, 'A'), null);
  assert.equal(forcedServeTargetPidOf(g, 'B'), null);
  assert.equal(forcedServeTargetPidOf({}, 'B'), null);
  assert.equal(forcedServeTargetPidOf({ aiProfiles: { B: { tipRate: 0 } } }, 'B'), null);
});

test('forcedServeTargetPidOf：注入哪一隊就只有那一隊讀得到', () => {
  const g = { aiProfiles: { B: { serveTargetPid: 'A2' } } };
  assert.equal(forcedServeTargetPidOf(g, 'B'), 'A2');
  assert.equal(forcedServeTargetPidOf(g, 'A'), null); // ★反向★ 不得外溢到另一隊
});

// ════════════════════════════════════════════════════════════
// 二、輪轉起點純函式
// ════════════════════════════════════════════════════════════

test('receiveFirstRotationStart：算出來的 k 讓玩家落在最後一格（＝位置 6，後排非發球者）', () => {
  const starters = ['p0', 'p1', 'me', 'p3', 'p4', 'p5'];
  const k = receiveFirstRotationStart(starters, 'me');
  const order = effectiveOrder(starters, k);
  assert.equal(order.length, 6);
  assert.equal(order[5], 'me');
  assert.notEqual(order[0], 'me'); // 位置 1＝首發球者，排在那裡第一球是發球、沒得接
});

test('★反向對照★ 不動輪轉的話玩家不在最後一格（證明上面那條驗得到東西）', () => {
  const starters = ['p0', 'p1', 'me', 'p3', 'p4', 'p5'];
  assert.notEqual(effectiveOrder(starters, 0)[5], 'me');
});

test('receiveFirstRotationStart：對每一個可能的位置都成立（不是只有這組資料湊巧）', () => {
  for (let i = 0; i < 6; i += 1) {
    const starters = ['a', 'b', 'c', 'd', 'e', 'f'];
    starters[i] = 'me';
    const order = effectiveOrder(starters, receiveFirstRotationStart(starters, 'me'));
    assert.equal(order[5], 'me', `玩家在先發序第 ${i} 格時算錯`);
  }
});

test('認不得的玩家／空先發序：回 null＝不動輪轉（同 DRILL_BIAS 的紀律）', () => {
  assert.equal(receiveFirstRotationStart(['a', 'b'], 'nobody'), null);
  assert.equal(receiveFirstRotationStart([], 'me'), null);
  assert.equal(receiveFirstRotationStart(undefined, 'me'), null);
});

// ════════════════════════════════════════════════════════════
// 三、接線：偏置 ⇒ 建隊參數（走真實 practiceMatchSetup，不手捏 config）
// ════════════════════════════════════════════════════════════

test('★接線★ 教學局：白隊 profile 帶 serveTargetPid＝玩家，且玩家排在後排最後一格', () => {
  const setup = setupFor({ drills: tutorialDrills() });
  assert.equal(setup.practice.bias.serveToPlayer, true);
  assert.equal(setup.aiProfiles.B.serveTargetPid, setup.teams.A[5].id);
  assert.equal(setup.teams.A[5].id, PID);
});

test('★反向對照★ 沒有接發類科目 ⇒ 不設 serveTargetPid、也不動輪轉', () => {
  // 'basic-attack' 走 feedPlayer（不是 serveToPlayer）⇒ 這兩手都不該啟動
  const setup = setupFor({ drills: ['basic-attack'], tutorial: false });
  assert.equal(setup.practice.bias.serveToPlayer, false);
  assert.equal(setup.aiProfiles.B.serveTargetPid, undefined);
  assert.notEqual(setup.teams.A[5].id, PID); // 輪轉沒被動過
});

test('★反向對照★ 零科目 ⇒ 白隊 profile 不含任何偏置欄位', () => {
  const setup = setupFor({ drills: [], tutorial: false });
  assert.equal(setup.aiProfiles.B.serveTargetPid, undefined);
  assert.equal(setup.aiProfiles.B.tipRate, undefined);
});

test('紅白對抗賽的接發類科目也吃得到（不是只有教學局被修好）', () => {
  for (const d of ['dive', 'basic-libero']) {
    assert.equal(practiceBiasFor([d]).serveToPlayer, true, `${d} 應該要有 serveToPlayer`);
    const setup = setupFor({ drills: [d], tutorial: false });
    assert.equal(setup.aiProfiles.B.serveTargetPid, PID, `${d} 沒接上指名發球`);
  }
});

// ════════════════════════════════════════════════════════════
// 四、★行為斷言★ 實跑真實比賽：玩家幾球內拿到第一次 receive/dive
// ════════════════════════════════════════════════════════════
// 這一段才是這次修復真正要守的東西。上面全部斷言加起來也只證明「欄位設對了」，
// 證明不了「球真的到得了你手上」——中間還隔著發球執行、接發仲裁、自由人歸屬。

// 跑到玩家第一次 receive/dive 為止，回傳「那是第幾球」（找不到回 null）。
// 走真實 createGame + aiCollectIntents + stepGame（同 tools/tut-receive-probe.mjs），
// 不重刻被測邏輯——重抄一份判定做成的探針是循環論證，不能用來否證。
function ralliesUntilFirstReceive(seed, maxRallies = 12) {
  const setup = setupFor({ drills: tutorialDrills(), seed });
  const g = createGame({
    seed: setup.seed,
    setTarget: 25,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    benches: setup.benches,
    comboScale: setup.comboScale,
    stamina: { A: {}, B: {} },
    momentum: true,
  });
  const ai = createAiState();
  let rallies = 0;
  let prevPhase = null;
  let cursor = 0;
  while (g.phase !== 'set_over' && rallies <= maxRallies && g.tick < 120000) {
    if (g.phase === 'serve' && prevPhase !== 'serve') rallies += 1;
    prevPhase = g.phase;
    stepGame(g, aiCollectIntents(g, ai));
    for (; cursor < g.events.length; cursor += 1) {
      const e = g.events[cursor];
      if (e.type === 'TOUCH' && e.playerId === PID
        && (e.kind === 'receive' || e.kind === 'dive')) return rallies;
    }
  }
  return null;
}

test('★行為★ 12 個 seed：玩家一律在 3 球內拿到第一次 receive/dive（修前最壞 27 球）', () => {
  const got = [];
  for (let seed = 1; seed <= 12; seed += 1) got.push(ralliesUntilFirstReceive(seed));
  assert.ok(got.every((n) => n != null), `有 seed 整場沒接到球：${JSON.stringify(got)}`);
  assert.ok(got.every((n) => n <= 3), `有 seed 拖超過 3 球：${JSON.stringify(got)}`);
});

test('★反向對照★ 拿掉偏置就會拖久：同 seed 下沒有接發科目時明顯變慢或接不到', () => {
  // 證明上面那條不是「反正玩家很快就會接到球」的恆真斷言。
  // 不改被測碼、只換建隊參數（走同一條真實路徑）＝把偏置關掉的對照組。
  const noBias = (seed) => {
    const setup = setupFor({ drills: [], seed, tutorial: false });
    const g = createGame({
      seed: setup.seed,
      setTarget: 25,
      teams: setup.teams,
      aiProfiles: setup.aiProfiles,
      liberos: setup.liberos,
      benches: setup.benches,
      comboScale: setup.comboScale,
      stamina: { A: {}, B: {} },
      momentum: true,
    });
    const ai = createAiState();
    let rallies = 0;
    let prevPhase = null;
    let cursor = 0;
    while (g.phase !== 'set_over' && rallies <= 4 && g.tick < 120000) {
      if (g.phase === 'serve' && prevPhase !== 'serve') rallies += 1;
      prevPhase = g.phase;
      stepGame(g, aiCollectIntents(g, ai));
      for (; cursor < g.events.length; cursor += 1) {
        const e = g.events[cursor];
        if (e.type === 'TOUCH' && e.playerId === PID
          && (e.kind === 'receive' || e.kind === 'dive')) return rallies;
      }
    }
    return null;
  };
  const slow = [];
  for (let seed = 1; seed <= 12; seed += 1) {
    const n = noBias(seed);
    if (n == null || n > 3) slow.push(seed);
  }
  assert.ok(slow.length > 0,
    '關掉偏置後每個 seed 都還是 3 球內接到 ⇒ 上面那條斷言驗不到東西');
});
