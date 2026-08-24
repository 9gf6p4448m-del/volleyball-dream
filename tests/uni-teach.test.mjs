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
import { TECH_DRILL_ORDER } from '../src/career/practiceMatch.js';
import { ADMISSION_COST_LINE } from '../src/ui/careerScreen.js';
import { readFileSync } from 'node:fs';

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
// ① 直接承諾詞（誰教你、學不學得到、解不解得開）
const DIRECT_PROMISES = [
  '教得動', '教你', '能教', '會教', '沒有人教', '沒人教',
  '學到的比', '學得比', '學到', '想學', '學不到', '解鎖',
  '改給你看', '更好的地方',
];
// ② 共現判準：「技術習得語彙」× 「速度／程度比較語彙」同時出現＝在承諾快慢。
// ★這一層是第三輪覆審逼出來的★——只有 ① 的話，換一組沒用過的字就穿過去了
// （覆審現造五句全新寫法，5/5 通過）。判準要有形狀，不能照著改掉的字串配。
const TECH_WORDS = ['技術', '技巧', '招式', '新招', '球技', '基本功', '練出來', '上手', '掌握'];
const SPEED_WORDS = ['快', '早', '慢', '晚', '倍', '縮短', '比高中', '別人的', '遠超', '進步', '成長'];

function brokenPromiseIn(text) {
  const direct = DIRECT_PROMISES.find((w) => text.includes(w));
  if (direct) return direct;
  const t = TECH_WORDS.find((w) => text.includes(w));
  const sp = SPEED_WORDS.find((w) => text.includes(w));
  return t && sp ? `${t}＋${sp}` : null;
}

// 為了讓既有的逐條測試沿用同一個判準，保留這個名字（值＝①，僅供逐詞回報用）
const BROKEN_PROMISES = DIRECT_PROMISES;

