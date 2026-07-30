// §十-4 R4 款3 修復前置量測 —— 快攻帶下緣（SPIKE_CLEARANCE.quick[0]）敏感曲線探針
//
// 背景：R4 款3（快攻 commit G% − read G% margin）翻轉為 −14.6pp（lo=2.60 時）。
// Sawmah 裁定「快攻帶下緣回抬＋掃描定案」——本探針量出 margin 對下緣 lo 的敏感曲線，
// 讓主對話能選出「margin 恢復 ≥ +1.9pp 的最低 lo」。
//
// 嚴禁改動 src/ 下任何檔案落盤：本探針用 in-process 補丁
// `TUNING.SPIKE_CLEARANCE.quick = [lo, 2.7]`（ESM 模組單例，執行期改物件對同 process
// 內所有 import 生效，不落盤、不影響其他 process）。
//
// 兩段量測，各自逐字抄自既有探針（僅過濾成 quick 組、砍掉非快攻用得到的欄位）：
//   A. G%（read/commit 快攻列）—— 抄自 tools/phase5-block-geometry-probe.mjs
//   B. 快攻過網高度 p50/sd —— 抄自 tools/t10-4-ballistic-probe.mjs
// 兩段探針原文本身對 phase 結束條件寫法不同（'setover'/'matchover' 對照
// 'set_over'/'set_break'）——刻意保留原樣，不在本卷修正，以維持「同一口徑」的口徑
// 就是各自原本的口徑，不是新發明第三種口徑。
//
// 單點模式（每個 (lo,hi) 值務必各自一個 process，避免任何模組級狀態殘留污染下一輪）：
//   node tools/t10-4-quickband-sweep.mjs <lo> [hi=2.7] [局數=40]
// 隔離實驗用法（07-31 追加）：hi=lo 即可把快攻帶退化成單點（零變異），
// 用來檢驗「快攻帶的變異本身（不只下緣高度）是不是在幫 read」這個假設。
import { createGame, stepGame, TUNING, spikeSpeed } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { blockTopEdge } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';
import { heightAtNet, predictLanding } from '../src/sim/flight.js';
import { BALL, SIM_DT } from '../src/sim/constants.js';

const lo = Number(process.argv[2]);
const hi = Number(process.argv[3] ?? 2.7);
const SETS = Number(process.argv[4] ?? 40);
if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
  console.error('用法: node tools/t10-4-quickband-sweep.mjs <lo> [hi=2.7] [局數=40]');
  process.exit(1);
}

// ---- in-process 補丁（不落盤；只在本 process 生效）----
TUNING.SPIKE_CLEARANCE.quick = [lo, hi];

// ==== 部分 A：G%（抄自 tools/phase5-block-geometry-probe.mjs，僅取 quick 組）====
function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

function crossingPoint(before, after) {
  const dz = before.z - after.z;
  const f = dz === 0 ? 0 : before.z / dz;
  return { x: before.x + (after.x - before.x) * f, y: before.y + (after.y - before.y) * f };
}

function sampleAt(game, cross) {
  const mb = mbOf(game, 'B');
  if (!mb) return null;
  const p = game.players[mb];
  const actor = game.actors[mb];
  const jumpMul = staminaPerfMul(game, p);
  const inWin = actor.blockUntil >= game.tick;
  const t = inWin ? game.tick - actor.blockStartTick : null;
  const top = blockTopEdge(p, t, jumpMul);
  const H = Math.abs(actor.x - cross.x) <= TUNING.BLOCK_REACH_X;
  const V = cross.y <= top + BALL.RADIUS;
  return { H, V, G: H && V };
}

