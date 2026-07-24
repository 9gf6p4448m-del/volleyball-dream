// Phase 3 W6 — 換人信任事件（新增採納 6）：被換下 −1、換上有建功 +2、
// 主控不計、重入不重複（settledBefore 閘）、夾限。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCareer, createCareerPlayer } from '../src/career/careerState.js';
import { ensureStarterRoster } from '../src/career/roster.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { settleCareerMatch } from '../src/app/matchCareer.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

test('換人信任：被換下 −1、換上建功 +2、重入不重複', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 9, playerName: '測' }));
  const player = createCareerPlayer('測');
  store.savePlayer(player);
  ensureStarterRoster(store);
  const before = store.loadLineup().trust;
  // A5 被換下、A6 換上並轟進一球（TOUCH spike→SCORE 歸因）
  const game = {
    players: { A2: { teamId: 'A' } },
    match: { score: { A: 15, B: 10 }, winner: 'A' },
    events: [
      { type: 'SUBSTITUTION', tick: 100, team: 'A', outId: 'A5', inId: 'A6' },
      { type: 'TOUCH', tick: 200, team: 'A', playerId: 'A6', kind: 'spike', power: 1 },
      { type: 'SCORE', tick: 210, team: 'A' },
    ],
    scoutTally: {},
  };
  const settle = () => settleCareerMatch({
    careerCtx: {
      store, career: store.loadCareer(), player,
      matchEntry: { id: 'group-1', opponentId: 'north-tech' },
    },
    game, playerId: 'A2',
  });
  settle();
  const after = store.loadLineup().trust;
  assert.equal(after.A5, (before.A5 ?? 20) - 1, '被換下 −1');
  assert.equal(after.A6, (before.A6 ?? 20) + 2, '換上建功 +2');
  settle(); // 局終畫面重入＝不重複扣加
  assert.deepEqual(store.loadLineup().trust, after);
});

test('換人信任：換上未建功不加分；無換人事件完全不動 lineup', () => {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 10, playerName: '測' }));
  const player = createCareerPlayer('測');
  store.savePlayer(player);
  ensureStarterRoster(store);
  const before = store.loadLineup().trust;
  const settleWith = (events, matchId) => settleCareerMatch({
    careerCtx: {
      store, career: store.loadCareer(), player,
      matchEntry: { id: matchId, opponentId: 'north-tech' },
    },
    game: {
      players: { A2: { teamId: 'A' } },
      match: { score: { A: 15, B: 10 }, winner: 'A' },
      events,
      scoutTally: {},
    },
    playerId: 'A2',
  });
  settleWith([{ type: 'SUBSTITUTION', tick: 5, team: 'A', outId: 'A5', inId: 'A6' }], 'group-1');
  const after = store.loadLineup().trust;
  assert.equal(after.A5, (before.A5 ?? 20) - 1);
  assert.equal(after.A6, before.A6 ?? 20, '未建功不加');
  // 無換人事件的場次：trust 原樣
  settleWith([], 'group-2');
  assert.deepEqual(store.loadLineup().trust, after);
});
