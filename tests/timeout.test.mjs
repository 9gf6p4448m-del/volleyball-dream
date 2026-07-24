// Phase 3 W7 — B3 暫停測試：合法路徑/驗證閘/體力小回/斬對方連得分/
// AI 喊暫停判準/不喊＝零擾動（pointStreak 純記帳不進事件流）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, stepGame, applyTimeout, applyTimeoutBoost, TUNING,
} from '../src/sim/game.js';
import { createAiState, aiCollectIntents, aiTimeoutWanted } from '../src/sim/ai.js';
import { STAMINA, attrRecovMul } from '../src/sim/stamina.js';

function playUntil(g, ai, pred, maxTicks = 200000) {
  while (!pred(g) && g.tick < maxTicks && g.phase !== 'set_over') {
    stepGame(g, aiCollectIntents(g, ai));
  }
}

test('applyTimeout：死球窗合法喊——額度/事件/死球延長全同步', () => {
  const g = createGame({ seed: 7, setTarget: 15 });
  const ai = createAiState();
  playUntil(g, ai, (s) => s.match.score.A + s.match.score.B >= 1 && s.phase === 'serve');
  const r = applyTimeout(g, { team: 'A' });
  assert.equal(r.ok, true, r.reason);
  assert.equal(g.timeouts.A.remaining, TUNING.TIMEOUTS_PER_SET - 1);
  assert.ok(g.events.some((e) => e.type === 'TIMEOUT' && e.team === 'A'));
  assert.ok(g.serveReadyTick >= g.tick + TUNING.TIMEOUT_DEAD_TICKS, '死球時間未延長');
});

test('applyTimeout：驗證閘——rally 中擋下、額度用盡擋下', () => {
  const g = createGame({ seed: 11, setTarget: 15 });
  const ai = createAiState();
  playUntil(g, ai, (s) => s.phase === 'rally');
  assert.equal(applyTimeout(g, { team: 'A' }).reason, 'not-dead-ball');
  playUntil(g, ai, (s) => s.phase === 'serve');
  assert.equal(applyTimeout(g, { team: 'A' }).ok, true);
  assert.equal(applyTimeout(g, { team: 'A' }).ok, true);
  assert.equal(applyTimeout(g, { team: 'A' }).reason, 'limit');
});

test('B3 效果：我方全隊小回體力（×attrRecovMul）、對方不動', () => {
  const g = createGame({ seed: 5, stamina: { A: {}, B: {} } });
  for (const id of Object.keys(g.stamina)) g.stamina[id] = 0.5;
  const r = applyTimeout(g, { team: 'A' }); // 開局即死球窗
  assert.equal(r.ok, true);
  for (const p of Object.values(g.players)) {
    if (p.teamId === 'A') {
      const expect = Math.min(1, 0.5 + STAMINA.RECOV_TIMEOUT * attrRecovMul(p));
      assert.ok(Math.abs(g.stamina[p.id] - expect) < 1e-12, `${p.id} 未按恢復率小回`);
    } else {
      assert.equal(g.stamina[p.id], 0.5, `${p.id} 對方不應被回體力`);
    }
  }
});

test('B3 斬氣勢資料底：對方連得分歸零、自家連得不歸零', () => {
  const g = createGame({ seed: 5 });
  g.pointStreak = { team: 'B', n: 4 };
  applyTimeout(g, { team: 'A' });
  assert.deepEqual(g.pointStreak, { team: null, n: 0 });
  g.pointStreak = { team: 'A', n: 3 };
  applyTimeout(g, { team: 'A' });
  assert.deepEqual(g.pointStreak, { team: 'A', n: 3 });
});

test('aiTimeoutWanted：被連 4 分＋死球＋有額度才成立', () => {
  const g = createGame({ seed: 5 });
  g.pointStreak = { team: 'A', n: 4 };
  assert.equal(aiTimeoutWanted(g, 'B'), true);
  assert.equal(aiTimeoutWanted(g, 'A'), false); // 自家連得不喊
  g.pointStreak = { team: 'A', n: 3 };
  assert.equal(aiTimeoutWanted(g, 'B'), false); // 未達門檻
  g.pointStreak = { team: 'A', n: 5 };
  g.timeouts.B.remaining = 0;
  assert.equal(aiTimeoutWanted(g, 'B'), false); // 額度用盡
  g.timeouts.B.remaining = 1;
  g.phase = 'rally';
  assert.equal(aiTimeoutWanted(g, 'B'), false); // 非死球
});

test('W7.1 暫停選項：calm 全隊額外小回／fire 我方氣勢推檔／同窗防重入', () => {
  const g = createGame({ seed: 5, stamina: { A: {}, B: {} }, momentum: true });
  for (const id of Object.keys(g.stamina)) g.stamina[id] = 0.5;
  assert.equal(applyTimeout(g, { team: 'A' }).ok, true);
  const afterBase = g.stamina[g.match.rotations.A[0]];
  // calm：基礎之上再回 TIMEOUT_CALM_RECOV×恢復率
  assert.equal(applyTimeoutBoost(g, { team: 'A', boost: 'calm' }).ok, true);
  const p0 = g.players[g.match.rotations.A[0]];
  const expect = Math.min(1, afterBase + TUNING.TIMEOUT_CALM_RECOV * attrRecovMul(p0));
  assert.ok(Math.abs(g.stamina[p0.id] - expect) < 1e-12);
  assert.ok(g.events.some((e) => e.type === 'TIMEOUT_BOOST' && e.boost === 'calm'));
  // 同一個暫停窗第二次 boost 擋下
  assert.equal(applyTimeoutBoost(g, { team: 'A', boost: 'fire' }).reason, 'already-boosted');
  // 第二次暫停（新窗）→ fire：氣勢推一檔
  assert.equal(applyTimeout(g, { team: 'A' }).ok, true);
  const prevM = g.momentum.value;
  assert.equal(applyTimeoutBoost(g, { team: 'A', boost: 'fire' }).ok, true);
  assert.equal(g.momentum.value, Math.min(TUNING.MOMENTUM_MAX, prevM + TUNING.TIMEOUT_FIRE_STEP));
  // 未知選項擋下（用 B 隊暫停開新窗驗——A 的窗已用掉）
  assert.equal(applyTimeout(g, { team: 'B' }).ok, true);
  assert.equal(applyTimeoutBoost(g, { team: 'B', boost: 'x' }).reason, 'unknown-boost');
});

test('pointStreak 記帳：隨得分演進、換隊重計；不喊暫停＝零 TIMEOUT 事件', () => {
  const g = createGame({ seed: 4242, setTarget: 15 });
  const ai = createAiState();
  let checked = 0;
  let last = { team: null, n: 0 };
  while (g.phase !== 'set_over' && g.tick < 400000) {
    const evs = stepGame(g, aiCollectIntents(g, ai));
    for (const e of evs) {
      if (e.type !== 'DEAD_BALL') continue;
      const ps = g.pointStreak;
      if (last.team === ps.team) assert.equal(ps.n, last.n + 1);
      else assert.equal(ps.n, 1);
      last = { ...ps };
      checked += 1;
    }
  }
  assert.ok(checked >= 15, '整局應有足量死球樣本');
  assert.ok(!g.events.some((e) => e.type === 'TIMEOUT'));
});
