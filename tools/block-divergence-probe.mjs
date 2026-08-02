// 組合攻擊卷 段 D —— 攔網分歧量測（**零 `src/` 改動**）
//
// 用法：
//   node tools/block-divergence-probe.mjs [局數=40]
//   BD_ARMS=base            node tools/block-divergence-probe.mjs 200   # 只跑現行臂（A0/A1 用）
//   BD_ARMS=base,nosalt     node tools/block-divergence-probe.mjs 200   # 加卷六鑑別力臂
//     （nosalt＝拔掉 roll 鍵裡的 pid salt，其餘一律不動；卷六驗收 6）
//     ⚠ 舊的 `nearest`／`wide` 兩臂已退場，理由見 installHooks 開頭。
//   BD_OUT=<dir>            …                                          # 每臂各存一份 JSON
//
// ★ 零行為改動的機械保證 ★
// 本檔對 `src/` 一個位元組都不寫。反事實臂（`nearest`）用 Node 的同步模組鉤子
// （`module.registerHooks`）在**載入時改字串**——磁碟上的 src 逐行未動，patch 只活在
// 該子行程的記憶體裡。作法照抄 `tools/tactics-reach-window-probe.mjs`。
// 模組鉤子是行程層級的 ⇒ 每條臂各跑一個子行程（本檔自我 spawn）。
//
// ── 三臂 ────────────────────────────────────────────────
//   A0  base  在 `git worktree` 的 3031a2f（組合排程層上線前）跑同一支探針
//   A1  base  現行 HEAD、輸入不改
//   A2  nearest  反事實：`blockAimX` 吃 `playerId`，兩名上牆者各自對
//                「離自己最近的候選」取瞄準點（不是全隊共讀「最深的那個」）
//       ⚠ A2 改了輸入 ⇒ 軌跡發散 ⇒ **與 A1 不配對，只能比方向**。
//
// ── 口徑（沿用 tools/block-individuation-probe.mjs，逐項相同）──────
// 一波「攻擊」＝ A 隊 `TOUCH{kind:'spike'}`。守方恆為 B（曜石＝commit）。
// 上牆者＝該波 B 隊前排、在 `blockPlan.byPid` 有記錄、且 `cover !== true`。
// 計畫快照取「本波內最後一次 `blockPlan.team==='B'` 的那一 tick」。
//
// ── 段 D 新增的三層量測 ────────────────────────────────
//   決策層  `c.x`      ＝ 攔網手自己那份計畫的瞄準 x（blockPlan.byPid[pid].x）
//   落地層  `aim.x`    ＝ 同一 tick 餵給 stepGame 的 intent 的目標 x
//                        （＝ ai.js:1075 的 netSpot.x ＝ blockWallSlots 的 slot.x
//                          再套封線偏移；AI 隊無 digBias ⇒ 逐值等於 slot.x）
//                        **這是真實路徑上的值，不是重抄一份 blockWallSlots**
//   組合型別 `aiState.attackCombo?.type`（'cross'|'tandem'|'delay'|'none'）
//                        非 null ＝ 幾何三條件與骰子**全數通過**（approach.js:682-745）
//
// tick↔秒：SIM_HZ = 60 ⇒ 1 tick = 1/60 s。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = Number.parseInt(process.argv[2] ?? process.env.BD_SETS ?? '40', 10);
const ARM = process.env.BD_ARM ?? null;
const OUTDIR = process.env.BD_OUT ?? null;
const TAG = process.env.BD_TAG ?? 'arm';

