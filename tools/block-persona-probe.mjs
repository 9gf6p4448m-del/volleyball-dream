// Phase 5 W1 §6 B1 獨立驗證探針 —— read 隊 vs commit 隊的**行為差異量化**
//
// 量的是實際世界座標與實際事件，不是意圖、不是斷言：
//   兩支臂完全同一組 seed、同一套球員、同一套 AI，**只差 B 隊的 ai.blockPersona**。
//   A 隊照常進攻，逐球記錄 B 隊的牆長什麼樣子。
//
// 指標（依 A 這球的攻擊種類分組；種類是探針的**旁觀真值**，攔網 AI 讀不到）：
//   ① 牆人數：球過網那一刻，|blocker.x − ball.x| ≤ TUNING.BLOCK_REACH_X 的 B 前排人數
//      （＝sim 的 tryBlock 自己用的同一把尺——不是另編一個好看的指標）
//   ② MB 落差：B 隊中間攔網手到球過網 x 的距離（m）
//   ③ 實際攔網觸球率：本次攻擊有沒有 BLOCK_TOUCH 事件
//
// 跑法：node tools/block-persona-probe.mjs [局數=40]
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';

const SETS = Number(process.argv[2] ?? 40);

// 攻擊種類 → 分組：quick＝一速中路（commit 賭的就是這個）／wing＝兩翼高球（含交叉走位）
// ／back＝後排 pipe・D 球
const GROUP = {
  quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back',
};

function mbOf(game, team) {
  const rot = game.match.rotations[team];
  return rot.find((id) => isFrontRow(rot, id) && game.players[id].currentRole === 'middle') ?? null;
}

function wallAt(game, team) {
  const rot = game.match.rotations[team];
  const bx = game.ball.x;
  let n = 0;
  for (const id of rot) {
    if (!isFrontRow(rot, id)) continue;
    if (Math.abs(game.actors[id].x - bx) <= TUNING.BLOCK_REACH_X) n += 1;
  }
  const mb = mbOf(game, team);
  return { n, mbGap: mb ? Math.abs(game.actors[mb].x - bx) : null };
}

function runSet(seed, blockPersona) {
  const game = createGame({ seed, setTarget: 25, aiProfiles: { B: { blockPersona } } });
  const ai = createAiState();
  const rows = [];
  let pending = null;  // { kind } —— A 已出手、球還沒過網
  let guard = 0;
  while (game.phase !== 'setover' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const r = game.rally;
    const spiking = game.phase === 'rally' && r.possession === 'A'
      && r.touches === 3 && r.profile === 'spike';
    if (spiking && !pending && ai.attackKind) pending = { kind: ai.attackKind };
    const zBefore = game.ball.z;
    const events = stepGame(game, aiCollectIntents(game, ai, []));
    // 球過網那一刻量牆（tryBlock 也是在這一步判的）
    if (pending && zBefore > 0 && game.ball.z <= 0) {
      const w = wallAt(game, 'B');
      pending.wall = w.n;
      pending.mbGap = w.mbGap;
    }
    if (pending && events.some((e) => e.type === 'BLOCK_TOUCH' && e.team === 'B')) {
      pending.blocked = true;
    }
    if (pending && (events.some((e) => e.type === 'DEAD_BALL') || r.possession !== 'A'
      || r.profile !== 'spike')) {
      if (pending.wall != null) rows.push(pending);
      pending = null;
    }
  }
  return rows;
}

function stat(rows, group) {
  const g = rows.filter((r) => GROUP[r.kind] === group);
  if (!g.length) return { n: 0 };
  const wall = g.reduce((s, r) => s + r.wall, 0) / g.length;
  const gaps = g.map((r) => r.mbGap).filter((v) => v != null).sort((a, b) => a - b);
  const mbIn = g.filter((r) => r.mbGap != null && r.mbGap <= TUNING.BLOCK_REACH_X).length
    / g.filter((r) => r.mbGap != null).length;
  const blocked = g.filter((r) => r.blocked).length / g.length;
  return {
    n: g.length,
    wall: wall.toFixed(2),
    mbGapP50: gaps.length ? gaps[Math.floor(gaps.length / 2)].toFixed(2) : '-',
    mbGapP90: gaps.length ? gaps[Math.floor(gaps.length * 0.9)].toFixed(2) : '-',
    mbInRate: (mbIn * 100).toFixed(1),
    blockRate: (blocked * 100).toFixed(1),
  };
}

function arm(persona) {
  const rows = [];
  for (let s = 1; s <= SETS; s += 1) rows.push(...runSet(s * 101, persona));
  return rows;
}

const arms = { read: arm('read'), commit: arm('commit') };
console.log(`=== §6 B1 攔網人格探針（${SETS} 局／臂；兩臂同 seed、只差 B 隊 blockPersona）===`);
for (const group of ['quick', 'wing', 'back']) {
  const label = { quick: '快攻（一速中路）', wing: '兩翼高球（交叉/邊線）', back: '後排攻擊' }[group];
  console.log(`\n-- 面對 ${label} --`);
  console.log('人格      樣本   牆人數  MB落差p50  MB落差p90  MB在攔網範圍內%  實際攔到%');
  for (const p of ['read', 'commit']) {
    const s = stat(arms[p], group);
    if (!s.n) { console.log(`${p.padEnd(8)}  0`); continue; }
    console.log(
      `${p.padEnd(8)}  ${String(s.n).padStart(4)}   ${s.wall.padStart(5)}  `
      + `${s.mbGapP50.padStart(9)}  ${s.mbGapP90.padStart(9)}  `
      + `${s.mbInRate.padStart(14)}  ${s.blockRate.padStart(8)}`,
    );
  }
}
console.log(`\n總攻擊樣本：read ${arms.read.length}／commit ${arms.commit.length}`);
