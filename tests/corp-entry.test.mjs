// 成人/企業章 批 2「入章接線」（2026-08-25）
// 驗收＝`docs/kickoffs/acceptance-corp-batch2.md`（A2-1～A2-5，凍結 aa49e56）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { corporationById, corpOffersFor } from '../src/career/corporations.js';
import { buildCorpMembers, corpStartTrustFor } from '../src/career/corpTeam.js';
import { uniRankTrustBonus } from '../src/career/uniTeam.js';
import {
  buildSyntheticSave, devCorpRequest, advanceToCorp,
} from '../src/career/devSeed.js';
import { FINISH } from '../src/career/admission.js';
import { normalizeChapter, CHAPTER } from '../src/career/chapter.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

/** 已升學的存檔（沿 uni-year2-advance 的 fixture 手法）。 */
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

function playSeason(storage) {
  const s = createCareerStore(storage);
  const c = s.loadCareer();
  const league = c.schedule.filter((m) => m.round === 'league');
  s.saveCareer({
    ...c,
    results: league.map((m, i) => ({
      matchId: m.id, opponentId: m.opponentId, won: i % 2 === 0,
      scoreFor: i % 2 === 0 ? 2 : 1, scoreAgainst: i % 2 === 0 ? 0 : 2, gp: 3,
    })),
  });
}

/** 走完大學四年＋謝幕結算的存檔（全程正式鏈——A2-1 的輸入就是它）。 */
function settledUniSave(schoolId = 'meixi') {
  const storage = uniSave(schoolId);
  const store = createCareerStore(storage);
  for (let y = 1; y < 4; y += 1) {
    playSeason(storage);
    assert.ok(store.advanceSeason(), `fixture 前提：第 ${y} 年屆間推進成功`);
  }
  playSeason(storage); // U4 打滿
  assert.ok(store.settleUniFinale(), 'fixture 前提：U4 結算成功');
  return storage;
}

// ════════════════════════════════════════════════════════════════
// A2-1 同一次 RMW
// ════════════════════════════════════════════════════════════════
test('A2-1 enterCorporate：章節/公司/封存/名冊/球權/賽程/屆數同一次到位', () => {
  const storage = settledUniSave();
  const store = createCareerStore(storage);
  const before = JSON.parse(storage.getItem(SAVE_KEY));
  const beforeIndex = before.season.index;
  const uniRoster = before.roster;
  const uniRank = before.career.seasons.at(-1).uniRank;
  assert.ok(Number.isInteger(uniRank) && uniRank >= 1, 'fixture 前提：第 4 筆封存帶 uniRank');

  assert.ok(store.enterCorporate('chaoxi-marine'), '入章要成功');
  const after = JSON.parse(storage.getItem(SAVE_KEY));
  const ch = normalizeChapter(after.career);
  assert.equal(ch.id, CHAPTER.CORPORATE);
  assert.equal(ch.enteredAtSeason, beforeIndex + 1, 'enteredAtSeason＝原屆數+1');
  assert.equal(after.career.corp, 'chaoxi-marine');
  assert.equal(after.career.school, before.career.school, '大學的 school 保留');
  assert.equal(after.career.finaleSettled, true);
  assert.deepEqual(after.career.uniRoster, uniRoster, '大學名冊封存＝入章前那份');
  assert.deepEqual(after.roster.members, buildCorpMembers('chaoxi-marine'));
  assert.equal(after.season.index, beforeIndex + 1);
  const sched = after.season.schedule;
  assert.equal(sched.length, 7);
  assert.ok(sched.every((m) => m.round === 'corp'), '賽程全是 corp 場');
  assert.deepEqual(after.season.results, []);
  assert.deepEqual(after.season.events, []);
  const corp = corporationById('chaoxi-marine');
  assert.equal(after.player.trust.fromSetter,
    Math.min(100, corpStartTrustFor(corp) + uniRankTrustBonus(uniRank)),
    '球權＝隊階起點＋大學名次加成（提案表）');
  assert.equal(after.player.trust.floorShare, before.player.trust.floorShare,
    'floorShare 不得被洗掉');
});

// ════════════════════════════════════════════════════════════════
// A2-2 守衛與冪等
// ════════════════════════════════════════════════════════════════
test('A2-2a 未謝幕結算（大學年中）：拒簽、存檔逐位元不動', () => {
  const storage = uniSave('meixi');
  playSeason(storage);
  const before = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).enterCorporate('chaoxi-marine'), false);
  assert.equal(storage.getItem(SAVE_KEY), before);
});

