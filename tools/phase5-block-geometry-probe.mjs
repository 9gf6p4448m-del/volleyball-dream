// Phase 5 §十 階段二 —— **E 表新指標**探針（H／V／G）
//
// 為什麼要換指標（工單 §2.6-b／裁定書 §三）：
//   舊指標把「攔網窗內任一 tick 曾涵蓋球」算成攔到。手曾舉起、但球到的時候已經放下——
//   **那就是沒攔到**。把它算成攔到，正是本卷要消滅的假狀態，用它當驗收等於自己騙自己。
//
// 新指標：量測時點＝**球心通過網面那一 tick**（z 由正轉負，含線性插值）。
//   H ＝ 球的過網 x 落在**該 MB 自己**的帶內（半寬 TUNING.BLOCK_REACH_X）
//   V ＝ 球心 y ≤ 該 MB **當下**頂邊 ＋ BALL.RADIUS（＝球底 vs 頂邊，沿用 §3.3 約定）
//   G ＝ H ∧ V   ←── **E 表判這個**
//
// 四條釘死的定義（不得自行解讀）：
//   ① 時點就是過網那一 tick，不是「窗內任一 tick 曾涵蓋」
//   ② 算**幾何閘門**不算攔網事件——屬性擲骰參數在階段五白名單上，
//      用事件率當驗收＝讓階段五的旋鈕污染階段二的行為驗收
//   ③ 帶與頂邊都取「該 MB 自己的」，不是全隊聯集——隊友補位會把 MB 的失敗洗掉，
//      而 E 表問的是**這個人格**追不追得到
//   ④ 球半徑沿用 §3.3：球心 y vs `blockTopEdge + BALL.RADIUS`
//
// 附加診斷（不是驗收，是證據）：
//   inWin%  過網那一刻 MB 到底有沒有在攔網窗裡（＝他有沒有在跳）
//   頂邊完成度 ＝ 當下頂邊 ÷ 該次跳躍的頂點頂邊（0–100%）
//     不吃帶寬、不吃屬性、不吃結算，只反映「手到哪了」。
//     **2-B 之前這個數恆為 100.0%**——因為 blockTopEdge 還不吃相位，
//     跳了即等於手在頂點。那個 100.0% 本身就是十-2 的量化證明。
//
// ★ v2 裁定書 §一.5：`inWin%` 與 `inAirWin%` 雙報（2026-07-29 新增）★
// `actor.blockUntil` 在**每個** emit `block` 的 tick 被續期 `TUNING.BLOCK_WINDOW`（48），
// 所以 AI 停止要求攔網之後，sim 側的窗還會再開 48 tick ⇒ `inWin%` 有一大部分量到的
// 其實是**窗延遲**，不是手真的在上面。裁定「不得在本卷縮短 48」（憲法：AI 不得額外
// 加罰，48 是既有拍板），**改探針不改 sim**：
//
//   inWin%     `actor.blockUntil >= tick`（sim 窗，現有欄位，**保留**）
//   inAirWin%  **AI 這一 tick 還在不在 emit `block` Intent**（新增）
//
// 為什麼 `inAirWin` 用「還在不在 emit」而不是讀某個 air 狀態欄位：
//   `aiState.blockCommit` 的 `ACTION_PHASE.AIR` **只有 commit 人格有**
//   （`ai.js:929-976`，read 人格走的是追球軸、一行狀態機都沒有），
//   拿它當欄位會讓 read 臂恆為 0＝兩臂不可比。
//   「本 tick 是否仍要求攔網」是**對兩種人格都成立**的唯一 AI 側訊號，
//   而且它精確地把那條 48 tick 的尾巴切掉——這正是本欄要解決的失真。
//   零新常數、零 sim 改動、行為零變化（由 `tools/sim-hash-probe.mjs` 背書）。
//
// ★ v2 裁定書 §八-2：頂邊完成度的**地板不是 0%** ★
// 落地者的完成度 ＝ 站立摸高 ÷ 跳躍頂點（本卷測試球員約 80.4%），
// 不印出來會讓「92.7%」被誤讀成「只差 7.3%」（實際只走完約 64% 的跳躍行程）。
// 故完成度欄一律附印地板值：`頂邊完成度p50%（地板）`。
//
// 跑法：node tools/phase5-block-geometry-probe.mjs [局數=40]
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { blockReach, blockTopEdge, standingReach } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';
import { BALL } from '../src/sim/constants.js';

const SETS = Number(process.argv[2] ?? 40);

// 攻擊種類分組（沿用 block-persona-probe 的定義，兩支探針可對照）
const GROUP = {
  quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back',
};

function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

/** 球心通過網面（z = 0）那一刻的 x／y——線性插值於過網前後兩個 tick。 */
function crossingPoint(before, after) {
  const dz = before.z - after.z;
  const f = dz === 0 ? 0 : before.z / dz; // before.z > 0 ≥ after.z ⇒ f ∈ [0, 1]
  return { x: before.x + (after.x - before.x) * f, y: before.y + (after.y - before.y) * f };
}

