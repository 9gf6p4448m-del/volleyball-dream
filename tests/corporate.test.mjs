// 成人/企業章 批 1「純函式與資料層」（2026-08-25）
// 驗收＝`docs/kickoffs/acceptance-corp-batch1.md`（A1-1～A1-8，動手前凍結 e662d43）。
//
// ★ A1-3 的反向探針依 §2.1 例外修正過 ★ 原凍結文寫 `chapterCompleted(corp, 7)===false`，
// 但 `chapterSeasonOf` 對「seasonIndex < enteredAtSeason」**設計上**夾到第 1 年
//（`chapter.js`：壞存檔不猜、保守回退）⇒ 年限 1 的章任何輸入都是「已達末年」，
// 該條**無論實作對錯都不可能通過**＝無鑑別力。修正後的反向探針＝大學章年中不得誤判
// 已完（確認 completed 邏輯不是恆真）；修正紀錄見驗收檔 A1-3 附註。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAPTER, normalizeChapter, isCorporate, isUniversity, enterCorporate,
  CHAPTER_SEASONS, seasonCapOf, chapterSeasonOf, chapterCompleted, currentTeamName,
} from '../src/career/chapter.js';
import { CORPORATIONS, corporationById, corpOffersFor, CORP_TIER_LABEL } from '../src/career/corporations.js';
import { buildCorpMembers } from '../src/career/corpTeam.js';
import { buildUniMembers } from '../src/career/uniTeam.js';
import {
  corpRounds, buildCorpSchedule, corpTable, corpPointsFor, CORP_PLAYER_ID, CORP_ROUNDS,
} from '../src/career/corpSchedule.js';
import {
  advanceSeason, createCareer, recordResult, matchOpponentDef, seasonConcluded,
  careerMatchSetup, createCareerPlayer,
} from '../src/career/careerState.js';
import { resolveMatchConfig } from '../src/app/matchConfig.js';
import { TIER } from '../src/career/admission.js';
import { OUR_TEAM_NAME } from '../src/career/roster.js';

// ════════════════════════════════════════════════════════════════
// A1-1 章節狀態機認得企業章
// ════════════════════════════════════════════════════════════════
test('A1-1 normalizeChapter 認得 corporate 並保留 enteredAtSeason', () => {
  const out = normalizeChapter({ chapter: { id: 'corporate', enteredAtSeason: 8 } });
  assert.deepEqual(out, { id: CHAPTER.CORPORATE, enteredAtSeason: 8 });
  assert.equal(isCorporate({ id: 'corporate', enteredAtSeason: 8 }), true);
});

test('A1-1b 未知章節值仍回退高中（既有回退不被 corporate 的加入弄壞）', () => {
  // ★職業章批 1（2026-08-26）修正★ 原本用 'pro' 當「未知值」範例——它現在是
  // `CHAPTER.PRO` 這個真實章節 id（acceptance-pro-batch1.md A1 明訂要被 normalizeChapter
  // 認得），繼續拿它當「未知」範例本身就是錯的斷言，與新章節的存在互斥，不是實作錯。
  // 換一個確定非章節 id 的字串（'legacy'）保留同一條行為斷言：認不得的值仍回退高中。
  for (const bad of ['legacy', 'CORPORATE', 42, null]) {
    assert.equal(normalizeChapter({ chapter: { id: bad, enteredAtSeason: 8 } }).id, CHAPTER.HIGH_SCHOOL);
  }
});

// ════════════════════════════════════════════════════════════════
// A1-2 enterCorporate 純函式
// ════════════════════════════════════════════════════════════════
test('A1-2 從大學章進企業章：其餘鍵保留、傳入物件不被改', () => {
  const uniBlock = Object.freeze({
    chapter: Object.freeze({ id: 'university', enteredAtSeason: 4 }),
    school: 'north-ridge',
    finaleSettled: true,
  });
  const out = enterCorporate(uniBlock, 8);
  assert.deepEqual(out.chapter, { id: CHAPTER.CORPORATE, enteredAtSeason: 8 });
  assert.equal(out.school, 'north-ridge', '大學的 school 要留著（生涯數據頁還要用）');
  assert.equal(out.finaleSettled, true);
  assert.equal(uniBlock.chapter.id, 'university', '純函式：傳入的區塊不得被改');
});

