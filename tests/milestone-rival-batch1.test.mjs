// 多年職業生涯卷 小批（2026-08-27 夜）— 里程碑事件＋王勝翔宿敵生涯鏡像
// 驗收＝docs/kickoffs/acceptance-milestone-rival-20260827.md（M1–M5／R1–R5，動手前凍結）。
// 純函式層測試——範本＝tests/pro-batch5.test.mjs／tests/multiyear-pro-batch4a.test.mjs
// 的直呼慣例（假 career/matchEntry/archive，不經 DOM）。DOM 接線另見
// tests/milestone-rival-wiring.test.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  proMilestonePreEvents,
  MILESTONE_VETERAN_EV, MILESTONE_DYNASTY_EV, MILESTONE_FINAL_PUSH_EV,
  MILESTONE_VETERAN_YEAR, MILESTONE_DYNASTY_TITLES, MILESTONE_FINAL_PUSH_YEAR,
  MILESTONE_TEAM_TRUST_BONUS,
} from '../src/career/proMilestones.js';
import {
  rivalArcPreEvents, RIVAL_TEAM_EXISTS,
  RIVAL_YEAR_CAPTAIN, RIVAL_YEAR_MVP, RIVAL_YEAR_SLUMP, RIVAL_YEAR_FINAL, RIVAL_YEAR_RETIRE,
  RIVAL_YEAR_TABLE, RIVAL_ARC_ANNUAL_PREFIX, RIVAL_RETIRE_EV,
  RIVAL_ARC_SWITCH_TO_MATE_EV, RIVAL_ARC_SWITCH_TO_FOE_EV,
} from '../src/career/proRivalArc.js';
// H2 對抗覆審修：過渡句判準吃既有 proEvents.js 的兩顆匯出常數（import，不是複製
// 字面）——測試治具也直接沿用同一份，才對得上生產碼實際比對的值
import { PRO_WANG_RIVAL_EV, PRO_WANG_TEAMMATE_EV } from '../src/career/proEvents.js';

// ════════════════════════════════════════════════════════════════
// 共用治具
// ════════════════════════════════════════════════════════════════
const SCHEDULE = [
  { id: 'pro-r1', round: 'pro', opponentId: 'moye-outlaws' },
  { id: 'pro-r2', round: 'pro', opponentId: 'tiegu-warlords' },
];
const FIRST = SCHEDULE[0];
const careerAt = (events = [], schedule = SCHEDULE) => ({ schedule, events });

/** 建 archive：n 筆職業季封存，前 champions 筆為 proFinish==='champion'。 */
function archiveOf(n, champions = 0, teamId = 'tiegu-warlords') {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ pro: teamId, proFinish: i < champions ? 'champion' : 'none', proRank: i < champions ? 1 : 4 });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
// M1：三個里程碑事件與觸發（只吃 archive）
// ════════════════════════════════════════════════════════════════
test('M1① 老兵之年：archive 已封存 4 季（年資達第 5 年）觸發', () => {
  const evs = proMilestonePreEvents(careerAt([]), FIRST, archiveOf(MILESTONE_VETERAN_YEAR - 1));
  assert.ok(evs.some((e) => e.id === MILESTONE_VETERAN_EV));
});

test('M1② 王朝：archive 冠軍數達 3 座觸發（年資本身不足門檻，隔離判定）', () => {
  const archive = archiveOf(3, MILESTONE_DYNASTY_TITLES); // 3 季全冠軍，年資才 4，不觸發老兵/衝刺
  const evs = proMilestonePreEvents(careerAt([]), FIRST, archive);
  assert.ok(evs.some((e) => e.id === MILESTONE_DYNASTY_EV));
  assert.ok(!evs.some((e) => e.id === MILESTONE_VETERAN_EV), '年資 4 不到 5，老兵之年不該混入');
});

test('M1③ 最後衝刺：archive 已封存 8 季（年資達第 9 年）觸發', () => {
  const evs = proMilestonePreEvents(careerAt([]), FIRST, archiveOf(MILESTONE_FINAL_PUSH_YEAR - 1));
  assert.ok(evs.some((e) => e.id === MILESTONE_FINAL_PUSH_EV));
});

