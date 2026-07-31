// Phase 5 W1 §12-12 — VCR v2 相容驗證：協調層新狀態 aiState.approach（Transition
// 拉開助跑，src/sim/approach.js／src/sim/ai.js:211）若未進錄影就重演不出來，本檔補這條。
//
// 背景：v2 只錄玩家 Intent，AI 那十一份重演時重算（rallyTape.js）。4.6 咬過的坑＝
// 「看起來會重算、其實不會」的欄位（digBias/attackerId/attackKind/counterRead 是玩家
// 透過協調層下的指令，走的不是 Intent 管線）——這些已進 PLAYER_AI_FIELDS 白名單。
// approach 沒有列進去；本檔用測試（不是推理）證明這個決定站不站得住腳。
//
// ★ 組合攻擊卷 段 B（2026-07-31）追加：aiState.attackCombo ★
// 藍圖 §六 的 VCR 條款給了兩條路：「AI 產出的 combo＝重算即可；玩家指定的必須進
// PLAYER_AI_FIELDS」。段 B 只做 AI 產出的組合（玩家叫戰術屬 §六.4 回饋層，未做），
// 而 combo 的每一個輸入都是重演端本來就會重建的可觀察量——
//   points（attackPointsOf → applyRouteKinds，吃 game 狀態＋flightId＋seed）
//   ＋ attackerId（pickAttackPoint，同樣重算）＋ flightId ＋ seed。
// ⇒ **走重算這條，不進白名單**。本檔把 attackCombo 也納入逐 tick 比對來證明它成立
//    （附突變測試：故意讓重演端的 combo 不重建，比對必須轉紅）。
//
// 範式沿用 tests/rally-tape.test.mjs（playOneRally／replayAll 的錄製-重演-逐值比對
// 三段式），但不修改該檔——helper 在本檔內自成一份，理由見下方 replayWithApproachTrace
// 的註解（createRallyPlayer 的公開介面不回傳內部 aiState，白箱比對只能手刻同一份重演
// 演算法）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createRallyRecorder, createRallyPlayer, TAPE_VERSION } from '../src/app/rallyTape.js';

// 全 AI（零玩家覆寫）：tests/approach.test.mjs 的 runSet() 已證明這樣跑一整局
// 就會自然打出 routes.length>=2 的 Transition 拉開（quick/wing/back 三檔分得開）。
// 本檔只跑一顆球（到 DEAD_BALL），不需要整局。
function playOneRallyAllAi(seed) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  const truth = {
    intents: [], events: [], approach: [], combo: [], pos: [],
  };
  let guard = 0;
  while (guard < 20000) {
    guard += 1;
    if (game.phase === 'serve') rec.begin(game, ai);
    rec.step(game, ai, null, []);
    const intents = aiCollectIntents(game, ai, []);
    // 這顆球本身「有沒有走到 touches===1 之後的 Transition 分支」的前置條件證據
    truth.approach.push(structuredClone(ai.approach));
    truth.combo.push(structuredClone(ai.attackCombo ?? null));
    truth.intents.push(structuredClone(intents));
    const events = stepGame(game, intents);
    truth.pos.push(snapshotPositions(game));
    truth.events.push(structuredClone(events));
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return { tape: rec.end(), truth, endState: game };
}

// ①球的軌跡 ②各球員座標——逐 tick 快照，不只比對局末終態
function snapshotPositions(game) {
  const players = {};
  for (const pid of Object.keys(game.actors)) {
    players[pid] = { x: game.actors[pid].x, z: game.actors[pid].z };
  }
  return { ball: { x: game.ball.x, y: game.ball.y, z: game.ball.z }, players };
}

// 白箱重演器：與 rallyTape.js createRallyPlayer.step() 同一套演算法（patch → collect →
// stepGame），差別只在於它把每步的 aiState.approach 吐出來——createRallyPlayer 的公開
// 介面沒有這個 getter（本輪硬性限制不得改 src/app/rallyTape.js，故不加）。
// breakApproach=true＝突變測試專用：每步算完後把 aiState.approach 打成 null，
// 模擬「協調層狀態沒被正確重建」的情境，證明下面的比對真的抓得到。
// dropCalledPlay=true＝**段 E 的鑑別力對照臂**：模擬「PLAYER_AI_FIELDS 沒有把
// calledPlay／replanCall 列進去」的那個版本（＝本段修改之前的 rallyTape.js），
// 證明白名單那兩個欄位真的在承重，不是「反正重算也會一樣」。
function replayWithApproachTrace(tape, {
  breakApproach = false, breakCombo = false, dropCalledPlay = false,
} = {}) {
  assert.equal(tape.v, TAPE_VERSION);
  const state = structuredClone(tape.snapshot);
  const aiState = structuredClone(tape.ai);
  if (dropCalledPlay) { aiState.calledPlay = null; aiState.replanCall = null; }
  let controlled = null;
  const intents = [];
  const events = [];
  const approach = [];
  const combo = [];
  const pos = [];
  for (const st of tape.steps) {
    if (st.a) {
      const patch = structuredClone(st.a);
      if (dropCalledPlay) { delete patch.calledPlay; delete patch.replanCall; }
      Object.assign(aiState, patch);
    }
    if (st.c !== undefined) controlled = st.c;
    const stepIntents = [
      ...(st.p ?? []),
      ...aiCollectIntents(state, aiState, controlled ? [controlled] : []),
    ];
    if (breakApproach) aiState.approach = null;
    if (breakCombo) aiState.attackCombo = null;
    approach.push(structuredClone(aiState.approach));
    combo.push(structuredClone(aiState.attackCombo ?? null));
    intents.push(structuredClone(stepIntents));
    events.push(structuredClone(stepGame(state, stepIntents)));
    pos.push(snapshotPositions(state));
  }
  return {
    intents, events, approach, combo, pos, state,
  };
}

