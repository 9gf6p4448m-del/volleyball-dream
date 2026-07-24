// Phase 3 W7 — 體力系統（A1-A5）測試：
// 未啟用零副作用、啟用決定論、零 rng 擾動（跨檔前事件流與關閉態逐位一致）、
// 動作計費與跳最貴、A4 對手慢耗/重度豁免、A5 屬性抗性/恢復率、
// 兩段門檻效果乘數、STAMINA_LOW 跨檔事件、板凳快回。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, applySubstitution } from '../src/sim/game.js';
import { createPlayer } from '../src/sim/player.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import {
  STAMINA, attrCostMul, attrRecovMul, tierOf,
  staminaTier, staminaPerfMul, staminaRecvMul, drainStamina, recoverStamina,
} from '../src/sim/stamina.js';

const CFG = { A: {}, B: { costMul: 0.6, heavyExempt: true } }; // A4 拍板形

const benchPlayer = (id, role = 'outside') => createPlayer({
  id, name: `板凳${id}`, teamId: 'A', naturalRole: role, currentRole: role,
  height: 1.87, trust: 20,
  attributes: {
    jump: 55, power: 55, reaction: 55, stamina: 55,
    speed: 55, control: 55, serve: 55, block: 55,
  },
});

function playFullSet(g, ai) {
  const all = [];
  while (g.phase !== 'set_over' && g.tick < 400000) {
    all.push(...stepGame(g, aiCollectIntents(g, ai)));
  }
  return all;
}

test('未啟用＝零副作用：state.stamina 為 null、全場零 STAMINA_LOW', () => {
  const g = createGame({ seed: 4242, setTarget: 15 });
  assert.equal(g.stamina, null);
  assert.equal(g.staminaCfg, null);
  const events = playFullSet(g, createAiState());
  assert.ok(!events.some((e) => e.type === 'STAMINA_LOW'));
});

test('啟用決定論：同種子兩跑事件流與體力表逐位一致', () => {
  const run = () => {
    const g = createGame({ seed: 777, setTarget: 15, stamina: CFG });
    const events = playFullSet(g, createAiState());
    return { events, stamina: g.stamina, score: g.match.score };
  };
  const a = run();
  const b = run();
  assert.equal(JSON.stringify(b.events), JSON.stringify(a.events));
  assert.deepEqual(b.stamina, a.stamina);
  assert.deepEqual(b.score, a.score);
});

test('零 rng 擾動：首次跨檔（首個 STAMINA_LOW）前，事件流與關閉態逐位一致', () => {
  // 體力全純算術不碰 rand；效果乘數在跨檔前恆 1 → 首個 STAMINA_LOW 之前
  // 兩條時間線必須完全相同。若這裡壞了＝有掛點在跨檔前就改了行為或吃了 rng
  const play = (stamina) => {
    const g = createGame({ seed: 91, setTarget: 25, ...(stamina ? { stamina } : {}) });
    return playFullSet(g, createAiState());
  };
  const off = play(null);
  const on = play(CFG);
  const firstLow = on.find((e) => e.type === 'STAMINA_LOW');
  if (!firstLow) {
    // 整局無人跨檔＝乘數恆 1＝兩條時間線必須全程相同（同樣是無 rng 擾動的證明）
    assert.equal(JSON.stringify(on), JSON.stringify(off));
    return;
  }
  const cut = (evs) => evs.filter((e) => e.tick < firstLow.tick);
  assert.equal(
    JSON.stringify(cut(on).filter((e) => e.type !== 'STAMINA_LOW')),
    JSON.stringify(cut(off)),
  );
});

test('動作計費：全場消耗發生、值域 [0,1]、扣球手掉幅大於非攻擊手', () => {
  const g = createGame({ seed: 1234, setTarget: 25, stamina: { A: {}, B: {} } });
  const events = playFullSet(g, createAiState());
  const spikes = {};
  for (const e of events) {
    if (e.type === 'TOUCH' && e.kind === 'spike') spikes[e.playerId] = (spikes[e.playerId] ?? 0) + 1;
  }
  const vals = Object.values(g.stamina);
  assert.ok(vals.every((v) => v >= 0 && v <= 1));
  assert.ok(vals.some((v) => v < 0.9), '整局打完無人明顯消耗＝計費沒接上');
  // 扣球最多者 vs 零扣球者：跳最貴 → 消耗應更大（同場同 rally 底扣下的相對關係）
  const ids = Object.keys(g.stamina);
  const most = ids.reduce((a, b) => ((spikes[a] ?? 0) >= (spikes[b] ?? 0) ? a : b));
  const none = ids.find((id) => !spikes[id] && g.players[id].teamId === g.players[most].teamId);
  assert.ok((spikes[most] ?? 0) >= 5, '測試前提：最多扣球者應有實質樣本');
  if (none) assert.ok(g.stamina[most] < g.stamina[none], '扣球手應比零扣球隊友累');
});

test('A4 對手慢耗：costMul 0.6 → 同額消耗 B 隊掉 0.6 倍', () => {
  const g = createGame({ seed: 5, stamina: CFG });
  const a1 = g.match.rotations.A[0];
  const b1 = g.match.rotations.B[0];
  drainStamina(g, a1, 0.1, []);
  drainStamina(g, b1, 0.1, []);
  const dropA = (1 - g.stamina[a1]) / attrCostMul(g.players[a1]);
  const dropB = (1 - g.stamina[b1]) / attrCostMul(g.players[b1]);
  assert.ok(Math.abs(dropB - dropA * 0.6) < 1e-9);
});