test('M1 舊檔炸檔防線：archive 筆缺 pro／proFinish 欄位、career 缺 events 都不得 throw', () => {
  assert.doesNotThrow(() => {
    proMilestonePreEvents({ schedule: SCHEDULE }, FIRST, [{}, { pro: 'not-a-real-team' }, null, undefined]);
  });
  const evs = proMilestonePreEvents({ schedule: SCHEDULE }, FIRST, []);
  assert.deepEqual(evs, []); // 空 archive、缺 events＝年資 1，不觸發任何事件，且不炸
});

// ════════════════════════════════════════════════════════════════
// M2：演出＝敘事卡（{speaker,text}）＋小獎勵具名常數
// ════════════════════════════════════════════════════════════════
test('M2 三張卡每句都是 {speaker,text} 物件（探針卷空白泡泡教訓），且各帶具名獎勵', () => {
  const archive = archiveOf(MILESTONE_FINAL_PUSH_YEAR - 1, MILESTONE_DYNASTY_TITLES);
  const evs = proMilestonePreEvents(careerAt([]), FIRST, archive);
  assert.equal(evs.length, 3, '年資 9 且冠軍 3 座＝三個門檻同時跨過，同一季可同時觸發');
  for (const e of evs) {
    assert.ok(e.lines.length > 0);
    for (const l of e.lines) {
      assert.equal(typeof l.speaker, 'string');
      assert.equal(typeof l.text, 'string');
      assert.ok(l.text.length > 0);
    }
    assert.equal(e.effect?.teamTrust, MILESTONE_TEAM_TRUST_BONUS, '獎勵一律走具名常數，不得寫死數字');
  }
  assert.equal(MILESTONE_TEAM_TRUST_BONUS, 2, '★試玩必調★ 目前提案值 2');
});

// ════════════════════════════════════════════════════════════════
// M3：終身各一次
// ════════════════════════════════════════════════════════════════
test('M3 連續兩年推進，老兵之年恰觸發一次（events 旗標跨季帶入，同構 pro 章節不清空慣例）', () => {
  const y5 = proMilestonePreEvents(careerAt([]), FIRST, archiveOf(MILESTONE_VETERAN_YEAR - 1));
  assert.ok(y5.some((e) => e.id === MILESTONE_VETERAN_EV));
  const eventsAfter = [MILESTONE_VETERAN_EV];
  const y6 = proMilestonePreEvents(careerAt(eventsAfter), FIRST, archiveOf(MILESTONE_VETERAN_YEAR));
  assert.ok(!y6.some((e) => e.id === MILESTONE_VETERAN_EV), '次年條件仍為真，但一生一次旗標已擋下');
});

test('M3 舊檔缺旗標欄位（events undefined）＝視為未觸發，不炸、正常照觸發', () => {
  const career = { schedule: SCHEDULE }; // 無 events 鍵
  const evs = proMilestonePreEvents(career, FIRST, archiveOf(MILESTONE_VETERAN_YEAR - 1));
  assert.ok(evs.some((e) => e.id === MILESTONE_VETERAN_EV));
});

// ════════════════════════════════════════════════════════════════
// M4：條件未達不觸發
// ════════════════════════════════════════════════════════════════
test('M4 年資 4／冠軍 2：三事件全不出', () => {
  const archive = archiveOf(3, 2); // 已封存 3 季（年資=4）、2 座冠軍——三門檻皆未達
  const evs = proMilestonePreEvents(careerAt([]), FIRST, archive);
  assert.deepEqual(evs, []);
});

test('M4 守衛：非本季第一場／非 pro-foreign round 恆不觸發（即使 archive 已達門檻）', () => {
  const archive = archiveOf(MILESTONE_FINAL_PUSH_YEAR - 1, MILESTONE_DYNASTY_TITLES);
  assert.deepEqual(
    proMilestonePreEvents(careerAt([]), SCHEDULE[1], archive), [],
    '不是本季第一場賽前，不判定',
  );
  assert.deepEqual(
    proMilestonePreEvents(careerAt([]), { ...FIRST, round: 'corp' }, archive), [],
    'round 守衛：非 pro/foreign 不判定',
  );
  assert.deepEqual(
    proMilestonePreEvents(careerAt([]), { ...FIRST, round: 'semi' }, archive), [],
    'round 守衛：季後賽不判定',
  );
});

