// 職業章 批 3「賽季迴圈＋季後賽＋ATTR_CAP」（2026-08-26，純函式/store 層）
// 驗收＝docs/kickoffs/acceptance-pro-batch3.md（C1–C6，動手前凍結）。
// 卷宗＝docs/kickoffs/pro-chapter-kickoff.md。
// DOM 接線（C1/C5 顯示、C7 真機）另見 tests/pro-batch3-wiring.test.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProSchedule, proTable, growProSchedule, npcPlayoffWinner,
  playoffSeedsFrom, buildPlayoffBracket, PLAYOFF_ROUND, PRO_PLAYER_ID,
} from '../src/career/proSchedule.js';
import {
  createCareer, createCareerPlayer, seasonConcluded,
} from '../src/career/careerState.js';
import { GROWTH, attrCapFor, spendAttribute, PRO_ATTR_CAP } from '../src/career/growth.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { buildCorpSchedule } from '../src/career/corpSchedule.js';
import { buildUniSchedule } from '../src/career/uniSchedule.js';

// ════════════════════════════════════════════════════════════════
// 共用治具：任一 teamId/seed，全勝＝循環第一（保證進四強）；全敗＝循環最後
// （保證不進四強）——經 8 隊實測（見改前紅記錄）：勝點制下 7-0 恆為最高分、
// 7 敗恆為最低分，不會被對手互戰的積分追平／超車。
// ════════════════════════════════════════════════════════════════
const TEAM_ID = 'cangyu-titans';
const SEED = 7;

function leagueSchedule() {
  return buildProSchedule({ teamId: TEAM_ID, seed: SEED });
}
function allWinResults(schedule) {
  return schedule.map((m) => ({ matchId: m.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }));
}
function allLoseResults(schedule) {
  return schedule.map((m) => ({ matchId: m.id, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1 }));
}

// ════════════════════════════════════════════════════════════════
// C2 季後賽推進（純函式，proSchedule.growProSchedule）
// ════════════════════════════════════════════════════════════════
test('C2 前提：7 勝恆進四強（rank 1）、7 敗恆出局（rank 8）——治具的鑑別力基礎', () => {
  const sched = leagueSchedule();
  const win = proTable({ teamId: TEAM_ID, seed: SEED, schedule: sched, results: allWinResults(sched) });
  const lose = proTable({ teamId: TEAM_ID, seed: SEED, schedule: sched, results: allLoseResults(sched) });
  assert.equal(win.playerRank, 1);
  assert.equal(lose.playerRank, 8);
});

test('C2a 循環打滿＋前四 → 長出準決賽，對位＝1v4/2v3 種子正確', () => {
  const sched = leagueSchedule();
  const results = allWinResults(sched);
  const grown = growProSchedule(sched, results, TEAM_ID, SEED);
  assert.notEqual(grown, sched, '應該要長出新場次');
  assert.equal(grown.length, sched.length + 1);
  const semi = grown[grown.length - 1];
  assert.equal(semi.round, PLAYOFF_ROUND.SEMI);
  assert.equal(semi.stage, 'pro');
  assert.equal(semi.format, 3);
  assert.equal(semi.label, '準決賽');
  // 手動重建種子序驗證對位：玩家 rank1（種子1）該對種子4
  const table = proTable({ teamId: TEAM_ID, seed: SEED, schedule: sched, results }).table;
  const seeds = playoffSeedsFrom(table);
  const bracket = buildPlayoffBracket(seeds);
  const mine = bracket.matches.find((m) => m.home === PRO_PLAYER_ID || m.away === PRO_PLAYER_ID);
  assert.equal(mine.seedHome === 1 || mine.seedAway === 1, true, '玩家種子應為 1（rank1）');
  assert.equal(semi.opponentId, mine.home === PRO_PLAYER_ID ? mine.away : mine.home);
});

test('C2a 冪等：已長出準決賽再呼叫一次＝原參考回傳', () => {
  const sched = leagueSchedule();
  const results = allWinResults(sched);
  const grown = growProSchedule(sched, results, TEAM_ID, SEED);
  const again = growProSchedule(grown, results, TEAM_ID, SEED);
  assert.equal(again, grown);
});

test('C2b 循環打滿但未進前四 → 不長場次、賽季就此收束（原參考回傳）', () => {
  const sched = leagueSchedule();
  const results = allLoseResults(sched);
  const grown = growProSchedule(sched, results, TEAM_ID, SEED);
  assert.equal(grown, sched, '未進前四不得長出季後賽場次');
});

