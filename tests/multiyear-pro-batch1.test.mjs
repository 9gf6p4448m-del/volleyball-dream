// 多年職業生涯卷 批 1「年迴圈地基」（2026-08-27，純函式/store 層、零 UI）
// 驗收＝docs/kickoffs/acceptance-multiyear-batch1.md（A1–A7，動手前凍結 01c9243）。
// 卷宗＝docs/kickoffs/multiyear-pro-kickoff.md。
// 治具沿 tests/pro-batch3.test.mjs 同一條正式鏈（settledUni→corp→pro）。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAPTER, CHAPTER_SEASONS, chapterCompleted, proCareerOver,
} from '../src/career/chapter.js';
import {
  createCareer, createCareerPlayer,
} from '../src/career/careerState.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { proBaseSalaryFor, proTeamById, PRO_TEAMS } from '../src/career/proTeams.js';
import { TIER } from '../src/career/admission.js';

// ════════════════════════════════════════════════════════════════
// 治具（與 pro-batch3 同款：全敗＝不進四強、季直接收束——多年迴圈測試
// 不需要季後賽路徑，用最短收束鏈）
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

/** 本季全敗（恆第 8、不進四強）——季收束的最短路徑。 */
function loseOutSeason(storage) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule
    .filter((m) => m.round === 'pro')
    .map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: false,
      scoreFor: 0, scoreAgainst: 2, gp: 1,
    })));
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

function proSaveInProgress(teamId = 'cangyu-titans') {
  const storage = settledUniSave();
  assert.ok(createCareerStore(storage).enterCorporate('chaoxi-marine'), 'fixture 前提：入企業章成功');
  playRoundRobin(storage, 'corp');
  assert.ok(createCareerStore(storage).settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(createCareerStore(storage).enterPro(teamId), 'fixture 前提：入職業章成功');
  return storage;
}

/** 職業第 1 季打完（全敗收束）且已結算。 */
function settledProYear1(teamId = 'cangyu-titans') {
  const storage = proSaveInProgress(teamId);
  loseOutSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：職業首季結算成功');
  return storage;
}

const saveOf = (storage) => JSON.parse(storage.getItem(SAVE_KEY));

// ════════════════════════════════════════════════════════════════
// A1 年限表
// ════════════════════════════════════════════════════════════════
test('A1 CHAPTER_SEASONS 逐章：高中 3／大學 4／企業 1／職業 10', () => {
  assert.equal(CHAPTER_SEASONS[CHAPTER.HIGH_SCHOOL], 3);
  assert.equal(CHAPTER_SEASONS[CHAPTER.UNIVERSITY], 4);
  assert.equal(CHAPTER_SEASONS[CHAPTER.CORPORATE], 1);
  assert.equal(CHAPTER_SEASONS[CHAPTER.PRO], 10);
});

test('A1 chapterCompleted（pro）：章內第 1/9 年 false、第 10 年 true（enteredAtSeason 換算）', () => {
  const chapter = { id: CHAPTER.PRO, enteredAtSeason: 9 }; // 全域第 9 屆入章
  assert.equal(chapterCompleted(chapter, 9), false); // 章內第 1 年
  assert.equal(chapterCompleted(chapter, 17), false); // 章內第 9 年
  assert.equal(chapterCompleted(chapter, 18), true); // 章內第 10 年＝封頂
});

// ════════════════════════════════════════════════════════════════
// A2 settleProFinale 逐季化
// ════════════════════════════════════════════════════════════════
test('A2 第 1 季（年限未滿）打完即可結算——封存帶 proRank/pro/salary、旗標到位【壞版自證條】', () => {
  const teamId = 'cangyu-titans';
  const storage = proSaveInProgress(teamId);
  loseOutSeason(storage);
  const store = createCareerStore(storage);
  assert.equal(store.settleProFinale(), true, '年限未滿的季打完必須可結算（舊版這裡紅）');
  const save = saveOf(storage);
  const last = save.career.seasons.at(-1);
  assert.equal(last.proRank, 8, '全敗恆第 8');
  assert.equal(last.pro, teamId);
  assert.equal(last.salary, proBaseSalaryFor(proTeamById(teamId)), '封存薪水＝現約年薪');
  assert.equal(last.proFinish, 'league', '未進四強＝league（覆審 HIGH 修訂：季後賽結果入封存）');
  assert.equal(save.career.proFinaleSettled, true);
});

/** 循環全勝（恆第 1、進四強），再依 playoffResults 打季後賽場次。 */
function winLeagueThenPlayoffs(storage, playoffResults) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  playRoundRobin(storage, 'pro', c.schedule
    .filter((m) => m.round === 'pro')
    .map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: true,
      scoreFor: 2, scoreAgainst: 0, gp: 3,
    })));
  for (const won of playoffResults) {
    const s2 = createCareerStore(storage);
    const c2 = s2.loadCareer();
    const next = c2.schedule.find((m) => m.round !== 'pro' && !c2.results.some((r) => r.matchId === m.id));
    assert.ok(next, 'fixture 前提：季後賽場次已長出');
    s2.saveCareer({
      ...c2,
      results: [...c2.results, {
        matchId: next.id, opponentId: next.opponentId, won,
        scoreFor: won ? 2 : 0, scoreAgainst: won ? 0 : 2, gp: won ? 3 : 1,
      }],
    });
  }
}

