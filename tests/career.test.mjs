// Phase 2 — 生涯資料層/存檔層（stage 1）＋對手參數化/錦標賽流程（stage 2）測試
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAREER_VERSION, createCareer, createCareerPlayer, careerTeams, buildOpponentTeam,
  careerMatchSetup, careerStage, nextMatch, recordResult, careerRecord, matchSeed,
  serializeCareer, deserializeCareer, OPPONENTS, opponentById,
} from '../src/career/careerState.js';
import { createCareerStore, SAVE_KEY } from '../src/career/careerStore.js';
import { deserializePlayer, serializePlayer, ATTRIBUTE_KEYS } from '../src/sim/player.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, aiProfileOf } from '../src/sim/ai.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

// 快速走完 n 場（依 nextMatch 順序記錄結果）
function playThrough(career, outcomes) {
  let c = career;
  for (const won of outcomes) {
    const m = nextMatch(c);
    assert.ok(m, '還有比賽可打（測試前提）');
    c = recordResult(c, { matchId: m.id, won, scoreFor: won ? 25 : 20, scoreAgainst: won ? 20 : 25 });
  }
  return c;
}

// ---- careerState（stage 1 基礎）----

test('createCareer：小組 3 場＋全國賽 3 輪、初始結構完整', () => {
  const c = createCareer({ seed: 42, playerName: '測試員' });
  assert.equal(c.version, CAREER_VERSION);
  assert.equal(c.schedule.length, 6);
  assert.deepEqual(c.schedule.filter((m) => m.stage === 'group').map((m) => m.opponentId),
    ['north-tech', 'white-wave', 'obsidian']);
  assert.deepEqual(c.schedule.filter((m) => m.stage === 'national').map((m) => m.opponentId),
    ['iron-mist', 'obsidian', 'sky-hawk']); // 準決賽再遇曜石＝宿敵鉤子
  assert.equal(c.results.length, 0);
  assert.equal(careerStage(c), 'group');
});

test('createCareer：缺 seed 直接 throw', () => {
  assert.throws(() => createCareer({}), /seed/);
});

test('小組賽輸球不中斷：連輸三場照樣晉級全國賽', () => {
  const c = playThrough(createCareer({ seed: 1 }), [false, false, false]);
  assert.equal(careerStage(c), 'national');
  assert.equal(nextMatch(c).id, 'national-qf');
  assert.deepEqual(careerRecord(c), { wins: 0, losses: 3, played: 3 });
});

test('全國賽單淘汰：八強落敗＝止步、沒有下一場', () => {
  const c = playThrough(createCareer({ seed: 2 }), [true, true, true, false]);
  assert.equal(careerStage(c), 'eliminated');
  assert.equal(nextMatch(c), null);
});

test('全國賽全勝＝冠軍收束', () => {
  const c = playThrough(createCareer({ seed: 3 }), [true, false, true, true, true, true]);
  assert.equal(careerStage(c), 'champion');
  assert.equal(nextMatch(c), null);
  assert.deepEqual(careerRecord(c), { wins: 5, losses: 1, played: 6 });
});

test('recordResult：不可變更新、帶入 opponentId、重複記錄原樣返回', () => {
  const c = createCareer({ seed: 7 });
  const c2 = recordResult(c, { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 18 });
  assert.equal(c.results.length, 0);
  assert.equal(c2.results[0].opponentId, 'north-tech');
  const again = recordResult(c2, { matchId: 'group-1', won: false, scoreFor: 0, scoreAgainst: 25 });
  assert.equal(again, c2);
  assert.throws(() => recordResult(c, { matchId: 'nope', won: true, scoreFor: 0, scoreAgainst: 0 }), /賽程/);
});

test('matchSeed：決定論、六場彼此相異、不同生涯種子相異', () => {
  const c = createCareer({ seed: 99 });
  const seeds = c.schedule.map((m) => matchSeed(c, m.id));
  assert.deepEqual(seeds, c.schedule.map((m) => matchSeed(c, m.id)));
  assert.equal(new Set(seeds).size, 6);
  assert.notEqual(matchSeed(c, 'group-1'), matchSeed(createCareer({ seed: 100 }), 'group-1'));
  for (const s of seeds) assert.ok(Number.isInteger(s) && s > 0);
});

