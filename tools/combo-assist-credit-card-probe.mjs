// OPP 夾塞可見度（2026-08-08 Sawmah 裁定）—— 誘餌獎金字卡張數 vs 真實入帳次數
//
// ★ 驗收條件 4 的探針 ★ 這批工程唯一要證明的事：「誘餌獎金真的入帳」與「玩家看到
// 一張字卡」這兩件事的次數必須逐局相等。多出來＝假警報（會訓練玩家忽略這個訊號），
// 少了＝白做（幅度真實存在但玩家還是看不到）。
//
// ★ 三層量測，互相交叉驗證（不是同一份數字算三次）★
//   ① `creditFlights`：直接讀 sim 新欄位 `game.rally.comboAssistCredit`（trust.js
//      applyComboAssist 在真正寫 trustDyn 的同一行旁寫的），逐 tick 掃、以 flightId
//      去重——這是「入帳」的第一手證據。
//   ② `ledgerCross`：獨立於①之外，直接對照 `game.trustDyn[PID]` 這本真實帳本——
//      每次①判定入帳時，同一 tick 的帳本增量必須等於 `min(CLAMP, before+COMBO_ASSIST)`
//      算出來的值，不然①只是一個裝飾性旗標、沒有真的跟著錢走（防「語意不同座標系」）。
//   ③ `cardCount`：驅動 matchLoop 的真實 `captureComboAssistCredit`（逐 tick 取樣）＋
//      模擬 frameStep 的「一幀可能吃好幾個 tick、每幀只 flush 一次」（ticksPerFrame
//      故意跑 1~4 不等的循環，重現「掉幀」情境——這正是 MEDIUM-2 踩過的坑）。
//
// ★ 生產組態 ★ `excludeIds=[PID]` 讓 `applyRouteCommit` 真的記帳（AI vs AI 那條路徑
// 這支機制恆為 no-op，見 `tools/combo-assist-probe.mjs` 開頭的說明）；`press=true`
// 模擬玩家窗開就按（與 `tests/tandem-call-window.test.mjs` E 組治具同款）。
//
// 跑法：node tools/combo-assist-credit-card-probe.mjs [局數=14]
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, tandemStateOf } from '../src/sim/ai.js';
import { TRUST_DYN } from '../src/sim/trust.js';
import { captureComboAssistCredit } from '../src/app/matchLoop.js';

const N = Number.parseInt(process.argv[2] ?? '14', 10);
const PID = 'A4'; // 前排 OPP 槽位（沿用既有夾塞測試治具慣例：DEFAULT_LINEUP index 3）
const FRAME_CYCLE = [1, 2, 3, 1, 2, 4, 1, 3, 2, 1]; // 故意不等長——重現掉幀

function playOne(seed) {
  const game = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  const s = { game, aiState: ai, playerId: PID, comboCreditLatch: null, comboCreditSeenFlight: -1 };

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
      if (!ai.tandemCall && tandemStateOf(game, ai, PID).open) ai.tandemCall = { pid: PID };
      aiCollectIntents(game, ai, [PID]); // 觸發受控玩家的 routeCommit 記帳
      const intents = aiCollectIntents(game, ai, []);
      const before = game.trustDyn[PID] ?? 0;
      stepGame(game, intents);
      const after = game.trustDyn[PID] ?? 0;

      // ① 讀新欄位（直接證據）
      const credit = game.rally.comboAssistCredit;
      if (credit && credit.pid === PID && !creditFlights.has(credit.flightId)) {
        creditFlights.add(credit.flightId);
        // ② 對照真實帳本（獨立於①之外的第二把尺——不是同一份數字算兩次）
        const expected = Math.min(TRUST_DYN.CLAMP, before + TRUST_DYN.COMBO_ASSIST);
        if (after !== expected) {
          ledgerMismatches += 1;
          console.error(`  ⚠ 帳本對不上：flightId=${credit.flightId} before=${before} `
            + `after=${after} expected=${expected}`);
        }
      }
      // ③ 真實 capture（逐 tick，比照 matchLoop stepSim）
      captureComboAssistCredit(s);
    }
    // flush（比照 frameStep：一幀跑完才問一次，不是每 tick 問）
    if (s.comboCreditLatch) {
      cardCount += 1;
      s.comboCreditLatch = null;
    }
  }
  return {
    creditCount: creditFlights.size, cardCount, ledgerMismatches, ticks: guard,
  };
}

console.log(`== 誘餌獎金入帳 vs 字卡張數（${N} 局，PID=${PID}，excludeIds=[PID]，press=窗開就按）==`);
let totalCredit = 0;
let totalCard = 0;
let totalMismatch = 0;
for (let i = 0; i < N; i += 1) {
  const seed = 500000 + i * 7919;
  const r = playOne(seed);
  totalCredit += r.creditCount;
  totalCard += r.cardCount;
  totalMismatch += r.ledgerMismatches;
  const flag = r.creditCount === r.cardCount ? '✅' : '❌';
  console.log(`  seed=${String(seed).padStart(7)}  入帳=${r.creditCount}  字卡=${r.cardCount}  `
    + `帳本不符=${r.ledgerMismatches}  tick=${r.ticks}  ${flag}`);
}
console.log('');
console.log(`合計：入帳 ${totalCredit} 次　字卡 ${totalCard} 次　帳本不符 ${totalMismatch} 次`);
console.log(totalCredit === totalCard && totalMismatch === 0
  ? '✅ 張數逐局相等、帳本逐次相符'
  : '❌ 張數或帳本對不上——見上面逐局明細');
process.exit(totalCredit === totalCard && totalMismatch === 0 ? 0 : 1);
