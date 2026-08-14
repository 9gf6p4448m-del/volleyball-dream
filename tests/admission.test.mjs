// 大學卷 批 2「升學評定與分發」（2026-08-14）
// 驗收＝`docs/kickoffs/acceptance-uni-batch2.md`（動手前凍結，B2-1～B2-6）。
//
// ★ 鑑別力 ★ 五級名次**每一級都配相鄰級的反向斷言**——只驗「冠軍判得出來」的話，
// 一支「永遠回冠軍」的假實作也會全綠。分發規則同理：配一條「不同成績要真的不同」，
// 否則一支常數函式也會過。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FINISH, FINISH_RANK, seasonFinishOf, normalizeSeasonLog,
  bestFinishOf, admissionTiersFor, TIER,
} from '../src/career/admission.js';
import { createSaveV2 } from '../src/career/schema.js';

// 場次 id 與 schedule.js:13-17 的 NATIONAL_LADDER 同源
const R = (matchId, won) => ({ matchId, won });
const careerWith = (...results) => ({ schedule: [], results });

// ════════════════════════════════════════════════════════════
// B2-1：五級名次（每一級都有相鄰級的反向斷言）
// ════════════════════════════════════════════════════════════

test('B2-1 冠軍：打贏決賽', () => {
  assert.equal(seasonFinishOf(careerWith(R('national-final', true))), FINISH.CHAMPION);
});

test('★反向★ 打輸決賽是亞軍，不得判成冠軍', () => {
  assert.equal(seasonFinishOf(careerWith(R('national-final', false))), FINISH.RUNNER_UP);
});

test('B2-1 四強：準決賽敗（且沒有決賽紀錄）', () => {
  assert.equal(
    seasonFinishOf(careerWith(R('national-qf', true), R('national-sf', false))), FINISH.SEMI,
  );
});

test('★反向★ 準決賽**贏了**不得判成四強（那是打進決賽）', () => {
  const f = seasonFinishOf(careerWith(R('national-qf', true), R('national-sf', true)));
  assert.notEqual(f, FINISH.SEMI, '贏了準決賽卻記成四強＝把晉級記成淘汰');
});

test('B2-1 八強：八強戰敗', () => {
  assert.equal(seasonFinishOf(careerWith(R('national-qf', false))), FINISH.QUARTER);
});

test('★反向★ 八強戰贏了不得判成八強', () => {
  assert.notEqual(seasonFinishOf(careerWith(R('national-qf', true))), FINISH.QUARTER);
});

test('B2-1 小組：沒有任何淘汰賽紀錄', () => {
  assert.equal(seasonFinishOf(careerWith()), FINISH.GROUP);
  assert.equal(seasonFinishOf(careerWith(R('group-1', true))), FINISH.GROUP);
  assert.equal(seasonFinishOf(null), FINISH.GROUP);
});

test('★反向★ 五級兩兩不同（判定真的分得出來，不是全部回同一個值）', () => {
  const got = [
    seasonFinishOf(careerWith(R('national-final', true))),
    seasonFinishOf(careerWith(R('national-final', false))),
    seasonFinishOf(careerWith(R('national-sf', false))),
    seasonFinishOf(careerWith(R('national-qf', false))),
    seasonFinishOf(careerWith()),
  ];
  assert.equal(new Set(got).size, 5, `五級應該兩兩不同：${JSON.stringify(got)}`);
});

test('名次排序表：冠軍 > 亞軍 > 四強 > 八強 > 小組', () => {
  const order = [FINISH.CHAMPION, FINISH.RUNNER_UP, FINISH.SEMI, FINISH.QUARTER, FINISH.GROUP];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(FINISH_RANK[order[i - 1]] > FINISH_RANK[order[i]], `${order[i - 1]} 應該優於 ${order[i]}`);
  }
});

// ════════════════════════════════════════════════════════════
// B2-2：逐屆記錄零遷移
// ════════════════════════════════════════════════════════════

// 屆末封存的形狀＝careerStore.archiveSeasonSummary 的回傳（index/wins/losses/champion/finish/totals）
const arch = (index, finish) => ({ index, wins: 0, losses: 0, champion: finish === FINISH.CHAMPION, finish });
const seasonsOf = (...entries) => ({ seasons: entries });

test('★B2-2★ 舊存檔沒有封存 ⇒ 空清單，且整份存檔逐值不變', () => {
  const old = createSaveV2({});
  const snapshot = JSON.parse(JSON.stringify(old));
  assert.deepEqual(normalizeSeasonLog(old.career), []);
  assert.deepEqual(JSON.parse(JSON.stringify(old)), snapshot,
    '★零遷移★ 讀一次就把存檔改掉＝所有既有存檔都會被動到');
});

test('壞條目逐項丟掉（半組資料不得汙染判定）', () => {
  const log = normalizeSeasonLog({
    seasons: [
      arch(1, FINISH.SEMI),
      { index: 0, finish: FINISH.CHAMPION },   // 屆數不合法
      { index: 2, finish: '不存在的名次' },     // 名次不合法且非冠軍 ⇒ 名次不明，略過
      'garbage',
    ],
  });
  assert.deepEqual(log, [{ season: 1, finish: FINISH.SEMI }]);
});

test('★舊條目回退★ 沒有 finish 欄位時：冠軍認得出來、非冠軍算「名次不明」不猜', () => {
  const log = normalizeSeasonLog({
    seasons: [
      { index: 1, wins: 5, losses: 1, champion: true },   // 舊條目、冠軍
      { index: 2, wins: 3, losses: 2, champion: false },  // 舊條目、非冠軍＝不知道打到哪
    ],
  });
  assert.deepEqual(log, [{ season: 1, finish: FINISH.CHAMPION }],
    '★不得把「名次不明」猜成小組★ 那會讓拿過亞軍的老玩家被分發到弱校');
});

