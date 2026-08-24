// 壓手攔網的代價（2026-08-24 Sawmah 裁定「走 A」）——行為鎖定
//
// ★ 這一檔在守什麼 ★
// press 原本只在 zone==='top' 那一支生效、其餘兩區完全不讀 blockHand ⇒ **結構上不可能
// 有代價**，配對實測全樣本 +4.7pp 顯著白拿（tools/press-cost-sweep.mjs）。
// 代價現在由 sim 的兩顆鈕給：
//   BLOCK_PRESS_SIDE_MUL 1.6 —— 手前伸、側邊更空 ⇒ 擦側被撥出去的橫向速度更大
//   BLOCK_PRESS_BODY_MUL 0.7 —— 手在網的另一側 ⇒ 正面攔死的有效面積變小
// 壓手因此是「賭這球會擦到我手頂」：擦頂 +22.0pp、擦側 −10.1pp、正面 −6.8pp、
// 全樣本 −1.1pp（雜訊內）。
//
// ★ 鑑別力 ★ 把任一顆鈕改回 1.0，本檔就要紅——這正是「代價被拿掉」的形狀。

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createIntent } from '../src/sim/intent.js';

function blockIntent(playerId, tick, hand) {
  const it = createIntent({ playerId, tick, action: 'block' });
  it.hand = hand;
  return it;
}

// 擦側治具（幾何抄 tests/block-hand-tool.test.mjs 的 sideBlockRig：dx=0.45 必為擦側）。
// ★差別★ 這裡在 BLOCK_TOUCH 發生的**那一個 tick** 就把球速取下來，
// 因為要比的是「這一觸把球撥得多開」，多跑幾 tick 會被重力與空氣阻力糊掉。
function sideTouch(seed, hand) {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
  });
  const b = g.ball;
  b.x = 0.45; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 0; g.actors.A3.z = 0.5;
  for (let i = 0; i < 24 && g.phase === 'rally'; i += 1) {
    const ev = stepGame(g, [blockIntent('A3', g.tick, hand)]);
    const bt = ev.find((e) => e.type === 'BLOCK_TOUCH');
    if (bt) return { zone: bt.zone ?? 'body', vx: g.ball.vx };
    if (g.ball.z > 1.5 || g.ball.vz < 0) return null;
  }
  return null;
}

// ★期望值寫死在測試裡，不讀 TUNING★（第三輪覆審抓到的恆真式）：
// 原本拿量到的比值去比「當下的常數自己」，於是常數改成 1.0、甚至改成 0.5
//（反向＝壓手反而更不容易被撥出界＝變成獎勵）都是綠的——那顆鈕的**幅度與方向**
// 完全沒有測試在守，只有「分支存在與否」被守到。
// 1.6 的來源＝tools/press-cost-sweep.mjs 的掃描（2768 個配對接觸點），
// 要改這個數字就要重跑掃描並更新 B7-3 的修訂紀錄。
const EXPECTED_SIDE_MUL = 1.6;
const EXPECTED_BODY_MUL = 0.7;

test('★代價一★ 擦側：壓手把球撥得更開（逐值＝1.6 倍）', () => {
  assert.equal(TUNING.BLOCK_PRESS_SIDE_MUL, EXPECTED_SIDE_MUL,
    `常數被改成 ${TUNING.BLOCK_PRESS_SIDE_MUL} 了——幅度是掃描掃出來的，改它要重跑 press-cost-sweep`);
  assert.ok(EXPECTED_SIDE_MUL > 1,
    '方向反了：壓手應該讓球被撥得**更開**（代價），小於 1 會變成獎勵');
  let checked = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const v = sideTouch(seed, 'vertical');
    const p = sideTouch(seed, 'press');
    if (!v || !p) continue;
    assert.equal(v.zone, 'side', `種子 ${seed} 的對照組不是擦側，治具走鐘`);
    assert.equal(p.zone, 'side', `種子 ${seed} 的壓手組不是擦側，兩組不可比`);
    // 同一顆球、同一站位，唯一變因是手態 ⇒ 橫向速度的比值就是那顆鈕
    const ratio = Math.abs(p.vx) / Math.abs(v.vx);
    assert.ok(Math.abs(ratio - EXPECTED_SIDE_MUL) < 1e-9,
      `種子 ${seed}：壓手/直立的橫向速度比 ${ratio.toFixed(4)}，不等於期望的 ${EXPECTED_SIDE_MUL}`);
    assert.ok(ratio > 1, `種子 ${seed}：壓手撥得比直立還少（比值 ${ratio.toFixed(4)}）＝代價變獎勵`);
    checked += 1;
  }
  assert.ok(checked >= 10, `只驗到 ${checked} 個種子，樣本不足以說治具穩定`);
});

test('★代價一 鑑別力★ 把 SIDE_MUL 調回中性，壓手與直立就變成一模一樣', () => {
  const prev = TUNING.BLOCK_PRESS_SIDE_MUL;
  assert.notEqual(prev, 1.0, '原值本來就是中性 ⇒ 這條測試變成恆真式（它只證明 1.0 等於 1.0）');
  TUNING.BLOCK_PRESS_SIDE_MUL = 1.0;
  try {
    let same = 0; let checked = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const v = sideTouch(seed, 'vertical');
      const p = sideTouch(seed, 'press');
      if (!v || !p) continue;
      checked += 1;
      if (Math.abs(Math.abs(p.vx) - Math.abs(v.vx)) < 1e-12) same += 1;
    }
    assert.ok(checked > 0 && same === checked,
      `中性值下仍有 ${checked - same}/${checked} 個種子不同 ⇒ 擦側的差異不是那顆鈕造成的`);
  } finally {
    TUNING.BLOCK_PRESS_SIDE_MUL = prev;
  }
});

