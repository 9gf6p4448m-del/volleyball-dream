// 卷五 查證 2（停等點 2，2026-08-02）：MB 快攻的時序前提到底成不成立
//
// 為什麼要查：裁定 5「S 選檔 → MB 自己決定跑不跑 → 不跑則 S 改給別人、**零懲罰**」
// 整段建立在兩個時序假設上。簡報 §三.2 自己標了「本節是假說（未驗）」，
// §五.2 要求動手前實測。翻掉的話零懲罰要重議、施工要停在這一點。
//
// 兩問：
//   ① 快攻是**盲跳**嗎——MB 的起跳 tick 是否早於 S 接觸球的 tick？
//      成立才有「必須先講好」這件事（球到手上才選就來不及）。
//   ② 承諾判定點（`route.startTick`，MB 沒進助跑線就判定放棄）是否早於
//      **S 的選人窗開始**？S 得來得及把球改給別人；判定落在選人窗之後＝
//      「不跑」的資訊來不及送到 S 面前 ⇒ 整波垮掉 ⇒ 零懲罰不成立。
//      ★ 這一問是**新制才有的**：入口搬家後選人窗是最後 SET_READY_TICKS 個 tick。
//
// ⚠ 護欄 C（ai.js:971）：`applyRouteCommit` 在 excludeIds 為空時第一行就 return
//   ⇒ AI vs AI 對局量不到承諾判定。本探針因此指定一名受控玩家（預設 MB）。
//
// 取得路徑＝真實路徑：跑真的 createGame／aiCollectIntents／stepGame，讀協調層自己
// 寫的 `aiState.approach.routes` 與 `aiState.routeCommit`，不重抄任何一份時序計算。
//
// 用法：node tools/vol5-timing-check-probe.mjs
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { SET_READY_TICKS } from '../src/input/setOptions.js';

const SEEDS = Number(process.env.VD_SEEDS ?? 40);
const QUICK_KINDS = new Set(['quick']);

const rows = [];

for (let seed = 1; seed <= SEEDS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  // 受控玩家＝A 隊的 MB（快攻手本人）。護欄 C 需要非空 excludeIds 才會記帳。
  const mb = g.match.rotations.A.find((id) => g.players[id].currentRole === 'middle');
  if (!mb) continue;
  const excluded = [mb];
  let cur = null;
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const intents = aiCollectIntents(g, ai, excluded);
    const inWindow = g.phase === 'rally' && g.rally.touches === 1
      && ai.landingTeam === 'A' && ai.approach?.team === 'A' && ai.approach.routes;
    if (inWindow) {
      if (!cur || cur.flightId !== g.rally.flightId) {
        const quick = ai.approach.routes.find((r) => QUICK_KINDS.has(r.kind));
        cur = {
          flightId: g.rally.flightId,
          setTick: ai.approach.setTick ?? null,       // S 預估接觸 tick（接球高度錨點）
          quickStart: quick?.startTick ?? null,       // 快攻的起步 tick
          quickTakeoff: quick?.takeoffTick ?? null,   // 快攻的起跳 tick
          quickPid: quick?.pid ?? null,
          pickWindowTick: null,   // S 選人窗開始的 tick（剩餘 ≤ SET_READY_TICKS）
          ranJudgedTick: null,    // 承諾判定實際發生的 tick（ran 從 null 變布林）
          ranValue: null,
          minEta: null,           // 診斷：本波觀察到的最小 ETA（看窗有沒有開到）
          ticksSeen: 0,           // 診斷：本波被觀察到幾個 tick
        };
        rows.push(cur);
      }
      // S 選人窗開始：用與 UI 逐字相同的量（setContactPoint.ticks，手點高度）
      cur.ticksSeen += 1;
      // ⚠ 扣掉已過去的 tick：ensureFlightPlan 有 flight 級呼叫鎖定（ai.js:317），
      //   `ticks` 是規劃那一刻的值、整波不變 ⇒ 不扣就恆為 ~95（本探針第一版的 bug）
      const etaRaw = ai.setContactPoint?.ticks;
      const eta = Number.isFinite(etaRaw) ? etaRaw - (g.tick - ai.planTick) : null;
      if (Number.isFinite(eta) && (cur.minEta == null || eta < cur.minEta)) cur.minEta = eta;
      if (cur.pickWindowTick == null
        && Number.isFinite(eta) && eta <= SET_READY_TICKS) cur.pickWindowTick = g.tick;
      // 承諾判定：讀協調層自己的帳本，不重算判定條件
      if (cur.ranJudgedTick == null && ai.routeCommit?.flightId === cur.flightId) {
        const e = ai.routeCommit.entries.find((x) => x.pid === cur.quickPid);
        if (e && e.ran !== null) { cur.ranJudgedTick = g.tick; cur.ranValue = e.ran; }
      }
    } else if (cur) {
      cur = null;
    }
    stepGame(g, intents);
  }
}