test('C2a 準決敗＝單淘汰止步，不長決賽', () => {
  const sched = leagueSchedule();
  const leagueResults = allWinResults(sched);
  const afterSemi = growProSchedule(sched, leagueResults, TEAM_ID, SEED);
  const semi = afterSemi.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  const lostResults = [...leagueResults,
    { matchId: semi.id, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1 }];
  const afterLoss = growProSchedule(afterSemi, lostResults, TEAM_ID, SEED);
  assert.equal(afterLoss, afterSemi, '準決敗不得長出決賽場次');
  assert.equal(afterLoss.some((m) => m.round === PLAYOFF_ROUND.FINAL), false);
});

test('C2a 準決勝＝長出決賽，對手由 advancePlayoffToFinal 純函式決定', () => {
  const sched = leagueSchedule();
  const leagueResults = allWinResults(sched);
  const afterSemi = growProSchedule(sched, leagueResults, TEAM_ID, SEED);
  const semi = afterSemi.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  const wonResults = [...leagueResults,
    { matchId: semi.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }];
  const afterFinal = growProSchedule(afterSemi, wonResults, TEAM_ID, SEED);
  assert.notEqual(afterFinal, afterSemi);
  const final = afterFinal.find((m) => m.round === PLAYOFF_ROUND.FINAL);
  assert.ok(final, '準決勝要長出決賽');
  assert.equal(final.format, 3);
  assert.equal(final.label, '冠軍戰');
  assert.ok(final.opponentId, '決賽對手要決定出來');
  assert.notEqual(final.opponentId, semi.opponentId, '決賽對手應是另一組準決的勝方，不是玩家剛打贏的那隊');
});

test('C2a 決賽冪等：已長出決賽再呼叫一次＝原參考回傳', () => {
  const sched = leagueSchedule();
  const leagueResults = allWinResults(sched);
  const afterSemi = growProSchedule(sched, leagueResults, TEAM_ID, SEED);
  const semi = afterSemi.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  const wonResults = [...leagueResults,
    { matchId: semi.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }];
  const afterFinal = growProSchedule(afterSemi, wonResults, TEAM_ID, SEED);
  const again = growProSchedule(afterFinal, wonResults, TEAM_ID, SEED);
  assert.equal(again, afterFinal);
});

test('C2 循環未打滿：growProSchedule 原參考回傳（不搶跑）', () => {
  const sched = leagueSchedule();
  const partial = allWinResults(sched).slice(0, 6);
  const grown = growProSchedule(sched, partial, TEAM_ID, SEED);
  assert.equal(grown, sched);
});

// ════════════════════════════════════════════════════════════════
// C2c：NPC 側另一組準決決定論（同 seed 同結果；零 sim 依賴）
// ════════════════════════════════════════════════════════════════
test('C2c npcPlayoffWinner：同 seed/tag 同結果（決定論，不呼叫 sim）', () => {
  const w1 = npcPlayoffWinner('tiegu-warlords', 'feiyan-swift', 42, 'npc-semi');
  const w2 = npcPlayoffWinner('tiegu-warlords', 'feiyan-swift', 42, 'npc-semi');
  assert.equal(w1, w2);
  assert.ok(['tiegu-warlords', 'feiyan-swift'].includes(w1));
});

test('C2c 決賽對手（NPC 側勝方）同 seed 兩次計算逐值相同', () => {
  const sched = leagueSchedule();
  const leagueResults = allWinResults(sched);
  const run = () => {
    const afterSemi = growProSchedule(sched, leagueResults, TEAM_ID, SEED);
    const semi = afterSemi.find((m) => m.round === PLAYOFF_ROUND.SEMI);
    const wonResults = [...leagueResults,
      { matchId: semi.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }];
    const afterFinal = growProSchedule(afterSemi, wonResults, TEAM_ID, SEED);
    return afterFinal.find((m) => m.round === PLAYOFF_ROUND.FINAL).opponentId;
  };
  assert.equal(run(), run());
});

// ════════════════════════════════════════════════════════════════
// C1：proTable 只計循環賽場次（季後賽場次不進勝點）
// ════════════════════════════════════════════════════════════════
test('C1 proTable：混入 semi/final 場次的 schedule，名次表逐值不變（只認 round==="pro"）', () => {
  const sched = leagueSchedule();
  const results = allWinResults(sched);
  const withPlayoffs = growProSchedule(sched, results, TEAM_ID, SEED);
  const boardPlain = proTable({ teamId: TEAM_ID, seed: SEED, schedule: sched, results });
  const boardWithPlayoffs = proTable({
    teamId: TEAM_ID, seed: SEED, schedule: withPlayoffs, results,
  });
  assert.deepEqual(boardWithPlayoffs.table, boardPlain.table, '季後賽場次不得影響名次表');
  assert.equal(boardWithPlayoffs.played, boardPlain.played);
});