test('A1-2b 冪等：已在企業章原樣回傳、enteredAtSeason 不被覆寫', () => {
  const block = { chapter: { id: 'corporate', enteredAtSeason: 8 }, corp: 'panshi-heavy' };
  const out = enterCorporate(block, 99);
  assert.equal(out, block, '已在企業章＝原參考回傳');
  assert.equal(out.chapter.enteredAtSeason, 8, '進章時點不得被第二次呼叫覆寫');
});

// ════════════════════════════════════════════════════════════════
// A1-3 年限＝1（§2.1 例外修正版，理由見檔頭）
// ════════════════════════════════════════════════════════════════
test('A1-3 企業章年限 1：進章那一年即末年', () => {
  assert.equal(CHAPTER_SEASONS[CHAPTER.CORPORATE], 1);
  assert.equal(seasonCapOf({ id: 'corporate', enteredAtSeason: 8 }), 1);
  assert.equal(chapterSeasonOf({ id: 'corporate', enteredAtSeason: 8 }, 8), 1, '全域第 8 屆＝企業第 1 年');
  assert.equal(chapterCompleted({ id: 'corporate', enteredAtSeason: 8 }, 8), true, '一年制：第 1 年就是末年');
});

test('A1-3b 反向探針：completed 邏輯不是恆真（大學年中仍是 false）', () => {
  assert.equal(chapterCompleted({ id: 'university', enteredAtSeason: 4 }, 5), false, '大二不得被判已完');
});

// ════════════════════════════════════════════════════════════════
// A1-4 corporations.js 八隊資料表
// ════════════════════════════════════════════════════════════════
const REQUIRED_FIELDS = ['id', 'kit', 'name', 'tier', 'style', 'level', 'attrBias', 'roleBias',
  'trustBias', 'heights', 'squad', 'grades', 'libero', 'liberoGrade', 'ace', 'ai'];

test('A1-4 八隊、欄位同構 universities.js、id 與球衣主色互異', () => {
  assert.equal(CORPORATIONS.length, 8);
  const ids = new Set();
  const jerseys = new Set();
  for (const c of CORPORATIONS) {
    for (const f of REQUIRED_FIELDS) assert.ok(f in c, `${c.id ?? '?'} 缺欄位 ${f}`);
    assert.equal(c.heights.length, 6, `${c.id} heights 要 6 位`);
    assert.equal(c.squad.length, 6, `${c.id} squad 要 6 位`);
    assert.equal(c.grades.length, 6, `${c.id} grades 要 6 位`);
    for (const k of ['slot', 'name', 'title']) assert.ok(k in c.ace, `${c.id} ace 缺 ${k}`);
    for (const k of ['jersey', 'shorts', 'trim', 'libero']) assert.ok(k in c.kit, `${c.id} kit 缺 ${k}`);
    assert.ok([TIER.POWERHOUSE, TIER.MID, TIER.WEAK].includes(c.tier), `${c.id} tier 不合法`);
    ids.add(c.id);
    jerseys.add(c.kit.jersey);
  }
  assert.equal(ids.size, 8, '8 個 id 互異');
  assert.equal(jerseys.size, 8, '8 套球衣主色互異');
  assert.ok(Object.keys(CORP_TIER_LABEL).length >= 3);
});

test('A1-4b 查表慣例與王勝翔伏筆兌現', () => {
  assert.equal(corporationById('不存在'), null);
  const wang = CORPORATIONS.find((c) => c.ace?.name === '王勝翔');
  assert.ok(wang, '王勝翔必須是某隊的 ace（events.js:502「直接挑戰企業聯賽的天空」）');
  assert.equal(wang.tier, TIER.POWERHOUSE, '他挑戰的是「天空」——強豪階');
  assert.equal(wang.squad[wang.ace.slot], '王勝翔', 'ace.slot 要指到他本人');
});

