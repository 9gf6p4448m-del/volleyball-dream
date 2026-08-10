// 二次球相遇點輔助（`src/app/contactAssist.js`）——純函式驗收
//
// 背景：操作輔助的落點圈原本畫 `predictLanding()`（球落地點），但二次球攻擊必須在
// 球高於幾何可及下限時擊出，落地點與「該站的點」差 0.72m 中位數，實測「人到了卻
// 搆不到」13.4%。改瞄 `predictContactPoint(ball, 該檔手點高度)` 後降到 0.0%（scratchpad
// `set-h5-probe.mjs`）。本檔只驗純函式本身；接線（matchLoop 是否真的用它畫圈）見
// `contact-assist-wiring.test.mjs`。
//
// 手點/半徑一律呼叫真實 `src/sim/reach.js`（不重抄比例常數）——測試也一樣，門檻值
// 從真實匯出的函式現算，reach.js 的常數以後調整時本檔不必跟著改。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactAssistFor } from '../src/app/contactAssist.js';
import { predictContactPoint, predictLanding } from '../src/sim/flight.js';
import {
  reachRadiusFor, REACH_ACTION, SET_HANDPOINT_H_RATIO, RECEIVE_HANDPOINT_H_RATIO,
} from '../src/sim/reach.js';
import { spikeReach } from '../src/sim/player.js';
import { TUNING } from '../src/sim/game.js';

const H = 1.85;
const PID = 'A2';
const TEAM = 'A';

function makePlayer(over = {}) {
  return {
    id: PID,
    teamId: TEAM,
    currentRole: 'setter',
    height: { current: H },
    attributes: { jump: 50 },
    ...over,
  };
}
const ACTOR = { x: 0, z: 2 };

// rotation 陣列語意（src/sim/rotation.js `positionOf`）：index0＝1號位…index5＝6號位；
// 前排＝2/3/4號位（index1/2/3）、後排＝1/5/6號位（index0/4/5）。
// 預設把 PID 放在 index1（前排 2 號位）——多數測試假設「二傳有完整三檔」，
// 後排限定的行為由專門的 rotation 覆寫測試單獨驗（見下方「前後排」區塊）。
const FRONT_ROW_ROTATION = ['x1', PID, 'x3', 'x4', 'x5', 'x6'];
const BACK_ROW_ROTATION = [PID, 'x2', 'x3', 'x4', 'x5', 'x6'];

// 假 game：不帶 `stamina` 欄位 ⇒ `staminaPerfMul` 天然回傳 1（沒有體力系統時的
// 既有預設行為，見 stamina.js `staminaTier`：`if (!state.stamina) return 0`）。
function makeGame({
  phase = 'rally', possession = TEAM, touches = 1, ball, rotation = FRONT_ROW_ROTATION,
} = {}) {
  return {
    phase,
    rally: { possession, touches },
    ball: { x: 0, y: 2, z: 3, vx: 0, vy: -2, vz: -1, ...ball },
    match: { rotations: { [TEAM]: rotation } },
  };
}

// 三檔的真實門檻（現算，不重抄）
const spikeHandY = spikeReach(makePlayer(), 1);
const spikeR = reachRadiusFor(REACH_ACTION.SPIKE, TUNING, H);
const spikeFloor = spikeHandY - spikeR;
const setHandY = SET_HANDPOINT_H_RATIO * H;
const setR = reachRadiusFor(REACH_ACTION.SET, TUNING, H);
const setFloor = setHandY - setR;
const receiveHandY = RECEIVE_HANDPOINT_H_RATIO * H;

function call(ballY, over = {}) {
  const player = makePlayer(over.player);
  const game = makeGame({ ball: { y: ballY, ...over.ball }, ...over.gameOver });
  return contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING, claimId: over.claimId ?? PID,
    // 多數測試假設「二傳有完整三檔」⇒ 預設一傳 perfect；非 perfect 的行為由專門的
    // 「一傳品質」區塊單獨驗（見下方）。
    passTier: 'passTier' in over ? over.passTier : 'perfect',
  });
}

// ════════ 三檔邊界（剛好在門檻上下） ════════

test('spike 檔：ball.y 剛高於 spikeFloor（嚴格大於）', () => {
  const r = call(spikeFloor + 0.01);
  assert.equal(r.tier, 'spike');
});

test('spike 檔邊界：ball.y 恰等於 spikeFloor ⇒ 不算 spike（嚴格大於），落到 set 檔', () => {
  const r = call(spikeFloor);
  assert.equal(r.tier, 'set', '門檻是 >，不是 >=——恰好相等不得算過關');
});

test('set 檔：低於 spikeFloor、高於 setFloor', () => {
  const r = call(spikeFloor - 0.01);
  assert.equal(r.tier, 'set');
});

