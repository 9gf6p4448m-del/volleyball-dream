// 生涯章節（大學卷 批 1，2026-08-14）——存檔要記得住「我在哪一章」。
//
// ★ 為什麼需要它 ★ 現況分辨不出來：`careerScreen.js` 的 `careerOver` 純粹當場由
// `stage + seasonN >= 3` 算出，`schema.js`／`careerStore.js` 查無任何章節旗標
// ⇒ 那顆「▶ 生涯結算」每次載入已完結的存檔都會再長出來，而且**系統分不出
// 「打完高中」與「已經在念大學」**。大學卷的第一件工程就是它，不是寫新內容。
//
// ★ 存在哪 ★ `save.career.chapter`——`career` 是 Phase 3 W1 就留空的預留鍵
// （`schema.js:41-43`「Phase 4 預留：內容本週不定型，保持空物件（不要猜）」）。
// 它在 `TOP_KEYS` 裡所以既有存檔一定有 `career`，只是內容是 `{}` ⇒ 只要對
// **鍵內**缺漏逐項回退就是零遷移，不必動 schema 版本。範式抄 `normalizePractice`。
//
// 卷宗＝`docs/kickoffs/university-chapter-kickoff.md`；
// 驗收＝`docs/kickoffs/acceptance-uni-batch1.md`（動手前凍結）。
//
// 配色卷階段二 E3（2026-08-24）：`universities.js`／`roster.js` 進來——`isUniversity`
// 已是「chapter → true/false」的單一入口，這裡再加一顆「chapter → 隊名字串」的單一入口，
// 兩者同一種呼叫慣例（吃 `normalizeChapter()` 的輸出，例如 `store.loadChapter()`）。
import { universityById } from './universities.js';
import { OUR_TEAM_NAME } from './roster.js';

export const CHAPTER = {
  HIGH_SCHOOL: 'highschool',
  UNIVERSITY: 'university',
};

// 舊存檔（與任何缺鍵／壞值）一律回退高中——★這是 B1-2 零遷移的那一行★
export const DEFAULT_CHAPTER = CHAPTER.HIGH_SCHOOL;

const KNOWN = new Set([CHAPTER.HIGH_SCHOOL, CHAPTER.UNIVERSITY]);

/**
 * 把 `save.career` 這一塊正規化成完整的章節狀態。
 * ★ 認不得的值一律回退高中 ★ 不是丟例外——手改過的存檔、未來章節的存檔在舊版
 * 開啟時，讓玩家回到高中章總比讀檔當場炸掉好（同 `normalizePractice` 的取捨）。
 *
 * @param careerBlock `save.career`（可為 null／`{}`／完整值）
 * @returns { id, enteredAtSeason }  enteredAtSeason＝進入該章時的賽季序號（高中恆 null）
 */
export function normalizeChapter(careerBlock = null) {
  const raw = careerBlock?.chapter ?? null;
  const id = KNOWN.has(raw?.id) ? raw.id : DEFAULT_CHAPTER;
  // 高中章沒有「進入時的賽季」可言（那是起點）——恆 null，避免兩種表示法並存
  if (id === CHAPTER.HIGH_SCHOOL) return { id, enteredAtSeason: null };
  const at = raw?.enteredAtSeason;
  return { id, enteredAtSeason: Number.isInteger(at) && at > 0 ? at : null };
}

export function isHighSchool(chapter) {
  return normalizeChapter({ chapter }).id === CHAPTER.HIGH_SCHOOL;
}

export function isUniversity(chapter) {
  return normalizeChapter({ chapter }).id === CHAPTER.UNIVERSITY;
}

/**
 * 推進到大學章。**純函式**：回傳新的 `save.career` 區塊，不改傳入的那一份。
 * ★ 冪等 ★ 已經在大學章就原樣回傳（含 `enteredAtSeason` 不被覆寫）——防「按兩次
 * 變成兩次升學」，也防 UI 重入時把進入時的賽季蓋掉。
 *
 * @param careerBlock  `save.career`
 * @param seasonIndex  進入大學時的賽季序號
 */
