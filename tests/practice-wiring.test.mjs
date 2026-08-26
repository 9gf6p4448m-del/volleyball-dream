// 練習賽卷批 B — 接線驗收：紅白對抗賽「真的打得起來，而且不會污染生涯」
//
// ★ 為什麼要這一檔 ★ 批 A 的純函式測只證明「判定對了」。批 B 交付的是**路徑**：
//   集訓面板 →（開打）→ 建隊 → 賽中科目 HUD／字卡 → 賽末結算 → 集訓格聯動。
//   本專案兩次踩的都是接線（`bquickButton` 定義了卻沒進 stage 的 return、
//   落點圈畫錯位置），所以這裡跑的全是**正式的產品函式**：假 DOM 真的按那顆
//   「▶ 開打」、真的呼叫 `practiceMatchSetup`／`refreshPracticeHud`／
//   `settlePracticeMatch`，不掃原始碼字串、不重抄一份判定。
//
// ★ 鑑別力（`02 §6.1` 條 1）★「練習賽不污染戰績」這條的反向對照就寫在同一個 test 裡：
//   同一份存檔、同一個 game、換成正式賽的 `settleCareerMatch` ⇒ 戰績與招募進度**必須**
//   動起來。只驗「練習賽沒動」的話，一支什麼都不做的假結算器也會全綠。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  practiceBiasFor, practiceMatchSetup, practiceMatchEntry, recentTechniquesOf,
  drillsFor, drillDefOf, settlePractice, DRILL_DEFS,
  PRACTICE_FEED_TRUST, PRACTICE_MATE_TRUST,
} from '../src/career/practiceMatch.js';
import {
  campAttrOptions, applyCampAttrTraining, campAttrPicks, practicePlayedIn,
  pendingCampSlots, campPlanFor, CAMP_CONTROL_UNLOCKED,
} from '../src/career/trainingCamp.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { ensureStarterRoster, buildStarterMembers } from '../src/career/roster.js';
import { validateLineup, checkRoleStructure } from '../src/career/lineup.js';
import { settlePracticeMatch, settleCareerMatch } from '../src/app/matchCareer.js';
import { refreshPracticeHud, practiceRewardLine } from '../src/app/matchLoop.js';
import { AI } from '../src/sim/ai.js';

const PID = 'A2';
const TEAM = 'A';

// ════════════════════════════════════════════════════════════
// 一、餵球偏置（純函式）
// ════════════════════════════════════════════════════════════

test('practiceBiasFor：無科目＝零偏置（不得無條件把白隊調弱）', () => {
  assert.deepEqual(practiceBiasFor([]), {
    serveToPlayer: false,
    feedPlayer: false,
    standServe: false,
    noTip: false,
    playerTrust: null,
    mateTrust: null,
  });
  assert.deepEqual(practiceBiasFor(undefined), practiceBiasFor([]));
  // 認不得的科目一律拿不到偏置（同 drillGainFor 的紀律）
  assert.deepEqual(practiceBiasFor([{ id: 'nope' }]), practiceBiasFor([]));
});

// 每類科目各一案：喊什麼科目就開什麼偏置、**且不開別的**
const BIAS_CASES = [
  { drill: 'dive', on: ['serveToPlayer'], why: '魚躍＝要有球飛過來給你撲' },
  { drill: 'basic-libero', on: ['serveToPlayer'], why: '起球 6 次＝白隊得發給你' },
  { drill: 'tip', on: ['feedPlayer'], why: '吊球＝球要先舉給你' },
  { drill: 'pipe-kill', on: ['feedPlayer'], why: '後排 pipe＝球要先舉給你' },
  { drill: 'basic-attack', on: ['feedPlayer'], why: '殺球 3 分＝球要先舉給你' },
  { drill: 'call-play', on: ['standServe'], why: '叫戰術＝一傳要好、窗才開得多' },
  { drill: 'basic-middle', on: ['noTip'], why: '攔網觸球＝對面要真的扣過來' },
];
for (const c of BIAS_CASES) {
  test(`practiceBiasFor：${c.drill} ⇒ ${c.on.join('＋')}（${c.why}）`, () => {
    const bias = practiceBiasFor([DRILL_DEFS[c.drill]]);
    for (const key of ['serveToPlayer', 'feedPlayer', 'standServe', 'noTip']) {
      assert.equal(bias[key], c.on.includes(key), `${c.drill} 的 ${key} 應為 ${c.on.includes(key)}`);
    }
    const wantsTrust = c.on.includes('serveToPlayer') || c.on.includes('feedPlayer');
    assert.equal(bias.playerTrust, wantsTrust ? PRACTICE_FEED_TRUST : null);
  });
}

test('practiceBiasFor：多科目取聯集（一場練三件事，三條偏置同時開）', () => {
  const bias = practiceBiasFor([DRILL_DEFS.dive, DRILL_DEFS['call-play'], DRILL_DEFS['basic-middle']]);
  assert.deepEqual(bias, {
    serveToPlayer: true,
    feedPlayer: false,
    standServe: true,
    noTip: true,
    playerTrust: PRACTICE_FEED_TRUST,
    mateTrust: PRACTICE_MATE_TRUST,
  });
});