// ════════════════════════════════════════════════════════════════
// R1：決定論年表
// ════════════════════════════════════════════════════════════════
test('R1 資料完整性：王勝翔的隊要真的在職業八隊表裡（同構 proEvents.js 的自我檢查）', () => {
  assert.ok(RIVAL_TEAM_EXISTS);
});

test('R1 年表是純資料，決定論：同一組輸入呼叫兩次逐值相同', () => {
  const archive = archiveOf(RIVAL_YEAR_CAPTAIN - 1);
  const a = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archive);
  const b = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archive);
  assert.deepEqual(a, b);
});

test('R1 年表本身：五個年份與五個里程碑鍵一一對應', () => {
  assert.equal(RIVAL_YEAR_TABLE[RIVAL_YEAR_CAPTAIN], 'captain');
  assert.equal(RIVAL_YEAR_TABLE[RIVAL_YEAR_MVP], 'mvp');
  assert.equal(RIVAL_YEAR_TABLE[RIVAL_YEAR_SLUMP], 'slump');
  assert.equal(RIVAL_YEAR_TABLE[RIVAL_YEAR_FINAL], 'finalYear');
  assert.equal(RIVAL_YEAR_CAPTAIN, 3);
  assert.equal(RIVAL_YEAR_MVP, 5);
  assert.equal(RIVAL_YEAR_SLUMP, 7);
  assert.equal(RIVAL_YEAR_FINAL, 9);
  assert.equal(RIVAL_YEAR_RETIRE, 10);
});

test('R1 純函式源碼不得讀 Math.random／比賽結果／轉隊或出海字樣（靜態防線）', async () => {
  const src = await readFile(new URL('../src/career/proRivalArc.js', import.meta.url), 'utf-8');
  assert.ok(!src.includes('Math.random'), '不吃隨機');
  assert.ok(!src.includes('.results'), '不吃比賽結果');
  assert.ok(!src.includes('transferPro') && !src.includes('enterPro('), '不動隊籍（不呼叫轉隊/入章 API）');
});

// ════════════════════════════════════════════════════════════════
// R2：年度重逢輕量句依年表換句＋出海變體
// ════════════════════════════════════════════════════════════════
const RIVAL_MARKERS = {
  captain: '隊長袖標',
  mvp: 'MVP 獎盃',
  slump: '打得不太順',
  finalYear: '最後一年了',
};

test('R2 逐年斷言：對應年份出對應變體（敵隊語氣，非同隊、非出海）', () => {
  for (const [year, marker] of [
    [RIVAL_YEAR_CAPTAIN, RIVAL_MARKERS.captain],
    [RIVAL_YEAR_MVP, RIVAL_MARKERS.mvp],
    [RIVAL_YEAR_SLUMP, RIVAL_MARKERS.slump],
    [RIVAL_YEAR_FINAL, RIVAL_MARKERS.finalYear],
  ]) {
    const archive = archiveOf(year - 1);
    const evs = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archive);
    assert.equal(evs.length, 1, `年資第 ${year} 年應恰有一個事件`);
    assert.equal(evs[0].id, `${RIVAL_ARC_ANNUAL_PREFIX}${year}`);
    assert.ok(evs[0].lines[0].text.includes(marker), `第 ${year} 年要含變體錨點「${marker}」`);
  }
});

test('R2 非里程碑年份（如第 1 年）＝既有預設句', () => {
  const evs = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archiveOf(0));
  assert.equal(evs.length, 1);
  assert.ok(evs[0].lines[0].text.includes('照樣不留情面'));
});