export function enterUniversity(careerBlock = null, seasonIndex = null) {
  const cur = normalizeChapter(careerBlock);
  if (cur.id === CHAPTER.UNIVERSITY) return careerBlock ?? {};
  const at = Number.isInteger(seasonIndex) && seasonIndex > 0 ? seasonIndex : null;
  return {
    ...(careerBlock ?? {}),
    chapter: { id: CHAPTER.UNIVERSITY, enteredAtSeason: at },
  };
}

// ════════════════════════════════════════════════════════════════
// 屆數的章節化（批 4，2026-08-14）
// ════════════════════════════════════════════════════════════════
// `season.index` 是**全域**的線性計數（高中 1→2→3，大學接著 4→5…）。
// 但玩家看到的是「大一」「大二」，判斷年限也要按章算 ⇒ 需要「章內第幾年」。
//
// ★ 為什麼不直接把全域屆數歸零 ★ 那會讓既有存檔的 `season.index` 語意分裂成兩種
// （有些是全域、有些是章內），而屆數散落在賽程、對手升級、招募進度好幾處。
// 保留全域計數、另外算章內年份，是唯一不動既有語意的做法。

// 各章的年限。★ 集中在這裡 ★ 散落各處就會出現「這裡三年、那裡四年」。
// 大學階段一＝1 年（`docs/kickoffs/university-chapter-kickoff.md` 題 2「最小可玩版」）；
// 之後要延長只改這一個值。
export const CHAPTER_SEASONS = {
  [CHAPTER.HIGH_SCHOOL]: 3,
  // 大二卷批 1（2026-08-25 拍板題 1）：1→4——機制做「任意年推進」，內容分批；
  // 大四末收尾儀式是批 4，本表只管「還有沒有下一年」
  [CHAPTER.UNIVERSITY]: 4,
};

/** 這一章的年限（認不得的章節照高中給——保守，不會意外放行）。 */
export function seasonCapOf(chapter) {
  const id = normalizeChapter({ chapter }).id;
  return CHAPTER_SEASONS[id] ?? CHAPTER_SEASONS[CHAPTER.HIGH_SCHOOL];
}

/**
 * 全域屆數 → 章內第幾年。
 * 高中：恆等於全域屆數（那一章從第 1 屆開始，兩者同義）。
 * 大學：`seasonIndex - enteredAtSeason + 1`；`enteredAtSeason` 缺席（壞存檔）時
 *       退化成全域屆數——★不猜★ 猜錯會讓年限判斷失準，寧可保守。
 */
export function chapterSeasonOf(chapter, seasonIndex = 1) {
  const ch = normalizeChapter({ chapter });
  const idx = Number.isInteger(seasonIndex) && seasonIndex > 0 ? seasonIndex : 1;
  if (ch.id === CHAPTER.HIGH_SCHOOL) return idx;
  if (!Number.isInteger(ch.enteredAtSeason) || ch.enteredAtSeason <= 0) return idx;
  return Math.max(1, idx - ch.enteredAtSeason + 1);
}

/** 這一章打完了沒（章內年份已達年限）＝封頂判斷的單一真相源。 */
export function chapterCompleted(chapter, seasonIndex = 1) {
  return chapterSeasonOf(chapter, seasonIndex) >= seasonCapOf(chapter);
}

/**
 * 現在隊伍顯示名稱（配色卷階段二 E3，單一事實來源）：高中章恆為 OUR_TEAM_NAME
 * （`roster.js` 定義的創隊隊名）；大學章＝入學校名。`school` 查無效／未選校
 * （升學過渡中間態）時安全回退 OUR_TEAM_NAME，不炸畫面——同 `kitFor` 缺欄位回
 * null 的防呆慣例。
 *
 * @param chapter  一律吃 `normalizeChapter()` 的輸出（如 `store.loadChapter()`）
 * @param school   大學章的學校 id（如 `store.loadSchool()`）；高中章不使用
 */
export function currentTeamName(chapter, school = null) {
  if (!isUniversity(chapter)) return OUR_TEAM_NAME;
  const uni = school ? universityById(school) : null;
  return uni?.name ?? OUR_TEAM_NAME;
}
