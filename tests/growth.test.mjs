// Phase 2 stage 3 — 成長雙層＋能力閘門
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GROWTH, TECH_DEFS, matchStatsFor, growthPointsFor, blockReadTier,
  spendAttribute, unlockTechnique,
} from '../src/career/growth.js';
import {
  createCareer, createCareerPlayer, recordResult, deserializeCareer, CAREER_VERSION,
} from '../src/career/careerState.js';
import { createPlayer, feintMasteryMul } from '../src/sim/player.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';

test('matchStatsFor：得分前最後觸球歸因（ACE/殺球/吊球/攔網/Perfect），對方得分不計', () => {
  const ev = [
    { type: 'SERVE', team: 'A', playerId: 'A2' },
    { type: 'SCORE', team: 'A' }, // ACE
    { type: 'TOUCH', team: 'A', playerId: 'A2', kind: 'receive', power: 0.95 }, // Perfect
    { type: 'TOUCH', team: 'A', playerId: 'A1', kind: 'set', power: 0.75 },
    { type: 'TOUCH', team: 'A', playerId: 'A2', kind: 'spike', power: 1 },
    { type: 'SCORE', team: 'A' }, // 殺球
    { type: 'TOUCH', team: 'A', playerId: 'A2', kind: 'spike', power: 0.25 },
    { type: 'SCORE', team: 'A' }, // 吊球
    { type: 'TOUCH', team: 'B', playerId: 'B1', kind: 'spike', power: 1 },
    { type: 'BLOCK_TOUCH', team: 'A', playerId: 'A2' },
    { type: 'SCORE', team: 'A' }, // 攔網得分
    { type: 'TOUCH', team: 'A', playerId: 'A2', kind: 'spike', power: 1 },
    { type: 'SCORE', team: 'B' }, // 對方得分：不歸功
  ];
  const st = matchStatsFor(ev, 'A2', 'A');
  assert.deepEqual(st, { kills: 1, tipKills: 1, aces: 1, blockPoints: 1, perfects: 1, spikes: 3 });
});

test('growthPointsFor：保底＋勝場＋計功，單場封頂', () => {
  const st = { kills: 1, tipKills: 1, aces: 1, blockPoints: 1, perfects: 1, spikes: 3 };
  assert.equal(growthPointsFor(st, true), 8);  // 2+2+1+1+1+1+0
  assert.equal(growthPointsFor(st, false), 6); // 輸球也有（場次保障累積循環）
  const monster = { kills: 30, tipKills: 0, aces: 0, blockPoints: 0, perfects: 0, spikes: 30 };
  assert.equal(growthPointsFor(monster, true), GROWTH.MATCH_CAP);
});

test('blockReadTier：reaction 三檔；生涯新人 60＝slow', () => {
  const p = (reaction) => createPlayer({ id: 'X', teamId: 'A', attributes: { reaction } });
  assert.equal(blockReadTier(p(54)), 'none');
  assert.equal(blockReadTier(p(60)), 'slow');
  assert.equal(blockReadTier(p(70)), 'instant');
  assert.equal(blockReadTier(createCareerPlayer('新人')), 'slow');
});

test('feintMasteryMul：0.6 起步、8 次＝1.0 基準、上限 1.2；預設球員不變', () => {
  const withUses = (n) => createPlayer({ id: 'X', teamId: 'A', techniques: { feintUses: n } });
  assert.equal(feintMasteryMul(withUses(0)), 0.6);
  assert.equal(feintMasteryMul(withUses(8)), 1.0);
  assert.equal(feintMasteryMul(withUses(999)), 1.2);
  assert.equal(feintMasteryMul(createPlayer({ id: 'X', teamId: 'A' })), 1.0);
});

test('spendAttribute：+1 不可變、上限 90、非開放屬性拒絕', () => {
  const p = createCareerPlayer('小夢');
  const p2 = spendAttribute(p, 'power');
  assert.equal(p2.attributes.power, 63);
  assert.equal(p.attributes.power, 62); // 原物件不動
  assert.throws(() => spendAttribute(p, 'control'), /不可加點/);
  const maxed = { ...p, attributes: { ...p.attributes, jump: 90 } };
  assert.throws(() => spendAttribute(maxed, 'jump'), /上限/);
});

