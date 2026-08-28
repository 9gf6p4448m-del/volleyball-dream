// 接線驗收：matchLoop.js 的 `updateAssistAndPoses` 是否真的把 `contactAssist.js`
// 的結果畫到 `stage.landingMarker` 上——純函式測對不代表接上了（本專案的教訓：UI
// 價值全在接線上，源碼掃描驗不到；曾有浮鈕定義了、接了、但漏加 return 清單而出廠
// 隱形）。用假 `stage`（沿 `camp-reminder.test.mjs`／`replay-vault.test.mjs` 的假 DOM
// 範式：只做最小替身、記錄呼叫，不搭真的 three.js 場景）＋真實 `createGame` 產生的
// 球員/球，直接呼叫真正的 `updateAssistAndPoses`，斷言 `landingMarker` 收到的
// 位置與顏色。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateAssistAndPoses } from '../src/app/matchLoop.js';
import { createGame, TUNING } from '../src/sim/game.js';
import { predictLanding, predictContactPoint } from '../src/sim/flight.js';
import {
  reachRadiusFor, REACH_ACTION, SET_HANDPOINT_H_RATIO, RECEIVE_HANDPOINT_H_RATIO,
} from '../src/sim/reach.js';
import { spikeReach } from '../src/sim/player.js';
import { landedCourtTeam } from '../src/sim/rotation.js';

const PID = 'A1'; // createDefaultTeams 的 A1＝二傳（DEFAULT_LINEUP 第一格 role:'setter'）

function fakeLandingMarker() {
  const calls = [];
  return {
    calls,
    show(point) { calls.push({ fn: 'show', point: { ...point } }); },
    hide() { calls.push({ fn: 'hide' }); },
    setColor(hex) { calls.push({ fn: 'setColor', hex }); },
  };
}

function fakeStage() {
  return {
    landingMarker: fakeLandingMarker(),
    matchView: { setHot() {}, triggerPose() {}, triggerContact() {} },
    controls: { consumeJumpSignal: () => false, consumeBlockSignal: () => false },
  };
}

// `createGame` 的預設輪轉＝roster 原序（A1..A6 依序落在 1~6 號位）⇒ A1 落在 1 號位＝
// 後排（`isBackRow` 判 1/5/6 號位）。多數測試假設「二傳有完整三檔」，故預設把 PID
// 搬到 2 號位（前排）；後排限定的行為由專門測試明確覆寫回 1 號位。
const FRONT_ROW_ROTATION = ['B_dummy1', PID, 'B_dummy3', 'B_dummy4', 'B_dummy5', 'B_dummy6'];
const BACK_ROW_ROTATION = [PID, 'B_dummy2', 'B_dummy3', 'B_dummy4', 'B_dummy5', 'B_dummy6'];

function baseSession({
  assistOn = true, claimId = PID, ball, rallyOver = {}, rotation = FRONT_ROW_ROTATION,
  passTier = 'perfect',
} = {}) {
  const game = createGame({ seed: 7 });
  game.phase = 'rally';
  Object.assign(game.rally, { possession: 'A', touches: 1, ...rallyOver });
  game.match.rotations.A = rotation;
  game.ball = {
    x: 1.0, y: 2.0, z: 3.2, vx: 0.3, vy: -3, vz: -2.1, px: 1.0, py: 2.0, pz: 3.2, ...ball,
  };
  const stage = fakeStage();
  const s = {
    game,
    aiState: { claimId, passTier },
    stage,
    config: { assistOn },
    localId: PID,
    assistFlight: -1,
    assistLanding: null,
    lastReadyFlight: -1,
    lastContactFlight: -1,
    lastWaitFlight: -1,
    earlyApproachKey: '',
    earlyTakeoffKey: '',
    decoyApproachKeys: new Map(),
    decoyTakeoffKeys: new Map(),
    lastWindupFlight: -1,
    lastApproachFlight: -1,
    lastSwingFlight: -1,
  };
  return { s, game, stage };
}

function heightOf(game) { return game.players[PID].height.current; }

// ★ 鑑別力陷阱（02 §6.1 條 6，同 contact-assist.test.mjs 檔頭說明）★ `predictContactPoint`
// 只在球「當前仍高於 handY、之後會下墜穿越它」時才回傳真正的相遇點；球高只要不小心
// 落在「已經低於 handY」的退化區，它就會直接退化成 `predictLanding`——這種夾具即使
// matchLoop 錯用回舊的落地圈也照樣是綠燈。三支測試一律把球高設在**高於該檔 handY**，
// 不是只求「高於門檻 floor」。

test('spike 檔：landingMarker 收到綠色與 predictContactPoint(ball, spikeHandY) 逐值相同的點', () => {
  const { s, game, stage } = baseSession();
  const player = game.players[PID];
  const spikeHandY = spikeReach(player, 1);
  game.ball.y = spikeHandY + 1.0; // 明確高於 spikeHandY 本身
  const expected = predictContactPoint({ ...game.ball }, spikeHandY);
  assert.notDeepEqual(expected, predictLanding({ ...game.ball }), '夾具本身要有鑑別力');

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  assert.ok(shows.length >= 1, '至少要顯示一次');
  assert.deepEqual(shows.at(-1).point, { x: expected.x, z: expected.z });
  assert.equal(colors.at(-1).hex, 0x5ee08a, 'spike 檔＝綠色');
});

