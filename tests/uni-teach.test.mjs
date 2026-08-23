// 大學卷 批 7 — 大學章專屬傳授（壓手／追發）與升學畫面文案
// 驗收＝`docs/kickoffs/acceptance-uni-batch7.md`：B7-7／B7-8／B7-11
//
// ★ 這一檔守的是「技術軸打平」★（卷宗 §三之三拍板 3、B7-7）
// 強弱校的差異只剩球權與戰績兩軸；技術傳授對九所學校**同場次**。
// 最容易壞的地方是沿用高中那套 `when.lastMatchId` ——那樣大學永遠觸發不到，
// 玩家打完一整年一招都學不到，而且**不會報錯**（B7-7 的紅法）。

import test from 'node:test';
import assert from 'node:assert/strict';

import { EVENT_DEFS, dueEvents, ONCE_EVENT_IDS } from '../src/career/events.js';
import { UNIVERSITIES } from '../src/career/universities.js';
import { TECH_DEFS } from '../src/career/growth.js';
import { buildUniSchedule } from '../src/career/uniSchedule.js';

const PRESS = 'teach-press';
const CHASE = 'teach-chase';
const defOf = (id) => EVENT_DEFS.find((e) => e.id === id);

// ---- 大學章的 career 治具 ----
// 只造 dueEvents 真正會讀的欄位（schedule／results／events）。
// ★schedule 走真的 buildUniSchedule★——不是手捏幾個 {round:'league'}，
// 否則「賽程項長什麼樣」這件事就變成測試自己的假設，不是實作的行為。
function uniCareer(playedRounds, schoolId = 'north-ridge') {
  const schedule = buildUniSchedule({ schoolId, seed: 1 });
  const league = schedule.filter((m) => m.round === 'league');
  const results = league.slice(0, playedRounds).map((m) => ({
    matchId: m.id, won: true, opponentId: m.opponentId,
  }));
  return { schedule, results, events: [] };
}

// 高中章治具（B7-11 的反向對照）：賽程是 rr／group，沒有任何 league
function highSchoolCareer(playedCount) {
  const schedule = Array.from({ length: 8 }, (_, i) => ({
    id: `group-${i + 1}`, stage: 'group', round: 'rr', opponentId: 'X', label: '',
  }));
  return {
    schedule,
    results: schedule.slice(0, playedCount).map((m) => ({ matchId: m.id, won: true })),
    events: [],
  };
}

const dueIds = (career) => dueEvents(career, 'post').map((e) => e.id);

// ════════════════════════════════════════════════════════════
// B7-7 傳授走大學章且各校一致
// ════════════════════════════════════════════════════════════
test('B7-7 兩條事件都在 EVENT_DEFS 裡，解鎖的是對的技術', () => {
  assert.ok(defOf(PRESS), 'teach-press 不存在');
  assert.ok(defOf(CHASE), 'teach-chase 不存在');
  assert.equal(defOf(PRESS).effect.unlock, 'pressBlock');
  assert.equal(defOf(CHASE).effect.unlock, 'chaseServe');
  const keys = TECH_DEFS.map((d) => d.key);
  assert.ok(keys.includes('pressBlock') && keys.includes('chaseServe'),
    '事件解鎖的 key 必須真的在技術樹裡，否則 unlockTechnique 會拒絕');
});

test('★B7-7 紅法★ 兩條事件都不得綁在高中賽事 id 上', () => {
  for (const id of [PRESS, CHASE]) {
    const w = defOf(id).when ?? {};
    assert.equal(w.lastMatchId, undefined,
      `${id} 綁了 lastMatchId ⇒ 大學永遠觸發不到，玩家一年學不到任何東西`);
    assert.equal(w.stage, undefined, `${id} 綁了 stage ⇒ 同上`);
    assert.ok('uniLeaguePlayed' in w, `${id} 沒有用大學場次計數當判準`);
  }
});

test('B7-7 壓手＝大學第 3 場後、追發＝第 6 場後', () => {
  assert.equal(defOf(PRESS).when.uniLeaguePlayed, 3);
  assert.equal(defOf(CHASE).when.uniLeaguePlayed, 6);
});

test('★B7-7 逐場對照★ 第 2 場後沒有、第 3 場後有；第 5 場後沒追發、第 6 場後有', () => {
  assert.ok(!dueIds(uniCareer(2)).includes(PRESS), '第 2 場就教了＝場次判準沒在數東西');
  assert.ok(dueIds(uniCareer(3)).includes(PRESS), '打完 3 場卻沒教');
  assert.ok(!dueIds(uniCareer(5)).includes(CHASE), '第 5 場就教追發');
  assert.ok(dueIds(uniCareer(6)).includes(CHASE), '打完 6 場卻沒教追發');
});

