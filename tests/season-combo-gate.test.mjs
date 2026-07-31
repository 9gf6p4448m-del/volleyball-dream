// 組合攻擊「屆數閘」（2026-08-01 Sawmah 裁定）
//
// 裁定：交叉／夾塞／時間差在**生涯第 1 屆全部關閉、第 2 屆起才有**，雙方都適用；
// 快速比賽不受影響（無屆數概念，同 trust／暫停／換人）。
//
// ★ 本檔守的四件事 ★
//   ① **sim 不認識屆數**：`src/sim/` 的程式碼（剝掉註解後）不得出現 season／career／屆
//      這類詞彙。sim 只認一個數字 `comboScale`，值由 career 層算好餵進來——
//      範式同 passTier／aiProfiles／blockPersona。這條是本卷的架構核心，且它一旦被
//      破壞**不會讓任何既有測試轉紅** ⇒ 用靜態掃描釘住（抄 combo-play 的 COMBO-SCAN）。
//   ② **值由 career 層決定**：careerMatchSetup 第 1 屆給 0、第 2 屆起給 1。
//   ③ **實跑**：第 1 屆整局零組合、第 2 屆非零、快速比賽非零（行為斷言，不是欄位斷言）。
//   ④ **預設無擾動**：不傳 comboScale ＝ ×1 ＝ 與出廠逐值相同（沒污染純核心的機械證明）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { evaluateCombination, COMBO_TYPES } from '../src/sim/approach.js';
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';

const SIM_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'sim');
const MAX_TICKS = 400000;

// 逐行剝掉行註解（本專案不用區塊註解）；CRLF 先正規化——`//…\r` 在 CRLF 工作區下
// 會整條剝不掉（2026-07-29 的 repo 級缺陷，全文見 block-persona.test.mjs:160）
const stripComments = (src) => src
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');

// ---- 真實生涯路徑的建場（與 matchConfig.js 生涯分支同構）----
function careerGame(seasonIndex, seed) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('測試員', { seed });
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const roster = { capacity: 12, members, alumni: [] };
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId: 'north-tech' }, roster, lineup, seasonIndex,
  );
  return {
    setup,
    game: createGame({
      seed: setup.seed,
      teams: setup.teams,
      aiProfiles: setup.aiProfiles,
      liberos: setup.liberos,
      comboScale: setup.comboScale, // matchConfig.js 生涯分支遞的就是這個欄位
    }),
  };
}

// 整局實跑，回傳三型的組合次數與規劃點數（讀 sim 自己寫的 attackCombo，不重刻判斷式）
function playAndCount(game) {
  const ai = createAiState();
  const byType = Object.fromEntries(COMBO_TYPES.map((t) => [t, 0]));
  let plans = 0;
  let prev = null;
  while (game.phase !== 'set_over' && game.tick < MAX_TICKS) {
    const intents = aiCollectIntents(game, ai);
    if (ai.approach && ai.approach !== prev) {
      prev = ai.approach;
      plans += 1;
      if (ai.attackCombo) byType[ai.attackCombo.type] += 1;
    }
    stepGame(game, intents);
  }
  return { byType, plans, sum: COMBO_TYPES.reduce((s, t) => s + byType[t], 0) };
}

// ==== ① 架構核心：sim 不得認識屆數 ====
test('SEASON-SCAN：src/sim 不認識屆數／賽季／生涯（剝註解後掃全目錄）', () => {
  const banned = /season|Season|career|Career|屆|賽季|生涯/;
  for (const f of readdirSync(SIM_DIR).filter((n) => n.endsWith('.js'))) {
    const code = stripComments(readFileSync(join(SIM_DIR, f), 'utf8'));
    const bad = code.split('\n')
      .map((line, i) => ({ line, no: i + 1 }))
      .filter(({ line }) => banned.test(line));
    assert.equal(bad.length, 0,
      `src/sim/${f} 出現屆數概念（架構鐵律）：`
      + bad.map(({ line, no }) => `${no}: ${line.trim()}`).join(' ｜ '));
  }
});

test('sim 的旋鈕是一個純數字：createGame 未注入＝null，注入什麼就是什麼', () => {
  assert.equal(createGame({ seed: 1 }).comboScale, null, '快速比賽＝未注入＝null（讀取端 ?? 1）');
  assert.equal(createGame({ seed: 1, comboScale: 0 }).comboScale, 0);
  assert.equal(createGame({ seed: 1, comboScale: 1 }).comboScale, 1);
});