const q = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const f = (v) => (v == null ? '  n/a' : String(v).padStart(5));
const pct = (k, n) => (n ? (100 * k / n).toFixed(1) : 'n/a');
const sePct = (k, n) => (n ? (100 * Math.sqrt((k / n) * (1 - k / n) / n)).toFixed(1) : 'n/a');

console.log(`=== 卷五 查證 2：MB 快攻的時序前提（${SEEDS} 局，受控玩家＝A 隊 MB）===\n`);
console.log(`我方組織的波數：${rows.length}`);
const withQuick = rows.filter((r) => r.quickPid);
console.log(`其中攻擊池裡有快攻線的：${withQuick.length}`
  + `（${pct(withQuick.length, rows.length)}%）\n`);

// ---- 問 ①：快攻是盲跳嗎 ----
const bothTicks = withQuick.filter((r) => r.quickTakeoff != null && r.setTick != null);
const blind = bothTicks.filter((r) => r.quickTakeoff < r.setTick);
const leads = bothTicks.map((r) => r.setTick - r.quickTakeoff);
console.log('-- ① 快攻起跳早於 S 接觸？（成立＝盲跳＝「必須先講好」）--');
console.log(`可比對的波數：${bothTicks.length}`);
console.log(`起跳早於 S 接觸：${pct(blind.length, bothTicks.length)}%`
  + ` ± ${sePct(blind.length, bothTicks.length)}pp`);
console.log(`提前量（setTick − takeoffTick，正＝球還沒到手他就跳了）：`
  + `p10 ${f(q(leads, 0.1))}  p50 ${f(q(leads, 0.5))}  p90 ${f(q(leads, 0.9))} tick`);

// ---- 問 ②：承諾判定早於 S 選人窗嗎 ----
const judged = withQuick.filter((r) => r.ranJudgedTick != null && r.pickWindowTick != null);
const early = judged.filter((r) => r.ranJudgedTick < r.pickWindowTick);
const margins = judged.map((r) => r.pickWindowTick - r.ranJudgedTick);
console.log('\n-- ② 承諾判定早於 S 選人窗開始？（成立＝S 來得及改給別人）--');
console.log(`兩個 tick 都取得到的波數：${judged.length}`
  + `（判定沒發生＝MB 全程沒被判過，或選人窗沒開到）`);
console.log(`判定早於選人窗：${pct(early.length, judged.length)}%`
  + ` ± ${sePct(early.length, judged.length)}pp`);
console.log(`餘裕（選人窗開始 − 判定 tick，正＝S 進選人窗前就知道 MB 沒跑）：`
  + `p10 ${f(q(margins, 0.1))}  p50 ${f(q(margins, 0.5))}  p90 ${f(q(margins, 0.9))} tick`);
// 診斷：② 沒有樣本時，先分辨是「窗沒開到」還是「判定沒發生」
if (!judged.length) {
  const seen = withQuick.map((r) => r.ticksSeen);
  const minEtas = withQuick.filter((r) => r.minEta != null).map((r) => r.minEta);
  console.log('  ⚠ 診斷（n=0 時才印）：');
  console.log(`     每波被觀察到的 tick 數：p50 ${f(q(seen, 0.5))}  max ${f(Math.max(...seen))}`);
  console.log(`     每波觀察到的最小 ETA：p10 ${f(q(minEtas, 0.1))}  p50 ${f(q(minEtas, 0.5))}`
    + `  min ${f(minEtas.length ? Math.min(...minEtas) : null)}（門檻 ${SET_READY_TICKS}）`);
  console.log(`     ETA 取得到的波數：${minEtas.length}／${withQuick.length}`);
  console.log(`     承諾判定有發生的波數：`
    + `${withQuick.filter((r) => r.ranJudgedTick != null).length}／${withQuick.length}`);
}
const ranTrue = judged.filter((r) => r.ranValue === true).length;
console.log(`判定結果分佈：跑了 ${pct(ranTrue, judged.length)}%／沒跑`
  + ` ${pct(judged.length - ranTrue, judged.length)}%（n=${judged.length}）`);
console.log('  ↑ 兩側都要有樣本，否則「判定」等於沒有判＝零懲罰無從觸發');

// ---- 對照：承諾判定 vs 起步 tick（確認判定點就是 startTick）----
const startVsJudge = withQuick.filter((r) => r.ranJudgedTick != null && r.quickStart != null)
  .map((r) => r.ranJudgedTick - r.quickStart);
console.log(`\n（對照）判定 tick − 起步 tick：p50 ${f(q(startVsJudge, 0.5))}`
  + `  max ${f(startVsJudge.length ? Math.max(...startVsJudge) : null)}`);
console.log('  ↑ ai.js:1007 用 `tick >= startTick` ⇒ 這個差應該是 0 或很小的正數；'
  + '\n    差很大代表規劃點晚於 startTick（註解已預告一速／二速會這樣）');