// ════════════════════════════════════════════════════════════════
// A1-5 buildCorpMembers 形狀同 buildUniMembers
// ════════════════════════════════════════════════════════════════
const shapeOf = (m) => [...Object.keys(m)].filter((k) => k !== 'title').sort().join(',');

test('A1-5 八隊名冊：長度、欄位鍵集合同大學版、決定論', () => {
  const uniShape = buildUniMembers('north-ridge').map(shapeOf);
  for (const c of CORPORATIONS) {
    const members = buildCorpMembers(c.id);
    assert.equal(members.length, 7, `${c.id}：6 先發＋自由人`);
    members.forEach((m, i) => {
      assert.equal(shapeOf(m), uniShape[i], `${c.id} 第 ${i} 位欄位鍵集合要同大學版`);
    });
    members.slice(0, 6).forEach((m, i) => {
      assert.equal(m.height, c.heights[i], `${c.id} 身高要帶表值`);
      assert.equal(m.fullName, c.squad[i]);
    });
    assert.deepEqual(buildCorpMembers(c.id), members, `${c.id} 決定論`);
  }
  assert.deepEqual(buildCorpMembers('不存在'), []);
});

// ════════════════════════════════════════════════════════════════
// A1-6 corpSchedule
// ════════════════════════════════════════════════════════════════
test('A1-6 玩家 7 場、對手涵蓋其餘七隊、round=corp、決定論', () => {
  for (const c of CORPORATIONS) {
    const sched = buildCorpSchedule({ corpId: c.id, seed: 11 });
    assert.equal(sched.length, CORP_ROUNDS, `${c.id} 八隊單循環＝7 場`);
    const opps = new Set(sched.map((m) => m.opponentId));
    assert.equal(opps.size, 7, `${c.id} 對手不得重複`);
    assert.equal(opps.has(c.id), false, `${c.id} 不得排到自己`);
    for (const m of sched) {
      assert.equal(m.round, 'corp');
      assert.equal(m.format, 3);
    }
  }
  assert.deepEqual(
    buildCorpSchedule({ corpId: 'chaoxi-marine', seed: 11 }),
    buildCorpSchedule({ corpId: 'chaoxi-marine', seed: 11 }),
    '同 seed 同賽程',
  );
  assert.deepEqual(buildCorpSchedule({ corpId: '不存在', seed: 1 }), []);
});

test('A1-6b corpRounds：7 輪、每輪 4 場、每隊每輪都出賽', () => {
  const rounds = corpRounds(5);
  assert.equal(rounds.length, 7);
  for (const pairs of rounds) {
    assert.equal(pairs.length, 4, '八隊偶數＝每輪恰 4 場、無輪空');
    const seen = new Set(pairs.flat());
    assert.equal(seen.size, 8, '每隊每輪都要出賽一次');
  }
});

test('A1-6c 勝點制逐值：2-0=3／2-1=2／1-2=1／0-2=0', () => {
  assert.equal(corpPointsFor(2, 0), 3);
  assert.equal(corpPointsFor(2, 1), 2);
  assert.equal(corpPointsFor(1, 2), 1);
  assert.equal(corpPointsFor(0, 2), 0);
});

test('A1-6d corpTable：已知結果的積分逐值＋八隊名次表', () => {
  const corpId = 'lvyuan-foods';
  const sched = buildCorpSchedule({ corpId, seed: 3 });
  // 前四場：2-0／2-1／1-2／0-2 ⇒ 玩家勝點恰 3+2+1+0=6、2 勝 2 敗
  const scores = [[2, 0], [2, 1], [1, 2], [0, 2]];
  const results = sched.slice(0, 4).map((m, i) => ({
    matchId: m.id, scoreFor: scores[i][0], scoreAgainst: scores[i][1], gp: 3,
  }));
  const board = corpTable({ corpId, seed: 3, schedule: sched, results });
  assert.equal(board.table.length, 8, '積分表要有八隊');
  const me = board.table.find((r) => r.id === CORP_PLAYER_ID);
  assert.equal(me.points, 6, '勝點逐值：3+2+1+0');
  assert.equal(me.wins, 2);
  assert.equal(me.losses, 2);
  assert.equal(me.played, 4);
  assert.equal(board.complete, false, '打到一半不算完賽');
  // 已結算輪次裡，其他隊也要有場次（互戰有被結算）
  const others = board.table.filter((r) => r.id !== CORP_PLAYER_ID);
  assert.ok(others.some((r) => r.played > 0), '對手互戰要被結算，否則名次無意義');
});

