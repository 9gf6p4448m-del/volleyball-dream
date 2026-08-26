// 職業章 批 1「純函式與資料層」（2026-08-26）
// 驗收＝`docs/kickoffs/acceptance-pro-batch1.md`（A1-A9，動手前凍結）。
// 卷宗＝`docs/kickoffs/pro-chapter-kickoff.md`。
//
// ★ A9（改前紅）留給主對話用 worktree 對照（本檔本身不驗紅）★
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAPTER, normalizeChapter, isPro, isCorporate, enterPro,
  CHAPTER_SEASONS, seasonCapOf, chapterSeasonOf, chapterCompleted, currentTeamName,
} from '../src/career/chapter.js';
import { PRO_TEAMS, proTeamById, proOffersFor, PRO_TIER_LABEL } from '../src/career/proTeams.js';
import { buildProMembers, proStartTrustFor } from '../src/career/proTeam.js';
import { buildCorpMembers, corpRankTrustBonus } from '../src/career/corpTeam.js';
import {
  proRounds, buildProSchedule, proTable, proPointsFor, PRO_PLAYER_ID, PRO_ROUNDS,
  playoffSeedsFrom, buildPlayoffBracket, advancePlayoffToFinal, playoffChampionOf,
  PRO_PLAYOFF_MATCH_IDS, PLAYOFF_ROUND,
} from '../src/career/proSchedule.js';
import {
  advanceSeason, createCareer, recordResult, createCareerPlayer,
} from '../src/career/careerState.js';
import { buildCorpSchedule } from '../src/career/corpSchedule.js';
import { TIER } from '../src/career/admission.js';
import { OUR_TEAM_NAME, buildStarterMembers } from '../src/career/roster.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';

// ════════════════════════════════════════════════════════════════
// A1 章節
// ════════════════════════════════════════════════════════════════
test('A1 normalizeChapter 認得 pro 並保留 enteredAtSeason', () => {
  const out = normalizeChapter({ chapter: { id: 'pro', enteredAtSeason: 9 } });
  assert.deepEqual(out, { id: CHAPTER.PRO, enteredAtSeason: 9 });
  assert.equal(isPro({ id: 'pro', enteredAtSeason: 9 }), true);
});

test('A1b enterPro 純函式、冪等：其餘鍵保留、傳入物件不被改', () => {
  const corpBlock = Object.freeze({
    chapter: Object.freeze({ id: 'corporate', enteredAtSeason: 8 }),
    corp: 'panshi-heavy',
    corpFinaleSettled: true,
  });
  const out = enterPro(corpBlock, 9);
  assert.deepEqual(out.chapter, { id: CHAPTER.PRO, enteredAtSeason: 9 });
  assert.equal(out.corp, 'panshi-heavy', '企業章的 corp 要留著（生涯數據頁還要用）');
  assert.equal(out.corpFinaleSettled, true);
  assert.equal(corpBlock.chapter.id, 'corporate', '純函式：傳入的區塊不得被改');

  const already = { chapter: { id: 'pro', enteredAtSeason: 9 }, pro: 'cangyu-titans' };
  const again = enterPro(already, 99);
  assert.equal(again, already, '已在職業章＝原參考回傳');
  assert.equal(again.chapter.enteredAtSeason, 9, '進章時點不得被第二次呼叫覆寫');
});

test('A1c 職業章年限＝1：進章那一年即末年', () => {
  assert.equal(CHAPTER_SEASONS[CHAPTER.PRO], 1);
  assert.equal(seasonCapOf({ id: 'pro', enteredAtSeason: 9 }), 1);
  assert.equal(chapterSeasonOf({ id: 'pro', enteredAtSeason: 9 }, 9), 1, '全域第 9 屆＝職業第 1 年');
  assert.equal(chapterCompleted({ id: 'pro', enteredAtSeason: 9 }, 9), true, '一年制：第 1 年就是末年');
});