test('前置條件：這顆球真的打出多人拉開的 Transition（routes.length>=2）', () => {
  const { truth } = playOneRallyAllAi(11);
  const hits = truth.approach.filter((a) => a && a.routes.length >= 2).length;
  assert.ok(hits > 50, `樣本不足以證明測到 Transition 分支（實際 ${hits} tick）`);
});

test('VCR 重演相容：aiState.approach（助跑 route 分配）逐值一致，涵蓋球軌跡＋球員座標', () => {
  const { tape, truth, endState } = playOneRallyAllAi(11);

  // 官方重演器（公開介面）：Intent 流／事件流／終態——與既有 rally-tape.test.mjs
  // 同一套契約，這裡重跑一次是因為新錄的卷內容不同（本檔的全 AI 腳本 vs 該檔的
  // 玩家腳本混錄），不是重複造輪子。
  const player = createRallyPlayer(tape);
  const officialIntents = [];
  const officialEvents = [];
  while (!player.done) {
    const ev = player.step();
    officialIntents.push(structuredClone(player.lastIntents));
    officialEvents.push(structuredClone(ev));
  }
  const from = truth.intents.length - tape.steps.length;
  assert.ok(from >= 0 && officialIntents.length > 0);
  assert.deepEqual(officialIntents, truth.intents.slice(from));
  assert.deepEqual(officialEvents, truth.events.slice(from));
  assert.deepEqual({ ...player.state, events: [] }, { ...endState, events: [] });

  // 白箱重演：先驗證它與官方重演器算出同一份 intents/events（證明手刻的重演
  // 迴圈忠實複刻 createRallyPlayer 的演算法，不是另一套邏輯在自證自己對）
  const run = replayWithApproachTrace(tape);
  assert.deepEqual(run.intents, officialIntents, '白箱重演器須與官方重演器算出同一份 intents');
  assert.deepEqual(run.events, officialEvents, '白箱重演器須與官方重演器算出同一份 events');

  // ③ aiState.approach.routes 的分配結果——逐 tick 直接比對（不是靠下游 Intent 反推）
  assert.deepEqual(run.approach, truth.approach.slice(from));
  // ③' 組合攻擊卷 段 B：aiState.attackCombo 同樣逐 tick 比對（走重算、不進白名單）
  assert.deepEqual(run.combo, truth.combo.slice(from));
  // ①②球的軌跡與各球員座標——逐 tick 快照直接比對
  assert.deepEqual(run.pos, truth.pos.slice(from));
});

test('前置條件：這顆球真的有組合攻擊可以驗（attackCombo 非全 null）', () => {
  // 沒有這條的話，下面 combo 的逐值比對是「null === null」＝空洞成立
  let seen = 0;
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const { truth } = playOneRallyAllAi(seed);
    seen += truth.combo.filter(Boolean).length;
  }
  assert.ok(seen > 0, 'VCR 語料裡一次組合都沒出現＝combo 的逐值比對空洞成立');
});

test('突變測試：重演時 aiState.attackCombo 沒被正確重建，比對必須轉紅', () => {
  // 找一顆真的有組合的球——沒有的話這條突變測試自己就空洞成立
  let picked = null;
  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
    const r = playOneRallyAllAi(seed);
    const from = r.truth.combo.length - r.tape.steps.length;
    if (r.truth.combo.slice(from).some(Boolean)) { picked = { ...r, from }; break; }
  }
  assert.ok(picked, '找不到含組合的一球——本條突變測試沒有標的');
  const broken = replayWithApproachTrace(picked.tape, { breakCombo: true });
  assert.throws(
    () => assert.deepEqual(broken.combo, picked.truth.combo.slice(picked.from)),
    assert.AssertionError,
    '刻意打壞 aiState.attackCombo 後，逐值比對應該要失敗——沒失敗代表這條測試沒有牙齒',
  );
});

