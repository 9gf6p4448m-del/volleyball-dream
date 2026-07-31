// 夾塞被攔死率診斷（段 D 順帶抽到的 25.0% vs 無組合 4.7%）—— **零 `src/` 改動**
//
// 用法：
//   node tools/tandem-block-probe.mjs [局數=40]
//   TB_ARMS=pure,base                node tools/tandem-block-probe.mjs 40
//   TB_ARMS=base,h1,h2,h1h2          node tools/tandem-block-probe.mjs 400
//   TB_OUT=<dir>  TB_TAG=<tag>       …（每臂各存一份 JSON）
//
// ★ 零行為改動的機械保證 ★
// 本檔對 `src/` 一個位元組都不寫。所有 patch 走 Node 同步模組鉤子
// （`module.registerHooks`）在**載入時改字串**，只活在該子行程記憶體裡。
// 範式抄 `tools/block-divergence-probe.mjs`／`tools/tempo-routeb-probe.mjs`。
// 模組鉤子是行程層級 ⇒ 每條臂各跑一個子行程（本檔自我 spawn）。
//
// ── 五臂 ────────────────────────────────────────────────
//   pure   完全不 patch。**只用來證明 base 的儀器是惰性的**（結果須與 base 逐值相同）
//   base   **只加日誌**的儀器臂（不改任何判斷式、不消費 rng）＝ M1／M2／M4 的真實路徑
//   h1     反事實：夾塞橫向搆不到——setAimFor tandem lx 0.3 → 1.3（|Δlx| 1.3 > BLOCK_REACH_X 0.5）
//          ＋ TANDEM_LANE_M 0.6 → 1.4（否則同線判準當場失敗、夾塞歸零＝量不到東西）
//   h2     反事實：夾塞打淺一點——setAimFor tandem lz 2.0 → 1.6（起跳 2.68 → 2.28）
//          ＋ TANDEM_DEPTH_M 0.8 → 0.55（depthGap 1.0 → 0.60，仍 ≥ SEP_RADIUS 0.55 的硬下界）
//   h1h2   兩者合併
//   ⚠ h1／h2／h1h2 都改了幾何 ⇒ 軌跡與 base **完全發散**，不配對，只能比率比方向。
//
// ── 儀器（base 及所有 h 臂都掛）────────────────────────
// 只有兩個插入點，兩者都是 `globalThis` 寫入，**不改任何控制流、不呼叫 rand()**：
//   ① game.js `executeTouch` 的 TOUCH 事件前：記下這一擊的真實擊球點 `from`（球心座標）
//   ② game.js `tryBlock` 的 `if (!inside) return false;` 前：記下這一次攔網結算的
//      牆成員（id／x／手頂邊／起跳 tick／手態）、帶半寬、球的過網 x/y、接觸者與 dx
//   結果（攔死／擦手／被騙／乾淨過網）不由儀器判斷，改由事件流（BLOCK_TOUCH／
//   BLOCK_DECEIVED／SCORE）在外層對齊——**判定邏輯一行都沒有重抄**。
//
// tick↔秒：SIM_HZ = 60 ⇒ 1 tick = 1/60 s。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = Number.parseInt(process.argv[2] ?? process.env.TB_SETS ?? '40', 10);
const ARM = process.env.TB_ARM ?? null;
const OUTDIR = process.env.TB_OUT ?? null;
const TAG = process.env.TB_TAG ?? 'tb';

