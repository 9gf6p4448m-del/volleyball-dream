// Phase 5 §十 階段五 —— **`commitGap`／`readGap` 的收斂前對照**（裁定書 v3 §六）
//
// ★ 為什麼要這支 ★
// 裁定書 §五 判題 4 選 (d)：本階段把 `block-persona.test.mjs` 的
// `commitGap > readGap × 1.5` **降為只保方向斷言**，收斂完成後用**實測 gap 的離散度**
// 反推倍率（≥2 SD）並補回（E-1 是階段五出場條件）。
//
// §六 又判這支「現在就補一版收斂前對照」，理由是：
//   **沒有收斂前對照，反解 2 SD 時分不出那個 SD 是本來就有的、還是收斂造出來的。**
//
// ★ 量什麼（與 `tests/block-persona.test.mjs` 逐字同源）★
//   `mbGap` ＝ 球過網那一 tick，B 隊中間攔網手與球的水平距離 |MB.x − ball.x|
//   `readGap`／`commitGap` ＝ 各臂在**兩翼攻擊**（`left`／`right`）樣本上的 **p75**
//   ——p75 是測試用的統計量，不是本檔選的。
//   本檔額外報 **mean ± SD**（E 的 2 SD 反解要用）與 n。
//
// ★ 刻意與測試逐字相同的地方（不要「順手修正」）★
//   ① `runSet` 的迴圈條件照抄測試的 `'setover'`／`'matchover'`
//      （sim 實際是 `'set_over'`／`'set_break'` ⇒ 靠 guard 收尾）。
//      **改掉會讓本對照與測試看到的樣本不同 ⇒ 失去對照意義。**
//   ② 12 個 seed 照抄，一個未換（測試檔 §102-110 的註解說明過為什麼是 12 個）。
//   ③ 統計量 p75 照抄。
//
// 跑法：node tools/phase5-blockgap-probe.mjs [局數=12]
//   無參數＝12 seeds（與測試逐字同源的對照版，勿改）；
//   E-1 反解版＝傳 40（E-2 條文「n 先訂 40 局」；前 12 個 seed 與對照版完全相同，
//   之後依同一構造式 k×101 順延——不動預設就不破壞與測試的同源性）。
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { BLOCK_PERSONA } from '../src/sim/blockRead.js';
import { isFrontRow } from '../src/sim/rotation.js';

const N_SETS = Number(process.argv[2] ?? 12);
const SEEDS = Array.from({ length: N_SETS }, (_, i) => (i + 1) * 101);
const WING = new Set(['left', 'right']);

function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

// 與 tests/block-persona.test.mjs 的 runSet 同源（只留 attacks 這一路）
function runSet(seed, persona) {
  const game = createGame({
    seed, setTarget: 25, aiProfiles: { B: { blockPersona: persona } },
  });
  const ai = createAiState();
  const attacks = [];
  let pending = null;
  let guard = 0;
  // ⚠ 照抄測試的迴圈條件（見檔頭「刻意相同」①）
  while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    if (game.phase === 'rally' && r.possession === 'A' && r.touches === 3
      && r.profile === 'spike' && !pending && ai.attackKind) {
      pending = { kind: ai.attackKind };
    }
    const zBefore = game.ball.z;
    const events = stepGame(game, aiCollectIntents(game, ai, []));
    const mb = mbOf(game, 'B');
    if (pending && zBefore > 0 && game.ball.z <= 0 && mb) {
      pending.mbGap = Math.abs(game.actors[mb].x - game.ball.x);
    }
    if (pending && (events.some((e) => e.type === 'DEAD_BALL') || r.possession !== 'A'
      || r.profile !== 'spike')) {
      if (pending.mbGap != null) attacks.push(pending);
      pending = null;
    }
  }
  return attacks;
}

const arm = (persona) => SEEDS.flatMap((s) => runSet(s, persona));
const armRead = arm(BLOCK_PERSONA.READ);
const armCommit = arm(BLOCK_PERSONA.COMMIT);

const p = (a, q) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : NaN);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
const f = (v) => (Number.isFinite(v) ? v.toFixed(3) : '－');

function report(label, all) {
  const wing = all.filter((a) => WING.has(a.kind)).map((a) => a.mbGap);
  const inReach = wing.filter((g) => g <= TUNING.BLOCK_REACH_X).length;
  console.log(`${label.padEnd(7)} n=${String(wing.length).padStart(4)}`
    + `  **p75 ${f(p(wing, 0.75))}**`
    + `  mean ${f(mean(wing))} ± SD ${f(sd(wing))}`
    + `  p25 ${f(p(wing, 0.25))}  p50 ${f(p(wing, 0.5))}  p90 ${f(p(wing, 0.9))}`
    + `  max ${f(Math.max(...wing))}`);
  console.log(`        到位率（gap ≤ BLOCK_REACH_X ${f(TUNING.BLOCK_REACH_X)}）`
    + ` ${((inReach / wing.length) * 100).toFixed(1)}%`);
  return { wing, p75: p(wing, 0.75), mean: mean(wing), sd: sd(wing) };
}

console.log('=== commitGap／readGap 收斂前對照（裁定書 v3 §六）===');
console.log(`${N_SETS} seeds、兩翼攻擊（left／right）、球過網那一 tick 的 |MB.x − ball.x|`
  + `｜攔網單人半寬現值 ${f(TUNING.BLOCK_REACH_X)}\n`);
const R = report('read', armRead);
const C = report('commit', armCommit);

console.log('\n--- 測試現行斷言的兩個量 ---');
console.log(`方向斷言 commitGap > readGap ：${f(C.p75)} > ${f(R.p75)} ⇒ `
  + `${C.p75 > R.p75 ? '✅ 成立' : '🔴 不成立'}`);
console.log(`倍率（僅供對照，本階段已降為只保方向）：commitGap ÷ readGap = `
  + `${f(C.p75 / R.p75)}（v2 的舊門檻 ×1.5）`);

console.log('\n--- E 的 2 SD 反解會用到的量（收斂後要再跑一次比對）---');
const pooledSd = Math.sqrt((R.sd ** 2 + C.sd ** 2) / 2);
console.log(`read   mean ± SD = ${f(R.mean)} ± ${f(R.sd)}`);
console.log(`commit mean ± SD = ${f(C.mean)} ± ${f(C.sd)}`);
console.log(`合併 SD = ${f(pooledSd)}｜mean 差 = ${f(C.mean - R.mean)}`
  + `＝ ${f((C.mean - R.mean) / pooledSd)} 個合併 SD`);
console.log('\n讀法：這是**收斂前**的離散度。收斂後再跑一次，才分得出新的 SD 是本來就有的');
console.log('      還是收斂造出來的（裁定書 §六 的理由）。E-2：反解倍率若 > 3 或 < 1.05 ⇒ 回報重裁。');
