// B/C 債清批（2026-08-27）A1-A3／B1-B2 — 重播視角抬高＋比賽內回放接 sfx。
// 驗收＝docs/kickoffs/acceptance-bc-debt-20260827.md。
//
// 突變實測紀錄（**真的做過**，2026-08-27，各用 sed 反向替換做壞版、單跑本檔、還原）：
//   ①拿掉 replayDirector.js 決定性一拍 push 的 `lift: DECISIVE_LIFT,` 一行
//     → 「A1」測試紅（非慢動作/慢動作 lift 斷言）。還原後綠。
//   ②拿掉 matchLoop.js runHighlightFrame 的 lift 套用三行（`const lift = ...` 到
//     `ctx.camera.lookAt(target);`）→「A2」兩條測試都紅（y 沒變、lookAt 沒被呼叫）。還原後綠。
//   ③拿掉 matchLoop.js runHighlightFrame 的 `if (!jumped && frameEvents.length) { ... }`
//     → 「B1」測試紅（sfxCalls.length 從 1 變 0）。還原後綠。
//   ④把 runHighlightFrame 的 `jumped` 條件式改成恆 false（`const jumped = false;`）
//     → 「B2」測試紅（大跳 100 步那條斷言 sfxCalls.length 從 0 變 1）。還原後綠。
//   ⑤同 ③④ 對 runReplayFrame（手動🎬／情蒐帶）做同款突變（用原始碼字串比對），
//     拿掉對應行 → 對應的原始碼結構斷言紅。還原後綠。
// 逐條紀錄詳見回報 scratchpad/bc-debt-report.md。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { createRallyRecorder } from '../src/app/rallyTape.js';
import { SIM_DT } from '../src/sim/constants.js';
import {
  buildDirectorScript, DECISIVE_LIFT, LINE_LIFT,
} from '../src/render/replayDirector.js';
import { runHighlightFrame, runReplayFrame } from '../src/app/matchLoop.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
function fnBody(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, `找不到 ${header}`);
  const end = src.indexOf('\n}\n', i);
  assert.ok(end > i, `${header} 沒有找到函式結尾`);
  return src.slice(i, end + 3);
}

function recordRally(seed) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const rec = createRallyRecorder();
  let guard = 0;
  while (guard < 20000) {
    guard += 1;
    if (game.phase === 'serve') rec.begin(game, ai);
    rec.step(game, ai, null, []);
    const events = stepGame(game, aiCollectIntents(game, ai));
    if (events.some((e) => e.type === 'DEAD_BALL')) break;
  }
  return rec.end();
}

// ════════════════════════════════════════════════════════════
// A1：導播腳本——慢動作兩鏡位宣告 lift，其餘鏡位不帶
// ════════════════════════════════════════════════════════════
test('A1：決定性一拍與落點收尾宣告 lift（正數），其餘鏡位（發球/中段）不帶 lift', () => {
  let sawDecisive = false;
  let sawLine = false;
  for (let seed = 1; seed <= 15; seed += 1) {
    const script = buildDirectorScript(recordRally(seed));
    for (const s of script.shots) {
      if (s.cam.slow) {
        assert.ok(s.cam.lift > 0, `慢動作鏡位必須帶正數 lift：${JSON.stringify(s.cam)}`);
        if (s.cam.sig?.kind === 'line') {
          assert.equal(s.cam.lift, LINE_LIFT, '落點收尾必須用 LINE_LIFT');
          sawLine = true;
        } else {
          assert.equal(s.cam.lift, DECISIVE_LIFT, '決定性一拍必須用 DECISIVE_LIFT');
          sawDecisive = true;
        }
      } else {
        assert.equal(s.cam.lift, undefined, `非慢動作鏡位不得帶 lift 欄位：${JSON.stringify(s.cam)}`);
      }
    }
  }
  assert.ok(sawDecisive, '15 顆種子裡至少要驗到一次決定性一拍 lift');
  assert.ok(sawLine, '15 顆種子裡至少要驗到一次落點收尾 lift');
});

