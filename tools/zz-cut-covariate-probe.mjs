// 內切「逐球局面變數」相關性探針（08-07 設計可行性調查）—— **零 `src/` 改動**
//
// 問題：內切對 read 隊整體 −8.3pp，但那是**整體平均**。有沒有某些局面下它反而是對的？
// 做法：在「玩家按鈕的那個時點」（ensureFlightPlan 剛跑完、二傳尚未觸球）快照一組
//       **當下已確定且逐球變動**的量，再與這一球的結果配對，比較內切 vs 直線。
//
// 快照口徑（全部是按鈕時點就存在的量，不用任何未來值）：
//   oppFrontRoles   對方前排三人的 currentRole（哪個角色站在我的直線側）
//   oppSetterFront  對方二傳在不在前排（在＝我的直線側站的是二傳/弱攔）
//   quickInPool     我方這波攻擊池裡有沒有快攻（＝我方 MB 前排且該線 perfect）
//   passLx          一傳落點的隊伍視角 lx（偏左為負）
//   oppMidLx/OutLx  對方中間／外側攔網手在**按鈕時點**的隊伍視角 lx
//   oppMidGap       對方中間攔網手離場中央（lx 0）的絕對偏移
//   nFront          對方前排實際人數
//
// 分組沿用 inside-cut-probe.mjs 的 outcome/cov 記法（不重寫判準）。
// 用法：node tools/zz-cut-covariate-probe.mjs [局數=40] [對手=north-tech]
import { registerHooks } from 'node:module';

const SETS = Number.parseInt(process.argv[2] ?? '40', 10);
const OPP = process.argv[3] ?? 'north-tech';

const hit = { cov: 0 };
registerHooks({
  load(url, context, nextLoad) {
    const res = nextLoad(url, context);
    const norm = url.replace(/\\/g, '/');
    if (!norm.endsWith('/src/sim/game.js')) return res;
    let src = typeof res.source === 'string'
      ? res.source : Buffer.from(res.source).toString('utf8');
    const from = '  if (!inside) return false;';
    if (!src.includes(from)) throw new Error(`patch 目標消失（cov）：${from}`);
    src = src.replace(from,
      '  (globalThis.__ICP ||= {}).lastCov = { toTeam, inside };\n' + from);
    hit.cov += 1;
    return { ...res, source: src };
  },
});

const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { isFrontRow, TEAM_SIDE } = await import('../src/sim/rotation.js');
const { createCareer, createCareerPlayer, careerMatchSetup } =
  await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
const { opponentById } = await import('../src/career/opponents.js');

if (hit.cov !== 1) throw new Error(`patch 沒生效：${hit.cov}`);

const MAX_TICKS = 400000;

function snapshot(game, ai) {
  const rotB = game.match.rotations.B ?? [];
  const front = rotB.filter((pid) => isFrontRow(rotB, pid));
  const roleOf = (pid) => game.players[pid]?.currentRole ?? '?';
  const lxOf = (pid) => TEAM_SIDE.B * (game.actors[pid]?.x ?? 0);
  // 對方前排：lx 0 附近＝中間攔網手；lx 正＝他們的右前（＝我方 OH 直線側的外側攔網手）
  // ⚠ 中間攔網手一律用**角色**認人。前一版用「離中央最近的那個」＝同義反覆
  //   （選出來的人必然在中央），量到的 |lx| 恆 <0.5＝零鑑別力的桶。
  const mid = front.find((pid) => roleOf(pid) === 'middle') ?? null;
  let out = null;
  for (const pid of front) {
    if (out == null || lxOf(pid) > lxOf(out)) out = pid;
  }
  const pool = ai.approach?.routes ?? [];
  const quickInPool = pool.some((r) => r.kind === 'quick');
  const landing = ai.landing;
  return {
    oppFrontRoles: front.map(roleOf).sort().join('+'),
    oppSetterFront: front.some((pid) => roleOf(pid) === 'setter'),
    oppMiddleRole: mid ? roleOf(mid) : '?',
    oppOuterRole: out ? roleOf(out) : '?',
    oppMidLx: mid ? lxOf(mid) : null,
    oppOutLx: out ? lxOf(out) : null,
    oppOutH: out ? (game.players[out]?.height?.current ?? null) : null,
    oppMidH: mid ? (game.players[mid]?.height?.current ?? null) : null,
    nFront: front.length,
    quickInPool,
    passLx: landing ? TEAM_SIDE.A * landing.x : null,
  };
}