test('A1d currentTeamName：職業分支回職業隊名、缺席回退創隊隊名', () => {
  const ch = { id: 'pro', enteredAtSeason: 9 };
  assert.equal(currentTeamName(ch, null, null, 'tiegu-warlords'), '鐵骨戰王');
  assert.equal(currentTeamName(ch, null, null, null), OUR_TEAM_NAME);
  assert.equal(currentTeamName(ch, null, null, '不存在'), OUR_TEAM_NAME);
  // 企業分支不受第四參數影響
  assert.equal(currentTeamName({ id: 'corporate', enteredAtSeason: 8 }, null, 'panshi-heavy', 'tiegu-warlords'), '磐石重工');
});

// ════════════════════════════════════════════════════════════════
// A3 隊伍表
// ════════════════════════════════════════════════════════════════
const REQUIRED_FIELDS = ['id', 'kit', 'name', 'tier', 'style', 'level', 'attrBias', 'roleBias',
  'trustBias', 'heights', 'squad', 'grades', 'libero', 'liberoGrade', 'ace', 'ai', 'scoutRead'];

test('A3 八隊、欄位同構 corporations.js、id 與球衣主色互異', () => {
  assert.equal(PRO_TEAMS.length, 8);
  const ids = new Set();
  const jerseys = new Set();
  for (const t of PRO_TEAMS) {
    for (const f of REQUIRED_FIELDS) assert.ok(f in t, `${t.id ?? '?'} 缺欄位 ${f}`);
    assert.equal(t.heights.length, 6, `${t.id} heights 要 6 位`);
    assert.equal(t.squad.length, 6, `${t.id} squad 要 6 位`);
    assert.equal(t.grades.length, 6, `${t.id} grades 要 6 位`);
    for (const k of ['slot', 'name', 'title']) assert.ok(k in t.ace, `${t.id} ace 缺 ${k}`);
    for (const k of ['jersey', 'shorts', 'trim', 'libero']) assert.ok(k in t.kit, `${t.id} kit 缺 ${k}`);
    assert.ok([TIER.POWERHOUSE, TIER.MID, TIER.WEAK].includes(t.tier), `${t.id} tier 不合法`);
    assert.equal(t.squad[t.ace.slot], t.ace.name, `${t.id} ace.slot 要指到本人`);
    ids.add(t.id);
    jerseys.add(t.kit.jersey);
  }
  assert.equal(ids.size, 8, '8 個 id 互異');
  assert.equal(jerseys.size, 8, '8 套球衣主色互異');
  assert.ok(Object.keys(PRO_TIER_LABEL).length >= 3);
});

test('A3b scoutRead 全隊非零、只取三檔 {0.85,0.55,0.25}', () => {
  const allowed = new Set([0.85, 0.55, 0.25]);
  for (const t of PRO_TEAMS) {
    assert.ok(t.scoutRead > 0, `${t.id} scoutRead 不得為 0`);
    assert.ok(allowed.has(t.scoutRead), `${t.id} scoutRead 只能是三檔之一，收到 ${t.scoutRead}`);
  }
});

test('A3c 查表慣例與王勝翔伏筆兌現：同季挖角入職業', () => {
  assert.equal(proTeamById('不存在'), null);
  const wang = PRO_TEAMS.find((t) => t.ace?.name === '王勝翔');
  assert.ok(wang, '王勝翔必須是某隊的 ace（企業章 qingkong-aero ace 的職業章延續）');
  assert.equal(wang.tier, TIER.POWERHOUSE, '拍板：最強隊階某隊 ace');
  assert.equal(wang.squad[wang.ace.slot], '王勝翔');
  assert.equal(wang.ace.title, '制空者', '頭銜沿用（同一個人的伏筆收束）');
});

// ════════════════════════════════════════════════════════════════
// A4 名冊
// ════════════════════════════════════════════════════════════════
const shapeOf = (m) => [...Object.keys(m)].filter((k) => k !== 'title').sort().join(',');

