// Phase 4 W3 — S 分配決策（setOptions 純函式＋trust 反轉 C 案＋trustFloor 停用）
// 工單 §3/§10：選項池與 AI 舉球同源（attackPointsOf 鏡像）、一傳品質三分支、
// 猶豫門檻邊界、快攻低弧 timing 同 sim 路徑、決策點資料決定論。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { attackPointsOf } from '../src/sim/ai.js';
import {
  setOptionsFor, setPanelTitle, SET_HESITANT_BELOW,
} from '../src/input/setOptions.js';
import { createCareer, createCareerPlayer, careerTeams, PLAYER_TRUST_FLOOR } from '../src/career/careerState.js';
import { createCareerStore } from '../src/career/careerStore.js';
import { ensureStarterRoster } from '../src/career/roster.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// 玩家=S 的生涯建隊 → sim game（治具/實戰同路徑）
function setterGame(seed = 5) {
  const store = createCareerStore(fakeStorage());
  store.saveCareer(createCareer({ seed: 42, playerName: '測' }));
  store.savePlayer(createCareerPlayer('測'));
  ensureStarterRoster(store);
  store.applyPositionChange('setter');
  const teams = careerTeams(store.loadPlayer(), null, store.loadRoster().members, store.loadLineup());
  return { game: createGame({ seed, teams }), store };
}

test('選項池鏡像 AI 舉球池：三分支 kind 集合一致、快攻只在到位、勉強只剩兩翼', () => {
  const { game } = setterGame();
  for (const tier of ['perfect', 'ok', 'poor']) {
    const opts = setOptionsFor(game, { passTier: tier }, 'A2');
    const pts = attackPointsOf(game, 'A', 'A2', tier);
    assert.deepEqual(
      opts.map((o) => `${o.pid}-${o.kind}`).sort(),
      pts.map((p) => `${p.pid}-${p.kind}`).sort(),
      `tier=${tier} 選項池與 AI 池不一致`,
    );
    assert.ok(opts.every((o) => o.pid !== 'A2'), '舉球員不進自己的選項池');
  }
  const perfect = setOptionsFor(game, { passTier: 'perfect' }, 'A2');
  assert.ok(perfect.some((o) => o.kind === 'quick'), '到位應含快攻');
  assert.ok(setOptionsFor(game, { passTier: 'ok' }, 'A2').every((o) => o.kind !== 'quick'));
  const poor = setOptionsFor(game, { passTier: 'poor' }, 'A2');
  assert.ok(poor.every((o) => o.kind === 'left' || o.kind === 'right'), '勉強只剩兩翼高球');
});

test('猶豫門檻（甲2 C 案）：只標快攻、嚴格小於門檻、邊界值不標、可選（選項仍在池中）', () => {
  const { game } = setterGame();
  const quick = setOptionsFor(game, { passTier: 'perfect' }, 'A2').find((o) => o.kind === 'quick');
  assert.ok(quick, '前排 MB 應有快攻選項');
  const mb = game.players[quick.pid];
  // 極低 trust → 猶豫；選項仍在池（可選但有標註）
  mb.trust.fromSetter = 5;
  const dim = setOptionsFor(game, { passTier: 'perfect' }, 'A2');
  const dimQuick = dim.find((o) => o.pid === quick.pid);
  assert.equal(dimQuick.hesitant, true);
  // 同一隊友的非快攻選項不標（字面拍板：快攻選項變暗）
  assert.ok(dim.filter((o) => o.kind !== 'quick').every((o) => !o.hesitant));
  // 邊界：恰等於門檻＝不猶豫（嚴格 <）
  mb.trust.fromSetter = SET_HESITANT_BELOW;
  assert.equal(
    setOptionsFor(game, { passTier: 'perfect' }, 'A2').find((o) => o.pid === quick.pid).hesitant,
    false,
  );
});

test('舉球弧線同 sim 路徑：快攻 t=0.4（低弧）、高球 t=0.75；面板標題三分支', () => {
  const { game } = setterGame();
  const opts = setOptionsFor(game, { passTier: 'perfect' }, 'A2');
  for (const o of opts) {
    if (o.kind === 'quick') assert.equal(o.t, 0.4);
    else assert.equal(o.t, 0.75);
    assert.ok(Number.isFinite(o.aim.x) && Number.isFinite(o.aim.z));
  }
  assert.match(setPanelTitle('perfect'), /到位/);
  assert.match(setPanelTitle('ok'), /無快攻/);
  assert.match(setPanelTitle('poor'), /兩翼/);
});

test('決策點資料決定論：同建隊同種子兩次 → 選項逐值相同', () => {
  const a = setterGame(9).game;
  const b = setterGame(9).game;
  assert.deepEqual(
    setOptionsFor(a, { passTier: 'perfect' }, 'A2'),
    setOptionsFor(b, { passTier: 'perfect' }, 'A2'),
  );
});

test('trustFloor 停用（甲2）：轉 S＝floorShare 0、轉回攻擊位＝恢復 0.27', () => {
  const { store } = setterGame();
  assert.equal(store.loadPlayer().trust.floorShare, 0);
  store.applyPositionChange('outside');
  assert.equal(store.loadPlayer().trust.floorShare, PLAYER_TRUST_FLOOR);
  store.applyPositionChange('middle'); // 非 S 攻擊位也有保底（拍板只停用 S）
  assert.equal(store.loadPlayer().trust.floorShare, PLAYER_TRUST_FLOOR);
});
