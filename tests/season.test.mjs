// W5 賽季輪迴測試：advanceSeason 純函式（重置賽程/戰績、seed 決定論衍生、titles 綁奪冠）、
// store 層（index+1、名冊/招募/技巧全保留）、衛冕屆對手升級（難度綁成就不綁屆數）、
// 招募跨屆累積（對抗式審查 MEDIUM 轉驗收條款：第二屆再勝同隊 wins+1）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCareer, createCareerPlayer, recordResult, advanceSeason, careerStage,
  matchSeed, careerMatchSetup, TITLE_LEVEL_BONUS, opponentById,
} from '../src/career/careerState.js';
import { ensureStarterRoster } from '../src/career/roster.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { progressOf } from '../src/career/recruitment.js';
import { settleCareerMatch } from '../src/app/matchCareer.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 打完整一屆（全勝＝champion／首場全國賽輸＝eliminated）
function playSeason(career, { champion }) {
  let c = career;
  for (const m of c.schedule) {
    const won = champion || m.stage === 'group';
    c = recordResult(c, { matchId: m.id, won, scoreFor: won ? 25 : 20, scoreAgainst: won ? 20 : 25 });
    if (!won) break; // 全國賽輸＝止步，賽季結束
  }
  return c;
}

test('advanceSeason：止步→重置賽程戰績、seed 決定論衍生、titles 不變', () => {
  const c0 = createCareer({ seed: 777, playerName: '測' });
  const ended = playSeason(c0, { champion: false });
  assert.equal(careerStage(ended), 'eliminated');
  const s2 = advanceSeason(ended);
  assert.equal(s2.results.length, 0);
  assert.equal(s2.schedule.length, 6);
  assert.notEqual(s2.seed, ended.seed);
  assert.deepEqual(advanceSeason(ended), s2); // 決定論：同輸入同輸出
  assert.equal(s2.titles ?? 0, 0); // 止步不加冠
  // 其餘欄位保留
  assert.equal(s2.playerName, '測');
  assert.equal(s2.growthPoints, ended.growthPoints);
});

test('advanceSeason：奪冠→titles+1；賽季未結束＝no-op', () => {
  const c0 = createCareer({ seed: 42, playerName: '測' });
  const champ = playSeason(c0, { champion: true });
  assert.equal(careerStage(champ), 'champion');
  assert.equal(advanceSeason(champ).titles, 1);
  // 進行中賽季不得輪迴
  const mid = recordResult(c0, { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 10 });
  assert.equal(advanceSeason(mid), mid);
});

test('matchSeed：同場次跨屆種子不同（第二屆比賽不重演第一屆）', () => {
  const c0 = createCareer({ seed: 777, playerName: '測' });
  const s2 = advanceSeason(playSeason(c0, { champion: false }));
  for (const id of ['group-1', 'national-final']) {
    assert.notEqual(matchSeed(c0, id), matchSeed(s2, id));
  }
});

test('衛冕屆對手升級：titles 拉高對手全屬性；止步屆（titles 0）原強度', () => {
  const player = createCareerPlayer('測');
  const c0 = createCareer({ seed: 7, playerName: '測' });
  const entry = c0.schedule[0]; // group-1 vs north-tech
  const base = careerMatchSetup(c0, player, entry).teams.B[0].attributes.power;
  const defended = careerMatchSetup({ ...c0, titles: 2 }, player, entry).teams.B[0].attributes.power;
  assert.equal(defended, base + TITLE_LEVEL_BONUS * 2);
  assert.equal(opponentById('north-tech').level, 52); // 參數檔本體不得被污染
});

