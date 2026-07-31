// 攔網分工卷 step2b 驗收探針——「攔網手的個別演進真的成立了嗎」
//
// ★ 零行為改動 ★ 只讀 `aiState.blockPlan.byPid` 與 actor 狀態，餵給 stepGame 的東西逐值不變。
//
// 跑法：node tools/block-individuation-probe.mjs [局數=40] [輸出json路徑]
//
// ── 口徑 ─────────────────────────────────────────────────
// 一波「攻擊」＝ A 隊 `TOUCH{kind:'spike'}`（同 block-marginal-probe）。守方恆為 B（曜石＝commit）。
//
// 上牆者（wall member）＝該波 B 隊前排、且在 `blockPlan.byPid` 裡有記錄、且 `cover !== true`
//   （`cover===true` ＝ step2a 裁定的「第三人回落補吊球」，本來就不該上牆）。
// 計畫快照取「本波內最後一次 `blockPlan.team==='B'` 的那一 tick」——計畫在
//   `profile !== 'spike'`／新一擊／死球時被清空（ai.js:247/290/412），最後一份就是完整的那份。
//
// M1 個別性
//   pairN        本波上牆者 >= 2 的波數（分母）
//   jtDiff%      兩名上牆者的 `jumpTick` **相異**比例（兩人都非 null 才算「都跳了」；
//                只有一人有值＝一人整波沒起跳，另計於 oneOnly%）
//   xDiff%       兩人瞄準目標 `c.x` 相異比例（|Δ| > 1e-9）
//   |Δjt| p50/p90  兩人都跳時的起跳 tick 差
//
// M2 攔網有沒有崩
//   airRate      **前排離地率**＝該波 B 前排至少一人「新起跳」的比例
//                （新起跳＝`actor.blockStartTick` 在本控球窗內被改寫，口徑同 block-marginal-probe）
//   noJump%      **該跳沒跳**＝上牆者中「球已過網、但整波 `jumpTick` 恆為 null」的人次比例
//                （另報 physNoJump%＝同一批人裡 actor 層也從未新起跳的比例）
//   kill/blockKill/dug  由事件流判（口徑照抄 block-marginal-probe）
//
// 統計：逐 seed 配對留在比較腳本（本檔輸出 per-seed 率），這裡只印彙總。
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
const OPP_ID = 'obsidian';
const GROUP = { quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back' };

function setupMatch(run) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: OPP_ID, label: '' };
  return careerMatchSetup(career, player, entry, roster, null);
}

/** 這一 tick 的 B 隊計畫快照（只複製要量的欄位）。 */
function snapPlan(ai, frontIds) {
  const plan = ai.blockPlan;
  if (!plan || plan.team !== 'B') return null;
  const out = {};
  for (const pid of Object.keys(plan.byPid)) {
    if (!frontIds.includes(pid)) continue;
    const c = plan.byPid[pid];
    out[pid] = { jumpTick: c.jumpTick ?? null, x: c.x ?? null, cover: c.cover === true, blind: c.blind === true, seen: c.seen === true };
  }
  return out;
}

