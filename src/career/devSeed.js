// 治具：合成高中成績、跳過三年直接測升學（大學卷 批 3，2026-08-14）
//
// ★ 為什麼這是「實作前先做」的那一項（使用者拍板）★
// 題 3 是「高中成績決定分發」，而要驗證它得先打完三屆高中；手感不對就得**再打三年**。
// 這是這一卷最大的返工來源——比任何設計選擇都嚴重。有了它，十秒就能試到三種起點。
//
// ★★ 這個檔會寫存檔，所以安全條件比功能更重要 ★★
// 寫錯槽＝洗掉真人正在玩的生涯。兩道守衛（驗收 B3-S1／B3-S2）：
//   ① **不得有預設槽**——槽參數缺席或不合法就什麼都不做，不是「預設寫槽 1」
//   ② **不得在沒有明確要求時啟動**——沒帶治具參數就零影響，一個位元組都不寫
//
// 驗收＝`docs/kickoffs/acceptance-uni-batch3.md`（動手前凍結）。

import { createSaveV2 } from './schema.js';
import { createCareer, createCareerPlayer } from './careerState.js';
import { FINISH, FINISH_RANK } from './admission.js';

// 三屆的名次組合：讓「三屆最佳成績」等於請求值，其餘兩屆固定較差（不影響最佳值，
// 但避免三屆一模一樣——那會讓「取最好的一屆」這條邏輯在治具上驗不到東西）。
function seasonsFor(best) {
  // 前兩屆固定小組出局：它是最低級，永遠不會蓋過請求的最佳成績。
  //（原本寫成三元判斷，但兩個分支結果相同＝恆真——自己的規則就在掃這種東西。）
  const worse = FINISH.GROUP;
  return [
    { index: 1, wins: 2, losses: 3, champion: false, finish: worse, totals: {} },
    { index: 2, wins: 3, losses: 2, champion: false, finish: worse, totals: {} },
    {
      index: 3,
      wins: 6,
      losses: 1,
      champion: best === FINISH.CHAMPION,
      finish: best,
      totals: {},
    },
  ];
}

/**
 * 產出一份「剛打完高中三屆」的合成存檔。**純函式**（不碰 storage）。
 * @param finish 三屆最佳成績（`FINISH` 之一）
 * @returns 合法的 v2 存檔物件；`finish` 認不得時回 null（★不猜★）
 */
// 當屆的收尾場次（批 5 補）。★ 為什麼非有不可 ★ 沒有它，合成存檔的 `careerStage`
// 是 `group`（當屆一場都沒打）⇒ 生涯畫面認為賽季還在進行，**升學入口根本不會出現**，
// 治具送你到的是「第 3 屆還沒打完」而不是「升學那一刻」。
// ★ 為什麼 id 不用國賽階梯的那三個 ★ `seasonFinishOf` 是用 id 判當屆名次的
// （`admission.js:41`）——借用 `national-qf` 會讓合成的「小組出局」被讀成八強，
// 治具就會開出比它宣稱的更多的候選學校。用一個階梯外的 id，當屆名次照樣是「沒打進
// 淘汰賽」，而分發吃的是三屆封存裡的最佳成績（那份才是治具真正要控制的東西）。
const END_MATCH = {
  id: 'devseed-end', stage: 'national', round: 'qf', opponentId: 'iron-mist', label: '全國賽',
};

export function buildSyntheticSave({ finish, playerName = '治具', seed = 4242 } = {}) {
  if (!(finish in FINISH_RANK)) return null;
  const career = createCareer({ seed, playerName });
  career.schedule = [...career.schedule, END_MATCH];
  career.results = [...career.results, {
    matchId: END_MATCH.id, won: false, scoreA: 21, scoreB: 25,
  }];
  const player = createCareerPlayer(playerName, { seed });
  const save = createSaveV2({ career, player });
  return {
    ...save,
    season: { ...save.season, index: 3, titles: finish === FINISH.CHAMPION ? 1 : 0 },
    // 章節維持高中（尚未升學）——治具要送你到「升學那一刻」，不是替你做決定
    career: { ...save.career, seasons: seasonsFor(finish) },
  };
}

// URL 參數名（兩個都要帶，缺一不啟動）
export const DEV_SEED_PARAM = 'devseed'; // 值＝FINISH 之一
export const DEV_SLOT_PARAM = 'devslot'; // 值＝1–3，★無預設★

/**
 * 從 URL 參數解出治具請求。**沒有預設值**——任何一項缺席／不合法就回 null＝不啟動。
 * ★ 這支函式就是那兩道守衛的單一真相源 ★ 呼叫端不得自己再判一次。
 */
export function devSeedRequest(params) {
  const finish = params?.get?.(DEV_SEED_PARAM) ?? null;
  if (!(finish in FINISH_RANK)) return null;          // B3-S2：沒帶／亂帶＝不啟動
  const slotRaw = Number.parseInt(params?.get?.(DEV_SLOT_PARAM) ?? '', 10);
  if (!Number.isInteger(slotRaw) || slotRaw < 1 || slotRaw > 3) return null; // B3-S1：無預設槽
  return { finish, slot: slotRaw };
}
