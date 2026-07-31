// 難度重校卷 開卷補量 —— 「戰術＝強隊標誌／第二屆解鎖」的三臂量測（**零 `src/` 改動**）
//
// 用法：
//   node tools/difficulty-recal-probe.mjs                    # 跑全部（A/B/B2/C，RUNS=100）
//   DR_ARM=a  RUNS=100 node tools/difficulty-recal-probe.mjs # 單臂（子行程用）
//   DR_SEASONS=3 …                                          # 跨屆階梯（M3）
//   DR_OUT=<dir>                                            # 逐臂輸出落檔
//
// ★ 零行為改動的機械保證 ★
// 本檔對 `src/` 一個位元組都不寫。反事實臂用 Node 的同步模組鉤子（`module.registerHooks`）
// 在**載入時改字串**——磁碟上的 src 逐行未動，patch 只活在該子行程的記憶體裡。
// 作法照抄 `tools/block-divergence-probe.mjs`。模組鉤子是行程層級的 ⇒ 每臂各一個子行程。
//
// ── 三臂（＋一個敏感度臂）──────────────────────────────
//   A  base      現況：雙方都有戰術、不分屆＝**零 patch 的真實路徑**
//   B  first     第一屆模擬：只有「強隊」保留三型；弱隊與玩家隊機率關 0
//   B2 first-obs 同 B，但「強隊」定義多算曜石（敏感度臂）
//   C  off       全關（三型機率全 0）＝卷前狀態
//   ⚠ B/B2/C 改了球路 ⇒ 軌跡發散，逐 seed 配對差值有意義（同 seed 同生涯起點），
//     但不得把它讀成「真實路徑上的值」——只能比方向與量級。
//
// ── patch 點（逐條可查）────────────────────────────────
//   ① src/sim/approach.js  `checks.roll` 前面串一顆全域閘（team+對手+屆數）
//      ＝與「把 CROSS_PLAY_RATE／TANDEM_PLAY_RATE／DELAY_PLAY_RATE 設 0」等價：
//      骰子排在所有結構條件之後，關掉它不改變任何 rng 消費、不改變其他分支。
//   ② tools/balance-sim.mjs  playMatch 開頭寫入 `__VD_OPP`/`__VD_MATCH`（觀測用）
//   ③ tools/balance-sim.mjs  屆迴圈寫入 `__VD_SEASON`
//   ④ tools/balance-sim.mjs  stepGame 之後叫一次觀測器（唯讀；M2 用）
//   ⑤ tools/balance-sim.mjs  playMatch return 前收帳
//   ②–⑤ 全是唯讀觀測＋全域寫入，不改任何 sim 輸入 ⇒ A 臂輸出必須與
//      `node tools/balance-sim.mjs 100` 逐值相同（本檔的自驗條件）。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARM = process.env.DR_ARM ?? null;
const RUNS = process.env.RUNS ?? '100';
const SEASONS = process.env.DR_SEASONS ?? '1';
const OUTDIR = process.env.DR_OUT ?? null;

// ════════════════════════════════════════════════════════
// 「強隊」定義（★提案，待 Sawmah 裁定★）
// 依據：opponents.js:37 既有的 §三 B 分級主軸就是 level——「≥64 read／<64 commit」。
// 沿用同一條線 ⇒ 強隊＝{鐵霧 64, 黑松 67, 天鷹 72}；曜石 60 是憲法明文的個性例外
// （它的標誌是 commit 攔網，不是戰術），故不在主案內。
// 敏感度臂 B2 改用 scoutRead ≥ 0.5（＝{曜石 0.7, 鐵霧 0.5, 黑松 0.6, 天鷹 0.9}），
// 看「把曜石也算強隊」會不會翻轉結論。
// ════════════════════════════════════════════════════════
const STRONG_LEVEL = new Set(['iron-mist', 'black-pine', 'sky-hawk']);
const STRONG_SCOUT = new Set(['obsidian', 'iron-mist', 'black-pine', 'sky-hawk']);

const ARMS = {
  a: { label: '現況（雙方都有戰術）', gate: null },
  b: { label: '第一屆模擬（只有強隊 level≥64 有）', gate: 'level' },
  b2: { label: '第一屆模擬（強隊含曜石 scoutRead≥0.5）', gate: 'scout' },
  c: { label: '全關（三型機率全 0）', gate: 'off' },
};

