// 職業章 批 2「入章接線」（2026-08-26，store/純函式層）
// 驗收＝docs/kickoffs/acceptance-pro-batch2.md（B1/B4/B5/B6，動手前凍結）。
// 卷宗＝docs/kickoffs/pro-chapter-kickoff.md。
// DOM 接線（B2/B3/B7 行為級）另見 tests/pro-entry-wiring.test.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import {
  createCareer, createCareerPlayer, matchOpponentDef, opponentName, careerMatchSetup,
  deserializeCareer, serializeCareer,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { PRO_TEAMS, proTeamById, proOffersFor } from '../src/career/proTeams.js';
import { isPro } from '../src/career/chapter.js';
import { kitFor } from '../src/career/teamKit.js';
import { devProRequest, advanceToPro, DEV_PRO_PARAM } from '../src/career/devSeed.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** 已升學的存檔（沿 pro-batch1.test.mjs 的 fixture 手法，同源避免替身漂移）。 */
function uniSave(schoolId = 'meixi') {
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

function settledUniSave(schoolId = 'meixi') {
  const storage = uniSave(schoolId);
  const store = createCareerStore(storage);
  for (let y = 1; y < 4; y += 1) {
    playRoundRobin(storage, 'league');
    assert.ok(store.advanceSeason(), `fixture 前提：第 ${y} 年屆間推進成功`);
  }
  playRoundRobin(storage, 'league');
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

/** 企業季打滿＋settleCorpFinale 已結算的存檔（B1 的正式輸入）。 */
function settledCorpSave(corpId = 'chaoxi-marine', schoolId = 'meixi') {
  const storage = corpSaveInProgress(corpId, schoolId);
  const store = createCareerStore(storage);
  playRoundRobin(storage, 'corp');
  assert.ok(store.settleCorpFinale(), 'fixture 前提：企業季結算成功');
  return storage;
}

// ════════════════════════════════════════════════════════════════
// B1 enterPro RMW
// ════════════════════════════════════════════════════════════════
test('B1 enterPro：同一次 RMW 寫齊名冊/球權/賽程/屆數/章節', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  const beforeSeason = store.seasonIndex();
  const ok = store.enterPro('cangyu-titans');
  assert.equal(ok, true);
  assert.equal(store.loadChapter().id, 'pro');
  assert.equal(store.loadPro(), 'cangyu-titans');
  assert.equal(store.seasonIndex(), beforeSeason + 1);
  const roster = store.loadRoster();
  assert.equal(roster.members.length, 7, '6 先發＋自由人');
  assert.ok(roster.members.every((m) => m.origin === 'pro:cangyu-titans'));
  const career = store.loadCareer();
  assert.equal(career.schedule.length, 7, '八隊單循環＝7 場');
  assert.ok(career.schedule.every((m) => m.round === 'pro'));
  assert.equal(career.results.length, 0, '新賽季戰績歸零');
  const lineup = store.loadLineup();
  assert.ok(lineup.starters?.length, '先發要重排（同 enterCorporate 慣例）');
  // 企業名冊封存（比照 uniRoster：不隨行，生涯數據頁還看得到）
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  assert.ok(raw.career.corpRoster?.members?.length > 0, '企業名冊要封存');
  assert.equal(raw.career.corp, 'chaoxi-marine', '企業章的 corp 要留著（生涯數據頁還要用）');
  assert.equal(raw.career.corpFinaleSettled, true, '企業結算旗標要留著');
});

test('B1b enterPro：非企業謝幕已結算的存檔一律拒絕（守衛）', () => {
  const storage = corpSaveInProgress(); // 企業季未結算
  const store = createCareerStore(storage);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(store.enterPro('cangyu-titans'), false);
  assert.equal(storage.getItem(SAVE_KEY), before, '拒絕時存檔逐位元不動');
});

test('B1c enterPro：壞隊 id 不猜、不入章', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(store.enterPro('不存在'), false);
  assert.equal(store.enterPro(null), false);
  assert.equal(storage.getItem(SAVE_KEY), before);
});

test('B1d enterPro：冪等——已入章再呼叫不覆寫已簽的隊', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  assert.ok(store.enterPro('cangyu-titans'));
  const again = store.enterPro('tiegu-warlords');
  assert.equal(again, false, '已在職業章＝no-op');
  assert.equal(store.loadPro(), 'cangyu-titans', '不得被第二次呼叫覆寫');
});