// ════════════════════════════════════════════════════════════
// A2：消費端①（matchLoop.js runHighlightFrame）套用 lift——真執行
// ════════════════════════════════════════════════════════════
function fakeCamera() {
  const lookAtCalls = [];
  const rendered = [];
  const camera = {
    position: {
      x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; },
    },
    matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    updateMatrixWorld() { rendered.push('matrix'); },
    lookAt(...args) { lookAtCalls.push(args); },
  };
  return {
    lookAtCalls,
    rendered,
    ctx: {
      camera,
      scene: {},
      renderer: { render: () => rendered.push('render') },
      hud: { frame: () => {} },
      ballView: { sync: () => {} },
    },
  };
}

function fakeStage(target) {
  const rigCalls = [];
  const sfxCalls = [];
  const rig = {
    update: () => rigCalls.push(['update']),
    getTarget: () => target,
    setSigBeat: (v) => rigCalls.push(['setSigBeat', v ?? null]),
    setSetScan: (v) => rigCalls.push(['setSetScan', v ?? null]),
    setPlayerId: (v) => rigCalls.push(['setPlayerId', v ?? null]),
  };
  return {
    rigCalls,
    sfxCalls,
    stage: {
      rig,
      matchView: { sync: () => {} },
      aimMarker: { hide: () => {} },
      landingMarker: { hide: () => {} },
      pointBanner: { show: () => {}, hide: () => {} },
      sfx: { onEvents: (events, opts) => sfxCalls.push([events, opts]) },
      panel: null,
      floatText: { show: () => {} },
    },
  };
}

// states.length-1 = 最後一步索引；events[i] = player.step() 推進到第 i 步時吐出的事件
function fakePlayer(states, events) {
  let idx = 0;
  return {
    get index() { return idx; },
    get done() { return idx >= states.length - 1; },
    get state() { return states[idx]; },
    step() { idx += 1; return events[idx] ?? []; },
  };
}

function scriptWithOneShot(cam, totalSteps) {
  const segments = [{ from: 0, to: totalSteps, speed: 1 }];
  const totalMs = segments.reduce(
    (ms, s) => ms + ((s.to - s.from) * SIM_DT * 1000) / s.speed, 0,
  );
  return {
    totalSteps, segments, totalMs, shots: [{ step: 0, cam }],
  };
}

function highlightSetup({ cam, totalSteps, elapsedFrac, target = { x: 3, y: 4, z: 5 } }) {
  const { ctx, lookAtCalls } = fakeCamera();
  const { stage, rigCalls, sfxCalls } = fakeStage(target);
  const states = Array.from({ length: totalSteps + 1 }, () => ({ ball: {}, rally: { flightId: 0 } }));
  const events = states.map(() => []);
  const player = fakePlayer(states, events);
  const script = scriptWithOneShot(cam, totalSteps);
  const s = {
    stage,
    ctx,
    controlledId: 'A4',
    replay: {
      player,
      acc: 0,
      highlight: {
        plan: {}, script, t0: 0, elapsedMs: script.totalMs * elapsedFrac, anchor: null, startFlight: 0,
      },
    },
  };
  return {
    s, ctx, stage, lookAtCalls, rigCalls, sfxCalls, target,
  };
}

test('A2①（真執行）：lift>0 時 camera.position.y 加上 lift、重新 lookAt rig.getTarget() 拿到的原本注視點', () => {
  const { s, ctx, lookAtCalls, target } = highlightSetup({
    cam: {
      mode: 'sig', anchorId: 'B1', sig: { kind: 'line', at: { x: 0, z: 0 } }, pullback: 0, slow: true, lift: 1.1,
    },
    totalSteps: 3,
    elapsedFrac: 1,
  });
  runHighlightFrame(s, 1000, 1 / 60);
  assert.equal(ctx.camera.position.y, 1.1, 'lift 必須加到 camera.position.y 上');
  assert.equal(lookAtCalls.length, 1, 'lift>0 必須重新呼叫一次 lookAt');
  assert.deepEqual(lookAtCalls[0], [target], '必須 lookAt rig.getTarget() 給的原本注視點，不是自己重算方向');
});