// ════════════════════════════════════════════════════════════
// 二、建隊：偏置真的落到 createGame 吃得到的那些參數上
// ════════════════════════════════════════════════════════════
// ★ 量測位置 ★ 斷言的是 `practiceMatchSetup` 的**回傳值**——那就是
// `resolveMatchConfig` 原封不動遞給 `createGame` 的東西（gameOptions.teams／
// aiProfiles／liberos／benches）。驗「偏置函式回了 true」證明不了球場上有差別。

const newPlayer = (over = {}) => {
  const p = createCareerPlayer('小夢', { seed: 7 });
  Object.assign(p, over);
  return p;
};

test('practiceMatchSetup：兩隊各 6 人＋自由人，id 全域唯一、玩家在紅隊（A 隊）', () => {
  const setup = practiceMatchSetup({
    player: newPlayer(), members: buildStarterMembers(), drills: [], seasonIndex: 2, seed: 11,
  });
  assert.equal(setup.teams.A.length, 6);
  assert.equal(setup.teams.B.length, 6);
  assert.ok(setup.teams.A.some((p) => p.id === PID), '玩家必須在紅隊先發');
  assert.ok(!setup.teams.B.some((p) => p.id === PID), '玩家不得同時在白隊');
  for (const p of setup.teams.A) assert.equal(p.teamId, 'A');
  for (const p of setup.teams.B) assert.equal(p.teamId, 'B');
  const ids = [
    ...setup.teams.A.map((p) => p.id), ...setup.teams.B.map((p) => p.id),
    setup.liberos.A.id, setup.liberos.B.id,
    ...setup.benches.A.map((p) => p.id), ...setup.benches.B.map((p) => p.id),
  ];
  assert.equal(new Set(ids).size, ids.length, `id 撞號：${ids.join(',')}`);
  // 兩隊都排得出合法 5-1（拿正式驗證器再問一次，不只信 splitSquads 的 legal 旗標）
  for (const side of ['red', 'white']) {
    const sq = setup.practice.squads[side];
    assert.ok(validateLineup(sq.lineup, sq.members, sq.anchorId, sq.anchorRole).valid,
      `${side} 陣容非法`);
    assert.ok(checkRoleStructure(sq.lineup.starters, sq.members, sq.anchorId, sq.anchorRole).legal);
  }
  assert.equal(setup.comboScale, 1, '第 2 屆起組合攻擊照常開（練習賽不是特例場）');
});

test('練習賽固定 bo1：setup 不帶 series，練習賽 entry 走 matchFormatOf 回 1', async () => {
  const { matchFormatOf } = await import('../src/career/schedule.js');
  assert.equal(matchFormatOf(practiceMatchEntry(2)), 1);
  assert.equal(matchFormatOf(practiceMatchEntry(3)), 1);
});

test('偏置①②：接發／殺球類科目 ⇒ 玩家 trust 真的被拉高（同一根槓桿，兩條路都吃它）', () => {
  const base = practiceMatchSetup({
    player: newPlayer(), members: buildStarterMembers(), drills: [], seed: 11,
  });
  const me0 = base.teams.A.find((p) => p.id === PID);
  const fed = practiceMatchSetup({
    player: newPlayer(), members: buildStarterMembers(), drills: [DRILL_DEFS.tip], seed: 11,
  });
  const me1 = fed.teams.A.find((p) => p.id === PID);
  assert.equal(me1.trust.fromSetter, PRACTICE_FEED_TRUST);
  assert.ok(me1.trust.fromSetter > me0.trust.fromSetter, '★反向對照★ 沒科目時不得拉高');
  // 拉高之後必須是紅隊最高的那一個——`serveTargetPidOf` 挑的就是 trust 最高的後排攻擊手
  const others = fed.teams.A.filter((p) => p.id !== PID).map((p) => p.trust.fromSetter);
  assert.ok(others.every((t) => t < me1.trust.fromSetter), '玩家要是紅隊 trust 最高的人');
  // ★ 有感的來源是「差距」不是玩家的絕對值 ★ 實測：只拉玩家 31.6%→33.3%（幾乎沒動），
  // 壓了隊友才 →37.1%。所以紅隊隊友的 trust 必須真的被壓下去。
  assert.ok(others.every((t) => t <= PRACTICE_MATE_TRUST), '紅隊隊友 trust 要壓到餵球上限');
  const mates0 = base.teams.A.filter((p) => p.id !== PID).map((p) => p.trust.fromSetter);
  assert.ok(mates0.some((t) => t > PRACTICE_MATE_TRUST), '★反向對照★ 沒科目時隊友 trust 照常');
  // 白隊不壓（對手調笨不是訓練是放水）
  const whiteMates = fed.teams.B.map((p) => p.trust.fromSetter);
  assert.ok(whiteMates.some((t) => t > PRACTICE_MATE_TRUST), '白隊 trust 不得被動到');
});

