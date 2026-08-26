// 職業章批 4c「二段時間差」— 輸入層接線（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch4c.md：F1 未解鎖零可見（輸入半邊）、
// F2 操作面（滯空第二段拖曳＝變向）、F2-1 非時機軸（輸入層不讀第二段按多久）。
// sim 層 F2-F5 見 tests/pro-batch4c.test.mjs。
//
// ★ 真的按下去（uni-tech-panel 的 B7-2 教訓：死按鈕在畫面上長得跟活的一樣）★
// 走真實 createMatchControls：beginAction→dragAction→endAction 兩輪（第一輪＝出手起跳、
// 第二輪＝滯空變向），再由真實 collect() 驗 intent.retargetAim。替身只有 window/DOM/rig
//（事件註冊與視線），不碰 intent 的任何欄位。
//
// ★ 改前紅紀律 ★ 新增的具名匯出（retargetEligible／computeRetarget）以 namespace
// import 取用——改制前的模組缺這些符號時是 undefined（行為紅），不是 import 炸檔。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../src/sim/game.js';
import * as MC from '../src/input/matchControls.js';
import * as G from '../src/sim/game.js';
import { createCareerPlayer } from '../src/career/careerState.js';

const { createMatchControls } = MC;

// 宿主替身（逐字沿 uni-tech-panel.test.mjs 的 withControls）
function withControls(playerId, fn, simpleMode = true) {
  const prev = Object.prototype.hasOwnProperty.call(globalThis, 'window')
    ? globalThis.window : undefined;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const domElement = { addEventListener() {}, removeEventListener() {} };
  const rig = {
    setLook() {}, resetLook() {}, getMode: () => 'third', gazePoint: () => null,
  };
  try {
    return fn(createMatchControls(domElement, null, playerId, rig, simpleMode));
  } finally {
    if (prev === undefined) delete globalThis.window; else globalThis.window = prev;
  }
}

// A 隊第三擊、輪到 A2 扣球的比賽狀態（contextAction ⇒ 'spike'）
function rigSpikeCtx(seed = 1) {
  const g = createGame({ seed });
  g.phase = 'rally';
  g.rally.profile = 'arc';
  g.rally.possession = 'A';
  g.rally.touches = 2;
  g.rally.lastTouchTeam = 'A';
  g.rally.lastToucherId = 'A1';
  return g;
}

// 兩輪按鈕操作：第一輪出手（起跳＋掛扣球緩衝）、第二輪拖曳（變向）；回傳 collect 的 intent
function twoPressIntent(g, c, secondDrag = { dx: 60, dy: -80 }, busyMs = 0) {
  c.collect(g); // 餵 lastGame（contextAction 的依據）
  c.beginAction();
  c.endAction(); // 第一段出手：queuedAction 掛上（jumpAt＝起跳時刻）
  const first = c.collect(g)[0];
  assert.equal(first.action, 'spike', '治具前提：第一段就是扣球情境');
  c.beginAction();
  if (busyMs > 0) { // 同步忙等＝模擬第二段「按比較久才放」（F2-1 要證明這不影響任何值）
    const t0 = performance.now();
    while (performance.now() - t0 < busyMs) { /* busy */ }
  }
  c.dragAction(secondDrag.dx, secondDrag.dy);
  c.endAction(); // 第二段放開＝變向
  return { first, second: c.collect(g)[0] };
}

test('W1 解鎖時：滯空第二段拖曳 ⇒ intent.retargetAim（同第一段的拖曳→落點換算）', () => {
  withControls('A2', (c) => {
    const g = rigSpikeCtx(1);
    const { second } = twoPressIntent(g, c);
    assert.equal(second.action, 'spike');
    assert.ok(second.retargetAim, '第二段拖曳應化為 intent.retargetAim');
    // 期望值＝與第一段 aimVec 同一套換算（拖曳向量→場地方向、距離 3-9m）
    const a = g.actors.A2;
    const len = Math.hypot(60, -80);
    const dist = 3 + (Math.min(len, 130) / 130) * 6;
    assert.ok(Math.abs(second.retargetAim.x - (a.x + (60 / len) * dist)) < 1e-9);
    assert.ok(Math.abs(second.retargetAim.z - (a.z + (-80 / len) * dist)) < 1e-9);
  });
});

test('W2 ★F2-1 非時機軸★：第二段按多久、窗內何時放開，timing 與 retargetAim 逐值不變', () => {
  const run = (busyMs) => withControls('A2', (c) => {
    const g = rigSpikeCtx(1);
    const { first, second } = twoPressIntent(g, c, { dx: 60, dy: -80 }, busyMs);
    return { firstTiming: first.timing, timing: second.timing, aim: second.retargetAim };
  });
  const quick = run(0);
  const slow = run(35); // 第二段慢 35ms 才放開
  assert.ok(quick.aim && slow.aim);
  // 變向的全部語意＝改打哪裡：落點只由拖曳向量決定
  assert.deepEqual(slow.aim, quick.aim, '第二段按多久不得影響變向落點');
  // timing 恆＝第一段出手的品質，第二段完全不產生新的時機判定
  assert.equal(slow.timing, slow.firstTiming, '第二段放開不得改寫 timing');
  assert.equal(quick.timing, quick.firstTiming);
});