// ════════════════════════════════════════════════════════════════
// C3：seasonConcluded 的 pro 分支——單一定義
// ════════════════════════════════════════════════════════════════
test('C3 循環未打滿：未收束', () => {
  const sched = leagueSchedule();
  const partial = allWinResults(sched).slice(0, 6);
  assert.equal(seasonConcluded({ schedule: sched, results: partial }), false);
});

test('C3 循環打滿、未進前四：已收束（不長季後賽場次即結束）', () => {
  const sched = leagueSchedule();
  const results = allLoseResults(sched);
  assert.equal(seasonConcluded({ schedule: sched, results }), true);
});

test('C3 循環打滿、進四強、準決賽未打：未收束', () => {
  const sched = leagueSchedule();
  const leagueResults = allWinResults(sched);
  const afterSemi = growProSchedule(sched, leagueResults, TEAM_ID, SEED);
  assert.equal(seasonConcluded({ schedule: afterSemi, results: leagueResults }), false);
});

test('C3 準決敗：已收束（含準決敗）', () => {
  const sched = leagueSchedule();
  const leagueResults = allWinResults(sched);
  const afterSemi = growProSchedule(sched, leagueResults, TEAM_ID, SEED);
  const semi = afterSemi.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  const results = [...leagueResults, { matchId: semi.id, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1 }];
  assert.equal(seasonConcluded({ schedule: afterSemi, results }), true);
});

test('C3 準決勝、決賽未打：未收束', () => {
  const sched = leagueSchedule();
  const leagueResults = allWinResults(sched);
  const afterSemi = growProSchedule(sched, leagueResults, TEAM_ID, SEED);
  const semi = afterSemi.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  const wonResults = [...leagueResults, { matchId: semi.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }];
  const afterFinal = growProSchedule(afterSemi, wonResults, TEAM_ID, SEED);
  assert.equal(seasonConcluded({ schedule: afterFinal, results: wonResults }), false);
});

test('C3 決賽打完（含決賽敗）：已收束', () => {
  const sched = leagueSchedule();
  const leagueResults = allWinResults(sched);
  const afterSemi = growProSchedule(sched, leagueResults, TEAM_ID, SEED);
  const semi = afterSemi.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  const wonResults = [...leagueResults, { matchId: semi.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }];
  const afterFinal = growProSchedule(afterSemi, wonResults, TEAM_ID, SEED);
  const final = afterFinal.find((m) => m.round === PLAYOFF_ROUND.FINAL);
  const resultsFinalLoss = [...wonResults,
    { matchId: final.id, won: false, scoreFor: 1, scoreAgainst: 2, gp: 2 }];
  assert.equal(seasonConcluded({ schedule: afterFinal, results: resultsFinalLoss }), true);
});

test('回歸：企業/大學長循環的 seasonConcluded 不受 pro 分支新增影響', () => {
  const base = createCareer({ seed: 21, playerName: '小夢' });
  const corpSched = buildCorpSchedule({ corpId: 'lvyuan-foods', seed: 21 });
  const corpResults = corpSched.map((m, i) => ({
    matchId: m.id, won: i % 2 === 0, scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2,
  }));
  assert.equal(seasonConcluded({ ...base, schedule: corpSched, results: corpResults }), true);
  const uniSched = buildUniSchedule({ schoolId: 'meixi', seed: 21 });
  const uniResults = uniSched.map((m, i) => ({
    matchId: m.id, won: i % 2 === 0, scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2,
  }));
  assert.equal(seasonConcluded({ ...base, schedule: uniSched, results: uniResults }), true);
});

// ════════════════════════════════════════════════════════════════
// C4：ATTR_CAP 章節感知——單一入口 attrCapFor；既有 growth 測試斷言不動
// ════════════════════════════════════════════════════════════════
test('C4 attrCapFor：非職業章 90、職業章 100（單一入口）', () => {
  assert.equal(attrCapFor(), GROWTH.ATTR_CAP);
  assert.equal(attrCapFor(false), GROWTH.ATTR_CAP);
  assert.equal(attrCapFor(true), PRO_ATTR_CAP);
  assert.equal(PRO_ATTR_CAP, 100);
  assert.equal(GROWTH.ATTR_CAP, 90, '既有斷言不得動：非職業章逐值不變');
});