test('set 檔：landingMarker 收到黃色與 predictContactPoint(ball, setHandY) 逐值相同的點', () => {
  const { s, game, stage } = baseSession();
  const player = game.players[PID];
  const setHandY = SET_HANDPOINT_H_RATIO * heightOf(game);
  const spikeHandY = spikeReach(player, 1);
  const spikeR = reachRadiusFor(REACH_ACTION.SPIKE, TUNING, heightOf(game));
  const spikeFloor = spikeHandY - spikeR;
  // 窗口＝(setHandY, spikeFloor)：高於 setHandY 本身（保鑑別力）、不越過 spike 門檻
  game.ball.y = (setHandY + spikeFloor) / 2;
  const expected = predictContactPoint({ ...game.ball }, setHandY);
  assert.notDeepEqual(expected, predictLanding({ ...game.ball }), '夾具本身要有鑑別力');

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  assert.deepEqual(shows.at(-1).point, { x: expected.x, z: expected.z });
  assert.equal(colors.at(-1).hex, 0xffd166, 'set 檔＝黃色');
});

test('receive 檔：landingMarker 收到橘色與 predictContactPoint(ball, receiveHandY) 逐值相同的點', () => {
  const { s, game, stage } = baseSession();
  const receiveHandY = RECEIVE_HANDPOINT_H_RATIO * heightOf(game);
  const setHandY = SET_HANDPOINT_H_RATIO * heightOf(game);
  const setR = reachRadiusFor(REACH_ACTION.SET, TUNING, heightOf(game));
  const setFloor = setHandY - setR;
  // 窗口＝(receiveHandY, setFloor)：高於 receiveHandY 本身（保鑑別力）、不越過 set 門檻
  game.ball.y = (receiveHandY + setFloor) / 2;
  const expected = predictContactPoint({ ...game.ball }, receiveHandY);
  assert.notDeepEqual(expected, predictLanding({ ...game.ball }), '夾具本身要有鑑別力');

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  assert.deepEqual(shows.at(-1).point, { x: expected.x, z: expected.z });
  assert.equal(colors.at(-1).hex, 0xff9f45, 'receive 檔＝橘色（不得挪用紅色出界警示）');
});

// ════════ 第三觸攻擊手（2026-08-11 擴充）════════
//
// PID='A1' 本來是二傳，這裡刻意沿用同一個受控者當「第三觸攻擊手」——證明本分支
// 沒有角色限制（2026-08-11 main 裁定），只要 `lastToucherId` 不是他自己（球是隊友
// 舉的），二傳一樣能被 claim 為第三觸攻擊手。

test('★第三觸★ spike 檔：landingMarker 收到綠色與 predictContactPoint(ball, spikeHandY) 逐值相同的點', () => {
  const { s, game, stage } = baseSession({
    rallyOver: { touches: 2, lastToucherId: 'A2_someone_else' },
  });
  const player = game.players[PID];
  const spikeHandY = spikeReach(player, 1);
  game.ball.y = spikeHandY + 1.0; // 明確高於 spikeHandY 本身
  const expected = predictContactPoint({ ...game.ball }, spikeHandY);
  assert.notDeepEqual(expected, predictLanding({ ...game.ball }), '夾具本身要有鑑別力');

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  assert.deepEqual(shows.at(-1).point, { x: expected.x, z: expected.z });
  assert.equal(colors.at(-1).hex, 0x5ee08a, '第三觸 spike 檔沿用同一組顏色＝綠色');
});

test('★第三觸★ receive 檔：landingMarker 收到橘色與 predictContactPoint(ball, receiveHandY) 逐值相同的點', () => {
  const { s, game, stage } = baseSession({
    rallyOver: { touches: 2, lastToucherId: 'A2_someone_else' },
  });
  const receiveHandY = RECEIVE_HANDPOINT_H_RATIO * heightOf(game);
  game.ball.y = receiveHandY + 0.3; // 明確高於 receiveHandY 本身、且不越過 spike 門檻
  const expected = predictContactPoint({ ...game.ball }, receiveHandY);
  assert.notDeepEqual(expected, predictLanding({ ...game.ball }), '夾具本身要有鑑別力');

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  assert.deepEqual(shows.at(-1).point, { x: expected.x, z: expected.z });
  assert.equal(colors.at(-1).hex, 0xff9f45, '第三觸 receive 檔＝橘色');
});

test('★第三觸★ 真閘門：自舉自扣（lastToucherId===受控者）⇒ 落回現行 predictLanding 落地圈', () => {
  const { s, game, stage } = baseSession({
    rallyOver: { touches: 2, lastToucherId: PID }, // 這球是自己剛舉的
  });
  const player = game.players[PID];
  const spikeHandY = spikeReach(player, 1);
  game.ball.y = spikeHandY + 1.0; // 球高明明落在 spike 範圍
  const expectedLanding = predictLanding({ ...game.ball });

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  assert.deepEqual(shows.at(-1).point, expectedLanding,
    '玩家手上沒有 attackZones() 給的攻擊區可點，不得顯示相遇點圈');
});

