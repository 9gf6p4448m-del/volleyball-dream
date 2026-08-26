// 職業章批 4b「改叫（案 B，拍板形狀 B2）」— 純函式/sim 層（2026-08-26）
// 驗收＝docs/kickoffs/acceptance-pro-batch4b.md（E1-E5，動手前凍結）。
// DOM 接線（E2 的真實 UI 行為）另見 tests/pro-batch4b-wiring.test.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';

import { TECH_DEFS, unlockTechnique } from '../src/career/growth.js';
import { EVENT_DEFS, dueEvents, isOnceEvent } from '../src/career/events.js';
import { createCareerPlayer } from '../src/career/careerState.js';
import { resolveTechGates } from '../src/app/matchConfig.js';
import { createGame, stepGame, TUNING, createDefaultTeams } from '../src/sim/game.js';
import { BALL } from '../src/sim/constants.js';
import {
  createAiState, aiCollectIntents, audibleStateOf, callFeasibilityOf,
} from '../src/sim/ai.js';
import { TRUST_DYN } from '../src/sim/trust.js';

// ════════════════════════════════════════════════════════════════
// E1：TECH_DEFS 新增「改叫」＋傳授事件走既有職業章事件慣例
// ════════════════════════════════════════════════════════════════
test('E1① TECH_DEFS 含 audible，有 name／desc', () => {
  const def = TECH_DEFS.find((t) => t.key === 'audible');
  assert.ok(def, 'audible 不在 TECH_DEFS 裡');
  assert.ok(typeof def.name === 'string' && def.name.length > 0);
  assert.ok(typeof def.desc === 'string' && def.desc.length > 0);
});

test('E1② unlockTechnique 可解鎖 audible；解鎖前 techniques.audible 為 0', () => {
  const p = createCareerPlayer('測試員', { seed: 1 });
  assert.equal(p.techniques.audible ?? 0, 0, '新建生涯：未解鎖');
  const unlocked = unlockTechnique(p, 'audible');
  assert.equal(unlocked.techniques.audible, 1);
});

test('E1③ teach-audible 事件存在、解鎖的就是 audible、用 proLeaguePlayed 判準', () => {
  const ev = EVENT_DEFS.find((e) => e.id === 'teach-audible');
  assert.ok(ev, 'teach-audible 事件不存在');
  assert.equal(ev.effect?.unlock, 'audible');
  assert.ok('proLeaguePlayed' in (ev.when ?? {}), '未用職業聯賽場次計數當判準');
  // ★反向★ 不得綁在高中/大學賽事 id 上（同 batch4a D1③ 的紅法）
  assert.equal(ev.when.lastMatchId, undefined);
  assert.equal(ev.when.stage, undefined);
  assert.ok(isOnceEvent('teach-audible'), '教過就不再教——一次性事件清單要包含它');
});

test('E1④ proLeaguePlayed：高中/大學章 schedule 沒有 round==="pro"，恆不觸發（結構性零回歸）', () => {
  const career = {
    schedule: [{ id: 'group-1', opponentId: 'x', round: 'rr' }],
    results: [{ matchId: 'group-1', won: true }],
    events: [],
  };
  const due = dueEvents(career, 'post', 1);
  assert.ok(!due.some((e) => e.id === 'teach-audible'), '高中章不得誤觸發職業章傳授事件');
});

function proSchedule(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, opponentId: 'x', round: 'pro' }));
}

test('E1⑤ proLeaguePlayed：職業聯賽打完門檻場數（7）才到期（棄賽不算「打完」，同批 4a 規則）', () => {
  const career = {
    schedule: proSchedule(7),
    results: [
      { matchId: 'p1', won: true }, { matchId: 'p2', won: true },
      { matchId: 'p3', won: true }, { matchId: 'p4', won: true },
      { matchId: 'p5', won: true }, { matchId: 'p6', won: true },
      { matchId: 'p7', won: true, forfeit: true }, // 棄賽不算打完
    ],
    events: [],
  };
  const due = dueEvents(career, 'post', 1);
  assert.ok(!due.some((e) => e.id === 'teach-audible'), '只打完 6 場（p7 棄賽）不該到期（門檻 7）');
});

test('E1⑥ proLeaguePlayed 達門檻（7）＋未觸發過 ⇒ teach-audible 到期', () => {
  const career = {
    schedule: proSchedule(7),
    results: [
      { matchId: 'p1', won: true }, { matchId: 'p2', won: false },
      { matchId: 'p3', won: true }, { matchId: 'p4', won: true },
      { matchId: 'p5', won: true }, { matchId: 'p6', won: false },
      { matchId: 'p7', won: true },
    ],
    events: [],
  };
  const due = dueEvents(career, 'post', 1);
  assert.ok(due.some((e) => e.id === 'teach-audible'), '打完 7 場應到期（門檻 7）');
});

