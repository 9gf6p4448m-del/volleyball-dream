// Phase 2 stage 4 — 信任動態（場內 trustDyn）＋trust 地板＋資料驅動事件表
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRUST_DYN, applyAttackOutcome, effectiveTrust, applyFloorShare, trustToWeights,
} from '../src/sim/trust.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createCareer, createCareerPlayer, careerTeams, recordResult } from '../src/career/careerState.js';
import { EVENT_DEFS, dueEvents, recordEvent } from '../src/career/events.js';

test('applyAttackOutcome：連得加碼、連失加碼、動態偏移夾限 ±25', () => {
  const s = { trustDyn: {}, trustStreak: {} };
  applyAttackOutcome(s, 'A2', true);
  assert.equal(s.trustDyn.A2, TRUST_DYN.KILL); // 第 1 記：無連續加碼
  applyAttackOutcome(s, 'A2', true);
  assert.equal(s.trustDyn.A2, TRUST_DYN.KILL * 2 + TRUST_DYN.KILL_STREAK); // 連 2 起加碼
  applyAttackOutcome(s, 'A2', false); // 失誤打斷連得
  assert.equal(s.trustStreak.A2, -1);
  for (let i = 0; i < 20; i += 1) applyAttackOutcome(s, 'A2', false);
  assert.equal(s.trustDyn.A2, -TRUST_DYN.CLAMP); // 夾限
});

test('effectiveTrust：baseline＋動態、0–100 夾限', () => {
  const p = { id: 'A2', trust: { fromSetter: 60 } };
  assert.equal(effectiveTrust({ trustDyn: {} }, p), 60);
  assert.equal(effectiveTrust({ trustDyn: { A2: 10 } }, p), 70);
  assert.equal(effectiveTrust({ trustDyn: { A2: -70 } }, p), 0);
});

test('applyFloorShare：低於地板墊到地板且總和為 1；高於地板不動；無地板原樣', () => {
  const entries = [{ pid: 'A2', floorShare: 0.27 }, { pid: 'A4' }, { pid: 'A5' }];
  const low = applyFloorShare(entries, [0.1, 0.5, 0.4]);
  assert.ok(Math.abs(low[0] - 0.27) < 1e-9);
  assert.ok(Math.abs(low.reduce((s, v) => s + v, 0) - 1) < 1e-9);
  assert.ok(Math.abs(low[1] / low[2] - 0.5 / 0.4) < 1e-9); // 其餘等比縮
  const high = applyFloorShare(entries, [0.5, 0.3, 0.2]);
  assert.deepEqual(high, [0.5, 0.3, 0.2]);
  const none = applyFloorShare([{ pid: 'x' }, { pid: 'y' }], [0.7, 0.3]);
  assert.deepEqual(none, [0.7, 0.3]);
});

test('settlePoint 歸因：殺進 trustDyn＋、打出界 trustDyn−（sim 實跑）', () => {
  // 殺進：A2 扣球後球落 B 場內
  const g1 = createGame({ seed: 3 });
  g1.phase = 'rally';
  Object.assign(g1.rally, {
    profile: 'spike', possession: 'A', touches: 3,
    lastTouchTeam: 'A', lastToucherId: 'A2',
  });
  const b1 = g1.ball;
  b1.x = 0; b1.y = 0.2; b1.z = -5; b1.vx = 0; b1.vy = -5; b1.vz = 0;
  b1.px = b1.x; b1.py = 0.3; b1.pz = b1.z;
  for (let i = 0; i < 10 && g1.phase === 'rally'; i += 1) stepGame(g1, []);
  assert.equal(g1.trustDyn.A2, TRUST_DYN.KILL);

  // 打出界：A2 扣球後球落界外
  const g2 = createGame({ seed: 3 });
  g2.phase = 'rally';
  Object.assign(g2.rally, {
    profile: 'spike', possession: 'A', touches: 3,
    lastTouchTeam: 'A', lastToucherId: 'A2',
  });
  const b2 = g2.ball;
  b2.x = 8; b2.y = 0.2; b2.z = -5; b2.vx = 0; b2.vy = -5; b2.vz = 0;
  b2.px = b2.x; b2.py = 0.3; b2.pz = b2.z;
  for (let i = 0; i < 10 && g2.phase === 'rally'; i += 1) stepGame(g2, []);
  assert.equal(g2.trustDyn.A2, TRUST_DYN.ERR);
});

