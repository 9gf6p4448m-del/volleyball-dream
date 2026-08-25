// 大學謝幕卷 批 1 — U4 季末結算入口（資料/狀態機，2026-08-25）
// 驗收＝`docs/kickoffs/acceptance-uni-finale-batch1.md`（B1-1～B1-5）。
// 只做「結算」（封存＋旗標），不推進屆數——`advanceSeason` 在 U4 末的既有擋線
// （careerStore.js:183 `chapterCompleted`）本批不動，B1-4 一併驗證。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY, archiveSeasonSummary } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { uniTable } from '../src/career/uniSchedule.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** 已升學到 schoolId 的存檔（大一、賽程已生、零戰績）。同 uni-year2-advance 的治具。 */
function uniSave(schoolId) {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 99, playerName: '小夢' });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('小夢', { seed: career.seed }));
  const raw = JSON.parse(storage.getItem(SAVE_KEY));
  raw.season.index = 3;
  raw.roster = { capacity: 12, members: buildStarterMembers(), alumni: [] };
  storage.setItem(SAVE_KEY, JSON.stringify(raw));
  createCareerStore(storage).enterUniversity(schoolId);
  return storage;
}

/** 把當前賽季的 league 全部打完（勝敗交錯）；played 可少打（測未打完）。 */
function playSeason(storage, played = null) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'league');
  const n = played ?? league.length;
  s.saveCareer({
    ...c,
    results: league.slice(0, n).map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

/** 推進到大四球季打完、尚未結算的存檔（career.seasons 已有大一～大三共 3 筆）。 */
function u4ReadySave(schoolId = 'meixi') {
  const storage = uniSave(schoolId);
  for (let y = 1; y <= 3; y += 1) {
    playSeason(storage);
    const adv = createCareerStore(storage).advanceSeason();
    assert.ok(adv && adv.ok, `fixture 前提：大${y}→大${y + 1} 要推得動`);
  }
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(save.season.index, 7, 'fixture 前提：大四＝全域第 7 屆');
  assert.equal((save.career.seasons ?? []).length, 3, 'fixture 前提：大一～大三已封存 3 筆');
  playSeason(storage); // 大四球季打完
  return storage;
}

test('B1-1 U4 封存：settleUniFinale 後 career.seasons 長度＝4，第 4 筆含 uniRank（與 uniTable 現算一致）與 school', () => {
  const storage = u4ReadySave('meixi');
  const store = createCareerStore(storage);
  const before = JSON.parse(storage.getItem(SAVE_KEY));
  const board = uniTable({
    schoolId: 'meixi', seed: before.season.seed,
    schedule: before.season.schedule, results: before.season.results,
  });
  const result = store.settleUniFinale();
  assert.ok(result, 'settleUniFinale 應成功（U4 已打完球季）');
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  const seasons = save.career.seasons;
  assert.equal(seasons.length, 4, 'U4 當屆要封存進 career.seasons（不再卡在 3 筆）');
  const last = seasons.at(-1);
  assert.equal(last.uniRank, board.playerRank, 'U4 封存的名次要與 uniTable 對同一 schedule/results 現算值一致');
  assert.equal(last.school, 'meixi');
});

test('B1-2 冪等：settleUniFinale 連呼兩次，career.seasons 仍 4 筆、內容不變', () => {
  const storage = u4ReadySave('meixi');
  const store = createCareerStore(storage);
  store.settleUniFinale();
  const after1 = storage.getItem(SAVE_KEY);
  const second = store.settleUniFinale();
  assert.equal(second, false, '第二次呼叫＝已結算過，no-op');
  const after2 = storage.getItem(SAVE_KEY);
  assert.equal(after2, after1, '重複呼叫不得再動存檔（不是 4 筆變 5 筆，是完全不寫）');
  const seasons = JSON.parse(after2).career.seasons;
  assert.equal(seasons.length, 4, '仍 4 筆，不是 5 筆');
});

test('B1-3 未打完不結算：seasonConcluded=false 時 settleUniFinale 回 false、無任何存檔寫入', () => {
  const storage = uniSave('meixi');
  for (let y = 1; y <= 3; y += 1) {
    playSeason(storage);
    createCareerStore(storage).advanceSeason();
  }
  playSeason(storage, 7); // 大四只打 7/8 場，未打完
  const before = storage.getItem(SAVE_KEY);
  const result = createCareerStore(storage).settleUniFinale();
  assert.equal(result, false, '未打完＝拒絕結算');
  assert.equal(storage.getItem(SAVE_KEY), before, '半場數據不得被封存，一個位元都不許動');
});

test('B1-4 旗標與既有行為不變：結算前不存在、結算後為 true；advanceSeason 在 U4 末仍 return false', () => {
  const storage = u4ReadySave('meixi');
  const beforeFlag = JSON.parse(storage.getItem(SAVE_KEY)).career.finaleSettled;
  assert.equal(beforeFlag, undefined, '結算前旗標不存在');
  const store = createCareerStore(storage);
  const result = store.settleUniFinale();
  assert.ok(result, 'fixture 前提：結算真的發生了');
  const afterFlag = JSON.parse(storage.getItem(SAVE_KEY)).career.finaleSettled;
  assert.equal(afterFlag, true, '結算後旗標為 true');
  assert.equal(store.uniFinaleSettled(), true, 'selector 讀出同一顆旗標');
  // advanceSeason 行為不因本批開始推進——U4 末仍是死路（chapterCompleted 擋線不變）
  assert.equal(store.advanceSeason(), false, 'advanceSeason 在 U4 末仍 return false，本批不推進屆數');
});

test('B1-5 封存形狀一致：第 4 筆的鍵集＝前 3 筆大學封存的鍵集（archiveSeasonSummary 全鍵＋uniRank＋school）', () => {
  const storage = u4ReadySave('meixi');
  const before = JSON.parse(storage.getItem(SAVE_KEY));
  const firstThreeKeySets = before.career.seasons.map((s) => Object.keys(s).sort().join(','));
  assert.equal(new Set(firstThreeKeySets).size, 1, 'fixture 前提：前 3 筆大學封存彼此鍵集一致');
  createCareerStore(storage).settleUniFinale();
  const after = JSON.parse(storage.getItem(SAVE_KEY));
  const seasons = after.career.seasons;
  assert.equal(seasons.length, 4);
  const fourthKeys = Object.keys(seasons[3]).sort().join(',');
  assert.equal(fourthKeys, firstThreeKeySets[0],
    '第 4 筆鍵集要與前 3 筆完全一致，消費端（careerScreen 名次顯示/🏆 計數）才不用特判');
});

test('覆審HIGH修：U1 季末（非章節末年）呼叫 settleUniFinale 回 false、存檔不變、旗標不打', () => {
  const storage = uniSave('meixi');
  playSeason(storage); // 大一球季打完、尚未推進——seasonConcluded=true 但非章節末年
  const before = storage.getItem(SAVE_KEY);
  const store = createCareerStore(storage);
  assert.equal(store.settleUniFinale(), false, 'U1 季末不得結算');
  assert.equal(storage.getItem(SAVE_KEY), before, '存檔必須逐位元不變');
  assert.equal(store.uniFinaleSettled(), false, '旗標不得被打上');
});