test('偏置①②：不得寫回存檔裡的球員物件（這一場的訓練安排，不是永久球權改變）', () => {
  const player = newPlayer();
  const before = player.trust.fromSetter;
  practiceMatchSetup({
    player, members: buildStarterMembers(), drills: [DRILL_DEFS.tip], seed: 11,
  });
  assert.equal(player.trust.fromSetter, before, '存檔裡的 trust 一動都不能動');
});

test('偏置③：叫戰術科目 ⇒ 白隊全站發（jumpServeRate／floatServeRate 歸零）', () => {
  // v:2＝技術欄位語意版本；漏了它 normalizeCareerPlayer 會把 jumpServe 當舊語意歸零
  const player = newPlayer({ techniques: { jumpServe: 1, floatServe: 1, dive: 1, v: 2 } });
  const off = practiceMatchSetup({
    player, members: buildStarterMembers(), drills: [], seed: 11,
  });
  // ★反向對照★ 沒有這個科目時白隊照常會跳發／飄浮（否則偏置是零鑑別力的裝飾）
  assert.ok(off.aiProfiles.B.jumpServeRate > 0, '沒偏置時白隊本來就會跳發');
  assert.ok(off.aiProfiles.B.floatServeRate > 0);
  const on = practiceMatchSetup({
    player, members: buildStarterMembers(), drills: [DRILL_DEFS['call-play']], seed: 11,
  });
  assert.equal(on.aiProfiles.B.jumpServeRate, 0);
  assert.equal(on.aiProfiles.B.floatServeRate, 0);
  assert.ok(on.aiProfiles.A.jumpServeRate > 0, '偏置只加在白隊——紅隊要練的是自己');
});

test('偏置④：攔網科目 ⇒ 白隊 tipRate=0（不吊球＝少吊多扣）', () => {
  const player = newPlayer();
  const off = practiceMatchSetup({
    player, members: buildStarterMembers(), drills: [], seed: 11,
  });
  assert.equal(off.aiProfiles.B.tipRate, undefined, '沒偏置＝不覆寫＝走 aiProfileOf 的出廠值');
  assert.ok(AI.TIP_RATE > 0, '出廠值必須大於 0，否則這條偏置從頭到尾沒有差別');
  const on = practiceMatchSetup({
    player, members: buildStarterMembers(), drills: [DRILL_DEFS['basic-middle']], seed: 11,
  });
  assert.equal(on.aiProfiles.B.tipRate, 0);
  assert.equal(on.aiProfiles.A.tipRate, undefined, '紅隊不套');
});

test('practiceMatchSetup：決定論（同 seed 同名冊 ⇒ 兩隊名單逐值相同）', () => {
  const args = { members: buildStarterMembers(), drills: [DRILL_DEFS.tip], seasonIndex: 2, seed: 11 };
  const a = practiceMatchSetup({ player: newPlayer(), ...args });
  const b = practiceMatchSetup({ player: newPlayer(), ...args });
  const names = (s) => [...s.teams.A, ...s.teams.B].map((p) => `${p.id}:${p.name}`);
  assert.deepEqual(names(a), names(b));
});

test('recentTechniquesOf：只回已解鎖的、取教學鏈末端（≒最近學的）；零解鎖＝空', () => {
  assert.deepEqual(recentTechniquesOf(newPlayer()), []);
  const many = newPlayer({
    techniques: { tip: 1, dive: 1, pipe: 1, floatServe: 1, jumpServe: 1, callPlay: 1 },
  });
  assert.deepEqual(recentTechniquesOf(many), ['floatServe', 'jumpServe', 'callPlay']);
  const few = newPlayer({ techniques: { tip: 1, dive: 1 } });
  assert.deepEqual(recentTechniquesOf(few), ['tip', 'dive']);
});

// ════════════════════════════════════════════════════════════
// 三、賽中科目 HUD 與完成字卡（跑正式的 refreshPracticeHud）
// ════════════════════════════════════════════════════════════
const touch = (o) => ({ type: 'TOUCH', tick: 0, team: TEAM, ...o });
const score = (team = TEAM) => ({ type: 'SCORE', tick: 0, team, score: { A: 1, B: 0 } });
const tipKill = () => [touch({ playerId: PID, kind: 'spike', touches: 3, power: 0.3 }), score()];
const dive = () => touch({ playerId: PID, kind: 'dive' });

function hudState(drills, events) {
  const shown = [];
  return {
    s: {
      practiceDrills: drills,
      practiceRows: [],
      practiceFired: new Set(),
      playerId: PID,
      game: { players: { [PID]: { id: PID, teamId: TEAM } }, events },
      stage: { practiceHud: { update: (rows) => shown.push(rows) } },
    },
    shown,
  };
}

test('HUD：死球時逐科目顯示 N/target，達標那行標記完成', () => {
  const drills = [DRILL_DEFS.tip, DRILL_DEFS.dive];
  const { s, shown } = hudState(drills, [...tipKill(), dive()]);
  refreshPracticeHud(s);
  const rows = shown.at(-1);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.id, r.count, r.target, r.achieved]), [
    ['tip', 1, 1, true],
    ['dive', 1, 2, false], // 魚躍要 2 球——差一次就是還沒完成
  ]);
  assert.equal(rows[0].label, DRILL_DEFS.tip.label, '★台詞是規格★ HUD 的字與定義表同源');
});

