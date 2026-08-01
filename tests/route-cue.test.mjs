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

test('段0：離起點的距離只在「還沒到位且還沒起跑」時報（其餘是噪音）', () => {
  assert.match(routeCueTextOf({ ...base, distToStart: 2.4 }).text, /離起點 2\.4m/);
  assert.doesNotMatch(routeCueTextOf({ ...base, distToStart: 0.1 }).text, /離起點/,
    '已經站在起點上還報距離＝噪音');
  assert.doesNotMatch(routeCueTextOf({ ...base, phase: 'air', distToStart: 2.4 }).text, /離起點/,
    '人都跳起來了還報「離起點多遠」＝噪音');
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