test('C4 spendAttribute：省略第三參數＝非職業章 90（既有行為零遷移）', () => {
  const p = createCareerPlayer('小夢');
  const maxed = { ...p, attributes: { ...p.attributes, jump: 90 } };
  assert.throws(() => spendAttribute(maxed, 'jump'), /上限 90/);
  assert.throws(() => spendAttribute(maxed, 'jump', false), /上限 90/);
});

test('C4 spendAttribute：職業章＝100，90 時仍可加、100 才封頂', () => {
  const p = createCareerPlayer('小夢');
  const at90 = { ...p, attributes: { ...p.attributes, jump: 90 } };
  const grown = spendAttribute(at90, 'jump', true);
  assert.equal(grown.attributes.jump, 91, '職業章：90 不是天花板，還能加');
  const at99 = { ...p, attributes: { ...p.attributes, power: 99 } };
  const grown2 = spendAttribute(at99, 'power', true);
  assert.equal(grown2.attributes.power, 100);
  const at100 = { ...p, attributes: { ...p.attributes, power: 100 } };
  assert.throws(() => spendAttribute(at100, 'power', true), /上限 100/);
  // 非職業章：90 仍是天花板，不因第三參數以外的因素鬆動
  assert.throws(() => spendAttribute(at90, 'jump', false), /上限 90/);
});

// ════════════════════════════════════════════════════════════════
// store 整合：saveCareer 是季後賽接線的唯一匯合點
// ════════════════════════════════════════════════════════════════
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function playRoundRobin(storage, round, results = null) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: results ?? games.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

function settledUniSave(schoolId = 'meixi') {
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
  for (let y = 1; y < 4; y += 1) {
    playRoundRobin(storage, 'league');
    assert.ok(createCareerStore(storage).advanceSeason(), `fixture 前提：第 ${y} 年推進成功`);
  }
  playRoundRobin(storage, 'league');
  assert.ok(createCareerStore(storage).settleUniFinale(), 'fixture 前提：U4 結算成功');
  return storage;
}

function corpSaveInProgress(corpId = 'chaoxi-marine', schoolId = 'meixi') {
  const storage = settledUniSave(schoolId);
  assert.ok(createCareerStore(storage).enterCorporate(corpId), 'fixture 前提：入企業章成功');
  return storage;
}

function settledCorpSave(corpId = 'chaoxi-marine', schoolId = 'meixi') {
  const storage = corpSaveInProgress(corpId, schoolId);
  playRoundRobin(storage, 'corp');
  assert.ok(createCareerStore(storage).settleCorpFinale(), 'fixture 前提：企業季結算成功');
  return storage;
}

/** 簽入職業隊（尚未打任何一場）。 */
function proSaveInProgress(teamId = 'cangyu-titans') {
  const storage = settledCorpSave();
  assert.ok(createCareerStore(storage).enterPro(teamId), 'fixture 前提：入職業章成功');
  return storage;
}

test('saveCareer 整合①：循環 7/7 全勝寫入後，schedule 自動長出準決賽（不必手動呼叫 growProSchedule）', () => {
  const teamId = 'cangyu-titans';
  const storage = proSaveInProgress(teamId);
  const store = createCareerStore(storage);
  const c = store.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule.map((m) => (
    { matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }
  )));
  const after = createCareerStore(storage).loadCareer();
  const semi = after.schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  assert.ok(semi, 'saveCareer 應自動長出準決賽場次');
  assert.equal(after.results.length, 7, '長場次不應動到既有戰績');
});

test('saveCareer 整合②：7/7 全敗——不進前四，不長季後賽，seasonConcluded=true', () => {
  const teamId = 'cangyu-titans';
  const storage = proSaveInProgress(teamId);
  const store = createCareerStore(storage);
  const c = store.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule.map((m) => (
    { matchId: m.id, opponentId: m.opponentId, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1 }
  )));
  const after = createCareerStore(storage).loadCareer();
  assert.equal(after.schedule.some((m) => m.round === PLAYOFF_ROUND.SEMI), false);
  assert.equal(seasonConcluded(after), true);
});

test('saveCareer 整合③：準決賽勝出後再存檔——自動長出決賽場次', () => {
  const teamId = 'cangyu-titans';
  const storage = proSaveInProgress(teamId);
  const store = createCareerStore(storage);
  const c = store.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule.map((m) => (
    { matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }
  )));
  const afterLeague = createCareerStore(storage).loadCareer();
  const semi = afterLeague.schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  createCareerStore(storage).saveCareer({
    ...afterLeague,
    results: [...afterLeague.results,
      { matchId: semi.id, opponentId: semi.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }],
  });
  const afterSemi = createCareerStore(storage).loadCareer();
  const final = afterSemi.schedule.find((m) => m.round === PLAYOFF_ROUND.FINAL);
  assert.ok(final, 'saveCareer 應自動長出決賽場次');
  assert.equal(seasonConcluded(afterSemi), false, '決賽還沒打，未收束');
});

