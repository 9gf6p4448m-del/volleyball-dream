// 升學評定與分發（大學卷 批 2，2026-08-14）——高中三年的成績決定你進得了哪些大學。
//
// 拍板依據（`docs/kickoffs/university-chapter-kickoff.md`）：
//   題 5 ＝ 三屆**最佳**成績為主（不是累積積分——玩家記得住的是「我拿過冠軍」）
//   題 3 ＝ 成績決定分發；題 9 ＝ 成績決定**候選集合**，玩家在集合內自選
//   ⇒ 合起來：成績決定天花板，玩家決定要什麼樣的故事。
//
// ★★ 歷史從哪來（動手時更正過一次，記在這裡免得後人重走）★★
// 我一開始判定「三屆最佳成績算不出來」（因為 `advanceSeason` 每屆清空 `results`），
// 打算另建一份 `seasonLog`。**那是錯的**——`careerStore.archiveSeasonSummary`
// 早就逐屆封存 `career.seasons`（`{index, wins, losses, champion, totals}`）。
// 另建一份等於**同一件事兩份歷史**，遲早互相矛盾。
// 正解＝在既有封存裡多一個 `finish` 欄位（五級名次），本檔只負責讀。
// ⚠ **降級（不得假裝完整）**：`finish` 是 2026-08-14 才加的，**既有存檔的舊條目沒有它**
//   ⇒ 只能用 `champion` 布林回退成「冠軍 or 不知道」，分不出當年是亞軍還是八強。
//   這是資料當年沒存，不是判定寫壞。
//
// 驗收＝`docs/kickoffs/acceptance-uni-batch2.md`（動手前凍結）。

// 五級名次。★ 值是穩定字串，會落檔（`career.seasons[].finish`）★ 改名＝既有存檔讀不回來。
export const FINISH = {
  CHAMPION: 'champion',
  RUNNER_UP: 'runner-up',
  SEMI: 'semi',       // 四強（準決賽敗）
  QUARTER: 'quarter', // 八強（八強戰敗）
  GROUP: 'group',     // 沒打進淘汰賽
};

// 排序：數字越大越好。比較一律走這張表，不要在別處寫第二套順序。
export const FINISH_RANK = {
  [FINISH.GROUP]: 0,
  [FINISH.QUARTER]: 1,
  [FINISH.SEMI]: 2,
  [FINISH.RUNNER_UP]: 3,
  [FINISH.CHAMPION]: 4,
};

// 國賽階梯的場次 id（`schedule.js:13-17` NATIONAL_LADDER）。
// ★ 用 id 不用 label ★ label（'八強'／'決賽'）是**顯示字串**，而且 `matchFormatOf`
// 已經在用它判賽制——拿顯示字串當判準是「同名不同義」的常見入口。
const KO_IDS = { QF: 'national-qf', SF: 'national-sf', FINAL: 'national-final' };

/**
 * 這一屆打到哪。**純函式**，只看傳進來的 career（當屆 schedule＋results）。
 * @param career `careerState` 形狀（需要 schedule 與 results）
 * @returns FINISH 之一
 */
export function seasonFinishOf(career = null) {
  const results = career?.results ?? [];
  const resultOf = (id) => results.find((r) => r.matchId === id) ?? null;
  const fin = resultOf(KO_IDS.FINAL);
  if (fin) return fin.won ? FINISH.CHAMPION : FINISH.RUNNER_UP;
  const sf = resultOf(KO_IDS.SF);
  if (sf && !sf.won) return FINISH.SEMI;
  const qf = resultOf(KO_IDS.QF);
  if (qf && !qf.won) return FINISH.QUARTER;
  // 打贏了八強／準決賽但還沒打下一場＝賽季未結束，這裡不猜——照「還沒打進去」算。
  // 呼叫端（賽季推進）只在賽季真的結束時才記錄，所以中間態不會被寫進 log。
  return FINISH.GROUP;
}

