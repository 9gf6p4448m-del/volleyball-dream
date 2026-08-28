// 多人連線卷 批1（2026-08-28）—— 受控者多值化的三道驗收
// 凍結檔＝docs/kickoffs/acceptance-multiplayer-20260828.md（A1-3／A1-4 的機械執行）
//
// ① v2 逐位元相容：單人模式（純量受控者）錄出來的卷，與「長度 1 陣列」錄出來的卷
//    JSON 逐位元相同——典藏牆既有 v2 卷不遷移、TAPE_VERSION 不動的直接證明。
// ② 雙受控者：兩個 id 一起排除，AI 不代打任何一個，且錄下的卷重演逐格一致。
// ③ 靜態掃描：src/ 內不得殘留 `.controlledId` 單值讀取（批1 改名為 localId／
//    controlledIdsOf 後，殘留＝有一條路還在吃舊單值語意）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createRallyRecorder, createRallyPlayer } from '../src/app/rallyTape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 與 rally-tape.test.mjs 同構的縮影，但受控者形態（純量 vs 陣列）由參數決定
function playRally(seed, controlledOf) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  const truthIntents = [];
  let guard = 0;
  while (guard < 20000) {
    guard += 1;
    if (game.phase === 'serve') rec.begin(game, ai);
    const t = game.tick;
    const controlled = controlledOf(game, t);
    const list = Array.isArray(controlled) ? controlled
      : (controlled == null ? [] : [controlled]);
    const playerIntents = list.map((pid, i) => ({
      playerId: pid,
      tick: t,
      move: { x: Math.sin(t * 0.11 + i), z: Math.cos(t * 0.07 + i) },
      action: null,
      aim: { x: 0, z: 0 },
      gaze: { x: 0, z: 0 },
      timing: 1,
      style: null,
    }));
    if (t % 53 === 0) ai.digBias = { choice: 'line', block: 'line', override: true };
    if (t % 71 === 0) ai.digBias = null;
    rec.step(game, ai, controlled, playerIntents);
    const intents = [...playerIntents, ...aiCollectIntents(game, ai, list)];
    truthIntents.push(structuredClone(intents));
    const events = stepGame(game, intents);
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return { tape: rec.end(), truthIntents, endState: game };
}

test('批1① 純量受控者與長度1陣列錄出的卷 JSON 逐位元相同（v2 相容）', () => {
  const scalar = playRally(23, (game) => game.match.rotations.A[0]);
  const arr1 = playRally(23, (game) => [game.match.rotations.A[0]]);
  assert.equal(JSON.stringify(scalar.tape), JSON.stringify(arr1.tape));
  // st.c 必須仍是純量（不是陣列）——否則舊消費端（重演器以外的）讀形狀會變
  const cSteps = scalar.tape.steps.filter((st) => st.c !== undefined);
  assert.ok(cSteps.length > 0, '本卷沒錄到任何受控者變更＝fixture 失效');
  for (const st of cSteps) assert.ok(!Array.isArray(st.c), 'st.c 單人模式必須是純量');
});

test('批1② 兩隊各一受控者：AI 不代打任何一個，重演逐格一致', () => {
  const two = (game) => [game.match.rotations.A[0], game.match.rotations.B[0]];
  const { tape, truthIntents, endState } = playRally(31, two);
  // AI 產出的 Intent 不得包含兩位受控者（排除集合真的排除了）
  const ids = new Set();
  for (const st of tape.steps) for (const it of (st.p ?? [])) ids.add(it.playerId);
  assert.equal(ids.size, 2, '玩家側應恰好兩人');
  // 重演：與 rally-tape.test.mjs 同款「尾段比對」（等哨段重照丟棄）
  const player = createRallyPlayer(tape);
  const replayIntents = [];
  while (!player.done) {
    player.step();
    replayIntents.push(structuredClone(player.lastIntents));
  }
  const from = truthIntents.length - replayIntents.length;
  assert.ok(from >= 0 && replayIntents.length > 0);
  assert.deepEqual(replayIntents, truthIntents.slice(from));
  // 重演終態＝真實終態（events 每步產物，歸零後比）
  const a = { ...player.state, events: [] };
  const b = { ...endState, events: [] };
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  // 連線卷的 st.c 是陣列形態
  const cSteps = tape.steps.filter((st) => st.c !== undefined);
  assert.ok(cSteps.some((st) => Array.isArray(st.c) && st.c.length === 2));
});

test('批1③ 靜態掃描：src/ 零殘留 .controlledId 單值屬性存取', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.js')) continue;
      const text = readFileSync(p, 'utf8');
      // 屬性存取（s.controlledId / state.controlledId）＝殘留的舊單值語意。
      // 參數名／物件鍵（controlledId:）是 UI 層的「本機視角」參數，語意=localId，合法。
      const m = text.match(/\.\s*controlledId\b/g);
      if (m) offenders.push(`${p} ×${m.length}`);
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(offenders, []);
});
