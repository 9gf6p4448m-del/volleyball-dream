// 內切二速可行性探針（Sawmah 08-07 裁定 A 的**停手條件**量測）
//
// 用法：node tools/inside-cut-tempo-probe.mjs
//       CUT2_SETS=12 node tools/inside-cut-tempo-probe.mjs   # 縮短樣本
//
// ★ 零行為改動 ★ 對 `src/` 一個位元組都不寫——反事實臂靠 Node 的同步模組鉤子
// （`module.registerHooks`）在**載入時改字串**，patch 只活在子行程記憶體裡。
// 作法照抄 tools/tempo-routeb-probe.mjs（同專案既有範式），每條臂各一個子行程。
//
// ── 三條臂 ──────────────────────────────────────────────
//   base   零 patch＝現行 HEAD（left_inside 恆三速）
//   naive  只讓 `tempoFor` 的二速骰也接受 left_inside（**弧線不動**）
//          ⇒ 節奏標籤是二速（起跳＝set+40）但舉球仍是 t=0.75 高球弧（飛行 82 tick）
//   arc    naive ＋ 給 left_inside 自己的 SHOOT／SHOOT_HIT（半快弧，飛行 61 tick）
//          SHOOT −2.0／SHOOT_HIT −1.3：擊球點維持在 −1.3（＝內切戰術價值的來源，
//          離快攻點 1.3m > BLOCK_REACH_X），與 left 的 −4.4/−2.9 同一套推法
//
// ── 量什麼（判準見派工單）────────────────────────────────
//   起跳時機偏移  spikeTick − route.takeoffTick，及落在 [0, AIR_TICKS] 的比例
//   到位誤差      route.takeoffTick 當下，人與 route.takeoff 的距離（m）
//   單 tick 位移  助跑段 [startTick, takeoffTick] 內的最大單 tick 位移（m）
//   罰站 tick     擊球前連續靜止（單 tick 位移 < 0.005）的 tick 數
//   startRel      route.startTick − 二傳實際觸球 tick（負值＝要在二傳觸球前起步）
//   setToHit      二傳觸球 → 擊球（＝這一檔弧線的飛行時間）
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIM = path.resolve(HERE, '../src/sim');
const SETS = Number(process.env.CUT2_SETS ?? 30);
const STILL_EPS = 0.005;
const STALL_TICKS = 30;
const ARMS = ['base', 'naive', 'arc'];

const ARM = process.env.CUT2_ARM;

function installHooks(arm) {
  if (arm === 'base') return;
  const wantArc = arm === 'arc';
  registerHooks({
    load(url, context, nextLoad) {
      const res = nextLoad(url, context);
      const norm = url.replace(/\\/g, '/');
      if (!norm.endsWith('/src/sim/approach.js')) return res;
      let src = typeof res.source === 'string'
        ? res.source : Buffer.from(res.source).toString('utf8');
      const sub = (from, to, tag) => {
        if (!src.includes(from)) throw new Error(`patch 目標消失（${tag}）：${from}`);
        src = src.replace(from, to);
      };
      // left_inside 與 left 共用同一顆骰（salt 11）＝按內切不改變節奏，只改變路線
      sub('const KIND_SALT = { left: 11, right: 23 };',
        'const KIND_SALT = { left: 11, right: 23, left_inside: 11 };', 'salt');
      sub("  if ((kind === 'left' || kind === 'right') && passTier !== 'poor') {",
        "  if ((kind === 'left' || kind === 'right' || kind === 'left_inside')"
        + " && passTier !== 'poor') {", 'tempo');
      if (wantArc) {
        sub('const SHOOT = { left: -4.4, right: 4.4 };',
          'const SHOOT = { left: -4.4, right: 4.4, left_inside: -2.0 };', 'shoot');
        sub('const SHOOT_HIT = { left: -2.9, right: 2.9 };',
          'const SHOOT_HIT = { left: -2.9, right: 2.9, left_inside: -1.3 };', 'shoothit');
      }
      return { ...res, source: src };
    },
  });
}