test('store.advanceSeason：index+1、名冊/招募/lineup/技巧/宿敵/已播事件全保留', () => {
  const store = createCareerStore(fakeStorage());
  const c0 = createCareer({ seed: 99, playerName: '測' });
  const player = createCareerPlayer('測');
  player.techniques.dive = 1;
  store.saveCareer({ ...playSeason(c0, { champion: false }), scouting: { obsidian: { spikes: 9 } }, events: ['debut'] });
  store.savePlayer(player);
  ensureStarterRoster(store);
  store.saveRecruitment({ progress: { 'north-tech': { wins: 1, feat: 0, stageCleared: false } }, recruited: [] });
  assert.equal(store.advanceSeason(), true);
  assert.equal(store.seasonIndex(), 2);
  const view = store.loadCareer();
  assert.equal(view.results.length, 0);
  assert.deepEqual(view.scouting, { obsidian: { spikes: 9 } }); // 宿敵記憶延續
  assert.deepEqual(view.events, ['debut']); // 已播事件不重播
  assert.equal(store.loadPlayer().techniques.dive, 1);
  assert.equal(progressOf(store.loadRecruitment(), 'north-tech').wins, 1); // 招募進度保留
  assert.ok(store.loadRoster().members.length > 0);
  assert.notEqual(store.loadLineup().starters, null);
  // 賽季進行中再按＝no-op
  assert.equal(store.advanceSeason(), false);
});

// W6 A2 改寫：第二屆小組改輪抽，不再保證同場次同對手——驗收條款的本意（跨屆再勝
// 同隊＝wins 累積）改以①指定邀請保證北原再現＋②泛化斷言「第二屆小組每勝一隊＝
// 該隊 wins 恰 +1」把關
test('招募跨屆累積（驗收條款）：第二屆再勝同隊 → progress.wins +1', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 5, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  const game = {
    players: { A2: { teamId: 'A' } },
    match: { score: { A: 25, B: 20 }, winner: 'A' },
    events: [{ type: 'SCORE', team: 'A' }],
    scoutTally: {},
  };
  const settleAll = () => { // 打完一屆：小組全勝、八強輸（止步）
    let career = store.loadCareer();
    for (const mid of ['group-1', 'group-2', 'group-3', 'national-qf']) {
      career = store.loadCareer();
      const matchEntry = career.schedule.find((m) => m.id === mid);
      const g = mid === 'national-qf'
        ? { ...game, match: { score: { A: 20, B: 25 }, winner: 'B' } }
        : game;
      settleCareerMatch({
        careerCtx: { store, career, player: store.loadPlayer(), matchEntry }, game: g, playerId: 'A2',
      });
    }
  };
  settleAll();
  assert.equal(progressOf(store.loadRecruitment(), 'north-tech').wins, 1);
  const winsAfterS1 = Object.fromEntries(
    ['north-tech', 'white-wave', 'obsidian', 'iron-mist', 'sky-hawk']
      .map((id) => [id, progressOf(store.loadRecruitment(), id).wins]),
  );
  assert.equal(store.advanceSeason({ invitedId: 'north-tech' }), true); // 邀請＝保證再遇
  const s2group = store.loadCareer().schedule.filter((m) => m.stage === 'group');
  assert.ok(s2group.some((m) => m.opponentId === 'north-tech'));
  settleAll(); // 第二屆再打——場次 id 同、對手依輪抽
  assert.equal(
    progressOf(store.loadRecruitment(), 'north-tech').wins,
    winsAfterS1['north-tech'] + 1,
    '第二屆再勝 north-tech 必須 +1',
  );
  // 泛化：第二屆小組每勝一隊＝該隊 wins 恰 +1（八強輸＝鐵霧不加）
  for (const m of s2group) {
    assert.equal(
      progressOf(store.loadRecruitment(), m.opponentId).wins,
      (winsAfterS1[m.opponentId] ?? 0) + 1,
      `${m.opponentId} 第二屆勝場累積錯誤`,
    );
  }
  assert.equal(
    progressOf(store.loadRecruitment(), 'iron-mist').wins,
    winsAfterS1['iron-mist'] + (s2group.some((m) => m.opponentId === 'iron-mist') ? 1 : 0),
  );
});

test('titles 投影 roundtrip：saveCareer→loadCareer 不蒸發（events 漏存教訓）', () => {
  const store = createCareerStore(fakeStorage());
  const c = { ...createCareer({ seed: 3, playerName: '測' }), titles: 2 };
  store.saveCareer(c);
  store.savePlayer(createCareerPlayer('測'));
  assert.equal(store.loadCareer().titles, 2);
  store.saveCareer(store.loadCareer()); // 再存一輪也不掉
  assert.equal(store.loadCareer().titles, 2);
});
