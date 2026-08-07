// OPP 夾塞可見度（2026-08-08 Sawmah 裁定）——誘餌獎金入帳字卡
//
// 背景：`trustDyn` 全遊戲只在換人面板顯示、而且是加總後的數字（底值通常 40 幾），
// +1 在那裡等於隱形，場上原本沒有任何提示。裁定＝先讓它看得見，幅度／入帳條件
// 一格都不准動（純顯示層）。實作＝ trust.js `applyComboAssist` 在真正寫 trustDyn
// 的同一行旁新增 `state.rally.comboAssistCredit = { pid, flightId }`（純新增讀取用
// 欄位，不進 sim-hash 白名單）；matchLoop.js `captureComboAssistCredit` 逐 tick 取樣、
// 每一波至多鎖存一次（flightId 天然遞增去重）。
//
// 本檔兩組測試對應驗收條件 5／6：
//   A：雙向鑑別力——真實漏斗（跑線/候選/入帳）裡，字卡張數必須等於「入帳」那一格，
//      不是「候選」那兩格更大的數字。門檻與鑑別力說明見測試內註解。
//   B：不變量掃描——「只給玩家自己」那一項用真實跑出來的「別人入帳」樣本驗證，
//      不是斷言結構上不可能為真的空頭支票（同型坑見 `tandem-call-ui.test.mjs`
//      ★MEDIUM-5★ 那一條，本檔沿用它的取樣手法：換一個真正的受控玩家，讓
//      comboAssist 的受益者變成別人，再用另一個 playerId 的探針去問）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, tandemStateOf } from '../src/sim/ai.js';
import { TRUST_DYN } from '../src/sim/trust.js';
import { captureComboAssistCredit } from '../src/app/matchLoop.js';

// 生產組態：`excludeIds=[pid]` 才會觸發 `applyRouteCommit` 真的記帳（AI vs AI 那條
// 路徑這支機制恆為 no-op，見 `tools/combo-assist-probe.mjs` 開頭的說明——受益者
// 「結構上只可能是受控玩家」）。press=true 模擬玩家窗開就按（OPP 專屬鈕）。
const SEEDS = [
  500000, 507919, 515838, 523757, 531676, 539595, 547514,
  555433, 563352, 571271, 579190, 587109, 595028, 602947,
];
// 一幀可能吃好幾個 tick（掉幀／低更新率螢幕）——用不等長的循環重現，這正是
// MEDIUM-2／本批「每個 sim tick 取樣、每幀才 flush 一次」要守住的情境。
const FRAME_CYCLE = [1, 2, 3, 1, 2, 5, 1, 3, 2, 1, 4];

// 跑一局，回傳三層獨立量測：
//   creditCount：直接讀新欄位（去重＝distinct flightId，pid 過濾＝s.playerId）
//   cardCount：驅動真實 matchLoop 函式（逐 tick capture、逐「幀」flush 一次）
//   ledgerMismatches：對照 `game.trustDyn[pid]` 這本真實帳本（不是同一份數字算兩次）
function playOne(seed, pid, { press = false } = {}) {
  const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  const s = { game, aiState: ai, playerId: pid, comboCreditLatch: null, comboCreditSeenFlight: -1 };
  const creditFlights = new Set();
  let ledgerMismatches = 0;
  let cardCount = 0;
  let frameIdx = 0;
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    const ticksThisFrame = FRAME_CYCLE[frameIdx % FRAME_CYCLE.length];
    frameIdx += 1;
    for (let t = 0; t < ticksThisFrame; t += 1) {
      if (game.phase === 'set_over' || game.phase === 'matchover' || guard >= 400000) break;
      guard += 1;
      if (press && !ai.tandemCall && tandemStateOf(game, ai, pid).open) ai.tandemCall = { pid };
      aiCollectIntents(game, ai, [pid]);
      const intents = aiCollectIntents(game, ai, []);
      const before = game.trustDyn[pid] ?? 0;
      stepGame(game, intents);
      const after = game.trustDyn[pid] ?? 0;
      const credit = game.rally.comboAssistCredit;
      if (credit && credit.pid === pid && !creditFlights.has(credit.flightId)) {
        creditFlights.add(credit.flightId);
        const expected = Math.min(TRUST_DYN.CLAMP, before + TRUST_DYN.COMBO_ASSIST);
        if (after !== expected) ledgerMismatches += 1;
      }
      captureComboAssistCredit(s);
    }
    if (s.comboCreditLatch) {
      cardCount += 1;
      s.comboCreditLatch = null;
    }
  }
  return { creditCount: creditFlights.size, cardCount, ledgerMismatches };
}