// ════════════════════════════════════════════════════════
// 載入鉤子
// ════════════════════════════════════════════════════════
function installHooks(arm) {
  const instrument = arm !== 'pure';
  const wantH1 = arm.includes('h1');
  const wantH2 = arm.includes('h2');
  const hit = { touch: 0, block: 0, aim: 0, lane: 0, depth: 0 };
  registerHooks({
    load(url, context, nextLoad) {
      const res = nextLoad(url, context);
      const norm = url.replace(/\\/g, '/');
      if (!norm.includes('/src/sim/')) return res;
      let src = typeof res.source === 'string'
        ? res.source : Buffer.from(res.source).toString('utf8');
      const sub = (from, to, tag) => {
        if (!src.includes(from)) throw new Error(`patch 目標消失（${tag}）：${from}`);
        src = src.replace(from, to);
        hit[tag] += 1;
      };

      if (norm.endsWith('/src/sim/game.js') && instrument) {
        // ① 擊球點（真實路徑：spikeVelocity 吃的就是這個 from）
        sub('  ev.push({\n    type: \'TOUCH\', tick: state.tick, team, playerId: player.id,',
          '  (globalThis.__TB ||= {}).lastHit = {\n'
          + '    tick: state.tick, team, pid: player.id, action: intent.action,\n'
          + '    hx: from.x, hy: from.y, hz: from.z,\n'
          + '    ax: actor.x, az: actor.z,\n'
          + '    vx: ball.vx, vy: ball.vy, vz: ball.vz,\n'
          + '  };\n'
          + '  ev.push({\n    type: \'TOUCH\', tick: state.tick, team, playerId: player.id,', 'touch');
        // ② 攔網結算快照（在幾何閘門之後、任何 rng 之前）
        sub('  const { inside, contact } = bandContact(band, b.x);\n  if (!inside) return false;',
          '  const { inside, contact } = bandContact(band, b.x);\n'
          + '  (globalThis.__TB ||= {}).lastBlock = {\n'
          + '    tick: state.tick, toTeam, inside, ballX: b.x, ballY: b.y,\n'
          + '    halfWidth: band.halfWidth,\n'
          + '    wall: members.map((m) => ({\n'
          + '      id: m.id, x: m.x, top: m.top,\n'
          + '      start: m.actor.blockStartTick, until: m.actor.blockUntil,\n'
          + '      hand: m.actor.blockHand ?? null,\n'
          + '    })),\n'
          + '    bestId: contact ? contact.id : null,\n'
          + '    bestDx: contact ? contact.dx : null,\n'
          + '    bestTop: contact ? contact.top : null,\n'
          // 全體前排（含被閘門刷掉的）＝「牆為什麼是空的」可歸因，且不重抄任何判斷式
          + '    front: Object.values(state.players)\n'
          + '      .filter((p) => p.teamId === toTeam && isFrontRowOf(state, toTeam, p.id))\n'
          + '      .map((p) => ({\n'
          + '        id: p.id, x: state.actors[p.id].x,\n'
          + '        start: state.actors[p.id].blockStartTick,\n'
          + '        until: state.actors[p.id].blockUntil,\n'
          + '        hand: state.actors[p.id].blockHand ?? null,\n'
          + '        inWall: members.some((m) => m.id === p.id),\n'
          + '      })),\n'
          + '  };\n'
          + '  if (!inside) return false;', 'block');
      }

      if (norm.endsWith('/src/sim/approach.js')) {
        if (wantH1 && wantH2) {
          sub('  if (kind === \'tandem\') return { lx: 0.3, lz: 2.0, t: 0.55 };',
            '  if (kind === \'tandem\') return { lx: 1.3, lz: 1.6, t: 0.55 };', 'aim');
        } else if (wantH1) {
          sub('  if (kind === \'tandem\') return { lx: 0.3, lz: 2.0, t: 0.55 };',
            '  if (kind === \'tandem\') return { lx: 1.3, lz: 2.0, t: 0.55 };', 'aim');
        } else if (wantH2) {
          sub('  if (kind === \'tandem\') return { lx: 0.3, lz: 2.0, t: 0.55 };',
            '  if (kind === \'tandem\') return { lx: 0.3, lz: 1.6, t: 0.55 };', 'aim');
        }
        if (wantH1) sub('export const TANDEM_LANE_M = 0.6;', 'export const TANDEM_LANE_M = 1.4;', 'lane');
        if (wantH2) sub('export const TANDEM_DEPTH_M = 0.8;', 'export const TANDEM_DEPTH_M = 0.55;', 'depth');
      }
      return { ...res, source: src };
    },
  });
  return hit;
}

// `pure` ＝**完全不裝鉤子**（連 pass-through 都不裝）＝與 npm test 走的是同一份模組
const patchHits = (ARM && ARM !== 'pure') ? installHooks(ARM) : null;