test('A4 八隊名冊：長度、欄位鍵集合同企業版、決定論', () => {
  const corpShape = buildCorpMembers('qingkong-aero').map(shapeOf);
  for (const t of PRO_TEAMS) {
    const members = buildProMembers(t.id);
    assert.equal(members.length, 7, `${t.id}：6 先發＋自由人`);
    members.forEach((m, i) => {
      assert.equal(shapeOf(m), corpShape[i], `${t.id} 第 ${i} 位欄位鍵集合要同企業版`);
    });
    members.slice(0, 6).forEach((m, i) => {
      assert.equal(m.height, t.heights[i], `${t.id} 身高要帶表值`);
      assert.equal(m.fullName, t.squad[i]);
    });
    assert.deepEqual(buildProMembers(t.id), members, `${t.id} 決定論`);
  }
  assert.deepEqual(buildProMembers('不存在'), []);
});

test('A4b proStartTrustFor：隊階起點沿既有表（不另抄數字）', () => {
  for (const t of PRO_TEAMS) {
    assert.ok(Number.isFinite(proStartTrustFor(t)), `${t.id} 起始球權要有值`);
  }
  assert.ok(proStartTrustFor({ tier: TIER.POWERHOUSE }) < proStartTrustFor({ tier: TIER.WEAK }),
    '豪門起點球權要低於新軍（強豪已有王牌，你從地板起）');
});

test('A4c 入章信任加成表（corpRankTrustBonus）對 corpRank 單調不減且非空', () => {
  const ranks = [1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = 0; i < ranks.length - 1; i += 1) {
    assert.ok(corpRankTrustBonus(ranks[i]) >= corpRankTrustBonus(ranks[i + 1]),
      `corpRank ${ranks[i]}（較好）的加成不得小於 ${ranks[i + 1]}（較差）`);
  }
  assert.ok(corpRankTrustBonus(1) > 0, '非空：至少冠軍名次要有非零加成');
  for (const bad of [0, null, undefined, -1, 2.5, 'x']) {
    assert.equal(corpRankTrustBonus(bad), 0, `壞值 ${String(bad)} 照最低給（0），不猜`);
  }
});

// ════════════════════════════════════════════════════════════════
// A5 賽程＋季後賽
// ════════════════════════════════════════════════════════════════
test('A5 玩家 7 場、對手涵蓋其餘七隊、round=pro、決定論', () => {
  for (const t of PRO_TEAMS) {
    const sched = buildProSchedule({ teamId: t.id, seed: 11 });
    assert.equal(sched.length, PRO_ROUNDS, `${t.id} 八隊單循環＝7 場`);
    const opps = new Set(sched.map((m) => m.opponentId));
    assert.equal(opps.size, 7, `${t.id} 對手不得重複`);
    assert.equal(opps.has(t.id), false, `${t.id} 不得排到自己`);
    for (const m of sched) {
      assert.equal(m.round, 'pro');
      assert.equal(m.format, 3);
    }
  }
  assert.deepEqual(
    buildProSchedule({ teamId: 'feiyan-swift', seed: 11 }),
    buildProSchedule({ teamId: 'feiyan-swift', seed: 11 }),
    '同 seed 同賽程',
  );
  assert.deepEqual(buildProSchedule({ teamId: '不存在', seed: 1 }), []);
});

test('A5b proRounds：7 輪、每輪 4 場、每隊每輪都出賽', () => {
  const rounds = proRounds(5);
  assert.equal(rounds.length, 7);
  for (const pairs of rounds) {
    assert.equal(pairs.length, 4, '八隊偶數＝每輪恰 4 場、無輪空');
    const seen = new Set(pairs.flat());
    assert.equal(seen.size, 8, '每隊每輪都要出賽一次');
  }
});

test('A5c 勝點制逐值：2-0=3／2-1=2／1-2=1／0-2=0', () => {
  assert.equal(proPointsFor(2, 0), 3);
  assert.equal(proPointsFor(2, 1), 2);
  assert.equal(proPointsFor(1, 2), 1);
  assert.equal(proPointsFor(0, 2), 0);
});

