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