// ════════════════════════════════════════════════════════
// 子行程：實測
// ════════════════════════════════════════════════════════
async function runArm() {
  const { createGame, stepGame } = await import('../src/sim/game.js');
  const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
  const { isFrontRow } = await import('../src/sim/rotation.js');
  const ap = await import('../src/sim/approach.js');
  const { createCareer, createCareerPlayer, careerMatchSetup } =
    await import('../src/career/careerState.js');
  const { buildStarterMembers } = await import('../src/career/roster.js');
  const { opponentById } = await import('../src/career/opponents.js');

  const MAX_TICKS = 400000;
  const OPP_ID = 'obsidian';

  // 幾何自檢：本臂的夾塞四條判準還過不過（過不了＝這條臂量不到夾塞）
  const geo = ap.tandemGeometryOf('A', 'tandem', 'quick');
  const tk = ap.takeoffSpotFor('A', 'tandem', 'two');
  const qk = ap.takeoffSpotFor('A', 'quick', 'one');
  const aim = ap.setAimFor(null, 'A', null, 'tandem', 'two');
  const selfCheck = {
    geo,
    tandemAimLx: aim.lx,
    tandemAimLz: aim.lz,
    tandemTakeoff: { x: tk.x, z: tk.z },
    quickTakeoff: { x: qk.x, z: qk.z },
    LANE_M: ap.TANDEM_LANE_M,
    DEPTH_M: ap.TANDEM_DEPTH_M,
  };

  function setupMatch(run) {
    const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
    const player = createCareerPlayer('探針');
    const roster = { capacity: 12, members: buildStarterMembers() };
    const entry = { id: 'group-3', stage: 'group', opponentId: OPP_ID, label: '' };
    return careerMatchSetup(career, player, entry, roster, null);
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
    let cur = null;

    const frontB = () => {
      const rot = game.match.rotations.B;
      return rot.filter((pid) => isFrontRow(rot, pid));
    };
    /** A 隊本波跑 quick 這條線的人（誘餌，湧現式；無組合的波也有）。 */
    const quickRunner = () => {
      const routes = ai.approach?.routes;
      if (!routes) return null;
      const r = routes.find((x) => x.kind === 'quick');
      return r ? r.pid : null;
    };
    /** B 隊前排各人的計畫瞄準 x（決策層，供歸因用）。 */
    const planSnap = () => {
      const plan = ai.blockPlan;
      if (!plan || plan.team !== 'B') return null;
      const out = {};
      for (const pid of Object.keys(plan.byPid)) {
        const c = plan.byPid[pid];
        out[pid] = {
          x: c.x ?? null, jumpTick: c.jumpTick ?? null, enterTick: c.enterTick ?? null,
          jumpAt: c.jumpAt ?? null, cover: c.cover === true, blind: c.blind === true,
        };
      }
      return out;
    };
    const posOf = (pid) => {
      const a = pid ? game.actors[pid] : null;
      return a ? { x: a.x, z: a.z } : null;
    };

    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
      guard += 1;
      const b0z = game.ball.z;
      const g = (globalThis.__TB ||= {});
      g.lastHit = null;
      g.lastBlock = null;
      const intents = aiCollectIntents(game, ai, []);
      const planPre = planSnap();
      const ev = stepGame(game, intents);
      const tick = game.tick;
      const hitRec = g.lastHit;
      const blkRec = g.lastBlock;

      // 球過網（A→B）：本波攻擊的飛行時間終點
      if (cur && !cur.netTick && (b0z > 0) !== (game.ball.z > 0) && game.ball.z <= 0) {
        cur.netTick = tick;
        cur.netBallX = game.ball.x;
        cur.netBallY = game.ball.y;
      }

      // 攔網結算快照（每波只留第一次：那一次才是「這記扣球對上這面牆」）
      if (cur && blkRec && blkRec.toTeam === 'B' && !cur.blk) {
        cur.blk = {
          ...blkRec,
          plan: planPre ? Object.fromEntries(Object.entries(planPre)
            .filter(([pid]) => blkRec.wall.some((m) => m.id === pid))) : null,
          // 上帝視角（★探針特權★：AI 拿不到 attackerId，blockCommitRead 也不回 pid）
          godAtk: posOf(cur.atkId),
          godQuick: posOf(cur.quickId),
        };
      }

      let ended = false;
      for (const e of ev) {
        if (cur && !ended) {
          if (e.type === 'BLOCK_DECEIVED' && e.team === 'B') cur.deceived = e.blockerId;
          else if (e.type === 'BLOCK_TOUCH' && e.team === 'B') {
            cur.bt = 1;
            cur.btPid = e.playerId;
            cur.btZone = e.zone ?? 'body';
            cur.btGraze = e.graze === true;
            cur.btPressed = e.pressed === true;
            cur.btTick = e.tick;
          } else if (e.type === 'TOUCH' && e.team === 'B') { cur.out = 'dug'; attacks.push(cur); cur = null; ended = true; } else if (e.type === 'TOUCH' && e.team === 'A' && cur.netTick) {
            cur.out = cur.bt ? 'blockBack' : 'returned'; attacks.push(cur); cur = null; ended = true;
          } else if (e.type === 'SCORE') {
            cur.out = e.team === 'A' ? (cur.bt ? 'toolKill' : 'kill') : (cur.bt ? 'blockKill' : 'atkError');
            cur.reason = e.reason ?? null;
            attacks.push(cur); cur = null; ended = true;
          }
        }
        if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
          if (cur) { cur.out = 'superseded'; attacks.push(cur); }
          const combo = ai.attackCombo ?? null;
          const atkId = ai.attackerId ?? null;
          const qid = quickRunner();
          cur = {
            tick,
            kind: ai.attackKind ?? null,
            combo: combo ? combo.type : 'none',
            atkId,
            quickId: qid,
            partnerId: combo ? combo.partnerId : null,
            // 擊球點（真實路徑：儀器記的 from）
            hit: hitRec && hitRec.pid === atkId
              ? { x: hitRec.hx, y: hitRec.hy, z: hitRec.hz, ax: hitRec.ax, az: hitRec.az }
              : (hitRec ? { x: hitRec.hx, y: hitRec.hy, z: hitRec.hz, ax: hitRec.ax, az: hitRec.az } : null),
            quickAtHit: posOf(qid),
            wallAtHit: frontB().map((pid) => ({ pid, ...(posOf(pid) ?? {}) })),
            planAtHit: planPre,
            netTick: null, netBallX: null, netBallY: null,
            blk: null, bt: 0, btPid: null, btZone: null, btGraze: false,
            btPressed: false, btTick: null, deceived: null, out: null, reason: null,
          };
          ended = false;
        }
      }
    }
    if (cur) { cur.out = 'superseded'; attacks.push(cur); }
    return { seed: run, ticks: game.tick, attacks };
  }

  const sets = [];
  for (let s = 0; s < SETS; s += 1) sets.push(runSet(s));
  const all = sets.flatMap((s) => s.attacks.filter((a) => a.out !== 'superseded'));
  return {
    sets, all, selfCheck,
    persona: opponentById(OPP_ID).ai.blockPersona,
    REACH: (await import('../src/sim/blockBand.js')).BLOCK_HALF_WIDTH,
  };
}