function sampleAt(game, cross, inAirWin) {
  const mb = mbOf(game, 'B');
  if (!mb) return null;
  const p = game.players[mb];
  const actor = game.actors[mb];
  const jumpMul = staminaPerfMul(game, p);

  // 「當下」：在攔網窗裡才有起跳相位；不在窗裡 ⇒ 這一刻他根本沒在跳
  const inWin = actor.blockUntil >= game.tick;
  const t = inWin ? game.tick - actor.blockStartTick : null;

  const top = blockTopEdge(p, t, jumpMul);
  const apex = blockReach(p, jumpMul);

  const H = Math.abs(actor.x - cross.x) <= TUNING.BLOCK_REACH_X;
  const V = cross.y <= top + BALL.RADIUS;
  return {
    H,
    V,
    G: H && V,
    inWin,
    inAirWin,
    topPct: apex > 0 ? top / apex : 0,
    // §八-2：完成度的**地板不是 0%**——站立摸高 ÷ 跳躍頂點。落地者的完成度就是這個值，
    // 不印出來會讓「92.7%」被讀成「只差 7.3%」（實際只走完約 64% 的跳躍行程）
    topFloorPct: apex > 0 ? standingReach(p) / apex : 0,
    // §3.6 診斷：V 若幾乎不動，要能分辨「頂邊沒吃相位」與「指標本來就退化」。
    // vMargin ＝ 頂邊（含球半徑）− 球心高度：正值＝手在球上面（V 真）。
    // 它 p50 若遠大於 0，代表球過網時本來就遠低於手，V 對誰都恆真＝指標退化。
    vMargin: (top + BALL.RADIUS) - cross.y,
    ballY: cross.y,
    apexMargin: (apex + BALL.RADIUS) - cross.y, // 同一顆球對「手在頂點」的餘裕
  };
}

function runSet(seed, blockPersona) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona } } });
  const ai = createAiState();
  const rows = [];
  let pending = null; // { kind } —— A 已出手、球還沒過網
  let guard = 0;
  while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    const spiking = game.phase === 'rally' && r.possession === 'A'
      && r.touches === 3 && r.profile === 'spike';
    if (spiking && !pending && ai.attackKind) pending = { kind: ai.attackKind };
    const before = { x: game.ball.x, y: game.ball.y, z: game.ball.z };
    // §一.5：`inAirWin` 要量的是 **AI 這一 tick 還在不在要求攔網**，所以必須在
    // Intent 被 sim 消費**之前**攔下來看。拆成兩句只是為了讀 intents，
    // 餵給 stepGame 的東西逐值不變（行為零變化由 sim-hash 背書）。
    const intents = aiCollectIntents(game, ai, []);
    const mbNow = mbOf(game, 'B');
    const inAirWin = intents.some(
      (it) => it.playerId === mbNow && it.action === 'block' && it.tick === game.tick,
    );
    stepGame(game, intents);
    if (pending && pending.G === undefined && before.z > 0 && game.ball.z <= 0) {
      const after = { x: game.ball.x, y: game.ball.y, z: game.ball.z };
      const s = sampleAt(game, crossingPoint(before, after), inAirWin);
      if (s) Object.assign(pending, s);
    }
    if (pending && (r.possession !== 'A' || r.profile !== 'spike')) {
      if (pending.G !== undefined) rows.push(pending);
      pending = null;
    }
  }
  return rows;
}

function pct(n, d) { return d ? ((n / d) * 100).toFixed(1) : '-'; }

function stat(rows, group) {
  const g = rows.filter((r) => GROUP[r.kind] === group);
  if (!g.length) return { n: 0 };
  const tops = g.map((r) => r.topPct).sort((a, b) => a - b);
  const q50 = (key) => {
    const a = g.map((r) => r[key]).sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };
  return {
    n: g.length,
    H: pct(g.filter((r) => r.H).length, g.length),
    V: pct(g.filter((r) => r.V).length, g.length),
    G: pct(g.filter((r) => r.G).length, g.length),
    inWin: pct(g.filter((r) => r.inWin).length, g.length),
    inAirWin: pct(g.filter((r) => r.inAirWin).length, g.length),
    topP50: (tops[Math.floor(tops.length / 2)] * 100).toFixed(1),
    topFloorP50: (q50('topFloorPct') * 100).toFixed(1),
    ballYP50: q50('ballY').toFixed(2),
    vMarginP50: q50('vMargin').toFixed(2),
    apexMarginP50: q50('apexMargin').toFixed(2),
  };
}

function arm(persona) {
  const rows = [];
  for (let s = 1; s <= SETS; s += 1) rows.push(...runSet(s * 101, persona));
  return rows;
}

const arms = { read: arm('read'), commit: arm('commit') };
console.log(`=== §十 階段二 E 表新指標（${SETS} 局／臂；兩臂同 seed、只差 B 隊 blockPersona）===`);
console.log('量測時點：球心通過網面那一 tick（插值）｜G ＝ H ∧ V ＝ 驗收數');
for (const group of ['quick', 'wing', 'back']) {
  const label = { quick: '快攻（一速中路）', wing: '兩翼高球（交叉/邊線）', back: '後排攻擊' }[group];
  console.log(`\n-- 面對 ${label} --`);
  console.log('人格      樣本      H%      V%    ★G%    inWin%  inAirWin%   頂邊完成度p50%'
    + '（地板）   過網球心y   V餘裕(頂邊-球)   同球對頂點的餘裕');
  for (const p of ['read', 'commit']) {
    const s = stat(arms[p], group);
    if (!s.n) { console.log(`${p.padEnd(8)}     0`); continue; }
    console.log(
      `${p.padEnd(8)}  ${String(s.n).padStart(4)}  ${s.H.padStart(6)}  ${s.V.padStart(6)}  `
      + `${s.G.padStart(5)}  ${s.inWin.padStart(8)}  ${s.inAirWin.padStart(9)}  `
      + `${s.topP50.padStart(14)}（${s.topFloorP50}）`
      + `   ${s.ballYP50.padStart(9)}   ${s.vMarginP50.padStart(14)}   ${s.apexMarginP50.padStart(16)}`,
    );
  }
}
console.log(`\n總攻擊樣本：read ${arms.read.length}／commit ${arms.commit.length}`);
console.log('驗收（工單 §2.6-d，全無數字）：① 面對快攻 commit 的 G > read 的 G（嚴格）'
  + '｜② read 的 V 必須掉出基準｜③ 同 seed 逐值可重現');