test('trust 地板整場有效：主角 trust 極低仍分得保底量級的攻擊球權', () => {
  const player = createCareerPlayer('小夢');
  player.trust.fromSetter = 5; // 幾乎沒人信任
  const g = createGame({ seed: 42, teams: careerTeams(player), setTarget: 15 });
  const ai = createAiState();
  let myPicks = 0;
  let teamPicks = 0;
  let lastAttacker = null;
  while (g.phase !== 'set_over' && g.tick < 400000) {
    stepGame(g, aiCollectIntents(g, ai));
    if (ai.attackerId && ai.attackerId !== lastAttacker && ai.landingTeam === 'A') {
      lastAttacker = ai.attackerId;
      teamPicks += 1;
      if (ai.attackerId === 'A2') myPicks += 1;
    }
  }
  assert.ok(teamPicks > 10, `樣本要夠（實得 ${teamPicks}）`);
  const share = myPicks / teamPicks;
  assert.ok(share >= 0.15, `地板 0.27 下實得分配佔比不應崩到觀眾級（實得 ${share.toFixed(2)}）`);
});

test('事件表：宣告式條件觸發、once 不重複、未知條件鍵安全不觸發', () => {
  let c = createCareer({ seed: 1 });
  // 賽前開幕戰：debut 觸發
  assert.deepEqual(dueEvents(c, 'pre').map((e) => e.id), ['debut']);
  c = recordEvent(c, 'debut');
  assert.equal(dueEvents(c, 'pre').length, 0); // 入帳不重複
  // 首勝賽後：first-win＋（殺球夠多時）hot-hand 同時觸發
  c = recordResult(c, {
    matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 20, gp: 6,
    stats: { kills: 5, tipKills: 1, aces: 0, blockPoints: 0, perfects: 0, spikes: 12 },
  });
  assert.deepEqual(dueEvents(c, 'post').map((e) => e.id), ['first-win', 'hot-hand']);
  // 賽前對曜石（group-3 前）：mb-warn 要等下一場輪到曜石
  c = recordEvent(recordEvent(c, 'first-win'), 'hot-hand');
  assert.equal(dueEvents(c, 'pre').length, 0); // 下一場是 group-2 白浪：無事件
  c = recordResult(c, { matchId: 'group-2', won: false, scoreFor: 20, scoreAgainst: 25 });
  assert.deepEqual(dueEvents(c, 'post').map((e) => e.id), ['first-loss']);
  c = recordEvent(c, 'first-loss');
  assert.deepEqual(dueEvents(c, 'pre').map((e) => e.id), ['mb-warn']); // 下一場曜石
  // 事件表健全性：id 唯一、對話非空、moment 合法
  assert.equal(new Set(EVENT_DEFS.map((e) => e.id)).size, EVENT_DEFS.length);
  for (const e of EVENT_DEFS) {
    assert.ok(['pre', 'post'].includes(e.moment));
    assert.ok(e.lines.length > 0 && e.lines.every((l) => l.speaker && l.text));
  }
});

test('events.js 純度：零 DOM/存檔 IO/非種子隨機', () => {
  const src = readFileSync(new URL('../src/career/events.js', import.meta.url), 'utf8');
  for (const banned of ['localStorage', 'document.', 'window.', 'Math.random(', 'Date.now(']) {
    assert.ok(!src.includes(banned), `events.js 不得出現 ${banned}`);
  }
});