test('字卡：科目達標當下彈一張，且一科只彈一次（同 checkRecruitFeats 的一場一卡）', () => {
  const drills = [DRILL_DEFS.tip];
  const { s } = hudState(drills, tipKill());
  const cards = [];
  refreshPracticeHud(s, cards);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].text, `✅ 科目完成：${DRILL_DEFS.tip.label}`);
  cards[0].onShown(); // 字卡真的播出去了才記 fired（被擠掉時下個死球重驗再出）
  const again = [];
  refreshPracticeHud(s, again);
  assert.deepEqual(again, [], '同一科目不得重複彈卡');
});

test('★反向★ 字卡：沒播出去（被更高優先擠掉）就不標 fired，下個死球會再排一次', () => {
  const { s } = hudState([DRILL_DEFS.tip], tipKill());
  const first = [];
  refreshPracticeHud(s, first);
  assert.equal(first.length, 1);
  const second = [];
  refreshPracticeHud(s, second); // 沒呼叫 onShown＝沒播出去
  assert.equal(second.length, 1, '不丟卡');
});

test('★反向★ 非練習賽：practiceDrills 為空 ⇒ HUD 與字卡整段短路（正式賽零擾動）', () => {
  const { s, shown } = hudState([], tipKill());
  const cards = [];
  refreshPracticeHud(s, cards);
  assert.deepEqual(shown, []);
  assert.deepEqual(cards, []);
});

test('結算面板獎勵行：三段階梯的文案與 campAttrPicks／控球解鎖同一個判準', () => {
  const one = settlePractice({
    events: tipKill(), playerId: PID, myTeam: TEAM,
    drills: [DRILL_DEFS.tip, DRILL_DEFS.dive, DRILL_DEFS['basic-middle']],
  });
  assert.equal(one.completedCount, 1);
  assert.equal(campAttrPicks({ completed: one.completedCount }), 1);
  assert.match(practiceRewardLine(one), /科目 1\/3/);
  assert.doesNotMatch(practiceRewardLine(one), /挑兩項/, '只完成 1 項不得宣稱可以挑兩項');

  const two = settlePractice({
    events: [...tipKill(), dive(), dive()], playerId: PID, myTeam: TEAM,
    drills: [DRILL_DEFS.tip, DRILL_DEFS.dive, DRILL_DEFS['basic-middle']],
  });
  assert.equal(two.completedCount, 2);
  assert.equal(campAttrPicks({ completed: two.completedCount }), 2);
  assert.match(practiceRewardLine(two), /挑兩項/);
  assert.doesNotMatch(practiceRewardLine(two), /控球.*開放/);

  const all = settlePractice({
    events: [...tipKill(), dive(), dive()], playerId: PID, myTeam: TEAM,
    drills: [DRILL_DEFS.tip, DRILL_DEFS.dive],
  });
  assert.equal(all.unlockControl, true);
  assert.match(practiceRewardLine(all), /控球/);
});

// ════════════════════════════════════════════════════════════
// 四、賽末結算：練習賽不污染戰績（★含反向對照★）
// ════════════════════════════════════════════════════════════
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 賽末結算只讀 game 的這幾格（不需要真的跑完一整局）
function endedGame(events) {
  return {
    players: { [PID]: { id: PID, teamId: TEAM, name: '小夢', currentRole: 'outside' } },
    match: { score: { A: 25, B: 20 }, winner: 'A' },
    events,
    scoutTally: { [PID]: null },
  };
}

function seededStore() {
  const store = createCareerStore(fakeStorage());
  const career = createCareer({ seed: 4242, playerName: '小夢' });
  const player = createCareerPlayer('小夢', { seed: career.seed });
  store.saveCareer(career);
  store.savePlayer(player);
  ensureStarterRoster(store);
  return { store, career: store.loadCareer(), player };
}

test('練習賽不污染生涯：戰績零新增、招募進度零變動、名冊成長不入帳', () => {
  const { store, career, player } = seededStore();
  const drills = [DRILL_DEFS.tip, DRILL_DEFS.dive];
  const events = [...tipKill(), ...tipKill(), dive(), dive()];
  const recBefore = JSON.stringify(store.loadRecruitment());
  const rosterBefore = JSON.stringify(store.loadRoster());

  const { saveOk, settled } = settlePracticeMatch({
    careerCtx: {
      store, career, player, matchEntry: practiceMatchEntry(2), seasonIndex: 2,
      practice: { drills, seasonIndex: 2 },
    },
    game: endedGame(events),
    playerId: PID,
    drills,
    chemistry: { A6: 3 },
  });

  assert.equal(saveOk, true);
  assert.equal(settled.completedCount, 2);
  assert.equal(store.loadCareer().results.length, 0, '★核心★ 練習賽不得記進戰績');
  assert.equal(store.loadCareer().growthPoints, 0, '也不得發成長點');
  assert.equal(JSON.stringify(store.loadRecruitment()), recBefore, '招募進度不得動');
  assert.equal(JSON.stringify(store.loadRoster()), rosterBefore, '隊友成長不得入帳');
  // 有寫的只有兩樣：科目成績與默契計數
  assert.deepEqual(store.loadPractice(),
    { seasonIndex: 2, completed: 2, total: 2, unlockControl: true });
  assert.equal(store.loadPlayer().chemistry.pairs.A6, 3,
    '默契照實記次數——kickoff 題 6 的 ×2 因為查無消費端而不做（見 matchCareer 註解）');
});

