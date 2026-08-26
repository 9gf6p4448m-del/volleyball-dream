// 大學卷 批 1「章節狀態進存檔」（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch1.md`（動手前凍結，B1-1～B1-5）。
//
// ★ 為什麼要這一批 ★ 存檔現在分辨不出「打完高中」與「已經在念大學」——
// `careerScreen` 的 careerOver 純粹當場由 stage+seasonN>=3 算出，沒有任何章節旗標
// ⇒ 已完結的存檔每次載入都會再長出「▶ 生涯結算」按鈕。
//
// ★ 鑑別力 ★ B1-2（零遷移）與 B1-3②（大學章不顯示按鈕）各配一條反向對照，
// 且 B1-3 走**真的 UI 路徑**（假 DOM ＋ createCareerScreen），不掃原始碼字串。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAPTER, DEFAULT_CHAPTER, normalizeChapter, isHighSchool, isUniversity, enterUniversity,
  CHAPTER_SEASONS, seasonCapOf, chapterSeasonOf, chapterCompleted,
} from '../src/career/chapter.js';
import { createSaveV2 } from '../src/career/schema.js';

// ════════════════════════════════════════════════════════════
// B1-1／B1-2：正規化與零遷移
// ════════════════════════════════════════════════════════════

test('B1-2 舊存檔零遷移：沒有章節欄位 ⇒ 回退高中', () => {
  assert.equal(normalizeChapter(null).id, DEFAULT_CHAPTER);
  assert.equal(normalizeChapter({}).id, DEFAULT_CHAPTER, '既有存檔的 career 就是 {}');
  assert.equal(normalizeChapter({ chapter: null }).id, DEFAULT_CHAPTER);
  assert.equal(DEFAULT_CHAPTER, CHAPTER.HIGH_SCHOOL);
});

test('★B1-2 核心★ 舊存檔載入後，除了章節之外**每一個欄位逐值不變**', () => {
  // 模擬一份 Phase 3 就存在的存檔：career 是空物件
  const old = createSaveV2({});
  const snapshot = JSON.parse(JSON.stringify(old));
  // 讀章節（正規化）不得改動存檔本身
  const ch = normalizeChapter(old.career);
  assert.equal(ch.id, CHAPTER.HIGH_SCHOOL);
  assert.deepEqual(JSON.parse(JSON.stringify(old)), snapshot,
    '★零遷移★ 讀一次章節就把存檔改掉＝所有既有存檔都會被動到');
});

test('★反向對照★ 拿掉回退的話舊存檔會拿到 undefined（證明上面那條驗得到東西）', () => {
  const old = createSaveV2({});
  assert.equal(old.career?.chapter?.id, undefined,
    '既有存檔本來就沒有這個欄位——所以回退不是裝飾，沒有它就是 undefined');
});

test('認不得的章節值回退高中（手改的存檔／未來章節在舊版開啟）', () => {
  // ★職業章批 1（2026-08-26）修正★ 'pro' 原本是「還不存在的未來章節」範例，現在是
  // `CHAPTER.PRO` 真實 id（acceptance-pro-batch1.md A1）——換一個仍確定認不得的字串，
  // 行為斷言（未知值回退高中）不變。
  assert.equal(normalizeChapter({ chapter: { id: 'legacy-future-chapter' } }).id, CHAPTER.HIGH_SCHOOL);
  assert.equal(normalizeChapter({ chapter: { id: 42 } }).id, CHAPTER.HIGH_SCHOOL);
  assert.equal(normalizeChapter({ chapter: 'university' }).id, CHAPTER.HIGH_SCHOOL,
    '形狀不對（字串而非物件）也要回退，不得半信半疑地採用');
});

test('B1-1 章節狀態存得住：序列化來回逐值相同', () => {
  const block = enterUniversity({}, 4);
  const round = normalizeChapter(JSON.parse(JSON.stringify(block)));
  assert.deepEqual(round, { id: CHAPTER.UNIVERSITY, enteredAtSeason: 4 });
});

test('高中章的 enteredAtSeason 恆為 null（不留兩種表示法）', () => {
  assert.deepEqual(normalizeChapter({ chapter: { id: 'highschool', enteredAtSeason: 9 } }),
    { id: CHAPTER.HIGH_SCHOOL, enteredAtSeason: null });
});

test('isHighSchool／isUniversity：缺席一律當高中（呼叫端不必自己寫死字串）', () => {
  assert.equal(isHighSchool(undefined), true);
  assert.equal(isHighSchool(null), true);
  assert.equal(isHighSchool({ id: CHAPTER.UNIVERSITY }), false);
  assert.equal(isUniversity({ id: CHAPTER.UNIVERSITY }), true);
  assert.equal(isUniversity(undefined), false);
});

// ════════════════════════════════════════════════════════════
// B1-4：推進冪等
// ════════════════════════════════════════════════════════════

test('B1-4 推進到大學章：純函式不改傳入值', () => {
  const before = {};
  const snapshot = JSON.stringify(before);
  const after = enterUniversity(before, 4);
  assert.equal(JSON.stringify(before), snapshot, 'enterUniversity 不得就地改');
  assert.equal(normalizeChapter(after).id, CHAPTER.UNIVERSITY);
});

