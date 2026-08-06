// 位置體檢 2026-08-06 裁定 A1′ — 自由人的殺球 dig 責任區放大
//
// 背景（量測，不是印象）：自由人的防守起球份額換算成在場時間只有 12.0，
// OH 24.55／OPP 19.2／MB 14.1＝全場最低，而真實排球的自由人是全隊 dig 王。
// 成因**不是仲裁歧視**（`arbitrate` 原本沒有任何 libero 分支，且接發球份額他已是
// 全場最高 25.3/單位），是**責任區覆蓋面**：他固定頂替後排中間那一格。
//
// 本檔守三件事：①放大只作用在殺球 dig，不碰接發球 ②方向正確（責任區變大＝更容易被判給他）
// ③既有的 S／前排 MB 縮小規則沒被動到。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { buildLibero } from '../src/career/careerState.js';

// ★ 治具必須真的有自由人在場 ★ 第一版用光禿禿的 `createGame({seed})`，量到 libero 0.0%
// ——不是責任區失效，是場上根本沒有這個人。沿用 `tests/libero.test.mjs` 的既有建法。
const LIBS = () => ({ A: buildLibero('A', 'A隊自由人'), B: buildLibero('B', 'B隊自由人') });

// 走真實對局統計「誰接到了什麼」——不重抄 arbitrate 的判斷式（重抄＝循環論證）。
// 分類判準與 tools/position-load-probe.mjs 同源：取樣於 stepGame 之前的 rally.profile
//（`game.js` 在同一次呼叫內會把 profile 覆寫成 'arc'，事後讀會全部歸錯類）。
function tally(sets) {
  const recv = {};
  const dig = {};
  for (let k = 0; k < sets; k += 1) {
    const game = createGame({ seed: 4200 + k * 37, setTarget: 25, liberos: LIBS() });
    const ai = createAiState();
    let guard = 0;
    while (game.phase !== 'set_over' && guard < 400000) {
      guard += 1;
      const wasServe = game.rally.profile === 'serve';
      const intents = aiCollectIntents(game, ai, []);
      for (const e of stepGame(game, intents)) {
        if (e.type !== 'TOUCH' || e.touches !== 1) continue;
        const role = game.players[e.playerId]?.currentRole;
        if (!role) continue;
        const bucket = wasServe ? recv : dig;
        bucket[role] = (bucket[role] ?? 0) + 1;
      }
    }
  }
  return { recv, dig };
}

test('★方向★ 自由人的防守起球份額必須明顯高於「他只是個後排球員」的水準', () => {
  const { dig } = tally(6);
  const total = Object.values(dig).reduce((a, b) => a + b, 0);
  assert.ok(total >= 60, `防守起球樣本 ${total} 太少＝斷言空洞`);
  const liberoShare = (dig.libero ?? 0) / total * 100;
  // 改前實測 8.4%（全場最低）／改後 19.4%。門檻 14% ＝兩者中間偏改後，
  // 留給 rally 結構波動的餘裕；一旦掉回 14% 以下代表放大失效。
  assert.ok(liberoShare >= 14,
    `自由人防守起球份額 ${liberoShare.toFixed(1)}% < 14%＝責任區放大失效`
    + `（改前 8.4／改後 19.4；分佈 ${JSON.stringify(dig)}）`);
});

test('★範圍★ 放大不得外溢到接發球（他在那條路徑上份額已是全場最高）', () => {
  const { recv } = tally(6);
  const total = Object.values(recv).reduce((a, b) => a + b, 0);
  assert.ok(total >= 60, `接發球樣本 ${total} 太少＝斷言空洞`);
  const liberoShare = (recv.libero ?? 0) / total * 100;
  // 改前 17.7%／改後 19.2%（同一組局的自然波動）。上限 30% ＝若放大誤植到接發球那條
  // 路徑，他會把隊友整個擠掉，這條會轉紅。
  assert.ok(liberoShare <= 30,
    `自由人接發球份額 ${liberoShare.toFixed(1)}% > 30%＝放大外溢到接發球，`
    + `他會一個人接全場（分佈 ${JSON.stringify(recv)}）`);
});

test('★既有規則不得被動到★ 二傳與中攻的接發球份額仍維持在低檔', () => {
  const { recv } = tally(6);
  const total = Object.values(recv).reduce((a, b) => a + b, 0);
  const share = (r) => (recv[r] ?? 0) / total * 100;
  // ⚠ 不斷言「恆為 0」：本檔的分類是「stepGame 前 profile==='serve' 的第一觸」，
  //   它會把發球後同一波的救球也算進來（探針用同一判準時二傳是 0，但那支跑的是
  //   career 陣容、輪轉分佈不同）。所以守的是**量級**不是零——量級被打破才代表
  //   `formationExempt` 的排除真的壞了。
  assert.ok(share('setter') <= 8,
    `二傳接發球份額 ${share('setter').toFixed(1)}% 過高＝formationExempt 排除可能被破壞`);
  assert.ok(share('middle') <= 20,
    `中攻接發球份額 ${share('middle').toFixed(1)}% 異常高＝陣型排除被動到了`);
});
