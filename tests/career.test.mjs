// Phase 2 stage 1 — 生涯資料層與存檔層測試
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAREER_VERSION, GROUP_OPPONENTS, createCareer, createCareerPlayer, careerTeams,
  nextMatch, recordResult, careerRecord, matchSeed, serializeCareer, deserializeCareer,
} from '../src/career/careerState.js';
import { createCareerStore, CAREER_KEY, PLAYER_KEY } from '../src/career/careerStore.js';
import { deserializePlayer, serializePlayer } from '../src/sim/player.js';
import { createGame, stepGame } from '../src/sim/game.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

// ---- careerState ----

test('createCareer：小組賽 3 場、初始結構完整', () => {
  const c = createCareer({ seed: 42, playerName: '測試員' });
  assert.equal(c.version, CAREER_VERSION);
  assert.equal(c.stage, 'group');
  assert.equal(c.schedule.length, 3);
  assert.equal(c.results.length, 0);
  assert.deepEqual(c.schedule.map((m) => m.opponentId), GROUP_OPPONENTS.map((o) => o.id));
});

test('createCareer：缺 seed 直接 throw', () => {
  assert.throws(() => createCareer({}), /seed/);
});

test('nextMatch：依序推進，全打完為 null', () => {
  let c = createCareer({ seed: 1 });
  assert.equal(nextMatch(c).id, 'group-1');
  c = recordResult(c, { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 20 });
  assert.equal(nextMatch(c).id, 'group-2');
  c = recordResult(c, { matchId: 'group-2', won: false, scoreFor: 21, scoreAgainst: 25 });
  c = recordResult(c, { matchId: 'group-3', won: true, scoreFor: 25, scoreAgainst: 23 });
  assert.equal(nextMatch(c), null);
  assert.deepEqual(careerRecord(c), { wins: 2, losses: 1, played: 3 });
});

test('recordResult：不可變更新且帶入 opponentId', () => {
  const c = createCareer({ seed: 7 });
  const c2 = recordResult(c, { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 18 });
  assert.equal(c.results.length, 0); // 原物件不動
  assert.equal(c2.results.length, 1);
  assert.equal(c2.results[0].opponentId, c.schedule[0].opponentId);
});

test('recordResult：同場重複記錄原樣返回（局終畫面重入保護）', () => {
  const c = recordResult(createCareer({ seed: 7 }),
    { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 18 });
  const again = recordResult(c, { matchId: 'group-1', won: false, scoreFor: 0, scoreAgainst: 25 });
  assert.equal(again, c);
});

test('recordResult：未知 matchId 直接 throw', () => {
  assert.throws(
    () => recordResult(createCareer({ seed: 7 }), { matchId: 'nope', won: true, scoreFor: 0, scoreAgainst: 0 }),
    /賽程/,
  );
});

test('matchSeed：決定論且三場彼此相異、不同生涯種子相異', () => {
  const c = createCareer({ seed: 99 });
  const seeds = c.schedule.map((m) => matchSeed(c, m.id));
  assert.deepEqual(seeds, c.schedule.map((m) => matchSeed(c, m.id))); // 同輸入同值
  assert.equal(new Set(seeds).size, 3); // 場場不同
  const c2 = createCareer({ seed: 100 });
  assert.notEqual(matchSeed(c, 'group-1'), matchSeed(c2, 'group-1'));
  for (const s of seeds) assert.ok(Number.isInteger(s) && s > 0);
});

test('serializeCareer/deserializeCareer：roundtrip 一致、壞檔擋下', () => {
  const c = recordResult(createCareer({ seed: 5, playerName: '阿夢' }),
    { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 11 });
  assert.deepEqual(deserializeCareer(serializeCareer(c)), c);
  assert.throws(() => deserializeCareer(JSON.stringify({ version: 999 })), /版本/);
  assert.throws(() => deserializeCareer(JSON.stringify({ version: CAREER_VERSION, seed: 1 })), /缺欄位/);
});