function runSet(run) {
  const setup = setupMatch(run);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  const attacks = [];
  const prevStart = {};
  for (const pid of Object.keys(game.actors)) prevStart[pid] = game.actors[pid].blockStartTick;
  let jumpLog = [];
  let winStart = 0;
  let cur = null;

  const frontB = () => {
    const rot = game.match.rotations.B;
    return rot.filter((pid) => isFrontRow(rot, pid));
  };

  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const b0z = game.ball.z;
    const intents = aiCollectIntents(game, ai, []);
    // 計畫快照必須在 stepGame **之後**讀（jumpTick 由本 tick 的 aiCollectIntents 寫入，
    // 但死球會在 stepGame 內清空計畫 ⇒ 這裡取 step 前的值最完整）
    const snap = snapPlan(ai, frontB());
    const ev = stepGame(game, intents);
    const tick = game.tick;

    for (const pid of Object.keys(game.actors)) {
      const st = game.actors[pid].blockStartTick;
      if (st !== prevStart[pid]) { prevStart[pid] = st; jumpLog.push({ pid, tick }); }
    }
    if (cur && snap) cur.snap = snap;

    // ⚠ 起跳統計必須在**事件迴圈之前**結算：攔網手是在球過網**之前**跳的，而
    //   BALL_OVER_NET 事件會把控球窗往前推、洗掉那些起跳記錄（口徑同 block-marginal-probe，
    //   該檔的 crossing/nJ 區塊同樣落在 `for (const e of ev)` 之外、之前）
    const collectJumps = (a) => {
      const front = frontB();
      a.jumpIds = [...new Set(jumpLog
        .filter((j) => j.tick >= winStart && j.tick <= tick && front.includes(j.pid))
        .map((j) => j.pid))];
      a.nJ = a.jumpIds.length;
    };
    const crossed = (b0z > 0) !== (game.ball.z > 0) && b0z !== game.ball.z;
    if (crossed && cur && !cur.crossed && game.ball.z <= 0) {
      cur.crossed = true;
      collectJumps(cur);
    }

    const finalize = (a) => {
      if (a.nJ == null) collectJumps(a);
      const s = a.snap ?? {};
      const wall = Object.keys(s).filter((pid) => !s[pid].cover).sort();
      a.wallN = wall.length;
      a.planN = Object.keys(s).length;
      a.members = wall.map((pid) => ({
        pid, jumpTick: s[pid].jumpTick, x: s[pid].x, phys: a.jumpIds.includes(pid),
        blind: s[pid].blind, seen: s[pid].seen,
      }));
      if (wall.length >= 2) {
        const [p, q2] = a.members;
        a.bothJumped = p.jumpTick != null && q2.jumpTick != null;
        a.oneOnly = (p.jumpTick == null) !== (q2.jumpTick == null);
        a.jtDiff = a.bothJumped ? (p.jumpTick !== q2.jumpTick) : null;
        a.dJt = a.bothJumped ? Math.abs(p.jumpTick - q2.jumpTick) : null;
        a.xDiff = (p.x != null && q2.x != null) ? Math.abs(p.x - q2.x) > 1e-9 : null;
        a.dX = (p.x != null && q2.x != null) ? Math.abs(p.x - q2.x) : null;
      }
      attacks.push(a);
    };

    let ended = false;
    for (const e of ev) {
      if (e.type === 'BALL_OVER_NET' || e.type === 'SERVE') {
        winStart = tick; jumpLog = jumpLog.filter((j) => j.tick >= tick - 1);
      }
      if (cur && !ended) {
        if (e.type === 'BLOCK_TOUCH' && e.team === 'B') cur.bt = 1;
        else if (e.type === 'TOUCH' && e.team === 'B') { cur.out = 'dug'; finalize(cur); cur = null; ended = true; }
        else if (e.type === 'TOUCH' && e.team === 'A' && cur.crossed) {
          cur.out = cur.bt ? 'blockBack' : 'returned'; finalize(cur); cur = null; ended = true;
        } else if (e.type === 'SCORE') {
          cur.out = e.team === 'A' ? (cur.bt ? 'toolKill' : 'kill') : (cur.bt ? 'blockKill' : 'atkError');
          finalize(cur); cur = null; ended = true;
        }
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        if (cur) { cur.out = 'superseded'; finalize(cur); }
        cur = {
          tick, kind: ai.attackKind ?? null, crossed: false, bt: 0, out: null,
          snap: snapPlan(ai, frontB()) ?? null,
          jumpIds: [], nJ: null, wallN: 0, planN: 0, members: [],
          bothJumped: null, oneOnly: null, jtDiff: null, dJt: null, xDiff: null, dX: null,
        };
        ended = false;
      }
    }
  }
  if (cur) { cur.out = 'superseded'; finalize(cur); }
  return { seed: run, ticks: game.tick, attacks };
}

// ──────────────── 統計 ────────────────
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pc = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '  -  ');
const REAL = (s) => s.attacks.filter((a) => a.out !== 'superseded');

const sets = [];
for (let s = 0; s < SETS; s += 1) sets.push(runSet(s));
const all = sets.flatMap(REAL);