test('W3 F1 未解鎖零可見（輸入半邊）：生涯未受教 ⇒ 第二段拖曳不產生 retargetAim（零新判定）', () => {
  withControls('A2', (c) => {
    const g = rigSpikeCtx(1);
    g.players.A2.techniques.doubleSpike = 0; // 生涯未受教
    const { second } = twoPressIntent(g, c);
    assert.equal(second.retargetAim, undefined,
      '未解鎖時 intent 不得帶 retargetAim（sim 端還有第二道閘，這裡驗輸入層那道）');
  });
});

test('W4 重度疲勞檔（F2-2）：體力 <25% ⇒ 輸入層直接不受理變向', () => {
  withControls('A2', (c) => {
    const g = rigSpikeCtx(1);
    g.stamina = { A2: 0.1 }; // 重度檔（staminaTier ⇒ 2）；體力條是雙方可見的公開資訊
    const { second } = twoPressIntent(g, c);
    assert.equal(second.retargetAim, undefined, '重度疲勞不得變向');
  });
});

test('W5 retargetEligible 純函式：預設開（快速比賽）／未受教關／重度疲勞關', () => {
  assert.equal(typeof MC.retargetEligible, 'function', 'retargetEligible 應存在（輸入層閘）');
  const g = rigSpikeCtx(1);
  assert.equal(MC.retargetEligible(g, 'A2'), true, '快速比賽預設全開');
  const locked = rigSpikeCtx(1);
  locked.players.A2.techniques.doubleSpike = 0;
  assert.equal(MC.retargetEligible(locked, 'A2'), false);
  const tired = rigSpikeCtx(1);
  tired.stamina = { A2: 0.1 };
  assert.equal(MC.retargetEligible(tired, 'A2'), false);
  assert.equal(MC.retargetEligible(g, 'NOBODY'), false, '查無此人＝不受理');
});

test('W6 computeRetarget 純函式契約：無時間參數、角度線性封頂、退化護欄回 null', () => {
  assert.equal(typeof G.computeRetarget, 'function', 'computeRetarget 應存在');
  assert.equal(G.computeRetarget.length, 3, '參數＝(from, firstAim, newAim)——沒有任何時間量');
  const from = { x: 0, y: 3, z: 1.2 };
  const first = { x: 4.5, z: -5 };
  // 退化護欄：新落點與擊球點重合 ⇒ null（不假拉滿）
  assert.equal(G.computeRetarget(from, first, { x: 0, z: 1.2 }), null);
  // 封頂 <1（F4 不得 100% 得利）
  const capped = G.computeRetarget(from, first, { x: -4.5, z: -5 });
  assert.ok(Math.abs(capped.deceiveP - G.TUNING.DBL_SPIKE_DECEIVE_GAIN) < 1e-9);
  assert.ok(G.TUNING.DBL_SPIKE_DECEIVE_GAIN < 1);
  // 覆審修 3（滑鼠誤觸護欄）：newAim 與 firstAim 逐值相同或 ε 內 ⇒ null（同層護欄）
  assert.equal(G.computeRetarget(from, first, { ...first }), null, '同落點誤觸應回 null');
  assert.equal(G.computeRetarget(from, first, { x: first.x + 1e-8, z: first.z - 1e-8 }), null,
    'ε 內抖動同樣回 null');
  // θ=0 但不同落點（同方向改深度）仍回物件＝收費語意不變（既有語意，只嚴不鬆）
  const depth = G.computeRetarget(from, first, {
    x: from.x + 0.6 * (first.x - from.x), z: from.z + 0.6 * (first.z - from.z),
  });
  assert.ok(depth !== null && Math.abs(depth.deceiveP) < 1e-9,
    '同方向改深度＝合法變向（代價照付）但騙不到網口的牆');
});

test('W7 生涯主角在職業章前的存檔形狀：doubleSpike 顯式 0（配 sim 端 ?? 1 閘不漏氣）', () => {
  const p = createCareerPlayer('主角', { seed: 9 });
  assert.equal(p.techniques.doubleSpike, 0);
});

// ★ 覆審 LOW 順帶（刻意取捨釘住，防未來誤修）★
// 滯空窗（JUMP_WINDOW_MS=900ms）內按鈕路徑的短按（拖曳 <14px＝無方向語意）
// **整下吞掉**：不變向（沒有落點可言）、也不落回舊路徑重出手——落回會原地重開
// 滯空窗＝把變向失手變成白拿的第二跳。這是設計取捨不是 bug；誰把這一下改成
// 「重跳」或「原地變向」，本測就紅。
test('W8 滯空窗內短按（<14px）被吞：不變向、不重跳、不改寫第一段出手品質', () => {
  withControls('A2', (c) => {
    const g = rigSpikeCtx(1);
    c.collect(g);
    c.beginAction();
    c.endAction(); // 第一段出手＝起跳
    assert.equal(c.consumeJumpSignal(), true, '治具前提：第一段出手確實起跳');
    const first = c.collect(g)[0];
    assert.equal(first.action, 'spike', '治具前提：第一段就是扣球情境');
    c.beginAction();
    c.dragAction(5, -8); // <14px：誤觸級的抖動
    c.endAction();
    assert.equal(c.consumeJumpSignal(), false,
      '短按不得重開滯空窗（原地重跳＝白拿的第二跳，刻意取捨）');
    const second = c.collect(g)[0];
    assert.equal(second.retargetAim, undefined, '短按無方向語意，不得化為變向');
    assert.equal(second.timing, first.timing, '短按不得改寫第一段的出手品質');
  });
});