test('★B1-4 冪等★ 重複推進與推進一次相同，且不覆寫進入時的賽季', () => {
  const once = enterUniversity({}, 4);
  const twice = enterUniversity(once, 99); // 第二次帶了不同的賽季
  assert.deepEqual(normalizeChapter(twice), normalizeChapter(once));
  assert.equal(normalizeChapter(twice).enteredAtSeason, 4,
    '★核心★ 按第二次把進入賽季蓋成 99＝重入時歷史被改寫');
});

test('推進時保留 career 區塊裡的其他鍵（不得整包覆蓋）', () => {
  const after = enterUniversity({ somethingElse: 7 }, 4);
  assert.equal(after.somethingElse, 7, '未來別的功能也會用 career 這個鍵');
});

test('沒給賽季序號時 enteredAtSeason 為 null（不硬塞一個假的）', () => {
  assert.equal(normalizeChapter(enterUniversity({}, null)).enteredAtSeason, null);
  assert.equal(normalizeChapter(enterUniversity({}, 0)).enteredAtSeason, null);
  assert.equal(normalizeChapter(enterUniversity({}, -3)).enteredAtSeason, null);
});

// ════════════════════════════════════════════════════════════
// 批 4：屆數章節化（驗收 B4-1～B4-5）
// ════════════════════════════════════════════════════════════

test('★B4-1 最重要★ 高中封頂行為逐值不變：1/2 屆未到頂、第 3 屆到頂', () => {
  assert.equal(chapterCompleted(undefined, 1), false);
  assert.equal(chapterCompleted(undefined, 2), false);
  assert.equal(chapterCompleted(undefined, 3), true, '高中仍然三屆封頂');
});

test('★B4-1 反向對照★ 年限改成 4 的話第 3 屆就沒到頂（證明不是恆假）', () => {
  // 不改實作，直接驗「判斷式真的吃年限」：高中年限 3 ⇒ 第 3 屆到頂、第 2 屆沒到頂。
  // 若判斷式恆為 true/false，這兩個值不可能同時成立。
  assert.notEqual(chapterCompleted(undefined, 2), chapterCompleted(undefined, 3),
    '★核心★ 第 2 屆與第 3 屆的結果必須不同——相同就代表判斷式沒在看屆數');
  assert.equal(seasonCapOf(undefined), 3, '高中年限是 3');
  assert.equal(CHAPTER_SEASONS[CHAPTER.HIGH_SCHOOL], 3);
});

test('B4-2 章內年份：高中恆等於全域屆數', () => {
  for (const i of [1, 2, 3]) assert.equal(chapterSeasonOf(undefined, i), i);
});

test('B4-2 章內年份：大學從進入那一屆起算', () => {
  const ch = { id: CHAPTER.UNIVERSITY, enteredAtSeason: 4 };
  assert.equal(chapterSeasonOf(ch, 4), 1, '進入的那一屆＝大一');
  assert.equal(chapterSeasonOf(ch, 5), 2);
  assert.equal(chapterSeasonOf(ch, 6), 3);
});

test('★B4-2 反向對照★ 同一個全域屆數、不同進入點 ⇒ 章內年份不同', () => {
  const early = { id: CHAPTER.UNIVERSITY, enteredAtSeason: 4 };
  const late = { id: CHAPTER.UNIVERSITY, enteredAtSeason: 6 };
  assert.notEqual(chapterSeasonOf(early, 7), chapterSeasonOf(late, 7),
    '★核心★ 相同就代表根本沒在用進入點換算');
});

test('B4-3 大學年限＝4（大二卷批1改寫：拍板題1，原「階段一＝1」語意到期），且集中在一處', () => {
  assert.equal(CHAPTER_SEASONS[CHAPTER.UNIVERSITY], 4);
  assert.equal(seasonCapOf({ id: CHAPTER.UNIVERSITY, enteredAtSeason: 4 }), 4);
  // 大一～大三未到頂（還有下一年）、大四到頂（B1-5：季末不再放行推進）
  assert.equal(chapterCompleted({ id: CHAPTER.UNIVERSITY, enteredAtSeason: 4 }, 4), false);
  assert.equal(chapterCompleted({ id: CHAPTER.UNIVERSITY, enteredAtSeason: 4 }, 6), false);
  assert.equal(chapterCompleted({ id: CHAPTER.UNIVERSITY, enteredAtSeason: 4 }, 7), true);
});

test('壞存檔：大學章缺 enteredAtSeason ⇒ 退化成全域屆數（不猜）', () => {
  assert.equal(chapterSeasonOf({ id: CHAPTER.UNIVERSITY }, 5), 5);
});

test('B4-4 舊存檔零遷移：沒有章節欄位一律當高中', () => {
  assert.equal(seasonCapOf(null), 3);
  assert.equal(chapterCompleted(null, 3), true);
  assert.equal(chapterCompleted(null, 2), false);
});