function agg(rows) {
  const pairs = rows.filter((a) => a.wallN >= 2);
  const both = pairs.filter((a) => a.bothJumped);
  const dJt = both.map((a) => a.dJt);
  const xs = pairs.filter((a) => a.xDiff != null);
  const wallMembers = rows.filter((a) => a.crossed).flatMap((a) => a.members);
  return {
    n: rows.length,
    pairN: pairs.length,
    bothN: both.length,
    jtDiffPct: both.length ? (both.filter((a) => a.jtDiff).length / both.length) * 100 : null,
    oneOnlyPct: pairs.length ? (pairs.filter((a) => a.oneOnly).length / pairs.length) * 100 : null,
    xDiffPct: xs.length ? (xs.filter((a) => a.xDiff).length / xs.length) * 100 : null,
    dJtP50: q(dJt, 0.5), dJtP90: q(dJt, 0.9), dJtMean: dJt.length ? mean(dJt) : null,
    dXP50: q(xs.map((a) => a.dX), 0.5), dXP90: q(xs.map((a) => a.dX), 0.9),
    airRate: rows.length ? (rows.filter((a) => a.nJ >= 1).length / rows.length) * 100 : null,
    wallMemN: wallMembers.length,
    noJumpPct: wallMembers.length
      ? (wallMembers.filter((m) => m.jumpTick == null).length / wallMembers.length) * 100 : null,
    physNoJumpPct: wallMembers.length
      ? (wallMembers.filter((m) => !m.phys).length / wallMembers.length) * 100 : null,
    kill: (rows.filter((a) => a.out === 'kill' || a.out === 'toolKill').length / rows.length) * 100,
    blockKill: (rows.filter((a) => a.out === 'blockKill').length / rows.length) * 100,
    dug: (rows.filter((a) => a.out === 'dug').length / rows.length) * 100,
    wallNAvg: rows.length ? mean(rows.map((a) => a.wallN)) : null,
  };
}

/** 逐 seed 的率（供配對比較腳本用） */
function seedSeries() {
  return sets.map((s) => {
    const rows = REAL(s);
    return { seed: s.seed, ...agg(rows) };
  });
}

const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));
const GROUPS = [['all', '全部攻擊'], ['quick', '快攻'], ['wing', '兩翼'], ['back', '後排']];

console.log(`=== 攔網個別演進探針（${SETS} 局，守方 B＝${opponentById(OPP_ID).ai.blockPersona}）===`);
console.log('\n-- M1 個別性（同一波兩名上牆者）--');
console.log('組別      攻擊數  雙人波  雙跳波 | jumpTick相異%  x相異%  | |Δjt| p50/p90/mean | |Δx| p50/p90 | 只有一人跳%');
for (const [g, label] of GROUPS) {
  const rows = g === 'all' ? all : all.filter((a) => GROUP[a.kind] === g);
  const s = agg(rows);
  console.log(`${label.padEnd(8)} ${String(s.n).padStart(6)} ${String(s.pairN).padStart(7)} ${String(s.bothN).padStart(7)} |`
    + ` ${f(s.jtDiffPct).padStart(12)}% ${f(s.xDiffPct).padStart(7)}% |`
    + ` ${String(s.dJtP50).padStart(5)}/${String(s.dJtP90).padStart(5)}/${f(s.dJtMean).padStart(6)} |`
    + ` ${f(s.dXP50, 3).padStart(6)}/${f(s.dXP90, 3).padStart(6)} | ${f(s.oneOnlyPct).padStart(6)}%`);
}

console.log('\n-- M2 攔網有沒有崩 --');
console.log('組別      攻擊數 | 前排離地率 | 該跳沒跳%(計畫層) | 該跳沒跳%(actor層) | 上牆人數均 | 得分率 | 被攔死率 | 救起率');
for (const [g, label] of GROUPS) {
  const rows = g === 'all' ? all : all.filter((a) => GROUP[a.kind] === g);
  const s = agg(rows);
  console.log(`${label.padEnd(8)} ${String(s.n).padStart(6)} | ${f(s.airRate).padStart(9)}% |`
    + ` ${f(s.noJumpPct).padStart(11)}% (n=${String(s.wallMemN).padStart(4)}) |`
    + ` ${f(s.physNoJumpPct).padStart(11)}% |`
    + ` ${f(s.wallNAvg, 2).padStart(9)} | ${f(s.kill).padStart(5)}% | ${f(s.blockKill).padStart(7)}% | ${f(s.dug).padStart(5)}%`);
}

if (OUT) {
  writeFileSync(OUT, JSON.stringify({
    sets: SETS,
    summary: Object.fromEntries(GROUPS.map(([g]) => [g,
      agg(g === 'all' ? all : all.filter((a) => GROUP[a.kind] === g))])),
    perSeed: seedSeries(),
    rows: sets.map((s) => ({ seed: s.seed, ticks: s.ticks, attacks: REAL(s) })),
  }, null, 2), 'utf8');
  console.log(`\n完整輸出：${OUT}`);
}
