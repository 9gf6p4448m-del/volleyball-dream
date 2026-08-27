// 接球微回饋 批2（丙1/丙2/丙3，acceptance-netduel-batch2.md，2026-08-27）
// NJ-2/NJ-3：matchLoop 觸發判定（抽在 src/ui/receiveJuice.js 的純函式）
// NJ-4：sim TOUCH 事件的 `perfect` 唯讀欄位——單一來源＝receivePerfectMul(rawT)
//
// NJ-6 突變實測（真的做過，非紙上談兵）：
// ①「perfect 改抄死 0.95 字面」——把 src/sim/game.js 的 receivePerfectMul 內部
//   門檻臨時改成 0.80（模擬「真相source改了」），並把 ev.push 那行的
//   `receivePerfectMul(rawT) !== 1` 臨時改成硬抄字面 `rawT >= 0.95`（模擬「call
//   site 脫離單一來源」）。用 timing=0.85 重跑本檔「perfect 欄位單一來源」測試：
//   正確寫法（呼叫 receivePerfectMul）跟著門檻變動答 true；硬抄 0.95 字面版本
//   答 false，斷言在該測試紅掉（`touch.perfect` 應為 true 卻拿到 false）。兩處
//   改動事後都已還原，最終 diff 對 game.js 僅剩單一欄位外露那行。
// ②「丙1 拿掉重扣限定」——把 src/ui/receiveJuice.js 的
//   `if ((prevTouch.power ?? 1) < HEAVY_SPIKE_POWER_MIN) return false;` 臨時砍掉，
//   重跑本檔「輕吊不觸發」測試：`isHeavySpikeDig` 對輕球（power=0.3）答 true，
//   斷言（應為 false）紅掉。已還原。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, TUNING, receivePerfectMul } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';
import { reachVolumeFor, REACH_ACTION } from '../src/sim/reach.js';
import { isHeavySpikeDig, isDiveSaveTouch, HEAVY_SPIKE_POWER_MIN } from '../src/ui/receiveJuice.js';

// ───────────────────── 丙1：isHeavySpikeDig（純函式） ─────────────────────

test('丙1 isHeavySpikeDig：對方重扣＋我方非扣球觸球＝true', () => {
  const prev = { team: 'B', kind: 'spike', power: 0.9 };
  const ev = { type: 'TOUCH', kind: 'receive', team: 'A' };
  assert.equal(isHeavySpikeDig(prev, ev), true);
});

test('丙1 isHeavySpikeDig：輕吊（power < 門檻）不觸發（NJ-6 突變②已實測會紅）', () => {
  const prev = { team: 'B', kind: 'spike', power: 0.3 };
  const ev = { type: 'TOUCH', kind: 'receive', team: 'A' };
  assert.equal(isHeavySpikeDig(prev, ev), false);
  // 門檻邊界：恰等於 HEAVY_SPIKE_POWER_MIN 算重扣（>=）
  assert.equal(isHeavySpikeDig({ team: 'B', kind: 'spike', power: HEAVY_SPIKE_POWER_MIN }, ev), true);
  assert.equal(
    isHeavySpikeDig({ team: 'B', kind: 'spike', power: HEAVY_SPIKE_POWER_MIN - 0.01 }, ev),
    false,
  );
});

test('丙1 isHeavySpikeDig：同隊連續觸球不算「救起」（沒有跨隊）', () => {
  const prev = { team: 'A', kind: 'spike', power: 0.9 };
  const ev = { type: 'TOUCH', kind: 'set', team: 'A' };
  assert.equal(isHeavySpikeDig(prev, ev), false);
});

test('丙1 isHeavySpikeDig：扣球者自己那一下排除（既有 hit-stop 通道已覆蓋，不重疊）', () => {
  const prev = { team: 'B', kind: 'spike', power: 0.9 };
  const ev = { type: 'TOUCH', kind: 'spike', team: 'A' };
  assert.equal(isHeavySpikeDig(prev, ev), false);
});

test('丙1 isHeavySpikeDig：上一次觸球不是扣球（如攔網/舉球）不算', () => {
  const ev = { type: 'TOUCH', kind: 'receive', team: 'A' };
  assert.equal(isHeavySpikeDig({ team: 'B', kind: 'block' }, ev), false);
  assert.equal(isHeavySpikeDig({ team: 'B', kind: 'set', power: 0.9 }, ev), false);
  assert.equal(isHeavySpikeDig(null, ev), false);
});

test('丙1 isHeavySpikeDig：非 TOUCH 事件（BLOCK_TOUCH/DEAD_BALL）不觸發', () => {
  const prev = { team: 'B', kind: 'spike', power: 0.9 };
  assert.equal(isHeavySpikeDig(prev, { type: 'BLOCK_TOUCH', team: 'A' }), false);
  assert.equal(isHeavySpikeDig(prev, { type: 'DEAD_BALL', team: 'A' }), false);
  assert.equal(isHeavySpikeDig(prev, null), false);
});

// ───────────────────── 丙2：isDiveSaveTouch（純函式） ─────────────────────