// ════════════════════════════════════════════════════════
// 反事實臂的載入鉤子（只在 BD_ARM=nearest 的子行程裡裝）
// ════════════════════════════════════════════════════════
function installHooks(arm) {
  const wantNoSalt = arm.includes('nosalt');
  const wantNear = arm.includes('nearest');
  const wantWide = arm.includes('wide');
  // ★ 這兩條臂已退場（卷六必查項 3 實查）★ 它們的 patch 目標在後續幾卷被改掉了：
  //   nearest → `const x = blockCommitRead(game, atkTeam, opts)...`（段 2 換成
  //             `blockSetterTendency` 之後 grep 0 命中）
  //   wide    → `  DEPTH_LZ: 2.9,`（blockRead.js:142 現為 `APPROACH.left.lz + 0.1`）
  // 直接跑會炸在 `sub()` 的「patch 目標消失」，錯誤訊息看不出是臂過期還是 src 壞了，
  // 所以在這裡先擋下並說清楚。**兩條臂的主張本身也已被卷五實測否決**
  //（病灶不在讀取範圍／候選數，見 vol5-measurement-delivery.md:125-151），不予重建。
  if (wantNear || wantWide) {
    throw new Error(`臂 ${arm} 已退場：patch 目標在段 2／卷一之後不存在，且其假說已被卷五實測否決。`
      + '本卷的反事實臂是 `nosalt`（拔掉 roll 鍵的 pid salt）。');
  }
  const hit = { sig: 0, call: 0, build: 0, live: 0, pick: 0, tie: 0, depth: 0, salt: 0 };
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
      if (norm.endsWith('/src/sim/ai.js') && wantNoSalt) {
        // ★ 卷六驗收 6（鑑別力）：**只**拔掉 roll 鍵裡的 pid salt ★
        // 其餘一律不動——`blockerId` 照樣傳進來、`resolveX` 照樣逐 pid 求值、
        // 反作弊入參檢查照樣在。拔掉之後每名攔網手 roll 到同一個賭注 ⇒ 分歧率必須塌回去。
        // 塌不回去＝這一卷量到的分歧不是 pid salt 造成的，驗收 1 的綠燈就與因果脫鉤。
        sub('    + (blockerId == null ? 0 : idHash(blockerId)));',
          '    + 0 * (blockerId == null ? 0 : idHash(blockerId)));', 'salt');
      }
      if (norm.endsWith('/src/sim/blockRead.js') && wantWide) {
        // ⑥ 觀察窗放寬（**第二個自變數**，只在 `wide` 臂開）：
        //    DEPTH_LZ 2.9 → 4.0，讓兩翼助跑起點（lz 3.58，ai.js:1424 註解實測值）進得了候選池。
        //    這一項**不是** per-blocker，是團隊級的；擺進來是為了拆開
        //    「per-blocker 沒用」與「根本沒有第二個候選可分」兩種歸因。
        sub('  DEPTH_LZ: 2.9,', '  DEPTH_LZ: 4.0,', 'depth');
      }
      if (norm.endsWith('/src/sim/ai.js') && wantNear) {
        // ① blockAimX 吃 playerId（★本臂的全部主張：輸入 per-blocker★）
        sub('function blockAimX(game, aiState, atkTeam, persona, opts) {',
          'function blockAimX(game, aiState, atkTeam, persona, opts, __pid) {', 'sig');
        // ② commit 路徑把「我自己站哪」餵進去
        sub('  const x = blockCommitRead(game, atkTeam, opts)?.x ?? null;',
          '  const __nx = (__pid != null && game.actors[__pid]) ? game.actors[__pid].x : null;\n'
          + '  const x = blockCommitRead(game, atkTeam, { ...opts, __nearX: __nx })?.x ?? null;',
          'call');
        // ③ 兩處呼叫端補傳 playerId（兩處都在 blockPlanTargetX 內，playerId 已在 scope）
        sub('    const aim = unlocked ? blockAimX(game, aiState, atkTeam, persona, opts) : null;',
          '    const aim = unlocked ? blockAimX(game, aiState, atkTeam, persona, opts, playerId) : null;',
          'build');
        sub('    const live = blockAimX(game, aiState, atkTeam, persona, opts);',
          '    const live = blockAimX(game, aiState, atkTeam, persona, opts, playerId);', 'live');
      }
      if (norm.endsWith('/src/sim/blockRead.js') && wantNear) {
        // ④ 候選挑選：有 __nearX 時改取「離我最近」（同距時仍取較深者，決定論）
        //    ＋診斷計數：per-blocker 的輸入**只有在候選 ≥2 且 x 相異時**才可能長出分歧，
        //      所以要把「這個前提成立多少次」量出來，否則零效果無法歸因。
        sub('  let best = cands[0];\n  for (const c of cands) if (c.lz < best.lz) best = c;',
          '  let best = cands[0];\n'
          + '  for (const c of cands) if (c.lz < best.lz) best = c;\n'
          + '  if (opts.__nearX != null) {\n'
          + '    const g = (globalThis.__BDC ||= { calls: 0, multi: 0, multiX: 0, differ: 0, spread: [], nHist: {} });\n'
          + '    g.calls += 1;\n'
          + '    g.nHist[cands.length] = (g.nHist[cands.length] ?? 0) + 1;\n'
          + '    if (cands.length > 1) g.multi += 1;\n'
          + '    if (new Set(cands.map((c) => c.x)).size > 1) g.multiX += 1;\n'
          + '    let near = cands[0];\n'
          + '    for (const c of cands) {\n'
          + '      const d = Math.abs(c.x - opts.__nearX);\n'
          + '      const b = Math.abs(near.x - opts.__nearX);\n'
          + '      if (d < b || (d === b && c.lz < near.lz)) near = c;\n'
          + '    }\n'
          + '    if (Math.abs(near.x - best.x) > 1e-9) { g.differ += 1; g.spread.push(Math.abs(near.x - best.x)); }\n'
          + '    best = near;\n'
          + '  }', 'pick');
        // ⑤ 同深度的「二傳朝向」裁決在本臂關閉：離自己最近已經把平手打破了，
        //    再讓團隊級的 lean 覆寫回去等於把 per-blocker 又抹平。
        sub('  if (tie.length > 1) {', '  if (tie.length > 1 && opts.__nearX == null) {', 'tie');
      }
      return { ...res, source: src };
    },
  });
  return hit;
}

