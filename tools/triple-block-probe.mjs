// 「三人攔中」試玩回饋查證探針（唯讀觀測，零 sim 改動）
//
// 使用者回報：對手攔網會三人一起攔中路。本探針要分辨三種可能：
//   ① commit 人格造成 ② 攔網走位邏輯的老問題（與人格無關） ③ 只是「都起跳」而非「都跑到中間」
//
// 量測時點＝**球心通過網面（z 由正轉負）那一 tick**——沿用
// tools/phase5-block-geometry-probe.mjs 的同一個約定（那是使用者眼睛看到的那一幀）。
//
// 指標：
//   M1  攔網人數：該 tick 處於 sim 攔網窗（actor.blockUntil >= tick）的 B 隊前排人數 0/1/2/3
//       另報 AI 側口徑（該 tick 仍 emit action==='block' 的人數）——sim 窗有 48 tick 尾巴
//   M2  集中度：上述「在窗內」者彼此的 x 全距（max−min）。三人時取三人全距。
//       另報 M2b＝**全部前排三人**的 x 全距（不論有沒有跳）——這一欄才回答
//       「他們是不是真的都跑到中路」，M2 只回答「跳的人擠不擠」。
//   M3  依攻擊型態（快攻／兩翼／後排）拆 M1、M2。
//
// 臂（全部走真實路徑：careerMatchSetup → def.ai → aiProfiles.B）：
//   obsidian      曜石體中（COMMIT_ALLOWLIST 唯一成員 ⇒ blockPersona 實際為 'commit'）
//   obsidian-read 同一支曜石隊，探針端把 blockPersona 覆寫成 'read'
//                 ——**隔離人格用的對照**（隊伍屬性完全相同，只差人格）
//   white-wave    白浪高中（原始碼寫 commit，但不在白名單 ⇒ 實際 'read'）
//   black-pine    黑松實業（原生 read）
//
// 跑法：node tools/triple-block-probe.mjs [局數=40] [輸出json路徑]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isFrontRow } from '../src/sim/rotation.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { opponentById } from '../src/career/opponents.js';
import { writeFileSync } from 'node:fs';

const SETS = Number.parseInt(process.argv[2] ?? '40', 10);
const OUT = process.argv[3] ?? null;
const MAX_TICKS = 400000;

// 攻擊種類分組（沿用 block-persona-probe／phase5-block-geometry-probe 的同一張表）
const GROUP = {
  quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back',
};

const ARMS = [
  { key: 'obsidian', label: '曜石體中（白名單→commit）', oppId: 'obsidian', force: null },
  { key: 'obsidian-read', label: '曜石體中・強制 read（對照）', oppId: 'obsidian', force: 'read' },
  { key: 'white-wave', label: '白浪高中（非白名單→read）', oppId: 'white-wave', force: null },
  { key: 'black-pine', label: '黑松實業（原生 read）', oppId: 'black-pine', force: null },
];

function setupMatch(oppId, run, force) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: oppId, label: '' };
  const setup = careerMatchSetup(career, player, entry, roster, null);
  if (force) setup.aiProfiles = { ...setup.aiProfiles, B: { ...setup.aiProfiles.B, blockPersona: force } };
  return setup;
}

/** 球心通過網面（z=0）那一刻的 x——線性插值於過網前後兩個 tick。 */
function crossingX(before, after) {
  const dz = before.z - after.z;
  const f = dz === 0 ? 0 : before.z / dz;
  return before.x + (after.x - before.x) * f;
}

function spread(xs) {
  if (xs.length < 2) return null;
  return Math.max(...xs) - Math.min(...xs);
}

function runSet(setup, blockIntentSink) {
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  const rows = [];
  let pending = null;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && game.tick < MAX_TICKS) {
    const r = game.rally;
    const spiking = game.phase === 'rally' && r.possession === 'A'
      && r.touches === 3 && r.profile === 'spike';
    if (spiking && !pending && ai.attackKind) pending = { kind: ai.attackKind, everBlockIds: new Set() };
    const before = { x: game.ball.x, z: game.ball.z };
    // AI 側口徑必須在 Intent 被 sim 消費**之前**攔下來（沿用 geometry probe 的手法）；
    // 餵給 stepGame 的東西逐值不變 ⇒ 行為零變化
    const intents = aiCollectIntents(game, ai, []);
    const rotB = game.match.rotations.B;
    const blockNow = intents
      .filter((it) => it.action === 'block' && it.tick === game.tick
        && game.players[it.playerId]?.teamId === 'B')
      .map((it) => it.playerId);
    if (pending) for (const id of blockNow) pending.everBlockIds.add(id);
    stepGame(game, intents);
    if (pending && pending.n === undefined && before.z > 0 && game.ball.z <= 0) {
      const cx = crossingX(before, { x: game.ball.x, z: game.ball.z });
      const front = rotB.filter((pid) => isFrontRow(rotB, pid));
      const frontXs = front.map((pid) => game.actors[pid].x);
      const inWin = front.filter((pid) => game.actors[pid].blockUntil >= game.tick);
      const winXs = inWin.map((pid) => game.actors[pid].x);
      pending.n = inWin.length;                       // M1（sim 窗口徑）
      pending.nAi = blockNow.length;                  // M1（AI 側口徑）
      pending.nEver = pending.everBlockIds.size;      // 整波曾要求攔網的相異人數
      pending.frontN = front.length;
      pending.spreadWin = spread(winXs);              // M2
      pending.spreadFront = spread(frontXs);          // M2b
      pending.crossX = cx;
      // 在窗者離「球過網 x」的距離（p50 小＝真的擠在攻擊點上）
      pending.distP50 = winXs.length
        ? winXs.map((x) => Math.abs(x - cx)).sort((a, b) => a - b)[Math.floor(winXs.length / 2)]
        : null;
      pending.winXs = winXs.slice().sort((a, b) => a - b);
      pending.frontXs = frontXs.slice().sort((a, b) => a - b);
    }
    if (pending && (r.possession !== 'A' || r.profile !== 'spike')) {
      if (pending.n !== undefined) {
        delete pending.everBlockIds;
        rows.push(pending);
      }
      pending = null;
    }
  }
  blockIntentSink.push(game.tick);
  return rows;
}