// ════════════════════════════════════════════════════════
// 統計小工具
// ════════════════════════════════════════════════════════
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const seP = (k, n) => (n ? Math.sqrt(((k / n) * (1 - k / n)) / n) * 100 : null);
const seM = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  return Math.sqrt(v / a.length);
};
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));
const pct = (k, n) => (n ? (k / n) * 100 : null);

function outcomeAgg(rows) {
  const n = rows.length;
  const kill = rows.filter((a) => a.out === 'kill' || a.out === 'toolKill').length;
  const bk = rows.filter((a) => a.out === 'blockKill').length;
  // 攔死的細分：手身攔死（真攔死）vs 擦手後出界／落地（歸因給攔網但機制不同）
  const bkBody = rows.filter((a) => a.out === 'blockKill' && a.btZone === 'body').length;
  const bkGraze = rows.filter((a) => a.out === 'blockKill' && a.btZone && a.btZone !== 'body').length;
  const dug = rows.filter((a) => a.out === 'dug').length;
  const err = rows.filter((a) => a.out === 'atkError').length;
  const bb = rows.filter((a) => a.out === 'blockBack').length;
  const ret = rows.filter((a) => a.out === 'returned').length;
  const touched = rows.filter((a) => a.bt === 1).length;
  const inBand = rows.filter((a) => a.blk && a.blk.inside).length;
  const anyWall = rows.filter((a) => a.blk).length;
  return {
    n,
    killPct: pct(kill, n), killSE: seP(kill, n),
    bkPct: pct(bk, n), bkSE: seP(bk, n),
    bkBodyPct: pct(bkBody, n), bkBodySE: seP(bkBody, n),
    bkGrazePct: pct(bkGraze, n), bkGrazeSE: seP(bkGraze, n),
    dugPct: pct(dug, n), errPct: pct(err, n), bbPct: pct(bb, n), retPct: pct(ret, n),
    touchPct: pct(touched, n), touchSE: seP(touched, n),
    inBandPct: pct(inBand, anyWall), inBandSE: seP(inBand, anyWall),
    wallN: anyWall,
    // 淨得分率＝A 得分 − A 失分（被攔死＋自失誤）
    netPct: pct(kill, n) != null ? pct(kill, n) - pct(bk + err, n) : null,
  };
}

// 距離／時序聚合（只吃有攔網結算快照的波）
function geomAgg(rows, side = 1) {
  const withBlk = rows.filter((a) => a.blk);
  const dxs = withBlk.filter((a) => a.blk.bestDx != null).map((a) => a.blk.bestDx);
  // 攔死波的接觸 dx
  const kills = rows.filter((a) => a.out === 'blockKill' && a.blk && a.blk.bestDx != null);
  const killDx = kills.map((a) => a.blk.bestDx);
  // 擊球點離網（隊伍視角 lz；A 隊 side = 1 ⇒ lz = z）
  const hitLz = rows.filter((a) => a.hit).map((a) => Math.abs(a.hit.z));
  const hitY = rows.filter((a) => a.hit).map((a) => a.hit.y);
  // 擊球 → 過網 tick
  const flight = rows.filter((a) => a.netTick).map((a) => a.netTick - a.tick);
  // 攔網手可用時間：起跳 → 球過網
  const air = [];
  const budget = [];
  for (const a of withBlk) {
    const b = a.blk;
    const m = b.wall.find((w) => w.id === b.bestId) ?? b.wall[0];
    if (!m) continue;
    air.push(b.tick - m.start);
    if (a.netTick) budget.push(a.netTick - m.start);
  }
  // 攔死波：攔網手起跳 tick 相對扣球 tick（負＝先跳、正＝球打出去之後才跳）
  const jumpRel = [];
  const killAir = [];
  let killAirborne = 0;
  for (const a of kills) {
    const b = a.blk;
    const m = b.wall.find((w) => w.id === b.bestId);
    if (!m) continue;
    jumpRel.push(m.start - a.tick);
    const at = b.tick - m.start;
    killAir.push(at);
    // AIR_TICKS = 24：超過就落地了，blockTopEdge 回站立摸高（player.js:131）
    if (at >= 0 && at <= 24) killAirborne += 1;
  }
  // 牆的組成：接觸時牆上有幾個人、前排有幾個人被閘門刷掉
  const wallSize = withBlk.map((a) => a.blk.wall.length);
  const frontN = withBlk.filter((a) => a.blk.front).map((a) => a.blk.front.length);
  const expired = [];
  for (const a of withBlk) {
    if (!a.blk.front) continue;
    for (const p of a.blk.front) {
      if (!p.inWall) expired.push(p.until < a.blk.tick ? 1 : 0);
    }
  }
  const netY = withBlk.map((a) => a.blk.ballY);
  // 接觸者當下手頂邊 vs 球高（負＝球比手高但仍在球半徑內）
  const clearance = withBlk.filter((a) => a.blk.bestTop != null)
    .map((a) => a.blk.bestTop - a.blk.ballY);
  return {
    wallSizeMean: mean(wallSize), wallSizeP50: q(wallSize, 0.5),
    frontNMean: mean(frontN),
    expiredPct: expired.length ? pct(expired.filter((v) => v === 1).length, expired.length) : null,
    expiredN: expired.length,
    netYP50: q(netY, 0.5), netYMean: mean(netY),
    clearanceP50: q(clearance, 0.5), clearanceMean: mean(clearance),
    killAirbornePct: killAir.length ? pct(killAirborne, killAir.length) : null,
    blkN: withBlk.length,
    dxP50: q(dxs, 0.5), dxP90: q(dxs, 0.9), dxMean: mean(dxs), dxSE: seM(dxs),
    killN: kills.length,
    killDxP50: q(killDx, 0.5), killDxP90: q(killDx, 0.9),
    killDxMean: mean(killDx), killDxSE: seM(killDx),
    hitLzP50: q(hitLz, 0.5), hitLzMean: mean(hitLz), hitLzSE: seM(hitLz),
    hitYP50: q(hitY, 0.5), hitYMean: mean(hitY),
    flightP50: q(flight, 0.5), flightMean: mean(flight), flightSE: seM(flight), flightN: flight.length,
    airP50: q(air, 0.5), airMean: mean(air), airSE: seM(air),
    budgetP50: q(budget, 0.5), budgetMean: mean(budget), budgetSE: seM(budget),
    killJumpRelP50: q(jumpRel, 0.5), killJumpRelMean: mean(jumpRel), killJumpRelSE: seM(jumpRel),
    killJumpRelPre: jumpRel.length ? pct(jumpRel.filter((v) => v < 0).length, jumpRel.length) : null,
    killAirP50: q(killAir, 0.5), killAirMean: mean(killAir),
  };
}

