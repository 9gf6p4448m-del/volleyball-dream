// 國外聯賽卷 批 2「迴圈接線」（2026-08-27，純函式/store 層、零 UI）
// 驗收＝docs/kickoffs/acceptance-foreign-batch2.md（F2-1～F2-14，動手前凍結）。
// 卷宗＝docs/kickoffs/foreign-league-kickoff.md。
// 治具沿 tests/multiyear-pro-batch1.test.mjs／tests/pro-batch3.test.mjs 同一條正式鏈
// （settledUni→corp→pro），海外段再往下接 settleProFinale→transferPro——**不借用
// devSeed 的 advanceToForeign 當治具**（那支自己是 F2-9 的受測物，拿它當治具＝用受測
// 物驗自己）。
//
// ════════════════════════════════════════════════════════════════
// F2-12 突變實測紀錄（★真的跑過★，指令＝`node --test tests/foreign-batch2.test.mjs`，
// 基準＝本檔 42 測全綠；每組突變跑完即 `cp` 還原，最後再驗一次 42/0）
// ════════════════════════════════════════════════════════════════
// 格式＝刪哪行 → 紅幾條／哪條。★關於「恰紅一條」★ 凍結條文寫的是每道守衛的刪除
// 突變恰紅一條；實測下來**只有葉節點守衛做得到**（③④＝1 條）。①⑤⑧ 動的是整條
// 海外迴圈的前置閘（季收束判定／季後賽長出／名冊與賽程換隊），下游每一測都要先
// 走過它們才到得了自己的斷言，連帶紅是**結構事實**而非測試設計失準——把它們拆成
// 「恰紅一條」只能靠 mock 掉前置閘，那會違反「沒 mock 掉勝負手」。這裡照實記數字。
//
// ① F2-2 守衛 careerState.js:162
//    刪：`|| m?.round === 'foreign'`（filter 改回只認 'pro'）
//    → 紅 19／42。代表條＝「F2-2 海外季：循環＋季後賽全有結果 → true【壞版自證條】」
//      （海外季掉到最下面的高中 careerStage 分支被誤判成未收束）。
// ② F2-7 解鎖守衛 careerStore.js `transferOfferSetOf`
//    刪：`inForeign || foreignUnlocked(save) ? FOREIGN_TEAMS : []` → `FOREIGN_TEAMS`
//    → 紅 5／42。代表條＝「F2-7 未解鎖：邀約集合與改動前逐值相同（零海外）
//      【壞版自證條】」——未解鎖存檔冒出 4 支海外隊。另 3 條是 F2-6 門檻三態。
// ③ F2-14 對稱前綴 proSchedule.js `growProSchedule`
//    刪：`&& m.id?.startsWith('pro-semi')`
//    → 紅 1／42（恰一條）＝「F2-14 growProSchedule 對稱前綴：混入 foreign-semi
//      不得被誤認成自己的準決賽」。
// ④ F2-8 offer 單一來源守衛 careerStore.js `transferPro`
//    刪：`if (!transferOfferSetOf(save).some(...)) return false;` 整行
//    → 紅 1／42（恰一條）＝「F2-8 守衛：未解鎖時轉不進海外（offer 集合擋下）」。
// ⑤ F2-3 saveCareer 匯合點分流
//    刪：`isForeignTeamId(proId) ? growForeignSchedule : growProSchedule` → 恆 growPro
//    → 紅 23／42。代表條＝「F2-3 海外季寫入結果後長出 foreign-semi（不是 pro-semi）」。
// ⑥ F2-5 settleProFinale 名次表分流
//    刪：`isForeignTeamId(proId) ? foreignTable : proTable` → 恆 proTable
//    → 紅 2／42＝「F2-5 海外季結算：proRank 取自 foreignTable（∈1..4）…」＋
//      「F2-8 海外→海外…」（薪水吃錯名次）。
// ⑦ F2-4 advanceSeason 賽程重建分流
//    刪：`isForeignTeamId(teamId) ? buildForeignSchedule : buildProSchedule` → 恆國內
//    → 紅 2／42＝「F2-4 海外季推進：賽程重建＝buildForeignSchedule 恰 6 場…」＋F2-10。
// ⑧ F2-8 transferPro 名冊/賽程分流
//    刪：`const toForeign = isForeignTeamId(team.id);` → `const toForeign = false;`
//    → 紅 25／42。代表條＝「F2-8 國內→海外：members/schedule/salary/trust 全部
//      換成海外那一套」。
// ★ 覆審修突變紀錄（2026-08-27 主對話實測，各恰 1 紅、還原 44 全綠）★
// ①刪 careerState.js 章節守衛的 `|| m?.round === 'foreign'` → 恰「覆審修①」紅
// ②刪 proSchedule.js 決賽冪等的 `&& m.id?.startsWith('pro-final')` → 恰「覆審修②」紅
// ③刪 devSeed.js advanceToForeign 開頭的 isForeignTeamId 閘 → 恰「F2-9 壞 id／國內 id」紅
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import {
  createCareer, createCareerPlayer, seasonConcluded,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { chapterCompleted } from '../src/career/chapter.js';
import { proOffersFor, proRenewalSalaryFor, proTeamById } from '../src/career/proTeams.js';
import { proStartTrustFor, proRankTrustBonus } from '../src/career/proTeam.js';
import { buildProSchedule, growProSchedule, PLAYOFF_ROUND } from '../src/career/proSchedule.js';
import {
  FOREIGN_TEAMS, foreignRenewalSalaryFor, isForeignTeamId,
} from '../src/career/foreignTeams.js';
import { FOREIGN_TEAMMATE_CAP } from '../src/career/foreignTeam.js';
import { buildForeignSchedule } from '../src/career/foreignSchedule.js';
import {
  DEV_FOREIGN_PARAM, devForeignRequest, advanceToForeign, buildSyntheticSave,
} from '../src/career/devSeed.js';
import { FINISH } from '../src/career/admission.js';

// ════════════════════════════════════════════════════════════════
// 治具（照抄 multiyear-pro-batch1 的正式鏈；差異只在職業首季要「全勝奪冠」
// 才解得開海外門檻，所以多一組打季後賽的 helper）
// ════════════════════════════════════════════════════════════════
const HOME_TEAM = 'cangyu-titans';   // 國內母隊（豪門）
const FOREIGN_TEAM = 'aurora-orion'; // 海外落腳隊（霸主）

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const saveOf = (storage) => JSON.parse(storage.getItem(SAVE_KEY));

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

/** 本季循環全勝（勝點 21，對手最多 18 ⇒ 恆第 1）。 */
function winLeague(storage, round) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  assert.ok(games.length, `fixture 前提：${round} 循環場次存在`);
  s.saveCareer({
    ...c,
    results: games.map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3,
    })),
  });
}

