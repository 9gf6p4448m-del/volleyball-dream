// 「組合攻擊卷」門 3（補量）—— route B（改 §三 A1 對二速的起跳定義）值不值得做？
//
// 用法：node tools/tempo-routeb-probe.mjs
//       ROUTEB_OUT=<dir> node tools/tempo-routeb-probe.mjs    # 另存 JSON/TXT
//       ROUTEB_SETS=8   node tools/tempo-routeb-probe.mjs     # 縮短樣本（除錯用）
//
// ★ 零行為改動 ★
// 本檔對 `src/` **一個位元組都不寫**。所有對照臂靠 Node 24 的同步模組鉤子
// （`module.registerHooks`）在**載入時改字串**達成——磁碟上的 src 逐行未動，
// patch 只活在該子行程的記憶體裡（作法照抄 tools/tactics-reach-window-probe.mjs）。
// 模組鉤子是行程層級的 ⇒ 每條臂各跑一個子行程（本檔自我 spawn）。
//
// ── 座標軸 ──────────────────────────────────────────────
//   模型軸  plane   現行 `predictContactPoint(ball, AI.SPIKE_APPROACH_Y=2.9)` 規劃擊球點
//           sphere  ＝ route A 的 patch（等同上一輪的 `sphere-full` 臂）：
//                   ① hitPoint 規劃改吃 reach.js 可及球體頂端
//                   ② AI 觸球意圖閘改吃真實 3D 球體相交（取消 vy<0 與平面上限）
//                   ③ 扣球高度上限解除（最終仍由 game.js 的 ballInReach 判）
//   時序軸  lead=3  現行 `TEMPO.two.takeoffLead = 3`（二傳觸球前 3 tick 起跳）
//           lead=L  route B 固定值掃描（L ∈ 0,-10,-20,-30,-40；負值＝觸球**後**起跳）
//           dyn     route B 動態反推：由「二傳觸球→預估擊球 tick」倒推，
//                   讓擊球落在滯空窗**中段**（takeoff = 預估擊球 − AIR_TICKS/2）
//                   兩段式，兩段都走真實引擎函式、不重刻公式：
//                     ① 規劃期（touches===1）：用 `velocityForApex`（真函式）造出
//                        「二傳將要送出的那條 shoot 弧線」的假想球，再用
//                        `predictContactPoint`（真函式）算飛行 tick
//                     ② 二傳實際觸球（touches===2）：改吃 AI 自己算的
//                        `aiState.hitPoint.ticks`（真實球的預測值）重新校時
//
//   另有一條 `real` 臂＝**零 patch**（TEMPO_TWO_RATE 仍為 0、二速停派）：
//   ① 它是唯一的真實路徑數字 ② 拿它的三速罰站數字與 `tools/tempo-probe.mjs` ③
//   交叉驗證本檔的量測口徑（同 STILL_EPS/STALL_TICKS 定義）。
//
// ── 每格輸出 ────────────────────────────────────────────
//   罰站率        擊球前**連續靜止** ≥ 30 tick（0.5s @60Hz）的比例＋ p50/p90
//                 （口徑與 tools/tempo-probe.mjs ③ 完全相同）
//   起跳→擊球     g.tick − route.takeoffTick 的 p50/p90/max ＋落在 [0,AIR_TICKS] 的比例
//   二傳觸球→擊球 g.tick − 二傳實際觸球 tick 的 p50（彈道沒動⇒四格應幾乎不變）
//   n             每格每臂的樣本數（含「計畫了卻整波沒扣成」的計數）
//   節奏可辨識度  一/二/三速的起跳 tick（相對二傳觸球）四分位——**兩種量法**：
//                 planned＝route.takeoffTick − 實際觸球 tick（sim 的規劃值）
//                 phys   ＝擊球 tick − 罰站 tick（人真的停下來那一刻；攔網手看得到的）
//
// tick↔秒：`src/sim/constants.js` SIM_HZ = 60 ⇒ 1 tick = 1/60 s（0.5s = 30 tick）。
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIM = path.resolve(HERE, '../src/sim');
const SETS = Number(process.env.ROUTEB_SETS ?? 40);
const STILL_EPS = 0.005;   // 單 tick 位移小於此＝站著不動（同 tempo-probe）
const STALL_TICKS = 30;    // 0.5s @ 60Hz

