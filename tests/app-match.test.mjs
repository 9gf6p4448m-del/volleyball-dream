// Phase 3 W1 — runMatch 三段拆分的介面契約測試
// 賽前準備（matchConfig）與賽末收束（matchCareer）都是純函式/可注入 IO，node 直測；
// 回合迴圈（matchLoop）是 rAF/DOM 綁定，其等值性由「固定種子 A/B 事件流雜湊比對」把關
// （治具＝?autopilot=1；基準與結果記錄在 docs/phase3-w1-status.md）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMatchConfig, resolveTechGates } from '../src/app/matchConfig.js';
import {
  markMatchStarted, settleCareerMatch, careerReturnUrl,
} from '../src/app/matchCareer.js';
import {
  createCareer, createCareerPlayer, matchSeed,
} from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { createGame } from '../src/sim/game.js';

function mapStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function makeCareerCtx() {
  const store = createCareerStore(mapStorage());
  const career = createCareer({ seed: 123, playerName: '測試' });
  const player = createCareerPlayer('測試');
  store.saveCareer(career);
  store.savePlayer(player);
  return { store, career, player, matchEntry: career.schedule[0] };
}

test('resolveMatchConfig：種子優先序＝?seed > 生涯場次種子 > randomSeed', () => {
  const careerCtx = makeCareerCtx();
  // ①快速比賽無 ?seed：吃 randomSeed
  const quick = resolveMatchConfig({
    params: new URLSearchParams(''), careerCtx: null, randomSeed: 999,
  });
  assert.equal(quick.seed, 999);
  assert.equal(quick.careerSetup, null);
  assert.deepEqual(quick.tapeClips, []);
  assert.equal(quick.gameOptions.teams, undefined); // 快速比賽用預設隊伍
  // ②生涯無 ?seed：由生涯種子×場次 id 決定論導出
  const career = resolveMatchConfig({
    params: new URLSearchParams(''), careerCtx, randomSeed: 999,
  });
  assert.equal(career.seed, matchSeed(careerCtx.career, 'group-1'));
  // ③?seed= 覆寫一切（重現/測試用）
  const forced = resolveMatchConfig({
    params: new URLSearchParams('seed=777'), careerCtx, randomSeed: 999,
  });
  assert.equal(forced.seed, 777);
});

test('resolveMatchConfig：生涯建隊注入主角、gameOptions 齊備、points 夾限', () => {
  const careerCtx = makeCareerCtx();
  const config = resolveMatchConfig({
    params: new URLSearchParams('points=3'), careerCtx, randomSeed: 1,
  });
  // 主角 Player 佔 A 隊主攻手槽（同一參照——場中的成長寫回同物件）
  assert.equal(config.gameOptions.teams.A[1], careerCtx.player);
  assert.ok(config.gameOptions.aiProfiles.B); // 對手 AI 風格已注入
  assert.ok(config.gameOptions.liberos.A);    // 自由人雙方都有
  assert.equal(config.setTarget, 5);          // points=3 夾到下限 5
  // gameOptions 可直接餵 createGame（契約：不需再補欄位）
  const game = createGame(config.gameOptions);
  assert.equal(game.players.A2, careerCtx.player);
});

test('resolveTechGates：快速比賽全開；生涯新人全鎖、讀攔網檔位由 reaction 決定', () => {
  const quickGame = createGame({ seed: 5 });
  const open = resolveTechGates(quickGame, 'A2', false);
  for (const k of ['canTip', 'canPipe', 'canJumpServe', 'canFloatServe', 'canFeint', 'canDive']) {
    assert.equal(open[k], true, k);
  }
  assert.equal(open.readTier, 'instant');

  const careerCtx = makeCareerCtx();
  const config = resolveMatchConfig({
    params: new URLSearchParams(''), careerCtx, randomSeed: 1,
  });
  const careerGame = createGame(config.gameOptions);
  const locked = resolveTechGates(careerGame, 'A2', true);
  for (const k of ['canTip', 'canPipe', 'canJumpServe', 'canFloatServe', 'canFeint', 'canDive']) {
    assert.equal(locked[k], false, k); // 生涯新人技術全鎖（故事線傳授解鎖）
  }
  assert.equal(locked.readTier, 'slow'); // reaction 60 → 55-69 檔＝slow
});

test('markMatchStarted＋settleCareerMatch：開賽落 pending、局終記結果/累熟練度/併情蒐', () => {
  const careerCtx = makeCareerCtx();
  markMatchStarted(careerCtx);
  assert.equal(careerCtx.store.loadCareer().pendingMatch, 'group-1');

  const fakeGame = {
    players: { A2: { teamId: 'A' } },
    match: { score: { A: 5, B: 3 }, winner: 'A' },
    events: [],
    scoutTally: {
      A2: { zones: { line: 2, cross: 1, middle: 0, tip: 0 }, feints: 1, spikes: 3 },
    },
  };
  const { saveOk, won } = settleCareerMatch({
    careerCtx, game: fakeGame, playerId: 'A2', feintsUsed: 2,
  });
  assert.equal(saveOk, true);
  assert.equal(won, true);
  const saved = careerCtx.store.loadCareer();
  assert.equal(saved.pendingMatch, undefined); // 完賽清 pending（recordResult 內建）
  assert.equal(saved.results.length, 1);
  assert.equal(saved.results[0].matchId, 'group-1');
  assert.equal(saved.results[0].won, true);
  assert.equal(saved.results[0].scoreFor, 5);
  assert.equal(saved.results[0].scoreAgainst, 3);
  assert.ok(saved.growthPoints > 0); // 保底＋勝場點數
  assert.equal(saved.scouting['north-tech'].zones.line, 2); // 情蒐入庫
  assert.equal(careerCtx.store.loadPlayer().techniques.feintUses, 2); // 熟練度累積
});

test('settleCareerMatch：儲存空間不可用 → saveOk=false（呼叫端顯示警示，不炸）', () => {
  const careerCtx = makeCareerCtx();
  // 換成寫入必炸的 storage（配額滿/私密模式情境）
  const broken = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  careerCtx.store = createCareerStore(broken);
  const fakeGame = {
    players: { A2: { teamId: 'A' } },
    match: { score: { A: 2, B: 5 }, winner: 'B' },
    events: [],
    scoutTally: {},
  };
  const { saveOk, won } = settleCareerMatch({
    careerCtx, game: fakeGame, playerId: 'A2', feintsUsed: 0,
  });
  assert.equal(saveOk, false);
  assert.equal(won, false);
});

test('careerReturnUrl：保留 points/classic/assist、帶 career=resume', () => {
  const url = careerReturnUrl(
    new URLSearchParams('points=15&classic=1&hud=1'), '/volleyball/',
  );
  const back = new URLSearchParams(url.split('?')[1]);
  assert.equal(back.get('career'), 'resume');
  assert.equal(back.get('points'), '15');
  assert.equal(back.get('classic'), '1');
  assert.equal(back.get('hud'), null); // 白名單外參數不帶
  assert.equal(back.get('assist'), null); // 原網址沒有就不帶
});