test('serializeCareer/deserializeCareer：roundtrip 一致、壞檔擋下', () => {
  const c = playThrough(createCareer({ seed: 5, playerName: '阿夢' }), [true]);
  assert.deepEqual(deserializeCareer(serializeCareer(c)), c);
  assert.throws(() => deserializeCareer(JSON.stringify({ version: 999 })), /版本/);
  assert.throws(() => deserializeCareer(JSON.stringify({ version: CAREER_VERSION, seed: 1 })), /缺欄位/);
});

test('v1 存檔遷移：舊小組賽程換完整模板、戰績保留', () => {
  const v1 = JSON.stringify({
    version: 1, seed: 711646615, playerName: '小夢', stage: 'group',
    schedule: [
      { id: 'group-1', stage: 'group', opponentId: 'north-tech' },
      { id: 'group-2', stage: 'group', opponentId: 'white-wave' },
      { id: 'group-3', stage: 'group', opponentId: 'obsidian' },
    ],
    results: [{ matchId: 'group-1', opponentId: 'north-tech', won: true, scoreFor: 6, scoreAgainst: 4 }],
  });
  const c = deserializeCareer(v1);
  assert.equal(c.version, CAREER_VERSION);
  assert.equal(c.schedule.length, 6);
  assert.equal(c.results.length, 1);
  assert.equal(c.growthPoints, 4); // v3 遷移：既往 1 場追認 4 點
  assert.equal(careerStage(c), 'group');
  assert.equal(nextMatch(c).id, 'group-2'); // 戰績接續、不重打第一場
});

test('createCareerPlayer：通過 Player 序列化驗證且佔 A2 槽', () => {
  const back = deserializePlayer(serializePlayer(createCareerPlayer('小夢')));
  assert.equal(back.id, 'A2');
  assert.equal(back.teamId, 'A');
  assert.equal(back.currentRole, 'outside');
});

test('careerState 純度：零 DOM/localStorage/非種子隨機', () => {
  for (const file of ['careerState.js', 'opponents.js']) {
    const src = readFileSync(new URL(`../src/career/${file}`, import.meta.url), 'utf8');
    for (const banned of ['localStorage', 'document.', 'window.', 'Math.random(', 'Date.now(', "from 'three'"]) {
      assert.ok(!src.includes(banned), `${file} 不得出現 ${banned}`);
    }
  }
});

// ---- stage 2：對手參數檔與建隊 ----

test('對手參數檔完整性：id 唯一、識別特徵齊備、機率在界內', () => {
  assert.equal(new Set(OPPONENTS.map((o) => o.id)).size, OPPONENTS.length);
  for (const o of OPPONENTS) {
    assert.ok(o.name && o.trait && o.style, `${o.id} 缺 name/trait/style`);
    assert.ok(o.level >= 40 && o.level <= 90, `${o.id} level 超界`);
    assert.equal(o.heights.length, 6, `${o.id} 身高須六槽`);
    for (const k of ['tipRate', 'dumpRate']) {
      assert.ok(o.ai[k] >= 0 && o.ai[k] <= 1, `${o.id}.ai.${k} 超界`);
    }
    for (const k of ['jumpServeRate', 'floatServeRate']) {
      if (o.ai[k] !== undefined) assert.ok(o.ai[k] >= 0 && o.ai[k] <= 1, `${o.id}.ai.${k} 超界`);
    }
  }
  assert.equal(opponentById('north-tech').name, '北原工商');
  assert.equal(opponentById('nope'), null);
});