test('A1-6e 高中與大學賽程模組零改動（防手滑動到範本檔）', () => {
  // 行為級對照：大學賽程仍是 8 場 league、高中 buildSchedule 語彙不受影響——
  // 真正的「檔案零改動」由 git diff 在驗收時人工核對（A1-6 凍結條文）。
  const uni = buildCorpSchedule({ corpId: 'qingkong-aero', seed: 1 });
  assert.ok(uni.every((m) => m.round !== 'league'), 'corp 賽程不得冒用大學的 round 標記');
});

// ════════════════════════════════════════════════════════════════
// A1-7 邀約集合：單調＋非空
// ════════════════════════════════════════════════════════════════
test('A1-7 名次越好集合只增不減、任何輸入非空', () => {
  const idsOf = (r) => new Set(corpOffersFor(r).map((c) => c.id));
  const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 0; i < ranks.length - 1; i += 1) {
    const better = idsOf(ranks[i]);
    const worse = idsOf(ranks[i + 1]);
    for (const id of worse) assert.ok(better.has(id), `rank ${ranks[i]} 的集合要涵蓋 rank ${ranks[i + 1]}（單調）`);
  }
  for (const bad of [0, null, undefined, -1, 2.5, 'x']) {
    assert.ok(corpOffersFor(bad).length > 0, `壞值 ${String(bad)} 也要有保底隊`);
  }
  // 階梯本身（屬提案數字，凍結的是性質；這裡順帶釘住現值，改提案時一併改這裡）
  assert.equal(corpOffersFor(1).length, 8, '冠亞軍三階全開＝八隊都邀');
  assert.equal(corpOffersFor(6).length, 6, '中段＝中堅 3＋保底 3');
  assert.equal(corpOffersFor(9).length, 3, '後段＝保底 3');
});

// ════════════════════════════════════════════════════════════════
// A1-8 高中 advanceSeason 守衛擴充
// ════════════════════════════════════════════════════════════════
// ★ 鑑別力說明 ★ 純 corp 賽程的 career 在**舊版**也推不動（seasonConcluded 對 corp
// round 回退 careerStage ＝未收束的意外死鎖——同 C4 記錄的大學版先例「改前靠意外
// 死鎖、改後靠顯式守衛，兩版都必須綠」）。真正能分辨守衛在不在的是下面的混合
// fixture：高中已收束（champion，走 recordResult 真實路徑）＋混入 corp 場次——
// 舊版會真的推進（改前紅已實測），顯式守衛擋下才綠。
test('A1-8 高中已收束＋混入 corp 場次：advanceSeason 必須 no-op（守衛的鑑別 fixture）', () => {
  let c = createCareer({ seed: 11, playerName: '小夢' });
  for (const m of c.schedule) {
    c = recordResult(c, {
      matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 25, scoreAgainst: 20,
    });
  }
  const corpMatches = buildCorpSchedule({ corpId: 'xingqiao-elec', seed: 9 });
  const hybrid = { ...c, schedule: [...c.schedule, corpMatches[0]] };
  assert.equal(advanceSeason(hybrid), hybrid, '賽程含 corp 場次＝企業章存檔，不得被高中推進蓋掉');
});