const LEADS = ['3', '0', '-10', '-20', '-30', '-40', 'dyn'];
const MODELS = ['plane', 'sphere', 'sphereMid'];
const ARMS = ['real'];
for (const m of MODELS) for (const l of LEADS) ARMS.push(`${m}:${l}`);

// ════════════════════════════════════════════════════════
// 子行程：載入鉤子 ＋ 實測
// ════════════════════════════════════════════════════════
const ARM = process.env.ROUTEB_ARM;

function parseArm(arm) {
  if (arm === 'real') return { model: 'plane', lead: '3', open: false };
  const [model, lead] = arm.split(':');
  return { model, lead, open: true };
}

function installHooks(arm) {
  const { model, lead, open } = parseArm(arm);
  const sphere = model === 'sphere' || model === 'sphereMid';
  const top = model === 'sphere';   // 規劃用擊球高度＝球體頂端（sphere）／手點（sphereMid）
  const dyn = lead === 'dyn';
  const fixedLead = !dyn && lead !== '3' ? Number(lead) : null;
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
      };
      if (norm.endsWith('/src/sim/approach.js')) {
        if (open) {
          // 二速停派解封（除 real 臂外都要，否則無二速樣本）
          sub('export const TEMPO_TWO_RATE = 0;',
            'export const TEMPO_TWO_RATE = 0.35;', 'tempo');
        }
        if (fixedLead !== null) {
          // route B（a）固定值掃描：只動「二速幾時起跳」的語意，彈道與禁區常數不碰
          sub('  two: { takeoffLead: 3 },',
            `  two: { takeoffLead: ${fixedLead} },`, 'lead');
        }
      }
      if (norm.endsWith('/src/sim/ai.js')) {
        // ── route A（球體模型）──
        if (sphere) {
          sub('    aiState.hitPoint = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);',
            '    aiState.hitPoint = __probePlanHitPoint(game, aiState);', 'plan');
          sub('      inReach = dist <= aiReachFor(player, r.touches) * AI.ATTEMPT_RADIUS && ball.vy < 0;',
            '      inReach = r.touches >= 2\n'
            + '        ? __probeSphereGate(game, player, actor, ball)\n'
            + '        : dist <= aiReachFor(player, r.touches) * AI.ATTEMPT_RADIUS && ball.vy < 0;',
            'gate');
          sub("  if (action === 'spike') return spikeReach(player);",
            "  if (action === 'spike') return Infinity;", 'ceiling');
        }
        // ── route B（b）動態反推：規劃期 provisional ＋ 二傳觸球時 refine ──
        if (dyn) {
          sub(`      }),
    };`, `      }),
    };
    __probeRetimeTwo(game, aiState, team, setTick);`, 'retime');
        }
        {
          // 診斷（純讀取、零行為改動）：記錄第三擊規劃期的 hitPoint 預估飛行 tick，
          // 用來查「樣本歸零」是不是 predictContactPoint 回退成地板落點造成的
          const anchor = sphere
            ? '    aiState.hitPoint = __probePlanHitPoint(game, aiState);'
            : '    aiState.hitPoint = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);';
          sub(anchor, `${anchor}\n    __probeLogHit(game, aiState);${dyn ? '\n    __probeRefineTwo(game, aiState);' : ''}`, 'diag');
        }
        {
          src += `
// ==== 探針注入（tools/tempo-routeb-probe.mjs）====
import { reachVolumeFor as __pReachVolumeFor, ballInReach as __pBallInReach } from './reach.js';
import { velocityForApex as __pVelocityForApex } from './flight.js';
import { AIR_TICKS as __pAIR } from './approach.js';
const __P_SPHERE = ${sphere};
const __P_TOP = ${top};
const __P_DYN = ${dyn};
// 這名球員的「規劃用擊球高度」：
//   plane      2.9 平面（現行）
//   sphere     可及球體**頂端**（上一輪 sphere-full 的定義）
//   sphereMid  可及球體**心**＝手點 spikeReach（頂端高過二速弧頂 4.2 ⇒ 規劃會回退成
//              地板落點，見 ④-b；本臂是「不回退」的 route A 版本）
function __probeContactY(game, p) {
  if (!__P_SPHERE || !p) return AI.SPIKE_APPROACH_Y;
  const hand = spikeReach(p, staminaPerfMul(game, p));
  return __P_TOP
    ? hand + reachRadiusFor(REACH_ACTION.SPIKE, TUNING, p.height.current) + BALL.RADIUS
    : hand;
}
function __probePlanHitPoint(game, aiState) {
  const p = game.players[aiState.attackerId];
  if (!p) return predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
  return predictContactPoint(game.ball, __probeContactY(game, p));
}
function __probeSphereGate(game, player, actor, ball) {
  const vol = __pReachVolumeFor({
    player, actor, action: 'spike', jump: false,
    jumpMul: staminaPerfMul(game, player), tuning: TUNING, inflate: BALL.RADIUS,
  });
  return __pBallInReach(ball, vol).ok;
}
// 規劃期（touches===1）：用真函式造出「二傳將要送出的那條 shoot 弧線」的假想球，
// 算出飛行 tick，再讓起跳落在「預估擊球 − AIR_TICKS/2」＝擊球落在滯空窗中段
function __probeRetimeTwo(game, aiState, team, setTick) {
  if (!__P_DYN || setTick == null) return;
  const routes = aiState.approach?.routes ?? [];
  const setterH = game.players[aiState.claimId]?.height?.current;
  const cp = aiState.setContactPoint;
  if (!cp || !Number.isFinite(setterH)) return;
  const from = { x: cp.x, y: SET_HANDPOINT_H_RATIO * setterH, z: cp.z };
  for (const rt of routes) {
    if (rt.tempo !== 'two') continue;
    const aim = setAimFor(game, team, rt.pid, rt.kind, 'two');
    const w = localToWorld(team, aim.lx, aim.lz);
    const v = __pVelocityForApex(from, { x: w.x, y: BALL.RADIUS, z: w.z }, TUNING.SHOOT_APEX);
    if (!v || !Number.isFinite(v.vy)) continue;
    const hp = predictContactPoint(
      { x: from.x, y: from.y, z: from.z, vx: v.vx, vy: v.vy, vz: v.vz },
      __probeContactY(game, game.players[rt.pid]),
    );
    if (hp?.ticks == null) continue;
    const tk = setTick + hp.ticks - Math.round(__pAIR / 2);
    rt.__probeProvFlight = hp.ticks;
    rt.__probeProv = tk;
    rt.takeoffTick = tk;
    rt.startTick = tk - rt.runTicks;
    rt.settleTick = tk + __pAIR;
  }
}
// 二傳實際觸球那一 tick：改吃 AI 自己算出的真實球 hitPoint.ticks 重新校時
// 診斷：純讀取，不改任何狀態
globalThis.__probeHitLog = globalThis.__probeHitLog ?? [];
function __probeLogHit(game, aiState) {
  const rt = approachRouteOf(aiState.approach?.routes ?? null, aiState.attackerId);
  if (!rt) return;
  const p = game.players[aiState.attackerId];
  const b = game.ball;
  const land = predictLanding(b);
  const apex = b.y + (b.vy > 0 ? -(b.vy * b.vy) / (2 * BALL.GRAVITY) : 0);
  globalThis.__probeHitLog.push({
    kind: rt.kind,
    tempo: rt.tempo,
    ticks: aiState.hitPoint?.ticks ?? null,
    landTicks: land?.ticks ?? null,
    contactY: Math.round(__probeContactY(game, p) * 100) / 100,
    apex: Math.round(apex * 100) / 100,
  });
}
function __probeRefineTwo(game, aiState) {
  if (!__P_DYN) return;
  const rt = approachRouteOf(aiState.approach?.routes ?? null, aiState.attackerId);
  if (!rt || rt.tempo !== 'two' || aiState.hitPoint?.ticks == null) return;
  const tk = game.tick + aiState.hitPoint.ticks - Math.round(__pAIR / 2);
  rt.__probeDelta = tk - (rt.__probeProv ?? tk);
  rt.__probeRefFlight = aiState.hitPoint.ticks;
  rt.takeoffTick = tk;
  rt.startTick = tk - rt.runTicks;
  rt.settleTick = tk + __pAIR;
}
`;
        }
      }
      return { ...res, source: src };
    },
  });
}

