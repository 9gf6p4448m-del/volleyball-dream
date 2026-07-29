// Phase 5 W1 §9 `ActionPhaseContract` — 契約自身的單測。
// 兩組斷言：①契約的相位邊界 ②兩個既有案例（助跑／攔網 commit）確實長成這個形狀
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_PHASE, actionPhaseAt } from '../src/sim/actionPhase.js';
import { routePhaseAt, routeTicks, AIR_TICKS } from '../src/sim/approach.js';
import { TUNING } from '../src/sim/game.js';

const { WAIT, CHASE, AIR, RELEASE } = ACTION_PHASE;

test('契約：四段邊界（enter → air → air+airTicks）', () => {
  const spec = { enterTick: 100, airTick: 130, airTicks: 24 };
  assert.equal(actionPhaseAt(99, spec), WAIT);
  assert.equal(actionPhaseAt(100, spec), CHASE, '進場錨點那一 tick 就算進場');
  assert.equal(actionPhaseAt(129, spec), CHASE);
  assert.equal(actionPhaseAt(130, spec), AIR, '滯空錨點那一 tick 就算在空中');
  assert.equal(actionPhaseAt(153, spec), AIR);
  assert.equal(actionPhaseAt(154, spec), RELEASE, '窗長走完＝交還既有行為');
});

test('契約：錨點算不出來（null）＝停在前一段，不得瞎猜', () => {
  // 進場錨點缺 ⇒ 恆 wait（呼叫端回落既有行為）
  assert.equal(actionPhaseAt(9999, { enterTick: null, airTick: 10, airTicks: 24 }), WAIT);
  // 滯空錨點還沒被事件寫下 ⇒ 停在 chase，不會自己跳到 air／release
  assert.equal(actionPhaseAt(9999, { enterTick: 0, airTick: null, airTicks: 24 }), CHASE);
  // 完全沒給 spec ＝沒有任何錨點
  assert.equal(actionPhaseAt(0), WAIT);
});

test('契約：airTicks 為 0＝沒有滯空段（air 錨點一到就 release）', () => {
  assert.equal(actionPhaseAt(50, { enterTick: 0, airTick: 50, airTicks: 0 }), RELEASE);
});

test('案例 A 助跑：routePhaseAt 與 routeTicks 排定的三個錨點逐值對齊', () => {
  const setTick = 200;
  const runTicks = 30;
  for (const tempo of ['one', 'two', 'three']) {
    const t = routeTicks(tempo, setTick, runTicks);
    const route = { tempo, ...t };
    assert.equal(routePhaseAt(route, t.startTick - 1), WAIT, `${tempo}: 起步前`);
    assert.equal(routePhaseAt(route, t.startTick), CHASE, `${tempo}: 起步`);
    assert.equal(routePhaseAt(route, t.takeoffTick - 1), CHASE, `${tempo}: 起跳前`);
    assert.equal(routePhaseAt(route, t.takeoffTick), AIR, `${tempo}: 起跳`);
    assert.equal(routePhaseAt(route, t.settleTick - 1), AIR, `${tempo}: 收勢窗內`);
    assert.equal(routePhaseAt(route, t.settleTick), RELEASE, `${tempo}: 收勢完成`);
    // 契約第 2 條：air 窗長沿用既有 sim 常數，不另立標準
    assert.equal(t.settleTick - t.takeoffTick, AIR_TICKS, `${tempo}: 收勢窗長＝AIR_TICKS`);
  }
});

test('案例 A 助跑：setTick 預測失效（三個 tick 皆 null）＝恆 wait', () => {
  const route = { tempo: 'three', ...routeTicks('three', null, 30) };
  assert.equal(route.startTick, null);
  for (const tick of [0, 100, 100000]) assert.equal(routePhaseAt(route, tick), WAIT);
});

test('案例 B 攔網 commit：三段與 TUNING.BLOCK_WINDOW 對齊', () => {
  // 狀態＝{ enterTick, jumpTick }（ai.js blockCommitTargetX 的 aiState.blockCommit）
  const specOf = (c) => ({
    enterTick: c.enterTick, airTick: c.jumpTick, airTicks: TUNING.BLOCK_WINDOW,
  });
  const locked = { enterTick: 500, jumpTick: null };
  // ① 跟死：只要被跟的人還在推進（jumpTick 未寫下），永遠停在 chase
  assert.equal(actionPhaseAt(500, specOf(locked)), CHASE);
  assert.equal(actionPhaseAt(9999, specOf(locked)), CHASE);
  // ② 事件寫下錨點（他拔起來了）→ 本 tick 起算 air
  const jumped = { enterTick: 500, jumpTick: 540 };
  assert.equal(actionPhaseAt(540, specOf(jumped)), AIR);
  assert.equal(actionPhaseAt(540 + TUNING.BLOCK_WINDOW - 1, specOf(jumped)), AIR);
  // ③ 落地：close 預算在這裡結算
  assert.equal(actionPhaseAt(540 + TUNING.BLOCK_WINDOW, specOf(jumped)), RELEASE);
});