/** 本季循環全敗（恆最後一名）。 */
function loseLeague(storage, round) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const games = c.schedule.filter((m) => m.round === round);
  s.saveCareer({
    ...c,
    results: games.map((m) => ({
      matchId: m.id, opponentId: m.opponentId, won: false, scoreFor: 0, scoreAgainst: 2, gp: 1,
    })),
  });
}

/** 打（並贏／輸）一場已長出的季後賽場次；沒長出來就 assert 失敗（治具不掩蓋接線壞掉）。 */
function playPlayoff(storage, round, won = true) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const m = c.schedule.find((x) => x.round === round);
  assert.ok(m, `fixture 前提：${round} 場次已長出`);
  s.saveCareer({
    ...c,
    results: [...c.results, {
      matchId: m.id, opponentId: m.opponentId, won, scoreFor: won ? 2 : 0, scoreAgainst: won ? 0 : 2, gp: 3,
    }],
  });
  return m;
}

function settledUniSave(schoolId = 'meixi') {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 101, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = saveOf(storage);
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

/** 已入國內職業章、職業首季開局。 */
function proSaveInProgress(teamId = HOME_TEAM) {
  const storage = settledUniSave();
  assert.ok(createCareerStore(storage).enterCorporate('chaoxi-marine'), 'fixture 前提：入企業章成功');
  playRoundRobin(storage, 'corp');
  assert.ok(createCareerStore(storage).settleCorpFinale(), 'fixture 前提：企業季結算成功');
  assert.ok(createCareerStore(storage).enterPro(teamId), 'fixture 前提：入職業章成功');
  return storage;
}

/** 國內職業首季奪冠（proRank 1 ＋ proFinish champion）且已結算＝海外門檻已解鎖。 */
function unlockedProSave(teamId = HOME_TEAM) {
  const storage = proSaveInProgress(teamId);
  winLeague(storage, 'pro');
  playPlayoff(storage, PLAYOFF_ROUND.SEMI, true);
  playPlayoff(storage, PLAYOFF_ROUND.FINAL, true);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：國內首季結算成功');
  return storage;
}

/** 國內職業首季全敗（rank 8、proFinish league）且已結算＝海外門檻未解鎖。 */
function lockedProSave(teamId = HOME_TEAM) {
  const storage = proSaveInProgress(teamId);
  loseLeague(storage, 'pro');
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：國內首季結算成功');
  return storage;
}

/** 已轉隊入海外隊、海外首季開局。 */
function foreignSaveInProgress(foreignId = FOREIGN_TEAM) {
  const storage = unlockedProSave();
  assert.ok(createCareerStore(storage).transferPro(foreignId), 'fixture 前提：轉隊入海外成功');
  return storage;
}

/** 海外季奪冠（循環全勝＋準決勝＋決賽勝）——尚未結算。 */
function playForeignChampionSeason(storage) {
  winLeague(storage, 'foreign');
  playPlayoff(storage, PLAYOFF_ROUND.SEMI, true);
  playPlayoff(storage, PLAYOFF_ROUND.FINAL, true);
}

/** 海外季奪冠且已結算。 */
function settledForeignSeason(foreignId = FOREIGN_TEAM) {
  const storage = foreignSaveInProgress(foreignId);
  playForeignChampionSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale(), 'fixture 前提：海外季結算成功');
  return storage;
}

const idsOf = (teams) => teams.map((t) => t.id).sort();

// ════════════════════════════════════════════════════════════════
// F2-2 seasonConcluded 併入 'foreign'
// ════════════════════════════════════════════════════════════════
test('F2-2 海外季：循環未滿 → false（純函式層）', () => {
  const schedule = buildForeignSchedule({ teamId: FOREIGN_TEAM, seed: 7 });
  assert.equal(schedule.length, 6, '前提：雙循環 6 場');
  const results = schedule.slice(0, 5).map((m) => ({ matchId: m.id, won: true, scoreFor: 2, scoreAgainst: 0 }));
  assert.equal(seasonConcluded({ schedule, results }), false);
});