// M1 歸因：攔死者「跟的是誰」
//   判準 a（上帝視角，★探針特權★）：接觸攔網手的 x 離快攻手 vs 離主攻手，誰近
//   判準 b（決策層）：他自己的計畫瞄準 x 離快攻手 vs 離主攻手，誰近
//   判準 c：他是不是牆上離快攻手最近的那一個
function attribAgg(rows) {
  const kills = rows.filter((a) => a.out === 'blockKill' && a.blk && a.blk.bestId);
  let nearQuickA = 0; let nearAtkA = 0; let tieA = 0;
  let nearQuickB = 0; let nearAtkB = 0; let tieB = 0; let planN = 0;
  let isNearestToQuick = 0; let cN = 0;
  const dQuick = []; const dAtk = []; const dPlanQuick = []; const dPlanAtk = [];
  // 擊球那一刻的距離（比 block tick 更貼近「他在跟誰」的語意）
  const hQuick = []; const hAtk = [];
  const roleTally = {};
  for (const a of kills) {
    const b = a.blk;
    const m = b.wall.find((w) => w.id === b.bestId);
    if (!m) continue;
    const gq = b.godQuick; const ga = b.godAtk;
    if (gq && ga) {
      const dq = Math.abs(m.x - gq.x);
      const da = Math.abs(m.x - ga.x);
      dQuick.push(dq); dAtk.push(da);
      if (Math.abs(dq - da) < 1e-9) tieA += 1;
      else if (dq < da) nearQuickA += 1; else nearAtkA += 1;
      // 判準 c
      let best = null;
      for (const w of b.wall) {
        const d = Math.abs(w.x - gq.x);
        if (best == null || d < best.d) best = { id: w.id, d };
      }
      if (best) { cN += 1; if (best.id === b.bestId) isNearestToQuick += 1; }
      // 判準 b
      const p = b.plan ? b.plan[b.bestId] : null;
      if (p && p.x != null) {
        planN += 1;
        const pq = Math.abs(p.x - gq.x);
        const pa = Math.abs(p.x - ga.x);
        dPlanQuick.push(pq); dPlanAtk.push(pa);
        if (Math.abs(pq - pa) < 1e-9) tieB += 1;
        else if (pq < pa) nearQuickB += 1; else nearAtkB += 1;
      }
    }
    if (a.quickAtHit && a.hit) {
      hQuick.push(Math.abs(m.x - a.quickAtHit.x));
      hAtk.push(Math.abs(m.x - a.hit.x));
    }
    roleTally[b.bestId] = (roleTally[b.bestId] ?? 0) + 1;
  }
  return {
    killN: kills.length,
    aQuick: nearQuickA, aAtk: nearAtkA, aTie: tieA,
    aQuickPct: pct(nearQuickA, nearQuickA + nearAtkA + tieA),
    bQuick: nearQuickB, bAtk: nearAtkB, bTie: tieB, planN,
    bQuickPct: pct(nearQuickB, planN),
    cNearestPct: pct(isNearestToQuick, cN), cN,
    dQuickMean: mean(dQuick), dQuickP50: q(dQuick, 0.5),
    dAtkMean: mean(dAtk), dAtkP50: q(dAtk, 0.5),
    dPlanQuickMean: mean(dPlanQuick), dPlanAtkMean: mean(dPlanAtk),
    hQuickMean: mean(hQuick), hQuickP50: q(hQuick, 0.5),
    hAtkMean: mean(hAtk), hAtkP50: q(hAtk, 0.5),
    hQuickNearPct: hQuick.length
      ? pct(hQuick.filter((v, i) => v < hAtk[i]).length, hQuick.length) : null,
    roleTally,
  };
}

