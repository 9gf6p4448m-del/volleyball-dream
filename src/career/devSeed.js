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
// 批 2 治具跳年只允許碰 universities（驗參數用）——推進一律走 store 公開方法，
// 不得 import buildUniSchedule/uniSeasonTurnover/buildUniMembers（B2-2 機械判定）
import { universityById } from './universities.js';
import { corporationById } from './corporations.js';
import { proTeamById } from './proTeams.js';
import { isForeignTeamId } from './foreignTeams.js';

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

// ---- 大二卷批 2：治具跳年（acceptance-uni-y2-batch2.md）----
// `?devuni=<校id>:<年1-4>`，只在 devSeedRequest 成立時被 main.js 消費——
// devseed/devslot 缺任一＝整組治具不啟動，devuni 單獨出現零寫入（既有守衛）。
export const DEV_UNI_PARAM = 'devuni';

/** 解 devuni 參數。任何一段不合法＝null（忽略跳年、其餘照舊——少做不多做）。 */
export function devUniRequest(params) {
  const raw = params?.get?.(DEV_UNI_PARAM) ?? null;
  if (typeof raw !== 'string' || !raw.includes(':')) return null;
  const idx = raw.lastIndexOf(':');
  const schoolId = raw.slice(0, idx);
  const yearRaw = raw.slice(idx + 1);
  // ★全字串驗證，不用 parseInt★（批 2 覆審 LOW）：parseInt 對 "3.5" 會靜默截成 3
  // 悄悄接受——治具參數打錯要明著失效，不要猜
  if (!/^[1-4]$/.test(yearRaw)) return null;
  if (!universityById(schoolId)) return null;          // 校不存在＝不啟動（不猜）
  return { schoolId, year: Number(yearRaw) };
}

/**
 * 把當前槽（已是「剛打完高中三屆」的合成存檔）推進到大學第 `year` 年開局。
 * ★ 全程走正式路徑 ★ enterUniversity ＋ 批 1 的 store.advanceSeason（含換血、
 * 大一摘要封存、信任帶走）——治具合成的只有「當季戰績」（勝敗交錯決定論，
 * 與 uni-year2-advance 測試 fixture 同式），世界的推進不另造一條。
 * 注意：直接進指定校＝繞過升學候選集合檢查（治具語意）。
 * @returns true＝到位；false＝中途任何一步失敗（不半吊子續跑）
 */
export function advanceToUniYear(store, { schoolId, year }) {
  if (!store.enterUniversity?.(schoolId)) return false;
  for (let y = 1; y < year; y += 1) {
    const career = store.loadCareer?.();
    const league = (career?.schedule ?? []).filter((m) => m?.round === 'league');
    if (!league.length) return false;
    store.saveCareer?.({
      ...career,
      results: league.map((m, i) => ({
        matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
        scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
      })),
    });
    if (!store.advanceSeason?.()) return false;
  }
  return true;
}

// ---- 企業章批 2：治具入章（acceptance-corp-batch2.md A2-5）----
// `?devcorp=<企業id>`，同 devuni：只在 devSeedRequest 成立時被 main.js 消費，
// 單獨出現零寫入。與 devuni 同時出現時 devcorp 優先（它本來就包含跑完大學四年）。
export const DEV_CORP_PARAM = 'devcorp';

// 治具用的大學母校（走完四年用；固定一所＝決定論。要測不同 uniRank 起點，
// 現階段用正式流程打——治具控名次是掛帳，不在 A2-5 範圍）
const DEV_CORP_UNI = 'haiyan';

/** 解 devcorp 參數。隊不存在＝null（不啟動、不猜）——驗參數允許 import corporations，
 *  同 devuni 之於 universities 的既有先例（B2-2 註解）。 */
export function devCorpRequest(params) {
  const raw = params?.get?.(DEV_CORP_PARAM) ?? null;
  if (typeof raw !== 'string' || !raw) return null;
  if (!corporationById(raw)) return null;
  return { corpId: raw };
}

