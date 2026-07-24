// Phase 3 W6 — 跨屆隊友成長冪等鍵回歸（C1 治具抓到的 W5 潛伏 bug）：
// applyRosterGrowth 冪等鍵原本只認 matchId，而 W5 賽季輪迴後 matchId 每屆重複
// （group-1…）→ 第二屆起隊友成長全數被誤判「已長過」而靜默跳過。
// 修法＝冪等鍵帶屆數（log 條目 season 欄；舊條目無欄＝第 1 屆、season===1 不寫欄位
// ——第 1 屆序列化逐位不變）。本檔把關：單元層（roster.js）＋整合層（matchCareer
// settleCareerMatch 經 store.seasonIndex 傳屆數）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRosterGrowth, buildStarterMembers, ensureStarterRoster } from '../src/career/roster.js';
import {
  createCareer, createCareerPlayer, recordResult,
} from '../src/career/careerState.js';
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

test('applyRosterGrowth：同 matchId 不同屆各長一次；同屆重入冪等', () => {
  const members = buildStarterMembers();
  const s1 = applyRosterGrowth(members, [], 'A', 'group-1', 1);
  assert.equal(s1[0].growth.log.length, 1);
  // 同屆重入＝原樣返回（冪等不變）
  const s1again = applyRosterGrowth(s1, [], 'A', 'group-1', 1);
  assert.equal(s1again[0], s1[0]);
  // 第 2 屆同 matchId＝新的一場，必須再長（修前這裡會被誤跳過）
  const s2 = applyRosterGrowth(s1, [], 'A', 'group-1', 2);
  assert.equal(s2[0].growth.log.length, 2);
  // 第 2 屆重入冪等
  const s2again = applyRosterGrowth(s2, [], 'A', 'group-1', 2);
  assert.equal(s2again[0], s2[0]);
});

test('applyRosterGrowth：第 1 屆 log 條目不帶 season 欄（序列化逐位相容）', () => {
  const s1 = applyRosterGrowth(buildStarterMembers(), [], 'A', 'group-1', 1);
  assert.equal('season' in s1[0].growth.log[0], false);
  const s2 = applyRosterGrowth(s1, [], 'A', 'group-1', 2);
  assert.equal(s2[0].growth.log[1].season, 2);
});

test('applyRosterGrowth：省略 season 參數＝第 1 屆（既有呼叫端相容）', () => {
  const s1 = applyRosterGrowth(buildStarterMembers(), [], 'A', 'group-1');
  const blocked = applyRosterGrowth(s1, [], 'A', 'group-1', 1);
  assert.equal(blocked[0], s1[0]);
});

// 整合層：settleCareerMatch 在第 2 屆結算同名場次，隊友成長必須照長
test('settleCareerMatch：第 2 屆同名場次隊友成長不被第 1 屆 log 冪等擋掉', () => {
  const store = createCareerStore(fakeStorage());
  const player = createCareerPlayer('測');
  let career = createCareer({ seed: 7, playerName: '測' });
  store.saveCareer(career);
  store.savePlayer(player);
  ensureStarterRoster(store);

  const fakeGame = (winner) => ({
    players: { A2: { teamId: 'A' } },
    match: { score: { A: 15, B: 8 }, winner },
    events: [],
    scoutTally: {},
  });
  const settle = () => settleCareerMatch({
    careerCtx: {
      store,
      career: store.loadCareer(),
      matchEntry: { id: 'group-1', opponentId: 'north-tech' },
      player,
    },
    game: fakeGame('A'),
    playerId: 'A2',
  });

  settle(); // 第 1 屆 group-1
  assert.equal(store.loadRoster().members[0].growth.log.length, 1);

  // 收掉第 1 屆（餘場直接記結果；國賽一敗＝止步）→ 推進第 2 屆
  career = store.loadCareer();
  for (const [id, won] of [['group-2', true], ['group-3', true], ['national-qf', false]]) {
    career = recordResult(career, { matchId: id, won, scoreFor: won ? 15 : 8, scoreAgainst: won ? 8 : 15 });
  }
  store.saveCareer(career);
  assert.equal(store.advanceSeason(), true);
  assert.equal(store.seasonIndex(), 2);

  settle(); // 第 2 屆 group-1（修前：靜默跳過、log 仍為 1）
  const log = store.loadRoster().members[0].growth.log;
  assert.equal(log.length, 2);
  assert.equal(log[1].season, 2);
});