test('buildOpponentTeam：level＋風格偏移落到屬性與 trust', () => {
  const obsidian = buildOpponentTeam(opponentById('obsidian'));
  assert.equal(obsidian.length, 6);
  assert.deepEqual(obsidian.map((p) => p.id), ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
  assert.ok(obsidian[0].name.startsWith('曜石體中'));
  assert.equal(obsidian[2].currentRole, 'middle');
  assert.equal(obsidian[2].attributes.block, 70); // 60 + roleBias.middle.block 10
  assert.equal(obsidian[2].attributes.jump, 68);
  assert.equal(obsidian[2].trust.fromSetter, 42); // 20 + trustBias.middle 22（快攻隊 MB 高分配）
  assert.equal(obsidian[1].attributes.block, 60); // 非 MB 不吃 roleBias
  const wave = buildOpponentTeam(opponentById('white-wave'));
  assert.equal(wave[1].attributes.power, 53); // 57 + attrBias.power(-4)（07-22 平衡微調後）
  for (const p of wave) for (const k of ATTRIBUTE_KEYS) {
    assert.ok(p.attributes[k] >= 0 && p.attributes[k] <= 100);
  }
});

test('careerMatchSetup：一次拿齊種子/兩隊/AI 風格', () => {
  const career = createCareer({ seed: 55, playerName: '小夢' });
  const player = createCareerPlayer('小夢');
  const entry = nextMatch(career);
  const setup = careerMatchSetup(career, player, entry);
  assert.equal(setup.seed, matchSeed(career, 'group-1'));
  assert.equal(setup.teams.A[1], player);
  assert.ok(setup.teams.B[0].name.startsWith('北原工商'));
  assert.equal(setup.aiProfiles.B.tipRate, 0.06);
  assert.equal(setup.opponent.id, 'north-tech');
  assert.throws(() => careerMatchSetup(career, player, { id: 'x', opponentId: 'nope' }), /未知對手/);
});

test('careerTeams 餵進 createGame 可正常推進（含對手參數隊）', () => {
  const p = createCareerPlayer('主角名');
  const game = createGame({
    seed: 123,
    teams: careerTeams(p, opponentById('iron-mist')),
    setTarget: 5,
  });
  assert.equal(game.players.A2.name, '主角名');
  assert.ok(game.players.B1.name.startsWith('鐵霧工業'));
  for (let i = 0; i < 120; i += 1) stepGame(game, []);
  assert.equal(typeof game.match.score.A, 'number');
  assert.throws(() => careerTeams({ id: 'B1', teamId: 'B' }), /A2/);
});

// ---- stage 2：AI 風格注入 sim ----

test('aiProfileOf：未注入回落預設、注入吃自己的值、舊鍵 powerServeRate 相容', () => {
  const plain = createGame({ seed: 1 });
  assert.deepEqual(aiProfileOf(plain, 'B'),
    { tipRate: 0.1, dumpRate: 0.07, jumpServeRate: 0, floatServeRate: 0 });
  const styled = createGame({
    seed: 1,
    aiProfiles: { B: { tipRate: 0.5, jumpServeRate: 0.9, floatServeRate: 0.3 } },
  });
  assert.equal(aiProfileOf(styled, 'B').tipRate, 0.5);
  assert.equal(aiProfileOf(styled, 'B').jumpServeRate, 0.9);
  assert.equal(aiProfileOf(styled, 'B').floatServeRate, 0.3);
  assert.equal(aiProfileOf(styled, 'B').dumpRate, 0.07); // 缺欄回預設
  const legacy = createGame({ seed: 1, aiProfiles: { B: { powerServeRate: 0.7 } } });
  assert.equal(aiProfileOf(legacy, 'B').jumpServeRate, 0.7); // 改名前舊鍵相容
});

test('jumpServeRate 行為驗證：跳發隊的發球更平更快', () => {
  const speedOfFirstServe = (aiProfiles, team) => {
    const g = createGame({ seed: 77, ...(aiProfiles ? { aiProfiles } : {}) });
    const ai = createAiState();
    while (g.tick < 200000) {
      const ev = stepGame(g, aiCollectIntents(g, ai));
      const s = ev.find((e) => e.type === 'SERVE' && e.team === team);
      if (s) return Math.hypot(g.ball.vx, g.ball.vz);
      if (g.phase === 'set_over') break;
    }
    assert.fail(`${team} 隊在時限內沒發到球`);
  };
  const stable = speedOfFirstServe(null, 'A');
  const jump = speedOfFirstServe({ A: { jumpServeRate: 1 } }, 'A');
  assert.ok(jump > stable * 1.15,
    `跳躍發球應明顯更快（stable=${stable.toFixed(2)} jump=${jump.toFixed(2)}）`);
});

// ---- careerStore（stage 1；Phase 3 W1 起改單一 key schema v2 後端，API 不變）----

test('careerStore：career 與 Player 經單一 v2 key 存讀 roundtrip', () => {
  const storage = fakeStorage();
  const store = createCareerStore(storage);
  const career = createCareer({ seed: 8, playerName: '阿夢' });
  const player = createCareerPlayer('阿夢');
  assert.equal(store.hasSave(), false);
  assert.ok(store.saveCareer(career));
  assert.ok(store.savePlayer(player));
  assert.ok(storage._map.has(SAVE_KEY));
  assert.deepEqual(store.loadCareer(), career);
  assert.deepEqual(store.loadPlayer(), player);
});

test('careerStore：壞檔安全降級為 null 不炸', () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, '{"schemaVersion":2,壞掉');
  const store = createCareerStore(storage);
  assert.equal(store.loadCareer(), null);
  assert.equal(store.loadPlayer(), null);
  assert.equal(store.hasSave(), false);
});