// ════════════════════════════════════════════════════════════
// 組合攻擊卷 段 E（2026-07-31）：**玩家指定的組合**的 VCR 契約
// ════════════════════════════════════════════════════════════
//
// 護欄 2 把兩條路分得很清楚：AI 產出的 combo 走「重算」（上面幾條測試已背書），
// 玩家指定的**不可由重算還原** ⇒ 必須進 PLAYER_AI_FIELDS。
// 本段錄一顆「玩家在死球窗叫了套路」的球，並用對照臂證明白名單在承重：
// 把 calledPlay／replanCall 從卷帶的 patch 裡拿掉（＝修改前的 rallyTape.js），
// combo 逐值比對必須轉紅。綠燈本身沒有證明力，會變紅的那個對照臂才有。
function playOneRallyWithCall(seed, type = 'cross') {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  const setterA = game.match.rotations.A.find((id) => game.players[id].currentRole === 'setter');
  const truth = {
    intents: [], events: [], approach: [], combo: [], pos: [], outcomes: [],
  };
  let guard = 0;
  let injected = false;
  while (guard < 20000) {
    guard += 1;
    if (game.phase === 'serve') {
      rec.begin(game, ai);
      // 玩家在死球窗按下面板（S＝指令，無 trust 骰 ⇒ 對照臂的差異純粹來自「有沒有錄」）
      if (!injected) { ai.calledPlay = { type, callerId: setterA, isSetter: true }; injected = true; }
    }
    rec.step(game, ai, null, []);
    const intents = aiCollectIntents(game, ai, []);
    truth.approach.push(structuredClone(ai.approach));
    truth.combo.push(structuredClone(ai.attackCombo ?? null));
    truth.outcomes.push(structuredClone(ai.callOutcome ?? null));
    truth.intents.push(structuredClone(intents));
    const events = stepGame(game, intents);
    truth.pos.push(snapshotPositions(game));
    truth.events.push(structuredClone(events));
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return { tape: rec.end(), truth, endState: game };
}

// 找一顆「玩家的叫牌真的生效」的球——找不到的話下面兩條測試都會空洞成立
function pickCalledRally() {
  for (let seed = 11; seed <= 60; seed += 1) {
    const r = playOneRallyWithCall(seed);
    const from = r.truth.combo.length - r.tape.steps.length;
    if (from < 0) continue;
    const ok = r.truth.outcomes.slice(from).some((o) => o?.outcome === 'command');
    if (ok && r.truth.combo.slice(from).some(Boolean)) return { ...r, from, seed };
  }
  return null;
}

test('段 E 前置：真的錄得到一顆「玩家叫牌生效」的球（否則下面兩條空洞成立）', () => {
  const picked = pickCalledRally();
  assert.ok(picked, '50 個 seed 都錄不到玩家叫牌生效的球');
  assert.ok(picked.tape.steps.some((st) => st.a && 'calledPlay' in st.a),
    'calledPlay 沒有出現在卷帶的任何一步＝根本沒被錄下來');
});

test('⑧ VCR：玩家指定的組合可逐值重演（approach／combo／座標全等）', () => {
  const picked = pickCalledRally();
  assert.ok(picked);
  const run = replayWithApproachTrace(picked.tape);
  assert.deepEqual(run.combo, picked.truth.combo.slice(picked.from),
    '玩家指定的組合重演不出來');
  assert.deepEqual(run.approach, picked.truth.approach.slice(picked.from));
  assert.deepEqual(run.pos, picked.truth.pos.slice(picked.from));
});

test('⑧ 鑑別力：把 calledPlay 移出白名單（＝修改前的版本），重演必須轉紅', () => {
  const picked = pickCalledRally();
  assert.ok(picked);
  const broken = replayWithApproachTrace(picked.tape, { dropCalledPlay: true });
  assert.throws(
    () => assert.deepEqual(broken.combo, picked.truth.combo.slice(picked.from)),
    assert.AssertionError,
    'calledPlay 不錄也重演得出來＝它根本不需要進白名單，或這條測試沒有牙齒',
  );
});

test('突變測試：重演時 aiState.approach 沒被正確重建，比對必須轉紅', () => {
  const { tape, truth } = playOneRallyAllAi(11);
  const from = truth.approach.length - tape.steps.length;
  const broken = replayWithApproachTrace(tape, { breakApproach: true });
  assert.throws(
    () => assert.deepEqual(broken.approach, truth.approach.slice(from)),
    assert.AssertionError,
    '刻意打壞 aiState.approach 後，逐值比對應該要失敗——沒失敗代表這條測試沒有牙齒',
  );
});