test('F2-2 海外季：循環＋季後賽全有結果 → true【壞版自證條】', () => {
  const storage = foreignSaveInProgress();
  const notYet = createCareerStore(storage).loadCareer();
  assert.equal(seasonConcluded(notYet), false, '開局＝一場沒打，不得算收束');
  playForeignChampionSeason(storage);
  const done = createCareerStore(storage).loadCareer();
  assert.equal(done.schedule.filter((m) => m.round === 'foreign').length, 6);
  assert.ok(done.schedule.some((m) => m.round === PLAYOFF_ROUND.FINAL), '前提：決賽已長出');
  assert.equal(seasonConcluded(done), true);
});

test('F2-2 海外季：準決賽長出但還沒打 → false（不得提早收束）', () => {
  const storage = foreignSaveInProgress();
  winLeague(storage, 'foreign');
  const c = createCareerStore(storage).loadCareer();
  assert.ok(c.schedule.some((m) => m.round === PLAYOFF_ROUND.SEMI), '前提：準決賽已長出');
  assert.equal(seasonConcluded(c), false);
});

test('F2-2 海外季：準決敗＝單淘汰止步，該季即收束（不長決賽）', () => {
  const storage = foreignSaveInProgress();
  winLeague(storage, 'foreign');
  playPlayoff(storage, PLAYOFF_ROUND.SEMI, false);
  const c = createCareerStore(storage).loadCareer();
  assert.equal(c.schedule.some((m) => m.round === PLAYOFF_ROUND.FINAL), false, '準決敗不長決賽');
  assert.equal(seasonConcluded(c), true);
});

test('F2-2 國內季行為不變：循環未滿 false／全滿未進四強 true', () => {
  const schedule = buildProSchedule({ teamId: HOME_TEAM, seed: 7 });
  const partial = schedule.slice(0, 3).map((m) => ({ matchId: m.id, won: false, scoreFor: 0, scoreAgainst: 2 }));
  assert.equal(seasonConcluded({ schedule, results: partial }), false);
  const all = schedule.map((m) => ({ matchId: m.id, won: false, scoreFor: 0, scoreAgainst: 2 }));
  assert.equal(seasonConcluded({ schedule, results: all }), true);
});

// ════════════════════════════════════════════════════════════════
// F2-3 saveCareer 匯合點依現隊分流
// ════════════════════════════════════════════════════════════════
test('F2-3 海外季寫入結果後長出 foreign-semi（不是 pro-semi）', () => {
  const storage = foreignSaveInProgress();
  winLeague(storage, 'foreign');
  const c = createCareerStore(storage).loadCareer();
  const semi = c.schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  assert.ok(semi, '循環打滿必須長出準決賽（四隊全晉級）');
  assert.ok(semi.id.startsWith('foreign-semi'), `id 應為 foreign- 前綴，實得 ${semi.id}`);
  assert.equal(semi.stage, 'foreign');
});

test('F2-3 準決勝 → 長出 foreign-final；準決敗 → 不長', () => {
  const won = foreignSaveInProgress();
  winLeague(won, 'foreign');
  playPlayoff(won, PLAYOFF_ROUND.SEMI, true);
  const fin = createCareerStore(won).loadCareer().schedule.find((m) => m.round === PLAYOFF_ROUND.FINAL);
  assert.ok(fin && fin.id.startsWith('foreign-final'), '準決勝該長出 foreign-final');

  const lost = foreignSaveInProgress();
  winLeague(lost, 'foreign');
  playPlayoff(lost, PLAYOFF_ROUND.SEMI, false);
  assert.equal(
    createCareerStore(lost).loadCareer().schedule.some((m) => m.round === PLAYOFF_ROUND.FINAL),
    false, '準決敗不得長出決賽',
  );
});

test('F2-3 國內季仍走 growProSchedule（pro- 前綴，零漂移）', () => {
  const storage = proSaveInProgress();
  winLeague(storage, 'pro');
  const semi = createCareerStore(storage).loadCareer().schedule.find((m) => m.round === PLAYOFF_ROUND.SEMI);
  assert.ok(semi && semi.id.startsWith('pro-semi'), `國內季 id 應為 pro- 前綴，實得 ${semi?.id}`);
  assert.equal(semi.stage, 'pro');
});

// ════════════════════════════════════════════════════════════════
// F2-4 advanceSeason 海外季
// ════════════════════════════════════════════════════════════════
test('F2-4 海外季推進：賽程重建＝buildForeignSchedule 恰 6 場、results 清空', () => {
  const storage = settledForeignSeason();
  const before = saveOf(storage);
  assert.ok(createCareerStore(storage).advanceSeason(), '結算後應可推進');
  const after = saveOf(storage);
  assert.equal(after.season.index, (before.season.index ?? 1) + 1);
  const rebuilt = buildForeignSchedule({ teamId: FOREIGN_TEAM, seed: after.season.seed });
  assert.equal(after.season.schedule.length, 6);
  assert.deepEqual(after.season.schedule, rebuilt, '重建賽程逐值＝buildForeignSchedule');
  assert.deepEqual(after.season.results, []);
});

