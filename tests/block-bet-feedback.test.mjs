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
import { blockBetFeedbackOf, mbCallFeedbackOf, createBlockBetArm } from '../src/input/blockBetFeedback.js';

const TICK = 100;

// 佈置：A 隊扣球，B 隊前排（rot 位置 2/3/4 ＝ B2/B3/B4）有人在攔網滯空中。
// airT＝起跳後經過幾 tick；x＝那個人站在哪（球在 x=0）。
function rig({
  airT = 10, x = 3, blockUntil = TICK + 5,
  routes = [{ pid: 'A1' }, { pid: 'A3' }], persona = null,
} = {}) {
  const g = createGame({
    seed: 7,
    ...(persona ? { aiProfiles: { B: { blockPersona: persona } } } : {}),
  });
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
  const { g, aiState } = rig({ persona: 'commit' });
  const fb = blockBetFeedbackOf(g, aiState, 'A1', 'A1');
  assert.ok(fb, '應該要出字卡');
  assert.equal(fb.text, '他賭了、賭錯了——空門是你的！');
  assert.ok(fb.ms > 0 && typeof fb.color === 'string');
});

test('扣球者是隊友、但玩家本波有跑助跑線 → 無歸因那張（不得寫成「你帶走了攔網手」）', () => {
  const { g, aiState } = rig({ persona: 'commit' });
  const fb = blockBetFeedbackOf(g, aiState, 'A1', 'A3');
  assert.ok(fb, '應該要出字卡');
  assert.equal(fb.text, '他賭了，賭錯了，空門！');
  assert.ok(!fb.text.includes('你'), '無歸因版不得出現「你」——誤歸因率沒過門檻');
});

test('扣球者是隊友、玩家本波沒跑助跑線 → 不出字卡（不對玩家沒參與的波播）', () => {
  const { g, aiState } = rig({ persona: 'commit', routes: [{ pid: 'A3' }, { pid: 'A4' }] });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A3'), null);
});

test('沒有人在攔網空中＝沒人賭 → 不出字卡', () => {
  const { g, aiState } = rig({ persona: 'commit', blockUntil: TICK - 1 }); // 攔網窗已過，沒人起跳
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A1'), null);
});

test('人在空中但就在球旁邊＝不是空門 → 不出字卡（read 隊：罩到線是正常反應，不喊賭）', () => {
  const { g, aiState } = rig({ x: BLOCK_HALF_WIDTH - 0.01 });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A1'), null);
});

// ---------------- 題 E3（2026-08-05）：賭局敘事的另一半「賭中」 ----------------

test('題E3 賭中：commit 隊、牆罩在球的線上、扣球者是玩家 → 「他賭中了」', () => {
  const { g, aiState } = rig({ x: BLOCK_HALF_WIDTH - 0.01, persona: 'commit' });
  const fb = blockBetFeedbackOf(g, aiState, 'A1', 'A1');
  assert.ok(fb, 'commit 賭中的那一瞬間必須講出來（E3 的存在理由）');
  assert.match(fb.text, /賭中/);
});

test('題E3 反面：同一佈置換成 read 隊 → 不出卡（read 罩到線不是賭，喊「賭中」是錯的敘事）', () => {
  const { g, aiState } = rig({ x: BLOCK_HALF_WIDTH - 0.01, persona: 'read' });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A1'), null);
});

test('題E3 反面：commit 賭中、扣球者是隊友、玩家也不是二傳 → 不出卡', () => {
  const { g, aiState } = rig({ x: BLOCK_HALF_WIDTH - 0.01, persona: 'commit' });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A3'), null);
});

// ---------------- 題 E 收尾（08-05 試玩「玩 S 整場沒卡」）：二傳也算參與 ----------------

test('玩家當二傳、隊友扣進空門 → 無歸因賭錯卡（S 反配空門是玩法本體，不能沒回饋）', () => {
  const { g, aiState } = rig({ persona: 'commit', routes: [{ pid: 'A3' }, { pid: 'A4' }] }); // 玩家沒跑線
  const fb = blockBetFeedbackOf(g, aiState, 'A1', 'A3', { setterId: 'A1' }); // setterId＝玩家
  assert.ok(fb, '二傳配進空門必須有回饋');
  assert.equal(fb.text, '他賭了，賭錯了，空門！');
  assert.ok(!fb.text.includes('你'), '二傳版維持無歸因（線是扣球者選的，混合因果）');
});

test('玩家當二傳、commit 賭中罩住隊友 → 無歸因賭中卡', () => {
  const { g, aiState } = rig({
    x: BLOCK_HALF_WIDTH - 0.01, persona: 'commit', routes: [{ pid: 'A3' }, { pid: 'A4' }],
  });
  const fb = blockBetFeedbackOf(g, aiState, 'A1', 'A3', { setterId: 'A1' });
  assert.ok(fb, '二傳配進賭中的牆必須有回饋');
  assert.match(fb.text, /賭中/);
  assert.ok(!fb.text.includes('你'), '二傳版維持無歸因');
});

test('玩家當二傳但對方是 read 隊、牆罩住 → 不出賭中卡（read 不喊賭，二傳版同規）', () => {
  const { g, aiState } = rig({
    x: BLOCK_HALF_WIDTH - 0.01, persona: 'read', routes: [{ pid: 'A3' }, { pid: 'A4' }],
  });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A3', { setterId: 'A1' }), null);
});