// ════════════════════════════════════════════════════════════════
// H3 對抗覆審修：預設句不得與 proEvents.js 既有年度輕量句逐字相同（防回歸複製）
// ════════════════════════════════════════════════════════════════
test('H3 防回歸：proRivalArc.js 的敵隊預設句字面不得與 proEvents.js 既有年度句逐字相同', async () => {
  const wangSrc = await readFile(new URL('../src/career/proEvents.js', import.meta.url), 'utf-8');
  const rivalSrc = await readFile(new URL('../src/career/proRivalArc.js', import.meta.url), 'utf-8');
  // proEvents.js 既有年度輕量句原文字面（97 行附近，逐字比對）
  const existingLine = '……又是你。今年的你，比去年難纏了嗎？網子那邊見。';
  assert.ok(wangSrc.includes(existingLine), 'fixture 前提：proEvents.js 確實含這句既有台詞（否則本測試失去比對基準）');
  assert.ok(!rivalSrc.includes(existingLine), '本檔任何文案字面都不得與既有年度句逐字相同（H3 修復核心斷言）');
});

test('R2 出海年仍出國內句＝變紅；出海期間改播隔海變體，不含年份專屬敵隊句', () => {
  const archive = archiveOf(RIVAL_YEAR_MVP - 1);
  const evs = rivalArcPreEvents(careerAt([]), FIRST, 'aurora-orion', archive); // 海外隊 id
  assert.equal(evs.length, 1);
  assert.ok(!evs[0].lines[0].text.includes(RIVAL_MARKERS.mvp), '出海年不得出國內敵隊句');
  assert.ok(/海/.test(evs[0].lines[0].text), '隔海變體要有海洋意象錨點');
});

test('R2 同季不重複（旗標含年資）；跨季再播', () => {
  const archive = archiveOf(RIVAL_YEAR_CAPTAIN - 1);
  const again = rivalArcPreEvents(
    careerAt([`${RIVAL_ARC_ANNUAL_PREFIX}${RIVAL_YEAR_CAPTAIN}`]), FIRST, 'tiegu-warlords', archive,
  );
  assert.deepEqual(again, [], '同季（季後賽再遇）不重複');
});

// ════════════════════════════════════════════════════════════════
// R3：第 10 年退休收束卡
// ════════════════════════════════════════════════════════════════
test('R3 第 10 年退休收束卡：終身一次，播過不再出第二次', () => {
  const archive = archiveOf(RIVAL_YEAR_RETIRE - 1);
  const first = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archive);
  assert.equal(first.length, 1);
  assert.equal(first[0].id, RIVAL_RETIRE_EV);
  for (const l of first[0].lines) {
    assert.equal(typeof l.speaker, 'string');
    assert.equal(typeof l.text, 'string');
  }
  const second = rivalArcPreEvents(careerAt([RIVAL_RETIRE_EV]), FIRST, 'tiegu-warlords', archive);
  assert.deepEqual(second, [], '退休卡不得出第二次');
});

test('R3 退休後重逢句永久停播（即使理論上又推進更多季）', () => {
  const laterArchive = archiveOf(RIVAL_YEAR_RETIRE + 2); // 理論探針：合成一個「更後面」的 archive
  const evs = rivalArcPreEvents(careerAt([RIVAL_RETIRE_EV]), FIRST, 'tiegu-warlords', laterArchive);
  assert.deepEqual(evs, [], '已退休旗標在，任何年度重逢句都不得再出');
});

test('R3 既有王勝翔宿敵線零改動：既有測試檔照跑不動（本檔案不 import proEvents.js 任何可變狀態）', async () => {
  const src = await readFile(new URL('../src/career/proEvents.js', import.meta.url), 'utf-8');
  // 只做「檔案還在、還是原本的匯出」這種粗防線；真正的零漂移由 git diff --stat 佐證
  assert.ok(src.includes('proWangRivalPreEvents'));
});

// ════════════════════════════════════════════════════════════════
// H1 對抗覆審修：退休卡依玩家此刻隊籍現實分三款（敵隊／同隊／出海）
// ════════════════════════════════════════════════════════════════
test('H1 退休卡·敵隊語氣：非同隊、非出海時維持既有「網子」語氣（三款互斥基準）', () => {
  const archive = archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'tiegu-warlords');
  const evs = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archive);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, RIVAL_RETIRE_EV);
  const text = evs[0].lines.map((l) => l.text).join('');
  assert.match(text, /網子/, '敵隊款維持隔網語氣');
});