const patchHits = (ARM && ARM !== 'base') ? installHooks(ARM) : null;

// ════════════════════════════════════════════════════════
// 子行程：實測
// ════════════════════════════════════════════════════════
async function runArm() {
  const { createGame, stepGame } = await import('../src/sim/game.js');
  const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
  const { isFrontRow } = await import('../src/sim/rotation.js');
  const { createCareer, createCareerPlayer, careerMatchSetup } =
    await import('../src/career/careerState.js');
  const { buildStarterMembers } = await import('../src/career/roster.js');
  const { opponentById } = await import('../src/career/opponents.js');

  const MAX_TICKS = 400000;
  const OPP_ID = 'obsidian';
  const GROUP = { quick: 'quick', left: 'wing', right: 'wing', pipe: 'back', dball: 'back',
    cross: 'wing', tandem: 'wing' };

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
      out[pid] = {
        jumpTick: c.jumpTick ?? null,
        x: c.x ?? null,
        cover: c.cover === true,
        blind: c.blind === true,
        seen: c.seen === true,
      };
    }
    return out;
  }

  /** 同一 tick 餵給 stepGame 的 intent 目標（＝落地層，真實路徑）。 */
  function snapAim(intents, frontIds) {
    const out = {};
    for (const it of intents) {
      if (!frontIds.includes(it.playerId)) continue;
      if (!it.aim) continue;
      out[it.playerId] = { x: it.aim.x, z: it.aim.z, action: it.action ?? null };
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
      const fb = frontB();
      const snap = snapPlan(ai, fb);
      const aims = snapAim(intents, fb);
      const ev = stepGame(game, intents);
      const tick = game.tick;

      for (const pid of Object.keys(game.actors)) {
        const st = game.actors[pid].blockStartTick;
        if (st !== prevStart[pid]) { prevStart[pid] = st; jumpLog.push({ pid, tick }); }
      }
      if (cur && snap) {
        cur.snap = snap; cur.aims = aims;
        // ★ M3 的量測位置 ★ 決策層與落地層必須在**同一 tick**、且兩人真的都還在牆上
        // 才比得了。取「本波最後一個『兩名上牆者的 intent 目標都在攔網深度』的 tick」
        // ——最後一個 tick 常常已經是球落到 B 場、攔網手轉去 dig／cover 的那一刻。
        const w = Object.keys(snap).filter((pid) => !snap[pid].cover).sort();
        if (w.length >= 2) {
          const [p, q2] = w;
          const az = (pid) => aims[pid]?.z;
          const atNet = (pid) => az(pid) != null && Math.abs(Math.abs(az(pid)) - 0.6) < 1e-6;
          if (atNet(p) && atNet(q2) && snap[p].x != null && snap[q2].x != null) {
            cur.net = {
              tick,
              decP: snap[p].x, decQ: snap[q2].x,
              landP: aims[p].x, landQ: aims[q2].x,
            };
          }
        }
      }

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
        const am = a.aims ?? {};
        const wall = Object.keys(s).filter((pid) => !s[pid].cover).sort();
        a.wallN = wall.length;
        a.planN = Object.keys(s).length;
        a.members = wall.map((pid) => ({
          pid, jumpTick: s[pid].jumpTick, x: s[pid].x, phys: a.jumpIds.includes(pid),
          blind: s[pid].blind, seen: s[pid].seen,
          aimX: am[pid]?.x ?? null, aimZ: am[pid]?.z ?? null,
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
        // M3 壓平：決策層 dDec vs 落地層 dLand（同一 tick、兩人都在網前）
        if (a.net) {
          a.dDec = Math.abs(a.net.decP - a.net.decQ);
          a.dLand = Math.abs(a.net.landP - a.net.landQ);
          // 帶號差：落地層的固定肩距項會在這裡現形（|sLand − sDec| ≈ 0.55 ＝純結構）
          a.sDec = a.net.decP - a.net.decQ;
          a.sLand = a.net.landP - a.net.landQ;
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
          const combo = ai.attackCombo ?? null;
          cur = {
            tick, kind: ai.attackKind ?? null, crossed: false, bt: 0, out: null,
            combo: combo ? combo.type : 'none',
            comboMain: combo ? combo.mainId : null,
            comboPartner: combo ? combo.partnerId : null,
            atkId: ai.attackerId ?? null,
            snap: snapPlan(ai, frontB()) ?? null, aims: null, net: null,
            jumpIds: [], nJ: null, wallN: 0, planN: 0, members: [],
            bothJumped: null, oneOnly: null, jtDiff: null, dJt: null,
            xDiff: null, dX: null, dDec: null, dLand: null, sDec: null, sLand: null,
          };
          ended = false;
        }
      }
    }
    if (cur) { cur.out = 'superseded'; finalize(cur); }
    return { seed: run, ticks: game.tick, attacks };
  }

  const sets = [];
  for (let s = 0; s < SETS; s += 1) sets.push(runSet(s));
  const REAL = (s) => s.attacks.filter((a) => a.out !== 'superseded');
  const all = sets.flatMap(REAL);
  return { sets, all, REAL, GROUP, persona: opponentById(OPP_ID).ai.blockPersona };
}

// ════════════════════════════════════════════════════════
// 統計
// ════════════════════════════════════════════════════════
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
// 比例的標準誤（伯努利）
const seP = (k, n) => (n ? Math.sqrt(((k / n) * (1 - k / n)) / n) * 100 : null);
// 平均值的標準誤
const seM = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  return Math.sqrt(v / a.length);
};