test('A5d proTable：已知結果的積分逐值＋八隊名次表', () => {
  const teamId = 'chunyang-newstars';
  const sched = buildProSchedule({ teamId, seed: 3 });
  const scores = [[2, 0], [2, 1], [1, 2], [0, 2]];
  const results = sched.slice(0, 4).map((m, i) => ({
    matchId: m.id, scoreFor: scores[i][0], scoreAgainst: scores[i][1], gp: 3,
  }));
  const board = proTable({ teamId, seed: 3, schedule: sched, results });
  assert.equal(board.table.length, 8, '積分表要有八隊');
  const me = board.table.find((r) => r.id === PRO_PLAYER_ID);
  assert.equal(me.points, 6, '勝點逐值：3+2+1+0');
  assert.equal(me.wins, 2);
  assert.equal(me.losses, 2);
  assert.equal(me.played, 4);
  assert.equal(board.complete, false, '打到一半不算完賽');
  const others = board.table.filter((r) => r.id !== PRO_PLAYER_ID);
  assert.ok(others.some((r) => r.played > 0), '對手互戰要被結算，否則名次無意義');
});

test('A5e 高中/大學/企業賽程模組零改動（防手滑動到範本檔）', () => {
  const sched = buildProSchedule({ teamId: 'cangyu-titans', seed: 1 });
  assert.ok(sched.every((m) => m.round !== 'league' && m.round !== 'corp'),
    'pro 賽程不得冒用大學／企業的 round 標記');
});

// ---- 季後賽 bracket（本批新增，企業章沒有）----
function fullTableFor(teamId, seed) {
  const sched = buildProSchedule({ teamId, seed });
  const results = sched.map((m, i) => ({
    matchId: m.id, scoreFor: i % 3 === 0 ? 1 : 2, scoreAgainst: i % 3 === 0 ? 2 : 0, gp: 3,
  }));
  return proTable({ teamId, seed, schedule: sched, results }).table;
}

test('A5f playoffSeedsFrom：名次表前四名依序取 id、不足 4 隊回 null', () => {
  const table = fullTableFor('feiyan-swift', 7);
  const seeds = playoffSeedsFrom(table);
  assert.equal(seeds.length, 4);
  assert.deepEqual(seeds, table.slice(0, 4).map((r) => r.id));
  assert.equal(playoffSeedsFrom(table.slice(0, 3)), null, '不足 4 隊＝資料還沒打完，不猜');
  assert.equal(playoffSeedsFrom(null), null);
  assert.equal(playoffSeedsFrom([]), null);
});

test('A5g buildPlayoffBracket：1v4、2v3 種子制準決賽', () => {
  const seeds = ['a', 'b', 'c', 'd'];
  const bracket = buildPlayoffBracket(seeds);
  assert.equal(bracket.round, PLAYOFF_ROUND.SEMI);
  assert.equal(bracket.matches.length, 2);
  assert.deepEqual(bracket.matches[0], {
    id: PRO_PLAYOFF_MATCH_IDS.SEMI_1, seedHome: 1, seedAway: 4, home: 'a', away: 'd', format: 3,
  });
  assert.deepEqual(bracket.matches[1], {
    id: PRO_PLAYOFF_MATCH_IDS.SEMI_2, seedHome: 2, seedAway: 3, home: 'b', away: 'c', format: 3,
  });
  assert.equal(buildPlayoffBracket(['a', 'b', 'c']), null, '種子數不對＝不猜');
  assert.equal(buildPlayoffBracket(null), null);
});

