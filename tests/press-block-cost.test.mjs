// 壓手攔網的行為鎖定
//
// ★★ 2026-08-31 語意重定（Sawmah 討論定案，推翻 08-24「正面當成本」）★★
// 真實排球的壓手：手面朝下 ⇒ 手頂與正面都是優勢；專屬代價＝①觸網（realism-batch3）
// ②「吞下去」——手臂拱過網、拱形下緣與網帶之間的低窗，貼網低平球從縫隙鑽進去。
// 「擦側=打手」稅退役（打手瞄的是任何牆的外緣，非壓手專屬；08-24 那是記帳發明）。
// 本檔現在守的形狀：
//   側＝中性（SIDE_MUL 恆 1.0；≠1 要重跑 press-cost-sweep）
//   正面＝加成（BODY_MUL 1.2 > 1，方向與 08-24 相反——這是裁定的核心）
//   低窗＝壓手專屬穿透（PRESS_SEAL_GAP；直臂不受影響）——雙向都驗
//   擦頂壓死增益仍在
// 平衡帳本（press-cost-sweep 變體 1907 配對點）：全樣本 +2.0±3.1（雜訊內）、
// top +25.3 顯著——「接觸後小幅為正」係因壓手綁封線承諾（接觸前已付賭錯線的稅）。

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

const EXPECTED_SIDE_MUL = 1.0;
const EXPECTED_BODY_MUL = 1.2;

test('★側稅退役★ 擦側中性：同一顆球壓手與直立的撥出速度逐值相同', () => {
  assert.equal(TUNING.BLOCK_PRESS_SIDE_MUL, EXPECTED_SIDE_MUL,
    `常數被改成 ${TUNING.BLOCK_PRESS_SIDE_MUL} 了——改它要重跑 press-cost-sweep 並更新語意紀錄`);
  let checked = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const v = sideTouch(seed, 'vertical');
    const p = sideTouch(seed, 'press');
    if (!v || !p) continue;
    assert.equal(v.zone, 'side', `種子 ${seed} 的對照組不是擦側，治具走鐘`);
    assert.equal(p.zone, 'side', `種子 ${seed} 的壓手組不是擦側，兩組不可比`);
    assert.ok(Math.abs(Math.abs(p.vx) - Math.abs(v.vx)) < 1e-12,
      `種子 ${seed}：擦側撥出速度因手態而異＝側稅沒有退役乾淨`);
    checked += 1;
  }
  assert.ok(checked >= 10, `只驗到 ${checked} 個種子，樣本不足以說治具穩定`);
});

// ★代價・吞下去★ 治具：球貼網低平過網（y 落在網高與 PRESS_SEAL_GAP 之間的低窗）。
// 抄 sideTouch 幾何但 x=0（避開擦側）、y 壓到窗內（過網下限＝網高+球半徑≈2.535、天花板＝網高+GAP）。
function lowTouch(seed, hand) {
  const g = createGame({ seed });
  g.phase = 'rally';
  Object.assign(g.rally, {
    profile: 'spike', possession: 'B', touches: 3, lastTouchTeam: 'B', lastToucherId: 'B2',
  });
  const b = g.ball;
  b.x = 0; b.y = 2.56; b.z = -0.35; b.vx = 0; b.vy = -0.2; b.vz = 9;
  b.px = b.x; b.py = b.y; b.pz = b.z;
  g.actors.A3.x = 0; g.actors.A3.z = 0.5;
  for (let i = 0; i < 24 && g.phase === 'rally'; i += 1) {
    const ev = stepGame(g, [blockIntent('A3', g.tick, hand)]);
    const bt = ev.find((e) => e.type === 'BLOCK_TOUCH');
    if (bt) return bt;
    if (g.ball.z > 1.5 || g.ball.vz < 0) return null;
  }
  return null;
}

test('★代價・吞下去★ 低窗球：直立攔得到、壓手被鑽過去（雙向）', () => {
  // 這族治具的自然命中率 ~30%（同 bodyOutcome 註解的 27.5%）——門檻按這個底訂
  let swallowed = 0; let verticalTouched = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const v = lowTouch(seed, 'vertical');
    const p = lowTouch(seed, 'press');
    if (v) verticalTouched += 1;
    if (v && !p) swallowed += 1;
  }
  assert.ok(verticalTouched >= 8, `直立只攔到 ${verticalTouched} 次＝治具球高走鐘（該在直立可攔帶）`);
  assert.equal(swallowed, verticalTouched,
    `低窗球有 ${verticalTouched - swallowed} 次被壓手攔到＝吞下去的窗沒有生效`);
});

test('★吞下去 鑑別力★ 低窗關閉（GAP 壓到全域下限之下）⇒ 壓手攔得到同一批球', () => {
  const prev = TUNING.PRESS_SEAL_GAP;
  assert.ok(prev > 0, '低窗常數不存在或為 0＝機制沒接上');
  const prevBody = TUNING.BLOCK_PRESS_BODY_MUL;
  TUNING.PRESS_SEAL_GAP = -0.15; // 窗完全關閉（回到全域下限）
  TUNING.BLOCK_PRESS_BODY_MUL = 1.0; // 單變因隔離：正面加成也歸中性（它會讓壓手多攔）
  try {
    // 配對相等：窗關＋加成歸零後，壓手在同一批種子的接觸數必須跟直立一模一樣
    let vTouched = 0; let pTouched = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      if (lowTouch(seed, 'vertical')) vTouched += 1;
      if (lowTouch(seed, 'press')) pTouched += 1;
    }
    assert.ok(vTouched >= 8, `治具走鐘：直立只攔到 ${vTouched} 次`);
    assert.equal(pTouched, vTouched,
      `窗關＋中性下壓手接觸數仍差 ${vTouched - pTouched}＝低窗不是這個常數在管`);
  } finally {
    TUNING.PRESS_SEAL_GAP = prev;
    TUNING.BLOCK_PRESS_BODY_MUL = prevBody;
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

test('★增益二★ 正面：壓手攔死的次數多於直立（手面朝下＝球被折進對方場內）', () => {
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
  assert.ok(pBlocked > vBlocked,
    `壓手攔死 ${pBlocked} 次、直立 ${vBlocked} 次——壓手正面沒有比較會攔死 ⇒ `
    + 'BLOCK_PRESS_BODY_MUL 加成沒有生效（08-31 語意重定的核心）');
});

test('★增益二 鑑別力★ 把 BODY_MUL 調回中性，兩者的攔死次數就會相等', () => {
  const prev = TUNING.BLOCK_PRESS_BODY_MUL;
  assert.equal(prev, EXPECTED_BODY_MUL, `常數被改成 ${prev} 了`);
  assert.ok(EXPECTED_BODY_MUL > 1, '方向反了：08-31 裁定壓手正面是**加成**，小於 1 是被推翻的 08-24 舊語意');
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