function agg(rows) {
  const pairs = rows.filter((a) => a.wallN >= 2);
  const both = pairs.filter((a) => a.bothJumped);
  const dJt = both.map((a) => a.dJt);
  const xs = pairs.filter((a) => a.xDiff != null);
  const dXs = xs.map((a) => a.dX);
  const jtK = both.filter((a) => a.jtDiff).length;
  const xK = xs.filter((a) => a.xDiff).length;
  return {
    n: rows.length,
    pairN: pairs.length,
    bothN: both.length,
    jtDiffPct: both.length ? (jtK / both.length) * 100 : null,
    jtDiffSE: seP(jtK, both.length),
    xDiffPct: xs.length ? (xK / xs.length) * 100 : null,
    xDiffSE: seP(xK, xs.length),
    dJtP50: q(dJt, 0.5), dJtP90: q(dJt, 0.9), dJtMean: mean(dJt), dJtSE: seM(dJt),
    dXP50: q(dXs, 0.5), dXP90: q(dXs, 0.9), dXMean: mean(dXs), dXSE: seM(dXs),
    // M3 落地層（量測位置＝a.net：兩人都還在網前的最後一 tick）
    ...(() => {
      const nr = rows.filter((a) => a.net);
      const dec = nr.map((a) => a.dDec);
      const land = nr.map((a) => a.dLand);
      const shoulder = nr.map((a) => Math.abs(Math.abs(a.sLand - a.sDec)));
      const div = nr.filter((a) => a.dDec > 1e-9);
      const flat = nr.filter((a) => a.dDec <= 1e-9);
      const dDivDec = div.map((a) => a.dDec);
      const dDivLand = div.map((a) => a.dLand);
      const dFlatLand = flat.map((a) => a.dLand);
      const mDivDec = mean(dDivDec);
      const mDivLand = mean(dDivLand);
      const mFlatLand = mean(dFlatLand);
      return {
        netN: nr.length,
        decDiffPct: nr.length ? (div.length / nr.length) * 100 : null,
        decDiffSE: seP(div.length, nr.length),
        decP50: q(dec, 0.5), decP90: q(dec, 0.9), decMean: mean(dec), decSE: seM(dec),
        landP50: q(land, 0.5), landP90: q(land, 0.9), landMean: mean(land), landSE: seM(land),
        // 落地層扣掉決策層帶號差之後剩下的（＝blockWallSlots 的固定肩距項）
        shoulderP50: q(shoulder, 0.5), shoulderP90: q(shoulder, 0.9), shoulderMean: mean(shoulder),
        divN: div.length, flatN: flat.length,
        divDecMean: mDivDec, divDecSE: seM(dDivDec),
        divLandMean: mDivLand, divLandSE: seM(dDivLand),
        flatLandMean: mFlatLand, flatLandSE: seM(dFlatLand),
        // 增量傳遞率＝（分歧波的落地|Δ| − 未分歧波的落地|Δ|）／分歧波的決策|Δ|
        // 100% ＝ 決策層的分歧原封不動傳到落地；0% ＝ 被佈局完全吃掉
        transmitPct: (mDivDec && mDivDec > 1e-9 && mDivLand != null && mFlatLand != null)
          ? ((mDivLand - mFlatLand) / mDivDec) * 100 : null,
      };
    })(),
    oneOnlyPct: pairs.length ? (pairs.filter((a) => a.oneOnly).length / pairs.length) * 100 : null,
    airRate: rows.length ? (rows.filter((a) => a.nJ >= 1).length / rows.length) * 100 : null,
    kill: rows.length ? (rows.filter((a) => a.out === 'kill' || a.out === 'toolKill').length / rows.length) * 100 : null,
    blockKill: rows.length ? (rows.filter((a) => a.out === 'blockKill').length / rows.length) * 100 : null,
    dug: rows.length ? (rows.filter((a) => a.out === 'dug').length / rows.length) * 100 : null,
    wallNAvg: mean(rows.map((a) => a.wallN)),
  };
}