test('careerStore：匯出→清空→匯入 roundtrip（schema v2 單包格式）', () => {
  const store = createCareerStore(fakeStorage());
  const career = playThrough(createCareer({ seed: 3, playerName: 'IO' }), [false]);
  store.saveCareer(career);
  store.savePlayer(createCareerPlayer('IO'));
  const exported = store.exportSave();
  store.clear();
  assert.equal(store.hasSave(), false);
  const { career: back } = store.importSave(exported);
  assert.deepEqual(back, career);
  assert.throws(() => store.importSave('{"format":"別的遊戲"}'), /排球夢/);
});

test('careerStore：storage 寫入炸掉時回 false 不中斷', () => {
  const store = createCareerStore({
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceeded'); },
    removeItem: () => {},
  });
  assert.equal(store.saveCareer(createCareer({ seed: 1 })), false);
});

test('deserializeCareer 語意驗證：未知對手 id 直接拒絕（匯入不留炸彈）', () => {
  const bad = createCareer({ seed: 1 });
  bad.schedule[0] = { ...bad.schedule[0], opponentId: 'ghost-team' };
  assert.throws(() => deserializeCareer(serializeCareer(bad)), /未知對手/);
});

test('棄賽機制（拍板 07-22）：pending 標記→中途退出記 0:25 敗、完賽自動清標', async () => {
  const { markPending, resolveForfeit } = await import('../src/career/careerState.js');
  let c = markPending(createCareer({ seed: 4 }), 'group-1');
  assert.equal(c.pendingMatch, 'group-1');
  // pending 要能存活序列化（reload 後才裁得到）
  assert.equal(deserializeCareer(serializeCareer(c)).pendingMatch, 'group-1');
  // 沒打完就回來：記棄賽敗、無成長點
  const forfeited = resolveForfeit(c);
  assert.equal(forfeited.pendingMatch, undefined);
  assert.deepEqual(
    { won: forfeited.results[0].won, f: forfeited.results[0].scoreFor, gp: forfeited.results[0].gp },
    { won: false, f: 0, gp: 0 },
  );
  // 正常完賽：recordResult 順手清標、resolveForfeit 不再動它
  const done = recordResult(c, { matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 20, gp: 6 });
  assert.equal(done.pendingMatch, undefined);
  assert.equal(resolveForfeit(done), done);
  // 無標記＝原樣返回
  const clean = createCareer({ seed: 4 });
  assert.equal(resolveForfeit(clean), clean);
});

test('生涯主角 trust 初值 40（拍板 07-22：成長弧可見；地板保底不淪為觀眾）', () => {
  assert.equal(createCareerPlayer('小夢').trust.fromSetter, 40);
  assert.equal(createCareerPlayer('小夢').trust.floorShare, 0.27);
});