test('H1 退休卡·同隊語氣：同隊玩家看到的退休卡不得出現「網子」/「對面」（不得打臉 R4）', () => {
  const archive = archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'cangyu-titans');
  const evs = rivalArcPreEvents(careerAt([]), FIRST, 'cangyu-titans', archive);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, RIVAL_RETIRE_EV);
  const text = evs[0].lines.map((l) => l.text).join('');
  assert.ok(!text.includes('網子'), `同隊退休卡不得含「網子」：${text}`);
  assert.ok(!text.includes('對面'), `同隊退休卡不得含「對面」：${text}`);
  assert.match(text, /球衣|置物櫃|扛/, '同隊款要有十年隊友告別語氣的錨點');
  for (const l of evs[0].lines) {
    assert.equal(typeof l.speaker, 'string');
    assert.equal(typeof l.text, 'string');
  }
});

test('H1 退休卡·出海語氣：玩家出海期間得知退休——隔海得知，不得出現「在你對面/身邊」語意', () => {
  const archive = archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'aurora-orion');
  const evs = rivalArcPreEvents(careerAt([]), FIRST, 'aurora-orion', archive);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, RIVAL_RETIRE_EV);
  const text = evs[0].lines.map((l) => l.text).join('');
  assert.ok(!text.includes('網子'), `出海退休卡不得含「網子」：${text}`);
  assert.ok(!text.includes('對面'), `出海退休卡不得含「對面」：${text}`);
  assert.ok(!text.includes('身邊'), `出海退休卡不得含「身邊」：${text}`);
  assert.match(text, /海/, '出海款要有隔海得知的錨點');
});

test('H1 三款退休卡文案互不相同（同一個 id 一生一次，語氣依當下 proId 分流）', () => {
  const rival = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'tiegu-warlords'));
  const mate = rivalArcPreEvents(careerAt([]), FIRST, 'cangyu-titans', archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'cangyu-titans'));
  const foreign = rivalArcPreEvents(careerAt([]), FIRST, 'aurora-orion', archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'aurora-orion'));
  assert.equal(rival[0].id, RIVAL_RETIRE_EV);
  assert.equal(mate[0].id, RIVAL_RETIRE_EV);
  assert.equal(foreign[0].id, RIVAL_RETIRE_EV);
  assert.notDeepEqual(rival[0].lines, mate[0].lines);
  assert.notDeepEqual(rival[0].lines, foreign[0].lines);
  assert.notDeepEqual(mate[0].lines, foreign[0].lines);
});

// ════════════════════════════════════════════════════════════════
// H1 殘餘修（第二輪對抗覆審）：三款退休卡不得量化共處年資
// ════════════════════════════════════════════════════════════════
test('H1 殘餘防回歸：三款退休卡文案皆不得含「十年」「大半」這類共處時長量化字樣', () => {
  const flavors = [
    ['敵隊', 'tiegu-warlords'],
    ['同隊', 'cangyu-titans'],
    ['出海', 'aurora-orion'],
  ];
  for (const [label, proId] of flavors) {
    const archive = archiveOf(RIVAL_YEAR_RETIRE - 1, 0, proId);
    const evs = rivalArcPreEvents(careerAt([]), FIRST, proId, archive);
    const text = evs[0].lines.map((l) => l.text).join('');
    assert.ok(!text.includes('十年'), `${label}款不得含「十年」（共處時長量化）：${text}`);
    assert.ok(!text.includes('大半'), `${label}款不得含「大半」（共處時長量化）：${text}`);
  }
});