// 選 7（同 teach-baitline）而不是原想的 4：實測 4 會撞上
// tests/pro-batch3-wiring.test.mjs 的「覆審H修」治具（前 6 場全勝＋第 7 場棄賽），
// 那份治具在第 4 場賽後就會多播出這則新對話、洗掉它原本要驗的準決賽畫面
// （見 events.js 該事件定義旁的說明）。7 已被 teach-baitline 證明能避開那個窗口
// （那份治具最多打到 6 場），改叫比照同一個安全值——兩招因此會同場一起到期。
test('E1 與批 4a：teach-audible 與 teach-baitline 同一門檻（7）——刻意不錯開，理由見 events.js 註解', () => {
  const baitline = EVENT_DEFS.find((e) => e.id === 'teach-baitline');
  const audible = EVENT_DEFS.find((e) => e.id === 'teach-audible');
  assert.ok(baitline && audible);
  assert.equal(audible.when.proLeaguePlayed, baitline.when.proLeaguePlayed);
});

test('E1 回歸守衛：pro-batch3-wiring 的「覆審H修」治具窗口（6 勝＋第 7 場棄賽）不得到期', () => {
  // 逐字複刻該測試的資料形狀（不 import 那支測試檔，避免耦合；只驗同一個窗口）
  const career = {
    schedule: proSchedule(7),
    results: [
      { matchId: 'p1', won: true }, { matchId: 'p2', won: true },
      { matchId: 'p3', won: true }, { matchId: 'p4', won: true },
      { matchId: 'p5', won: true }, { matchId: 'p6', won: true },
    ], // 第 7 場走 pendingMatch（棄賽裁決），不落 results
    events: ['first-loss'],
  };
  const due = dueEvents(career, 'post', 1);
  assert.ok(!due.some((e) => e.id === 'teach-audible'),
    '這個窗口（打完 6 場）不得到期——到期會洗掉 pro-batch3 覆審 H 修測試要驗的畫面');
});

// ════════════════════════════════════════════════════════════════
// E2①：閘門——canAudible 與既有 canCallPlay 各自獨立、不互相牽動
// ════════════════════════════════════════════════════════════════
function fakeGamePlayer(techniques) {
  return {
    players: { P1: { techniques, attributes: { reaction: 50 } } },
    comboScale: 1,
  };
}

test('E2① canAudible：職業章解鎖後 true，未解鎖 false；快速比賽（tech=null）恆 true', () => {
  const unlockedGate = resolveTechGates(fakeGamePlayer({ audible: 1 }), 'P1', true);
  assert.equal(unlockedGate.canAudible, true);
  const lockedGate = resolveTechGates(fakeGamePlayer({}), 'P1', true);
  assert.equal(lockedGate.canAudible, false);
  const quickMatchGate = resolveTechGates(fakeGamePlayer({}), 'P1', false);
  assert.equal(quickMatchGate.canAudible, true, '快速比賽（careerActive=false）恆開');
});

test('E2① canAudible 與 canCallPlay 各自獨立：解鎖其中一個不牽動另一個', () => {
  const onlyAudible = resolveTechGates(fakeGamePlayer({ audible: 1 }), 'P1', true);
  assert.equal(onlyAudible.canAudible, true);
  assert.equal(onlyAudible.canCallPlay, false, '只解鎖改叫，既有叫戰術閘不得被牽動');

  const onlyCallPlay = resolveTechGates(fakeGamePlayer({ callPlay: 1 }), 'P1', true);
  assert.equal(onlyCallPlay.canCallPlay, true);
  assert.equal(onlyCallPlay.canAudible, false, '只解鎖叫戰術，改叫閘不得被誤開');
});

test('E2① canAudible 同樣吃世界閘 comboScale：comboScale=0 時即使解鎖也關', () => {
  const g = {
    players: { P1: { techniques: { audible: 1 }, attributes: { reaction: 50 } } },
    comboScale: 0,
  };
  assert.equal(resolveTechGates(g, 'P1', true).canAudible, false);
});

// ════════════════════════════════════════════════════════════════
// E2②：audibleStateOf 窗界語意（不放寬既有窗；S 本人恆關；跨隊不得誤開）
// ════════════════════════════════════════════════════════════════
// 找到「我方第二觸窗開著」的第一個真實 tick（同 season-combo-gate 的 playAndCount
// 範式：整場真實生涯路徑跑，不手刻假窗界）。
function firstReplanWindow(seed) {
  const g = createGame({ seed, teams: createDefaultTeams(), comboScale: 1, setTarget: 25 });
  const ai = createAiState();
  let ticks = 0;
  while (g.phase !== 'set_over' && ticks < 300000) {
    const feas = callFeasibilityOf(g, ai);
    if (feas && Object.values(feas).some((v) => v.feasible)) {
      return { g, ai, feas };
    }
    stepGame(g, aiCollectIntents(g, ai));
    ticks += 1;
  }
  return null;
}