// ════════ null 通道：現行落點圈邏輯一字不動 ════════

// 2026-08-11 改夾具（不改斷言意圖）：原用 `touches: 2` 代表「非我方第二觸」，但擴充
// 第三觸攻擊手分支後 `touches===2` 本身變成合法窗口（`baseSession` 預設 claimId=PID
// 且 PID 就是本波唯一候選攻擊手，會合法觸發新分支）。這條測試守的理由「不在任何
// contactAssist 支援的窗口內就吃現行 predictLanding 落點圈」依然成立，只是不能再用
// touches===2 表達「窗外」——改用 touches===3（四擊上限，規則上沒有下一觸）維持原意圖。
test('null 通道（非我方任何觸球窗口）：改吃現行 predictLanding 落點圈，不受本批改動影響', () => {
  const { s, game, stage } = baseSession({ rallyOver: { touches: 3 } });
  const expectedLanding = predictLanding({ ...game.ball });
  const isOut = landedCourtTeam(expectedLanding.x, expectedLanding.z) === null;

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  // 舊邏輯把 predictLanding() 整包物件（含 ticks）原樣傳給 show()，不裁切——
  // 逐值比對整包，不只挑 x/z（挑欄位比對會蓋掉「傳錯物件形狀」這類接線錯誤）
  assert.deepEqual(shows.at(-1).point, expectedLanding);
  assert.equal(colors.at(-1).hex, isOut ? 0xff5b5b : 0x6ee7ff, '沿用舊有紅/青二色語意');
});

test('assistOn=false：不顯示任何圈（hide）', () => {
  const { s, stage } = baseSession({ assistOn: false });
  updateAssistAndPoses(s);
  assert.equal(stage.landingMarker.calls.at(-1).fn, 'hide');
});

test('claim 沒指到受控者：即使球高處於 spike 檔範圍，也不得顯示相遇點圈（落回舊邏輯）', () => {
  const { s, game, stage } = baseSession({ claimId: 'B1' }); // claim 指到別人
  const player = game.players[PID];
  const spikeHandY = spikeReach(player, 1);
  game.ball.y = spikeHandY; // 明明球很高、在 spike 範圍
  const expectedLanding = predictLanding({ ...game.ball });

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  // 沒有相遇點圈的證據：顯示的點是落地圈的點，不是 predictContactPoint(ball, spikeHandY)
  assert.deepEqual(shows.at(-1).point, expectedLanding);
});

test('★前後排★ 後排二傳：球再高也只顯示黃色 set 檔，不得出現承諾攻擊的綠色', () => {
  const { s, game, stage } = baseSession({ rotation: BACK_ROW_ROTATION });
  const player = game.players[PID];
  const spikeHandY = spikeReach(player, 1);
  game.ball.y = spikeHandY + 1.0; // 球高遠高於 spike 手點——前排這裡一定是綠色
  const setHandY = SET_HANDPOINT_H_RATIO * heightOf(game);
  const expected = predictContactPoint({ ...game.ball }, setHandY);

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  assert.equal(colors.at(-1).hex, 0xffd166,
    '後排二傳沒有🎯二次球鈕（setOptions.js:93 的 !isBackRow）——綠色會是騙他的畫面謊言');
  assert.deepEqual(shows.at(-1).point, { x: expected.x, z: expected.z });
});

test('★一傳品質★ 前排＋一傳 ok：球再高也只顯示黃色 set 檔（🎯鈕不存在，同前後排那條線）', () => {
  const { s, game, stage } = baseSession({ passTier: 'ok' });
  const player = game.players[PID];
  const spikeHandY = spikeReach(player, 1);
  game.ball.y = spikeHandY + 1.0; // perfect 的話這裡一定是綠色
  const setHandY = SET_HANDPOINT_H_RATIO * heightOf(game);
  const expected = predictContactPoint({ ...game.ball }, setHandY);

  updateAssistAndPoses(s);

  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  assert.equal(colors.at(-1).hex, 0xffd166,
    '一傳非 perfect 時🎯二次球鈕不存在（setOptions.js:93）——綠色一樣是畫面謊言');
  assert.deepEqual(shows.at(-1).point, { x: expected.x, z: expected.z });
});

test('★一傳品質★ 前排＋一傳 perfect：同一個球高仍是綠色 spike（防止改法變成恆回 set）', () => {
  const { s, game, stage } = baseSession({ passTier: 'perfect' });
  const player = game.players[PID];
  const spikeHandY = spikeReach(player, 1);
  game.ball.y = spikeHandY + 1.0;
  const expected = predictContactPoint({ ...game.ball }, spikeHandY);

  updateAssistAndPoses(s);

  const colors = stage.landingMarker.calls.filter((c) => c.fn === 'setColor');
  const shows = stage.landingMarker.calls.filter((c) => c.fn === 'show');
  assert.equal(colors.at(-1).hex, 0x5ee08a);
  assert.deepEqual(shows.at(-1).point, { x: expected.x, z: expected.z });
});
