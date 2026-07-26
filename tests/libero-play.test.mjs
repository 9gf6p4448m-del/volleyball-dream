// Phase 4 W3 — L 玩法（附錄 A）：收縮指令幾何（digTargetFor）、讀對判定嚴格相等、
// 習慣標記門檻（決定論讀 scoutTally）、L 三欄 box score 契約記帳（事件流攔截）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { digTargetFor } from '../src/sim/ai.js';
import {
  spikeBiasOf, digSuggestionFor, digReadCorrect, MARK_MIN_SPIKES,
} from '../src/input/liberoRead.js';
import { boxScoreLFor } from '../src/career/boxScoreL.js';

test('digTargetFor：null＝現行收縮；line/cross 沿球側走廊加/反移；tip 前壓；決定論', () => {
  const game = createGame({ seed: 2 });
  game.ball.x = 2.5; // 球在 +x 側
  const base = digTargetFor(game, 'A', 'A5', null);
  const line = digTargetFor(game, 'A', 'A5', 'line');
  const cross = digTargetFor(game, 'A', 'A5', 'cross');
  const tip = digTargetFor(game, 'A', 'A5', 'tip');
  // A 隊在 +z 側：line＝往球側（+x）再多收、cross＝反向
  assert.ok(line.x > base.x, '守直線應向球側加收');
  assert.ok(cross.x < base.x, '守斜線應收反向走廊');
  assert.equal(line.z, base.z);
  // tip＝前壓（A 隊朝網＝z 變小）
  assert.ok(tip.z < base.z, '守吊球應前壓');
  assert.equal(tip.x, base.x);
  assert.deepEqual(digTargetFor(game, 'A', 'A5', 'line'), line); // 決定論
});

test('習慣標記：樣本門檻與佔比門檻、無標記建議守斜線、標記優先', () => {
  const game = createGame({ seed: 2 });
  // 樣本不足＝無標記
  game.scoutTally.B2 = { zones: { line: 2, cross: 0, middle: 0, tip: 0 }, spikes: 2, feints: 0, serves: { jumps: 0, floats: 0, total: 0 } };
  assert.equal(spikeBiasOf(game, 'B2'), null);
  assert.equal(MARK_MIN_SPIKES, 3);
  // 佔比達標＝標記
  game.scoutTally.B2.zones.line = 4;
  game.scoutTally.B2.spikes = 5;
  assert.equal(spikeBiasOf(game, 'B2'), 'line');
  // 平均分佈＝無標記
  game.scoutTally.B2 = { zones: { line: 2, cross: 2, middle: 1, tip: 1 }, spikes: 6, feints: 0, serves: { jumps: 0, floats: 0, total: 0 } };
  assert.equal(spikeBiasOf(game, 'B2'), null);
  // 建議：無攻擊手/無標記＝cross；有標記＝標記
  assert.equal(digSuggestionFor(game, null), 'cross');
  assert.equal(digSuggestionFor(game, { claimId: 'B2' }), 'cross');
  game.scoutTally.B2 = { zones: { line: 0, cross: 0, middle: 0, tip: 3 }, spikes: 3, feints: 0, serves: { jumps: 0, floats: 0, total: 0 } };
  assert.equal(digSuggestionFor(game, { claimId: 'B2' }), 'tip');
});

test('讀對判定：嚴格相等（middle＝三選項皆不中）、非 spike/無指令＝false', () => {
  const mk = (zone, choice, profile = 'spike') => digReadCorrect(
    { rally: { profile, lastSpikeZone: zone } },
    choice ? { digBias: { team: 'A', choice } } : {},
  );
  assert.equal(mk('cross', 'cross'), true);
  assert.equal(mk('line', 'line'), true);
  assert.equal(mk('tip', 'tip'), true);
  assert.equal(mk('cross', 'line'), false);
  assert.equal(mk('middle', 'line'), false); // 中路＝誰都沒讀對（實作裁量，見快照）
  assert.equal(mk('middle', 'cross'), false);
  assert.equal(mk('cross', null), false);
  assert.equal(mk('cross', 'cross', 'serve'), false);
});

test('L 三欄記帳：起球／續命（接對方扣）／助攻一傳（起→舉→攻得分）；對方得分不記助攻', () => {
  const T = (playerId, team, kind, touches) => ({ type: 'TOUCH', playerId, team, kind, touches });
  const events = [
    // rally 1：接發起球（非扣＝不算續命）→ 舉 → 攻 → 我方得分 ＝ digs+1, assist+1
    T('A2', 'A', 'receive', 1), T('A1', 'A', 'set', 2), T('A5', 'A', 'spike', 3),
    { type: 'DEAD_BALL', reason: 'BALL_IN' }, { type: 'SCORE', team: 'A' },
    // rally 2：對方扣球 → 我魚躍頂起（續命）→ 舉 → 攻 → 對方得分（攻出界）＝ digs+1, saves+1, assist 不記
    T('B2', 'B', 'spike', 3),
    T('A2', 'A', 'dive', 1), T('A1', 'A', 'set', 2), T('A5', 'A', 'spike', 3),
    { type: 'DEAD_BALL', reason: 'OUT' }, { type: 'SCORE', team: 'B' },
    // rally 3：隊友起球（非玩家）＝不記
    T('AL', 'A', 'receive', 1), T('A1', 'A', 'set', 2), T('A5', 'A', 'spike', 3),
    { type: 'DEAD_BALL', reason: 'BALL_IN' }, { type: 'SCORE', team: 'A' },
  ];
  assert.deepEqual(boxScoreLFor(events, 'A2'), { digs: 2, assistDigs: 1, rallySaves: 1 });
  assert.deepEqual(boxScoreLFor(events, 'A2'), boxScoreLFor(events, 'A2')); // 決定論
  assert.deepEqual(boxScoreLFor([], 'A2'), { digs: 0, assistDigs: 0, rallySaves: 0 });
});