test('B1e enterPro：寫入失敗誠實回報不假成功（企業章批 4 HIGH 教訓）', () => {
  const storage = settledCorpSave();
  const failing = {
    getItem: storage.getItem,
    setItem: () => { throw new Error('quota'); },
    removeItem: storage.removeItem,
  };
  const store = createCareerStore(failing);
  assert.equal(store.enterPro('cangyu-titans'), false, '寫入失敗要誠實回 false');
  assert.equal(store.loadChapter().id, 'corporate', '失敗時章節不得偷偷推進');
});

test('B1f 球權：隊階起點＋corpRank 加成同一次到位（不歸零重設）', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  const rawBefore = JSON.parse(storage.getItem(SAVE_KEY));
  const corpRank = rawBefore.career.seasons.at(-1).corpRank;
  assert.ok(Number.isInteger(corpRank) && corpRank >= 1, 'fixture 前提：企業季已封存 corpRank');
  assert.ok(store.enterPro('cangyu-titans'));
  const player = store.loadPlayer();
  assert.ok(Number.isFinite(player.trust.fromSetter), '球權要有值');
  assert.ok(player.trust.floorShare === rawBefore.player.trust.floorShare,
    'floorShare（球權保底）與章節無關，不得被動到');
});

test('B1g proOffers：值從封存的 corpRank 來（單一讀取點，不接受呼叫端外帶 rank）', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  const corpRank = raw.career.seasons.at(-1).corpRank;
  const offers = store.proOffers();
  assert.ok(offers.length > 0);
  assert.ok(offers.every((t) => PRO_TEAMS.some((p) => p.id === t.id)));
  // 直接呼叫 proOffersFor(corpRank) 應與 store.proOffers() 一致（同一份真相源，
  // UI 不得自己拿 rank 當參數去呼叫——招募替代路徑卷教訓）
  assert.deepEqual(offers.map((t) => t.id), proOffersFor(corpRank).map((t) => t.id));
});

test('B1h loadPro：沒簽＝null；查得到才算數（同 loadCorp 慣例）', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  assert.equal(store.loadPro(), null);
  assert.ok(store.enterPro('cangyu-titans'));
  assert.equal(store.loadPro(), 'cangyu-titans');
});

// ════════════════════════════════════════════════════════════════
// B4 多表 fallback 鏈（分母清單，逐項對應 careerScreen.js/careerState.js 的修補）
// ════════════════════════════════════════════════════════════════
test('B4-1 matchOpponentDef：職業隊查表直接回資料表（不套 applySeasonRoster）', () => {
  const def = matchOpponentDef('cangyu-titans', 5);
  assert.equal(def, proTeamById('cangyu-titans'));
});

test('B4-2 opponentName：職業隊名字查得到（第四張表）', () => {
  assert.equal(opponentName('cangyu-titans'), '蒼羽泰坦');
  assert.equal(opponentName('不存在的id'), '不存在的id', '查無則原樣回傳 id（既有慣例）');
});

test('B4-3 careerMatchSetup：pro 參數餵入時 A 面穿球隊 kit（優先序在 corp 之前）', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  assert.ok(store.enterPro('cangyu-titans'));
  const career = store.loadCareer();
  const player = store.loadPlayer();
  const roster = store.loadRoster();
  const lineup = store.loadLineup();
  const cfg = careerMatchSetup(
    career, player, career.schedule[0], roster, lineup, 1, null, null, 'cangyu-titans',
  );
  assert.deepEqual(cfg.kits.A, kitFor(proTeamById('cangyu-titans')), 'A 面要穿球隊 kit');
});

test('B4-4 deserializeCareer：schedule 只含職業隊對手時不得 throw（第四張表漏掉的話整份存檔讀不回來）', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  assert.ok(store.enterPro('cangyu-titans'));
  const career = store.loadCareer();
  assert.doesNotThrow(() => deserializeCareer(serializeCareer(career)));
  // 更直接的回歸：透過第二個 store 實例整份讀回（走 loadSave→careerViewOf→deserializeCareer
  // 那條真實路徑，不是重建的模型）
  const store2 = createCareerStore(storage);
  assert.ok(store2.loadCareer(), '整份存檔要讀得回來，不得 throw');
});