test('B7-8 九校的 tech 文案都不含技術快慢承諾', () => {
  for (const u of UNIVERSITIES) {
    const t = u.cost?.tech ?? '';
    assert.ok(t.length > 0, `${u.name} 的 tech 文案空了（會撞批 5 的 B5-7）`);
    const hit = brokenPromiseIn(t);
    assert.equal(hit, null, `${u.name} 的 tech 文案命中「${hit}」：${t}`);
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

// ════════════════════════════════════════════════════════════
// 2026-08-24 Sawmah 裁定：棄賽不算「打完」
// ════════════════════════════════════════════════════════════
// 覆審 MEDIUM：resolveForfeit 也會寫一筆 result ⇒ 棄賽三場就能領走壓手。
// 學長教你東西是因為看了你打球，棄賽領傳授在敘事上說不通。
test('★裁定★ 棄賽的場次不計入 uniLeaguePlayed', () => {
  const career = uniCareer(3);
  // 把三場全部標成棄賽（resolveForfeit 寫入的形狀）
  career.results = career.results.map((r) => ({ ...r, won: false, scoreFor: 0, forfeit: true }));
  assert.ok(!dueIds(career).includes(PRESS),
    '棄賽三場就領走壓手＝只要中途離開就能拿傳授');
});

test('★裁定 反向對照★ 真的打完三場照樣拿得到（排除條件沒有寫太寬）', () => {
  assert.ok(dueIds(uniCareer(3)).includes(PRESS));
  // 混合：兩場真打＋一場棄賽 ⇒ 只算兩場，還不到門檻
  const mixed = uniCareer(3);
  mixed.results = mixed.results.map((r, i) => (i === 2 ? { ...r, forfeit: true } : r));
  assert.ok(!dueIds(mixed).includes(PRESS), '兩場真打＋一場棄賽不該滿三場');
  // 補打第四場（真打）⇒ 湊滿三場真打
  const four = uniCareer(4);
  four.results = four.results.map((r, i) => (i === 2 ? { ...r, forfeit: true } : r));
  assert.ok(dueIds(four).includes(PRESS), '三場真打＋一場棄賽應該要到門檻');
});

// ── B7-8 的鑑別力：判準必須抓得到「批 7 之前的舊文案」────────────
// 覆審的批評成立：第一版黑名單是照著**改掉的字串**事後配出來的，
// 九句舊文案裡有五句是承諾卻只抓到四句 ⇒ 若實作只改那四所，測試照樣綠。
// 這一條把舊文案釘成 fixture，證明判準抓的是「承諾」這件事，不是特定字串。
const OLD_COPY_BEFORE_BATCH7 = [
  ['north-ridge', '每天對練的都是全國級的手，一個學期學到的比高中三年多。'],
  ['hanchi-sport', '教練組有國青教練，跳躍與攻擊的細節有人一格一格改給你看。'],
  ['chiyang', '想學跑動與時間差，全國沒有比這裡更好的地方。'],
  ['chengguang', '學長會教你怎麼防守，攻擊方面幫不上什麼忙。'],
  ['songhe', '你是隊上最強的人——沒有人教得動你，只能自己練。'],
  ['daiban', '沒有人能教你，但也沒有人會擋你試任何東西。'],
  ['meixi', '這裡沒有人在乎技術，你會學到怎麼自己一個人變強。'],
];

test('★B7-8 鑑別力 一★ 判準抓得到批 7 之前的每一句承諾式舊文案', () => {
  for (const [id, text] of OLD_COPY_BEFORE_BATCH7) {
    assert.ok(brokenPromiseIn(text),
      `${id} 的舊文案「${text}」通過了判準 ⇒ 判準是照改掉的字串配的，沒有鑑別力`);
  }
});

// ★第三輪對抗覆審現造的五句★：完全沒用到舊文案的字，第一版判準 5/5 全部放行。
// 釘成 fixture＝下次有人想把判準簡化回單純黑名單時，這一條會擋住。
const FRESH_PROMISES_FROM_REVIEW = [
  '在這裡，技術進步的速度會比你想像的快。',
  '同樣一年，你在這裡練出來的東西是別人的兩倍。',
  '這裡的訓練會讓你更早掌握高階技巧。',
  '來這裡，新招式上手的時間會縮短一半。',
  '強隊的資源讓你的技術成長遠快於弱校。',
];

test('★B7-8 鑑別力 二★ 判準也要抓得到沒見過的新寫法（不是照字串配的）', () => {
  for (const text of FRESH_PROMISES_FROM_REVIEW) {
    assert.ok(brokenPromiseIn(text),
      `「${text}」通過了判準 ⇒ 換一組沒用過的字就能穿過去，這判準沒有形狀`);
  }
});

test('★B7-8 反向 誤判★ 現行九句與抬頭句都不得被判準誤傷', () => {
  // 判準是自然語言的近似，一定會有邊界。這一條釘住「現在這幾句是乾淨的」，
  // 免得日後把判準收得太緊、逼著文案去閃關鍵詞而不是講真話。
  for (const u of UNIVERSITIES) {
    assert.equal(brokenPromiseIn(u.cost.tech), null, `${u.name} 被誤傷：${u.cost.tech}`);
  }
  assert.equal(brokenPromiseIn(ADMISSION_COST_LINE), null, '抬頭句被誤傷');
});

test('★B7-8★ 升學畫面的抬頭句也吃同一道判準', () => {
  // 覆審指出這一句原本內嵌在 DOM 建構裡、tests/ 全域 grep 不到＝零覆蓋。
  assert.ok(typeof ADMISSION_COST_LINE === 'string' && ADMISSION_COST_LINE.length > 0);
  const hit = brokenPromiseIn(ADMISSION_COST_LINE);
  assert.equal(hit, null, `升學抬頭句命中「${hit}」：${ADMISSION_COST_LINE}`);
  // 反向：改動前那一句（「弱的隊伍沒有人教得動你」）必須被擋下
  const before = '代價都寫在卡片上了——強的隊伍不會把球給你，弱的隊伍沒有人教得動你。想清楚再選。';
  assert.ok(brokenPromiseIn(before), '舊抬頭句沒被擋＝這條測試沒有鑑別力');
});

// ── B7-9 的機械守衛：不得偷偷長出玩家端的縮手入口 ────────────
// 條文判定「不做 retract 第三檔」，但覆審指出**沒有任何機械守衛**擋未來加鈕。
test('★B7-9 守衛★ 玩家輸入層不得出現 retract 字面（AI 側不受限）', () => {
  for (const p of ['src/input/matchControls.js', 'src/app/matchLoop.js']) {
    const src = readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('retract'),
      `${p} 出現了 retract ⇒ 玩家端長出縮手入口。依 uni-batch7-retract-measurement.md：`
      + '玩家一人縮手勝率 50.9%→5.8%（−45.1pp），那是永遠不該按的假抉擇');
  }
});

test('★交付範圍守衛★ chaseServe 刻意沒有集訓科目，這個決定要守得住', () => {
  // 覆審 ⑤-1：交付項寫「補 TECH_DRILL_ORDER」，實作只補了 pressBlock，
  // chaseServe 是動手後自行決定不補的——理由寫在 practiceMatch.js，但沒有測試守。
  assert.ok(TECH_DRILL_ORDER.some((r) => r.tech === 'pressBlock'),
    'pressBlock 沒有科目＝新招永遠沒有集訓科目，而且不會報錯');
  assert.ok(!TECH_DRILL_ORDER.some((r) => r.tech === 'chaseServe'),
    'chaseServe 被掛上科目了：sim 沒有「這一發是追發」的事件，判不出來 ⇒ '
    + '會變成喊一件事判另一件事（同 feint 不給科目的先例）');
});