test('★B7-7 各校一致★ 九所學校的解鎖場次逐值相同', () => {
  const firstAt = (schoolId, eventId) => {
    for (let n = 0; n <= 8; n += 1) {
      if (dueIds(uniCareer(n, schoolId)).includes(eventId)) return n;
    }
    return null;
  };
  const pressAt = UNIVERSITIES.map((u) => [u.id, firstAt(u.id, PRESS)]);
  const chaseAt = UNIVERSITIES.map((u) => [u.id, firstAt(u.id, CHASE)]);
  for (const [id, n] of pressAt) assert.equal(n, 3, `${id} 的壓手解鎖場次是 ${n}，不是 3`);
  for (const [id, n] of chaseAt) assert.equal(n, 6, `${id} 的追發解鎖場次是 ${n}，不是 6`);
  // 明確把「強豪 vs 弱校」拿出來對照一次（人工驗收 P7-3 的機械版）
  const powerhouse = UNIVERSITIES.find((u) => u.tier === 'powerhouse');
  const weak = UNIVERSITIES.find((u) => u.tier === 'weak');
  assert.ok(powerhouse && weak, '治具前提壞了：找不到強豪或弱校');
  assert.equal(firstAt(powerhouse.id, PRESS), firstAt(weak.id, PRESS));
  assert.equal(firstAt(powerhouse.id, CHASE), firstAt(weak.id, CHASE));
});

test('B7-7 兩條都是一次性事件（舊存檔升上大學不會重播）', () => {
  assert.ok(ONCE_EVENT_IDS.has(PRESS));
  assert.ok(ONCE_EVENT_IDS.has(CHASE));
  // 已觸發過就不再出現
  const career = uniCareer(6);
  career.events = [PRESS, CHASE];
  const ids = dueIds(career);
  assert.ok(!ids.includes(PRESS) && !ids.includes(CHASE));
});

test('B7-7 台詞非空、講者一致', () => {
  for (const id of [PRESS, CHASE]) {
    const lines = defOf(id).lines;
    assert.ok(Array.isArray(lines) && lines.length > 0, `${id} 沒有台詞`);
    for (const l of lines) {
      assert.ok(l.speaker && l.text, `${id} 有一句缺 speaker 或 text`);
    }
  }
});

test('★B7-7 台詞不得說謊★ 壓手的台詞要講到「押方向」這個代價', () => {
  // 練習賽卷的事故病歷：文案說謊比沒有文案更糟。B7-3 的代價是玩家在面板上
  // 真的要付的，台詞沒講＝玩家按下去才發現自己放棄了 AI 讀球。
  const text = defOf(PRESS).lines.map((l) => l.text).join('');
  assert.ok(/直線|斜線|押/.test(text),
    '壓手的台詞完全沒提到要自己押一邊——那正是這一招的代價');
});

// ════════════════════════════════════════════════════════════
// B7-11 高中零回歸
// ════════════════════════════════════════════════════════════
test('★B7-11★ 高中章打滿八場也不會觸發大學兩招（判準本身就擋住了）', () => {
  for (const n of [0, 3, 6, 8]) {
    const ids = dueIds(highSchoolCareer(n));
    assert.ok(!ids.includes(PRESS), `高中打了 ${n} 場卻教了壓手`);
    assert.ok(!ids.includes(CHASE), `高中打了 ${n} 場卻教了追發`);
  }
});

test('★B7-11 判準的來源★ uniLeaguePlayed 只數 round==="league" 的場次', () => {
  // 高中賽程用 'rr'（schedule.js:110），大學用 'league'（uniSchedule.js:104）。
  // 這條在防「改成數 career.results.length」——那樣高中打三場就會教大學的招。
  const mixed = highSchoolCareer(8);
  assert.equal(mixed.results.length, 8);
  assert.ok(!dueIds(mixed).includes(PRESS),
    '有八筆 results 就觸發＝判準數的是全生涯場次，不是大學聯賽場次');
});

// ════════════════════════════════════════════════════════════
// B7-8 升學畫面不再承諾技術解鎖快
// ════════════════════════════════════════════════════════════
// 機械判準＝黑名單詞組。它防的是「這裡學得比較快／這裡沒人教你」這類**兌現不了的
// 支票**：大學章的技術傳授各校同場次（上面 B7-7 已逐校驗過），文案再暗示快慢就是說謊。
const BROKEN_PROMISES = [
  '教得動', '教你', '能教', '沒有人教', '沒人教',
  '學到的比', '學得比', '學不到', '解鎖',
];

test('B7-8 九校的 tech 文案都不含技術快慢承諾', () => {
  for (const u of UNIVERSITIES) {
    const t = u.cost?.tech ?? '';
    assert.ok(t.length > 0, `${u.name} 的 tech 文案空了（會撞批 5 的 B5-7）`);
    for (const bad of BROKEN_PROMISES) {
      assert.ok(!t.includes(bad),
        `${u.name} 的 tech 文案還寫著「${bad}」：${t}`);
    }
  }
});

test('B7-8 三軸結構原封不動（不得為了改文案去刪欄，那會撞批 5 的 B5-7）', () => {
  for (const u of UNIVERSITIES) {
    for (const axis of ['ball', 'record', 'tech']) {
      assert.ok(typeof u.cost?.[axis] === 'string' && u.cost[axis].length > 0,
        `${u.name} 少了 ${axis} 軸`);
    }
  }
});

test('★B7-8 反向對照★ 同 tier 三校的 tech 文案仍互不相同（沒被改成同一句罐頭）', () => {
  const byTier = {};
  for (const u of UNIVERSITIES) (byTier[u.tier] ||= []).push(u.cost.tech);
  for (const [tier, texts] of Object.entries(byTier)) {
    assert.equal(new Set(texts).size, texts.length,
      `${tier} 有兩所學校的 tech 文案一模一樣＝那個取捨是假的`);
  }
});