async function runArm(arm) {
  installHooks(arm);
  const u = (f) => pathToFileURL(path.join(SIM, f)).href;
  const { createGame, stepGame, TUNING } = await import(u('game.js'));
  const { createAiState, aiCollectIntents } = await import(u('ai.js'));
  const { AIR_TICKS, TEMPO, TEMPO_TWO_RATE } = await import(u('approach.js'));
  const { isBackRow } = await import(u('rotation.js'));

  const buckets = {};
  const B = (k) => (buckets[k] ??= {
    takeoffToHit: [], setToHit: [], still: [], plannedRel: [], physRel: [],
    runTicks: [], dynDelta: [], provFlight: [], refFlight: [],
  });
  const planned = {};   // `${kind}/${tempo}` → 第三擊窗口開啟時被指派的次數
  const noSpike = {};   // `${kind}/${tempo}` → 計畫了卻整波沒扣成

  for (let seed = 1; seed <= SETS; seed += 1) {
    const g = createGame({ seed, setTarget: 25 });
    const ai = createAiState();
    const allPrev = {};
    const stillRun = {};
    let setTouchTick = null;
    let cur = null;
    let guard = 0;
    while (g.phase !== 'set_over' && guard < 300000) {
      guard += 1;
      const r = g.rally;
      const team = r.possession;
      const atk = ai.attackerId;

      // 本波第三擊窗口（touches===2）開啟＝記一次「計畫」
      if (r.touches === 2 && atk && g.actors[atk] && ai.approach?.team === team) {
        const key = `${g.rally.flightId}|${team}|${atk}`;
        if (!cur || cur.key !== key) {
          const rt = (ai.approach.routes ?? []).find((x) => x.pid === atk) ?? null;
          cur = { key, rt, spiked: false };
          if (rt) {
            const kk = `${rt.kind}/${rt.tempo}`;
            planned[kk] = (planned[kk] ?? 0) + 1;
          }
        }
      }

      // ── 連續靜止（罰站的量法，口徑同 tempo-probe ③）──
      for (const pid of Object.keys(g.actors)) {
        const a = g.actors[pid];
        const p0 = allPrev[pid];
        const st = p0 ? Math.hypot(a.x - p0.x, a.z - p0.z) : 1;
        stillRun[pid] = st < STILL_EPS ? (stillRun[pid] ?? 0) + 1 : 0;
        allPrev[pid] = { x: a.x, z: a.z };
      }

      const ev = stepGame(g, aiCollectIntents(g, ai));
      for (const e of ev) {
        if (e.type === 'TOUCH' && e.touches === 2 && ai.approach?.team === e.team) {
          setTouchTick = g.tick;
        }
        if (e.type === 'TOUCH' && e.kind === 'spike') {
          const route = ai.approach?.routes?.find((x) => x.pid === e.playerId);
          if (route) {
            const back = isBackRow(g.match.rotations[g.players[e.playerId].teamId], e.playerId);
            const key = `${back ? '後排' : '前排'}/${route.kind}/${route.tempo ?? 'n/a'}`;
            const b = B(key);
            if (route.takeoffTick != null) b.takeoffToHit.push(g.tick - route.takeoffTick);
            const still = stillRun[e.playerId] ?? 0;
            b.still.push(still);
            b.runTicks.push(route.runTicks ?? NaN);
            if (setTouchTick != null) {
              b.setToHit.push(g.tick - setTouchTick);
              b.physRel.push((g.tick - setTouchTick) - still);
              if (route.takeoffTick != null) b.plannedRel.push(route.takeoffTick - setTouchTick);
            }
            if (route.__probeDelta != null) b.dynDelta.push(route.__probeDelta);
            if (route.__probeProvFlight != null) b.provFlight.push(route.__probeProvFlight);
            if (route.__probeRefFlight != null) b.refFlight.push(route.__probeRefFlight);
          }
          if (cur && cur.rt?.pid === e.playerId) cur.spiked = true;
        }
        if (e.type === 'DEAD_BALL' || (e.type === 'TOUCH' && e.touches === 1)) {
          if (cur && !cur.spiked && cur.rt) {
            const kk = `${cur.rt.kind}/${cur.rt.tempo}`;
            noSpike[kk] = (noSpike[kk] ?? 0) + 1;
          }
          cur = null; setTouchTick = null;
        }
      }
      if (r.touches !== 2 && cur) {
        if (!cur.spiked && cur.rt) {
          const kk = `${cur.rt.kind}/${cur.rt.tempo}`;
          noSpike[kk] = (noSpike[kk] ?? 0) + 1;
        }
        cur = null;
      }
    }
  }
  // 診斷彙總：第三擊規劃期的 hitPoint 預估飛行 tick（含「回退成地板落點」的比例）
  const hitDiag = {};
  for (const h of (globalThis.__probeHitLog ?? [])) {
    const k = `${h.kind}/${h.tempo}`;
    const d = (hitDiag[k] ??= { n: 0, fallback: 0, ticks: [], contactY: [], apex: [] });
    d.n += 1;
    if (h.ticks != null && h.ticks === h.landTicks) d.fallback += 1;
    if (h.ticks != null) d.ticks.push(h.ticks);
    d.contactY.push(h.contactY);
    d.apex.push(h.apex);
  }
  return {
    arm,
    sets: SETS,
    hitDiag,
    consts: {
      AIR_TICKS,
      takeoffLeadTwo: TEMPO.two.takeoffLead,
      TEMPO_TWO_RATE,
      CONVERGE_T: TUNING.CONVERGE_T,
      SHOOT_APEX: TUNING.SHOOT_APEX,
      stallTicks: STALL_TICKS,
    },
    buckets,
    planned,
    noSpike,
  };
}