test('A5h advancePlayoffToFinal＋playoffChampionOf：純函式推進鏈', () => {
  const bracket = buildPlayoffBracket(['a', 'b', 'c', 'd']);
  // 準決賽只打完一場：不得產生決賽（不猜晉級者）
  const partial = [{ matchId: PRO_PLAYOFF_MATCH_IDS.SEMI_1, winnerId: 'a' }];
  assert.equal(advancePlayoffToFinal(bracket, partial), null);

  const semiResults = [
    { matchId: PRO_PLAYOFF_MATCH_IDS.SEMI_1, winnerId: 'a' },
    { matchId: PRO_PLAYOFF_MATCH_IDS.SEMI_2, winnerId: 'c' },
  ];
  const final = advancePlayoffToFinal(bracket, semiResults);
  assert.equal(final.round, PLAYOFF_ROUND.FINAL);
  assert.deepEqual(final.matches[0], { id: PRO_PLAYOFF_MATCH_IDS.FINAL, home: 'a', away: 'c', format: 3 });

  assert.equal(playoffChampionOf(final, []), null, '決賽未打完不猜冠軍');
  const champion = playoffChampionOf(final, [{ matchId: PRO_PLAYOFF_MATCH_IDS.FINAL, winnerId: 'c' }]);
  assert.equal(champion, 'c');

  // 型別守衛：吃錯 round 的 bracket 一律 null
  assert.equal(advancePlayoffToFinal(final, semiResults), null, 'final bracket 不是 semi，不得誤推進');
  assert.equal(playoffChampionOf(bracket, []), null, 'semi bracket 不是 final，不得誤判冠軍');
});

// ════════════════════════════════════════════════════════════════
// A6 挖角集合：單調＋非空
// ════════════════════════════════════════════════════════════════
test('A6 名次越好集合只增不減、任何輸入非空', () => {
  const idsOf = (r) => new Set(proOffersFor(r).map((t) => t.id));
  const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 0; i < ranks.length - 1; i += 1) {
    const better = idsOf(ranks[i]);
    const worse = idsOf(ranks[i + 1]);
    for (const id of worse) assert.ok(better.has(id), `rank ${ranks[i]} 的集合要涵蓋 rank ${ranks[i + 1]}（單調）`);
  }
  for (const bad of [0, null, undefined, -1, 2.5, 'x']) {
    assert.ok(proOffersFor(bad).length > 0, `壞值 ${String(bad)} 也要有保底隊`);
  }
  // 階梯本身（屬提案數字，凍結的是性質；這裡順帶釘住現值，改提案時一併改這裡）
  assert.equal(proOffersFor(1).length, 8, '冠亞軍三階全開＝八隊都邀');
  assert.equal(proOffersFor(4).length, 6, '四強以上＝中堅 3＋新軍 3');
  assert.equal(proOffersFor(9).length, 3, '後段＝新軍 3');
});

// ════════════════════════════════════════════════════════════════
// A7 高中 advanceSeason 守衛擴充
// ════════════════════════════════════════════════════════════════
test('A7 高中已收束＋混入 pro 場次：advanceSeason 必須 no-op（守衛的鑑別 fixture）', () => {
  let c = createCareer({ seed: 13, playerName: '小夢' });
  for (const m of c.schedule) {
    c = recordResult(c, {
      matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 25, scoreAgainst: 20,
    });
  }
  const proMatches = buildProSchedule({ teamId: 'moye-outlaws', seed: 9 });
  const hybrid = { ...c, schedule: [...c.schedule, proMatches[0]] };
  assert.equal(advanceSeason(hybrid), hybrid, '賽程含 pro 場次＝職業章存檔，不得被高中推進蓋掉');
});

test('A7b 純 pro 賽程同樣 no-op（兩版皆綠的顯式守衛條，同 corp 慣例）', () => {
  const base = createCareer({ seed: 9, playerName: '小夢' });
  const schedule = buildProSchedule({ teamId: 'moye-outlaws', seed: 9 });
  const results = schedule.map((m, i) => ({
    matchId: m.id, scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
  }));
  const career = { ...base, schedule, results };
  assert.equal(advanceSeason(career), career, '職業章不得進高中的屆間推進');
});

test('A7c 純 corp 賽程仍不受 pro 新增分支影響（回歸）', () => {
  const base = createCareer({ seed: 21, playerName: '小夢' });
  const schedule = buildCorpSchedule({ corpId: 'lvyuan-foods', seed: 21 });
  const results = schedule.map((m, i) => ({
    matchId: m.id, scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
  }));
  const career = { ...base, schedule, results };
  assert.equal(advanceSeason(career), career, '企業章守衛回歸：不因新增 pro 分支而失效');
});