// ════════════════════════════════════════════════════════════════
// H2 對抗覆審修：先敵後友／先友後敵一次性過渡句
// ════════════════════════════════════════════════════════════════
test('H2 先敵後友：曾播 PRO_WANG_RIVAL_EV、現在同隊＝該年改播過渡句（取代年度句，恰一次）', () => {
  const archive = archiveOf(RIVAL_YEAR_CAPTAIN - 1, 0, 'cangyu-titans');
  const evs = rivalArcPreEvents(careerAt([PRO_WANG_RIVAL_EV]), FIRST, 'cangyu-titans', archive);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, RIVAL_ARC_SWITCH_TO_MATE_EV, '該年只播過渡句，不疊播年度句');
  for (const l of evs[0].lines) {
    assert.equal(typeof l.speaker, 'string');
    assert.equal(typeof l.text, 'string');
  }
  // 播過一次後，同一顆過渡旗標終身不再出（即使隔年仍同隊、仍帶著曾經敵對的舊事實）
  const again = rivalArcPreEvents(
    careerAt([PRO_WANG_RIVAL_EV, RIVAL_ARC_SWITCH_TO_MATE_EV]), FIRST, 'cangyu-titans',
    archiveOf(RIVAL_YEAR_CAPTAIN, 0, 'cangyu-titans'),
  );
  assert.notEqual(again[0]?.id, RIVAL_ARC_SWITCH_TO_MATE_EV, '過渡句終身一次，次年落回正常同隊年表句');
});

test('H2 先友後敵：曾播 PRO_WANG_TEAMMATE_EV、現在不同隊＝該年改播過渡句（恰一次）', () => {
  const archive = archiveOf(RIVAL_YEAR_CAPTAIN - 1, 0, 'tiegu-warlords');
  const evs = rivalArcPreEvents(careerAt([PRO_WANG_TEAMMATE_EV]), FIRST, 'tiegu-warlords', archive);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, RIVAL_ARC_SWITCH_TO_FOE_EV);
  const again = rivalArcPreEvents(
    careerAt([PRO_WANG_TEAMMATE_EV, RIVAL_ARC_SWITCH_TO_FOE_EV]), FIRST, 'tiegu-warlords',
    archiveOf(RIVAL_YEAR_CAPTAIN, 0, 'tiegu-warlords'),
  );
  assert.notEqual(again[0]?.id, RIVAL_ARC_SWITCH_TO_FOE_EV, '過渡句終身一次，次年落回正常敵隊年表句');
});

test('H2 守衛：未曾換過陣營時不觸發過渡句（一直同隊/一直敵隊都走正常年表句）', () => {
  const alwaysMate = rivalArcPreEvents(
    careerAt([]), FIRST, 'cangyu-titans', archiveOf(RIVAL_YEAR_CAPTAIN - 1, 0, 'cangyu-titans'),
  );
  assert.notEqual(alwaysMate[0]?.id, RIVAL_ARC_SWITCH_TO_MATE_EV, '從未播過 RIVAL_EV，不該誤觸過渡句');
  const alwaysFoe = rivalArcPreEvents(
    careerAt([]), FIRST, 'tiegu-warlords', archiveOf(RIVAL_YEAR_CAPTAIN - 1, 0, 'tiegu-warlords'),
  );
  assert.notEqual(alwaysFoe[0]?.id, RIVAL_ARC_SWITCH_TO_FOE_EV, '從未播過 TEAMMATE_EV，不該誤觸過渡句');
});

// ════════════════════════════════════════════════════════════════
// H2 邊界修（第二輪對抗覆審）：第 9 年季末轉隊、第 10 年才評到——
// 過渡句不得被退休短路吞掉，兩者要一起回傳（過渡在前、退休在後）
// ════════════════════════════════════════════════════════════════
test('H2 邊界：year=10 且有未播過渡旗標＝回傳兩事件［過渡句, 退休卡］，順序正確、各自入帳', () => {
  const archive = archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'cangyu-titans'); // 年資剛好第 10 年
  const evs = rivalArcPreEvents(careerAt([PRO_WANG_RIVAL_EV]), FIRST, 'cangyu-titans', archive);
  assert.equal(evs.length, 2, '過渡句與退休卡要同時回傳，不得被短路吞掉任何一個');
  assert.equal(evs[0].id, RIVAL_ARC_SWITCH_TO_MATE_EV, '過渡句在前');
  assert.equal(evs[1].id, RIVAL_RETIRE_EV, '退休卡在後');
  for (const e of evs) {
    for (const l of e.lines) {
      assert.equal(typeof l.speaker, 'string');
      assert.equal(typeof l.text, 'string');
    }
  }
  // 兩顆旗標各自入帳後，下一次呼叫（模擬同季稍後的另一場）兩者都不再重播，
  // 且最上方「已退休」短路已經生效（不會再掉進過渡分支重新判一次）
  const after = rivalArcPreEvents(
    careerAt([PRO_WANG_RIVAL_EV, RIVAL_ARC_SWITCH_TO_MATE_EV, RIVAL_RETIRE_EV]),
    FIRST, 'cangyu-titans', archive,
  );
  assert.deepEqual(after, [], '兩顆旗標入帳後恆空——退休後永久停播涵蓋這個複合案例');
});

