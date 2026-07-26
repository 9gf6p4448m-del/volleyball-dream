// Phase 4 W1 — 三屆快進整合（工單第 5 項）：模擬連打三屆，名冊換血全鏈無錯、
// 第 3 屆結束停在收束（生涯結算＝W4）；同 seed 兩輪逐字相同（決定論）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer, createCareerPlayer, careerStage } from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { ensureStarterRoster } from '../src/career/roster.js';
import { validateLineup, checkRoleStructure } from '../src/career/lineup.js';
import { settleCareerMatch } from '../src/app/matchCareer.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const winGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 25, B: 18 }, winner: 'A' }, events: [], scoutTally: {} };
const loseGame = { players: { A2: { teamId: 'A' } }, match: { score: { A: 19, B: 25 }, winner: 'B' }, events: [], scoutTally: {} };

// 打完一屆：小組全勝＋八強敗（止步收束）——走正式結算路徑（settleCareerMatch）
function playSeason(store) {
  for (;;) {
    const career = store.loadCareer();
    const next = career.schedule.find((m) => !career.results.some((r) => r.matchId === m.id));
    if (!next || careerStage(career) === 'eliminated') break;
    settleCareerMatch({
      careerCtx: { store, career, player: store.loadPlayer(), matchEntry: next },
      game: next.stage === 'national' ? loseGame : winGame,
      playerId: 'A2',
    });
    if (careerStage(store.loadCareer()) === 'eliminated') break;
  }
}

function runThreeSeasons(seed) {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  const advances = [];
  playSeason(store); // 第 1 屆
  advances.push(store.advanceSeason());
  playSeason(store); // 第 2 屆
  advances.push(store.advanceSeason());
  playSeason(store); // 第 3 屆
  return { store, advances };
}

test('三屆快進：換血全鏈無錯——每屆名冊/先發合法、畢業與新生按年級表演進', () => {
  const { store, advances } = runThreeSeasons(777);
  assert.ok(advances[0] && advances[0].ok);
  assert.ok(advances[1] && advances[1].ok);
  // 第 1→2 屆：大山＋阿烈畢業；手寫 MB（N1）＋補位員入隊
  assert.deepEqual(advances[0].graduates.map((m) => m.id).sort(), ['A3', 'A4']);
  assert.ok(advances[0].freshmen.some((f) => f.id === 'N1' && f.origin === 'handwritten'));
  // 第 2→3 屆：阿岩（基準 2）畢業；阿哲/小飛/小守（基準 1）仍在
  assert.deepEqual(advances[1].graduates.map((m) => m.id), ['A6']);
  const roster = store.loadRoster();
  const ids = roster.members.map((m) => m.id);
  for (const id of ['A1', 'A5', 'AL', 'N1']) assert.ok(ids.includes(id), `${id} 應在第 3 屆名冊`);
  for (const id of ['A3', 'A4', 'A6']) assert.ok(!ids.includes(id), `${id} 應已畢業`);
  assert.deepEqual(roster.alumni.map((a) => a.member.id).sort(), ['A3', 'A4', 'A6']);
  // 第 3 屆全員年級合法（1-3）、最後一屆的老三人組皆三年級
  for (const m of roster.members) assert.ok([1, 2, 3].includes(m.growth.grade), `${m.id} 年級非法`);
  assert.equal(roster.members.find((m) => m.id === 'A1').growth.grade, 3);
  // 名冊＋校友全名不重複（新生抽名不撞）
  const names = [...roster.members, ...roster.alumni.map((a) => a.member)].map((m) => m.fullName);
  assert.equal(new Set(names).size, names.length);
  // 每屆先發合法（含玩家、對位結構）
  const lineup = store.loadLineup();
  assert.equal(validateLineup(lineup, roster.members, 'A2').valid, true);
  assert.equal(checkRoleStructure(lineup.starters, roster.members, 'A2').legal, true);
  assert.equal(store.seasonIndex(), 3);
});

test('第 3 屆結束停在收束：advanceSeason 回 false（高中章三屆封頂，生涯結算＝W4）', () => {
  const { store } = runThreeSeasons(888);
  assert.equal(careerStage(store.loadCareer()), 'eliminated'); // 已收束
  assert.equal(store.advanceSeason(), false); // 不得推進第 4 屆
  assert.equal(store.seasonIndex(), 3);
});

test('決定論：同 seed 快進兩次三屆——名冊/新生/校友/先發逐字相同', () => {
  const a = runThreeSeasons(4242);
  const b = runThreeSeasons(4242);
  assert.deepEqual(a.store.loadRoster(), b.store.loadRoster());
  assert.deepEqual(a.store.loadLineup(), b.store.loadLineup());
  assert.deepEqual(a.advances[0].freshmen, b.advances[0].freshmen);
  assert.deepEqual(a.advances[1].freshmen, b.advances[1].freshmen);
  // 不同 seed＝下屆種子不同→補位員可不同（至少不保證相同；只驗不炸且合法）
  const c = runThreeSeasons(31337);
  assert.equal(validateLineup(c.store.loadLineup(), c.store.loadRoster().members, 'A2').valid, true);
});