// 正面（body）的攔死是機率擲骰，沒有逐值可比 ⇒ 用統計。
// 治具：球正中、較低 ⇒ 落在 body 帶（非 top 非 side）。
function bodyOutcome(seed, hand) {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
  });
  const b = g.ball;
  // ★幾何實測選出來的★：x=0（正中⇒不是擦側）、y=2.75 且**不**把球逼近網
  //（逼近網會落進擦頂窄條）。40 種子探測：27.5% 命中 body、其餘 miss，
  // 其中沒有任何一顆跑到 top/side ⇒ 樣本純淨，不必再過濾。
  b.x = 0; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 0; g.actors.A3.z = 0.5;
  for (let i = 0; i < 24 && g.phase === 'rally'; i += 1) {
    const ev = stepGame(g, [blockIntent('A3', g.tick, hand)]);
    const bt = ev.find((e) => e.type === 'BLOCK_TOUCH');
    if (bt) return { blocked: true, zone: bt.zone ?? 'body' };
    if (g.ball.z > 1.5 || g.ball.vz < 0) return { blocked: false, zone: null };
  }
  return { blocked: false, zone: null };
}

test('★代價二★ 正面：壓手攔死的次數少於直立（手在網的另一側，有效面積變小）', () => {
  const N = 1200;
  let vBlocked = 0; let pBlocked = 0; let bodyZone = 0;
  for (let seed = 1; seed <= N; seed += 1) {
    const v = bodyOutcome(seed, 'vertical');
    const p = bodyOutcome(seed, 'press');
    if (v.blocked) { vBlocked += 1; if (v.zone === 'body') bodyZone += 1; }
    if (p.blocked) pBlocked += 1;
  }
  assert.ok(bodyZone > 20,
    `治具只跑出 ${bodyZone} 次 body 區接觸，樣本不足以分辨有沒有差異`);
  assert.ok(pBlocked < vBlocked,
    `壓手攔死 ${pBlocked} 次、直立 ${vBlocked} 次——壓手沒有比較難攔死 ⇒ `
    + 'BLOCK_PRESS_BODY_MUL 沒有生效（代價落空）');
});

test('★代價二 鑑別力★ 把 BODY_MUL 調回中性，兩者的攔死次數就會相等', () => {
  const prev = TUNING.BLOCK_PRESS_BODY_MUL;
  assert.equal(prev, EXPECTED_BODY_MUL, `常數被改成 ${prev} 了`);
  assert.ok(EXPECTED_BODY_MUL < 1, '方向反了：壓手應該讓正面**更難**攔死（代價），大於 1 會變成獎勵');
  TUNING.BLOCK_PRESS_BODY_MUL = 1.0;
  try {
    const N = 1200;
    let vBlocked = 0; let pBlocked = 0;
    for (let seed = 1; seed <= N; seed += 1) {
      if (bodyOutcome(seed, 'vertical').blocked) vBlocked += 1;
      if (bodyOutcome(seed, 'press').blocked) pBlocked += 1;
    }
    assert.equal(pBlocked, vBlocked,
      '中性值下兩者攔死次數不同 ⇒ body 的差異不是那顆鈕造成的（歸因錯了）');
  } finally {
    TUNING.BLOCK_PRESS_BODY_MUL = prev;
  }
});

test('★增益仍在★ 擦頂：壓手把球壓回去（代價加上去之後這一招還是有意義的）', () => {
  // 治具抄 block-hand-tool 的 topBlockRig：把球逼進擦頂窄條
  const topRig = (seed, hand) => {
    const g = createGame({ seed });
    g.phase = 'rally';
    Object.assign(g.rally, {
      profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
    });
    const b = g.ball;
    b.x = 0; b.y = 2.75; b.z = -0.35; b.vx = 0; b.vy = -1.5; b.vz = 9;
    b.px = b.x; b.py = b.y; b.pz = b.z;
    g.actors.A3.x = 0; g.actors.A3.z = 0.5;
    stepGame(g, [blockIntent('A3', g.tick, hand)]);
    for (let i = 0; i < 40 && g.phase === 'rally'; i += 1) {
      if (g.tick === 2) {
        g.ball.z = -0.01;
        g.ball.px = g.ball.x; g.ball.py = g.ball.y; g.ball.pz = g.ball.z;
        g.ball.y = 2.75;
      }
      const ev = stepGame(g, [blockIntent('A3', g.tick, hand)]);
      const bt = ev.find((e) => e.type === 'BLOCK_TOUCH');
      if (bt) return bt;
      if (g.ball.z > 1.5 || g.ball.vz < 0) return null;
    }
    return null;
  };
  const p = topRig(42, 'press');
  const v = topRig(42, 'vertical');
  assert.ok(p && v, '治具沒跑出接觸');
  assert.equal(p.zone, 'top');
  assert.equal(v.zone, 'top');
  assert.equal(p.pressed, true, '壓手在擦頂區沒有壓球 ⇒ 這一招失去存在意義');
  assert.notEqual(v.pressed, true);
});
