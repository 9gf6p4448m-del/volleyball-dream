// Phase 5 §十-3「牆＝橫向帶」——攔網的三層分工
//
// ★ 病根 ★
// 改制前攔網是一句 `if (dx > BLOCK_REACH_X) continue`：牆沒有寬度這個概念，
// 只有「離球最近那個人搆不搆得到」。於是——
//   ① 兩人並排站在一起 vs 分開站，對攻擊手完全一樣（多人攔網不存在）
//   ② `block` 屬性同時決定「有沒有碰到」與「碰到之後怎樣」，兩件事糊成一個骰
//   ③ 手縫是不存在的東西，因為根本沒有「帶」可以留縫
//
// ★ 三層分工（憲法 §三.1）★
//   | 層       | 決定什麼           | 取代                        |
//   | 幾何閘門 | 有沒有碰到手        | `dx > BLOCK_REACH_X continue` |
//   | 邊緣區   | 碰到的是不是邊緣＝擦手 | `BLOCK_GRAZE_CHANCE 0.22`     |
//   | 屬性擲骰 | 碰到之後**發生什麼**  | `0.12 + block×0.004`          |
//
// **屬性語意改變是本卷的核心**：`block` 不再決定「有沒有攔到」（那交給幾何），
// 只決定攔到之後的結果分佈。真實排球中完整雙人牆對上好攻擊手照樣被得分，用的就是這條。
// 這樣多人加成**完全由幾何湧現**（協議 7），而屬性不貶值。
//
// ★ 本階段（§十 階段一）刻意只做到哪裡 ★
// 階段一驗收＝行為與 fa7e3f4 逐值相同，所以這裡交付的是**帶這個抽象**：
// 區間、聯集、接觸者、結果分類各自有名字、可單測、可抽換。數值全部實例化在等價值上：
//   - 單人半寬填 1.1（現值）——階段五縮到 0.5（真實單人雙臂展開約 1.0m）
//   - 接觸者仍取 dx 最小者，tie-break 沿用 id 字典序
//   - **邊緣區仍是機率帶不是幾何**（見 blockOutcome 的說明）
//
// 階段三「關牆行為」要靠 bandSpan() 才量得出縫；階段五才把邊緣區換成真幾何。
import { BALL, CONVERGE_T } from './constants.js';

// 單人攔網的水平涵蓋半寬（m）——**單一真相來源**。
// 陷阱 1（憲法 §八-1）：這個值改制前有兩份各自寫死的 1.1——`attackZones.js` 的
// `BLOCK_COVER_X`（面板的「被封」提示）與 `game.js` 的 `TUNING.BLOCK_REACH_X`（sim 實際涵蓋）。
// 漏改任一份，面板就會對玩家說謊，直接違反顯示哲學「狀態誠實呈現」。
// 兩邊現在都 import 這裡，改一個地方就好。
// 階段五目標值：0.5（全寬 1.0；雙人 closed 1.55；三人 2.1）。
// 目標值（§1.3；語意＝半寬、原點＝攔網手 x、單位＝公尺絕對值）
const BLOCK_HALF_WIDTH_BASE = 1.1;
export const BLOCK_HALF_WIDTH_TARGET = 0.5;
// 基準 B 收斂後的實際半寬——**單一真相**：sim 的 TUNING.BLOCK_REACH_X 與玩家面板
// （input/attackZones.js）都吃這一個，t 一動兩邊同時動，不會分岔。
export const BLOCK_HALF_WIDTH = (1 - CONVERGE_T) * BLOCK_HALF_WIDTH_BASE
  + CONVERGE_T * BLOCK_HALF_WIDTH_TARGET;

/** 一名攔網手的涵蓋區間 [lo, hi]。 */
export function blockerInterval(x, halfWidth = BLOCK_HALF_WIDTH) {
  return { lo: x - halfWidth, hi: x + halfWidth };
}

/**
 * 由在窗內、且手構得到的攔網手組成「牆」。
 *
 * @param {Array<{id:string, x:number}>} blockers 已通過窗內／高度閘的攔網手，
 *   **順序必須是決定論的**（呼叫端沿用 `Object.values(state.players)` 的既有順序）
 * @returns {{ members: Array, halfWidth: number }}
 */
export function buildBand(blockers, halfWidth = BLOCK_HALF_WIDTH) {
  return {
    members: blockers.map((b) => ({ ...b, ...blockerInterval(b.x, halfWidth) })),
    halfWidth,
  };
}