test('set 檔邊界：ball.y 恰等於 setFloor ⇒ 不算 set（嚴格大於），落到 receive 檔', () => {
  const r = call(setFloor);
  assert.equal(r.tier, 'receive');
});

test('receive 檔：低於 setFloor', () => {
  const r = call(setFloor - 0.01);
  assert.equal(r.tier, 'receive');
});

// ════════ 前後排（2026-08-10 覆審修）════════
//
// 病灶：`setOptions.js:93` 的🎯二次球選項條件是 `tier==='perfect' && !isBackRow`——
// 後排二傳的畫面上根本沒有那顆攻擊鈕。若相遇點圈對後排二傳照樣顯示 spike 檔（綠色），
// 等於畫面在承諾一個他手上按不到的動作，是本批要消滅的那種畫面謊言。後排二傳的
// 最高檔應該是 set（他仍要知道該站哪去舉球），不是整個不顯示。
// 成對驗證：同一個球高，後排＝set、前排＝spike，防止改法變成「後排恆回 set」
// 這種恆真判準悄悄吃掉前排的 spike 檔。

test('★前後排★ 後排二傳：球高於扣球下限時，跳過 spike 檔、落到 set 檔', () => {
  const r = call(spikeFloor + 1.0, { gameOver: { rotation: BACK_ROW_ROTATION } });
  assert.equal(r.tier, 'set', '後排沒有🎯二次球鈕，圈不得承諾 spike');
  const expected = predictContactPoint(
    { x: 0, y: spikeFloor + 1.0, z: 3, vx: 0, vy: -2, vz: -1 },
    SET_HANDPOINT_H_RATIO * H,
  );
  assert.deepEqual(r.point, { x: expected.x, z: expected.z }, '位置要是 set 檔的相遇點，不是 spike 檔的');
});

test('★前後排★ 前排二傳：同一個球高仍是 spike 檔（防止「後排恆回 set」吃掉前排）', () => {
  const r = call(spikeFloor + 1.0, { gameOver: { rotation: FRONT_ROW_ROTATION } });
  assert.equal(r.tier, 'spike');
});

// ════════ 一傳品質（2026-08-10 覆審修，同一個 bug 的另一半）════════
//
// 病灶：`setOptions.js:93` 完整條件是 `tier==='perfect' && !isBackRow`——上一輪只接了
// `!isBackRow` 那半，一傳不是 perfect 時（ok/poor）🎯二次球鈕同樣不存在，但圈當時
// 還是照樣顯示 spike 檔。規劃時序已核對：`aiState.passTier` 與 claim 同一次規劃寫入
// （ai.js:443），圈開始顯示時 passTier 已經定案，不是「還沒決定」的值。
// 成對驗證同前後排那組：同一個球高，perfect＝spike、ok/poor＝set，防止改法
// 變成恆回 set 吃掉 perfect 的 spike 檔。

test('★一傳品質★ 前排＋一傳 perfect：球高於扣球下限時仍是 spike 檔', () => {
  const r = call(spikeFloor + 1.0, { passTier: 'perfect' });
  assert.equal(r.tier, 'spike');
});

test('★一傳品質★ 前排＋一傳 ok：跳過 spike 檔、落到 set 檔（🎯鈕不存在）', () => {
  const r = call(spikeFloor + 1.0, { passTier: 'ok' });
  assert.equal(r.tier, 'set');
});

test('★一傳品質★ 前排＋一傳 poor：同樣跳過 spike 檔、落到 set 檔', () => {
  const r = call(spikeFloor + 1.0, { passTier: 'poor' });
  assert.equal(r.tier, 'set');
});

test('★一傳品質★ passTier 未傳（undefined）＝安全預設：不得回 spike', () => {
  const r = call(spikeFloor + 1.0, { passTier: undefined });
  assert.notEqual(r.tier, 'spike', 'passTier 讀不到要往「不承諾」倒，不是往「放行」倒');
  assert.equal(r.tier, 'set');
});

// ════════ 位置＝真實 predictContactPoint(ball, 該檔 handY) ════════
//
// ★ 鑑別力陷阱（02 §6.1 條 6）★ `predictContactPoint` 只在球「當前仍高於 handY、
// 之後會下墜穿越它」時才回傳真正的相遇點；若起始球高已經**低於** handY，函式找不到
// 未來的穿越點，會直接退化成 `predictLanding`（見 flight.js 檔頭註解）。門檻判準
// 只要求 `ball.y > 該檔floor`（floor = handY − r），floor 本身就低於 handY——若這裡
// 只把球高设在「剛過 floor」，會不小心落進「已經低於 handY」的退化區，讓
// `predictContactPoint(ball, handY)` 跟 `predictLanding(ball)` 逐值相同，這條測試
// 就算把 contactAssist.js 錯改回 predictLanding 也照樣是綠燈（零鑑別力）。
// 所以這三支「位置」測試一律把球高設在**高於 handY 本身**，確保真的存在一個未來
// 穿越點、且與地板落點不同——見下方 §6.1 條 1 反面驗證的注入破壞紀錄。