function runSet(run) {
  const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: OPP, label: '' };
  const setup = careerMatchSetup(career, player, entry, roster, null);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  const rows = [];
  let cur = null;
  let pend = null;     // 這一波的按鈕時點快照
  let seenFlight = -1;

  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
    guard += 1;
    const g = (globalThis.__ICP ||= {});
    g.lastCov = null;
    const intents = aiCollectIntents(game, ai, []);
    // 按鈕時點＝A 隊持球且 touches===1、且本 flight 的計畫剛建好
    const r = game.rally;
    if (r && r.possession === 'A' && r.touches === 1 && ai.flightId === r.flightId
      && seenFlight !== r.flightId && ai.approach?.team === 'A') {
      seenFlight = r.flightId;
      pend = { ...snapshot(game, ai), tier: ai.passTier };
    }
    const ev = stepGame(game, intents);
    const covRec = g.lastCov;
    if (cur && covRec && covRec.toTeam === 'B' && cur.cov === null) cur.cov = covRec.inside;

    let ended = false;
    for (const e of ev) {
      if (cur && !ended) {
        if (e.type === 'BLOCK_TOUCH' && e.team === 'B') cur.bt = 1;
        else if (e.type === 'TOUCH' && e.team === 'B') { cur.out = 'dug'; rows.push(cur); cur = null; ended = true; }
        else if (e.type === 'TOUCH' && e.team === 'A') { cur.out = cur.bt ? 'blockBack' : 'returned'; rows.push(cur); cur = null; ended = true; }
        else if (e.type === 'SCORE') {
          cur.out = e.team === 'A' ? (cur.bt ? 'toolKill' : 'kill') : (cur.bt ? 'blockKill' : 'atkError');
          rows.push(cur); cur = null; ended = true;
        }
      }
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        if (cur) { cur.out = 'superseded'; rows.push(cur); }
        cur = {
          kind: ai.attackKind ?? null,
          combo: ai.attackCombo ? ai.attackCombo.type : 'none',
          cov: null, bt: 0, out: null, ...(pend ?? {}),
        };
        ended = false;
      }
    }
  }
  if (cur) { cur.out = 'superseded'; rows.push(cur); }
  return rows;
}

const all = [];
for (let s = 0; s < SETS; s += 1) all.push(...runSet(s));
const rows = all.filter((a) => a.out !== 'superseded' && a.combo === 'none'
  && (a.kind === 'left' || a.kind === 'left_inside'));

const pct = (k, n) => (n ? (k / n) * 100 : null);
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));
function agg(rs) {
  const n = rs.length;
  const kill = rs.filter((a) => a.out === 'kill' || a.out === 'toolKill').length;
  const bad = rs.filter((a) => a.out === 'blockKill' || a.out === 'atkError').length;
  const covRows = rs.filter((a) => a.cov !== null);
  const covered = covRows.filter((a) => a.cov === true).length;
  return {
    n,
    net: n ? pct(kill, n) - pct(bad, n) : null,
    cov: pct(covered, covRows.length), covN: covRows.length,
  };
}

function split(label, keyFn) {
  const buckets = new Map();
  for (const r of rows) {
    const k = String(keyFn(r));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }
  console.log(`\n### ${label}`);
  console.log('  分桶                     內切n  內切net  內切cov |  直線n  直線net  直線cov |  Δnet(內切−直線)');
  for (const [k, rs] of [...buckets.entries()].sort()) {
    const A = agg(rs.filter((r) => r.kind === 'left_inside'));
    const B = agg(rs.filter((r) => r.kind === 'left'));
    const d = (A.net != null && B.net != null) ? A.net - B.net : null;
    console.log(`  ${k.padEnd(24)}${String(A.n).padStart(5)}${f(A.net).padStart(9)}${f(A.cov).padStart(9)} |`
      + `${String(B.n).padStart(7)}${f(B.net).padStart(9)}${f(B.cov).padStart(9)} |${f(d).padStart(12)}`);
  }
}

const opp = opponentById(OPP);
console.log(`=== 內切逐球變數相關性（對手 ${OPP}／persona=${opp.ai.blockPersona}，${SETS} 局，n=${rows.length}）===`);
const overall = { A: agg(rows.filter((r) => r.kind === 'left_inside')), B: agg(rows.filter((r) => r.kind === 'left')) };
console.log(`整體：內切 n=${overall.A.n} net=${f(overall.A.net)} cov=${f(overall.A.cov)}`
  + ` ｜ 直線 n=${overall.B.n} net=${f(overall.B.net)} cov=${f(overall.B.cov)}`
  + ` ｜ Δnet=${f(overall.A.net - overall.B.net)}pp`);

split('① 對方前排角色組合', (r) => r.oppFrontRoles ?? '?');
split('② 對方二傳是否前排', (r) => (r.oppSetterFront ? '二傳前排' : '二傳後排'));
split('③ 我方池裡有沒有快攻', (r) => (r.quickInPool ? '有快攻' : '無快攻'));
split('④ 對方中間攔網手（依角色認人）偏移 |lx|', (r) => (r.oppMidLx == null ? '中間攔網手不在前排'
  : Math.abs(r.oppMidLx) < 0.5 ? 'A 中央(<0.5)' : Math.abs(r.oppMidLx) < 1.5 ? 'B 微偏(0.5-1.5)' : 'C 大偏(>1.5)'));
split('⑧ 直線側攔網手身高', (r) => (r.oppOutH == null ? '?'
  : r.oppOutH < 1.80 ? 'A <180' : r.oppOutH < 1.88 ? 'B 180-188' : 'C >=188'));
split('⑨ 交叉表：二傳前排 × 有無快攻', (r) => `${r.oppSetterFront ? 'S前排' : 'S後排'}／${r.quickInPool ? '有快攻' : '無快攻'}`);
split('⑤ 一傳落點 lx（負＝偏左）', (r) => (r.passLx == null ? '?'
  : r.passLx < -1 ? 'A 偏左(<-1)' : r.passLx < 1 ? 'B 中央' : 'C 偏右(>1)'));
split('⑥ 對方前排人數', (r) => `${r.nFront} 人`);
split('⑦ 我方直線側的對方外側攔網手角色', (r) => r.oppOuterRole ?? '?');