// ════════════════════════════════════════════════════════
// 載入鉤子
// ════════════════════════════════════════════════════════
function installHooks() {
  const hit = {};
  registerHooks({
    load(url, context, nextLoad) {
      const res = nextLoad(url, context);
      const norm = url.replace(/\\/g, '/');
      if (!norm.includes('/src/sim/approach.js') && !norm.includes('/tools/balance-sim.mjs')) {
        return res;
      }
      let src = typeof res.source === 'string'
        ? res.source : Buffer.from(res.source).toString('utf8');
      const sub = (from, to, tag) => {
        if (!src.includes(from)) throw new Error(`patch 目標消失（${tag}）：${from}`);
        src = src.replace(from, to);
        hit[tag] = (hit[tag] ?? 0) + 1;
      };
      if (norm.endsWith('/src/sim/approach.js')) {
        // ① 三型觸發骰前面串一顆全域閘（＝把該型機率就地設 0）
        sub(
          '  checks.roll = force\n'
          + '    || hash01(flightId * 1097 + COMBO_SALT[type] + seed) < COMBO_RATE[type];',
          '  const __g = globalThis.__VD_COMBO_GATE;\n'
          + '  checks.roll = (__g ? __g(team, type) : true) && (force\n'
          + '    || hash01(flightId * 1097 + COMBO_SALT[type] + seed) < COMBO_RATE[type]);',
          'gate',
        );
      }
      if (norm.endsWith('/tools/balance-sim.mjs')) {
        // ② 本場對手／賽程項（觀測器要分場統計）
        sub(
          'function playMatch(setup, entry = null) {',
          'function playMatch(setup, entry = null) {\n'
          + '  globalThis.__VD_OPP = entry?.opponentId ?? null;\n'
          + '  globalThis.__VD_MATCH = entry?.id ?? null;',
          'opp',
        );
        // ③ 屆數（跨屆臂的閘要吃）
        sub(
          '  for (let season = 1; season <= SEASONS; season += 1) {',
          '  for (let season = 1; season <= SEASONS; season += 1) {\n'
          + '    globalThis.__VD_SEASON = season;',
          'season',
        );
        // ④ 逐 tick 唯讀觀測（M2）
        sub(
          '    stepGame(g, intents);',
          '    stepGame(g, intents);\n'
          + '    if (globalThis.__VD_OBS) globalThis.__VD_OBS(g, ai);',
          'obs',
        );
        // ⑥ 把逐 seed 樣本掛上全域（本探針要自己算「決賽帶」的配對 Δ——
        //    balance-sim 的配對輸出只有六場勝率與奪冠率，沒有決賽帶）
        sub(
          "const perRun = []; // { seed, wins:{matchId:0|1}, champion:0|1 }",
          "const perRun = []; // { seed, wins:{matchId:0|1}, champion:0|1 }\n"
          + 'globalThis.__VD_PERRUN = perRun;',
          'perrun',
        );
        // ⑤ 收帳
        sub(
          '  return { g, maxDeficit, setStartStamina };',
          '  if (globalThis.__VD_OBS_END) globalThis.__VD_OBS_END(g);\n'
          + '  return { g, maxDeficit, setStartStamina };',
          'obsend',
        );
      }
      return { ...res, source: src };
    },
  });
  return hit;
}

