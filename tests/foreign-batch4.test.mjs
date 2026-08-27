// 國外聯賽卷 批 4「敘事層」（2026-08-27，本卷最後一批）
// 驗收＝docs/kickoffs/acceptance-foreign-batch4.md（F4-1～F4-6，動手前凍結）。
// 範本＝tests/pro-batch5.test.mjs 的 G2/G3（proWangRivalPreEvents／proClosingLines）
// 純函式層寫法——foreignJianEventFor 同構寫法，只換海外聯賽的守衛集合。
//
// ════════════════════════════════════════════════════════════════
// F4-6 突變實測紀錄（★真的跑過★，指令＝`node --test tests/foreign-batch4.test.mjs`，
// 基準＝本檔全綠；每組突變改一行→存檔重跑確認「恰紅 1」→ Edit 撤銷還原→重跑確認
// 全綠，逐條做完才寫下面的數字）
// ════════════════════════════════════════════════════════════════
// ① 名冊判準守衛：src/career/foreignEvents.js `foreignJianEventFor` 的
//    `if (!hasJian) return [];` 整行刪除
//    → 紅 1／N＝「F4-2 名冊無簡子嵐不觸發」（無她的名冊也回事件，守衛失守）
//    還原後重跑：恢復全綠。
// ② 重逢旗標一次性守衛：`if ((played ?? []).includes(FOREIGN_JIAN_REUNION_EV)) return [];`
//    整行刪除
//    → 紅 1／N＝「F4-2 一生一次（播過不重播）」（played 含旗標仍再度回傳事件）
//    還原後重跑：恢復全綠。
// ③ round 判準守衛：`if (matchEntry?.round !== 'foreign') return [];` 整行刪除
//    → 紅 1／N＝「F4-3/F4-5 非海外場（round!=='foreign'）恆空陣列」（'pro'/'semi' 場
//    也冒出簡子嵐重逢事件，守衛失守）
//    還原後重跑：恢復全綠。
//
// F4-4 零漂移錨定字面：`本土最高的聯賽，你站到了這裡。但休息室的電視還亮著海外轉播——
// 那邊的排球，是另一個次元的事，遠得像傳說。`——這是 src/career/proEvents.js:105 的
// 字串常數字面（動手改動前 Read 取得，非計算值——常數字串的「跑一次」即讀源碼本身，
// 決定論成立），HEAD=45c37ed（批 4 開工前基準）。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  foreignJianEventFor, FOREIGN_JIAN_REUNION_EV,
} from '../src/career/foreignEvents.js';
import { proClosingLines } from '../src/career/proEvents.js';

const JIAN_ROSTER = { members: [{ fullName: '簡子嵐' }] };
const NO_JIAN_ROSTER = { members: [{ fullName: '別人' }] };
const ORIGINAL_FIRST_LINE = '本土最高的聯賽，你站到了這裡。但休息室的電視還亮著海外轉播——那邊的排球，是另一個次元的事，遠得像傳說。';

// ── F4-2：簡子嵐海外重逢 ──
test('F4-2 foreignJianEventFor：海外場＋名冊含簡子嵐＋未播過 → 回一次性重逢事件', () => {
  const entry = { id: 'foreign-r1', round: 'foreign', opponentId: 'aurora-orion' };
  const evs = foreignJianEventFor(entry, [], JIAN_ROSTER);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, FOREIGN_JIAN_REUNION_EV);
  // dialogPlay 契約：每句都要是 {speaker, text} 物件（proEvents.js 檔頭記過的出廠 bug 教訓）
  assert.ok(evs[0].lines.length >= 2 && evs[0].lines.length <= 4);
  assert.ok(evs[0].lines.every((l) => typeof l.text === 'string' && typeof l.speaker === 'string'));
  assert.ok(evs[0].lines.some((l) => l.speaker === '簡子嵐'), '要有簡子嵐親口說的台詞');
});

test('F4-2 foreignJianEventFor：名冊無簡子嵐 → 不觸發任何新事件、不造新角色', () => {
  const entry = { id: 'foreign-r1', round: 'foreign', opponentId: 'aurora-orion' };
  assert.deepEqual(foreignJianEventFor(entry, [], NO_JIAN_ROSTER), []);
  assert.deepEqual(foreignJianEventFor(entry, [], null), [], 'uniRoster 為 null 不炸、不誤觸發');
});