test('A2 修訂：proFinish 三態——奪冠 champion／決賽敗 final／四強止步 semi', () => {
  const champ = proSaveInProgress();
  winLeagueThenPlayoffs(champ, [true, true]); // 準決賽勝＋決賽勝
  assert.ok(createCareerStore(champ).settleProFinale());
  assert.equal(saveOf(champ).career.seasons.at(-1).proFinish, 'champion');

  const runnerUp = proSaveInProgress();
  winLeagueThenPlayoffs(runnerUp, [true, false]); // 準決賽勝＋決賽敗
  assert.ok(createCareerStore(runnerUp).settleProFinale());
  assert.equal(saveOf(runnerUp).career.seasons.at(-1).proFinish, 'final');

  const semiOut = proSaveInProgress();
  winLeagueThenPlayoffs(semiOut, [false]); // 準決賽敗＝止步四強
  assert.ok(createCareerStore(semiOut).settleProFinale());
  assert.equal(saveOf(semiOut).career.seasons.at(-1).proFinish, 'semi');
});

test('A2 冪等：連呼第二次 false 且 seasons 長度不變', () => {
  const storage = settledProYear1();
  const store = createCareerStore(storage);
  const n = saveOf(storage).career.seasons.length;
  assert.equal(store.settleProFinale(), false);
  assert.equal(saveOf(storage).career.seasons.length, n);
});

test('A2 未打完不結算；非職業章拒絕', () => {
  const inProgress = proSaveInProgress();
  assert.equal(createCareerStore(inProgress).settleProFinale(), false, '季未收束不結算');
  const uniOnly = settledUniSave();
  assert.equal(createCareerStore(uniOnly).settleProFinale(), false, '非職業章拒絕');
});

test('A2 舊檔相容：無 contract 鍵的存檔結算不炸、salary 封存 null', () => {
  const storage = proSaveInProgress();
  const raw = saveOf(storage);
  delete raw.career.contract; // 模擬職業章單年版舊檔
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  loseOutSeason(storage);
  assert.equal(createCareerStore(storage).settleProFinale(), true);
  assert.equal(saveOf(storage).career.seasons.at(-1).salary, null);
});

// ════════════════════════════════════════════════════════════════
// A3 advanceSeason pro 分支
// ════════════════════════════════════════════════════════════════
test('A3 結算先於推進：季收束但未結算 → 不推進【旗標鏈自證條】', () => {
  const storage = proSaveInProgress();
  loseOutSeason(storage);
  const before = saveOf(storage).season.index;
  assert.equal(createCareerStore(storage).advanceSeason(), false, '未結算不得推進');
  assert.equal(saveOf(storage).season.index, before, '屆數不動');
});

test('A3 已結算 → 推進：index+1、seed 衍生、schedule 重建、results 清空、旗標清 false、隨行資產保留', () => {
  const teamId = 'cangyu-titans';
  const storage = settledProYear1(teamId);
  const before = saveOf(storage);
  assert.ok(createCareerStore(storage).advanceSeason(), '已結算必須可推進');
  const after = saveOf(storage);
  assert.equal(after.season.index, before.season.index + 1);
  assert.notEqual(after.season.seed, before.season.seed, 'seed 必須衍生（不得沿用）');
  assert.equal(after.season.results.length, 0);
  assert.equal(after.season.schedule.filter((m) => m.round === 'pro').length, 7, '新季＝純循環 7 場');
  assert.equal(after.season.schedule.some((m) => m.round !== 'pro'), false, '無殘留季後賽場');
  assert.equal(after.career.proFinaleSettled, false, '旗標逐季重置（不清＝第 2 季永遠不能結算）');
  assert.equal(after.career.pro, teamId, '球隊保留');
  assert.deepEqual(after.career.contract, before.career.contract, '合約保留');
  assert.deepEqual(after.roster.members, before.roster.members, '名冊零換血');
  assert.deepEqual(after.lineup.trust, before.lineup.trust, 'trust 跟人保留');
  assert.deepEqual(after.season.events ?? [], before.season.events ?? [], '劇情/傳授旗標跨季帶入');
});