// ════════════════════════════════════════════════════════
// M2 觀測器（唯讀）
// 口徑：
//   組合次數    ai.attackCombo 物件**identity 改變**的那一刻算一次（每 flight 至多一次）
//   攻擊次數    TOUCH{kind:'spike'} 逐隊計
//   組合扣成    該波組合的 mainId 真的打出 TOUCH{kind:'spike'}
//   組合得分    緊接著的 SCORE 歸給同隊、且歸因觸球正是那一記扣球
//               （歸因法＝career/growth.js matchStatsFor 同一套「得分前最後觸球者」）
// ════════════════════════════════════════════════════════
function makeObserver() {
  // key: `${matchId}|${oppId}` → 統計
  const byMatch = new Map();
  const key = () => `${globalThis.__VD_MATCH ?? '?'}|${globalThis.__VD_OPP ?? '?'}|${globalThis.__VD_SEASON ?? 1}`;
  const bucket = () => {
    const k = key();
    if (!byMatch.has(k)) {
      byMatch.set(k, {
        matchId: (globalThis.__VD_MATCH ?? '?'),
        opponentId: (globalThis.__VD_OPP ?? '?'),
        season: Number(globalThis.__VD_SEASON ?? 1),
        games: 0,
        spikes: { A: 0, B: 0 },
        spikeKills: { A: 0, B: 0 }, // 全部扣球裡直接得分的（＝組合得分率的對照基線）
        combos: { A: 0, B: 0 },
        comboSpikes: { A: 0, B: 0 },
        comboKills: { A: 0, B: 0 },
        byType: {},
      });
    }
    return byMatch.get(k);
  };

  let evIdx = 0;
  let lastComboObj = null;
  let lastTouch = null;
  let pending = null; // { team, type, mainId, spiked }
  let curGame = null;
  let counted = false;

  const reset = (g) => {
    curGame = g; evIdx = 0; lastComboObj = null; lastTouch = null; pending = null; counted = false;
  };

  const obs = (g, ai) => {
    if (g !== curGame) reset(g);
    if (!counted) { bucket().games += 1; counted = true; }
    const b = bucket();
    // --- 組合開跑（identity 改變＝新的一份計畫）---
    const c = ai?.attackCombo ?? null;
    if (c && c !== lastComboObj) {
      lastComboObj = c;
      const team = ai?.approach?.team ?? null;
      if (team) {
        b.combos[team] += 1;
        b.byType[c.type] = b.byType[c.type] ?? { A: 0, B: 0, killsA: 0, killsB: 0 };
        b.byType[c.type][team] += 1;
        pending = { team, type: c.type, mainId: c.mainId, spiked: false };
      }
    }
    // --- 新事件掃描（歸因鏡像 matchStatsFor）---
    for (; evIdx < g.events.length; evIdx += 1) {
      const e = g.events[evIdx];
      if (e.type === 'TOUCH' || e.type === 'SERVE') {
        lastTouch = {
          playerId: e.playerId, team: e.team, kind: e.kind ?? 'serve', power: e.power,
        };
        if (e.type === 'TOUCH' && e.kind === 'spike') {
          b.spikes[e.team] = (b.spikes[e.team] ?? 0) + 1;
          if (pending && !pending.spiked && e.team === pending.team && e.playerId === pending.mainId) {
            pending.spiked = true;
            b.comboSpikes[pending.team] += 1;
          }
        }
      } else if (e.type === 'BLOCK_TOUCH') {
        lastTouch = { playerId: e.playerId, team: e.team, kind: 'block' };
      } else if (e.type === 'SCORE') {
        if (lastTouch && lastTouch.kind === 'spike' && lastTouch.team === e.team) {
          b.spikeKills[e.team] = (b.spikeKills[e.team] ?? 0) + 1;
        }
        if (pending?.spiked && e.team === pending.team && lastTouch
          && lastTouch.team === pending.team && lastTouch.playerId === pending.mainId
          && lastTouch.kind === 'spike') {
          b.comboKills[pending.team] += 1;
          const t = b.byType[pending.type];
          if (t) t[pending.team === 'A' ? 'killsA' : 'killsB'] += 1;
        }
        lastTouch = null;
        pending = null;
      }
    }
  };
  const end = () => { counted = false; curGame = null; };
  return { obs, end, byMatch };
}