test('A2① 反向：鏡位不帶 lift 時 camera.position.y 不變、不呼叫 lookAt', () => {
  const { s, ctx, lookAtCalls } = highlightSetup({
    cam: { mode: 'third', anchorId: 'B1' },
    totalSteps: 3,
    elapsedFrac: 1,
  });
  runHighlightFrame(s, 1000, 1 / 60);
  assert.equal(ctx.camera.position.y, 0);
  assert.equal(lookAtCalls.length, 0, '沒有 lift 就不該重新 lookAt——現場構圖不該被動到');
});

// ════════════════════════════════════════════════════════════
// A2②：消費端②（replayStage.js）——WebGL 無法在 node 執行，比照本專案既有
// 慣例（tests/highlight-replay.test.mjs「HR-6 追記之二」）改走原始碼結構斷言：
// 拿掉對應行會讓下面的正則直接不 match，具突變可證性，但不是真執行。
// ════════════════════════════════════════════════════════════
test('A2②（原始碼結構）：replayStage.js 的 apply() 同款套用 lift（rig.getTarget→position.y+=lift→lookAt）', () => {
  const src = read('../src/render/replayStage.js');
  assert.match(src, /const lift = shot\?\.cam\.lift \?\? 0;/, '必須讀腳本的 lift 欄位');
  assert.match(src, /const target = rig\.getTarget\(\);/, '必須用 rig.getTarget() 拿原本注視點');
  assert.match(src, /camera\.position\.y \+= lift;/, '必須把 lift 加到 position.y');
  assert.match(src, /camera\.lookAt\(target\);/, '必須重新 lookAt 那個目標');
});

// ════════════════════════════════════════════════════════════
// B1／B2：比賽內回放接 sfx——runHighlightFrame（真執行）
// ════════════════════════════════════════════════════════════
test('B1：runHighlightFrame 把該幀 frameEvents 餵給 stage.sfx.onEvents', () => {
  const ev = { type: 'TOUCH', kind: 'set' };
  const { ctx, lookAtCalls } = fakeCamera();
  const { stage, sfxCalls } = fakeStage({ x: 0, y: 0, z: 0 });
  // totalSteps=3；elapsedFrac=1/3 讓 stepAtExact 落在 step 1（插值分支，非 t>=1 早退）
  const states = Array.from({ length: 4 }, () => ({ ball: {}, rally: { flightId: 0 } }));
  const events = [[], [ev], [], []];
  const player = fakePlayer(states, events);
  const script = scriptWithOneShot({ mode: 'third', anchorId: 'B1' }, 3);
  const s = {
    stage,
    ctx,
    controlledId: 'A4',
    replay: {
      player,
      acc: 0,
      highlight: {
        plan: {}, script, t0: 0, elapsedMs: script.totalMs / 3, anchor: null, startFlight: 0,
      },
    },
  };
  runHighlightFrame(s, 1000, 1 / 60);
  assert.equal(sfxCalls.length, 1, '一般小步進（非大跳）必須餵 sfx');
  assert.deepEqual(sfxCalls[0][0], [ev], '餵的必須是這一幀真的推進到的事件');
  assert.equal(lookAtCalls.length, 0, '這顆鏡位沒有 lift，不涉及本測試但一併確認沒有誤觸');
});

test('B2：一幀跨很多 step（jumped）時不得把整批事件一次餵爆 sfx（防連珠炮）', () => {
  const N = 100; // > 既有 !jumped 門檻 60（沿 replayStage.js:137 慣例）
  const { ctx } = fakeCamera();
  const { stage, sfxCalls } = fakeStage({ x: 0, y: 0, z: 0 });
  const states = Array.from({ length: N + 1 }, () => ({ ball: {}, rally: { flightId: 0 } }));
  const events = states.map((_, i) => (i === 0 ? [] : [{ type: 'TOUCH', kind: 'bump' }]));
  const player = fakePlayer(states, events);
  const script = scriptWithOneShot({ mode: 'third', anchorId: 'B1' }, N);
  const s = {
    stage,
    ctx,
    controlledId: 'A4',
    replay: {
      player,
      acc: 0,
      highlight: {
        plan: {}, script, t0: 0, elapsedMs: script.totalMs, anchor: null, startFlight: 0,
      },
    },
  };
  runHighlightFrame(s, 1000, 1 / 60); // elapsedFrac=1 ⇒ t=1 ⇒ 一次推 100 步
  assert.equal(sfxCalls.length, 0, '大跳 100 步（>60 門檻）不得把事件一次餵給 sfx');
});

