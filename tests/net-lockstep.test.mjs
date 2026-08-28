// 多人連線卷 批2 —— 鎖步核心驗收（A2-1～A2-4 的機械執行）
// 凍結檔＝docs/kickoffs/acceptance-multiplayer-20260828.md
//
// A2-1 同 seed 兩實例、假傳輸交換、≥3000 tick 後兩端逐值相同
// A2-2 鑑別力：故意讓一端漏套一筆遠端 patch ⇒ A2-1 的斷言必須變紅（寫成斷言「不同」）
// A2-3 旁路衝突不變量：9 欄位所有權分析＋同 tick 同欄位衝突時合併決定論
// A2-4 delay ∈ {0,3,6} 三種設定下 A2-1 皆成立
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/sim/game.js';
import { serverId } from '../src/sim/match.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createLockstep, applyPatches } from '../src/net/lockstep.js';
import { PLAYER_AI_FIELDS } from '../src/app/rallyTape.js';

// ---- 假傳輸：決定性延遲（無 Math.random——lag 由送出序號決定）----
function createFakeChannel() {
  const queues = { A: [], B: [] }; // 目的地 → 待投遞
  let seq = 0;
  return {
    send(toSlot, msg, mutate = null) {
      seq += 1;
      const lag = 1 + ((seq * 7) % 5); // 1..5 步的決定性抖動
      queues[toSlot].push({ at: seq + lag, msg: mutate ? mutate(msg) : msg });
    },
    // 交付所有已到期訊息（transport 保序：按送出序）
    deliver(toSlot, now, sink) {
      const q = queues[toSlot];
      while (q.length && q[0].at <= now) sink(q.shift().msg);
    },
    get pending() { return queues.A.length + queues.B.length; },
  };
}

// ---- 一端：game＋aiState＋lockstep，逐 tick 與 matchLoop 同構的推進 ----
function createEnd(slot, seed, delay) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const ls = createLockstep({ delay, localSlot: slot });
  return { slot, game, ai, ls, sampledTick: -1 };
}

// 腳本輸入：純函式（game.tick＋slot 決定）＝兩端可獨立重現
function scriptedInput(end, ctrl) {
  const t = end.game.tick;
  const me = ctrl[end.slot];
  // ★ 輪到受控者發球就發（延遲 30 tick 模擬人手）★——不發的話整場卡死在 serve
  // 相位，rally 永遠不開始：A2-1 會變成「兩台一起卡死所以逐值相同」的假綠、
  // digBias 永遠不被消費、A2-2 永遠測不到分岔（本檔第一版就是這樣壞的）。
  const myServe = end.game.phase === 'serve' && serverId(end.game.match) === me;
  const intents = [{
    playerId: me,
    move: myServe ? { x: 0, z: 0 } : { x: Math.sin(t * 0.11 + (end.slot === 'A' ? 0 : 2)), z: Math.cos(t * 0.07) },
    action: myServe && t % 30 === 29 ? 'serve' : null,
    aim: { x: 0.5, z: end.slot === 'A' ? 6 : -6 }, gaze: { x: 0, z: 0 }, timing: 1, style: null,
  }];
  // 旁路指令：A 側下 digBias（守方 L 指令）、B 側下 blockCall（守方封線）——
  // ★ 值必須與真實引擎同形（§6.1 第 3 條）★：digBias 不帶 team 的話
  //   ai.js:979 `bias.team !== team` 直接無視 ⇒ patch 形同不存在、A2-2 測不到。
  //   真形狀抄自 matchLoop.js:1473（team/choice/block/override）與 1284（team/line）。
  let patch = null;
  if (end.slot === 'A' && t % 53 === 0) patch = { digBias: { team: 'A', choice: 'line', block: 'line', override: true } };
  if (end.slot === 'A' && t % 71 === 0) patch = { digBias: null };
  if (end.slot === 'B' && t % 67 === 0) patch = { blockCall: { team: 'B', line: 'cross' } };
  return { intents, patch };
}

function advanceOnce(end, chan, ctrl, mutateOut = null) {
  const t = end.game.tick;
  if (end.sampledTick < t) {
    const msg = end.ls.sample(t, scriptedInput(end, ctrl));
    end.sampledTick = t;
    chan.send(end.slot === 'A' ? 'B' : 'A', msg, mutateOut);
  }
  if (!end.ls.ready(t)) return false;
  const { intents, patches } = end.ls.consumeFrame(t);
  applyPatches(end.ai, patches, PLAYER_AI_FIELDS);
  const all = [...intents, ...aiCollectIntents(end.game, end.ai, [ctrl.A, ctrl.B])];
  stepGame(end.game, all);
  return true;
}

function stateOf(end) {
  return JSON.parse(JSON.stringify({ ...end.game, events: [] }));
}

// 兩端跑到 targetTick。mutateA2B＝A→B 訊息的破壞器（A2-2 用）
function runPair(seed, delay, targetTick, mutateA2B = null) {
  const A = createEnd('A', seed, delay);
  const B = createEnd('B', seed, delay);
  const ctrl = { A: A.game.match.rotations.A[0], B: A.game.match.rotations.B[0] };
  const chan = createFakeChannel();
  let clock = 0;
  let guard = 0;
  while ((A.game.tick < targetTick || B.game.tick < targetTick) && guard < 500000) {
    guard += 1;
    clock += 1;
    chan.deliver('A', clock, (m) => A.ls.pushRemote(m));
    chan.deliver('B', clock, (m) => B.ls.pushRemote(m));
    if (A.game.tick < targetTick) advanceOnce(A, chan, ctrl, mutateA2B);
    if (B.game.tick < targetTick) advanceOnce(B, chan, ctrl, null);
  }
  assert.ok(guard < 500000, '鎖步卡死（影格永遠等不齊）');
  return { A, B };
}