test('read 隊的空門不出賭錯卡（他們不是在賭；收尾 2 起賭局卡家族整組鎖 commit）', () => {
  const { g, aiState } = rig(); // 預設 read、空門、玩家親扣
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A1'), null);
});

test('★防回歸★ ranRoute 走武裝時快照：opts 給了就不得再自讀 aiState（結算時 approach 已清）', () => {
  // 快照 true、aiState 沒有玩家的線 → 仍要出無歸因卡（遞延結算的正典情境）
  const a = rig({ persona: 'commit', routes: [{ pid: 'A3' }, { pid: 'A4' }] });
  const fb = blockBetFeedbackOf(a.g, a.aiState, 'A1', 'A3', { ranRoute: true });
  assert.ok(fb, '快照說有跑線就要出卡——自讀已清空的 approach 會讓跑線卡整類消失（探針實測 42→0）');
  assert.equal(fb.text, '他賭了，賭錯了，空門！');
  // 快照 false、aiState 卻有玩家的線 → 不出卡（快照優先，不得偷讀）
  const b = rig({ persona: 'commit' }); // routes 含 A1
  assert.equal(blockBetFeedbackOf(b.g, b.aiState, 'A1', 'A3', { ranRoute: false }), null);
});

// ---------------- 題 E 收尾 2：遞延結算狀態機 createBlockBetArm ----------------
//
// 前一版「觸球即評」上線後真人整場零卡（E1 後牆是球到達時才在空中，真人揮拍比預測早）。
// 這批測試餵**生產端同形**的事件流（TOUCH／BLOCK_TOUCH／DEAD_BALL 字面形狀），
// 釘死「武裝→球到網才評」的時序——與 mbCallFeedbackOf 的防恆假護欄同一個存在理由。

test('武裝→球過網（z 變號）才結算，且只結算一次', () => {
  const arm = createBlockBetArm();
  assert.equal(arm.onEvent({ type: 'TOUCH', kind: 'set', team: 'A', playerId: 'A2' }, 'A', 5), null);
  assert.equal(arm.onEvent({ type: 'TOUCH', kind: 'spike', team: 'A', playerId: 'A1' }, 'A', 6), null);
  assert.equal(arm.onFrame(3.2), null); // 球還在我方半場：不評
  assert.equal(arm.onFrame(1.1), null);
  assert.deepEqual(arm.onFrame(-0.2),
    { spikerId: 'A1', setterId: 'A2', flightId: 6, ranRoute: null });
  assert.equal(arm.onFrame(-1.0), null); // 已結算，不重複
});

test('被攔回不過網：對方 BLOCK_TOUCH 立即結算（「賭中」那一類不得因等變號而漏掉）', () => {
  const arm = createBlockBetArm();
  arm.onEvent({ type: 'TOUCH', kind: 'spike', team: 'A', playerId: 'A1' }, 'A', 9);
  arm.onFrame(2.0);
  const p = arm.onEvent({ type: 'BLOCK_TOUCH', team: 'B', playerId: 'B2' }, 'A', 9);
  assert.equal(p?.spikerId, 'A1');
  assert.equal(arm.onFrame(-0.5), null); // 已結算，之後變號不再觸發
});

test('死球清空：武裝後死球，之後的變號不結算', () => {
  const arm = createBlockBetArm();
  arm.onEvent({ type: 'TOUCH', kind: 'spike', team: 'A', playerId: 'A1' }, 'A', 3);
  arm.onEvent({ type: 'DEAD_BALL' }, 'A', 3);
  arm.onFrame(2.0);
  assert.equal(arm.onFrame(-1.0), null);
});

test('對方的 set 不覆蓋二傳者、對方的 spike 不武裝', () => {
  const arm = createBlockBetArm();
  arm.onEvent({ type: 'TOUCH', kind: 'set', team: 'A', playerId: 'A2' }, 'A', 1);
  arm.onEvent({ type: 'TOUCH', kind: 'set', team: 'B', playerId: 'B3' }, 'A', 1);
  arm.onEvent({ type: 'TOUCH', kind: 'spike', team: 'B', playerId: 'B4' }, 'A', 2);
  arm.onFrame(1.0);
  assert.equal(arm.onFrame(-1.0), null); // 對方 spike 沒武裝 ⇒ 變號不結算
  arm.onFrame(2.0); // 球回到我方半場（逐幀餵，prevZ 跟著走——與 matchLoop 的餵法同形）
  arm.onEvent({ type: 'TOUCH', kind: 'spike', team: 'A', playerId: 'A1' }, 'A', 3);
  arm.onFrame(1.0);
  assert.equal(arm.onFrame(-1.0)?.setterId, 'A2'); // 二傳者仍是我方那位
});

test('落地的攔網手不算「在空中」：blockUntil 仍在窗內但已超過 AIR_TICKS → 視同沒賭', () => {
  const { g, aiState } = rig({ persona: 'commit', airT: AIR_TICKS + 1, blockUntil: TICK + 60 });
  assert.equal(blockBetFeedbackOf(g, aiState, 'A1', 'A1'), null);
  // 對照組：同一佈置只把 airT 收回窗內就要出卡（證明紅的原因是滯空窗，不是別的）
  const inWindow = rig({ persona: 'commit', airT: AIR_TICKS, blockUntil: TICK + 60 });
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