// ════════════════════════════════════════════════════════════
// B2-3／B2-4：最佳成績與冪等
// ════════════════════════════════════════════════════════════

test('B2-3 取最好的一屆（不是最後一屆，也不是平均）', () => {
  const block = seasonsOf(arch(1, FINISH.QUARTER), arch(2, FINISH.RUNNER_UP), arch(3, FINISH.GROUP));
  assert.equal(bestFinishOf(block), FINISH.RUNNER_UP, '第 3 屆最差，但最佳是第 2 屆的亞軍');
});

test('★B2-3①★ 既有存檔回退：log 缺屆但 titles>0 ⇒ 至少是冠軍', () => {
  assert.equal(bestFinishOf({}, { titles: 1 }), FINISH.CHAMPION);
  assert.equal(bestFinishOf({}, { titles: 2, currentFinish: FINISH.GROUP }), FINISH.CHAMPION);
});

test('★B2-3② 反向★ titles=0 且全是小組 ⇒ 不得回報成冠軍', () => {
  const block = seasonsOf(arch(1, FINISH.GROUP), arch(2, FINISH.GROUP));
  assert.equal(bestFinishOf(block, { titles: 0, currentFinish: FINISH.GROUP }), FINISH.GROUP);
});

test('★反向★ 拿掉 titles 回退就會答錯（證明那條回退不是裝飾）', () => {
  // 既有存檔：log 是空的（第 1/2 屆名次沒存），但真的拿過冠軍
  assert.equal(bestFinishOf({}, { titles: 1 }), FINISH.CHAMPION);
  assert.equal(bestFinishOf({}, { titles: 0 }), FINISH.GROUP,
    '沒有 titles 這條線索時只能保守回最低——這就是回退在補的那個洞');
});

test('當屆名次也算進去（還沒封存的那一屆）', () => {
  const block = seasonsOf(arch(1, FINISH.GROUP));
  assert.equal(bestFinishOf(block, { currentFinish: FINISH.SEMI }), FINISH.SEMI);
});

// ★B2-4 冪等★ 記錄改由**既有**的 `archiveSeasonSummary` 負責（屆末封存本來就一屆一筆）。
// 本批不另建記錄函式（那會是同一件事的第二份歷史），所以冪等由既有路徑保證——
// 這是**既有行為**、不是本批新寫的東西，本檔只驗我真的加上去的那個欄位。

test('★本批新增的欄位★ archiveSeasonSummary 會把五級名次一起封存', async () => {
  const { archiveSeasonSummary } = await import('../src/career/careerStore.js');
  const champ = archiveSeasonSummary({ index: 3, results: [R('national-final', true)] });
  assert.equal(champ.finish, FINISH.CHAMPION);
  assert.equal(champ.champion, true, '既有的 champion 欄位不得被改壞');
  const runnerUp = archiveSeasonSummary({ index: 2, results: [R('national-final', false)] });
  assert.equal(runnerUp.finish, FINISH.RUNNER_UP);
  assert.equal(runnerUp.champion, false);
});

test('★反向對照★ 亞軍與八強在舊欄位上長得一樣，只有新欄位分得出來', async () => {
  const { archiveSeasonSummary } = await import('../src/career/careerStore.js');
  const a = archiveSeasonSummary({ index: 1, results: [R('national-final', false)] });
  const b = archiveSeasonSummary({ index: 1, results: [R('national-qf', false)] });
  assert.equal(a.champion, b.champion, '★這就是為什麼要加 finish★ champion 分不出這兩者');
  assert.notEqual(a.finish, b.finish);
});

// ════════════════════════════════════════════════════════════
// B2-5：分發規則
// ════════════════════════════════════════════════════════════

test('B2-5 決定論：同一成績兩次呼叫結果相同，且回傳可安全改動（複本）', () => {
  const a = admissionTiersFor(FINISH.CHAMPION);
  const b = admissionTiersFor(FINISH.CHAMPION);
  assert.deepEqual(a, b);
  a.push('汙染');
  assert.deepEqual(admissionTiersFor(FINISH.CHAMPION), b, '回傳內部陣列會被呼叫端改壞');
});

test('★B2-5 核心★ 不同成績要真的給出不同的候選集合（否則評定形同虛設）', () => {
  const champ = admissionTiersFor(FINISH.CHAMPION);
  const semi = admissionTiersFor(FINISH.SEMI);
  const group = admissionTiersFor(FINISH.GROUP);
  assert.notDeepEqual(champ, semi);
  assert.notDeepEqual(semi, group);
  assert.ok(champ.length > semi.length && semi.length > group.length,
    '成績越好選項要越多——這是題 9「成績決定天花板、玩家決定故事」的實作面');
});

test('★題 9 的核心★ 拿冠軍也選得了弱校（成績決定天花板，不是強制去強豪）', () => {
  assert.ok(admissionTiersFor(FINISH.CHAMPION).includes(TIER.WEAK),
    '不能讓好成績反而少了選項——玩家要能刻意去弱校當王牌');
});

test('小組出局只開得出弱校（下限存在，否則成績沒有意義）', () => {
  assert.deepEqual(admissionTiersFor(FINISH.GROUP), [TIER.WEAK]);
});

test('認不得的成績照最低給（壞存檔不得意外開出強豪）', () => {
  assert.deepEqual(admissionTiersFor('nope'), [TIER.WEAK]);
  assert.deepEqual(admissionTiersFor(undefined), [TIER.WEAK]);
});