// ════════════════════════════════════════════════════════════════
// B5 治具：?devpro=<隊id>
// ════════════════════════════════════════════════════════════════
test('B5-1 devProRequest：合法隊 id 才啟動，壞值回 null（不猜）', () => {
  assert.equal(DEV_PRO_PARAM, 'devpro');
  const good = new URLSearchParams('devpro=cangyu-titans');
  assert.deepEqual(devProRequest(good), { teamId: 'cangyu-titans' });
  const bad = new URLSearchParams('devpro=不存在');
  assert.equal(devProRequest(bad), null);
  assert.equal(devProRequest(new URLSearchParams('')), null);
});

test('B5-2 advanceToPro：走正式鏈（企業季合成戰績→settleCorpFinale→enterPro）', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 55, playerName: '治具' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('治具', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  const ok = advanceToPro(store, { teamId: 'moye-outlaws' });
  assert.equal(ok, true);
  assert.equal(store.loadChapter().id, 'pro');
  assert.equal(store.loadPro(), 'moye-outlaws');
  assert.equal(store.loadCareer().schedule.every((m) => m.round === 'pro'), true);
});

test('B5-3 advanceToPro：壞隊 id＝中途失敗回 false（不半吊子續跑到底假裝成功）', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 56, playerName: '治具' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('治具', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  assert.equal(advanceToPro(store, { teamId: '不存在' }), false);
  assert.notEqual(store.loadChapter().id, 'pro', '入章失敗＝仍停在企業章');
});

// ════════════════════════════════════════════════════════════════
// 回歸：isPro 章節守衛（批 1 已鋪，批 2 不得動到）
// ════════════════════════════════════════════════════════════════
test('回歸：settleCorpFinale 之後 chapter 仍為 corporate，直到 enterPro 才變 pro', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  assert.equal(isPro(store.loadChapter()), false);
  assert.ok(store.enterPro('cangyu-titans'));
  assert.equal(isPro(store.loadChapter()), true);
});

// ════════════════════════════════════════════════════════════════
// 批 2 覆審 MEDIUM 修：甩開句對職業對手也適用（反制迴路兩端對稱）
// 改前紅：round 閘鎖 'corp' 時本測回空陣列（賽前被盯警示已顯示、賽後回饋恆缺）
// ════════════════════════════════════════════════════════════════
test('覆審M修 職業賽後甩開句：躲開被盯線（<冷線、樣本≥6）在 round=pro 也給', async () => {
  const { corpShakeOffEvents } = await import('../src/career/corpEvents.js');
  const { createCareer } = await import('../src/career/careerState.js');
  const { buildProSchedule } = await import('../src/career/proSchedule.js');
  const base = createCareer({ seed: 9, playerName: '夢' });
  const schedule = buildProSchedule({ teamId: 'cangyu-titans', seed: 9 });
  const entry = schedule[0];
  const oppId = entry.opponentId;
  // 聚合被盯線＝line（另一隊的歷史紀錄撐聚合）；本場對手紀錄＝整場躲開 line
  const career = {
    ...base,
    schedule,
    events: [],
    results: [{ matchId: entry.id, opponentId: oppId, won: true, scoreFor: 2, scoreAgainst: 0 }],
    scouting: {
      'sky-hawk': { zones: { line: 20, cross: 6, middle: 2, tip: 2 } },
      [oppId]: { zones: { line: 0, cross: 6, middle: 3, tip: 1 } },
    },
  };
  assert.equal(entry.round, 'pro', '治具前提：職業賽程場次帶 round=pro');
  assert.ok(proTeamById(oppId)?.scoutRead > 0, '治具前提：職業對手有讀取強度');
  const evs = corpShakeOffEvents(career);
  assert.equal(evs.length, 1, '職業章的甩開回饋不得恆缺（反制迴路兩端要對稱）');
  assert.match(evs[0].lines[0].text, /直線/);
  assert.equal(typeof evs[0].lines[0].speaker, 'string', 'dialogPlay 契約：{speaker,text}');
  // 對照：被盯線照打＝不給（判準本體沒被放寬）
  const miss = {
    ...career,
    scouting: { ...career.scouting, [oppId]: { zones: { line: 6, cross: 3, middle: 1, tip: 0 } } },
  };
  assert.deepEqual(corpShakeOffEvents(miss), []);
});