test('★反向對照★ 同一份存檔＋同一個 game，走正式賽結算就一定會動（證明上面的斷言驗得到東西）', () => {
  const { store, career, player } = seededStore();
  const entry = career.schedule[0];
  const events = [...tipKill(), ...tipKill(), dive(), dive()];
  const recBefore = JSON.stringify(store.loadRecruitment());

  settleCareerMatch({
    careerCtx: {
      store, career, player, matchEntry: entry, seasonIndex: 1, roster: store.loadRoster(),
    },
    game: endedGame(events),
    playerId: PID,
  });

  assert.equal(store.loadCareer().results.length, 1, '正式賽必須記戰績——否則上一條測試是空的');
  assert.ok(store.loadCareer().growthPoints > 0, '正式賽必須發成長點');
  assert.notEqual(JSON.stringify(store.loadRecruitment()), recBefore, '正式賽必須推招募進度');
  assert.deepEqual(store.loadPractice(),
    { seasonIndex: 0, completed: 0, total: 0, unlockControl: false },
    '正式賽反過來也不得寫練習賽成績');
});

test('練習賽重打防護：同一屆已有成績時不覆寫（一屆一場——防獎勵農場）', () => {
  const { store, career, player } = seededStore();
  const ctx = (drills) => ({
    careerCtx: {
      store, career, player, matchEntry: practiceMatchEntry(2), seasonIndex: 2,
      practice: { drills, seasonIndex: 2 },
    },
    game: endedGame([...tipKill(), dive(), dive()]),
    playerId: PID,
    drills,
  });
  settlePracticeMatch(ctx([DRILL_DEFS.tip, DRILL_DEFS.dive]));
  assert.equal(store.loadPractice().completed, 2);
  // 第二次故意打得很差——不得把好成績洗掉
  const bad = [DRILL_DEFS.tip, DRILL_DEFS.dive, DRILL_DEFS['basic-middle']];
  settlePracticeMatch({ ...ctx(bad), game: endedGame([]) });
  assert.deepEqual(store.loadPractice(),
    { seasonIndex: 2, completed: 2, total: 2, unlockControl: true }, '既有成績不得被覆寫');
});

// ════════════════════════════════════════════════════════════
// 五、集訓格聯動（資料層）
// ════════════════════════════════════════════════════════════

test('控球格：解鎖前不可選且理由說對事；解鎖後 +2／上限 75', () => {
  const player = createCareerPlayer('小夢', { seed: 7 });
  const locked = campAttrOptions(player).find((o) => o.key === 'control');
  assert.equal(locked.ready, false);
  assert.match(locked.reason, /紅白賽/, '理由要指出那條明路，不是無限期待定');
  assert.throws(() => applyCampAttrTraining(player, 'control'), /尚未拍板/);

  const open = campAttrOptions(player, { unlockControl: true }).find((o) => o.key === 'control');
  assert.equal(open.ready, true);
  assert.equal(open.gain, CAMP_CONTROL_UNLOCKED.gain);
  assert.equal(open.cap, CAMP_CONTROL_UNLOCKED.cap);
  const after = applyCampAttrTraining(player, 'control', { unlockControl: true });
  assert.equal(after.attributes.control, player.attributes.control + CAMP_CONTROL_UNLOCKED.gain);
  assert.equal(player.attributes.control, 68, '不可變：原物件不動');
});

test('控球格：練到上限就停（不得無限練）', () => {
  const player = createCareerPlayer('小夢', { seed: 7 });
  player.attributes.control = CAMP_CONTROL_UNLOCKED.cap;
  const o = campAttrOptions(player, { unlockControl: true }).find((x) => x.key === 'control');
  assert.equal(o.ready, false);
  assert.match(o.reason, new RegExp(String(CAMP_CONTROL_UNLOCKED.cap)));
  assert.throws(() => applyCampAttrTraining(player, 'control', { unlockControl: true }), /已達上限/);
});

test('屬性特訓名額：完成 ≥2 ⇒ 兩項；不足或沒打 ⇒ 一項', () => {
  assert.equal(campAttrPicks(null), 1);
  assert.equal(campAttrPicks({ completed: 0 }), 1);
  assert.equal(campAttrPicks({ completed: 1 }), 1);
  assert.equal(campAttrPicks({ completed: 2 }), 2);
  assert.equal(campAttrPicks({ completed: 3 }), 2);
});

test('practicePlayedIn：屆數要對得上（上一屆的成績不得讓這一屆看起來打完了）', () => {
  assert.equal(practicePlayedIn({ seasonIndex: 2, completed: 3 }, 2), true);
  assert.equal(practicePlayedIn({ seasonIndex: 2, completed: 3 }, 3), false);
  assert.equal(practicePlayedIn(null, 2), false);
});