test('A2-2b 高中章存檔：拒簽', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.saveCareer(createCareer({ seed: 7, playerName: '小夢' }));
  store.savePlayer(createCareerPlayer('小夢', { seed: 7 }));
  const before = storage.getItem(SAVE_KEY);
  assert.equal(store.enterCorporate('chaoxi-marine'), false);
  assert.equal(storage.getItem(SAVE_KEY), before);
});

test('A2-2c 已簽約再簽別家：拒絕、corp 不被覆寫', () => {
  const storage = settledUniSave();
  const store = createCareerStore(storage);
  assert.ok(store.enterCorporate('chaoxi-marine'));
  const before = storage.getItem(SAVE_KEY);
  assert.equal(store.enterCorporate('panshi-heavy'), false);
  assert.equal(storage.getItem(SAVE_KEY), before, '已在企業章＝冪等 no-op');
  assert.equal(store.loadCorp(), 'chaoxi-marine');
});

test('A2-2d 壞 corpId：拒簽、存檔不動', () => {
  const storage = settledUniSave();
  const before = storage.getItem(SAVE_KEY);
  assert.equal(createCareerStore(storage).enterCorporate('不存在'), false);
  assert.equal(createCareerStore(storage).enterCorporate(null), false);
  assert.equal(storage.getItem(SAVE_KEY), before);
});

// ════════════════════════════════════════════════════════════════
// A2-4 邀約集合的值從哪來（封存 uniRank 的真實讀取路徑）
// ════════════════════════════════════════════════════════════════
test('A2-4 corpOffers 讀封存第 4 筆 uniRank：第 1 名 8 隊、第 9 名 3 隊', () => {
  for (const [rank, expected] of [[1, 8], [9, 3]]) {
    const storage = settledUniSave();
    // 輸入狀態＝存檔裡封存的名次（改的是輸入資料，讀取路徑仍是正式的 corpOffers）
    const raw = JSON.parse(storage.getItem(SAVE_KEY));
    raw.career.seasons.at(-1).uniRank = rank;
    storage.setItem(SAVE_KEY, JSON.stringify(raw));
    const offers = createCareerStore(storage).corpOffers();
    assert.equal(offers.length, expected, `uniRank ${rank} 的邀約數`);
    assert.deepEqual(offers.map((c) => c.id), corpOffersFor(rank).map((c) => c.id),
      '集合與純函式層一致（單一階梯表）');
  }
});

test('A2-4b corpOffers 無參數簽名：rank 不可能被呼叫端外帶', () => {
  const store = createCareerStore(settledUniSave());
  assert.equal(store.corpOffers.length, 0, 'corpOffers() 不吃任何參數——值只能來自存檔');
});

// ════════════════════════════════════════════════════════════════
// A2-5 devcorp 治具走正式鏈
// ════════════════════════════════════════════════════════════════
const paramsOf = (obj) => new URLSearchParams(obj);

test('A2-5a devCorpRequest 守衛：亂帶一律 null', () => {
  assert.equal(devCorpRequest(paramsOf({})), null);
  assert.equal(devCorpRequest(paramsOf({ devcorp: '' })), null);
  assert.equal(devCorpRequest(paramsOf({ devcorp: 'no-such-corp' })), null);
  assert.deepEqual(devCorpRequest(paramsOf({ devcorp: 'panshi-heavy' })), { corpId: 'panshi-heavy' });
});

test('A2-5b advanceToCorp：正式鏈走完＝企業章開局＋四筆大學封存', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  store.seedWholeSave(buildSyntheticSave({ finish: FINISH.QUARTER }));
  assert.ok(advanceToCorp(store, { corpId: 'lvyuan-foods' }), '治具鏈要走完');
  const save = JSON.parse(storage.getItem(SAVE_KEY));
  assert.equal(normalizeChapter(save.career).id, CHAPTER.CORPORATE);
  assert.equal(save.career.corp, 'lvyuan-foods');
  assert.equal(save.season.schedule.length, 7);
  assert.ok(save.season.schedule.every((m) => m.round === 'corp'));
  const uniSeasons = save.career.seasons.filter((s) => Number.isInteger(s.uniRank));
  assert.equal(uniSeasons.length, 4, '大學四年逐年封存（＝真的走了 advanceSeason 鏈）');
  assert.equal(save.career.finaleSettled, true);
});