// ════════════════════════════════════════════════════════
// 統計小工具
// ════════════════════════════════════════════════════════
const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : 'n/a');
const pad = (s, n) => String(s).padEnd(n, ' ');

// 一條臂的「二速合計」（left/two ＋ right/two，前後排都算）
function twoAgg(res, tempo = 'two') {
  const keys = Object.keys(res.buckets).filter((k) => k.endsWith(`/${tempo}`));
  const acc = {
    takeoffToHit: [], setToHit: [], still: [], plannedRel: [], physRel: [],
    dynDelta: [], provFlight: [], refFlight: [],
  };
  for (const k of keys) {
    for (const f of Object.keys(acc)) acc[f].push(...(res.buckets[k][f] ?? []));
  }
  const A = res.consts.AIR_TICKS;
  const n = acc.still.length;
  return {
    keys,
    n,
    stallPct: pct(acc.still.filter((v) => v >= res.consts.stallTicks).length, n),
    stallP50: q(acc.still, 0.5),
    stallP90: q(acc.still, 0.9),
    t2hP50: q(acc.takeoffToHit, 0.5),
    t2hP90: q(acc.takeoffToHit, 0.9),
    t2hMax: q(acc.takeoffToHit, 1),
    inAirPct: pct(acc.takeoffToHit.filter((v) => v >= 0 && v <= A).length, acc.takeoffToHit.length),
    s2hP50: q(acc.setToHit, 0.5),
    s2hP90: q(acc.setToHit, 0.9),
    plannedRel: acc.plannedRel,
    physRel: acc.physRel,
    dynDelta: acc.dynDelta,
    provFlight: acc.provFlight,
    refFlight: acc.refFlight,
  };
}

