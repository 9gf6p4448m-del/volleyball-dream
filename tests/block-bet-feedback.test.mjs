// 攔網時序卷 段 5 回饋層：「他賭了、賭錯了、留下空門」字卡的判準
//
// 反作弊鐵律的機械保證之一：本檔佈置的全是**可觀察量**（actor.x／blockUntil／
// blockStartTick／ball.x），一格 `aiState.blockPlan` 都沒設——判準若偷讀攔網 AI 的
// 私有狀態，這些測試會全數落空。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/sim/game.js';
import { AIR_TICKS } from '../src/sim/approach.js';
import { BLOCK_HALF_WIDTH } from '../src/sim/blockBand.js';
import { blockBetFeedbackOf, mbCallFeedbackOf } from '../src/input/blockBetFeedback.js';

const TICK = 100;

// 佈置：A 隊扣球，B 隊前排（rot 位置 2/3/4 ＝ B2/B3/B4）有人在攔網滯空中。
// airT＝起跳後經過幾 tick；x＝那個人站在哪（球在 x=0）。
function rig({ airT = 10, x = 3, blockUntil = TICK + 5, routes = [{ pid: 'A1' }, { pid: 'A3' }] } = {}) {
  const g = createGame({ seed: 7 });
  g.tick = TICK;
  g.ball.x = 0;
  const a = g.actors.B2;
  a.x = x;
  a.blockUntil = blockUntil;
  a.blockStartTick = TICK - airT;
  const aiState = { approach: { team: 'A', routes } };
  return { g, aiState };
}

test('賭錯＋空門＋扣球者就是玩家 → 帶「你」的那張', () => {
  const { g, aiState } = rig();
  const fb = blockBetFeedbackOf(g, aiState, 'A1', 'A1');
  assert.ok(fb, '應該要出字卡');
  assert.equal(fb.text, '他賭了、賭錯了——空門是你的！');
  assert.ok(fb.ms > 0 && typeof fb.color === 'string');
});

test('扣球者是隊友、但玩家本波有跑助跑線 → 無歸因那張（不得寫成「你帶走了攔網手」）', () => {
  const { g, aiState } = rig();
  const fb = blockBetFeedbackOf(g, aiState, 'A1', 'A3');
  assert.ok(fb, '應該要出字卡');
  assert.equal(fb.text, '他賭了，賭錯了，空門！');
  assert.ok(!fb.text.includes('你'), '無歸因版不得出現「你」——誤歸因率沒過門檻');
});

test('扣球者是隊友、玩家本波沒跑助跑線 → 不出字卡（不對玩家沒參與的波播）', () => {
  const { g, aiState } = rig({ routes: [{ pid: 'A3' }, { pid: 'A4' }] });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A3'), null);
});

test('沒有人在攔網空中＝沒人賭 → 不出字卡', () => {
  const { g, aiState } = rig({ blockUntil: TICK - 1 }); // 攔網窗已過，沒人起跳
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A1'), null);
});

test('人在空中但就在球旁邊＝不是空門 → 不出字卡', () => {
  const { g, aiState } = rig({ x: BLOCK_HALF_WIDTH - 0.01 });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A1'), null);
});

test('落地的攔網手不算「在空中」：blockUntil 仍在窗內但已超過 AIR_TICKS → 視同沒賭', () => {
  const { g, aiState } = rig({ airT: AIR_TICKS + 1, blockUntil: TICK + 60 });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A1'), null);
  // 對照組：同一佈置只把 airT 收回窗內就要出卡（證明紅的原因是滯空窗，不是別的）
  const inWindow = rig({ airT: AIR_TICKS, blockUntil: TICK + 60 });
  assert.ok(blockBetFeedbackOf(inWindow.g, inWindow.aiState, 'A1', 'A1'));
});

// ---------------- 裁定乙第二步：玩家封線的結果字卡（2026-08-03）----------------
//
// ★ 這批測試存在的理由 ★
// 前一版字卡**恆假了一整天**：`6b7051b` 把面板改成問「封哪邊」之後，生產端寫的是
// `{ jumped: false, line }`、消費端卻還在讀 `.jumped`，三句字卡一句都印不出來。
// 根因＝判定內聯在 UI 迴圈、沒有測試守著。下面第一條就是釘住那個形狀的護欄。

test('★防恆假★ 用生產端實際寫入的 mbCommit 形狀，必須拿得到字卡', () => {
  // 這一行刻意抄 matchLoop.js 生產端的字面形狀（面板選「封斜線」時寫的東西）。
  // 若哪天生產端又改了欄位名而消費端沒跟上，這條會紅。
  const mbCommit = { jumped: false, line: 'cross' };
  const card = mbCallFeedbackOf('cross', mbCommit);
  assert.ok(card, 'mbCommit 的欄位與判定讀的欄位對不上＝字卡恆假（前一版就是死在這裡）');
  assert.match(card.text, /讀對/);
});

test('封對邊：球走的線路＝玩家選的線路 → 「方向讀對了」', () => {
  assert.match(mbCallFeedbackOf('line', { line: 'line' }).text, /方向讀對了/);
  assert.match(mbCallFeedbackOf('cross', { line: 'cross' }).text, /方向讀對了/);
});

test('封錯邊：球走另一條 → 「他打你沒守的那邊」', () => {
  assert.match(mbCallFeedbackOf('cross', { line: 'line' }).text, /沒守的那邊/);
  assert.match(mbCallFeedbackOf('line', { line: 'cross' }).text, /沒守的那邊/);
});

test('沒下指令＝沒有賭注，不評', () => {
  assert.equal(mbCallFeedbackOf('line', null), null);
  assert.equal(mbCallFeedbackOf('line', undefined), null);
});

test('middle／tip 不是「封哪邊」能回答的問題 ⇒ 不評（免得被誤讀成選錯邊）', () => {
  assert.equal(mbCallFeedbackOf('middle', { line: 'line' }), null);
  assert.equal(mbCallFeedbackOf('tip', { line: 'cross' }), null);
  assert.equal(mbCallFeedbackOf(null, { line: 'line' }), null);
});

test('兩種結果的措辭與顏色必須分得開（同色同字＝玩家看不出對錯）', () => {
  const right = mbCallFeedbackOf('line', { line: 'line' });
  const wrong = mbCallFeedbackOf('cross', { line: 'line' });
  assert.notEqual(right.text, wrong.text);
  assert.notEqual(right.color, wrong.color);
});