// ════════════════════════════════════════════════════════
// 子行程輸出
// ════════════════════════════════════════════════════════
async function child() {
  const { sets, all, selfCheck, persona, REACH } = await runArm();
  const COMBOS = [['none', '無組合'], ['cross', '交叉'], ['tandem', '夾塞'], ['delay', '時間差']];
  const KINDS = [['right', 'right線'], ['left', 'left線'], ['quick', 'quick'], ['tandem', 'tandem線'], ['cross', 'cross線']];

  const rowsOf = (c) => (c === 'ALL' ? all : all.filter((a) => (a.combo ?? 'none') === c));
  // 對照組：無組合的 right 線（＝夾塞的同一名 OPP 沒跑戰術時）
  const noneRight = all.filter((a) => (a.combo ?? 'none') === 'none' && a.kind === 'right');

  console.log(`\n=== [${TAG}/${ARM}] 夾塞攔死診斷（${SETS} 局，守方 B＝${persona}，BLOCK_REACH_X=${REACH}）===`);
  console.log(`patch 命中：${JSON.stringify(patchHits)}`);
  console.log(`本臂夾塞幾何自檢：${JSON.stringify(selfCheck)}`);

  console.log('\n-- 總表：結果分佈（依組合型別）--');
  console.log('型別    攻擊數 | 得分%±SE  | 被攔死%±SE | └手身  | └擦手  | 自失誤% | 救起% | 淨得分% | 觸手% | 進帶%');
  for (const [c, label] of [['ALL', '全部'], ...COMBOS]) {
    const s = outcomeAgg(rowsOf(c));
    console.log(`${label.padEnd(6)} ${String(s.n).padStart(7)} |`
      + ` ${f(s.killPct).padStart(5)}±${f(s.killSE, 2).padStart(4)} |`
      + ` ${f(s.bkPct).padStart(5)}±${f(s.bkSE, 2).padStart(4)} |`
      + ` ${f(s.bkBodyPct).padStart(5)} | ${f(s.bkGrazePct).padStart(5)} |`
      + ` ${f(s.errPct).padStart(6)} | ${f(s.dugPct).padStart(5)} |`
      + ` ${f(s.netPct).padStart(6)} | ${f(s.touchPct).padStart(5)} | ${f(s.inBandPct).padStart(5)}`);
  }
  {
    const s = outcomeAgg(noneRight);
    console.log(`${'無組right'.padEnd(6)} ${String(s.n).padStart(5)} |`
      + ` ${f(s.killPct).padStart(5)}±${f(s.killSE, 2).padStart(4)} |`
      + ` ${f(s.bkPct).padStart(5)}±${f(s.bkSE, 2).padStart(4)} |`
      + ` ${f(s.bkBodyPct).padStart(5)} | ${f(s.bkGrazePct).padStart(5)} |`
      + ` ${f(s.errPct).padStart(6)} | ${f(s.dugPct).padStart(5)} |`
      + ` ${f(s.netPct).padStart(6)} | ${f(s.touchPct).padStart(5)} | ${f(s.inBandPct).padStart(5)}`);
  }

  console.log('\n-- M1 攔死者離擊球點的水平距離（dx＝球過網 x − 手中心 x；閘門是 dx ≤ ' + REACH + '）--');
  console.log('型別      有牆波 | 全部dx p50/p90/mean±SE | 攔死n | 攔死dx p50/p90/mean±SE');
  for (const [c, label] of [['ALL', '全部'], ...COMBOS]) {
    const s = geomAgg(rowsOf(c));
    console.log(`${label.padEnd(8)} ${String(s.blkN).padStart(6)} |`
      + ` ${f(s.dxP50, 3)}/${f(s.dxP90, 3)}/${f(s.dxMean, 3)}±${f(s.dxSE, 3)} |`
      + ` ${String(s.killN).padStart(5)} |`
      + ` ${f(s.killDxP50, 3)}/${f(s.killDxP90, 3)}/${f(s.killDxMean, 3)}±${f(s.killDxSE, 3)}`);
  }
  {
    const s = geomAgg(noneRight);
    console.log(`${'無組right'.padEnd(8)} ${String(s.blkN).padStart(6)} |`
      + ` ${f(s.dxP50, 3)}/${f(s.dxP90, 3)}/${f(s.dxMean, 3)}±${f(s.dxSE, 3)} |`
      + ` ${String(s.killN).padStart(5)} |`
      + ` ${f(s.killDxP50, 3)}/${f(s.killDxP90, 3)}/${f(s.killDxMean, 3)}±${f(s.killDxSE, 3)}`);
  }

  console.log('\n-- M1 歸因：攔死者跟的是誰（★上帝視角＝探針特權，AI 拿不到 attackerId★）--');
  console.log('型別      攔死n | a手位近快攻% | b計畫近快攻%(n) | c是牆上離快攻最近者% | |手−快攻| p50/mean | |手−主攻| p50/mean');
  for (const [c, label] of [['tandem', '夾塞'], ['cross', '交叉'], ['none', '無組合'], ['ALL', '全部']]) {
    const s = attribAgg(rowsOf(c));
    console.log(`${label.padEnd(8)} ${String(s.killN).padStart(5)} |`
      + ` ${f(s.aQuickPct).padStart(11)} | ${f(s.bQuickPct).padStart(9)}(${String(s.planN).padStart(4)}) |`
      + ` ${f(s.cNearestPct).padStart(18)} |`
      + ` ${f(s.dQuickP50, 3)}/${f(s.dQuickMean, 3)} | ${f(s.dAtkP50, 3)}/${f(s.dAtkMean, 3)}`);
  }
  {
    const s = attribAgg(noneRight);
    console.log(`${'無組right'.padEnd(8)} ${String(s.killN).padStart(5)} |`
      + ` ${f(s.aQuickPct).padStart(11)} | ${f(s.bQuickPct).padStart(9)}(${String(s.planN).padStart(4)}) |`
      + ` ${f(s.cNearestPct).padStart(18)} |`
      + ` ${f(s.dQuickP50, 3)}/${f(s.dQuickMean, 3)} | ${f(s.dAtkP50, 3)}/${f(s.dAtkMean, 3)}`);
  }

  console.log('\n-- M2 深度與時間 --');
  console.log('型別      n擊球 | 擊球離網lz p50/mean±SE | 擊球高y p50 | 擊球→過網tick p50/mean±SE | 接觸時滯空tick p50/mean | 起跳→過網tick p50/mean');
  for (const [c, label] of [['ALL', '全部'], ...COMBOS]) {
    const s = geomAgg(rowsOf(c));
    console.log(`${label.padEnd(8)} ${String(s.flightN).padStart(6)} |`
      + ` ${f(s.hitLzP50, 3)}/${f(s.hitLzMean, 3)}±${f(s.hitLzSE, 3)} |`
      + ` ${f(s.hitYP50, 2).padStart(10)} |`
      + ` ${f(s.flightP50, 0)}/${f(s.flightMean, 2)}±${f(s.flightSE, 2)} |`
      + ` ${f(s.airP50, 0)}/${f(s.airMean, 2)} |`
      + ` ${f(s.budgetP50, 0)}/${f(s.budgetMean, 2)}`);
  }
  for (const [k, label] of KINDS) {
    const rows = all.filter((a) => a.kind === k);
    if (!rows.length) continue;
    const s = geomAgg(rows);
    console.log(`${('  ' + label).padEnd(8)} ${String(s.flightN).padStart(6)} |`
      + ` ${f(s.hitLzP50, 3)}/${f(s.hitLzMean, 3)}±${f(s.hitLzSE, 3)} |`
      + ` ${f(s.hitYP50, 2).padStart(10)} |`
      + ` ${f(s.flightP50, 0)}/${f(s.flightMean, 2)}±${f(s.flightSE, 2)} |`
      + ` ${f(s.airP50, 0)}/${f(s.airMean, 2)} |`
      + ` ${f(s.budgetP50, 0)}/${f(s.budgetMean, 2)}`);
  }

  console.log('\n-- M4 攔死時攔網手已經跳了嗎（起跳 tick − 扣球 tick；負＝球被打出去之前就跳了）--');
  console.log('型別      攔死n | 起跳相對扣球 p50/mean±SE | 先跳% | 接觸時已滯空 p50/mean');
  for (const [c, label] of [['ALL', '全部'], ...COMBOS]) {
    const s = geomAgg(rowsOf(c));
    console.log(`${label.padEnd(8)} ${String(s.killN).padStart(5)} |`
      + ` ${f(s.killJumpRelP50, 0)}/${f(s.killJumpRelMean, 2)}±${f(s.killJumpRelSE, 2)} |`
      + ` ${f(s.killJumpRelPre).padStart(5)} |`
      + ` ${f(s.killAirP50, 0)}/${f(s.killAirMean, 2)}`);
  }
  {
    const s = geomAgg(noneRight);
    console.log(`${'無組right'.padEnd(8)} ${String(s.killN).padStart(5)} |`
      + ` ${f(s.killJumpRelP50, 0)}/${f(s.killJumpRelMean, 2)}±${f(s.killJumpRelSE, 2)} |`
      + ` ${f(s.killJumpRelPre).padStart(5)} |`
      + ` ${f(s.killAirP50, 0)}/${f(s.killAirMean, 2)}`);
  }

  console.log('\n-- 牆的組成與球過網高度（診斷：為什麼有些線根本碰不到牆）--');
  console.log('型別      有牆波 | 進帶% | 牆上人數 p50/mean | 前排均 | 被刷掉者中「窗過期」% (n) | 過網球高 p50/mean | 手頂邊−球高 p50');
  for (const [c, label] of [['ALL', '全部'], ...COMBOS]) {
    const rows = rowsOf(c);
    const s = geomAgg(rows); const o = outcomeAgg(rows);
    console.log(`${label.padEnd(8)} ${String(s.blkN).padStart(6)} | ${f(o.inBandPct).padStart(5)} |`
      + ` ${f(s.wallSizeP50, 0)}/${f(s.wallSizeMean, 2)} | ${f(s.frontNMean, 2)} |`
      + ` ${f(s.expiredPct).padStart(6)}(${String(s.expiredN).padStart(5)}) |`
      + ` ${f(s.netYP50, 2)}/${f(s.netYMean, 2)} | ${f(s.clearanceP50, 3)}`);
  }
  {
    const s = geomAgg(noneRight); const o = outcomeAgg(noneRight);
    console.log(`${'無組right'.padEnd(8)} ${String(s.blkN).padStart(6)} | ${f(o.inBandPct).padStart(5)} |`
      + ` ${f(s.wallSizeP50, 0)}/${f(s.wallSizeMean, 2)} | ${f(s.frontNMean, 2)} |`
      + ` ${f(s.expiredPct).padStart(6)}(${String(s.expiredN).padStart(5)}) |`
      + ` ${f(s.netYP50, 2)}/${f(s.netYMean, 2)} | ${f(s.clearanceP50, 3)}`);
  }
  console.log('\n-- M4 補：攔死時接觸者真的在空中嗎（airT ≤ AIR_TICKS 24 ＝手在跳躍弧上）--');
  for (const [c, label] of [['ALL', '全部'], ...COMBOS]) {
    const s = geomAgg(rowsOf(c));
    console.log(`${label.padEnd(8)} 攔死n=${String(s.killN).padStart(4)} 在空中% ${f(s.killAirbornePct).padStart(6)}`);
  }
  {
    const s = geomAgg(noneRight);
    console.log(`${'無組right'.padEnd(8)} 攔死n=${String(s.killN).padStart(4)} 在空中% ${f(s.killAirbornePct).padStart(6)}`);
  }

  // 指紋 ① 行為面（**不含儀器欄位**）：pure 與 base 必須逐值相同＝儀器惰性的機械證明
  const bfp = crypto.createHash('sha256').update(JSON.stringify(sets.map((s) => ({
    seed: s.seed, ticks: s.ticks,
    a: s.attacks.map((a) => [a.tick, a.kind, a.combo, a.out, a.bt, a.btZone, a.netTick,
      a.atkId, a.quickId, a.partnerId, a.reason]),
  })))).digest('hex').slice(0, 16);
  // 指紋 ② 全欄位（含儀器）：同臂重跑兩次必須相同＝決定論
  const fp = crypto.createHash('sha256').update(JSON.stringify(sets.map((s) => ({
    seed: s.seed, ticks: s.ticks,
    a: s.attacks.map((a) => [a.tick, a.kind, a.combo, a.out, a.bt, a.btZone,
      a.blk ? Math.round((a.blk.bestDx ?? -1) * 1e6) : null, a.netTick,
      a.hit ? Math.round(a.hit.z * 1e6) : null]),
  })))).digest('hex').slice(0, 16);
  console.log(`\n行為指紋（不含儀器）sha256[0:16] = ${bfp}`);
  console.log(`決定論指紋（含儀器）sha256[0:16] = ${fp}`);

  if (OUTDIR) {
    fs.mkdirSync(OUTDIR, { recursive: true });
    const out = path.join(OUTDIR, `${TAG}-${ARM}-${SETS}.json`);
    const summary = {
      tag: TAG, arm: ARM, sets: SETS, persona, patchHits, selfCheck, REACH,
      fingerprint: fp, behaviorFingerprint: bfp,
      byCombo: Object.fromEntries([['ALL', {
        outcome: outcomeAgg(all), geom: geomAgg(all), attrib: attribAgg(all),
      }], ...COMBOS.map(([c]) => [c, {
        outcome: outcomeAgg(rowsOf(c)), geom: geomAgg(rowsOf(c)), attrib: attribAgg(rowsOf(c)),
      }])]),
      noneRight: {
        outcome: outcomeAgg(noneRight), geom: geomAgg(noneRight), attrib: attribAgg(noneRight),
      },
      byKind: Object.fromEntries(KINDS.map(([k]) => {
        const rows = all.filter((a) => a.kind === k);
        return [k, { outcome: outcomeAgg(rows), geom: geomAgg(rows) }];
      })),
    };
    fs.writeFileSync(out, JSON.stringify(summary, null, 2), 'utf8');
    // 原始列（夾塞與無組 right 全留，其餘只留攔死波，控檔案大小）
    const keep = all.filter((a) => a.combo === 'tandem'
      || (a.combo === 'none' && a.kind === 'right') || a.out === 'blockKill');
    fs.writeFileSync(path.join(OUTDIR, `${TAG}-${ARM}-${SETS}-rows.json`),
      JSON.stringify(keep, null, 1), 'utf8');
    console.log(`完整輸出：${out}`);
  }
}

// ════════════════════════════════════════════════════════
// 父行程：每臂各 spawn 一個子行程
// ════════════════════════════════════════════════════════
if (ARM) {
  await child();
} else {
  const arms = (process.env.TB_ARMS ?? 'pure,base,h1,h2,h1h2').split(',').map((s) => s.trim()).filter(Boolean);
  for (const arm of arms) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), String(SETS)], {
      stdio: 'inherit',
      env: { ...process.env, TB_ARM: arm },
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