test('F4-2 foreignJianEventFor：一生一次（旗標已在 played 裡→不重播）', () => {
  const entry = { id: 'foreign-r2', round: 'foreign', opponentId: 'solar-toro' };
  assert.deepEqual(foreignJianEventFor(entry, [FOREIGN_JIAN_REUNION_EV], JIAN_ROSTER), []);
});

// ── F4-3：接線掛點與資料流同 proWang 慣例；非海外場恆空陣列 ──
test('F4-3 foreignJianEventFor：非海外場（round!=="foreign"）恆空陣列——不論名冊/played', () => {
  const proEntry = { id: 'pro-r1', round: 'pro', opponentId: 'cangyu-titans' };
  assert.deepEqual(foreignJianEventFor(proEntry, [], JIAN_ROSTER), [], 'round 守衛：國內職業場不觸發');
  const semiEntry = { id: 'foreign-semi', round: 'semi', opponentId: 'aurora-orion' };
  assert.deepEqual(foreignJianEventFor(semiEntry, [], JIAN_ROSTER), [], 'round 守衛：海外季後賽(semi)不觸發');
  const finalEntry = { id: 'foreign-final', round: 'final', opponentId: 'aurora-orion' };
  assert.deepEqual(foreignJianEventFor(finalEntry, [], JIAN_ROSTER), [], 'round 守衛：海外季後賽(final)不觸發');
  const uniEntry = { id: 'uni-r1', round: 'uni', opponentId: 'haiyan' };
  assert.deepEqual(foreignJianEventFor(uniEntry, [], JIAN_ROSTER), [], 'round 守衛：大學場不觸發');
});

// ── F4-5：王勝翔線海外零觸發（防回歸；既有 round!=='pro' 守衛本就擋掉，這裡驗一條）──
test('F4-5 proWangRivalPreEvents：海外場（round==="foreign"）餵進去恆空陣列', async () => {
  const { proWangRivalPreEvents } = await import('../src/career/proEvents.js');
  const { createCareer } = await import('../src/career/careerState.js');
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const entry = { id: 'foreign-r1', round: 'foreign', opponentId: 'cangyu-titans' };
  assert.deepEqual(proWangRivalPreEvents(base, entry, 'cangyu-titans'), []);
});

// ── F4-4：proClosingLines 出海條件句 ──
test('F4-4 proClosingLines：未出海 → 輸出與改動前逐字相同（零漂移）', () => {
  const none = proClosingLines(null, false);
  assert.equal(none.length, 1);
  assert.equal(none[0], ORIGINAL_FIRST_LINE, '未出海時第一句必須逐字不變');
  // wentForeign 省略（預設 false）也要逐字相同——呼叫端沒改的既有呼叫點零漂移
  assert.equal(proClosingLines(null)[0], ORIGINAL_FIRST_LINE);
  // 簡子嵐傳聞句條件照舊不動：未出海仍可帶傳聞句
  const withJian = proClosingLines(JIAN_ROSTER, false);
  assert.equal(withJian.length, 2);
  assert.equal(withJian[0], ORIGINAL_FIRST_LINE);
  assert.ok(withJian[1].includes('簡子嵐'));
});

test('F4-4 proClosingLines：已出海 → 首句換出海版（不再「遠得像傳說」），簡子嵐句條件不變', () => {
  const gone = proClosingLines(null, true);
  assert.equal(gone.length, 1);
  assert.notEqual(gone[0], ORIGINAL_FIRST_LINE, '出海後首句必須換掉');
  assert.ok(!gone[0].includes('遠得像傳說'), '出海後不能再說海外「遠得像傳說」（穿幫）');
  const goneWithJian = proClosingLines(JIAN_ROSTER, true);
  assert.equal(goneWithJian.length, 2, '簡子嵐傳聞句的觸發條件跟出海與否無關，照舊');
  assert.ok(goneWithJian[1].includes('簡子嵐'));
});