test('F2-4 海外季推進：proFinaleSettled 重置＋proGrowthPending 同一次 RMW', () => {
  const storage = settledForeignSeason();
  const before = saveOf(storage);
  assert.equal(before.career.proFinaleSettled, true, '前提：已結算');
  assert.ok(createCareerStore(storage).advanceSeason());
  const after = saveOf(storage);
  assert.equal(after.career.proFinaleSettled, false, '旗標逐季重置');
  assert.equal(after.career.proGrowthPending, after.season.index, '成長待辦＝新的一屆（同一次 RMW）');
});

test('F2-4 海外季：結算先於推進——未結算不得推進', () => {
  const storage = foreignSaveInProgress();
  playForeignChampionSeason(storage);
  assert.equal(saveOf(storage).career.proFinaleSettled, false, '前提：尚未結算');
  assert.equal(createCareerStore(storage).advanceSeason(), false, '未結算不推進');
});

test('F2-4 海外季：季未收束不得推進（循環還沒打完）', () => {
  const storage = foreignSaveInProgress();
  assert.equal(createCareerStore(storage).advanceSeason(), false);
});

test('F2-4 滿十年（chapterCompleted）含海外年恆擋推進', () => {
  const storage = settledForeignSeason();
  const raw = saveOf(storage);
  raw.season.index = raw.career.chapter.enteredAtSeason + 9; // 章內第 10 年
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  assert.equal(
    chapterCompleted(saveOf(storage).career.chapter, saveOf(storage).season.index), true, '前提：確在封頂年',
  );
  assert.equal(createCareerStore(storage).advanceSeason(), false, '海外年也吃同一條年限封頂');
});

// ════════════════════════════════════════════════════════════════
// F2-5 settleProFinale 海外季 ＋ backfillProMultiyear
// ════════════════════════════════════════════════════════════════
test('F2-5 海外季結算：proRank 取自 foreignTable（∈1..4）、封存列 pro=海外 id、salary 照合約', () => {
  const storage = settledForeignSeason();
  const save = saveOf(storage);
  const last = save.career.seasons[save.career.seasons.length - 1];
  assert.equal(last.pro, FOREIGN_TEAM);
  assert.ok(Number.isInteger(last.proRank) && last.proRank >= 1 && last.proRank <= 4,
    `proRank 應在 1..4（四隊聯賽），實得 ${last.proRank}`);
  assert.equal(last.proRank, 1, '循環全勝＝第 1');
  assert.equal(last.salary, save.career.contract.salary, 'salary 照當時合約');
});

test('F2-5 海外季 proFinish 四態沿用 proFinishOf：奪冠＝champion／準決敗＝semi', () => {
  const champ = settledForeignSeason();
  const cs = saveOf(champ).career.seasons;
  assert.equal(cs[cs.length - 1].proFinish, 'champion');

  const out = foreignSaveInProgress();
  winLeague(out, 'foreign');
  playPlayoff(out, PLAYOFF_ROUND.SEMI, false);
  assert.ok(createCareerStore(out).settleProFinale());
  const os = saveOf(out).career.seasons;
  assert.equal(os[os.length - 1].proFinish, 'semi');
});

test('F2-5 865 行守衛對海外 id 放行（解析已涵蓋）＝海外季結不了算就不會有封存', () => {
  const storage = settledForeignSeason();
  const save = saveOf(storage);
  assert.equal(save.career.proFinaleSettled, true);
  assert.equal(createCareerStore(storage).settleProFinale(), false, '冪等：再結一次是 no-op');
});

test('F2-5 backfillProMultiyear 對海外 id：不炸、兩樣都不缺＝冪等 no-op 不寫檔', () => {
  const storage = settledForeignSeason();
  const before = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).backfillProMultiyear(), false, '海外存檔完整＝不補');
  assert.equal(storage.getItem(SAVE_KEY), before, '不得寫檔（逐位元組不變）');
});

test('F2-5 backfillProMultiyear 對海外 id：真缺 contract 時補的是海外表值（不誤補國內座標）', () => {
  const storage = settledForeignSeason();
  const raw = saveOf(storage);
  const realSalary = raw.career.contract.salary;
  delete raw.career.contract; // 模擬舊檔缺 contract
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  assert.equal(createCareerStore(storage).backfillProMultiyear(), true);
  const after = saveOf(storage);
  assert.ok(after.career.contract.salary >= 1000,
    `海外底薪（≥1000 萬）而非國內座標系（≤780），實得 ${after.career.contract.salary}`);
  assert.ok(after.career.contract.salary <= realSalary, '底薪回退不得高於實際續約薪');
});

// ════════════════════════════════════════════════════════════════
// F2-6 foreignUnlocked 門檻（經 proTransferOffers 觀察）
// ════════════════════════════════════════════════════════════════
function foreignOfferCount(storage) {
  return createCareerStore(storage).proTransferOffers().filter((t) => isForeignTeamId(t.id)).length;
}

/** 直接改封存那一筆的成就欄位（同 multiyear-pro-batch1「快進」手法）。 */
function patchLastSeason(storage, patch) {
  const raw = saveOf(storage);
  const i = raw.career.seasons.length - 1;
  raw.career.seasons[i] = { ...raw.career.seasons[i], ...patch };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
}