test('未完成提醒：沒打紅白賽＝列出來；打完就不再提；沒接開打入口也不提（假警報）', () => {
  const player = createCareerPlayer('小夢', { seed: 7 });
  const plan = campPlanFor(2);
  const args = { player, plan, members: [], attrTrained: true };
  assert.deepEqual(
    pendingCampSlots({ ...args, practiceOffered: true, practicePlayed: false }).map((p) => p.key),
    ['practice'],
  );
  assert.deepEqual(
    pendingCampSlots({ ...args, practiceOffered: true, practicePlayed: true }), [],
    '打完就不該再喊',
  );
  assert.deepEqual(
    pendingCampSlots({ ...args, practiceOffered: false, practicePlayed: false }), [],
    '★反向★ 畫面上沒有那顆鈕時喊「你還沒打」＝叫玩家去按不存在的東西',
  );
});

// ════════════════════════════════════════════════════════════
// 六、集訓面板接線（假 DOM 真的按那顆「▶ 開打」）
// ════════════════════════════════════════════════════════════
// ★ 量測位置 ★ 這一段跑的是正式的 `showTrainingCamp`——UI 守衛要用假 DOM 真按鈕
// 驗接線，源碼掃描驗不到（2026-08-09 屆間養成卷的教訓）。
function fakeDom() {
  const make = (tag = 'div') => ({
    tag,
    style: { cssText: '' },
    textContent: '',
    value: '',
    dataset: {},
    children: [],
    handlers: {},
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() { this.parent?.removeChild(this); },
    addEventListener(ev, fn) { (this.handlers[ev] ||= []).push(fn); },
    removeEventListener(ev, fn) {
      this.handlers[ev] = (this.handlers[ev] ?? []).filter((f) => f !== fn);
    },
    // 債清批 2026-08-26：照真實 DOM 語意帶參數（原版丟參數＝replaceChildren(card) 內容憑空消失）
    replaceChildren(...nodes) { this.children = []; for (const n of nodes) this.appendChild(n); },
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 100, height: 100, bottom: 0, right: 0 };
    },
  });
  globalThis.document = {
    createElement: (t) => make(t),
    createTextNode: (t) => ({ textContent: t }),
    body: make('body'),
    head: make('head'),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    innerWidth: 400,
    innerHeight: 700,
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 0; };
}
const tap = (node) => {
  for (const fn of [...(node.handlers?.pointerdown ?? [])]) fn({ stopPropagation() {} });
};
const walk = (node, out = []) => {
  out.push(node);
  for (const c of node.children ?? []) walk(c, out);
  return out;
};
const findByText = (root, re) => walk(root).find((n) => re.test(n.textContent ?? ''));
const allText = (root) => walk(root).map((n) => n.textContent ?? '').join('｜');
const settle = () => new Promise((r) => { setTimeout(r, 0); });

async function openCamp(opts) {
  fakeDom();
  const { showTrainingCamp } = await import('../src/ui/trainingCamp.js');
  const rec = { doneCalls: 0, player: null, practiceCalls: 0 };
  showTrainingCamp({
    members: [], techPending: false, techNames: [],
    ...opts,
    onDone: (p) => { rec.doneCalls += 1; rec.player = p; },
    onPractice: opts.onPractice === null ? null : () => { rec.practiceCalls += 1; },
  });
  await settle();
  const overlay = document.body.children[0];
  for (let i = 0; i < 10 && !findByText(overlay, /結束集訓/); i += 1) {
    tap(overlay);
    await settle();
  }
  assert.ok(findByText(overlay, /結束集訓/), '開場演出之後必須走到選擇面板');
  return { overlay, rec };
}

const campPlayer = () => createCareerPlayer('小夢', { seed: 7 });

test('集訓面板：有「🏐 紅白對抗賽」格、格子文案含科目 label、按「開打」呼叫 onPractice', async () => {
  const drills = drillsFor({
    player: { currentRole: 'outside' }, seasonIndex: 2, techniques: ['tip', 'dive'],
  });
  assert.ok(drills.length >= 2, '這一屆要生得出科目，否則下面驗的是空的');
  const { overlay, rec } = await openCamp({
    player: campPlayer(), seasonIndex: 2, drills, practice: null,
  });
  const text = allText(overlay);
  assert.match(text, /紅白對抗賽/, '★接線★ 集訓面板要真的有這一格');
  for (const d of drills) {
    assert.ok(text.includes(drillDefOf(d).label), `科目文案要列出來：${drillDefOf(d).label}`);
  }
  const go = findByText(overlay, /開打/);
  assert.ok(go, '要有「▶ 開打」鈕');
  tap(go);
  await settle();
  assert.equal(rec.practiceCalls, 1, '按下去必須真的呼叫 onPractice');
  assert.equal(rec.doneCalls, 0, '開打不是結束集訓——不得把集訓成果落檔');
  assert.equal(document.body.children.length, 0, '離場時覆蓋層要收乾淨');
});