async function runArm(arm) {
  installHooks(arm);
  const u = (f) => pathToFileURL(path.join(SIM, f)).href;
  const { createGame, stepGame } = await import(u('game.js'));
  const { createAiState, aiCollectIntents } = await import(u('ai.js'));
  const { AIR_TICKS, TEMPO_TWO_RATE } = await import(u('approach.js'));
  const { isBackRow, TEAM_SIDE } = await import(u('rotation.js'));

  const buckets = {};
  const B = (k) => (buckets[k] ??= {
    takeoffToHit: [], setToHit: [], still: [], startRel: [],
    arriveErr: [], maxStep: [], runTicks: [], hitLx: [],
  });
  const planned = {};
  const noSpike = {};

  for (let seed = 1; seed <= SETS; seed += 1) {
    const g = createGame({ seed, setTarget: 25 });
    const ai = createAiState();
    const prev = {};
    const stillRun = {};
    // 每個 route 一份助跑段量測：key = `${flightId}|${pid}`
    const runMeas = {};
    let setTouchTick = null;
    let cur = null;
    let guard = 0;
    while (g.phase !== 'set_over' && guard < 300000) {
      guard += 1;
      const r = g.rally;
      const team = r.possession;
      const atk = ai.attackerId;

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

      // 逐 tick：連續靜止 ＋ 助跑段的單 tick 位移／到位誤差
      for (const pid of Object.keys(g.actors)) {
        const a = g.actors[pid];
        const p0 = prev[pid];
        const st = p0 ? Math.hypot(a.x - p0.x, a.z - p0.z) : 1;
        stillRun[pid] = st < STILL_EPS ? (stillRun[pid] ?? 0) + 1 : 0;
        prev[pid] = { x: a.x, z: a.z };
      }
      if (ai.approach?.routes) {
        for (const rt of ai.approach.routes) {
          if (rt.startTick == null || rt.takeoffTick == null) continue;
          const a = g.actors[rt.pid];
          if (!a) continue;
          const key = `${ai.flightId}|${rt.pid}`;
          const m = (runMeas[key] ??= { maxStep: 0, arriveErr: null, kind: rt.kind, tempo: rt.tempo });
          if (g.tick > rt.startTick && g.tick <= rt.takeoffTick) {
            // m.last＝上一 tick 的快照（本迴圈末尾才更新）
            const st = m.last ? Math.hypot(a.x - m.last.x, a.z - m.last.z) : 0;
            if (st > m.maxStep) m.maxStep = st;
          }
          m.last = { x: a.x, z: a.z };
          if (g.tick === rt.takeoffTick) {
            m.arriveErr = Math.hypot(rt.takeoff.x - a.x, rt.takeoff.z - a.z);
          }
        }
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
            b.still.push(stillRun[e.playerId] ?? 0);
            b.runTicks.push(route.runTicks ?? NaN);
            // 擊球點的隊伍視角 lx——內切的戰術價值＝離快攻點（lx 0）夠遠，
            // 換弧線不得把它拉回中路（那樣中間攔網手就搆得到了）
            const ac = g.actors[e.playerId];
            if (ac) b.hitLx.push(TEAM_SIDE[g.players[e.playerId].teamId] * ac.x);
            const m = runMeas[`${ai.flightId}|${e.playerId}`];
            if (m) {
              b.maxStep.push(m.maxStep);
              if (m.arriveErr != null) b.arriveErr.push(m.arriveErr);
            }
            if (setTouchTick != null) {
              b.setToHit.push(g.tick - setTouchTick);
              if (route.startTick != null) b.startRel.push(route.startTick - setTouchTick);
            }
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
  return { arm, sets: SETS, consts: { AIR_TICKS, TEMPO_TWO_RATE }, buckets, planned, noSpike };
}

const q = (arr, p) => {
  const s = [...arr].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : 'n/a');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : ' n/a');
const pad = (s, n) => String(s).padEnd(n, ' ');

function report(results) {
  const out = [];
  const say = (s = '') => out.push(s);
  const A = results[0].consts.AIR_TICKS;
  say('═══ 內切二速可行性（裁定 A 的停手條件）═══');
  say(`樣本 ${results[0].sets} 局／seed 1..${results[0].sets}｜AIR_TICKS=${A}｜1 tick = 1/60 s`);
  say('臂：base＝現行 HEAD｜naive＝只開二速骰（弧線不動）｜arc＝二速骰＋left_inside 專屬半快弧');
  say('');
  const KEYS = ['前排/left/two', '前排/left/three', '前排/left_inside/two', '前排/left_inside/three'];
  for (const res of results) {
    say(`── 臂 ${res.arm} ──`);
    for (const k of KEYS) {
      const b = res.buckets[k];
      if (!b || !b.still.length) { say(`    ${pad(k, 24)} （無樣本）`); continue; }
      const n = b.still.length;
      const stall = b.still.filter((v) => v >= STALL_TICKS).length;
      const inAir = b.takeoffToHit.filter((v) => v >= 0 && v <= A).length;
      say(`    ${pad(k, 24)} n=${pad(n, 4)}`
        + ` 起跳→擊球 p50=${pad(q(b.takeoffToHit, 0.5), 4)}p90=${pad(q(b.takeoffToHit, 0.9), 4)}`
        + `窗內 ${pad(`${pct(inAir, b.takeoffToHit.length)}%`, 7)}`
        + `｜set→擊球 p50=${pad(q(b.setToHit, 0.5), 4)}`
        + `｜罰站 p50=${pad(q(b.still, 0.5), 4)}>0.5s ${pad(`${pct(stall, n)}%`, 7)}`);
      say(`    ${pad('', 24)}    runTicks p50=${pad(q(b.runTicks, 0.5), 4)}`
        + `startRel p50=${pad(q(b.startRel, 0.5), 5)}`
        + `｜到位誤差 p50=${f2(q(b.arriveErr, 0.5))}m p90=${f2(q(b.arriveErr, 0.9))}m`
        + `max=${f2(q(b.arriveErr, 1))}m`
        + `｜單tick位移 max=${f2(q(b.maxStep, 1))}m`
        + `｜擊球 lx p50=${f2(q(b.hitLx, 0.5))}`);
    }
    const pk = Object.keys(res.planned).filter((k) => k.startsWith('left'));
    say(`    計畫數：${pk.sort().map((k) => `${k}=${res.planned[k]}`).join(' ')}`);
    say(`    計畫了沒扣成：${pk.sort().map((k) => `${k}=${res.noSpike[k] ?? 0}`).join(' ')}`);
    say('');
  }
  return out.join('\n');
}

if (ARM) {
  const res = await runArm(ARM);
  process.stdout.write(`__JSON__${JSON.stringify(res)}`);
} else {
  const results = [];
  for (const arm of ARMS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, CUT2_ARM: arm, CUT2_SETS: String(SETS) },
      encoding: 'utf8', maxBuffer: 1 << 28,
    });
    if (r.status !== 0) {
      console.error(`臂 ${arm} 失敗：\n${r.stderr}`);
      process.exit(1);
    }
    const i = r.stdout.indexOf('__JSON__');
    if (i < 0) { console.error(`臂 ${arm} 無輸出：\n${r.stdout}\n${r.stderr}`); process.exit(1); }
    results.push(JSON.parse(r.stdout.slice(i + 8)));
  }
  console.log(report(results));
}