test('F2-6 門檻：國內季 proRank≤2 → 解鎖；proRank 3 且非冠軍 → 不解鎖', () => {
  const storage = lockedProSave();
  patchLastSeason(storage, { proRank: 3, proFinish: 'league' });
  assert.equal(foreignOfferCount(storage), 0, 'rank 3、非冠軍＝未解鎖');
  patchLastSeason(storage, { proRank: 2, proFinish: 'league' });
  assert.equal(foreignOfferCount(storage), FOREIGN_TEAMS.length, 'rank 2＝解鎖（年度前二）');
});

test('F2-6 門檻：循環第 4 爆冷奪冠也算（proFinish==="champion"）', () => {
  const storage = lockedProSave();
  patchLastSeason(storage, { proRank: 4, proFinish: 'champion' });
  assert.equal(foreignOfferCount(storage), FOREIGN_TEAMS.length);
});

test('F2-6 門檻：proRank 0（壞存檔）＝未達成，不猜', () => {
  const storage = lockedProSave();
  patchLastSeason(storage, { proRank: 0, proFinish: 'league' });
  assert.equal(foreignOfferCount(storage), 0);
});

test('F2-6 門檻認國內證明：成就只出現在海外季封存 → 不計', () => {
  const storage = lockedProSave();
  // 造一份「國內季毫無成就、卻有一筆海外季奪冠封存」的存檔（現隊仍是國內）
  const raw = saveOf(storage);
  raw.career.seasons.push({
    ...raw.career.seasons[raw.career.seasons.length - 1],
    index: (raw.season.index ?? 1) + 1, pro: FOREIGN_TEAM, proRank: 1, proFinish: 'champion',
  });
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  assert.equal(isForeignTeamId(FOREIGN_TEAM), true, '前提：那筆封存是海外隊');
  assert.equal(foreignOfferCount(storage), 0, '海外季成就不解鎖海外門檻');
});

// ════════════════════════════════════════════════════════════════
// F2-7 proTransferOffers 三種情形
// ════════════════════════════════════════════════════════════════
test('F2-7 未解鎖：邀約集合與改動前逐值相同（零海外）【壞版自證條】', () => {
  const storage = lockedProSave();
  const save = saveOf(storage);
  const last = save.career.seasons[save.career.seasons.length - 1];
  const expected = proOffersFor(last.proRank).filter((t) => t.id !== HOME_TEAM);
  const actual = createCareerStore(storage).proTransferOffers();
  assert.deepEqual(idsOf(actual), idsOf(expected), '未解鎖＝改動前的國內集合逐值相同');
  assert.equal(actual.some((t) => isForeignTeamId(t.id)), false, '未解鎖不得出現任何海外隊');
});

test('F2-7 解鎖且現隊國內：原國內集合 ＋ 海外 4 隊，排除現隊', () => {
  const storage = unlockedProSave();
  const save = saveOf(storage);
  const last = save.career.seasons[save.career.seasons.length - 1];
  const domestic = proOffersFor(last.proRank).filter((t) => t.id !== HOME_TEAM);
  const actual = createCareerStore(storage).proTransferOffers();
  assert.deepEqual(idsOf(actual), idsOf([...domestic, ...FOREIGN_TEAMS]));
  assert.equal(actual.some((t) => t.id === HOME_TEAM), false, '排除現隊');
});

test('F2-7 現隊海外：其餘 3 支海外隊 ＋ 國內全階開放（proOffersFor(1)），排除現隊', () => {
  const storage = settledForeignSeason();
  const actual = createCareerStore(storage).proTransferOffers();
  const expected = [
    ...proOffersFor(1),
    ...FOREIGN_TEAMS.filter((t) => t.id !== FOREIGN_TEAM),
  ];
  assert.deepEqual(idsOf(actual), idsOf(expected));
  assert.equal(actual.filter((t) => isForeignTeamId(t.id)).length, FOREIGN_TEAMS.length - 1, '其餘 3 隊');
  assert.equal(actual.some((t) => t.id === FOREIGN_TEAM), false, '排除現隊');
});

test('F2-7 開窗守衛不變：未結算／已退休＝空集合', () => {
  const inProgress = foreignSaveInProgress();
  assert.deepEqual(createCareerStore(inProgress).proTransferOffers(), [], '未結算＝不開窗');

  const settled = settledForeignSeason();
  assert.ok(createCareerStore(settled).retirePro(), '前提：退休成功');
  assert.deepEqual(createCareerStore(settled).proTransferOffers(), [], '已退休＝不開窗');
});