// ════════════════════════════════════════════════════════════
// B1／B2：手動🎬／情蒐帶——runReplayFrame（真執行；07-27 起已 export 供測試）
// ════════════════════════════════════════════════════════════
function fakeManualCamera() {
  const lookAtCalls = [];
  const rendered = [];
  const camera = {
    position: {
      x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; },
    },
    lookAt(...args) { lookAtCalls.push(args); },
  };
  return {
    lookAtCalls,
    ctx: {
      camera,
      scene: {},
      renderer: { render: () => rendered.push('render') },
      hud: { frame: () => {} },
      ballView: { sync: () => {} },
    },
  };
}

function fakeManualStage() {
  const sfxCalls = [];
  return {
    sfxCalls,
    stage: {
      matchView: { sync: () => {} },
      aimMarker: { hide: () => {} },
      landingMarker: { hide: () => {} },
      sfx: { onEvents: (events, opts) => sfxCalls.push([events, opts]) },
      panel: null,
      floatText: { show: () => {} },
    },
  };
}

test('B1（手動🎬／情蒐帶）：runReplayFrame 一般小步進把 frameEvents 餵給 sfx', () => {
  const ev = { type: 'TOUCH', kind: 'receive', touches: 3 };
  const { ctx } = fakeManualCamera();
  const { stage, sfxCalls } = fakeManualStage();
  // states 夠長、acc 只夠推進 1 個 SIM_DT（delta=0 ⇒ acc 不再累加，只吃預設值）
  const states = Array.from({ length: 10 }, () => ({ ball: {}, rally: { flightId: 0 } }));
  const events = states.map((_, i) => (i === 1 ? [ev] : []));
  const player = fakePlayer(states, events);
  const s = {
    stage, ctx, replay: { player, acc: SIM_DT * 1.5, startFlight: 0 },
  };
  runReplayFrame(s, 1000, 0);
  assert.equal(sfxCalls.length, 1, '一般小步進必須餵 sfx');
  assert.deepEqual(sfxCalls[0][0], [ev]);
});

test('B2（手動🎬／情蒐帶）：一幀跨很多 step（jumped）時不得餵爆 sfx', () => {
  const { ctx } = fakeManualCamera();
  const { stage, sfxCalls } = fakeManualStage();
  const N = 99; // player.done 會在 index=length-1=99 時成立，> 60 門檻
  const states = Array.from({ length: N + 1 }, () => ({ ball: {}, rally: { flightId: 0 } }));
  const events = states.map((_, i) => (i === 0 ? [] : [{ type: 'TOUCH', kind: 'bump' }]));
  const player = fakePlayer(states, events);
  const s = {
    stage, ctx, replay: { player, acc: SIM_DT * 200, startFlight: 0 },
  };
  runReplayFrame(s, 1000, 0);
  assert.equal(sfxCalls.length, 0, '大跳（player.done 前吃掉 99 步）不得把事件一次餵給 sfx');
});

test('B1／B2 原始碼結構補證：runReplayFrame／startReplay／startTapeClip 的 startFlight 與 !jumped 慣例都在', () => {
  const loop = read('../src/app/matchLoop.js');
  const rf = fnBody(loop, 'export function runReplayFrame');
  assert.match(rf, /const jumped = player\.index - from > 60;/);
  assert.match(rf, /if \(!jumped && frameEvents\.length\) \{/);
  assert.match(rf, /stage\.sfx\.onEvents\(frameEvents, \{ rallyFlights: player\.state\.rally\.flightId - replay\.startFlight \}\);/);
  const startReplayBody = loop.slice(
    loop.indexOf('function startReplay'), loop.indexOf('function startReplay') + 500,
  );
  assert.match(startReplayBody, /startFlight: player\.state\.rally\.flightId/);
  const startTapeBody = loop.slice(
    loop.indexOf('function startTapeClip'), loop.indexOf('function startTapeClip') + 600,
  );
  assert.match(startTapeBody, /startFlight: player\.state\.rally\.flightId/);
});