function q(arr, p) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}

function pct(n, d) { return d ? ((n / d) * 100).toFixed(1) : '-'; }

function stat(rows) {
  if (!rows.length) return { n: 0 };
  const cnt = [0, 0, 0, 0];
  for (const r of rows) cnt[Math.min(3, r.n)] += 1;
  const cntAi = [0, 0, 0, 0];
  for (const r of rows) cntAi[Math.min(3, r.nAi)] += 1;
  const sp = rows.filter((r) => r.spreadWin != null).map((r) => r.spreadWin);
  const sp3 = rows.filter((r) => r.n >= 3 && r.spreadWin != null).map((r) => r.spreadWin);
  const spF = rows.filter((r) => r.spreadFront != null).map((r) => r.spreadFront);
  const dist = rows.filter((r) => r.distP50 != null).map((r) => r.distP50);
  return {
    n: rows.length,
    p0: pct(cnt[0], rows.length),
    p1: pct(cnt[1], rows.length),
    p2: pct(cnt[2], rows.length),
    p3: pct(cnt[3], rows.length),
    aiP3: pct(cntAi[3], rows.length),
    aiP2: pct(cntAi[2], rows.length),
    spP50: q(sp, 0.5), spP90: q(sp, 0.9),
    sp3N: sp3.length, sp3P50: q(sp3, 0.5), sp3P90: q(sp3, 0.9),
    spFP50: q(spF, 0.5), spFP90: q(spF, 0.9),
    distP50: q(dist, 0.5),
  };
}

const f2 = (v) => (v == null ? '  -  ' : v.toFixed(2));

const results = {};
const ticks = [];
for (const a of ARMS) {
  const rows = [];
  for (let s = 0; s < SETS; s += 1) rows.push(...runSet(setupMatch(a.oppId, s, a.force), ticks));
  results[a.key] = rows;
}

console.log(`=== 三人攔中查證探針（每臂 ${SETS} 局；量測時點＝球心過網那一 tick）===`);
console.log('人格實測值：'
  + ARMS.map((a) => `${a.key}=${a.force ?? opponentById(a.oppId).ai.blockPersona}`).join('  '));

const GROUPS = [['all', '全部攻擊'], ['quick', '快攻（一速中路）'], ['wing', '兩翼高球'], ['back', '後排攻擊']];
for (const [g, label] of GROUPS) {
  console.log(`\n-- ${label} --`);
  console.log('臂                          樣本   ★3人%   2人%   1人%   0人%  | AI側3人%  '
    + '| M2 在窗者x全距 p50/p90 | 三人時全距 p50/p90(n) | M2b 前排三人全距 p50/p90 | 離過網點p50');
  for (const a of ARMS) {
    const rows = g === 'all' ? results[a.key] : results[a.key].filter((r) => GROUP[r.kind] === g);
    const s = stat(rows);
    if (!s.n) { console.log(`${a.key.padEnd(16)}  0`); continue; }
    console.log(
      `${a.key.padEnd(26)} ${String(s.n).padStart(5)}  ${s.p3.padStart(6)} ${s.p2.padStart(6)} `
      + `${s.p1.padStart(6)} ${s.p0.padStart(6)}  | ${s.aiP3.padStart(8)}  `
      + `| ${f2(s.spP50).padStart(8)} /${f2(s.spP90).padStart(6)}   `
      + `| ${f2(s.sp3P50).padStart(6)} /${f2(s.sp3P90).padStart(6)} (${String(s.sp3N).padStart(4)}) `
      + `| ${f2(s.spFP50).padStart(9)} /${f2(s.spFP90).padStart(6)}     `
      + `| ${f2(s.distP50).padStart(6)}`,
    );
  }
}

// 樣本列印：快攻且三人在窗的前 5 筆，直接看三個 x
console.log('\n-- 樣本（快攻・三人在窗，各臂前 3 筆；x 已排序）--');
for (const a of ARMS) {
  const ex = results[a.key].filter((r) => GROUP[r.kind] === 'quick' && r.n >= 3).slice(0, 3);
  for (const r of ex) {
    console.log(`${a.key.padEnd(16)} 過網x=${r.crossX.toFixed(2)}  在窗x=[${r.winXs.map((x) => x.toFixed(2)).join(', ')}]`
      + `  前排x=[${r.frontXs.map((x) => x.toFixed(2)).join(', ')}]`);
  }
  if (!ex.length) console.log(`${a.key.padEnd(16)} （無快攻三人在窗樣本）`);
}

if (OUT) {
  writeFileSync(OUT, JSON.stringify({
    sets: SETS,
    arms: ARMS.map((a) => ({
      ...a, persona: a.force ?? opponentById(a.oppId).ai.blockPersona,
    })),
    tables: Object.fromEntries(GROUPS.map(([g]) => [g, Object.fromEntries(ARMS.map((a) => [
      a.key, stat(g === 'all' ? results[a.key] : results[a.key].filter((r) => GROUP[r.kind] === g)),
    ]))])),
    rows: results,
  }, null, 2), 'utf8');
  console.log(`\n完整輸出：${OUT}`);
}