/**
 * 讀既有的屆末封存（`save.career.seasons`，由 `careerStore.archiveSeasonSummary` 寫）。
 * ★ 不另建歷史 ★ 這裡只讀、只正規化。
 * 舊條目沒有 `finish`（2026-08-14 才加）⇒ 用 `champion` 布林回退：
 *   champion:true → 冠軍；champion:false → **不知道**（回 null，不猜成小組）。
 * 不知道的條目不進候選——猜低了會讓拿過亞軍的老玩家被分發到弱校。
 */
export function normalizeSeasonLog(careerBlock = null) {
  const raw = careerBlock?.seasons;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    const season = Number.isInteger(e?.index) && e.index > 0 ? e.index : null;
    if (season == null) continue;
    if (e?.finish in FINISH_RANK) { out.push({ season, finish: e.finish }); continue; }
    if (e?.champion === true) { out.push({ season, finish: FINISH.CHAMPION }); continue; }
    // 舊條目且非冠軍＝名次不明，略過（不猜）
  }
  return out.sort((a, b) => a.season - b.season);
}

/**
 * 三屆最佳成績。
 * @param careerBlock  `save.career`（提供既有的 `seasons` 封存）
 * @param titles       奪冠次數（`career.titles`）——★第二道回退★
 *                     連 `career.seasons` 都沒有的更舊存檔，titles>0 仍還原得出「拿過冠軍」
 * @param currentFinish 當屆名次（還沒寫進 log 的那一屆；可省）
 */
export function bestFinishOf(careerBlock = null, { titles = 0, currentFinish = null } = {}) {
  const candidates = normalizeSeasonLog(careerBlock).map((e) => e.finish);
  if (currentFinish in FINISH_RANK) candidates.push(currentFinish);
  // ★ 回退：拿過冠軍就至少是冠軍 ★ 舊存檔的第 1／2 屆名次沒存，只有 titles 留得住
  if ((titles ?? 0) > 0) candidates.push(FINISH.CHAMPION);
  if (!candidates.length) return FINISH.GROUP;
  return candidates.reduce((best, f) => (FINISH_RANK[f] > FINISH_RANK[best] ? f : best));
}

// ════════════════════════════════════════════════════════════════
// 分發：成績 → 候選學校**等級**集合
// ════════════════════════════════════════════════════════════════
// ★ 本批只定規則與詞彙，學校名單是批 5 ★ 這樣分發邏輯現在就可測，
// 不必等內容寫完（也避免規則被塞進資料表裡、日後兩處各自漂移）。

export const TIER = {
  POWERHOUSE: 'powerhouse', // 強豪：已有王牌，你的球權從地板 27% 起，但走得到全國
  MID: 'mid',               // 中段：球權與戰績都在中間
  WEAK: 'weak',             // 弱校：你就是王牌，球隨你打，但可能一輪遊
};

// 成績 → 開得出哪些等級。★ 越好的成績選項越多，不是「只能去強豪」★
// 那是題 9 的核心：成績決定**天花板**，玩家自己決定要什麼樣的故事
// （可以拿冠軍卻刻意去弱校當王牌）。
const TIERS_BY_FINISH = {
  [FINISH.CHAMPION]: [TIER.POWERHOUSE, TIER.MID, TIER.WEAK],
  [FINISH.RUNNER_UP]: [TIER.POWERHOUSE, TIER.MID, TIER.WEAK],
  [FINISH.SEMI]: [TIER.MID, TIER.WEAK],
  [FINISH.QUARTER]: [TIER.MID, TIER.WEAK],
  [FINISH.GROUP]: [TIER.WEAK],
};

/** 這個成績開得出哪些學校等級（決定論；認不得的成績照最低給）。 */
export function admissionTiersFor(finish) {
  return [...(TIERS_BY_FINISH[finish] ?? TIERS_BY_FINISH[FINISH.GROUP])];
}