test('E2② audibleStateOf：S 本人恆關窗（不論是不是他這隊在窗裡）', () => {
  const found = firstReplanWindow(11);
  assert.ok(found, 'fixture 前提：整場跑不到一次可行的改判窗');
  const { g, ai } = found;
  // A1 依專案慣例＝S（roles-trust.test.mjs 同款前提）
  const st = audibleStateOf(g, ai, 'A1');
  assert.equal(st.open, false, 'S 本人不得走改叫入口（他有自己的既有面板）');
});

test('E2② audibleStateOf：正確隊伍的非 S 位置窗開，且回傳的 types ⊆ 這波真的湊得出來的', () => {
  const found = firstReplanWindow(11);
  assert.ok(found);
  const { g, ai, feas } = found;
  const team = ai.landingTeam;
  const nonSetterId = team === 'A' ? 'A2' : 'B2'; // OH，非 S
  const st = audibleStateOf(g, ai, nonSetterId);
  assert.equal(st.open, true, '正確隊伍的非 S 位置窗應該開');
  for (const t of st.types) assert.equal(feas[t]?.feasible, true, `${t} 不該被列出來`);
  assert.ok(st.types.length > 0);
});

test('E2② 跨隊誤觸發護欄：對面那隊的非 S 位置，即使他自己隊伍沒在窗裡也不得被誤判成開', () => {
  const found = firstReplanWindow(11);
  assert.ok(found);
  const { g, ai } = found;
  const oppTeam = ai.landingTeam === 'A' ? 'B' : 'A';
  const oppNonSetterId = oppTeam === 'A' ? 'A2' : 'B2';
  const st = audibleStateOf(g, ai, oppNonSetterId);
  assert.equal(st.open, false, '對面隊伍不在窗裡時，跨隊查詢不得回傳開窗');
});

test('E2③ applyReplanCall 重用既有通道：非 S 呼叫者成功指令後，attackerId／approach 真的改了', () => {
  const found = firstReplanWindow(13);
  assert.ok(found);
  const { g, ai } = found;
  const team = ai.landingTeam;
  const nonSetterId = team === 'A' ? 'A2' : 'B2';
  const st = audibleStateOf(g, ai, nonSetterId);
  assert.ok(st.open && st.types.length > 0, 'fixture 前提：這一刻改叫窗要開且有可叫的型');
  const type = st.types[0];
  ai.replanCall = { type, callerId: nonSetterId };
  stepGame(g, aiCollectIntents(g, ai));
  assert.ok(ai.callOutcome, '呼叫應該有結算（callOutcome 非空）');
  assert.equal(ai.callOutcome.outcome, 'command', '非 S 呼叫走的仍是既有指令通道，不是新語意');
  // E3 的記帳：非 S 呼叫成功 ⇒ audibleMainId 寫入；S 呼叫則不寫（下面 E3 區塊另驗）
  assert.equal(g.rally.audibleMainId, ai.callOutcome.mainId,
    '非 S 呼叫成功應記下 audibleMainId（settlePoint 讀，E3 用）');
});

test('E2③ S 本人呼叫（既有路徑）：audibleMainId 維持 null——S 位置行為逐值不變', () => {
  const found = firstReplanWindow(17);
  assert.ok(found);
  const { g, ai } = found;
  const setterId = ai.landingTeam === 'A' ? 'A1' : 'B1';
  const feas = callFeasibilityOf(g, ai);
  const type = Object.keys(feas).find((t) => feas[t]?.feasible);
  assert.ok(type, 'fixture 前提：至少一型可叫');
  ai.replanCall = { type, callerId: setterId };
  stepGame(g, aiCollectIntents(g, ai));
  assert.equal(g.rally.audibleMainId, null, 'S 呼叫不得寫 audibleMainId（那格只給非 S 入口用）');
});

// ════════════════════════════════════════════════════════════════
// E3：改叫那一波沒得分 ⇒ trust 扣加倍；得分 ⇒ 照既有動態，不另給獎勵
// ════════════════════════════════════════════════════════════════
// 直接狀態注入（同 tests/roles-trust.test.mjs 的 rig 範式）：只驗 settlePoint 這一段
// 的乘子邏輯，不必先跑通整條 applyReplanCall 管線。
function spikeSettleRig({ audibleMainId, outOfBounds, seed = 1, callPid = null }) {
  const g = createGame({ seed, teams: createDefaultTeams(), setTarget: 25 });
  g.phase = 'rally';
  const r = g.rally;
  r.profile = 'spike';
  r.possession = 'A';
  r.touches = 3;
  r.lastTouchTeam = 'A';
  r.lastToucherId = 'A2';
  r.audibleMainId = audibleMainId;
  if (callPid) r.callPid = callPid;
  const b = g.ball;
  if (outOfBounds) {
    b.x = 100; b.z = 0; b.y = BALL.RADIUS + 0.05; b.vx = 0; b.vy = -5; b.vz = 0; // 界外
  } else {
    b.x = 0; b.z = -3; b.y = BALL.RADIUS + 0.05; b.vx = 0; b.vy = -5; b.vz = 0; // 落在 B 半場界內
  }
  b.px = b.x; b.py = b.y; b.pz = b.z;
  const evs = stepGame(g, []);
  return { g, evs };
}