test('A1-8b 純 corp 賽程同樣 no-op（兩版皆綠的顯式守衛條，同 C4 慣例）', () => {
  const base = createCareer({ seed: 9, playerName: '小夢' });
  const schedule = buildCorpSchedule({ corpId: 'xingqiao-elec', seed: 9 });
  const results = schedule.map((m, i) => ({
    matchId: m.id, scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
  }));
  const career = { ...base, schedule, results };
  assert.equal(advanceSeason(career), career, '企業章不得進高中的屆間推進');
});

// ════════════════════════════════════════════════════════════════
// 批 2 覆審 HIGH 回歸：matchOpponentDef 認得第三張表
// ════════════════════════════════════════════════════════════════
test('matchOpponentDef：企業隊回真實資料表（不落回通用預設隊）', () => {
  for (const c of CORPORATIONS) {
    const def = matchOpponentDef(c.id, 8);
    assert.equal(def, c, `${c.id} 要拿到 corporations.js 那份 def——null 會讓 teams.B 變通用隊`);
  }
  assert.equal(matchOpponentDef('no-such-team', 8), null, '未知 id 照舊 null');
});

// ════════════════════════════════════════════════════════════════
// currentTeamName 企業分支（批 1 只鋪函式）
// ════════════════════════════════════════════════════════════════
test('currentTeamName：企業章給 corp id 回公司名、缺席回退創隊隊名', () => {
  const ch = { id: 'corporate', enteredAtSeason: 8 };
  assert.equal(currentTeamName(ch, null, 'panshi-heavy'), '磐石重工');
  assert.equal(currentTeamName(ch, null, null), OUR_TEAM_NAME);
  assert.equal(currentTeamName(ch, null, '不存在'), OUR_TEAM_NAME);
  // 大學分支不受第三參數影響
  assert.equal(currentTeamName({ id: 'university', enteredAtSeason: 4 }, 'haiyan', 'panshi-heavy'), '海硯大學');
  assert.equal(isUniversity(ch), false);
});

// ════════════════════════════════════════════════════════════════
// 批 3（acceptance-corp-batch3.md）
// ════════════════════════════════════════════════════════════════
const corpResultsFor = (sched, n) => sched.slice(0, n).map((m, i) => ({
  matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
  scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
}));

test('A3-1 seasonConcluded 認得 corp：7/7 true、6/7 false', () => {
  const base = createCareer({ seed: 5, playerName: '小夢' });
  const schedule = buildCorpSchedule({ corpId: 'baigang-precision', seed: 5 });
  assert.equal(seasonConcluded({ ...base, schedule, results: corpResultsFor(schedule, 7) }), true);
  assert.equal(seasonConcluded({ ...base, schedule, results: corpResultsFor(schedule, 6) }), false);
});

test('A3-3 careerMatchSetup 第 8 參數：kits.A＝公司 kit、teams.B＝真對手', () => {
  const career = createCareer({ seed: 5, playerName: '小夢' });
  const schedule = buildCorpSchedule({ corpId: 'lieyang-petro', seed: 5 });
  const player = createCareerPlayer('小夢', { seed: 5 });
  const entry = schedule[0];
  const setup = careerMatchSetup(
    { ...career, schedule, results: [] }, player, entry,
    { capacity: 8, members: buildCorpMembers('lieyang-petro'), alumni: [] },
    null, 8, null, 'lieyang-petro',
  );
  assert.deepEqual(setup.kits.A, corporationById('lieyang-petro').kit, 'A 面穿公司 kit');
  assert.deepEqual(setup.kits.B, corporationById(entry.opponentId).kit, 'B 面穿對手公司 kit');
  // 對照：不給 corp 時 A 面不帶 kit（高中章行為不變）
  const hs = careerMatchSetup(career, player, career.schedule[0]);
  assert.equal(hs.kits.A, undefined);
});

