// 「組合攻擊卷」門 2（補量）—— 攻擊手在上升段的可及時間窗有多寬？
//
// 用法：node tools/tactics-reach-window-probe.mjs
//       TACTICS_OUT=<dir> node tools/tactics-reach-window-probe.mjs   # 另存 JSON
//
// ★ 零行為改動 ★
// 本檔對 `src/` **一個位元組都不寫**。三條對照臂靠 Node 24 的同步模組鉤子
// （`module.registerHooks`）在**載入時改字串**達成——磁碟上的 src 逐行未動，
// patch 只活在該子行程的記憶體裡（作法同 tools/t10-4-jumpcount-frozen.mjs 的
// in-process patch 精神，只是那支改的是 TUNING 物件、本支要改的是 `const` 匯出，
// 無法賦值 ⇒ 改用載入鉤子）。三條臂的 patch 互斥且必須共存於同一次執行，
// 而模組鉤子是行程層級的 ⇒ 每條臂各跑一個子行程（本檔自我 spawn）。
//
// ── 三條臂 ──────────────────────────────────────────────
//   A  plane        現行模型。只 patch `TEMPO_TWO_RATE 0 → 0.35`（二速現為停派，
//                   不開就沒有二速樣本可量）。其餘一格未動。→ M1
//   B  sphere-plan  A ＋ `ai.js` 的 `hitPoint` 規劃改吃 reach.js 球體：
//                   擊球平面由固定 2.9m 換成**該球員可及球體的頂端**
//                   `spikeReach(p) + reachRadiusFor(SPIKE) + BALL.RADIUS`。→ M2
//   C  sphere-full  B ＋ AI 的觸球意圖閘改吃**真實的** `reachVolumeFor`／`ballInReach`
//                   （3D 球體相交，取消「球必須下墜 vy<0」與 `touchCeiling` 的平面上限）。
//                   最終能不能觸球仍由 sim 的 game.js:ballInReach 判 ⇒ 沒有繞過真實判定。
//                   → M2b（真正回答「窗撐不撐得起」的那條臂）
//
// ── 四個數字 ────────────────────────────────────────────
//   M1/M2/M2b  起跳(route.takeoffTick) → 實際擊球(TOUCH kind=spike) 的 tick 分佈
//              ＋罰站率（擊球前**連續靜止** ≥ 30 tick ＝ 0.5s @ 60Hz；
//              口徑與 tools/tempo-probe.mjs ③ 完全相同，才能對得上上游那組數字）
//   M3         可及時間窗寬度：球停留在攻擊手可及球體內的 tick 數。兩種量法——
//              actual＝攻擊手**當下實際站位**的球體（真實路徑，含他沒走到位的損失）
//              ideal ＝把球體水平心移到球的 x/z（＝「他站到球正下方」的上界，純幾何）
//              兩者都用 reach.js 的真函式 `reachVolumeFor`／`ballInReach`，未重抄模型。
//   M4         對照 AIR_TICKS(24) ＋ takeoffLead(3) ＝ 27 tick 的過／不過。
//
// tick↔秒：`src/sim/constants.js:4` SIM_HZ = 60 ⇒ 1 tick = 1/60 s（0.5s = 30 tick）。
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIM = path.resolve(HERE, '../src/sim');
const SETS = Number(process.env.TACTICS_SETS ?? 40);
const STILL_EPS = 0.005;   // 單 tick 位移小於此＝站著不動（同 tempo-probe）
const STALL_TICKS = 30;    // 0.5s @ 60Hz
const ARMS = ['plane', 'sphere-plan', 'sphere-full'];

// ════════════════════════════════════════════════════════
// 子行程：載入鉤子 ＋ 實測
// ════════════════════════════════════════════════════════
const ARM = process.env.TACTICS_ARM;