test('丙2 isDiveSaveTouch：TOUCH kind===dive 才算成功救起', () => {
  assert.equal(isDiveSaveTouch({ type: 'TOUCH', kind: 'dive' }), true);
  assert.equal(isDiveSaveTouch({ type: 'TOUCH', kind: 'receive' }), false);
  assert.equal(isDiveSaveTouch({ type: 'TOUCH', kind: 'spike' }), false);
  assert.equal(isDiveSaveTouch({ type: 'BLOCK_TOUCH', kind: 'dive' }), false);
  assert.equal(isDiveSaveTouch(null), false);
});

// ───────────────────── 丙3：sim TOUCH 事件的 perfect 欄位 ─────────────────────

// 沿用 tests/blown.test.mjs 的治具範式：把球放在 A5 頭上、以指定 timing 觸球
function rig(timing) {
  const g = createGame({ seed: 9 });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'arc', possession: 'B', touches: 0, lastTouchTeam: 'B', lastToucherId: 'B1', flightId: 1,
  });
  const b = g.ball;
  b.x = 0; b.y = 1.2; b.z = 5.2; b.vx = 0; b.vy = -3; b.vz = 6;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.players.A5.attributes.control = 90;
  g.players.A5.attributes.reaction = 90;
  const vol = reachVolumeFor({
    player: g.players.A5, actor: { x: 0, z: 5.2 }, action: REACH_ACTION.RECEIVE, tuning: TUNING,
  });
  const dy = b.y - vol.cy;
  g.actors.A5.x = 0.5 * Math.sqrt(Math.max(0, vol.r * vol.r - dy * dy));
  g.actors.A5.z = 5.2;
  return g;
}

function receiveOnce(timing) {
  const g = rig(timing);
  stepGame(g, [createIntent({
    playerId: 'A5', tick: g.tick, action: 'receive', aim: { x: 1.2, z: 1.2 }, timing,
  })]);
  return g.events.find((e) => e.type === 'TOUCH');
}

test('perfect 欄位單一來源：timing≥0.95 才 true，且與 receivePerfectMul(timing) 逐值一致', () => {
  for (const timing of [0, 0.3, 0.6, 0.9, 0.9499, 0.95, 0.96, 1]) {
    const touch = receiveOnce(timing);
    assert.ok(touch, `timing=${timing} 應觸到球`);
    const expected = receivePerfectMul(timing) !== 1;
    assert.equal(touch.perfect, expected,
      `timing=${timing}：perfect 應為 ${expected}（receivePerfectMul 同一來源），實際 ${touch.perfect}`);
  }
});

test('perfect 邊界：0.94 非完美、0.95 完美（不得另抄門檻，只准經由 receivePerfectMul 判）', () => {
  assert.equal(receiveOnce(0.94).perfect, false);
  assert.equal(receiveOnce(0.95).perfect, true);
});

test('perfect 欄位只在接球類（receive/dive）出現，spike/set 事件不帶這個鍵', () => {
  const g = createGame({ seed: 3 });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'arc', possession: 'A', touches: 1, lastTouchTeam: 'A', lastToucherId: 'A2', flightId: 1,
  });
  const b = g.ball;
  b.x = 0; b.y = 2.6; b.z = 3.5; b.vx = 0; b.vy = 0; b.vz = 0;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A4.x = 0; g.actors.A4.z = 3.4;
  stepGame(g, [createIntent({
    playerId: 'A4', tick: g.tick, action: 'spike', aim: { x: 0, z: -6 }, timing: 1,
  })]);
  const touch = g.events.find((e) => e.type === 'TOUCH');
  assert.ok(touch, '應觸到球（扣球）');
  assert.equal(touch.kind, 'spike');
  assert.equal('perfect' in touch, false, 'spike TOUCH 不應帶 perfect 鍵');
});

test('perfect 欄位不影響決定論：同種子同 timing 重跑逐值一致', () => {
  const a = receiveOnce(0.97);
  const b = receiveOnce(0.97);
  assert.equal(a.perfect, true);
  assert.deepEqual(a, b);
});

test('魚躍（dive）觸球一樣讀得到 perfect——不限 kind===receive', () => {
  const g = createGame({ seed: 9 });
  g.phase = 'rally';
  Object.assign(g.rally, { profile: 'arc', possession: 'B', touches: 0, lastTouchTeam: 'B', lastToucherId: 'B1' });
  const b = g.ball;
  b.x = 0; b.y = 0.6; b.z = 4.9; b.vx = 0; b.vy = -2; b.vz = 0;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A5.x = 0; g.actors.A5.z = 6.5; // 站立搆不到、魚躍搆得到（同 tests/serve-dive.test.mjs 治具）
  stepGame(g, [createIntent({
    playerId: 'A5', tick: g.tick, action: 'dive', aim: { x: 0, z: 2 }, timing: 0.97,
  })]);
  const touch = g.events.find((e) => e.type === 'TOUCH');
  assert.equal(touch?.kind, 'dive');
  assert.equal(touch?.perfect, true, '魚躍 timing≥0.95 一樣算完美接球（同一來源，不分 receive/dive）');
});