test('E3① 未改叫（audibleMainId=null）：失誤扣幅照既有值，不受影響', () => {
  const { g } = spikeSettleRig({ audibleMainId: null, outOfBounds: true, seed: 21 });
  assert.equal(g.trustDyn.A2, TRUST_DYN.ERR);
});

test('E3② 改叫指定的攻擊手＝這波真正失誤的人 ⇒ 扣幅加倍', () => {
  const { g } = spikeSettleRig({ audibleMainId: 'A2', outOfBounds: true, seed: 21 });
  assert.equal(g.trustDyn.A2, TRUST_DYN.ERR * TUNING.AUDIBLE_FAIL_MUL,
    '改叫那一波沒得分，trust 扣幅應該加倍');
  assert.ok(TUNING.AUDIBLE_FAIL_MUL > 1, '倍數必須真的放大，不是聊備一格');
});

test('E3③ 改叫指定的人得分了 ⇒ 照既有動態，不另給獎勵（不乘進 KILL 分支）', () => {
  const { g } = spikeSettleRig({ audibleMainId: 'A2', outOfBounds: false, seed: 21 });
  assert.equal(g.trustDyn.A2, TRUST_DYN.KILL,
    '得分不得因為是改叫而多拿獎勵——地位是掙來的，不是按鈕給的');
});

test('E3④ audibleMainId 與這波實際失誤者不同（殘留自更早一次交手）：不加倍', () => {
  const { g } = spikeSettleRig({ audibleMainId: 'A9', outOfBounds: true, seed: 21 });
  assert.equal(g.trustDyn.A2, TRUST_DYN.ERR, 'mainId 對不上才不加倍——同 callPid 的比對範式');
});

// ════════════════════════════════════════════════════════════════
// E4：sim 改動未使用時逐值無效果
// ════════════════════════════════════════════════════════════════
test('E4① rally 初始態：audibleMainId 出廠即為 null', () => {
  const g = createGame({ seed: 1 });
  assert.equal(g.rally.audibleMainId, null);
});

test('E4② AI vs AI（不寫 replanCall）：整局跑完 audibleMainId 恆為 null，trustDyn 不受 AUDIBLE_FAIL_MUL 污染', () => {
  const g = createGame({ seed: 501, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  let ticks = 0;
  let sawNonNull = false;
  while (g.phase !== 'set_over' && ticks < 300000) {
    stepGame(g, aiCollectIntents(g, ai));
    if (g.rally.audibleMainId != null) sawNonNull = true;
    ticks += 1;
  }
  assert.equal(sawNonNull, false, 'AI 對局全程沒有人走改叫入口，audibleMainId 不該被寫入過');
});

// ════════════════════════════════════════════════════════════════
// 覆審 MEDIUM 修：「⚡跟上！」＋「改叫」同波命中同一失誤者＝取重不疊乘
// 改前紅：mul = callMul * audibleFailMul ⇒ 4 倍扣（兩個獨立賭注的意外交互）
// ════════════════════════════════════════════════════════════════
test('覆審M修 同波要球＋改叫都命中失誤者：扣幅取重（max），不得疊乘成 4 倍', () => {
  const { g } = spikeSettleRig({ audibleMainId: 'A2', callPid: 'A2', outOfBounds: true, seed: 21 });
  const expected = TRUST_DYN.ERR * Math.max(TUNING.CALL_TRUST_MUL, TUNING.AUDIBLE_FAIL_MUL);
  assert.equal(g.trustDyn.A2, expected,
    '兩注語意都是「這波我扛」——扛一次就好，取重不疊乘');
  assert.ok(g.trustDyn.A2 > TRUST_DYN.ERR * TUNING.CALL_TRUST_MUL * TUNING.AUDIBLE_FAIL_MUL
    || TUNING.CALL_TRUST_MUL * TUNING.AUDIBLE_FAIL_MUL
       > Math.max(TUNING.CALL_TRUST_MUL, TUNING.AUDIBLE_FAIL_MUL),
    '前提：疊乘值確實大於取重值（否則本測無鑑別力）');
});