function installHooks(arm) {
  const wantPlan = arm === 'sphere-plan' || arm === 'sphere-full';
  const wantGate = arm === 'sphere-full';
  const hit = { tempo: 0, plan: 0, gate: 0, ceiling: 0 };
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
      if (norm.endsWith('/src/sim/approach.js')) {
        // 二速停派解封（所有臂都要，否則無二速樣本）
        sub('export const TEMPO_TWO_RATE = 0;',
          'export const TEMPO_TWO_RATE = 0.35;', 'tempo');
      }
      if (norm.endsWith('/src/sim/ai.js')) {
        if (wantPlan) {
          // ai.js:384 —— 擊球點規劃：平面 2.9 → 可及球體頂端
          sub('    aiState.hitPoint = predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);',
            '    aiState.hitPoint = __probePlanHitPoint(game, aiState);', 'plan');
        }
        if (wantGate) {
          // ai.js:827 —— AI 觸球意圖閘：水平距離＋vy<0 → 真實 3D 球體相交
          sub('      inReach = dist <= aiReachFor(player, r.touches) * AI.ATTEMPT_RADIUS && ball.vy < 0;',
            '      inReach = r.touches >= 2\n'
            + '        ? __probeSphereGate(game, player, actor, ball)\n'
            + '        : dist <= aiReachFor(player, r.touches) * AI.ATTEMPT_RADIUS && ball.vy < 0;',
            'gate');
          // ai.js:1511 —— 扣球的高度上限（平面）解除；最終仍由 game.js 的 ballInReach 判
          sub("  if (action === 'spike') return spikeReach(player);",
            "  if (action === 'spike') return Infinity;", 'ceiling');
        }
        if (wantPlan || wantGate) {
          src += `
// ==== 探針注入（tools/tactics-reach-window-probe.mjs）====
import { reachVolumeFor as __probeReachVolumeFor, ballInReach as __probeBallInReach } from './reach.js';
function __probePlanHitPoint(game, aiState) {
  const p = game.players[aiState.attackerId];
  if (!p) return predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y);
  // 可及球體的**頂端**＝手點 + 半徑（含球半徑膨脹）＝球體在下墜段的最早相交高度
  const top = spikeReach(p, staminaPerfMul(game, p))
    + reachRadiusFor(REACH_ACTION.SPIKE, TUNING, p.height.current) + BALL.RADIUS;
  return predictContactPoint(game.ball, top);
}
function __probeSphereGate(game, player, actor, ball) {
  const vol = __probeReachVolumeFor({
    player, actor, action: 'spike', jump: false,
    jumpMul: staminaPerfMul(game, player), tuning: TUNING, inflate: BALL.RADIUS,
  });
  return __probeBallInReach(ball, vol).ok;
}
`;
        }
      }
      return { ...res, source: src };
    },
  });
  return hit;
}

