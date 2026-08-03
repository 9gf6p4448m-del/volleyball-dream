// 攔網時序卷 段 5 — 回饋層：「他賭了、賭錯了、留下空門」
//
// ★ 為什麼要有這一則字卡 ★
// 段 2 之後對方的 commit 攔網手是**真的在賭**（讀二傳配分傾向、押一條線起跳），
// 段 1 之後他賭錯就是真的下不來（滯空 AIR_TICKS 到就落地、失去牆上資格）。
// 但這場賭局玩家從頭到尾看不見——球飛過去了他也不知道剛才有人押錯邊。
// 沒有回饋＝學不到因果，賭局白開。本檔就是把那一瞬間講出來。
//
// ★ 只能用可觀察量（反作弊鐵律）★
// **嚴禁讀 `aiState.blockPlan`**——那是攔網 AI 的私有狀態（他心裡押哪條線）。
// 玩家在場上看得到的只有「人跳起來了沒」「他人在哪、球在哪」，本檔就只讀這些：
//   - 賭了＝`blockUntil >= tick` 且 `tick − blockStartTick <= AIR_TICKS`（人還在空中）
//   - 空門＝那些空中的人，沒有一個的 |x − ball.x| <= BLOCK_HALF_WIDTH（球路上沒有手）
// 兩個常數都從 sim 匯入，**不自己發明距離／窗長**（同一真相，sim 一動這裡跟著動）。
//
// ★ 兩張字卡的措辭差異是量出來的，不是寫爽的（Sawmah 裁定 6）★
//   甲「他賭了、賭錯了——空門是你的！」：扣球者就是受控玩家 ⇒ 因果直連，
//      實測發生率 5.7–6.9%、誤歸因 0.0%，過門檻 ⇒ 可以帶「你」。
//   乙「他賭了，賭錯了，空門！」：扣球者是隊友、玩家本波有跑助跑線 ⇒ **刻意無歸因**。
//      「玩家助跑把攔中帶走」實測發生率 OH 6.1%／MB 3.5–4.1%、誤歸因 20–29%，
//      **沒過門檻（發生率 ≥5% 且誤歸因 ≤20%）**，所以只能陳述「他賭錯了」這個事實，
//      **不得**寫成「你帶走了攔網手」——那句話有兩成以上的時候是假的。
//   兩者皆非（玩家這一波沒參與）⇒ 不出字卡，不對著別人的球喊。
import { AIR_TICKS } from '../sim/approach.js';
import { BLOCK_HALF_WIDTH } from '../sim/blockBand.js';
import { otherTeam, isFrontRow } from '../sim/rotation.js';

/**
 * 本方扣球觸球那一刻，對方是不是「賭了、賭錯了、留下空門」？
 *
 * 純函式：只讀 game／aiState、零 rng、零 DOM、不寫回任何狀態
 * （回傳形狀比照 `callPlay.js` 的 `callFeedbackOf`）。
 *
 * @param {object} game     sim 狀態（讀 tick／ball／actors／players／match.rotations）
 * @param {object} aiState  AI 協調層狀態（只讀 `approach.team`／`approach.routes`）
 * @param {string} playerId 受控玩家 id
 * @param {string} spikerId 這一擊的扣球者 id
 * @returns {{text:string,color:string,ms:number}|null} null＝不出字卡
 */