function report(results) {
  const out = [];
  const say = (s = '') => out.push(s);
  const by = Object.fromEntries(results.map((r) => [r.arm, r]));
  const c = results[0].consts;
  say('═══ 組合攻擊卷 門3 補量：route B（改二速起跳定義）值不值得做 ═══');
  say(`樣本 ${results[0].sets} 局／seed 1..${results[0].sets}｜1 tick = 1/60 s（SIM_HZ=60）`);
  say(`CONVERGE_T=${c.CONVERGE_T}｜AIR_TICKS=${c.AIR_TICKS}｜SHOOT_APEX=${c.SHOOT_APEX}`);
  say(`罰站定義＝擊球前**連續靜止** ≥ ${STALL_TICKS} tick（0.5s @60Hz），口徑同 tools/tempo-probe.mjs ③`);
  say('★ 除 `real` 臂外，所有臂都 in-process patch TEMPO_TWO_RATE 0→0.35（二速現為停派，不開無樣本）');
  say('★ 反事實臂的數字只能比方向，不得當成「落地後的真實值」');
  say('');

  // ── 0. real 臂（零 patch）＝交叉驗證用 ──
  const real = by.real;
  say('── ⓪ real 臂（**零 patch＝真實路徑**，TEMPO_TWO_RATE=0，無二速）──');
  say('  用途：與 tools/tempo-probe.mjs ③ 對同一組數字，交叉驗證本檔的罰站量測口徑');
  for (const k of Object.keys(real.buckets).sort()) {
    const b = real.buckets[k];
    const st = b.still.filter((v) => v >= STALL_TICKS).length;
    say(`    ${pad(k, 22)} n=${pad(b.still.length, 5)} 罰站 p50=${pad(q(b.still, 0.5), 4)}`
      + `p90=${pad(q(b.still, 0.9), 4)} max=${pad(q(b.still, 1), 4)}｜站>0.5s ${pct(st, b.still.length)}%`
      + `｜set→擊球 p50=${q(b.setToHit, 0.5)}`);
  }
  say('');

  // ── 1. 2×2 主表 ──
  const cells = [];
  const pickBest = (model) => {
    let best = null;
    for (const l of ['0', '-10', '-20', '-30', '-40']) {
      const a = twoAgg(by[`${model}:${l}`]);
      if (!a.n) continue;
      if (!best || Number(a.stallPct) < Number(best.agg.stallPct)) best = { lead: l, agg: a };
    }
    return best;
  };
  const best = Object.fromEntries(MODELS.map((m) => [m, pickBest(m)]));
  const bestPlane = best.plane;
  const bestSphere = best.sphere;

  say('── ① 2×2 主表（二速合計＝left/two ＋ right/two）──');
  say('  route B 欄各列兩種取法：(a) 固定值掃描的最佳值、(b) 動態反推 dyn');
  say('  ※ sphereMid 是補充臂（不在指定的 2×2 內）：球體模型改瞄手點高度，避開 ④-b 的 100% 回退');
  const rows = [
    ['平面模型 × lead=3（基準）', 'plane:3'],
    [`平面模型 × route B(a) lead=${bestPlane?.lead ?? '?'}`, `plane:${bestPlane?.lead}`],
    ['平面模型 × route B(b) dyn', 'plane:dyn'],
    ['球體模型 × lead=3（A 單獨）', 'sphere:3'],
    [`球體模型 × route B(a) lead=${bestSphere?.lead ?? '?'}`, `sphere:${bestSphere?.lead}`],
    ['球體模型 × route B(b) dyn（A＋B）', 'sphere:dyn'],
    ['〔補充〕sphereMid × lead=3', 'sphereMid:3'],
    [`〔補充〕sphereMid × lead=${best.sphereMid?.lead ?? '?'}`, `sphereMid:${best.sphereMid?.lead}`],
    ['〔補充〕sphereMid × dyn', 'sphereMid:dyn'],
  ];
  say(`  ${pad('格', 36)}${pad('n', 6)}${pad('罰站率', 9)}${pad('罰站p50/p90', 14)}`
    + `${pad('起跳→擊 p50/p90/max', 22)}${pad('落窗內', 8)}set→擊 p50`);
  for (const [label, key] of rows) {
    const a = twoAgg(by[key]);
    cells.push({ label, arm: key, ...a });
    say(`  ${pad(label, 36)}${pad(a.n, 6)}${pad(`${a.stallPct}%`, 9)}`
      + `${pad(`${a.stallP50}/${a.stallP90}`, 14)}`
      + `${pad(`${a.t2hP50}/${a.t2hP90}/${a.t2hMax}`, 22)}${pad(`${a.inAirPct}%`, 8)}${a.s2hP50}`);
  }
  say('');

  // ── 2. 固定值掃描全貌 ──
  say('── ② route B(a) 固定值掃描全貌（takeoffLead；負值＝二傳觸球**後**起跳）──');
  for (const model of MODELS) {
    say(`  [${model}]`);
    for (const l of ['3', '0', '-10', '-20', '-30', '-40', 'dyn']) {
      const res = by[`${model}:${l}`];
      const a = twoAgg(res);
      const ns = Object.entries(res.noSpike).filter(([k]) => k.endsWith('/two'))
        .reduce((s, [, v]) => s + v, 0);
      const pl = Object.entries(res.planned).filter(([k]) => k.endsWith('/two'))
        .reduce((s, [, v]) => s + v, 0);
      say(`    lead=${pad(l, 5)} n=${pad(a.n, 5)} 罰站 ${pad(`${a.stallPct}%`, 8)}`
        + `p50=${pad(a.stallP50, 5)} 起跳→擊 p50=${pad(a.t2hP50, 5)}落窗內 ${pad(`${a.inAirPct}%`, 8)}`
        + `set→擊 p50=${pad(a.s2hP50, 5)}｜計畫 ${pad(pl, 5)} 沒扣成 ${ns}`);
    }
  }
  say('');

  // ── 3. dyn 臂的兩段校時 ──
  say('── ③ route B(b) 動態反推：兩段校時的實際值 ──');
  for (const model of MODELS) {
    const a = twoAgg(by[`${model}:dyn`]);
    say(`  [${model}] 規劃期預估飛行 tick p50=${q(a.provFlight, 0.5)}（n=${a.provFlight.length}）`
      + `｜二傳觸球時真實預測 p50=${q(a.refFlight, 0.5)}（n=${a.refFlight.length}）`
      + `｜校時修正量 p50=${q(a.dynDelta, 0.5)} p90=${q(a.dynDelta, 0.9)}`);
  }
  say('');

  // ── 4. 節奏可辨識度 ──
  say('── ④ §三 A1 節奏可辨識度：三檔的起跳 tick（相對二傳實際觸球）──');
  say('  planned＝route.takeoffTick − 觸球 tick（sim 規劃值）｜phys＝擊球 tick − 罰站 tick（人真的停下那刻）');
  say('  ※ 攔網手讀得到的是 phys 那一欄（blockRead.js:113 刻意不讀 route 表）');
  const tempoRows = [
    ['plane:3（基準）', 'plane:3'],
    [`plane:${bestPlane?.lead}`, `plane:${bestPlane?.lead}`],
    ['plane:dyn', 'plane:dyn'],
    ['sphere:3', 'sphere:3'],
    [`sphere:${bestSphere?.lead}`, `sphere:${bestSphere?.lead}`],
    ['sphere:dyn', 'sphere:dyn'],
    ['sphereMid:3', 'sphereMid:3'],
    [`sphereMid:${best.sphereMid?.lead}`, `sphereMid:${best.sphereMid?.lead}`],
    ['sphereMid:dyn', 'sphereMid:dyn'],
  ];
  for (const [label, key] of tempoRows) {
    say(`  [${label}]`);
    for (const t of ['one', 'two', 'three']) {
      const a = twoAgg(by[key], t);
      if (!a.n) { say(`    ${pad(t, 6)} n=0（無樣本）`); continue; }
      say(`    ${pad(t, 6)} n=${pad(a.n, 5)}`
        + `planned p25/p50/p75 = ${pad(`${q(a.plannedRel, 0.25)}/${q(a.plannedRel, 0.5)}/${q(a.plannedRel, 0.75)}`, 16)}`
        + `phys p25/p50/p75 = ${pad(`${q(a.physRel, 0.25)}/${q(a.physRel, 0.5)}/${q(a.physRel, 0.75)}`, 16)}`
        + `擊球 p50=${a.s2hP50}`);
    }
  }
  say('');

  // ── 4.5 樣本歸零診斷 ──
  say('── ④-b 樣本歸零診斷：第三擊規劃期 `aiState.hitPoint` 的預估飛行 tick ──');
  say('  fallback＝predictContactPoint 回退成 predictLanding（球全程沒墜到規劃用擊球高度）');
  say('  contactY＝該臂規劃用的擊球高度（plane 恆 2.9；sphere＝可及球體頂端）｜apex＝該球彈道最高點');
  for (const res of results) {
    const rows = Object.keys(res.hitDiag ?? {}).filter((k) => k.endsWith('/two')).sort();
    if (!rows.length) { say(`  [${res.arm}] （無二速規劃）`); continue; }
    for (const k of rows) {
      const d = res.hitDiag[k];
      say(`  [${pad(res.arm, 12)}] ${pad(k, 12)} n=${pad(d.n, 5)}`
        + `fallback ${pad(`${pct(d.fallback, d.n)}%`, 8)}`
        + `預估飛行 p50=${pad(q(d.ticks, 0.5), 6)}p90=${pad(q(d.ticks, 0.9), 6)}`
        + `contactY p50=${pad(q(d.contactY, 0.5), 6)}apex p50=${q(d.apex, 0.5)}`);
    }
  }
  say('');

  // ── 5. 逐桶明細 ──
  say('── ⑤ 逐桶明細（每臂每桶：n／罰站率／起跳→擊球 p50／set→擊球 p50）──');
  for (const res of results) {
    const keys = Object.keys(res.buckets).sort();
    say(`  [${res.arm}]  TEMPO_TWO_RATE=${res.consts.TEMPO_TWO_RATE} takeoffLead(two)=${res.consts.takeoffLeadTwo}`);
    for (const k of keys) {
      const b = res.buckets[k];
      const st = b.still.filter((v) => v >= STALL_TICKS).length;
      say(`    ${pad(k, 22)} n=${pad(b.still.length, 5)}罰站 ${pad(`${pct(st, b.still.length)}%`, 8)}`
        + `p50=${pad(q(b.still, 0.5), 5)}起跳→擊 p50=${pad(q(b.takeoffToHit, 0.5), 5)}`
        + `set→擊 p50=${pad(q(b.setToHit, 0.5), 5)}runTicks p50=${q(b.runTicks, 0.5)}`);
    }
    const pl = Object.entries(res.planned).sort();
    const ns = Object.entries(res.noSpike).sort();
    say(`    計畫：${pl.map(([k, v]) => `${k}=${v}`).join('  ') || '（無）'}`);
    say(`    沒扣成：${ns.map(([k, v]) => `${k}=${v}`).join('  ') || '（無）'}`);
  }
  return out.join('\n');
}

// ════════════════════════════════════════════════════════
// 入口
// ════════════════════════════════════════════════════════
if (ARM) {
  const res = await runArm(ARM);
  process.stdout.write(`##RESULT##${JSON.stringify(res)}\n`);
} else {
  const results = [];
  for (const arm of ARMS) {
    process.stderr.write(`  [跑臂 ${arm} ...]\n`);
    const p = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, ROUTEB_ARM: arm },
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
    if (p.status !== 0) {
      process.stderr.write(p.stderr ?? '');
      throw new Error(`臂 ${arm} 失敗（exit ${p.status}）`);
    }
    const m = (p.stdout ?? '').split('\n').find((l) => l.startsWith('##RESULT##'));
    if (!m) { process.stderr.write(p.stdout ?? ''); throw new Error(`臂 ${arm} 無輸出`); }
    results.push(JSON.parse(m.slice('##RESULT##'.length)));
  }
  const text = report(results);
  console.log(text);
  const dir = process.env.ROUTEB_OUT;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tempo-routeb.json'),
      JSON.stringify(results, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'tempo-routeb.txt'), `${text}\n`, 'utf8');
    process.stderr.write(`  [輸出寫至 ${dir}]\n`);
  }
}