test('回歸：saveCareer 對非職業章（企業季）零影響——growProSchedule 分支不誤觸', () => {
  const storage = corpSaveInProgress();
  const store = createCareerStore(storage);
  const before = storage.getItem(SAVE_KEY);
  playRoundRobin(storage, 'corp');
  const after = createCareerStore(storage).loadCareer();
  assert.equal(after.schedule.length, 7, '企業季賽程長度不應被職業章分支動到');
  assert.equal(after.schedule.every((m) => m.round === 'corp'), true);
  assert.notEqual(storage.getItem(SAVE_KEY), before, '對照：確實有寫入（不是完全沒動作）');
});

// ════════════════════════════════════════════════════════════════
// C5：settleProFinale／proFinaleSettled（章末收尾卡的結算入口）
// ════════════════════════════════════════════════════════════════
test('C5 settleProFinale：未進四強直接封存——proRank/pro 欄位、旗標到位', () => {
  const teamId = 'cangyu-titans';
  const storage = proSaveInProgress(teamId);
  const store = createCareerStore(storage);
  const c = store.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule.map((m) => (
    { matchId: m.id, opponentId: m.opponentId, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1 }
  )));
  const s2 = createCareerStore(storage);
  assert.equal(s2.settleProFinale(), true);
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  const last = save.career.seasons.at(-1);
  assert.ok(Number.isInteger(last.proRank) && last.proRank >= 1, '要帶 proRank');
  assert.equal(last.pro, teamId);
  assert.equal(save.career.proFinaleSettled, true);
  assert.equal(s2.proFinaleSettled(), true);
});

test('C5 settleProFinale：進四強但決賽未打——拒絕結算（未收束）', () => {
  const teamId = 'cangyu-titans';
  const storage = proSaveInProgress(teamId);
  const store = createCareerStore(storage);
  const c = store.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule.map((m) => (
    { matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }
  )));
  const s2 = createCareerStore(storage);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(s2.settleProFinale(), false);
  assert.equal(storage.getItem(SAVE_KEY), before, '拒絕時存檔逐位元不動');
});

test('C5 settleProFinale：奪冠路徑——決賽打完才准結算', () => {
  const teamId = 'cangyu-titans';
  const storage = proSaveInProgress(teamId);
  const store = createCareerStore(storage);
  const c = store.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule.map((m) => (
    { matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }
  )));
  const afterLeague = createCareerStore(storage).loadCareer();
  const semi = afterLeague.schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  createCareerStore(storage).saveCareer({
    ...afterLeague,
    results: [...afterLeague.results,
      { matchId: semi.id, opponentId: semi.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }],
  });
  const afterSemi = createCareerStore(storage).loadCareer();
  const final = afterSemi.schedule.find((m) => m.round === PLAYOFF_ROUND.FINAL);
  createCareerStore(storage).saveCareer({
    ...afterSemi,
    results: [...afterSemi.results,
      { matchId: final.id, opponentId: final.opponentId, won: true, scoreFor: 2, scoreAgainst: 1, gp: 3 }],
  });
  const s2 = createCareerStore(storage);
  assert.equal(s2.settleProFinale(), true);
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.career.proFinaleSettled, true);
});

test('C5 settleProFinale：非職業章拒絕', () => {
  const storage = settledCorpSave();
  const store = createCareerStore(storage);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(store.settleProFinale(), false);
  assert.equal(storage.getItem(SAVE_KEY), before);
});

test('C5 settleProFinale：冪等——已結算再呼叫一次＝no-op', () => {
  const teamId = 'cangyu-titans';
  const storage = proSaveInProgress(teamId);
  const store = createCareerStore(storage);
  const c = store.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule.map((m) => (
    { matchId: m.id, opponentId: m.opponentId, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1 }
  )));
  const s2 = createCareerStore(storage);
  assert.equal(s2.settleProFinale(), true);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(s2.settleProFinale(), false);
  assert.equal(storage.getItem(SAVE_KEY), before, '已結算過＝存檔不得再變動');
});

test('C5 proFinaleSettled：未結算恆 false', () => {
  const storage = proSaveInProgress();
  assert.equal(createCareerStore(storage).proFinaleSettled(), false);
});