test('A2-1 同 seed 假傳輸交換 3000 tick：兩端 rngState／比分／整包狀態逐值相同', () => {
  const { A, B } = runPair(77, 3, 3000);
  assert.equal(A.game.rngState, B.game.rngState);
  assert.deepEqual(A.game.match.score, B.game.match.score);
  assert.deepEqual(stateOf(A), stateOf(B));
  assert.ok(A.game.tick >= 3000 && B.game.tick >= 3000);
  // 防「兩台一起卡死＝逐值相同」的假綠：這場必須真的打起來
  const pts = A.game.match.score.A + A.game.match.score.B;
  assert.ok(pts >= 1, `3000 tick 零得分＝比賽根本沒打起來（score ${JSON.stringify(A.game.match.score)}）`);
});

test('A2-2 鑑別力：讓 B 端漏掉一筆 A 的 patch ⇒ 兩端必須分岔（A2-1 斷言非恆真）', () => {
  let dropped = 0;
  const mutate = (msg) => {
    // 整場漏掉 A 的所有「帶非 null 值」patch＝「忘了把指令通道接上同步」的真實壞法。
    // （只漏一筆會被下一筆 patch 自癒：aiState 的暫時差異若沒在窗內被 sim 消費，
    //   下一次覆寫就回到同步——那樣的斷言測不到整條通道斷線。）
    const meaty = msg.f?.a && Object.values(msg.f.a).some((v) => v !== null);
    if (meaty) { dropped += 1; return { t: msg.t, f: { p: msg.f.p, a: null } }; }
    return msg;
  };
  const { A, B } = runPair(77, 3, 3000, mutate);
  assert.ok(dropped >= 5, `fixture 失效：整場只攔到 ${dropped} 筆 patch`);
  assert.notDeepEqual(stateOf(A), stateOf(B), '漏套 patch 後兩端竟仍相同＝訊號無鑑別力');
});

test('A2-4 delay 0 與 6：A2-1 不變量皆成立', () => {
  for (const delay of [0, 6]) {
    const { A, B } = runPair(123, delay, 3000);
    assert.equal(A.game.rngState, B.game.rngState, `delay=${delay} rngState 分岔`);
    assert.deepEqual(stateOf(A), stateOf(B), `delay=${delay} 狀態分岔`);
  }
});

// ---- A2-3 旁路衝突不變量 ----
//
// 所有權分析（2026-08-28，依 matchLoop.js 24 處寫入點逐條歸類）：
//   digBias／blockCall／counterRead＝**守方**面板（受控者所屬隊在防守時才開窗）
//   attackerId／attackKind／replanCall／cutCall／tandemCall／bquickCall＝**攻方**面板
//     （S 分配、二次球、遠段改判、內切、夾塞、B 快——都要「我方持球」才開窗）
//   排球同一 tick 恰有一隊持球 ⇒ 攻方欄位與守方欄位的寫入者天然互斥；
//   同一欄位要被兩側同 tick 寫入，只可能發生在球權翻轉的邊界 tick。
//   ★ 防線按效果寫、不按「不該發生」寫（02 §6.1 第 7 條）★：就算真的撞上，
//   兩台跑同一條「A 先 B 後」合併 ⇒ 合併結果仍逐位元相同，決定論不破——
//   壞的只會是語意（後寫者贏），不會是同步。
test('A2-3 同 tick 同欄位衝突：兩台按同序合併 ⇒ aiState 逐位元相同（9 欄位全掃）', () => {
  for (const field of PLAYER_AI_FIELDS) {
    const mkPatchA = { [field]: { from: 'A', v: 1 } };
    const mkPatchB = { [field]: { from: 'B', v: 2 } };
    const host = createAiState();
    const guest = createAiState();
    applyPatches(host, [mkPatchA, mkPatchB], PLAYER_AI_FIELDS);
    applyPatches(guest, [mkPatchA, mkPatchB], PLAYER_AI_FIELDS);
    assert.deepEqual(host[field], guest[field], `${field} 合併分岔`);
    assert.deepEqual(host[field], { from: 'B', v: 2 }, `${field} 未按 A 先 B 後（後寫者贏）`);
  }
});

test('A2-3b 白名單防線：patch 帶非白名單欄位直接炸（防未來把任意欄位塞進通道）', () => {
  const ai = createAiState();
  assert.throws(() => applyPatches(ai, [{ flightId: 99 }], PLAYER_AI_FIELDS), /白名單/);
});

test('鎖步契約：取樣亂序炸、影格未齊不准 consume、開場預填 delay 格', () => {
  // 開場預填是**雙側**的：0..delay-1 沒有任何輸入來得及生效 ⇒ ready 為真
  const ls = createLockstep({ delay: 3, localSlot: 'A' });
  assert.equal(ls.ready(0), true);
  assert.equal(ls.ready(2), true);
  assert.equal(ls.ready(3), false);
  const ls2 = createLockstep({ delay: 2, localSlot: 'A' });
  assert.equal(ls2.ready(0), true);
  assert.equal(ls2.ready(1), true);
  assert.equal(ls2.ready(2), false); // 取樣 0 生效於 2，但雙側都還沒取樣
  ls2.sample(0, {});
  assert.equal(ls2.ready(2), false); // 只有本地到，遠端未到
  ls2.pushRemote({ t: 2, f: null });
  assert.equal(ls2.ready(2), true);
  assert.throws(() => ls2.sample(2, {}), /亂序/); // 上次取樣 0，跳到 2＝亂序
  assert.throws(() => ls2.consumeFrame(3), /未到齊/);
});