// ════════════════════════════════════════════════════════════════
// F2-8 transferPro 海外互轉（國內→海外→海外→國內）
// ════════════════════════════════════════════════════════════════
test('F2-8 國內→海外：members/schedule/salary/trust 全部換成海外那一套', () => {
  const storage = unlockedProSave();
  const before = saveOf(storage);
  const last = before.career.seasons[before.career.seasons.length - 1];
  assert.ok(createCareerStore(storage).transferPro(FOREIGN_TEAM));
  const after = saveOf(storage);
  assert.equal(after.career.pro, FOREIGN_TEAM);
  assert.equal(after.roster.members.every((m) => m.origin === `foreign:${FOREIGN_TEAM}`), true,
    'members＝buildForeignMembers');
  assert.deepEqual(
    after.season.schedule.map((m) => m.id),
    ['foreign-r1', 'foreign-r2', 'foreign-r3', 'foreign-r4', 'foreign-r5', 'foreign-r6'],
    'schedule＝buildForeignSchedule（雙循環 6 場）',
  );
  const team = proTeamById(FOREIGN_TEAM);
  assert.equal(after.career.contract.salary,
    foreignRenewalSalaryFor(team, last.proRank, last.proFinish), 'salary 經 league 分派＝海外續約表');
  assert.equal(after.career.contract.salary, proRenewalSalaryFor(team, last.proRank, last.proFinish),
    '呼叫端零改動——proRenewalSalaryFor 內部分派，不可能混座標系');
  assert.equal(after.player.trust.fromSetter,
    Math.min(100, proStartTrustFor(team) + proRankTrustBonus(last.proRank)),
    'trust 重置＋proRankTrustBonus');
  assert.equal(after.career.proFinaleSettled, false);
  assert.equal(after.career.proGrowthPending, after.season.index, '轉隊也是屆間：成長待辦同 RMW');
});

test('F2-8 海外→海外：轉到另一支海外隊，賽程/名冊/薪水跟著換', () => {
  const storage = settledForeignSeason();
  const target = 'schwarzwald-ritter';
  assert.ok(createCareerStore(storage).transferPro(target));
  const after = saveOf(storage);
  assert.equal(after.career.pro, target);
  assert.equal(after.roster.members.every((m) => m.origin === `foreign:${target}`), true);
  assert.equal(after.season.schedule.length, 6);
  assert.equal(after.season.schedule.every((m) => m.round === 'foreign'), true);
  assert.equal(after.career.contract.salary, foreignRenewalSalaryFor(proTeamById(target), 1, 'champion'));
});

test('F2-8 海外→國內（回國）：schedule 恰 pro-r1..r7、薪水回國內表', () => {
  const storage = settledForeignSeason();
  const before = saveOf(storage);
  const last = before.career.seasons[before.career.seasons.length - 1];
  const home = 'tiegu-warlords';
  assert.ok(createCareerStore(storage).transferPro(home), '回國全階開放（海外資歷）');
  const after = saveOf(storage);
  assert.equal(after.career.pro, home);
  assert.deepEqual(
    after.season.schedule.map((m) => m.id),
    ['pro-r1', 'pro-r2', 'pro-r3', 'pro-r4', 'pro-r5', 'pro-r6', 'pro-r7'],
  );
  assert.equal(after.roster.members.every((m) => !String(m.origin ?? '').startsWith('foreign:')), true,
    'members 回到國內建隊');
  assert.equal(after.career.contract.salary,
    proRenewalSalaryFor(proTeamById(home), last.proRank, last.proFinish), '薪水回國內表');
  assert.ok(after.career.contract.salary < before.career.contract.salary, '回國＝降薪（海外表高一截）');
});

test('F2-8 守衛：未解鎖時轉不進海外（offer 集合擋下）', () => {
  const storage = lockedProSave();
  const before = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).transferPro(FOREIGN_TEAM), false);
  assert.equal(storage.getItem(SAVE_KEY), before, '擋下＝一個位元組都不寫');
});

test('F2-8 守衛與 proTransferOffers 同一來源：集合裡的每一隊都轉得過去，集合外的都轉不過去', () => {
  const offers = createCareerStore(settledForeignSeason()).proTransferOffers();
  for (const t of offers) {
    const s = settledForeignSeason();
    assert.equal(createCareerStore(s).transferPro(t.id), true, `${t.id} 在集合裡卻轉不過去`);
  }
  const outside = settledForeignSeason();
  assert.equal(createCareerStore(outside).transferPro(FOREIGN_TEAM), false, '現隊不在集合裡＝轉不過去');
});

test('F2-8 三章來回一條鏈：國內→海外→國內，每一步的章節/年限/旗標都合法', () => {
  const storage = unlockedProSave();
  assert.ok(createCareerStore(storage).transferPro(FOREIGN_TEAM), '① 出海');
  playForeignChampionSeason(storage);
  assert.ok(createCareerStore(storage).settleProFinale(), '② 海外季結算');
  assert.ok(createCareerStore(storage).transferPro('tiegu-warlords'), '③ 回國');
  winLeague(storage, 'pro');
  playPlayoff(storage, PLAYOFF_ROUND.SEMI, true);
  playPlayoff(storage, PLAYOFF_ROUND.FINAL, true);
  assert.ok(createCareerStore(storage).settleProFinale(), '④ 回國後那季照樣結得了算');
  const seasons = saveOf(storage).career.seasons.filter((s) => s.pro);
  assert.deepEqual(seasons.map((s) => s.pro), [HOME_TEAM, FOREIGN_TEAM, 'tiegu-warlords']);
  assert.equal(seasons[2].proRank >= 1 && seasons[2].proRank <= 8, true, '回國後名次回到 8 隊座標系');
});

// ════════════════════════════════════════════════════════════════
// F2-9 ?devforeign 治具
// ════════════════════════════════════════════════════════════════
function syntheticStore() {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const synthetic = buildSyntheticSave({ finish: FINISH.CHAMPION, seed: 55 });
  assert.ok(synthetic, '前提：合成存檔成立');
  store.seedWholeSave(synthetic);
  return { storage, store };
}