export function blockBetFeedbackOf(game, aiState, playerId, spikerId) {
  const me = game?.players?.[playerId];
  if (!me) return null;
  const opp = otherTeam(me.teamId);
  const rot = game.match?.rotations?.[opp];
  if (!rot) return null;

  // ① 他賭了嗎：對方前排此刻**物理滯空中**的攔網手（落地的不算——段 1 的直接延伸）
  const airborne = [];
  for (const id of rot) {
    if (!isFrontRow(rot, id)) continue;
    const a = game.actors?.[id];
    if (!a) continue;
    if (a.blockUntil < game.tick) continue;                 // 攔網窗已過
    if (game.tick - a.blockStartTick > AIR_TICKS) continue; // 已落地＝沒在牆上
    airborne.push(a);
  }
  if (!airborne.length) return null; // 沒人賭＝沒有賭錯這回事

  // ② 空門嗎：只要有一隻手涵蓋得到**擊球那一刻的球**，就不是空門。
  //    量的是擊球點不是過網點——與量門檻的 `tools/segf-decoy-probe.mjs` 同一個座標系
  //    （誤歸因率 0.0% 那組數字就是在這個位置上量出來的）。
  const ballX = game.ball?.x ?? 0;
  for (const a of airborne) {
    if (Math.abs(a.x - ballX) <= BLOCK_HALF_WIDTH) return null;
  }

  // ③ 玩家有沒有參與這一波——決定講不講「你」，或根本不講
  if (spikerId === playerId) {
    return { text: '他賭了、賭錯了——空門是你的！', color: '#ffd166', ms: 1600 };
  }
  const ap = aiState?.approach;
  const ranRoute = ap?.team === me.teamId
    && !!ap.routes?.some((r) => r.pid === playerId);
  if (ranRoute) {
    // 無歸因版：只說他賭錯，不說是誰造成的（誤歸因率沒過門檻，見檔頭）
    return { text: '他賭了，賭錯了，空門！', color: '#ffd166', ms: 1400 };
  }
  return null;
}

// ★ 2026-08-03 裁定乙第二步：玩家自己封線的結果字卡 ★
//
// ★ 為什麼要抽成純函式（而不是內聯在 matchLoop）★
// 這則字卡的前一版**恆假了一整天沒人發現**：`6b7051b` 把面板從「何時跳」改成問
// 「封哪邊」之後，生產端寫的是 `{ jumped: false, line }`，而消費端的條件仍是
// `s.mbCommit?.jumped` ⇒ 三句字卡一句都印不出來（08-03 稽核 auditA 抓到）。
// 根因是判定邏輯內聯在 UI 迴圈裡、沒有任何測試守著。抽出來之後
// `tests/block-bet-feedback.test.mjs` 就能把「什麼形狀進、什麼字卡出」釘住。
//
// ★ 判準與 L 指揮的「讀對」共用同一個真相 ★
// `zone` 來自 `game.rally.lastSpikeZone`（`game.js:classifySpikeZone` 在扣球當下分類），
// 與 `liberoRead.js:digReadCorrect` 同源 —— 兩個位置的回饋才不會各說各話。
//
// ★ 為什麼收整個 `mbCommit` 物件而不是收 `line` 字串 ★
// 恆假的根因是**欄位名對不上**（生產端寫 `line`、消費端讀 `jumped`）。
// 若本函式只收字串，取欄位的責任還留在呼叫端 ⇒ 測試守不到那一步、同樣的錯還會再犯。
// 收物件之後，「要讀哪個欄位」變成本函式的責任，測試餵生產端的字面形狀就能釘死它。
//
// @param {string|null} zone 本波扣球的線路分類（line／cross／middle／tip）
//   ＝ `game.rally.lastSpikeZone`
// @param {{line?: string}|null} mbCommit 玩家的封線指令（matchLoop 的 `s.mbCommit`）
export function mbCallFeedbackOf(zone, mbCommit) {
  const calledLine = mbCommit?.line;
  if (!calledLine) return null; // 玩家沒下指令＝沒有賭注，不評
  // 只評方向題。middle／tip 不是「封哪邊」能回答的問題 ⇒ 不評，
  // 免得玩家把「他打中間」誤讀成自己選錯邊。
  if (zone !== 'line' && zone !== 'cross') return null;
  return zone === calledLine
    ? { text: '方向讀對了——他從你頭上過', color: '#ffd166', ms: 1600 }
    : { text: '他打你沒守的那邊', color: '#c8d6eb', ms: 1600 };
}