/**
 * 把當前槽推進到「已簽入指定企業隊、企業賽季開局」。
 * ★ 全程走正式鏈 ★ enterUniversity → 逐年 advanceSeason → U4 打滿 →
 * settleUniFinale → enterCorporate——治具合成的只有各年戰績（與跳年同式）。
 * 注意：直接簽指定隊＝繞過邀約集合檢查（治具語意，同 devuni 繞過升學候選集合）。
 * @returns true＝到位；false＝中途任何一步失敗（不半吊子續跑）
 */
export function advanceToCorp(store, { corpId }) {
  if (!advanceToUniYear(store, { schoolId: DEV_CORP_UNI, year: 4 })) return false;
  const career = store.loadCareer?.();
  const league = (career?.schedule ?? []).filter((m) => m?.round === 'league');
  if (!league.length) return false;
  store.saveCareer?.({
    ...career,
    results: league.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
  if (!store.settleUniFinale?.()) return false;
  if (!store.enterCorporate?.(corpId)) return false;
  return true;
}

// ---- 職業章批 2：治具入章（acceptance-pro-batch2.md B5）----
// `?devpro=<隊id>`，同 devcorp：只在 devSeedRequest 成立時被 main.js 消費，
// 單獨出現零寫入。與 devcorp/devuni 同時出現時 devpro 優先（它本來就包含跑完
// 企業季——含先走完 enterCorporate 與企業季合成戰績、settleCorpFinale）。
export const DEV_PRO_PARAM = 'devpro';

// 治具用的固定企業母隊（走完企業季用；固定一家＝決定論，同 DEV_CORP_UNI 的先例）。
const DEV_PRO_CORP = 'panshi-heavy';

/** 解 devpro 參數。隊不存在＝null（不啟動、不猜）——驗參數允許 import proTeams，
 *  同 devcorp 之於 corporations 的既有先例。 */
export function devProRequest(params) {
  const raw = params?.get?.(DEV_PRO_PARAM) ?? null;
  if (typeof raw !== 'string' || !raw) return null;
  if (!proTeamById(raw)) return null;
  // 國外聯賽卷批 1 覆審 CRITICAL 修：BY_ID 併表後 proTeamById 對海外 id 也回真值，
  // 但 devpro 走的 enterPro 鏈是「首約」——首約恆國內（門檻制：海外唯一入口＝
  // 批 2 的 transferPro 正式鏈；治具入口另立 ?devforeign）。放行的話 enterPro
  // 會寫出 schedule=[] 的卡死存檔（seasonConcluded 恆假、nextMatch 恆 null）。
  if (isForeignTeamId(raw)) return null;
  return { teamId: raw };
}

/**
 * 把當前槽推進到「已簽入指定職業隊、職業賽季開局」。
 * ★ 全程走正式鏈 ★ advanceToCorp（含 enterUniversity → 逐年 advanceSeason →
 * U4 打滿 → settleUniFinale → enterCorporate）→ 逐場合成企業季戰績 →
 * settleCorpFinale → enterPro——治具合成的只有各年/各季戰績（與 advanceToCorp 同式）。
 * 注意：直接簽指定隊＝繞過邀約集合檢查（治具語意，同 devcorp 繞過邀約集合）。
 * @returns true＝到位；false＝中途任何一步失敗（不半吊子續跑）
 */
export function advanceToPro(store, { teamId }) {
  if (!advanceToCorp(store, { corpId: DEV_PRO_CORP })) return false;
  const career = store.loadCareer?.();
  const league = (career?.schedule ?? []).filter((m) => m?.round === 'corp');
  if (!league.length) return false;
  store.saveCareer?.({
    ...career,
    results: league.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
  if (!store.settleCorpFinale?.()) return false;
  if (!store.enterPro?.(teamId)) return false;
  return true;
}
