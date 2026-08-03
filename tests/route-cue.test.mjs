// 叫戰術重做卷 段 0（裁定題 0＋題 2）：「S 要你跑 X」提示的狀態映射。
//
// 測的是純函式 `routeCueTextOf`（createRouteCue 綁 DOM，node 建不起來——
// 同 matchControls.mbMomentFor 的先例）。三檔狀態的**判斷式都用真實欄位驅動**，
// 沒有任何一條是靠寫死的旗標翻出來的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { createAiState } from '../src/sim/ai.js';
import { routeCueTextOf } from '../src/ui/routeCue.js';
import { myRouteFor } from '../src/input/myRoute.js';

const base = { label: '交叉·三速', phase: 'wait', ticksToStart: 60, distToStart: 2.4 };

test('段0：沒有線可報＝不顯示（不對玩家沒被排到線的球說話）', () => {
  assert.equal(routeCueTextOf(null), null);
  assert.equal(routeCueTextOf({}), null, '缺 label 也要當成沒有線，不得畫出半截提示');
});

test('段0：三檔狀態由 ticksToStart／phase 驅動，不是寫死的', () => {
  const far = routeCueTextOf({ ...base, ticksToStart: 60 });
  assert.equal(far.tone, 'wait');
  assert.match(far.text, /1\.0s 後起步/, '還有時間時要報倒數');

  const due = routeCueTextOf({ ...base, ticksToStart: 5 });
  assert.equal(due.tone, 'now', 'ticksToStart 進到門檻內仍判 wait＝門檻沒接上');
  assert.match(due.text, /現在跑！/);

  const running = routeCueTextOf({ ...base, phase: 'chase', ticksToStart: -3 });
  assert.equal(running.tone, 'running');
  assert.match(running.text, /跑！/);
});

// ⚠ 2026-08-03：`dist` **目前沒有畫出來**（Sawmah 要求砍掉最不急的一項、把橫帶壓窄），
// 所以斷言的對象從 `.text` 換成 `.dist` 欄位——**守的規則一格未改**，只是載體移位。
// 哪天把距離加回畫面，這條照樣是那道閘。
test('段0：離起點的距離只在「還沒到位且還沒起跑」時才算得出來（其餘是噪音）', () => {
  assert.match(routeCueTextOf({ ...base, distToStart: 2.4 }).dist, /離起點 2\.4m/);
  assert.equal(routeCueTextOf({ ...base, distToStart: 0.1 }).dist, '',
    '已經站在起點上還報距離＝噪音');
  assert.equal(routeCueTextOf({ ...base, phase: 'air', distToStart: 2.4 }).dist, '',
    '人都跳起來了還報「離起點多遠」＝噪音');
});

// ③ 起步前 1.5s 才亮起來（2026-08-03 Sawmah 試行）——太早就不顯示，別整球佔著畫面。
test('③ 太早不顯示：倒數還很長時 tooEarly 為真，進入視窗與起跑後為假', () => {
  assert.equal(routeCueTextOf({ ...base, ticksToStart: 300 }).tooEarly, true, '5s 前就亮著＝整球佔畫面');
  assert.equal(routeCueTextOf({ ...base, ticksToStart: 60 }).tooEarly, false, '1s 前必須看得到');
  assert.equal(routeCueTextOf({ ...base, ticksToStart: 300, phase: 'chase' }).tooEarly, false,
    '已經在跑就不算太早——這時它是「我跑對了嗎」的確認');
});

test('段0：三檔的文案兩兩不同（玩家要分得出現在是哪一檔）', () => {
  const texts = [
    routeCueTextOf({ ...base, ticksToStart: 60 }).text,
    routeCueTextOf({ ...base, ticksToStart: 5 }).text,
    routeCueTextOf({ ...base, phase: 'chase' }).text,
  ];
  assert.equal(new Set(texts).size, 3, `三檔文案有重複：${texts.join(' ｜ ')}`);
});

test('段0 接線：資料源就是 myRouteFor，沒有線時整條鏈回 null', () => {
  // 接發階段（touches===0）結構上沒有助跑線——myRouteFor 自己會擋，
  // 提示層不得自己補一個出來
  const game = createGame({ seed: 3 });
  const ai = createAiState();
  const pid = game.match.rotations.A[0];
  assert.equal(myRouteFor(game, ai, pid), null, '前提：這一刻本來就沒有線');
  assert.equal(routeCueTextOf(myRouteFor(game, ai, pid)), null);
});

// ★ 2026-08-03 Sawmah 試玩回報＋裁定 ★
// 第 1 屆連對手都沒有組合攻擊（`comboScale=0`，careerState.js:610），
// 但提示照樣寫「S 要你跑：內切」⇒ 玩家以為 S 叫了一個戰術、以為屆數閘漏了。
// 實際上「內切」只是助跑線的隨機變化（approach.js CROSS_RATE=0.3，不吃屆數）。
test('分屆換詞：沒有戰術的那一屆說「你的線」，有戰術之後才說「S 要你跑」', () => {
  const off = routeCueTextOf({ ...base, playsOn: false });
  assert.equal(off.lead, '你的線');
  assert.doesNotMatch(off.text, /S 要你跑/,
    '第 1 屆沒有戰術系統，說「S 要你跑」會被讀成 S 叫了戰術');

  const on = routeCueTextOf({ ...base, playsOn: true });
  assert.equal(on.lead, 'S 要你跑', '第 2 屆起 callPlay 解鎖了，措辭要回來');
  // 舊呼叫端／既有測試沒有這個欄位 ⇒ 不得默默改掉它們看到的措辭
  assert.equal(routeCueTextOf(base).lead, 'S 要你跑', '缺 playsOn 時要維持既有措辭');
});

test('三層卡片：三件事各自成欄，不是一整串字（版面才排得出三層）', () => {
  const cue = routeCueTextOf({
    ...base, kindLabel: '內切', tempo: 'one', tempoLabel: '一速', ticksToStart: 3, distToStart: 2.4,
  });
  assert.equal(cue.kindLabel, '內切', '跑哪條線要單獨一欄');
  assert.equal(cue.tempoLabel, '一速', '幾速要單獨一欄');
  assert.equal(cue.tempo, 'one', '速度色條要吃檔位鍵，不是吃中文標籤');
  assert.equal(cue.action, '現在跑！', '現在該做什麼要單獨一欄');
  assert.match(cue.dist, /離起點 2\.4m/, '距離要單獨一欄');
  // 三欄不得互相吃掉：動作欄裡不該混進路線名或速度
  assert.doesNotMatch(cue.action, /內切|一速/);
});