test('集訓面板：打完回來 ⇒ 格子顯示 N/總數，開打鈕收起（一屆一場）', async () => {
  const { overlay } = await openCamp({
    player: campPlayer(),
    seasonIndex: 2,
    drills: [DRILL_DEFS.tip, DRILL_DEFS.dive, DRILL_DEFS['basic-middle']],
    practice: { seasonIndex: 2, completed: 2, total: 3, unlockControl: false },
  });
  const text = allText(overlay);
  assert.match(text, /科目完成 2\/3/, '★接線★ 結果要顯示在格子上');
  assert.equal(findByText(overlay, /開打/), undefined, '打完就不給重打');
  assert.match(text, /可挑兩項/, '完成 2 項的獎勵要講出來');
});

test('集訓面板：控球格在 unlockControl 前不可按、後可按（獎勵真的兌現）', async () => {
  const locked = await openCamp({
    player: campPlayer(),
    seasonIndex: 2,
    drills: [DRILL_DEFS.tip],
    practice: { seasonIndex: 2, completed: 1, total: 2, unlockControl: false },
  });
  const lockedBtn = findByText(locked.overlay, /^控球 68/);
  assert.ok(lockedBtn, '控球那格要看得到');
  assert.equal(lockedBtn.disabled, true, '沒解鎖就不能按');
  assert.match(lockedBtn.textContent, /紅白賽/, '按不下去的理由要說對事');

  const open = await openCamp({
    player: campPlayer(),
    seasonIndex: 2,
    drills: [DRILL_DEFS.tip],
    practice: { seasonIndex: 2, completed: 2, total: 2, unlockControl: true },
  });
  const openBtn = findByText(open.overlay, /^控球 68/);
  assert.equal(openBtn.disabled, false, '★核心★ 全完成之後控球格必須真的按得下去');
  tap(openBtn);
  await settle();
  // 全完成＝名額必為 2（unlockControl 蘊含 completed===total≥2），兩項都挑滿才走得掉
  tap(findByText(open.overlay, /^耐力 60/));
  await settle();
  const doneBtn = findByText(open.overlay, /結束集訓/);
  assert.equal(doneBtn.textContent, '▶ 結束集訓', '兩項都挑完就不該再掛提示');
  tap(doneBtn);
  await settle();
  assert.equal(open.rec.doneCalls, 1);
  assert.equal(
    open.rec.player.attributes.control, 68 + CAMP_CONTROL_UNLOCKED.gain,
    '離場帶出去的必須是加過值的球員',
  );
});

test('集訓面板：完成 2 項 ⇒ 屬性特訓真的可以挑兩項（挑一項後另一項仍可按）', async () => {
  const { overlay, rec } = await openCamp({
    player: campPlayer(),
    seasonIndex: 2,
    drills: [DRILL_DEFS.tip],
    practice: { seasonIndex: 2, completed: 2, total: 2, unlockControl: true },
  });
  tap(findByText(overlay, /^耐力 60/));
  await settle();
  const controlBtn = findByText(overlay, /^控球 68/);
  assert.equal(controlBtn.disabled, false, '★核心★ 兩項名額：挑完第一項第二項還要能按');
  tap(controlBtn);
  await settle();
  const third = findByText(overlay, /^耐力 62/);
  assert.equal(third?.disabled, true, '兩項用完就不得再挑第三項');
  tap(findByText(overlay, /結束集訓/));
  await settle();
  assert.equal(rec.doneCalls, 1);
  assert.equal(rec.player.attributes.stamina, 62);
  assert.equal(rec.player.attributes.control, 70);
});

test('★反向★ 集訓面板：沒打紅白賽 ⇒ 只能挑一項、控球格關著', async () => {
  const { overlay } = await openCamp({
    player: campPlayer(), seasonIndex: 2, drills: [DRILL_DEFS.tip], practice: null,
  });
  assert.match(allText(overlay), /可以挑 1 項/);
  tap(findByText(overlay, /^耐力 60/));
  await settle();
  assert.equal(findByText(overlay, /^控球 68/).disabled, true, '一項用完就沒了');
});

test('★反向★ 集訓面板：沒接 onPractice ⇒ 整格不畫（不畫按不下去的鈕）', async () => {
  const { overlay } = await openCamp({
    player: campPlayer(), seasonIndex: 2, drills: [DRILL_DEFS.tip], onPractice: null,
  });
  assert.doesNotMatch(allText(overlay), /紅白對抗賽/);
  // 屬性特訓那項照舊會提醒（那是既有行為）；不得多出一個按不掉的「紅白對抗賽」未完成項
  const doneText = findByText(overlay, /結束集訓/).textContent;
  assert.match(doneText, /屬性特訓/);
  assert.doesNotMatch(doneText, /紅白/, '沒有入口就不得喊「你還沒打」');
});