/**
 * 帶的聯集總寬（m）——**不是**各人寬度加總。
 *
 * 這是階段三「關牆行為」的量尺：兩人站距 > 全寬時聯集會斷開，縫就出現了
 * （縫寬＝實際站距 − 全寬）。階段一沒有消費端，先把量法定下來，
 * 讓階段三的站距分佈驗收有個共同定義。
 */
export function bandSpan(band) {
  if (!band.members.length) return 0;
  const iv = [...band.members].sort((a, b) => a.lo - b.lo);
  let span = 0;
  let lo = iv[0].lo;
  let hi = iv[0].hi;
  for (let i = 1; i < iv.length; i += 1) {
    if (iv[i].lo > hi) { span += hi - lo; lo = iv[i].lo; hi = iv[i].hi; } // 斷開＝有縫
    else if (iv[i].hi > hi) hi = iv[i].hi;
  }
  return span + (hi - lo);
}

/**
 * 幾何閘門：球的過網 x 落在帶內嗎？誰是接觸者？
 *
 * 帶＝各人區間的**聯集**（非加總），所以「在帶內」＝存在任一人涵蓋到。
 * 接觸者＝ dx 最小者；平手時取 id 字典序小者（決定論，沿用改制前的 tie-break）。
 *
 * 涵蓋判定刻意寫成 `dx > halfWidth` 而非 `x < lo || x > hi`：兩者在數學上等價，
 * 在浮點上不是（`x − h` 的捨入與 `|x − m.x|` 的捨入不同），而階段一要的是逐位元相同。
 * `lo`／`hi` 只供 bandSpan() 這種觀測用途，不參與判定。
 */
export function bandContact(band, x) {
  let contact = null;
  for (const m of band.members) {
    const dx = Math.abs(m.x - x);
    if (dx > band.halfWidth) continue;
    if (!contact || dx < contact.dx || (dx === contact.dx && m.id < contact.id)) {
      contact = { ...m, dx };
    }
  }
  return { inside: contact != null, contact };
}

/** 球高過手＝攔不到（W7：累了跳不高）。手的頂邊吃球半徑——球**面**碰到手就算。 */
export function overBlockerHands(ballY, blockerReach) {
  return ballY > blockerReach + BALL.RADIUS;
}

/**
 * 邊緣區 ＋ 屬性擲骰的結果分類。
 *
 * ⚠ **階段一是退化實例化**：真正的模型（憲法 §三.1）是「落在帶的**邊緣**＝擦手」，
 * 也就是 `edge` 應該由 `contact.dx` 相對於 `halfWidth` 的位置決定——**幾何的**。
 * 但改制前的擦手完全不吃幾何：它是同一個 `roll` 上切出來的一段機率帶
 * （`roll >= chance` 且 `roll < chance + 0.22×timingMul`），跟 dx 一點關係都沒有。
 * 為了讓階段一逐值等價，這裡**照抄那個機率帶**，只是給了它名字。
 *
 * 階段五把 `edgeWidth` 換成幾何邊緣區時，會有一個必然的連帶效應：
 * **站在帶正中心（dx=0）將永不擦手**——三支既有治具正好都站在 dx=0
 * （`block-graze.test.mjs:19,111`／`hero-cards.test.mjs:79`），屆時必須改治具。
 * 已登記於 `docs/phase5-section10-test-triage.md` §四。
 *
 * 單一 `roll` 依序切三段是刻意的：rand 呼叫數恆為一次，rng 流與二態時代同節奏。
 *
 * @param {number} roll      一次 rand()（0..1）
 * @param {number} chance    solid 機率（屬性 × 時機 × 情蒐）。⚠ 7.2 查證（07-30）：
 *                            solid ≠ 攔死得分——它是把球軟彈回攻方上空（game.js tryBlock
 *                            的 vz×0.35＋vy=2.2），實測僅 ~25% 最終成為得分；
 *                            「攔網得分」由 growth.js blockPoints 依 SCORE 歸因另計
 * @param {number} edgeWidth 擦手帶寬（現＝ BLOCK_GRAZE_CHANCE × timingMul）
 * @returns {'solid'|'graze'|'clean'}
 */
export function blockOutcome({ roll, chance, edgeWidth }) {
  if (roll < chance) return 'solid';
  if (roll < chance + edgeWidth) return 'graze';
  return 'clean';
}
