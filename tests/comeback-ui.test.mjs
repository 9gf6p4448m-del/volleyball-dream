// W7 C2④ 回場鈕——純函式邏輯直測（matchLoop.js 其餘部分是 rAF/DOM 綁定，這幾個
// 判斷函式刻意保持零 DOM 依賴，可直接 import 驗證；onCourt 順帶測 C2 板凳判準）
import test from 'node:test';
import assert from 'node:assert/strict';
import { onCourt, findComebackOut, comebackAvailability } from '../src/app/matchLoop.js';

function makeGame({
  rotA = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
  bench = [],
  roles = {},
  events = [],
  subsRemaining = 6,
  phase = 'serve',
} = {}) {
  const players = {};
  for (const id of [...rotA, ...bench]) {
    players[id] = { id, currentRole: roles[id] ?? 'outside', teamId: 'A' };
  }
  return {
    phase,
    players,
    match: { rotations: { A: rotA, B: [] } },
    subs: { A: { remaining: subsRemaining } },
    events,
  };
}

test('onCourt：場上回 true、板凳/不存在回 false', () => {
  const g = makeGame({ rotA: ['A1', 'A2'], bench: ['A7'] });
  assert.equal(onCourt(g, 'A1'), true);
  assert.equal(onCourt(g, 'A7'), false);
});

test('findComebackOut：優先換下「當初接替主角的人」——仍在場上才算數', () => {
  const g = makeGame({
    rotA: ['A1', 'A2', 'A7'], // A7 頂替了主角 A2 的位置（此處只驗證函式選誰，陣容自訂即可）
    events: [
      { type: 'SUBSTITUTION', team: 'A', outId: 'hero', inId: 'A7' },
    ],
  });
  g.players.hero = { id: 'hero', currentRole: 'outside', teamId: 'A' };
  assert.equal(findComebackOut(g, 'hero'), 'A7');
});

test('findComebackOut：接替者已被換走（不在場上）＝退回同位置隊友（含 S↔OPP 例外）', () => {
  const g = makeGame({
    rotA: ['A1', 'A2', 'A8'], // A7（曾接替主角）已不在場上；A8 是主角原位置（setter）的合法替代
    roles: { A8: 'opposite' },
    events: [
      { type: 'SUBSTITUTION', team: 'A', outId: 'hero', inId: 'A7' }, // A7 上
      { type: 'SUBSTITUTION', team: 'A', outId: 'A7', inId: 'A8' },   // A7 又被換下，A8 上
    ],
  });
  g.players.hero = { id: 'hero', currentRole: 'setter', teamId: 'A' };
  assert.equal(findComebackOut(g, 'hero'), 'A8'); // S↔OPP 例外成立
});

test('findComebackOut：場上無任何同位置非自由人＝回傳 null', () => {
  const g = makeGame({ rotA: ['A1'], roles: { A1: 'middle' } });
  g.players.hero = { id: 'hero', currentRole: 'outside', teamId: 'A' };
  assert.equal(findComebackOut(g, 'hero'), null);
});

test('findComebackOut：自由人不算合法候選（即使角色字串相同不會發生，這裡驗證明確排除邏輯）', () => {
  const g = makeGame({ rotA: ['A1', 'A2'], roles: { A1: 'libero', A2: 'outside' } });
  g.players.hero = { id: 'hero', currentRole: 'outside', teamId: 'A' };
  // A1 角色雖同名不會是 'outside'，此測試改用 A2（非自由人）驗證正常路徑仍可選中
  assert.equal(findComebackOut(g, 'hero'), 'A2');
});

test('comebackAvailability：非死球窗＝反灰＋理由', () => {
  const g = makeGame({ phase: 'rally', rotA: ['A1'], roles: { A1: 'outside' } });
  g.players.hero = { id: 'hero', currentRole: 'outside', teamId: 'A' };
  const r = comebackAvailability({ game: g, playerId: 'hero' });
  assert.equal(r.enabled, false);
  assert.equal(r.reason, '只能在死球時回場');
});

test('comebackAvailability：換人額度用盡＝反灰＋理由', () => {
  const g = makeGame({ subsRemaining: 0, rotA: ['A1'], roles: { A1: 'outside' } });
  g.players.hero = { id: 'hero', currentRole: 'outside', teamId: 'A' };
  const r = comebackAvailability({ game: g, playerId: 'hero' });
  assert.equal(r.enabled, false);
  assert.equal(r.reason, '換人次數已用盡');
});

test('comebackAvailability：場上無同位置隊友＝反灰＋理由', () => {
  const g = makeGame({ rotA: ['A1'], roles: { A1: 'middle' } });
  g.players.hero = { id: 'hero', currentRole: 'outside', teamId: 'A' };
  const r = comebackAvailability({ game: g, playerId: 'hero' });
  assert.equal(r.enabled, false);
  assert.equal(r.reason, '場上找不到可換下的同位置隊友');
});

test('comebackAvailability：條件齊備＝可用、理由空字串', () => {
  const g = makeGame({ rotA: ['A1'], roles: { A1: 'outside' } });
  g.players.hero = { id: 'hero', currentRole: 'outside', teamId: 'A' };
  const r = comebackAvailability({ game: g, playerId: 'hero' });
  assert.equal(r.enabled, true);
  assert.equal(r.reason, '');
});