async function runArm(arm) {
  installHooks(arm);
  const u = (f) => pathToFileURL(path.join(SIM, f)).href;
  const { createGame, stepGame, TUNING } = await import(u('game.js'));
  const { createAiState, aiCollectIntents, AI } = await import(u('ai.js'));
  const { reachVolumeFor, ballInReach, REACH_ACTION } = await import(u('reach.js'));
  const { staminaPerfMul } = await import(u('stamina.js'));
  const { BALL } = await import(u('constants.js'));
  const { AIR_TICKS, TEMPO, TEMPO_TWO_RATE } = await import(u('approach.js'));
  const { isBackRow } = await import(u('rotation.js'));

  const buckets = {};       // key → { takeoffToHit[], setToHit[], still[], winA[], winI[], airA[], airI[], firstA[], firstI[] }
  const noSpike = {};       // key → 計畫了卻整波沒扣成
  const B = (k) => (buckets[k] ??= {
    takeoffToHit: [], setToHit: [], still: [], winA: [], winI: [],
    airA: [], airI: [], firstA: [], firstI: [], planeWin: [], apex: [],
  });

  for (let seed = 1; seed <= SETS; seed += 1) {
    const g = createGame({ seed, setTarget: 25 });
    const ai = createAiState();
    let allPrev = {};
    let stillRun = {};
    let setTouchTick = null;
    let cur = null;         // 本波（touches===2）的窗口累計
    let guard = 0;
    while (g.phase !== 'set_over' && guard < 300000) {
      guard += 1;
      const r = g.rally;
      const team = r.possession;
      const atk = ai.attackerId;
      const rt = (ai.approach?.team === team && atk)
        ? (ai.approach.routes ?? []).find((x) => x.pid === atk) : null;

      // ── 可及時間窗（M3）：只在第三擊窗口（touches===2）內量 ──
      if (r.touches === 2 && atk && g.actors[atk] && g.players[atk]) {
        const key = `${g.rally.flightId}|${team}|${atk}`;
        if (!cur || cur.key !== key) {
          cur = {
            key, rt, runA: 0, runI: 0, maxA: 0, maxI: 0, nA: 0, nI: 0,
            airA: 0, airI: 0, firstA: null, firstI: null, spiked: false,
            runP: 0, maxP: 0, apex: 0,
          };
        }
        // M0：上游「球升過 2.9m 再墜回 2.9m 需約 41 tick」的直接量法
        if (g.ball.y > AI.SPIKE_APPROACH_Y) {
          cur.runP += 1; cur.maxP = Math.max(cur.maxP, cur.runP);
        } else cur.runP = 0;
        cur.apex = Math.max(cur.apex, g.ball.y);
        const p = g.players[atk];
        const a = g.actors[atk];
        const vol = reachVolumeFor({
          player: p, actor: a, action: REACH_ACTION.SPIKE, jump: false,
          jumpMul: staminaPerfMul(g, p), tuning: TUNING, inflate: BALL.RADIUS,
        });
        const okA = ballInReach(g.ball, vol).ok;                       // 真實站位
        const okI = ballInReach(g.ball, { ...vol, cx: g.ball.x, cz: g.ball.z }).ok; // 站到球正下方（上界）
        const tk = cur.rt?.takeoffTick ?? null;
        const inAir = tk != null && g.tick >= tk && g.tick <= tk + AIR_TICKS;
        if (okA) {
          cur.nA += 1; cur.runA += 1; cur.maxA = Math.max(cur.maxA, cur.runA);
          if (cur.firstA === null) cur.firstA = tk == null ? null : g.tick - tk;
          if (inAir) cur.airA += 1;
        } else cur.runA = 0;
        if (okI) {
          cur.nI += 1; cur.runI += 1; cur.maxI = Math.max(cur.maxI, cur.runI);
          if (cur.firstI === null) cur.firstI = tk == null ? null : g.tick - tk;
          if (inAir) cur.airI += 1;
        } else cur.runI = 0;
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
            if (setTouchTick != null) b.setToHit.push(g.tick - setTouchTick);
            b.still.push(stillRun[e.playerId] ?? 0);
            if (cur && cur.rt?.pid === e.playerId) {
              cur.spiked = true;
              b.winA.push(cur.maxA); b.winI.push(cur.maxI);
              b.airA.push(cur.airA); b.airI.push(cur.airI);
              b.planeWin.push(cur.maxP); b.apex.push(Math.round(cur.apex * 100) / 100);
              if (cur.firstA !== null) b.firstA.push(cur.firstA);
              if (cur.firstI !== null) b.firstI.push(cur.firstI);
            }
          }
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
  return {
    arm,
    sets: SETS,
    consts: {
      AIR_TICKS,
      takeoffLeadTwo: TEMPO.two.takeoffLead,
      gate: AIR_TICKS + TEMPO.two.takeoffLead,
      TEMPO_TWO_RATE,
      CONVERGE_T: TUNING.CONVERGE_T,
      REACH_RADIUS: TUNING.REACH_RADIUS,
      stallTicks: STALL_TICKS,
    },
    buckets,
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

function line(label, arr, extra = '') {
  if (!arr.length) return `${label} n=0（無樣本）`;
  return `${label} n=${arr.length}：p50=${q(arr, 0.5)}  p90=${q(arr, 0.9)}  max=${q(arr, 1)}${extra}`;
}

function report(results) {
  const out = [];
  const say = (s = '') => out.push(s);
  const c = results[0].consts;
  say('═══ 組合攻擊卷 門2 補量：攻擊手可及時間窗 ═══');
  say(`樣本 ${results[0].sets} 局／seed 1..${results[0].sets}｜1 tick = 1/60 s（SIM_HZ=60, constants.js:4）`);
  say(`CONVERGE_T=${c.CONVERGE_T}｜REACH_RADIUS=${c.REACH_RADIUS}｜AIR_TICKS=${c.AIR_TICKS}｜`
    + `TEMPO.two.takeoffLead=${c.takeoffLeadTwo}｜判準門檻=${c.gate} tick`);
  say(`罰站定義＝擊球前**連續靜止** ≥ ${c.stallTicks} tick（0.5s @60Hz），口徑同 tools/tempo-probe.mjs ③`);
  say(`三臂皆 in-process patch TEMPO_TWO_RATE 0 → ${c.TEMPO_TWO_RATE}（二速現為停派，不開無樣本）`);
  say('');

  const NAME = {
    plane: 'A｜plane（現行：hitPoint=predictContactPoint(ball, 2.9)）',
    'sphere-plan': 'B｜sphere-plan（hitPoint 改吃可及球體頂端）',
    'sphere-full': 'C｜sphere-full（B ＋ AI 觸球閘改吃真實 ballInReach 球體）',
  };
  const M = { plane: 'M1', 'sphere-plan': 'M2', 'sphere-full': 'M2b' };

  for (const res of results) {
    say(`── ${M[res.arm]}｜${NAME[res.arm]} ──`);
    const keys = Object.keys(res.buckets).sort();
    say('  [起跳 → 實際擊球 tick]（route.takeoffTick 為起跳的真相來源，approach.js:253 routeTicks）');
    for (const k of keys) {
      const b = res.buckets[k];
      const over = b.takeoffToHit.filter((v) => v > c.AIR_TICKS).length;
      say(`    ${line(k, b.takeoffToHit, `｜>AIR_TICKS(${c.AIR_TICKS}) 佔 ${pct(over, b.takeoffToHit.length)}%`)}`);
    }
    say('  [二傳觸球 → 實際擊球 tick]（對照門檻 27）');
    for (const k of keys) {
      const b = res.buckets[k];
      const over = b.setToHit.filter((v) => v > c.gate).length;
      say(`    ${line(k, b.setToHit, `｜>${c.gate} 佔 ${pct(over, b.setToHit.length)}%`)}`);
    }
    say('  [罰站：擊球前連續靜止 tick]');
    for (const k of keys) {
      const b = res.buckets[k];
      const st = b.still.filter((v) => v >= c.stallTicks).length;
      say(`    ${line(k, b.still, `｜罰站率(≥${c.stallTicks}) ${pct(st, b.still.length)}%`)}`);
    }
    const ns = Object.entries(res.noSpike).sort();
    say(`  [計畫了卻整波沒扣成]：${ns.length ? ns.map(([k, v]) => `${k}=${v}`).join('  ') : '（無）'}`);
    say('');
  }

  // M0／M3 只看 A 臂（真實路徑；B/C 的站位已被 patch 動過）
  const A = results.find((r) => r.arm === 'plane');
  say('── M0｜上游估算的直接量法：球停在現行擊球平面 SPIKE_APPROACH_Y=2.9m **之上**幾 tick ──');
  say('  （上游 approach.js:157-159 推算「升過 2.9 → 弧頂 3.4 → 墜回 2.9 約 41 tick」）');
  for (const k of Object.keys(A.buckets).sort()) {
    const b = A.buckets[k];
    say(`    ${line(`${k} 高於2.9m`, b.planeWin)}｜該波球最高點 p50=${q(b.apex, 0.5)}m p90=${q(b.apex, 0.9)}m`);
  }
  say('');

  say('── M3｜可及時間窗寬度（真實路徑：reach.js reachVolumeFor + ballInReach，A 臂）──');
  say('  actual＝攻擊手當下實際站位的可及球體｜ideal＝球體水平心移到球正下方（上界）');
  for (const k of Object.keys(A.buckets).sort()) {
    const b = A.buckets[k];
    say(`    ${line(`${k} actual`, b.winA)}`);
    say(`    ${line(`${k} ideal `, b.winI)}`);
    const hitA = b.airA.filter((v) => v > 0).length;
    const hitI = b.airI.filter((v) => v > 0).length;
    say(`      窗與滯空窗[takeoff, takeoff+${c.AIR_TICKS}] 有交集：actual ${pct(hitA, b.airA.length)}%（n=${b.airA.length}）`
      + `｜ideal ${pct(hitI, b.airI.length)}%`);
    say(`      窗首次開啟相對起跳的 tick：actual p50=${q(b.firstA, 0.5)} p90=${q(b.firstA, 0.9)}`
      + `｜ideal p50=${q(b.firstI, 0.5)} p90=${q(b.firstI, 0.9)}`);
  }
  say('');

  // M4 判定
  say(`── M4｜對照 AIR_TICKS(${c.AIR_TICKS}) + takeoffLead(${c.takeoffLeadTwo}) = ${c.gate} tick 的過／不過 ──`);
  for (const res of results) {
    const two = Object.keys(res.buckets).filter((k) => k.endsWith('/two'));
    let n = 0; let inAir = 0; let setN = 0; let setOk = 0; let stallN = 0; let stall = 0;
    for (const k of two) {
      const b = res.buckets[k];
      n += b.takeoffToHit.length;
      inAir += b.takeoffToHit.filter((v) => v >= 0 && v <= c.AIR_TICKS).length;
      setN += b.setToHit.length;
      setOk += b.setToHit.filter((v) => v <= c.gate).length;
      stallN += b.still.length;
      stall += b.still.filter((v) => v >= c.stallTicks).length;
    }
    const verdict = n === 0 ? '無樣本'
      : (inAir / n >= 0.5 ? '過（多數二速擊球落在滯空窗內）' : '不過');
    say(`    ${M[res.arm]} ${res.arm}：二速 n=${n}｜擊球落在滯空窗內 ${pct(inAir, n)}%`
      + `｜set→hit ≤${c.gate} 佔 ${pct(setOk, setN)}%｜罰站率 ${pct(stall, stallN)}% ⇒ **${verdict}**`);
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
      env: { ...process.env, TACTICS_ARM: arm },
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
  const dir = process.env.TACTICS_OUT;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'tactics-reach-window.json'),
      JSON.stringify(results, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'tactics-reach-window.txt'), `${text}\n`, 'utf8');
    process.stderr.write(`  [輸出寫至 ${dir}]\n`);
  }
}