test('A3 第 2 季可再打再結算（旗標鏈走得通）＋決定論：同存檔重演逐值一致', () => {
  const storage = settledProYear1();
  assert.ok(createCareerStore(storage).advanceSeason());
  const snapshotA = storage.getItem(SAVE_KEY);
  // 第 2 季打完能再結算＝逐季旗標真的活著
  loseOutSeason(storage);
  assert.equal(createCareerStore(storage).settleProFinale(), true, '第 2 季必須能再結算');
  // 決定論：另起爐灶重演同一條鏈，推進後逐值一致
  const storage2 = settledProYear1();
  assert.ok(createCareerStore(storage2).advanceSeason());
  assert.equal(storage2.getItem(SAVE_KEY), snapshotA, '同鏈重演逐值一致');
});

test('A3 第 10 年結算後不再推進（硬上限封頂）', () => {
  const storage = settledProYear1();
  // 快進：直接把屆數推到章內第 10 年（enteredAtSeason 不動、index 改到封頂）
  const raw = saveOf(storage);
  const entered = raw.career.chapter.enteredAtSeason;
  raw.season.index = entered + 9; // 章內第 10 年
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  assert.equal(chapterCompleted(saveOf(storage).career.chapter, saveOf(storage).season.index), true, '前提：確在封頂年');
  assert.equal(createCareerStore(storage).advanceSeason(), false, '第 10 年不得再推進');
});

test('A3 已退休不推進', () => {
  const storage = settledProYear1();
  assert.ok(createCareerStore(storage).retirePro(), '前提：退休成功');
  assert.equal(createCareerStore(storage).advanceSeason(), false);
});

// ════════════════════════════════════════════════════════════════
// A4 contract 結構
// ════════════════════════════════════════════════════════════════
test('A4 enterPro 建首約：{salary 正整數, sinceSeason=入章屆數}', () => {
  const storage = proSaveInProgress('cangyu-titans');
  const save = saveOf(storage);
  const c = save.career.contract;
  assert.ok(Number.isInteger(c.salary) && c.salary > 0, '薪水為正整數');
  assert.equal(c.sinceSeason, save.season.index, 'sinceSeason＝入章屆數');
});

test('A4 底薪隊階遞增：豪門＞勁旅＞新軍、且全為正', () => {
  const byTier = {};
  for (const t of PRO_TEAMS) byTier[t.tier] = proBaseSalaryFor(t);
  assert.ok(byTier[TIER.POWERHOUSE] > byTier[TIER.MID], '豪門＞勁旅');
  assert.ok(byTier[TIER.MID] > byTier[TIER.WEAK], '勁旅＞新軍');
  assert.ok(byTier[TIER.WEAK] > 0, '底薪為正');
  assert.equal(proBaseSalaryFor(null), byTier[TIER.WEAK], '壞值照最低給');
});

// ════════════════════════════════════════════════════════════════
// A5 retirePro 與 proCareerOver
// ════════════════════════════════════════════════════════════════
test('A5 retirePro 守衛：未結算不得退（本季白打防線）；已結算可退；冪等', () => {
  const inProgress = proSaveInProgress();
  loseOutSeason(inProgress);
  assert.equal(createCareerStore(inProgress).retirePro(), false, '未結算不得退');
  const storage = settledProYear1();
  assert.equal(createCareerStore(storage).retirePro(), true);
  assert.equal(saveOf(storage).career.proRetired, true);
  assert.equal(createCareerStore(storage).retirePro(), false, '冪等');
});

test('A5 retirePro 非職業章拒絕', () => {
  const storage = settledUniSave();
  assert.equal(createCareerStore(storage).retirePro(), false);
});

test('A5 proCareerOver SSOT（拍板甲）：未退 false／退休 true／末季進行中 false／末季結算後 true／非職業章恆 false', () => {
  const storage = settledProYear1();
  let save = saveOf(storage);
  assert.equal(proCareerOver(save.career, save.season.index), false, '第 1 季已結算未退＝false（年限未滿）');
  assert.ok(createCareerStore(storage).retirePro());
  save = saveOf(storage);
  assert.equal(proCareerOver(save.career, save.season.index), true, '退休＝true');
  // 拍板甲（2026-08-27 覆審 MEDIUM 修訂）：第 10 季「季初」不算生涯結束——
  // 未結算＝false（否則批 5 強制謝幕會整季跳過第 10 季），結算後才 true
  const cappedPlaying = { chapter: { id: CHAPTER.PRO, enteredAtSeason: 9 } };
  assert.equal(proCareerOver(cappedPlaying, 18), false, '章內第 10 年進行中（未結算）＝false');
  const cappedSettled = { chapter: { id: CHAPTER.PRO, enteredAtSeason: 9 }, proFinaleSettled: true };
  assert.equal(proCareerOver(cappedSettled, 18), true, '章內第 10 年已結算＝true');
  assert.equal(proCareerOver(cappedSettled, 17), false, '第 9 年已結算＝false（年限未滿，推進後旗標會清）');
  const uni = saveOf(settledUniSave());
  assert.equal(proCareerOver(uni.career, uni.season.index), false, '非職業章恆 false');
});
