// Phase 4.6 §2-1／§9-2 — 重演契約：快照＋玩家 Intent 流＋AI 重算＝逐格一致。
// 錄製格式 v2 的存在理由是容量（§3-0 探針：舊格式單筆 1.1MB），但**不得拿決定論換容量**
// ——本檔就是那份背書：同一卷連跑兩次、以及重演 vs 當初真實那顆球，逐值一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createRallyRecorder, createRallyPlayer, isPlayableTape, TAPE_VERSION } from '../src/app/rallyTape.js';

// matchLoop.stepSim 的忠實縮影：玩家側 Intent 腳本產生（決定論）、
// 玩家對 aiState 的指令（L 封線／S 分配）在固定 tick 注入、受控者中途換人。
function playOneRally(seed) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  const truth = { intents: [], events: [] };
  let controlled = game.match.rotations.A[0];
  let guard = 0;
  while (guard < 20000) {
    guard += 1;
    if (game.phase === 'serve') rec.begin(game, ai);
    // 玩家側 Intent（模擬 controls.collect：受控者每 tick 一份走位）
    const t = game.tick;
    const playerIntents = [{
      playerId: controlled,
      tick: t,
      move: { x: Math.sin(t * 0.11), z: Math.cos(t * 0.07) },
      action: null,
      aim: { x: 0, z: 0 },
      gaze: { x: 0, z: 0 },
      timing: 1,
      style: null,
    }];
    // 玩家透過協調層下的指令（不走 Intent 管線——不錄就重演不出來）
    if (t % 53 === 0) ai.digBias = { choice: 'line', block: 'line', override: true };
    if (t % 71 === 0) ai.digBias = null;
    if (t % 89 === 0) { ai.attackerId = game.match.rotations.A[2]; ai.attackKind = 'quick'; }
    // 受控者換人（全隊輪控）
    if (t % 37 === 0) controlled = game.match.rotations.A[(t / 37) % 6 | 0];

    rec.step(game, ai, controlled, playerIntents);
    const intents = [...playerIntents, ...aiCollectIntents(game, ai, [controlled])];
    truth.intents.push(structuredClone(intents));
    const events = stepGame(game, intents);
    truth.events.push(structuredClone(events));
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return { tape: rec.end(), truth, endState: game };
}

function replayAll(tape) {
  const player = createRallyPlayer(tape);
  const intents = [];
  const events = [];
  while (!player.done) {
    const ev = player.step();
    intents.push(structuredClone(player.lastIntents));
    events.push(structuredClone(ev));
  }
  return { intents, events, state: player.state };
}

test('v2 卷可播、格式帶版本，且只錄玩家 Intent（AI 那十一份不落檔）', () => {
  const { tape } = playOneRally(11);
  assert.equal(tape.v, TAPE_VERSION);
  assert.ok(isPlayableTape(tape));
  assert.ok(tape.ai, '缺 aiState 快照＝AI 無法重算');
  // 每步玩家 Intent 至多 1 份（受控者）——十二人全錄的舊格式已退場
  for (const st of tape.steps) assert.ok((st.p?.length ?? 0) <= 1);
});

test('重演 vs 當初真實那顆球：Intent 流與事件流逐值一致', () => {
  const { tape, truth, endState } = playOneRally(11);
  const run = replayAll(tape);
  // 卷從「發球前最後一秒」起算（更早的等哨段逐秒重照丟棄），故比對真實流的尾段
  const from = truth.intents.length - run.intents.length;
  assert.ok(from >= 0 && run.intents.length > 0);
  assert.deepEqual(run.intents, truth.intents.slice(from));
  assert.deepEqual(run.events, truth.events.slice(from));
  // 終態逐值一致（events 是每步產物，比對前歸零）
  assert.deepEqual({ ...run.state, events: [] }, { ...endState, events: [] });
});

test('同一卷連跑兩次＝逐格一致（重演可反覆觀看）', () => {
  const { tape } = playOneRally(23);
  const a = replayAll(tape);
  const b = replayAll(tape);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual({ ...a.state, events: [] }, { ...b.state, events: [] });
});

test('重演零 sim 寫入：原始 game 不被重演器碰到', () => {
  const { tape, endState } = playOneRally(5);
  const before = JSON.stringify({ ...endState, events: [] });
  replayAll(tape);
  assert.equal(JSON.stringify({ ...endState, events: [] }), before);
});

test('舊格式卷（情蒐帶：十二人全錄）仍可播——重演器同時吃兩種來源', () => {
  const game = createGame({ seed: 3, setTarget: 25 });
  const ai = createAiState();
  const clip = { snapshot: null, steps: [] };
  const events = [];
  let guard = 0;
  while (guard < 20000) {
    guard += 1;
    if (game.phase === 'serve' && clip.snapshot === null) {
      clip.snapshot = structuredClone({ ...game, events: [] });
    }
    const intents = aiCollectIntents(game, ai);
    if (clip.snapshot) clip.steps.push({ intents: structuredClone(intents) });
    const ev = stepGame(game, intents);
    if (clip.snapshot) events.push(structuredClone(ev));
    if (ev.some((e) => e.type === 'DEAD_BALL')) break;
  }
  const run = replayAll(clip);
  assert.deepEqual(run.events, events);
});

test('容量：v2 單筆遠小於舊格式（§3-0 裁定的機械化守門）', () => {
  const { tape, truth } = playOneRally(11);
  const v2 = JSON.stringify(tape).length;
  const old = JSON.stringify({ snapshot: tape.snapshot, steps: truth.intents.map((i) => ({ intents: i })) }).length;
  assert.ok(v2 * 4 < old, `v2=${v2} 應顯著小於舊格式 ${old}`);
  // 單筆 200KB 是四槽（×4）＋三存檔槽（×3）仍安全的上限——超出即回頭看 §3-0
  assert.ok(v2 < 200 * 1024, `單筆 ${Math.round(v2 / 1024)}KB 超出典藏牆容量預算`);
});

test('發球前的等哨時間不無限膨脹（實跑抓到：玩家在發球面板前發呆＝卷長成 MB 級）', () => {
  const game = createGame({ seed: 7, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  // 模擬「發球相位卡住 30 秒」：只餵 begin/step，不讓球發出去
  for (let i = 0; i < 1800; i += 1) {
    rec.begin(game, ai);
    rec.step(game, ai, 'A1', [{ playerId: 'A1', tick: i, move: { x: 0, z: 0 }, action: null, aim: { x: 0, z: 0 }, gaze: { x: 0, z: 0 }, timing: 1, style: null }]);
  }
  const tape = rec.end();
  assert.ok(tape.steps.length <= 60, `等哨段應被逐秒重照丟棄，實際 ${tape.steps.length} 步`);
  assert.ok(isPlayableTape(tape));
});