test('unlockTechnique：0→1、重複解鎖拒絕、假動作熟練度從 0 起算', () => {
  const p = createCareerPlayer('小夢');
  const p2 = unlockTechnique(p, 'tip');
  assert.equal(p2.techniques.tip, 1);
  assert.equal(p.techniques.tip, 0);
  assert.throws(() => unlockTechnique(p2, 'tip'), /已解鎖/);
  assert.throws(() => unlockTechnique(p, 'nope'), /未知/);
  const pf = unlockTechnique(p, 'feint');
  assert.equal(pf.techniques.feint, 1);
  assert.equal(pf.techniques.feintUses, 0);
  assert.equal(TECH_DEFS.length, 4);
});

test('技術閘門起點：生涯新人全鎖、預設球員（快速比賽/AI）全開', () => {
  const rookie = createCareerPlayer('小夢');
  for (const k of ['tip', 'powerServe', 'pipe', 'feint']) {
    assert.equal(rookie.techniques[k], 0, `${k} 應鎖定`);
  }
  assert.equal(rookie.techniques.feintUses, 0);
  const dflt = createPlayer({ id: 'X', teamId: 'A' });
  for (const k of ['tip', 'powerServe', 'pipe', 'feint']) {
    assert.equal(dflt.techniques[k], 1, `${k} 預設應全開`);
  }
  assert.equal(dflt.techniques.feintUses, 8);
});

test('careerState v3：growthPoints 初始 0、recordResult 累加 gp 與 stats', () => {
  let c = createCareer({ seed: 1 });
  assert.equal(c.growthPoints, 0);
  c = recordResult(c, {
    matchId: 'group-1', won: true, scoreFor: 25, scoreAgainst: 20,
    gp: 5, stats: { kills: 3, tipKills: 0, aces: 1, blockPoints: 0, perfects: 2, spikes: 9 },
  });
  c = recordResult(c, { matchId: 'group-2', won: false, scoreFor: 20, scoreAgainst: 25, gp: 3 });
  assert.equal(c.growthPoints, 8);
  assert.equal(c.results[0].gp, 5);
  assert.equal(c.results[0].stats.kills, 3);
});

test('v2→v3 遷移：既往場次每場追認 4 點', () => {
  const v2 = JSON.stringify({
    version: 2, seed: 5, playerName: '小夢',
    schedule: createCareer({ seed: 5 }).schedule,
    results: [
      { matchId: 'group-1', opponentId: 'north-tech', won: true, scoreFor: 25, scoreAgainst: 20 },
      { matchId: 'group-2', opponentId: 'white-wave', won: false, scoreFor: 21, scoreAgainst: 25 },
    ],
  });
  const c = deserializeCareer(v2);
  assert.equal(c.version, CAREER_VERSION);
  assert.equal(c.growthPoints, 8);
  assert.equal(c.results.length, 2);
});

test('sim 接線：假動作熟練度縮放騙敵機率（0 次＝1.2 上限的一半）', () => {
  const deceiveAfterSpike = (feintUses) => {
    const g = createGame({ seed: 9 });
    g.phase = 'rally';
    const r = g.rally;
    r.profile = 'arc'; r.possession = 'A'; r.touches = 2;
    r.lastTouchTeam = 'A'; r.lastToucherId = 'A1';
    const b = g.ball;
    b.x = 0; b.y = 2.9; b.z = 2; b.vx = 0; b.vy = -1; b.vz = 0;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    g.actors.A2.x = 0; g.actors.A2.z = 2;
    g.players.A2.techniques.feintUses = feintUses;
    stepGame(g, [createIntent({
      playerId: 'A2', tick: g.tick, action: 'spike',
      aim: { x: 0, z: -5 }, gaze: { x: 4, z: -4 },
    })]);
    return g.rally.deceiveP;
  };
  const rookie = deceiveAfterSpike(0);   // ×0.6
  const master = deceiveAfterSpike(999); // ×1.2
  assert.ok(rookie > 0, '有視線夾角應產生騙敵機率（測試前提）');
  assert.ok(Math.abs(master - rookie * 2) < 1e-9, `熟練 1.2 應為新手 0.6 的兩倍（${rookie}→${master}）`);
});

test('growth.js 純度：零 DOM/存檔 IO/非種子隨機', () => {
  const src = readFileSync(new URL('../src/career/growth.js', import.meta.url), 'utf8');
  for (const banned of ['localStorage', 'document.', 'window.', 'Math.random(', 'Date.now(']) {
    assert.ok(!src.includes(banned), `growth.js 不得出現 ${banned}`);
  }
});