test('F2-9 devForeignRequest：只接受海外 id（國內 id／壞 id／空一律 null）', () => {
  assert.equal(DEV_FOREIGN_PARAM, 'devforeign');
  assert.deepEqual(devForeignRequest(new URLSearchParams('devforeign=aurora-orion')), { teamId: 'aurora-orion' });
  assert.equal(devForeignRequest(new URLSearchParams('devforeign=cangyu-titans')), null, '國內 id 不啟動');
  assert.equal(devForeignRequest(new URLSearchParams('devforeign=不存在')), null);
  assert.equal(devForeignRequest(new URLSearchParams('')), null);
});

test('F2-9 advanceToForeign 走正式鏈落地：pro=海外 id、schedule 恰 foreign-r1..r6、salary＝海外表值', () => {
  const { storage, store } = syntheticStore();
  assert.equal(advanceToForeign(store, { teamId: FOREIGN_TEAM }), true);
  const save = saveOf(storage);
  assert.equal(save.career.pro, FOREIGN_TEAM);
  assert.deepEqual(
    save.season.schedule.map((m) => m.id),
    ['foreign-r1', 'foreign-r2', 'foreign-r3', 'foreign-r4', 'foreign-r5', 'foreign-r6'],
  );
  const last = save.career.seasons[save.career.seasons.length - 1];
  assert.equal(isForeignTeamId(last.pro), false, '治具落地前的最後一筆封存＝國內母隊那季');
  assert.equal(save.career.contract.salary,
    foreignRenewalSalaryFor(proTeamById(FOREIGN_TEAM), last.proRank, last.proFinish));
  assert.equal(save.career.chapter.id, 'pro');
});

test('F2-9 advanceToForeign 走的是正式門檻：合成的國內季真的達標（rank≤2 或 champion）', () => {
  const { storage, store } = syntheticStore();
  assert.ok(advanceToForeign(store, { teamId: FOREIGN_TEAM }));
  const domestic = saveOf(storage).career.seasons.filter((s) => s.pro && !isForeignTeamId(s.pro));
  assert.equal(domestic.length, 1);
  assert.equal(domestic[0].proRank <= 2 || domestic[0].proFinish === 'champion', true,
    '門檻由正式鏈自己走過——治具不直改存檔欄位');
});

test('F2-9 壞 id／國內 id 不啟動（覆審 MEDIUM 修：非母隊國內 id、且鏈前拒絕＝零寫入）', () => {
  const { storage, store } = syntheticStore();
  const before = storage.getItem(SAVE_KEY);
  // 用非治具母隊的國內 id（tiegu-warlords）——母隊 id 會被「現隊＝目標隊」守衛
  // 搶答（多年卷教訓 2），證不了「國內 id 被本函式的 isForeignTeamId 閘擋下」。
  assert.equal(advanceToForeign(store, { teamId: 'tiegu-warlords' }), false, '國內 id 鏈前拒絕');
  assert.equal(storage.getItem(SAVE_KEY), before, '拒絕＝零寫入（不半吊子落在國內母隊季）');
  assert.equal(advanceToForeign(store, { teamId: '不存在' }), false, '壞 id 同樣拒絕');
  assert.equal(storage.getItem(SAVE_KEY), before, '壞 id 亦零寫入');
});

// ════════════════════════════════════════════════════════════════
// F2-10 逐值重演（存檔層決定論；照 multiyear-pro-batch1.test.mjs:238 同款）
// ════════════════════════════════════════════════════════════════
test('F2-10 同 RMW 鏈（海外季結算→推進→轉隊）重演兩次，序列化字串全等', () => {
  const run = () => {
    const storage = settledForeignSeason();
    assert.ok(createCareerStore(storage).advanceSeason());
    playForeignChampionSeason(storage);
    assert.ok(createCareerStore(storage).settleProFinale());
    assert.ok(createCareerStore(storage).transferPro('azure-albatross'));
    return storage.getItem(SAVE_KEY);
  };
  assert.equal(run(), run(), '同鏈重演逐值一致');
});

test('F2-10 devforeign 治具鏈也是決定論（同一條網址兩次落地逐值相同）', () => {
  const run = () => {
    const { storage, store } = syntheticStore();
    assert.ok(advanceToForeign(store, { teamId: FOREIGN_TEAM }));
    return storage.getItem(SAVE_KEY);
  };
  assert.equal(run(), run());
});

// ════════════════════════════════════════════════════════════════
// F2-13 屆間三選一在海外季照常運作
// ════════════════════════════════════════════════════════════════
test('F2-13 海外季末三選一可選；mentor 加成後隊友屬性仍 ≤90（clamp 護欄不失真）', () => {
  const storage = settledForeignSeason();
  assert.ok(createCareerStore(storage).advanceSeason(), '前提：推進成功（pending 開出）');
  assert.equal(createCareerStore(storage).proGrowthPending(), true, '海外季末三選一可選');
  const target = saveOf(storage).roster.members[0];
  assert.ok(String(target.origin).startsWith('foreign:'), '前提：傳承對象是海外名冊成員');
  const beforeAttrs = { ...target.attributes };
  assert.ok(createCareerStore(storage).chooseProGrowth('mentor', target.id));
  const after = saveOf(storage).roster.members.find((m) => m.id === target.id);
  for (const [k, v] of Object.entries(after.attributes)) {
    assert.ok(v <= FOREIGN_TEAMMATE_CAP, `${k}=${v} 超過 clamp ${FOREIGN_TEAMMATE_CAP}`);
    assert.ok(v >= beforeAttrs[k], `${k} 不得倒退`);
  }
  assert.deepEqual(createCareerStore(storage).proGrowthState().mentored, [target.id]);
  assert.equal(createCareerStore(storage).proGrowthPending(), false, '選完清 pending');
});

