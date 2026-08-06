// 2026-08-06 裁定甲 — 跳發的傳授窗口從「決賽 ∧ 天鷹」放寬成「國賽 ∧ 天鷹」
//
// 觸發＝真人第 1 屆止步八強後問「這樣我連跳發都學不到吧」。查證屬實：
//   ・天鷹的國賽位置逐屆固定（`schedule.js nationalLadderFor`）：第 1／3 屆決賽、
//     **第 2 屆準決賽** ⇒ 舊條件在第 2 屆**結構上沒有窗口**（決賽對手是曜石）。
//   ・跳發是整條教學鏈唯一掛 `moment:'pre'` ＋ 指定場次的一招；其餘都掛 `lastMatchId`
//     （賽後發、輸贏都給）⇒ 唯一一個「打完全程仍可能拿不到」的技術。
//
// 本檔守三個窗口與兩道守衛。★兩道守衛都不是假想敵★：
//   ・對手守衛：第 2 屆決賽對手是曜石，沒有它就會「對著曜石喊天鷹」。
//   ・stage 守衛：天鷹在第 2／3 屆**會被抽進小組賽**，沒有它跳發會在小組賽就發出去。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCareer, nextMatch } from '../src/career/careerState.js';
import { dueEvents, EVENT_DEFS } from '../src/career/events.js';

const teachJump = () => EVENT_DEFS.find((e) => e.id === 'teach-jump');

// 直接把 career 的下一場擺成指定的賽程項——`dueEvents` 讀的就是 `nextMatch(career)`，
// 這裡不重抄它的判斷，只是把賽程佈置到那一格（比照 call-unlock.test.mjs 的手法）。
function careerAtMatch({ id, stage, opponentId }) {
  const career = createCareer({ seed: 99, playerName: '測試' });
  career.schedule = [{ id, stage, opponentId, label: '' }];
  career.results = [];
  const next = nextMatch(career);
  assert.equal(next?.id, id, '賽程佈置失敗＝下面的斷言空洞');
  return career;
}

const fires = (career, seasonIndex) => dueEvents(career, 'pre', seasonIndex)
  .some((e) => e.id === 'teach-jump');

test('窗口①②：第 1／3 屆的決賽對天鷹＝教（既有行為不得回歸）', () => {
  const c = careerAtMatch({ id: 'national-final', stage: 'national', opponentId: 'sky-hawk' });
  assert.ok(fires(c, 1), '第 1 屆決賽對天鷹沒教＝原本就有的窗口壞了');
  assert.ok(fires(c, 3), '第 3 屆決賽對天鷹沒教');
});

test('★窗口③（本次新增）：第 2 屆準決賽對天鷹＝教', () => {
  // 這一格就是放寬的全部理由：第 2 屆天鷹在準決賽，舊條件在這一屆完全沒有窗口
  const c = careerAtMatch({ id: 'national-sf', stage: 'national', opponentId: 'sky-hawk' });
  assert.ok(fires(c, 2), '第 2 屆準決賽對天鷹沒教＝放寬沒生效');
});

test('★守衛 A：對手不是天鷹就不教（第 2 屆決賽對曜石＝真實存在的場面）', () => {
  const c = careerAtMatch({ id: 'national-final', stage: 'national', opponentId: 'obsidian' });
  assert.ok(!fires(c, 2), '對著曜石喊天鷹＝台詞說謊');
});

test('★守衛 B：小組賽遇到天鷹不教（天鷹第 2／3 屆會被抽進 group-3）', () => {
  const c = careerAtMatch({ id: 'group-3', stage: 'group', opponentId: 'sky-hawk' });
  assert.ok(!fires(c, 2), '跳發掉到小組賽＝教學鏈最後一招被抄捷徑');
  assert.ok(!fires(c, 3), '同上（第 3 屆）');
});

test('台詞不得再宣稱「決賽」——放寬後這一場可能是準決賽', () => {
  const ev = teachJump();
  for (const set of [ev.lines, ev.altLines]) {
    for (const l of set) {
      assert.ok(!l.text.includes('決賽'),
        `台詞仍寫死「決賽」：${l.text}——第 2 屆這一場是準決賽，會講錯場合`);
    }
  }
  // 對照：仍要指名天鷹（放寬的是場次不是對手，敘事錨點不能一起丟掉）
  assert.ok(ev.lines.some((l) => l.text.includes('天鷹')), '台詞不再指名天鷹＝敘事錨點掉了');
  assert.ok(ev.altLines.some((l) => l.text.includes('天鷹')), '轉授版也要指名天鷹');
});

test('放寬只動 when，不動解鎖標的與一次性語意', () => {
  const ev = teachJump();
  assert.equal(ev.effect.unlock, 'jumpServe');
  assert.equal(ev.moment, 'pre', '賽前教＝站上那一場就學得到（不必贏）');
  assert.deepEqual(ev.when, { stage: 'national', opponentId: 'sky-hawk' });
});