function runGSet(seed, blockPersona) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona } } });
  const ai = createAiState();
  const rows = [];
  let pending = null;
  let guard = 0;
  while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    const spiking = game.phase === 'rally' && r.possession === 'A'
      && r.touches === 3 && r.profile === 'spike';
    if (spiking && !pending && ai.attackKind) pending = { kind: ai.attackKind };
    const before = { x: game.ball.x, y: game.ball.y, z: game.ball.z };
    const intents = aiCollectIntents(game, ai, []);
    stepGame(game, intents);
    if (pending && pending.G === undefined && before.z > 0 && game.ball.z <= 0) {
      const after = { x: game.ball.x, y: game.ball.y, z: game.ball.z };
      const s = sampleAt(game, crossingPoint(before, after));
      if (s) Object.assign(pending, s);
    }
    if (pending && (r.possession !== 'A' || r.profile !== 'spike')) {
      if (pending.G !== undefined) rows.push(pending);
      pending = null;
    }
  }
  return rows;
}

function pct(n, d) { return d ? (n / d) * 100 : NaN; }

function gStat(persona) {
  const rows = [];
  for (let s = 1; s <= SETS; s += 1) rows.push(...runGSet(s * 101, persona));
  const quick = rows.filter((r) => r.kind === 'quick');
  return { n: quick.length, Gpct: pct(quick.filter((r) => r.G).length, quick.length) };
}

// ==== 部分 B：快攻過網高度 p50/sd（抄自 tools/t10-4-ballistic-probe.mjs，僅取 quick 組）====
function processSpike(game, e, preFrom, rows, ai) {
  const player = game.players[e.playerId];
  const from = { x: preFrom.x, y: preFrom.y, z: preFrom.z };
  const post = { vx: game.ball.vx, vy: game.ball.vy, vz: game.ball.vz };
  const vHit = { vx: post.vx, vy: post.vy - BALL.GRAVITY * SIM_DT, vz: post.vz };

  const speed = spikeSpeed(player) * staminaPerfMul(game, player)
    * (TUNING.TIP_SPEED_MIN + (1 - TUNING.TIP_SPEED_MIN) * e.power);
  void speed; // 部分 B 只需要 actualHeight；speed 保留供比對原探針邏輯不漏算

  const clone = { x: from.x, y: from.y, z: from.z, vx: vHit.vx, vy: vHit.vy, vz: vHit.vz };
  const landing = predictLanding(clone);
  if (!landing) return;
  const to = { x: landing.x, y: BALL.RADIUS, z: landing.z };
  if ((from.z > 0) === (to.z > 0)) return;

  const actualHeight = heightAtNet(from, vHit);
  if (actualHeight == null) return;

  rows.push({ kind: ai.attackKind, actualHeight });
}

function runBSet(seed, rows) {
  const game = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'set_break' && guard < 400000) {
    guard += 1;
    const preFrom = { x: game.ball.x, y: game.ball.y, z: game.ball.z };
    const intents = aiCollectIntents(game, ai);
    const ev = stepGame(game, intents);
    for (const e of ev) {
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        processSpike(game, e, preFrom, rows, ai);
      }
    }
  }
}

function bStat() {
  const rows = [];
  for (let s = 1; s <= SETS; s += 1) runBSet(s * 101, rows);
  const quick = rows.filter((r) => r.kind === 'quick').map((r) => r.actualHeight);
  const n = quick.length;
  const mean = n ? quick.reduce((a, b) => a + b, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(quick.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : NaN;
  const sorted = [...quick].sort((a, b) => a - b);
  const p50 = n ? sorted[Math.floor(n * 0.5)] : NaN;
  return { n, p50, sd };
}

// ==== 執行 + 輸出（單列，供外層迴圈彙整）====
const read = gStat('read');
const commit = gStat('commit');
const margin = commit.Gpct - read.Gpct;
const ball = bStat();

console.log(
  `lo=${lo.toFixed(3)}\thi=${hi.toFixed(3)}\treadG%=${read.Gpct.toFixed(1)}\tn_read=${read.n}\t`
  + `commitG%=${commit.Gpct.toFixed(1)}\tn_commit=${commit.n}\t`
  + `margin=${margin >= 0 ? '+' : ''}${margin.toFixed(1)}pp\t`
  + `快攻p50=${Number.isFinite(ball.p50) ? ball.p50.toFixed(3) : '-'}\t`
  + `sd=${Number.isFinite(ball.sd) ? ball.sd.toFixed(3) : '-'}\tn_ball=${ball.n}`,
);