// ==== ② 值由 career 層決定 ====
test('屆數閘的值在 career 層算：第 1 屆 0、第 2／3 屆 1', () => {
  const mk = (seasonIndex) => careerGame(seasonIndex, 7).setup.comboScale;
  assert.equal(mk(1), 0, '第 1 屆＝學基本功＝三型全關');
  assert.equal(mk(2), 1, '第 2 屆起整個比賽升級＝恢復出廠值');
  assert.equal(mk(3), 1);
  // 缺省參數（舊呼叫端／舊存檔推導不出屆數時）＝第 1 屆，與 careerStore.seasonIndex()
  // 的 `?? 1` 同一個保守方向：推不出來就當新生，不會憑空多出組合攻擊
  const career = createCareer({ seed: 7 });
  const dflt = careerMatchSetup(career, createCareerPlayer('測試員', { seed: 7 }), career.schedule[0]);
  assert.equal(dflt.comboScale, 0, '未傳 seasonIndex＝視同第 1 屆');
});

// ==== ③ 實跑（行為斷言）====
test('實跑：生涯第 1 屆整局零組合、第 2 屆非零、快速比賽非零', () => {
  const SETS = 2;
  const tally = (make) => {
    const acc = { plans: 0, sum: 0, byType: Object.fromEntries(COMBO_TYPES.map((t) => [t, 0])) };
    for (let i = 0; i < SETS; i += 1) {
      const r = playAndCount(make(1000 + i * 101));
      acc.plans += r.plans;
      acc.sum += r.sum;
      for (const t of COMBO_TYPES) acc.byType[t] += r.byType[t];
    }
    return acc;
  };
  const s1 = tally((seed) => careerGame(1, seed).game);
  const s2 = tally((seed) => careerGame(2, seed).game);
  const quick = tally((seed) => createGame({ seed, setTarget: 25 }));

  // 鑑別力：關閉臂的樣本要夠大到「若閘沒接上就一定會抓到」。第 2 屆同樣的局數
  // 組出 s2.sum 次 ⇒ 第 1 屆的 0 不是樣本不足的假綠（`02 §6.1` 條 5）。
  assert.ok(s1.plans > 100, `第 1 屆規劃點只有 ${s1.plans}＝樣本不足以區分「有」與「沒有」`);
  assert.ok(s2.sum >= 5, `第 2 屆同局數只組出 ${s2.sum} 次＝對照臂太弱，第 1 屆的 0 沒有鑑別力`);
  assert.equal(s1.sum, 0,
    `第 1 屆組出了組合：${JSON.stringify(s1.byType)}（規劃點 ${s1.plans}）`);
  assert.ok(s2.byType.cross > 0 && s2.byType.delay > 0,
    `第 2 屆沒恢復：${JSON.stringify(s2.byType)}`);
  assert.ok(quick.sum > 0, `快速比賽被屆數閘波及：${JSON.stringify(quick.byType)}`);
});

// ==== ④ 預設無擾動 ====
test('comboScale 預設＝×1：不傳與傳 1 的觸發骰逐值相同，傳 0 則恆不過', () => {
  const pts = [
    { pid: 'A2', kind: 'left', tier: 'perfect' },
    { pid: 'A3', kind: 'quick', tier: 'perfect' },
  ];
  let none = 0;
  let one = 0;
  let zero = 0;
  const N = 600;
  for (let f = 1; f <= N; f += 1) {
    const base = { team: 'A', flightId: f, seed: 3, type: 'cross' };
    const a = evaluateCombination(pts, 'A2', base).checks.roll;
    const b = evaluateCombination(pts, 'A2', { ...base, comboScale: 1 }).checks.roll;
    const c = evaluateCombination(pts, 'A2', { ...base, comboScale: 0 }).checks.roll;
    assert.equal(a, b, `flightId=${f} 不傳與傳 1 不一致＝×1 不是恆等`);
    if (a) none += 1;
    if (b) one += 1;
    if (c) zero += 1;
  }
  // 恆假否證：出廠臂真的會過（否則 zero===0 只是因為前置條件擋著，與 comboScale 無關）
  assert.ok(none > 0 && none < N, `出廠臂觸發骰恆假或恆真（${none}/${N}）＝下面那條沒有鑑別力`);
  assert.equal(one, none);
  assert.equal(zero, 0, `comboScale=0 仍有 ${zero}/${N} 顆過骰`);
});