test('H2 邊界：year=10 但無未播過渡旗標＝仍只回退休卡一個（回歸既有行為）', () => {
  const archive = archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'cangyu-titans');
  const evs = rivalArcPreEvents(careerAt([]), FIRST, 'cangyu-titans', archive); // 從未播過 RIVAL_EV
  assert.equal(evs.length, 1, '沒有過渡可補，退休卡維持單一事件');
  assert.equal(evs[0].id, RIVAL_RETIRE_EV);
});

test('H2 邊界（反向）：先友後敵，year=10 且有未播過渡旗標＝同理回傳兩事件', () => {
  const archive = archiveOf(RIVAL_YEAR_RETIRE - 1, 0, 'tiegu-warlords');
  const evs = rivalArcPreEvents(careerAt([PRO_WANG_TEAMMATE_EV]), FIRST, 'tiegu-warlords', archive);
  assert.equal(evs.length, 2);
  assert.equal(evs[0].id, RIVAL_ARC_SWITCH_TO_FOE_EV, '過渡句在前');
  assert.equal(evs[1].id, RIVAL_RETIRE_EV, '退休卡在後');
});

// ════════════════════════════════════════════════════════════════
// R4：同隊語氣變體
// ════════════════════════════════════════════════════════════════
test('R4 同隊期間：隊長/MVP 年表事件句用同隊語氣，不得出「網子」隔網相對語意', () => {
  for (const year of [RIVAL_YEAR_CAPTAIN, RIVAL_YEAR_MVP]) {
    const archive = archiveOf(year - 1, 0, 'cangyu-titans');
    const evs = rivalArcPreEvents(careerAt([]), FIRST, 'cangyu-titans', archive);
    assert.equal(evs.length, 1);
    const text = evs[0].lines[0].text;
    assert.ok(!text.includes('網子'), `第 ${year} 年同隊句不得含「網子」隔網語意：${text}`);
    assert.ok(!text.includes('對面'), `第 ${year} 年同隊句不得含「對面」語意：${text}`);
  }
});

test('R4 變紅探針：同隊存檔若誤用敵隊句會被本測試抓到（同隊句與敵隊句逐值不同）', () => {
  const archiveRival = archiveOf(RIVAL_YEAR_CAPTAIN - 1, 0, 'tiegu-warlords');
  const rival = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archiveRival);
  const archiveMate = archiveOf(RIVAL_YEAR_CAPTAIN - 1, 0, 'cangyu-titans');
  const mate = rivalArcPreEvents(careerAt([]), FIRST, 'cangyu-titans', archiveMate);
  assert.notEqual(rival[0].lines[0].text, mate[0].lines[0].text, '同隊/敵隊句必須是不同文案');
});

// ════════════════════════════════════════════════════════════════
// M5／R5：全域收尾（sim 零改動由主對話的 git diff --stat 佐證，見回報）
// ════════════════════════════════════════════════════════════════
test('M5/R5 兩條敘事線互不干擾：同一季可同時各自觸發、各自旗標互不影響', () => {
  const archive = archiveOf(RIVAL_YEAR_CAPTAIN - 1, 0, 'tiegu-warlords');
  const mEvs = proMilestonePreEvents(careerAt([]), FIRST, archive);
  const rEvs = rivalArcPreEvents(careerAt([]), FIRST, 'tiegu-warlords', archive);
  assert.deepEqual(mEvs, [], '年資 3 未達任何里程碑門檻');
  assert.equal(rEvs.length, 1, 'R 線第 3 年隊長句仍正常觸發，不受 M 線影響');
});