const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));

async function child() {
  const { sets, all, REAL, GROUP, persona } = await runArm();
  const GROUPS = [['all', '全部攻擊'], ['quick', '快攻'], ['wing', '兩翼'], ['back', '後排']];
  const COMBOS = [['none', '無組合'], ['cross', '交叉'], ['tandem', '夾塞'], ['delay', '時間差']];

  console.log(`\n=== [${TAG}/${ARM}] 攔網分歧探針（${SETS} 局，守方 B＝${persona}）===`);
  if (patchHits) console.log(`patch 命中：${JSON.stringify(patchHits)}`);
  const diag = globalThis.__BDC ?? null;
  if (diag) {
    const sp = diag.spread;
    console.log(`反事實臂診斷：blockCommitRead 帶 __nearX 的呼叫 ${diag.calls} 次`
      + `｜候選數分佈 ${JSON.stringify(diag.nHist)}`
      + `｜候選≥2 ${diag.multi}（${((diag.multi / diag.calls) * 100).toFixed(2)}%）`
      + `｜候選 x 相異 ${diag.multiX}（${((diag.multiX / diag.calls) * 100).toFixed(2)}%）`
      + `｜**最近≠最深** ${diag.differ}（${((diag.differ / diag.calls) * 100).toFixed(2)}%）`
      + `｜差距 mean ${sp.length ? (sp.reduce((a, b) => a + b, 0) / sp.length).toFixed(3) : '-'}`);
  }

  console.log('\n-- M1 分歧率（依攻擊型別）--');
  console.log('組別      攻擊數 雙人波 雙跳波 | jt相異%±SE   x相異%±SE  | |Δjt| p50/p90/mean | |Δx| p50/p90/mean');
  for (const [g, label] of GROUPS) {
    const rows = g === 'all' ? all : all.filter((a) => GROUP[a.kind] === g);
    const s = agg(rows);
    console.log(`${label.padEnd(8)} ${String(s.n).padStart(6)} ${String(s.pairN).padStart(6)} ${String(s.bothN).padStart(6)} |`
      + ` ${f(s.jtDiffPct).padStart(6)}±${f(s.jtDiffSE, 2).padStart(5)} ${f(s.xDiffPct).padStart(6)}±${f(s.xDiffSE, 2).padStart(5)} |`
      + ` ${String(s.dJtP50).padStart(4)}/${String(s.dJtP90).padStart(4)}/${f(s.dJtMean, 2).padStart(6)} |`
      + ` ${f(s.dXP50, 3).padStart(6)}/${f(s.dXP90, 3).padStart(6)}/${f(s.dXMean, 3).padStart(6)}`);
  }

  console.log('\n-- M2 依組合型別（★交叉／夾塞實際需要多少分歧★）--');
  console.log('型別    攻擊數 雙人波 雙跳波 | jt相異%±SE   x相異%±SE  | |Δjt| p50/p90/mean±SE | |Δx| p50/p90/mean±SE');
  for (const [c, label] of COMBOS) {
    const rows = all.filter((a) => (a.combo ?? 'none') === c);
    const s = agg(rows);
    console.log(`${label.padEnd(6)} ${String(s.n).padStart(7)} ${String(s.pairN).padStart(6)} ${String(s.bothN).padStart(6)} |`
      + ` ${f(s.jtDiffPct).padStart(6)}±${f(s.jtDiffSE, 2).padStart(5)} ${f(s.xDiffPct).padStart(6)}±${f(s.xDiffSE, 2).padStart(5)} |`
      + ` ${String(s.dJtP50).padStart(4)}/${String(s.dJtP90).padStart(4)}/${f(s.dJtMean, 2)}±${f(s.dJtSE, 2)} |`
      + ` ${f(s.dXP50, 3)}/${f(s.dXP90, 3)}/${f(s.dXMean, 3)}±${f(s.dXSE, 3)}`);
  }

  console.log('\n-- M3 壓平效應（同一 tick：決策層 |Δc.x| → 落地層 |Δaim.x|，兩人都在網前）--');
  console.log('型別    可比波 | 決策分歧%±SE | 決策|Δ| p50/p90/mean | 落地|Δ| p50/p90/mean | 肩距項 p50 | 分歧n/未分歧n | 分歧落地mean±SE | 未分歧落地mean±SE | 增量傳遞率');
  for (const [c, label] of [['ALL', '全部'], ...COMBOS]) {
    const rows = c === 'ALL' ? all : all.filter((a) => (a.combo ?? 'none') === c);
    const s = agg(rows);
    console.log(`${label.padEnd(6)} ${String(s.netN).padStart(7)} |`
      + ` ${f(s.decDiffPct).padStart(7)}±${f(s.decDiffSE, 2).padStart(5)} |`
      + ` ${f(s.decP50, 3)}/${f(s.decP90, 3)}/${f(s.decMean, 3)} |`
      + ` ${f(s.landP50, 3)}/${f(s.landP90, 3)}/${f(s.landMean, 3)} |`
      + ` ${f(s.shoulderP50, 3)} | ${String(s.divN).padStart(5)}/${String(s.flatN).padStart(5)} |`
      + ` ${f(s.divLandMean, 3)}±${f(s.divLandSE, 3)} |`
      + ` ${f(s.flatLandMean, 3)}±${f(s.flatLandSE, 3)} | ${f(s.transmitPct, 1)}%`);
  }

  console.log('\n-- 對照：攔網結果（本臂的行為後果）--');
  for (const [c, label] of [['ALL', '全部'], ...COMBOS]) {
    const rows = c === 'ALL' ? all : all.filter((a) => (a.combo ?? 'none') === c);
    const s = agg(rows);
    console.log(`${label.padEnd(6)} n=${String(s.n).padStart(5)} 前排離地率 ${f(s.airRate).padStart(5)}%`
      + ` 得分率 ${f(s.kill).padStart(5)}% 被攔死率 ${f(s.blockKill).padStart(5)}% 救起率 ${f(s.dug).padStart(5)}%`
      + ` 上牆均 ${f(s.wallNAvg, 2)}`);
  }

  if (OUTDIR) {
    fs.mkdirSync(OUTDIR, { recursive: true });
    const out = path.join(OUTDIR, `${TAG}-${ARM}-${SETS}.json`);
    fs.writeFileSync(out, JSON.stringify({
      tag: TAG, arm: ARM, sets: SETS, persona, patchHits,
      byKind: Object.fromEntries(GROUPS.map(([g]) => [g,
        agg(g === 'all' ? all : all.filter((a) => GROUP[a.kind] === g))])),
      byCombo: Object.fromEntries([['ALL', agg(all)],
        ...COMBOS.map(([c]) => [c, agg(all.filter((a) => (a.combo ?? 'none') === c))])]),
      perSeed: sets.map((s) => ({ seed: s.seed, ...agg(REAL(s)) })),
      rows: sets.map((s) => ({
        seed: s.seed,
        ticks: s.ticks,
        attacks: REAL(s).map((a) => ({
          tick: a.tick, kind: a.kind, combo: a.combo, out: a.out, wallN: a.wallN,
          dX: a.dX, dJt: a.dJt, net: a.net ?? null,
          dDec: a.dDec ?? null, dLand: a.dLand ?? null,
          members: a.members,
        })),
      })),
    }, null, 2), 'utf8');
    console.log(`\n完整輸出：${out}`);
  }
}

// ════════════════════════════════════════════════════════
// 父行程：每臂各 spawn 一個子行程
// ════════════════════════════════════════════════════════
if (ARM) {
  await child();
} else {
  const arms = (process.env.BD_ARMS ?? 'base,nosalt').split(',').map((s) => s.trim()).filter(Boolean);
  for (const arm of arms) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), String(SETS)], {
      stdio: 'inherit',
      env: { ...process.env, BD_ARM: arm },
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