test('createCareerPlayer：通過 Player 序列化驗證且佔 A2 槽', () => {
  const p = createCareerPlayer('小夢');
  const back = deserializePlayer(serializePlayer(p));
  assert.equal(back.id, 'A2');
  assert.equal(back.teamId, 'A');
  assert.equal(back.currentRole, 'outside');
});

test('careerTeams：玩家塞回 A 隊主攻手槽、非 A2 拒絕', () => {
  const p = createCareerPlayer('小夢');
  const teams = careerTeams(p);
  assert.equal(teams.A[1], p);
  assert.equal(teams.A.length, 6);
  assert.equal(teams.B.length, 6);
  assert.throws(() => careerTeams({ id: 'B1', teamId: 'B' }), /A2/);
});

test('careerTeams 餵進 createGame 可正常推進（生涯數值進 sim 的通道）', () => {
  const p = createCareerPlayer('主角名');
  const game = createGame({ seed: 123, teams: careerTeams(p), setTarget: 5 });
  assert.equal(game.players.A2.name, '主角名');
  for (let i = 0; i < 120; i += 1) stepGame(game, []);
  assert.equal(typeof game.match.score.A, 'number');
});

test('careerState 純度：零 DOM/localStorage/非種子隨機', () => {
  const src = readFileSync(new URL('../src/career/careerState.js', import.meta.url), 'utf8');
  for (const banned of ['localStorage', 'document.', 'window.', 'Math.random(', 'Date.now(', "from 'three'"]) {
    assert.ok(!src.includes(banned), `careerState.js 不得出現 ${banned}`);
  }
});

// ---- careerStore ----

test('careerStore：career 與 Player 分 key 存讀 roundtrip', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 8, playerName: '阿夢' });
  const player = createCareerPlayer('阿夢');
  assert.equal(store.hasSave(), false);
  assert.ok(store.saveCareer(career));
  assert.ok(store.savePlayer(player));
  assert.equal(store.hasSave(), true);
  assert.ok(storage._map.has(CAREER_KEY) && storage._map.has(PLAYER_KEY)); // 真的分兩把 key
  assert.deepEqual(store.loadCareer(), career);
  assert.deepEqual(store.loadPlayer(), player);
});

test('careerStore：壞檔安全降級為 null 不炸', () => {
  const storage = fakeStorage();
  storage.setItem(CAREER_KEY, '{"version":1,壞掉');
  storage.setItem(PLAYER_KEY, 'not json');
  const store = createCareerStore(storage);
  assert.equal(store.loadCareer(), null);
  assert.equal(store.loadPlayer(), null);
});

test('careerStore：匯出→清空→匯入 roundtrip', () => {
  const store = createCareerStore(fakeStorage());
  const career = recordResult(createCareer({ seed: 3, playerName: 'IO' }),
    { matchId: 'group-1', won: false, scoreFor: 19, scoreAgainst: 25 });
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('IO'));
  const exported = store.exportSave();
  store.clear();
  assert.equal(store.hasSave(), false);
  const { career: back } = store.importSave(exported);
  assert.deepEqual(back, career);
  assert.equal(store.hasSave(), true);
});

test('careerStore：匯入垃圾/錯格式直接 throw 且不落檔', () => {
  const store = createCareerStore(fakeStorage());
  assert.throws(() => store.importSave('{"format":"別的遊戲"}'), /排球夢/);
  assert.throws(() => store.importSave(JSON.stringify({
    format: 'volleyball-dream-save', career: { version: 1 }, player: {},
  })));
  assert.equal(store.hasSave(), false);
});

test('careerStore：storage 寫入炸掉時回 false 不中斷', () => {
  const store = createCareerStore({
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceeded'); },
    removeItem: () => {},
  });
  assert.equal(store.saveCareer(createCareer({ seed: 1 })), false);
});
