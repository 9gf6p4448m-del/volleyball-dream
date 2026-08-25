// 債 C — 三份「大學季收束」定義對齊（2026-08-25）
// 驗收＝`docs/kickoffs/acceptance-uni-finale-align.md`（C4/C5）。
//
// ★ C4 為什麼要釘「推不動」★ 大學屆間推進（uniSchedule 重建、換血、年限）是
// 大二卷的接線；在那之前 advanceSeason 對大學 schema 必須回原 career——
// 改前靠 careerStage 恆 'national' 的意外死鎖、改後靠顯式守衛，兩版都必須綠。
// 沒有這條，大二卷升 CHAPTER_SEASONS 後 advanceSeason 會拿高中的 buildSchedule
// 幫大學生蓋高中賽程。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareer, advanceSeason } from '../src/career/careerState.js';
import { buildUniSchedule } from '../src/career/uniSchedule.js';

/** 大學章 career view：league 打完 `played` 場（勝敗交錯）。 */
function uniCareer(played) {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const schedule = buildUniSchedule({ schoolId: 'meixi', seed: 7 });
  const results = schedule.slice(0, played).map((m, i) => ({
    matchId: m.id, opponentId: m.opponentId,
    won: i % 2 === 0,
    scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
  }));
  return { ...base, schedule, results };
}

test('C4 大學 league 全打完，advanceSeason 仍回原 career（顯式不推進）', () => {
  const career = uniCareer(8);
  assert.equal(career.schedule.length, 8, 'fixture 前提：九隊單循環＝玩家 8 場');
  assert.equal(
    career.schedule.every((m) => career.results.some((r) => r.matchId === m.id)),
    true, 'fixture 前提：league 全部有結果',
  );
  const out = advanceSeason(career);
  assert.equal(out, career, '大學屆間推進在大二卷接線前必須是 no-op（回原參考）');
});

test('C4b 大學 league 打到一半，advanceSeason 同樣回原 career', () => {
  const career = uniCareer(3);
  assert.equal(advanceSeason(career), career);
});

// ---- C5 seasonConcluded 鑑別力（驗收 acceptance-uni-finale-align.md） ----
import { seasonConcluded, recordResult } from '../src/career/careerState.js';

/** 高中 career：打完整條奪冠/止步路徑（走 recordResult 真實路徑，不手塞 stage）。 */
function highSchoolCareer({ champion }) {
  let c = createCareer({ seed: 11, playerName: '小夢' });
  for (const m of c.schedule) {
    // 止步＝循環組打滿三敗（0-3 未進前二）——輸一場 rr 不算止步（保底照打），
    // 淘汰賽兩場不再記（careerStage：groupDone + rr.complete + 未晉級 ⇒ eliminated）
    if (!champion && m.stage === 'national' && m.round !== 'rr') break;
    const won = champion ? true : m.stage === 'group';
    c = recordResult(c, {
      matchId: m.id, opponentId: m.opponentId, won,
      scoreFor: won ? 25 : 20, scoreAgainst: won ? 20 : 25,
    });
  }
  return c;
}

test('C5a 高中：奪冠/止步＝收束、開季未打＝未收束', () => {
  assert.equal(seasonConcluded(highSchoolCareer({ champion: true })), true, '奪冠');
  assert.equal(seasonConcluded(highSchoolCareer({ champion: false })), true, '止步');
  assert.equal(seasonConcluded(createCareer({ seed: 11, playerName: '小夢' })), false, '開季');
});

test('C5b 大學：league 全有結果＝收束、缺一場＝未收束', () => {
  assert.equal(seasonConcluded(uniCareer(8)), true, '8/8');
  assert.equal(seasonConcluded(uniCareer(7)), false, '7/8');
});

test('C5c 大學章但 league 空（school 解不開的舊存檔）＝未收束（安全回退）', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const career = { ...base, schedule: [], results: [] };
  assert.equal(seasonConcluded(career), false);
});