// ════════════════════════════════════════════════════════════
// 七、真正的入口：從生涯畫面走到紅白賽（跑正式的 createCareerScreen）
// ════════════════════════════════════════════════════════════
// ★ 為什麼上面那節不夠 ★ 第六節驗的是「`showTrainingCamp` 這個元件會不會動」；
// 這一節驗的是「玩家真的走得到那裡」——集訓是由 `renderCareer` 依 `campPending`
// 旗標喚起的，中間隔著 careerScreen 一整層。元件對了但沒被喚起，玩家一樣看不到
// （bquickButton 就是這樣從上線起一次沒出現過）。
async function seededSaveAtSeason2() {
  const { SAVE_KEY } = await import('../src/career/careerStore.js');
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 4242, playerName: '小夢' });
  // teach-call 掛在第 2 屆集訓（moment 'camp'）——標記成已播，讓集訓直接走到選擇面板。
  // 技術補修那一段的流程另有既有測試涵蓋；這一檔要驗的是紅白賽格的接線。
  career.events = ['teach-call'];
  const player = createCareerPlayer('小夢', { seed: career.seed });
  player.techniques = { ...player.techniques, tip: 1, dive: 1, v: 2 };
  player.campPending = 2; // advanceSeason 那一次 RMW 寫下的待辦（集訓還沒做完）
  store.saveCareer(career);
  store.savePlayer(player);
  ensureStarterRoster(store);
  // 屆數推進：正常路徑是 store.advanceSeason()（要賽季結束），這裡是測試治具——
  // 直接改 season.index 後仍走 deserializeSave 的完整驗證，讀出來是合法存檔
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 2;
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  return { storage, store };
}

test('★接線★ 生涯畫面：campPending 的那一屆會自己開集訓，且紅白賽格真的按得到', async () => {
  const { storage } = await seededSaveAtSeason2();
  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const store = mkStore(storage);
  let practiceArgs = null;
  const screen = createCareerScreen(store, {
    primeSlot: () => {},
    onQuick: () => {},
    onPlay: () => {},
    onPractice: (args) => { practiceArgs = args; },
  });
  screen.show('career');
  await settle();

  // 集訓覆蓋層＝掛在 body 上的另一個節點（生涯畫面 root 在它下面）
  const overlay = document.body.children.at(-1);
  for (let i = 0; i < 10 && !findByText(overlay, /結束集訓/); i += 1) {
    tap(overlay);
    await settle();
  }
  assert.ok(findByText(overlay, /結束集訓/), '★核心★ campPending 的那一屆必須自己開集訓');
  assert.match(allText(overlay), /紅白對抗賽/, '★核心★ 集訓面板要有紅白賽格');

  const go = findByText(overlay, /開打/);
  assert.ok(go, '要按得到「▶ 開打」');
  tap(go);
  await settle();
  assert.ok(practiceArgs, '★核心★ 按下去必須把控制權交回 main.js 開比賽');
  assert.equal(practiceArgs.seasonIndex, 2);
  assert.ok(practiceArgs.drills.length >= 2, `科目要生得出來：${practiceArgs.drills.length}`);
  assert.ok(practiceArgs.player, '要帶著主角過去');
  // 科目來自玩家這屆學會的技術（tip／dive）——不是隨便挑的
  const ids = practiceArgs.drills.map((d) => d.id);
  assert.ok(ids.includes('tip') && ids.includes('dive'), `科目對不上學會的技術：${ids}`);
  // 開打不得落任何檔（成果要等集訓 onDone）
  assert.equal(store.loadPlayer().campPending, 2, '開打時待辦旗標要留著——回來才接得回集訓');
  assert.deepEqual(store.loadPractice(),
    { seasonIndex: 0, completed: 0, total: 0, unlockControl: false }, '開打時還沒有成績');
});

test('★接線★ 打完回生涯畫面：集訓自己再開一次，這次控球格是開的', async () => {
  const { storage } = await seededSaveAtSeason2();
  const { createCareerStore: mkStore } = await import('../src/career/careerStore.js');
  const pre = mkStore(storage);
  // 模擬「紅白賽打完並結算」——走的是正式的 settlePracticeMatch
  const drills = [DRILL_DEFS.tip, DRILL_DEFS.dive];
  settlePracticeMatch({
    careerCtx: {
      store: pre,
      career: pre.loadCareer(),
      player: pre.loadPlayer(),
      matchEntry: practiceMatchEntry(2),
      seasonIndex: 2,
      practice: { drills, seasonIndex: 2 },
    },
    game: endedGame([...tipKill(), dive(), dive()]),
    playerId: PID,
    drills,
  });
  assert.equal(pre.loadPractice().unlockControl, true, '前置條件：全科目完成');

  fakeDom();
  const { createCareerScreen } = await import('../src/ui/careerScreen.js');
  const store = mkStore(storage);
  const screen = createCareerScreen(store, {
    primeSlot: () => {}, onQuick: () => {}, onPlay: () => {}, onPractice: () => {},
  });
  screen.show('career');
  await settle();
  const overlay = document.body.children.at(-1);
  for (let i = 0; i < 10 && !findByText(overlay, /結束集訓/); i += 1) {
    tap(overlay);
    await settle();
  }
  const text = allText(overlay);
  assert.match(text, /科目完成 2\/2/, '★核心★ 集訓格要顯示紅白賽結果');
  const controlBtn = findByText(overlay, /^控球 68/);
  assert.equal(controlBtn.disabled, false, '★核心★ 全完成 ⇒ 控球格真的開了');
  assert.equal(findByText(overlay, /開打/), undefined, '一屆一場，打完不給重打');
});