test('F2-13 海外季 prestige 選項照常（fromSetter +6 封頂 100）', () => {
  const storage = settledForeignSeason();
  assert.ok(createCareerStore(storage).advanceSeason());
  const before = saveOf(storage).player.trust.fromSetter;
  assert.ok(createCareerStore(storage).chooseProGrowth('prestige'));
  assert.equal(saveOf(storage).player.trust.fromSetter, Math.min(100, before + 6));
});

// ════════════════════════════════════════════════════════════════
// F2-14 growProSchedule 對稱前綴（批 1 覆審 MEDIUM）
// ════════════════════════════════════════════════════════════════
test('F2-14 growProSchedule 對稱前綴：混入 foreign-semi 不得被誤認成自己的準決賽', () => {
  const seed = 7;
  const sched = buildProSchedule({ teamId: HOME_TEAM, seed });
  const results = sched.map((m) => ({ matchId: m.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }));
  // 賽程裡混進一場海外準決賽（id 前綴不同、round 相同）——沒有前綴檢查的話它會被
  // 當成「玩家的準決賽已經長過了」，國內季後賽從此長不出來。
  const polluted = [...sched, {
    id: 'foreign-semi-1', stage: 'foreign', round: PLAYOFF_ROUND.SEMI, opponentId: 'solar-toro',
    label: '準決賽', format: 3,
  }];
  const grown = growProSchedule(polluted, results, HOME_TEAM, seed);
  assert.notEqual(grown, polluted, '應該要長出自己的準決賽');
  const mine = grown[grown.length - 1];
  assert.equal(mine.round, PLAYOFF_ROUND.SEMI);
  assert.ok(mine.id.startsWith('pro-semi'), `應長出 pro-semi，實得 ${mine.id}`);
});

test('F2-14 既有國內季後賽行為零漂移：乾淨賽程照樣長、且冪等', () => {
  const seed = 7;
  const sched = buildProSchedule({ teamId: HOME_TEAM, seed });
  const results = sched.map((m) => ({ matchId: m.id, won: true, scoreFor: 2, scoreAgainst: 0, gp: 3 }));
  const grown = growProSchedule(sched, results, HOME_TEAM, seed);
  assert.equal(grown.length, sched.length + 1);
  assert.equal(growProSchedule(grown, results, HOME_TEAM, seed), grown, '冪等：原參考回傳');
});

// ════════════════════════════════════════════════════════════════
// 批 2 覆審修的守衛測試（2026-08-27）——三道一行修各一條鑑別力測試
// ════════════════════════════════════════════════════════════════
test('覆審修① careerState.advanceSeason 章節守衛：海外賽程（chapter 損毀）不被高中推進鏈接管', async () => {
  const { advanceSeason: pureAdvance } = await import('../src/career/careerState.js');
  const schedule = [
    { id: 'foreign-r1', round: 'foreign', opponentId: 'aurora-orion', format: 3 },
  ];
  const career = {
    seed: 7, schedule, results: [{ matchId: 'foreign-r1', won: true, scoreFor: 2, scoreAgainst: 0 }],
    titles: 0, // chapter 刻意缺失＝損毀存檔——守衛必須靠 round 擋，不靠 chapter
  };
  const out = pureAdvance(career, {});
  assert.equal(out, career, '海外賽程要回原參考（不動），不得換成高中 group-1 賽程');
});

test('覆審修② growProSchedule 決賽冪等前綴：混入 foreign-final 不得吞掉國內決賽的長出', () => {
  // 國內循環＋準決賽已勝，schedule 被污染混入一筆海外決賽條目——
  // 冪等檢查若只按 round 判，會誤以為「決賽已長過」而永遠不長國內決賽。
  const teamId = 'cangyu-titans';
  const seed = 11;
  const base = buildProSchedule({ teamId, seed });
  const results = base.map((m) => ({ matchId: m.id, won: true, scoreFor: 2, scoreAgainst: 0 }));
  const withSemi = growProSchedule(base, results, teamId, seed);
  assert.ok(withSemi.some((m) => m.id?.startsWith('pro-semi')), '前提：準決賽已長出');
  const semi = withSemi.find((m) => m.id?.startsWith('pro-semi'));
  const results2 = [...results, { matchId: semi.id, won: true, scoreFor: 2, scoreAgainst: 1 }];
  const polluted = [...withSemi, { id: 'foreign-final', round: PLAYOFF_ROUND.FINAL, opponentId: 'aurora-orion', format: 3 }];
  const grown = growProSchedule(polluted, results2, teamId, seed);
  assert.ok(grown.some((m) => m.id === 'pro-final'), '國內決賽仍要長出（不被海外條目吞掉）');
});
