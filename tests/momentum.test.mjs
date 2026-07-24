// Phase 3 W7 — B1 團隊氣勢測試：未啟用零副作用、啟用決定論、零 rng 擾動、
// 檔位規則重演（連得 3+ 推檔/對向收檔/夾限 ±3）、散佈乘數、B3 暫停歸中
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, stepGame, applyTimeout, momentumScatterMul, TUNING,
} from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

function playFullSet(g, ai) {
  const all = [];
  while (g.phase !== 'set_over' && g.tick < 400000) {
    all.push(...stepGame(g, aiCollectIntents(g, ai)));
  }
  return all;
}

test('未啟用＝零副作用：momentum 為 null、全場零 MOMENTUM 事件', () => {
  const g = createGame({ seed: 4242, setTarget: 15 });
  assert.equal(g.momentum, null);
  const events = playFullSet(g, createAiState());
  assert.ok(!events.some((e) => e.type === 'MOMENTUM'));
  assert.equal(momentumScatterMul(g, 'A'), 1);
});

test('啟用決定論：同種子兩跑事件流與氣勢終值逐位一致', () => {
  const run = () => {
    const g = createGame({ seed: 777, setTarget: 15, momentum: true });
    const events = playFullSet(g, createAiState());
    return { events, value: g.momentum.value, score: g.match.score };
  };
  const a = run();
  const b = run();
  assert.equal(JSON.stringify(b.events), JSON.stringify(a.events));
  assert.equal(b.value, a.value);
  assert.deepEqual(b.score, a.score);
});

test('零 rng 擾動：首次檔位變動前，事件流與關閉態逐位一致', () => {
  const play = (momentum) => {
    const g = createGame({ seed: 91, setTarget: 25, ...(momentum ? { momentum } : {}) });
    return playFullSet(g, createAiState());
  };
  const off = play(false);
  const on = play(true);
  const first = on.find((e) => e.type === 'MOMENTUM');
  if (!first) {
    assert.equal(JSON.stringify(on), JSON.stringify(off));
    return;
  }
  const cut = (evs) => evs.filter((e) => e.tick <= first.tick && e.type !== 'MOMENTUM');
  assert.equal(JSON.stringify(cut(on)), JSON.stringify(cut(off)));
});

test('檔位規則重演：連得 3+ 推檔、對向收檔、夾限 ±3（全場逐事件對帳）', () => {
  const g = createGame({ seed: 1234, setTarget: 25, momentum: true });
  const events = playFullSet(g, createAiState());
  let expect = 0;
  let streakTeam = null;
  let streakN = 0;
  const momEvents = [];
  for (const e of events) {
    if (e.type === 'SCORE') {
      const winner = e.team;
      if (winner === streakTeam) streakN += 1;
      else { streakTeam = winner; streakN = 1; }
      const dir = winner === 'A' ? 1 : -1;
      if (streakN >= TUNING.MOMENTUM_STREAK_MIN) {
        expect = Math.max(-TUNING.MOMENTUM_MAX, Math.min(TUNING.MOMENTUM_MAX, expect + dir));
      } else if (expect * dir < 0) {
        expect += dir;
      }
    } else if (e.type === 'MOMENTUM') {
      momEvents.push(e);
      assert.equal(e.value, expect, `tick ${e.tick} 檔位與規則重演不符`);
      assert.ok(Math.abs(e.value) <= TUNING.MOMENTUM_MAX);
    }
  }
  assert.ok(momEvents.length >= 2, '整局應有檔位變動樣本');
  assert.equal(g.momentum.value, expect);
});

test('散佈乘數：滿檔我方 ×0.92／對方 ×1.08、零檔恆 1、不動力量速度以外的乘數', () => {
  const g = createGame({ seed: 5, momentum: true });
  g.momentum.value = TUNING.MOMENTUM_MAX;
  assert.ok(Math.abs(momentumScatterMul(g, 'A') - (1 - TUNING.MOMENTUM_SCATTER_CAP)) < 1e-12);
  assert.ok(Math.abs(momentumScatterMul(g, 'B') - (1 + TUNING.MOMENTUM_SCATTER_CAP)) < 1e-12);
  g.momentum.value = 0;
  assert.equal(momentumScatterMul(g, 'A'), 1);
  g.momentum.value = -1;
  assert.ok(momentumScatterMul(g, 'A') > 1 && momentumScatterMul(g, 'B') < 1);
});

test('B3 暫停歸中：只斬對方氣勢、自家氣勢不動', () => {
  const g = createGame({ seed: 5, momentum: true });
  g.momentum.value = -2; // B 氣勢
  assert.equal(applyTimeout(g, { team: 'A' }).ok, true);
  assert.equal(g.momentum.value, 0);
  assert.ok(g.events.some((e) => e.type === 'MOMENTUM' && e.value === 0));
  g.momentum.value = 2; // A 氣勢——A 再喊（用第二次額度）不得斬自己
  assert.equal(applyTimeout(g, { team: 'A' }).ok, true);
  assert.equal(g.momentum.value, 2);
});