// ════════ A：張數對得上（驗收條件 4／5①②）════════
test('★張數對得上★ 誘餌獎金真的入帳的次數＝字卡出現的次數（14 局，生產組態）', () => {
  let totalCredit = 0;
  let totalCard = 0;
  let totalMismatch = 0;
  const perSeed = [];
  for (const seed of SEEDS) {
    const r = playOne(seed, 'A4', { press: true });
    totalCredit += r.creditCount;
    totalCard += r.cardCount;
    totalMismatch += r.ledgerMismatches;
    perSeed.push(`${seed}:入帳${r.creditCount}/字卡${r.cardCount}`);
  }
  // 樣本充足性：至少要有兩位數的入帳次數，這條斷言才有解析力（不是 0 vs 0 的空判）
  assert.ok(totalCredit >= 15,
    `入帳樣本只有 ${totalCredit} 次＝這條沒有解析力（${perSeed.join('，')}）`);
  assert.equal(totalMismatch, 0,
    `有 ${totalMismatch} 次入帳與 trustDyn 帳本對不上——comboAssistCredit 只是裝飾旗標，沒跟著錢走`);
  assert.equal(totalCard, totalCredit,
    `字卡張數 ${totalCard} ≠ 真實入帳次數 ${totalCredit}（逐局：${perSeed.join('，')}）`
    + '——多出來是假警報（訓練玩家忽略這個訊號），少了是白做');
});

// ════════ B：不變量掃描——別人入帳不得給我出卡（驗收條件 6）════════
//
// ★★ 為什麼不能只測「B 隊入帳」★★ `applyComboAssist` 的 `a.team !== lastTouchTeam`
// 護欄已經讓跨隊殘帳恆為 0，用 B 隊球員當「別人」樣本會落入 MEDIUM-5 踩過的同一個坑
// ——早在進 `captureComboAssistCredit` 之前，credit 就已經被上一層擋成 null 了，
// 那不是在測 pid 檢查，是在測早就存在的另一道閘。
//
// 真正的「別人」樣本＝**同隊、另一個真正被追蹤（excludeIds）的球員**：本函式受益者
// 結構上只可能是 excludeIds 裡的人（護欄 C），所以只要換一個受控玩家（A6，中攻，
// 無鈕可按、純吃 S 自動排程／25% 自動骰），comboAssistCredit.pid 自然會變成 A6，
// 而不是 A4。這樣才是「credit.pid !== s.playerId」這個分支真的被走到的樣本。
test('★不變量掃描★ 別人（真正受控且真的入帳的另一位球員）入帳不得給我出卡', () => {
  let otherCreditCount = 0;
  let a4FalseLatches = 0;
  let b1FalseLatches = 0;
  for (const seed of SEEDS) {
    const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
    const ai = createAiState();
    // 兩支「別人」探針：同隊不同人（A4）＋對面隊（B1）。playerId 全程固定、乾淨物件。
    const probeA4 = { game, aiState: ai, playerId: 'A4', comboCreditLatch: null, comboCreditSeenFlight: -1 };
    const probeB1 = { game, aiState: ai, playerId: 'B1', comboCreditLatch: null, comboCreditSeenFlight: -1 };
    const seenFlights = new Set();
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      aiCollectIntents(game, ai, ['A6']); // 受控玩家＝A6（不是 A4）——受益者會是他
      const intents = aiCollectIntents(game, ai, []);
      stepGame(game, intents);
      const credit = game.rally.comboAssistCredit;
      if (credit && credit.pid === 'A6' && !seenFlights.has(credit.flightId)) {
        seenFlights.add(credit.flightId);
        otherCreditCount += 1;
      }
      captureComboAssistCredit(probeA4);
      captureComboAssistCredit(probeB1);
      if (probeA4.comboCreditLatch) a4FalseLatches += 1;
      if (probeB1.comboCreditLatch) b1FalseLatches += 1;
      probeA4.comboCreditLatch = null;
      probeB1.comboCreditLatch = null;
    }
  }
  // 樣本充足性：真的要有「別人入帳」的事件發生，不然下面兩條斷言是空判
  assert.ok(otherCreditCount >= 8,
    `「別人（A6）入帳」樣本只有 ${otherCreditCount} 次＝這條沒有解析力`);
  assert.equal(a4FalseLatches, 0,
    `A6 入帳了 ${otherCreditCount} 次，其中有 ${a4FalseLatches} 次也給 A4 出了卡——`
    + '`credit.pid !== s.playerId` 那道閘沒擋住');
  assert.equal(b1FalseLatches, 0,
    `A6 入帳了 ${otherCreditCount} 次，其中有 ${b1FalseLatches} 次也給對面 B1 出了卡`);
});

// 反面（同一條測試的另一半，避免「這個分支到底能不能為真」被質疑）：把 playerId 換成
// 真正的受益者，同一批資料要能點亮——證明上面兩個 false latch 恆為 0 不是因為
// `captureComboAssistCredit` 整支壞掉、或者這批賽局根本沒有任何入帳事件。
test('★不變量掃描（反面）★ 同一批賽局，把探針換成真正的受益者就會點亮', () => {
  let hits = 0;
  for (const seed of SEEDS.slice(0, 4)) {
    const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
    const ai = createAiState();
    const probeA6 = { game, aiState: ai, playerId: 'A6', comboCreditLatch: null, comboCreditSeenFlight: -1 };
    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
      guard += 1;
      aiCollectIntents(game, ai, ['A6']);
      const intents = aiCollectIntents(game, ai, []);
      stepGame(game, intents);
      captureComboAssistCredit(probeA6);
      if (probeA6.comboCreditLatch) { hits += 1; probeA6.comboCreditLatch = null; }
    }
  }
  assert.ok(hits > 0, '同一批賽局換成真正的受益者卻一次都沒點亮——上面兩條「不變量」測試是恆真的空判');
});