test('A3-3b resolveMatchConfig：企業存檔的 teamName＝公司名', () => {
  const career = createCareer({ seed: 5, playerName: '小夢' });
  const schedule = buildCorpSchedule({ corpId: 'chaoxi-marine', seed: 5 });
  const player = createCareerPlayer('小夢', { seed: 5 });
  const fakeStore = {
    loadChapter: () => ({ id: 'corporate', enteredAtSeason: 8 }),
    loadSchool: () => null,
    loadCorp: () => 'chaoxi-marine',
  };
  const cfg = resolveMatchConfig({
    params: new URLSearchParams(),
    careerCtx: {
      career: { ...career, schedule, results: [] },
      player,
      matchEntry: schedule[0],
      roster: { capacity: 8, members: buildCorpMembers('chaoxi-marine'), alumni: [] },
      lineup: null,
      seasonIndex: 8,
      store: fakeStore,
    },
    randomSeed: 1,
  });
  assert.equal(cfg.teamName, '潮汐海運', '場內 HUD 隊名要是公司名');
  assert.deepEqual(cfg.kits.A, corporationById('chaoxi-marine').kit);
});

// ════════════════════════════════════════════════════════════════
// 批 4（acceptance-corp-batch4.md）純函式層
// ════════════════════════════════════════════════════════════════
import {
  corpPaydayDue, corpAnchorPreEvents, corpClosingLines,
  CORP_PAYDAY_EV, CORP_WANG_INTRO_EV, WANG_TEAM_EXISTS,
} from '../src/career/corpEvents.js';

test('A4-2 corpPaydayDue：2 場起、7/7 不補播、旗標落過不重播', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  const schedule = buildCorpSchedule({ corpId: 'nanfeng-textile', seed: 7 });
  const c = (n, events = []) => ({ ...base, schedule, results: corpResultsFor(schedule, n), events });
  assert.equal(corpPaydayDue(c(0)), false);
  assert.equal(corpPaydayDue(c(1)), false);
  assert.equal(corpPaydayDue(c(2)), true);
  assert.equal(corpPaydayDue(c(6)), true);
  assert.equal(corpPaydayDue(c(7)), false, '賽季打完不補播（結算優先）');
  assert.equal(corpPaydayDue(c(3, [CORP_PAYDAY_EV])), false, '選過不重播');
  assert.equal(corpPaydayDue(base), false, '高中存檔（無 corp 場）不播');
});

test('A4-3 corpAnchorPreEvents：只在首戰擎空航太回台詞', () => {
  const base = createCareer({ seed: 7, playerName: '小夢' });
  assert.ok(WANG_TEAM_EXISTS, '王勝翔的隊 id 要真的在八隊表裡');
  const entry = { id: 'corp-r7', round: 'corp', opponentId: 'qingkong-aero' };
  const evs = corpAnchorPreEvents(base, entry);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].id, CORP_WANG_INTRO_EV);
  // 加嚴（2026-08-26）：line＝{speaker,text} 物件——字串會被 paintLine 畫成空白泡泡
  assert.ok(evs[0].lines.every((l) => typeof l.text === 'string' && typeof l.speaker === 'string'),
    'dialogPlay 契約：每句都要是 {speaker, text}');
  assert.ok(evs[0].lines.some((l) => l.speaker === '王勝翔' || l.text.includes('王勝翔')));
  assert.deepEqual(corpAnchorPreEvents({ ...base, events: [CORP_WANG_INTRO_EV] }, entry), [],
    '播過＝一生一次');
  assert.deepEqual(corpAnchorPreEvents(base, { ...entry, opponentId: 'panshi-heavy' }), []);
  assert.deepEqual(corpAnchorPreEvents(base, { ...entry, round: 'league' }), [],
    'round 守衛：不是企業賽程不播');
});

test('A4-4 corpClosingLines：海外恆點名、簡子嵐條件句', () => {
  const none = corpClosingLines(null);
  assert.equal(none.length, 1);
  assert.ok(none[0].includes('海'), '國外強權點名（海外語意）');
  const withJian = corpClosingLines({ members: [{ fullName: '簡子嵐' }] });
  assert.equal(withJian.length, 2);
  assert.ok(withJian[1].includes('簡子嵐'));
  assert.equal(corpClosingLines({ members: [{ fullName: '別人' }] }).length, 1);
});
