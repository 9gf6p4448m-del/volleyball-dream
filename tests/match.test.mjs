// D2 比賽狀態機：得分/換發輪轉/deuce/觸球上限（驗收單 D 區）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, pointTo, serverId, isFourHits, setWon } from '../src/sim/match.js';
import { rotateLineup } from '../src/sim/rotation.js';

const A = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const B = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];

test('發球方得分：比分加一、不輪轉、續發', () => {
  const m = createMatch({ rotationA: A, rotationB: B, servingTeam: 'A' });
  const ev = pointTo(m, 'A', 'BALL_IN');
  assert.deepEqual(m.score, { A: 1, B: 0 });
  assert.equal(m.servingTeam, 'A');
  assert.equal(serverId(m), 'A1');
  assert.ok(!ev.some((e) => e.type === 'ROTATE'));
});

test('side-out：接發方得分 → 取得發球權並輪轉（新 P1 ← 舊 P2）', () => {
  const m = createMatch({ rotationA: A, rotationB: B, servingTeam: 'A' });
  const ev = pointTo(m, 'B', 'OUT');
  assert.equal(m.servingTeam, 'B');
  assert.deepEqual(m.rotations.B, ['B2', 'B3', 'B4', 'B5', 'B6', 'B1']);
  assert.equal(serverId(m), 'B2');
  assert.ok(ev.some((e) => e.type === 'ROTATE' && e.team === 'B'));
});

test('rotateLineup 連轉 6 次回到原陣', () => {
  let r = A;
  for (let i = 0; i < 6; i += 1) r = rotateLineup(r);
  assert.deepEqual(r, A);
});

test('deuce：24-24 後須領先 2 分才收局（25-24 不結束、26-24 結束）', () => {
  const m = createMatch({ rotationA: A, rotationB: B, servingTeam: 'A' });
  m.score.A = 24;
  m.score.B = 24;
  let ev = pointTo(m, 'A', 'BALL_IN'); // 25-24
  assert.ok(!ev.some((e) => e.type === 'SET_END'));
  assert.ok(!m.setOver);
  ev = pointTo(m, 'A', 'BALL_IN'); // 26-24
  assert.ok(ev.some((e) => e.type === 'SET_END' && e.winner === 'A'));
  assert.ok(m.setOver && m.winner === 'A');
  // 收局後不再計分
  assert.deepEqual(pointTo(m, 'B', 'OUT'), []);
  assert.deepEqual(m.score, { A: 26, B: 24 });
});

test('一般收局：25 分且領先 2 直接結束', () => {
  const m = createMatch({ rotationA: A, rotationB: B, servingTeam: 'B' });
  m.score.A = 24;
  m.score.B = 20;
  const ev = pointTo(m, 'A', 'BALL_IN');
  assert.ok(ev.some((e) => e.type === 'SET_END' && e.winner === 'A'));
});

test('setWon 與 isFourHits 邊界', () => {
  assert.equal(setWon({ A: 25, B: 24 }, 'A'), false);
  assert.equal(setWon({ A: 25, B: 23 }, 'A'), true);
  assert.equal(setWon({ A: 27, B: 25 }, 'A'), true);
  assert.equal(isFourHits(3), false);
  assert.equal(isFourHits(4), true);
});