test('A5 屬性職能：高 stamina 抗性高、恢復快；夾限生效', () => {
  const hi = { attributes: { stamina: 85 } };
  const mid = { attributes: { stamina: 50 } };
  const lo = { attributes: { stamina: 30 } };
  assert.ok(attrCostMul(hi) < attrCostMul(mid));
  assert.equal(attrCostMul(mid), 1);
  assert.ok(attrCostMul(lo) > 1);
  assert.ok(attrCostMul(hi) >= STAMINA.COST_MUL_MIN);
  assert.ok(attrCostMul(lo) <= STAMINA.COST_MUL_MAX);
  assert.ok(attrRecovMul(hi) > attrRecovMul(mid));
  assert.equal(attrRecovMul(mid), 1);
});

test('兩段門檻：tierOf 與效果乘數（含 heavyExempt 豁免重度檔）', () => {
  assert.equal(tierOf(0.6), 0);
  assert.equal(tierOf(0.4), 1);
  assert.equal(tierOf(0.2), 2);
  assert.equal(tierOf(0.2, true), 1); // A4：對手豁免 25% 重度門檻
  const g = createGame({ seed: 5, stamina: CFG });
  const a1 = g.match.rotations.A[0];
  const b1 = g.match.rotations.B[0];
  g.stamina[a1] = 0.2;
  g.stamina[b1] = 0.2;
  assert.equal(staminaPerfMul(g, g.players[a1]), STAMINA.TIER2_MUL);
  assert.equal(staminaRecvMul(g, g.players[a1]), STAMINA.TIER2_RECV_PENALTY);
  assert.equal(staminaPerfMul(g, g.players[b1]), STAMINA.TIER1_MUL); // 豁免＝停在一段
  assert.equal(staminaRecvMul(g, g.players[b1]), 1);
  g.stamina[a1] = 0.4;
  assert.equal(staminaPerfMul(g, g.players[a1]), STAMINA.TIER1_MUL);
  assert.equal(staminaRecvMul(g, g.players[a1]), 1);
  g.stamina[a1] = 0.9;
  assert.equal(staminaPerfMul(g, g.players[a1]), 1);
  assert.equal(staminaTier(g, g.players[a1]), 0);
});

test('STAMINA_LOW：向下跨檔各發一次、檔內消耗不重發、恢復不發', () => {
  const g = createGame({ seed: 5, stamina: { A: {}, B: {} } });
  const a1 = g.match.rotations.A[0];
  const ev = [];
  g.stamina[a1] = 0.52;
  drainStamina(g, a1, 0.05 / attrCostMul(g.players[a1]), ev); // 跨 50%
  assert.equal(ev.filter((e) => e.type === 'STAMINA_LOW').length, 1);
  assert.equal(ev[0].tier, 1);
  assert.equal(ev[0].playerId, a1);
  drainStamina(g, a1, 0.05 / attrCostMul(g.players[a1]), ev); // 檔內：不重發
  assert.equal(ev.filter((e) => e.type === 'STAMINA_LOW').length, 1);
  drainStamina(g, a1, 0.2 / attrCostMul(g.players[a1]), ev); // 跨 25%
  assert.equal(ev.filter((e) => e.type === 'STAMINA_LOW').length, 2);
  assert.equal(ev[1].tier, 2);
  recoverStamina(g, a1, 1); // 回滿：無事件、封頂 1
  assert.equal(g.stamina[a1], 1);
  assert.equal(ev.filter((e) => e.type === 'STAMINA_LOW').length, 2);
});

test('A3 板凳快回：被換下的疲勞球員回速明顯高於場上死球小回', () => {
  const g = createGame({
    seed: 7, setTarget: 15, stamina: { A: {}, B: {} },
    benches: { A: [benchPlayer('A7')] },
  });
  const ai = createAiState();
  // 打到第一個死球窗，把場上一員換下（模擬「累了下場休息」）
  while (!(g.match.score.A + g.match.score.B >= 1 && g.phase === 'serve') && g.tick < 200000) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  const outId = g.match.rotations.A.find((id) => id !== 'AL');
  g.stamina[outId] = 0.2;
  assert.equal(applySubstitution(g, { team: 'A', outId, inId: 'A7' }).ok, true);
  const before = g.stamina[outId];
  const deadBefore = g.events.filter((e) => e.type === 'DEAD_BALL').length;
  while (g.phase !== 'set_over'
    && g.events.filter((e) => e.type === 'DEAD_BALL').length < deadBefore + 6
    && g.tick < 400000) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  const deadCount = g.events.filter((e) => e.type === 'DEAD_BALL').length - deadBefore;
  assert.ok(deadCount >= 3, '測試前提：需累積數個死球窗');
  const gained = g.stamina[outId] - before;
  // 板凳率 0.02/死球 vs 場上 0.004：板凳收益應顯著超過同期場上小回（attrRecovMul ≥ 0.5 保底）
  assert.ok(gained >= deadCount * STAMINA.RECOV_DEAD * 2,
    `板凳回速不足：${gained} vs ${deadCount} 個死球`);
});