// ════════════════════════════════════════════════════════════════
// A2 企業收束：settleCorpFinale＋corpFinaleSettled
// ════════════════════════════════════════════════════════════════
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** 已升學的存檔（沿企業卷 corp-entry.test.mjs 的 fixture 手法）。 */
function uniSave(schoolId) {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 101, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  return storage;
}

/** 走完大學一年＋大學名次封存（陽春版：只需要 university league 有結果即可推進）。 */
function playRoundRobin(storage, round) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: games.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

/** 走完大學四年＋謝幕結算的存檔（全程正式鏈）。 */
function settledUniSave(schoolId = 'meixi') {
  const storage = uniSave(schoolId);
  const store = createCareerStore(storage);
  for (let y = 1; y < 4; y += 1) {
    playRoundRobin(storage, 'league');
    assert.ok(store.advanceSeason(), `fixture 前提：第 ${y} 年屆間推進成功`);
  }
  playRoundRobin(storage, 'league'); // U4 打滿
  assert.ok(store.settleUniFinale(), 'fixture 前提：U4 結算成功');
  return storage;
}

/** 簽入企業隊＋打滿企業那一季（尚未結算）。 */
function corpSaveInProgress(corpId = 'chaoxi-marine', schoolId = 'meixi') {
  const storage = settledUniSave(schoolId);
  const store = createCareerStore(storage);
  assert.ok(store.enterCorporate(corpId), 'fixture 前提：入企業章成功');
  return storage;
}

/** 企業季打滿＋settleCorpFinale 已結算的存檔（批 1 測試的正式輸入）。 */
function settledCorpSave(corpId = 'chaoxi-marine', schoolId = 'meixi') {
  const storage = corpSaveInProgress(corpId, schoolId);
  const store = createCareerStore(storage);
  playRoundRobin(storage, 'corp');
  assert.ok(store.settleCorpFinale(), 'fixture 前提：企業季結算成功');
  return storage;
}

test('A2 settleCorpFinale：封存筆含 corpRank（不得用 uniRank 鍵名）＋旗標同一次到位', () => {
  const storage = settledCorpSave();
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  const last = save.career.seasons.at(-1);
  assert.ok(Number.isInteger(last.corpRank) && last.corpRank >= 1, '最後一筆要帶 corpRank');
  assert.equal('uniRank' in last, false, '企業季的封存筆不得帶 uniRank 鍵名（批 3 覆審地雷）');
  assert.equal(last.corp, 'chaoxi-marine');
  assert.equal(save.career.corpFinaleSettled, true);
  assert.equal(createCareerStore(storage).corpFinaleSettled(), true);
});

test('A2b 未打完（企業季中）：拒絕結算、存檔逐位元不動', () => {
  const storage = corpSaveInProgress();
  const before = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).settleCorpFinale(), false);
  assert.equal(storage.getItem(SAVE_KEY), before);
});

test('A2c 非企業章（大學章存檔）：拒絕結算', () => {
  const storage = settledUniSave();
  const before = storage.getItem(SAVE_KEY);
  const store = createCareerStore(storage);
  assert.equal(isCorporate(store.loadChapter()), false, 'fixture 前提：仍在大學章');
  assert.equal(store.settleCorpFinale(), false);
  assert.equal(storage.getItem(SAVE_KEY), before);
});

test('A2d 冪等：已結算再呼叫一次＝no-op，不重複封存', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(store.settleCorpFinale(), false);
  assert.equal(storage.getItem(SAVE_KEY), before, '已結算過＝存檔不得再變動');
});

test('A2e corpFinaleSettled 讀取：未結算恆 false', () => {
  const storage = corpSaveInProgress();
  assert.equal(createCareerStore(storage).corpFinaleSettled(), false);
});