test('位置：spike 檔的 point 逐值等於 predictContactPoint(ball, spikeHandY)', () => {
  const ball = {
    x: 1.1, y: spikeHandY + 1.0, z: 3.4, vx: 0.4, vy: -3, vz: -2.1,
  };
  const player = makePlayer();
  const game = makeGame({ ball });
  const r = contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING, claimId: PID, passTier: 'perfect',
  });
  assert.equal(r.tier, 'spike');
  const expected = predictContactPoint(ball, spikeReach(player, 1));
  assert.notDeepEqual(expected, predictLanding(ball),
    '測試夾具本身必須讓相遇點與落地點不同，否則這條測試沒有鑑別力');
  assert.deepEqual(r.point, { x: expected.x, z: expected.z });
});

test('位置：set 檔的 point 逐值等於 predictContactPoint(ball, SET_HANDPOINT_H_RATIO×H)', () => {
  const ball = {
    x: -0.6, y: (setHandY + spikeFloor) / 2, z: 2.7, vx: -0.2, vy: -2.5, vz: -1.8,
  };
  const player = makePlayer();
  const game = makeGame({ ball });
  const r = contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING, claimId: PID,
  });
  assert.equal(r.tier, 'set');
  const expected = predictContactPoint(ball, SET_HANDPOINT_H_RATIO * H);
  assert.notDeepEqual(expected, predictLanding(ball),
    '測試夾具本身必須讓相遇點與落地點不同，否則這條測試沒有鑑別力');
  assert.deepEqual(r.point, { x: expected.x, z: expected.z });
});

test('位置：receive 檔的 point 逐值等於 predictContactPoint(ball, RECEIVE_HANDPOINT_H_RATIO×H)', () => {
  const ball = {
    x: 0.3, y: (receiveHandY + setFloor) / 2, z: 3.1, vx: 0.1, vy: -1.9, vz: -1.5,
  };
  const player = makePlayer();
  const game = makeGame({ ball });
  const r = contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING, claimId: PID,
  });
  assert.equal(r.tier, 'receive');
  const expected = predictContactPoint(ball, receiveHandY);
  assert.notDeepEqual(expected, predictLanding(ball),
    '測試夾具本身必須讓相遇點與落地點不同，否則這條測試沒有鑑別力');
  assert.deepEqual(r.point, { x: expected.x, z: expected.z });
});

// ════════ 四個 null 條件，各一支 ════════

test('null①：game.phase !== "rally"（死球/發球等）不顯示', () => {
  const player = makePlayer();
  const game = makeGame({ phase: 'serve', ball: { y: spikeFloor + 1 } });
  assert.equal(contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING, claimId: PID,
  }), null);
});

test('null②：球不是我方的第二觸（touches!==1 或 possession 不是本隊）不顯示', () => {
  const player = makePlayer();
  const notSecondTouch = makeGame({ touches: 2, ball: { y: spikeFloor + 1 } });
  assert.equal(contactAssistFor({
    game: notSecondTouch, player, actor: ACTOR, tuning: TUNING, claimId: PID,
  }), null, 'touches===2＝第三觸，不是我方第二觸');
  const otherTeamBall = makeGame({ possession: 'B', touches: 1, ball: { y: spikeFloor + 1 } });
  assert.equal(contactAssistFor({
    game: otherTeamBall, player, actor: ACTOR, tuning: TUNING, claimId: PID,
  }), null, '球權在對方，不是我方觸球');
});

test('null③：claim 沒指到這名球員不顯示（含 claimId 未傳＝undefined 的安全預設）', () => {
  const player = makePlayer();
  const game = makeGame({ ball: { y: spikeFloor + 1 } });
  assert.equal(contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING, claimId: 'A1',
  }), null, 'claim 指到別人');
  assert.equal(contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING, claimId: undefined,
  }), null, '★claimId 未傳不得當成「沒人 claim 所以放行」——預設值要往安全方向倒★');
  assert.equal(contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING,
  }), null, '呼叫端整個漏傳 claimId 欄位，同樣視為未 claim');
});

test('null④：該球員不是二傳不顯示', () => {
  const player = makePlayer({ currentRole: 'outside' });
  const game = makeGame({ ball: { y: spikeFloor + 1 } });
  assert.equal(contactAssistFor({
    game, player, actor: ACTOR, tuning: TUNING, claimId: PID,
  }), null);
});