// ════════════════════════════════════════════════════════
// 單臂執行（子行程內）
// ════════════════════════════════════════════════════════
async function runArm(armId) {
  const arm = ARMS[armId];
  if (!arm) throw new Error(`未知臂：${armId}`);
  const hit = installHooks();

  const strong = arm.gate === 'scout' ? STRONG_SCOUT : STRONG_LEVEL;
  if (arm.gate === 'off') {
    globalThis.__VD_COMBO_GATE = () => false;
  } else if (arm.gate === 'level' || arm.gate === 'scout') {
    globalThis.__VD_COMBO_GATE = (team) => {
      const season = Number(globalThis.__VD_SEASON ?? 1);
      if (season >= 2) return true;               // 第二屆後普遍解鎖（雙方都有）
      if (team === 'A') return false;             // 第一屆玩家隊沒有（集訓未解鎖）
      return strong.has(globalThis.__VD_OPP);     // 第一屆對手：只有強隊有
    };
  } else {
    delete globalThis.__VD_COMBO_GATE;
  }

  const observer = makeObserver();
  globalThis.__VD_OBS = observer.obs;
  globalThis.__VD_OBS_END = observer.end;

  process.argv[2] = RUNS;
  process.env.VD_SEASONS = SEASONS;
  // 配對同種子（裁定書 §4.3）：A 臂先寫基準檔，其餘臂讀它報 Δ±SE。
  // 種子由 run index 決定（balance-sim:323 `100000 + run * 7919`）⇒ 各臂逐條可配對。
  if (OUTDIR) {
    fs.mkdirSync(OUTDIR, { recursive: true });
    process.env.VD_PAIRED = path.join(OUTDIR, `paired-A-s${SEASONS}-r${RUNS}.json`);
  }
  console.log(`\n##### 臂 ${armId.toUpperCase()}＝${arm.label}｜RUNS=${RUNS}｜SEASONS=${SEASONS} #####`);
  await import('./balance-sim.mjs');
  console.log(`（patch 命中：${JSON.stringify(hit)}）`);

  // --- M2 輸出 ---
  const rows = [...observer.byMatch.values()].sort((x, y) => x.season - y.season
    || x.matchId.localeCompare(y.matchId));
  console.log(`\n=== M2 組合攻擊實況（觀測；口徑見檔頭）===`);
  console.log('屆 場次              對手          場數  B扣球  B組合  B扣成  B得分  組合佔B攻擊  組合得分率  全扣球得分率');
  for (const r of rows) {
    const share = r.spikes.B ? `${((r.combos.B / r.spikes.B) * 100).toFixed(1)}%` : 'n/a';
    const kr = r.comboSpikes.B ? `${((r.comboKills.B / r.comboSpikes.B) * 100).toFixed(1)}%` : 'n/a';
    const base = r.spikes.B ? `${((r.spikeKills.B / r.spikes.B) * 100).toFixed(1)}%` : 'n/a';
    console.log(
      `${String(r.season).padStart(2)} ${r.matchId.padEnd(16)} ${r.opponentId.padEnd(12)}`
      + `${String(r.games).padStart(6)}${String(r.spikes.B).padStart(7)}${String(r.combos.B).padStart(7)}`
      + `${String(r.comboSpikes.B).padStart(7)}${String(r.comboKills.B).padStart(7)}`
      + `${share.padStart(13)}${kr.padStart(12)}${base.padStart(14)}`,
    );
  }
  console.log('\n（同上，玩家隊 A 視角）');
  console.log('屆 場次              對手          A扣球  A組合  A扣成  A得分');
  for (const r of rows) {
    console.log(
      `${String(r.season).padStart(2)} ${r.matchId.padEnd(16)} ${r.opponentId.padEnd(12)}`
      + `${String(r.spikes.A).padStart(7)}${String(r.combos.A).padStart(7)}`
      + `${String(r.comboSpikes.A).padStart(7)}${String(r.comboKills.A).padStart(7)}`,
    );
  }
  if (OUTDIR && globalThis.__VD_PERRUN) {
    fs.writeFileSync(
      path.join(OUTDIR, `perrun-${armId}-s${SEASONS}-r${RUNS}.json`),
      `${JSON.stringify(globalThis.__VD_PERRUN)}\n`,
    );
  }
  const typeAgg = {};
  for (const r of rows) {
    for (const [t, v] of Object.entries(r.byType)) {
      typeAgg[t] = typeAgg[t] ?? { A: 0, B: 0, killsA: 0, killsB: 0 };
      for (const k of ['A', 'B', 'killsA', 'killsB']) typeAgg[t][k] += v[k];
    }
  }
  console.log(`\n三型分佈（全場次合計）：${JSON.stringify(typeAgg)}`);
  if (OUTDIR) {
    fs.mkdirSync(OUTDIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUTDIR, `m2-${armId}-s${SEASONS}.json`),
      `${JSON.stringify({ arm: armId, label: arm.label, RUNS, SEASONS, rows, typeAgg }, null, 2)}\n`,
    );
  }
}

// ════════════════════════════════════════════════════════
// 主控（自我 spawn：模組鉤子是行程層級的）
// ════════════════════════════════════════════════════════
if (ARM) {
  await runArm(ARM);
} else {
  const list = (process.env.DR_ARMS ?? 'a,b,b2,c').split(',').map((s) => s.trim()).filter(Boolean);
  for (const armId of list) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      stdio: 'inherit',
      env: { ...process.env, DR_ARM: armId, RUNS, DR_SEASONS: SEASONS },
    });
    if (r.status !== 0) { console.error(`臂 ${armId} 失敗（exit ${r.status}）`); process.exit(1); }
  }
}
