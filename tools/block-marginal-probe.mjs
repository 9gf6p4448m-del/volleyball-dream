// 攔網分工案 — 開卷補量探針（M1 第三人邊際貢獻／M2 吊球現況／M3 牆寬敏感度）
//
// 用法：node tools/block-marginal-probe.mjs
//       BMP_OUT=<dir> node tools/block-marginal-probe.mjs     # 另存 JSON/TXT
//       BMP_SETS=8    node tools/block-marginal-probe.mjs     # 縮短樣本（除錯用）
//
// ★ 零行為改動 ★
// 本檔對 `src/` **一個位元組都不寫**。所有反事實臂靠 Node 24 的同步模組鉤子
// （`module.registerHooks`）在**載入時改字串**達成——磁碟上的 src 逐行未動，
// patch 只活在該子行程的記憶體裡（作法照抄 tools/tempo-routeb-probe.mjs）。
// 模組鉤子是行程層級的 ⇒ 每條臂各跑一個子行程（本檔自我 spawn）。
//
// ── 臂 ─────────────────────────────────────────────────
//   base        **零 patch＝真實路徑**（曜石體中＝COMMIT_ALLOWLIST 唯一成員 ⇒ B 隊 commit；
//               A 隊未指定 blockPersona ⇒ read）
//   cap2a       反事實：`ai.js:1654`（blockFarWing 的 return）`Math.abs(anchorX) > 1.8`
//               放寬成 `anchorX !== 0` ⇒ 計畫成立後，攻擊點對側的翼攔手退牆
//               （anchorX===0 才留三人＝讀期未決；讀期就退等於用未來答案站位）
//               ⚠ 這個既有掛點壓不乾淨：lane 只吃 currentRole（`ai.js:1652`），
//                 前排兩人同 lane 號時會一起退或一起留 ⇒ 三人牆仍留近半
//   cap2b       反事實：`ai.js:1007` 的 `slot.tier >= 2` 分支改成**無條件**回落
//               （沿用既有 wallBail 的退防語意 `x: 原地, z: ±2.6`，把「趕不到才退」
//               改成「一律退」）⇒ 乾淨的「單一攻擊點最多 2 人上牆，第三人回落補吊球」
//   sh:V        反事實：`ai.js:1645 BLOCK_SHOULDER_M = 0.55` → V（0.40/0.55/0.70/0.85）
//               sh:0.55 與 base 應逐值相同＝patch 管線的自我檢查
//
// ── 量測口徑（全部走真實路徑：事件流 ＋ actor 狀態，不重刻攔網／計分邏輯）──
//   一次「攻擊」＝一個 `TOUCH{kind:'spike'}` 事件（`game.js:676`）。
//     touches===2 ⇒ S 二次球（dump，`ai.js:370/1444`）；power<=0.45 ⇒ 輕吊
//     （tip，口徑同 `game.js:354 classifySpikeZone`）
//   參與攔網人數 nJ ＝本次控球窗（上一個 BALL_OVER_NET/SERVE → 球過網那一 tick）內，
//     防守方前排**新起跳**（`game.js:469 actor.blockStartTick` 被改寫）的相異人數
//     ＝題目要的「離開地板」。另報 nW＝過網那一 tick 仍在攔網窗內的人數（畫面口徑）。
//   結局（由事件流判，不重刻）：
//     kill      本球直接得分給攻方、且無 BLOCK_TOUCH
//     toolKill  本球直接得分給攻方、且有 BLOCK_TOUCH（打手出界／擦手落地）
//     blockKill 本球直接得分給守方、且有 BLOCK_TOUCH（攔死）
//     atkError  本球直接得分給守方、且無 BLOCK_TOUCH（攻擊失誤：出界／掛網／自陷）
//     dug       守方（非攔網）觸到球 ⇒ 回合續打
//   得分率 killRate ＝ (kill + toolKill) / 攻擊數
//   觸手改變球路率 btRate ＝ 有 BLOCK_TOUCH 的比例（BLOCK_TOUCH 只在球路真的被改時才發，
//     見 `game.js:1044-1116`；手身區擲骰沒中＝乾淨過網、不發事件）
//
// ── 統計 ────────────────────────────────────────────────
//   同 seed 配對：每個 seed 一局，先算該局的率，再取逐 seed 差值 Δ；
//   報 mean(Δ) ± SE，SE = sd(Δ)/sqrt(n)。**|Δ| < 2×SE ＝分不出**，不得用點估計當結論。
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SETS = Number(process.env.BMP_SETS ?? 40);
const MAX_TICKS = 400000;
const OPP_ID = 'obsidian';

const SHOULDERS = ['0.40', '0.55', '0.70', '0.85'];
const CAPS = ['cap2a', 'cap2b'];
const ARMS = ['base', ...CAPS, ...SHOULDERS.map((v) => `sh:${v}`)];

// ════════════════════════════════════════════════════════
// 子行程：載入鉤子 ＋ 實測
// ════════════════════════════════════════════════════════
const ARM = process.env.BMP_ARM;

const FARWING_FROM = '  return lane !== 0 && Math.abs(anchorX) > 1.8\n'
  + '    && Math.sign(laneOff) !== Math.sign(anchorX);';
const FARWING_TO = '  return lane !== 0 && anchorX !== 0\n'
  + '    && Math.sign(laneOff) !== Math.sign(anchorX);';
const SHOULDER_FROM = 'const BLOCK_SHOULDER_M = 0.55;';
// cap2b 由兩處替換組成：
//  (a) tier 重定義：現行 `tier: Math.abs(i - main)` 是**位置相鄰度**，主攔剛好在三人中間時
//      三人的 tier 是 1/0/1 ⇒ **根本不存在 tier 2**，`ai.js:1007` 那條退路對「主攔在中間」
//      的情形恆不成立（實測：只改 (b) 時 nJ=3 從 70.4% 只動到 71.7%＝沒動）。
//      本臂把 tier 改成「離 anchorX 的距離排名」（0＝最近＝主攔，2＝最遠＝第三人）。
//  (b) `slot.tier >= 2` 分支改成**無條件**回落——沿用 ai.js:1024-1029 既有的 wallBail
//      退防語意（`x: 原地, z: ±2.6`），只是把「趕不到才退」改成「一律退」。
// 牆位 xs 仍照 `i - main` 算 ⇒ 拿掉最遠那一格後，剩下兩格仍相鄰，不留內縫。
const TIER_FROM = '  front.forEach((f, i) => { slots[f.pid] = { x: xs[i] + shift, tier: Math.abs(i - main) }; });';
const TIER_TO = `  const __rank = {};
  front.map((f, i) => i)
    .sort((a, b) => (Math.abs(front[a].x - anchorX) - Math.abs(front[b].x - anchorX))
      || (front[a].pid < front[b].pid ? -1 : 1))
    .forEach((i, r) => { __rank[i] = r; });
  front.forEach((f, i) => { slots[f.pid] = { x: xs[i] + shift, tier: __rank[i] }; });`;
const TIER2_FROM = '      if (slot.tier >= 2) {';
const TIER2_TO = `      if (slot.tier >= 2) {
        return moveIntent(game, playerId, tick, actor, {
          x: clampCourtX(actor.x), z: TEAM_SIDE[team] * 2.6,
        });
      }
      if (false) {`;

function installHooks(arm) {
  if (arm === 'base') return;
  registerHooks({
    load(url, context, nextLoad) {
      const res = nextLoad(url, context);
      const norm = url.replace(/\\/g, '/');
      if (!norm.endsWith('/src/sim/ai.js')) return res;
      let src = typeof res.source === 'string'
        ? res.source : Buffer.from(res.source).toString('utf8');
      const sub = (from, to, tag) => {
        if (!src.includes(from)) throw new Error(`patch 目標消失（${tag}）`);
        src = src.replace(from, to);
      };
      if (arm === 'cap2a') sub(FARWING_FROM, FARWING_TO, 'farwing');
      if (arm === 'cap2b') { sub(TIER_FROM, TIER_TO, 'tier-rank'); sub(TIER2_FROM, TIER2_TO, 'tier2'); }
      if (arm.startsWith('sh:')) {
        sub(SHOULDER_FROM, `const BLOCK_SHOULDER_M = ${arm.slice(3)};`, 'shoulder');
      }
      return { ...res, source: src };
    },
  });
}

const OTHER = { A: 'B', B: 'A' };

async function runArm(arm) {
  installHooks(arm);
  const u = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
  const { createGame, stepGame, TUNING } = await import(u('src/sim/game.js'));
  const { createAiState, aiCollectIntents } = await import(u('src/sim/ai.js'));
  const { isFrontRow } = await import(u('src/sim/rotation.js'));
  const { createCareer, createCareerPlayer, careerMatchSetup } = await import(u('src/career/careerState.js'));
  const { buildStarterMembers } = await import(u('src/career/roster.js'));
  const { opponentById } = await import(u('src/career/opponents.js'));

  // 讀回 patch 後的實際常數（不靠推論）
  const aiSrc = fs.readFileSync(path.join(ROOT, 'src/sim/ai.js'), 'utf8');
  const diskShoulder = /const BLOCK_SHOULDER_M = ([\d.]+);/.exec(aiSrc)?.[1] ?? '?';

  function setupMatch(run) {
    const career = createCareer({ seed: 900000 + run * 7919, playerName: '探針' });
    const player = createCareerPlayer('探針');
    const roster = { capacity: 12, members: buildStarterMembers() };
    const entry = { id: 'group-3', stage: 'group', opponentId: OPP_ID, label: '' };
    return careerMatchSetup(career, player, entry, roster, null);
  }

  /** 球心通過網面（z=0）那一刻的 x——線性插值於過網前後兩個 tick（同 triple-block-probe）。 */
  const crossingX = (b0, b1) => {
    const dz = b0.z - b1.z;
    const f = dz === 0 ? 0 : b0.z / dz;
    return b0.x + (b1.x - b0.x) * f;
  };
  const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

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
    let jumpLog = [];       // { pid, tick } —— 本控球窗內的新起跳
    let winStart = 0;       // 本控球窗起點 tick
    let cur = null;

    const frontOf = (team) => {
      const rot = game.match.rotations[team];
      return rot.filter((pid) => isFrontRow(rot, pid));
    };

    // ⚠ 落點與球員座標一律取自「該 tick 開始時的快照」＋ DEAD_BALL 事件自帶的 `at`
    //   （game.js:1171 `const at = { x: state.ball.x, z: state.ball.z }`＝真正的落點）。
    //   死球後同一次 stepGame 內就會佈置下一球、把球與所有 actor 重置到發球位置，
    //   step 之後再讀 game.ball/game.actors 讀到的是**下一球的發球站位**（實測 lz=9.70）。
    const resolve = (a, outcome, deadAt, snap) => {
      a.out = outcome;
      if (deadAt && snap) {
        a.lx = r2(deadAt.x); a.lz = r2(deadAt.z);
        const front = frontOf(a.d);
        const nonJump = front.filter((pid) => !a.jumpIds.includes(pid));
        const dist = (pid) => (snap[pid]
          ? Math.hypot(snap[pid].x - deadAt.x, snap[pid].z - deadAt.z) : Infinity);
        const all = game.match.rotations[a.d].map(dist).filter(Number.isFinite);
        a.dAll = r2(all.length ? Math.min(...all) : null);
        const nj = nonJump.map(dist).filter(Number.isFinite);
        a.dNonJump = r2(nj.length ? Math.min(...nj) : null);
      }
      attacks.push(a);
    };

    let guard = 0;
    while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < MAX_TICKS) {
      guard += 1;
      const b0 = { x: game.ball.x, z: game.ball.z };
      // tick 開始時的 actor 快照（只在追蹤中的攻擊需要；死球後 game.actors 會被重置）
      let snap = null;
      if (cur) {
        snap = {};
        for (const pid of Object.keys(game.actors)) {
          snap[pid] = { x: game.actors[pid].x, z: game.actors[pid].z };
        }
      }
      const ev = stepGame(game, aiCollectIntents(game, ai, []));
      const tick = game.tick;

      // ── 新起跳偵測（game.js:469 每次新攔網窗開啟都改寫 blockStartTick）──
      for (const pid of Object.keys(game.actors)) {
        const st = game.actors[pid].blockStartTick;
        if (st !== prevStart[pid]) { prevStart[pid] = st; jumpLog.push({ pid, tick }); }
      }

      // ── 過網（用與 game.js:973 相同的判準）──
      const crossed = (b0.z > 0) !== (game.ball.z > 0) && b0.z !== game.ball.z;
      if (crossed && cur && !cur.crossed) {
        const toTeam = game.ball.z > 0 ? 'A' : 'B';
        if (toTeam === cur.d) {
          cur.crossed = true;
          cur.cx = r2(crossingX(b0, { x: game.ball.x, z: game.ball.z }));
          const front = frontOf(cur.d);
          const inWin = front.filter((pid) => game.actors[pid].blockUntil >= tick
            && game.actors[pid].blockHand !== 'retract');
          cur.nW = inWin.length;
          cur.wallXs = inWin.map((pid) => r2(game.actors[pid].x)).sort((x, y) => x - y);
          cur.frontXs = front.map((pid) => r2(game.actors[pid].x)).sort((x, y) => x - y);
          // 牆的覆蓋帶（x 軸口徑；不含高度閘）
          if (inWin.length) {
            const xs = inWin.map((pid) => game.actors[pid].x);
            cur.wallLo = r2(Math.min(...xs) - TUNING.BLOCK_REACH_X);
            cur.wallHi = r2(Math.max(...xs) + TUNING.BLOCK_REACH_X);
            cur.wallW = r2(cur.wallHi - cur.wallLo);
            cur.wallMissX = r2(Math.abs(cur.cx - (cur.wallLo + cur.wallHi) / 2));
            cur.inBand = cur.cx >= cur.wallLo && cur.cx <= cur.wallHi ? 1 : 0;
          }
          cur.jumpIds = [...new Set(jumpLog
            .filter((j) => j.tick >= winStart && j.tick <= tick && front.includes(j.pid))
            .map((j) => j.pid))];
          cur.nJ = cur.jumpIds.length;
        }
      }

      const finalizeJumps = (a) => {
        if (a.nJ != null) return;
        const front = frontOf(a.d);
        a.jumpIds = [...new Set(jumpLog
          .filter((j) => j.tick >= winStart && j.tick <= tick && front.includes(j.pid))
          .map((j) => j.pid))];
        a.nJ = a.jumpIds.length;
      };
      let deadAt = null;
      for (const e of ev) {
        if (e.type === 'DEAD_BALL') deadAt = e.at ?? null;
        if (e.type === 'BALL_OVER_NET' || e.type === 'SERVE') {
          winStart = tick; jumpLog = jumpLog.filter((j) => j.tick >= tick - 1);
        }
        // ── 先結算追蹤中的攻擊，再開新的（同 tick 內順序才對）──
        if (cur) {
          if (e.type === 'BLOCK_TOUCH' && e.team === cur.d) {
            cur.bt = 1; cur.btZone = e.zone ?? 'body';
            if (e.graze) cur.btGraze = 1;
            if (e.pressed) cur.btPress = 1;
          } else if (e.type === 'BLOCK_DECEIVED' && e.team === cur.d) {
            cur.dec = 1;
          } else if (e.type === 'TOUCH' && e.team === cur.d) {
            finalizeJumps(cur);
            // 誰把球救起來的：前排/後排、是不是剛剛上牆的人、離球多遠
            cur.digPid = e.playerId;
            cur.digFront = frontOf(cur.d).includes(e.playerId) ? 1 : 0;
            cur.digWasJumper = cur.jumpIds.includes(e.playerId) ? 1 : 0;
            cur.digX = r2(b0.x); cur.digZ = r2(b0.z);
            if (snap) {
              const nonJump = frontOf(cur.d).filter((pid) => !cur.jumpIds.includes(pid));
              const ds = nonJump.map((pid) => Math.hypot(snap[pid].x - b0.x, snap[pid].z - b0.z));
              cur.digNonJumpDist = r2(ds.length ? Math.min(...ds) : null);
            }
            resolve(cur, 'dug', null, null); cur = null;
          } else if (e.type === 'TOUCH' && e.team === cur.t && cur.crossed) {
            // 球被攔回攻方半場、攻方再處理＝這記攻擊被擋下來了（不是得分也不是被救起）
            finalizeJumps(cur); resolve(cur, cur.bt ? 'blockBack' : 'returned', null, null); cur = null;
          } else if (e.type === 'SCORE') {
            finalizeJumps(cur);
            const o = e.team === cur.t
              ? (cur.bt ? 'toolKill' : 'kill')
              : (cur.bt ? 'blockKill' : 'atkError');
            resolve(cur, o, deadAt, snap); cur = null;
          }
        }
        if (e.type === 'TOUCH' && e.kind === 'spike') {
          if (cur) { finalizeJumps(cur); resolve(cur, 'superseded', null, null); }
          const d = OTHER[e.team];
          cur = {
            t: e.team, d, tick, touches: e.touches,
            dump: e.touches === 2 ? 1 : 0,
            tip: (e.power ?? 1) <= 0.45 ? 1 : 0,
            power: e.power ?? null,
            tool: e.tool ? 1 : 0,
            zone: game.rally.lastSpikeZone,
            crossed: false, cx: null, nW: null, nJ: null, jumpIds: [],
            wallXs: null, frontXs: null, wallW: null, wallMissX: null, inBand: null,
            bt: 0, btZone: null, btGraze: 0, btPress: 0, dec: 0,
            out: null, lx: null, lz: null, dAll: null, dNonJump: null,
            digPid: null, digFront: null, digWasJumper: null,
            digX: null, digZ: null, digNonJumpDist: null,
          };
        }
      }
    }
    if (cur) resolve(cur, 'superseded', null, null);
    return { seed: run, ticks: game.tick, attacks };
  }

  const sets = [];
  for (let s = 0; s < SETS; s += 1) sets.push(runSet(s));
  const opp = opponentById(OPP_ID);
  return {
    arm,
    sets,
    meta: {
      diskShoulder,
      blockReachX: TUNING.BLOCK_REACH_X,
      blockWindow: TUNING.BLOCK_WINDOW,
      personaB: opp.ai.blockPersona,
      tipRateB: opp.ai.tipRate,
      dumpRateB: opp.ai.dumpRate,
    },
  };
}

// ════════════════════════════════════════════════════════
// 統計小工具
// ════════════════════════════════════════════════════════
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
const q = (a, p) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const pad = (s, n) => String(s).padEnd(n, ' ');
const padL = (s, n) => String(s).padStart(n, ' ');
const pc = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '  -  ');
const f2 = (v) => (v == null || Number.isNaN(v) ? ' - ' : v.toFixed(2));
const f1 = (v) => (v == null || Number.isNaN(v) ? ' - ' : v.toFixed(1));

/** 逐 seed 配對差：回傳 { d, se, n, verdict } —— |Δ| < 2SE ⇒ 分不出 */
function paired(aSeeds, bSeeds) {
  const ds = [];
  for (let i = 0; i < Math.min(aSeeds.length, bSeeds.length); i += 1) {
    if (Number.isFinite(aSeeds[i]) && Number.isFinite(bSeeds[i])) ds.push(bSeeds[i] - aSeeds[i]);
  }
  const d = mean(ds);
  const se = sd(ds) / Math.sqrt(ds.length);
  let verdict;
  if (!Number.isFinite(d) || !Number.isFinite(se)) verdict = '無樣本';
  else if (se === 0) verdict = d === 0 ? '分不出（Δ 恆為 0）' : '逐局一致（SE=0，樣本退化）';
  else verdict = Math.abs(d) >= 2 * se ? '顯著（|Δ|≥2SE）' : '分不出（|Δ|<2SE）';
  return { d, se, n: ds.length, verdict };
}

const REAL = (a) => a.filter((x) => x.out !== 'superseded');
const KILL = (a) => a.filter((x) => x.out === 'kill' || x.out === 'toolKill').length;

/** 一批攻擊的率表 */
function rates(atk) {
  const n = atk.length;
  const c = (f) => atk.filter(f).length;
  return {
    n,
    kill: KILL(atk) / n,
    killPlain: c((x) => x.out === 'kill') / n,
    tool: c((x) => x.out === 'toolKill') / n,
    blockKill: c((x) => x.out === 'blockKill') / n,
    atkErr: c((x) => x.out === 'atkError') / n,
    dug: c((x) => x.out === 'dug') / n,
    bt: c((x) => x.bt === 1) / n,
    dec: c((x) => x.dec === 1) / n,
  };
}

/** 逐 seed 的某個率（分母不足 minN 的 seed 回 NaN，避免 0/0 汙染配對） */
function seedRates(res, filt, num, minN = 3) {
  return res.sets.map((s) => {
    const a = REAL(s.attacks).filter(filt);
    if (a.length < minN) return NaN;
    return a.filter(num).length / a.length;
  });
}
function seedMeanOf(res, filt, val, minN = 1) {
  return res.sets.map((s) => {
    const a = REAL(s.attacks).filter(filt).map(val).filter((v) => v != null && Number.isFinite(v));
    if (a.length < minN) return NaN;
    return mean(a);
  });
}
const allAtk = (res, filt) => res.sets.flatMap((s) => REAL(s.attacks)).filter(filt);

const isKill = (x) => x.out === 'kill' || x.out === 'toolKill';
const isTipDump = (x) => x.tip === 1 || x.dump === 1;

// ════════════════════════════════════════════════════════
// 報告
// ════════════════════════════════════════════════════════
function report(results) {
  const out = [];
  const say = (s = '') => out.push(s);
  const by = Object.fromEntries(results.map((r) => [r.arm, r]));
  const base = by.base;
  const m = base.meta;

  say('═══ 攔網分工案 開卷補量：M1 第三人邊際貢獻／M2 吊球現況／M3 牆寬敏感度 ═══');
  say(`樣本 ${SETS} 局／臂（seed run 0..${SETS - 1}，同 seed 配對）｜對手＝${OPP_ID}`);
  say(`磁碟上 BLOCK_SHOULDER_M=${m.diskShoulder}（＝src 零改動的證明）｜BLOCK_REACH_X=${m.blockReachX}`
    + `｜BLOCK_WINDOW=${m.blockWindow}`);
  say(`守方 B＝曜石體中 blockPersona=${m.personaB}（COMMIT_ALLOWLIST 唯一成員）；`
    + '守方 A＝玩家隊，careerMatchSetup 未指定 blockPersona ⇒ read');
  say('★ base 是唯一的真實路徑數字；cap2／sh:* 是**反事實 patch 臂**，只能比方向');
  say('★ 顯著性判準：|Δ| ≥ 2×SE 才算分得出；否則一律寫「分不出」');
  say('');

  // ── ⓪ 健全性 ──
  say('── ⓪ 健全性 ──');
  const sh55 = by['sh:0.55'];
  const same = JSON.stringify(base.sets) === JSON.stringify(sh55.sets);
  say(`  sh:0.55 與 base 逐值相同？ ${same ? '是 ✔（patch 管線不汙染數值）' : '否 ✘（patch 管線有問題）'}`);
  for (const r of results) {
    const a = r.sets.flatMap((s) => s.attacks);
    const sup = a.filter((x) => x.out === 'superseded').length;
    say(`  [${pad(r.arm, 8)}] 攻擊 ${padL(REAL(a).length, 5)} 筆`
      + `（另有 ${sup} 筆被下一次扣球覆蓋＝同波多次擊球，已剔除）`
      + `｜未過網 ${REAL(a).filter((x) => !x.crossed).length}`);
  }
  say('');

  // ══════════════════════ M1 ══════════════════════
  say('════════ M1 第三名攔網手的邊際貢獻 ════════');
  say('');
  say('【A】觀察臂（base＝真實路徑）：依「實際離開地板參與攔網的人數 nJ」分組');
  say('  ⚠ 這是**觀察性分組不是隨機分派**——三人攔的球本來就可能是比較好讀的球（選擇偏誤），');
  say('    這幾列**沒有因果解釋力**，只描述現況。因果請看下面的【B】干預臂。');
  for (const D of ['B', 'A']) {
    const persona = D === 'B' ? `commit（曜石）` : 'read（玩家隊）';
    say(`  -- 守方 ${D}＝${persona}；攻方＝${OTHER[D]} --`);
    say(`    ${pad('nJ 參與人數', 12)}${pad('樣本', 7)}${pad('佔比', 8)}${pad('攻方得分率', 11)}`
      + `${pad('└純殺', 8)}${pad('└打手/擦手', 11)}${pad('被攔死率', 10)}${pad('攻方失誤率', 11)}`
      + `${pad('觸手改變球路', 13)}${pad('被騙撲空', 9)}${pad('救起率', 9)}擋回率`);
    const pool = allAtk(base, (x) => x.d === D);
    for (const k of [0, 1, 2, 3]) {
      const a = pool.filter((x) => (x.nJ ?? 0) === k);
      if (!a.length) { say(`    ${pad(k, 12)}${pad(0, 7)}`); continue; }
      const r = rates(a);
      say(`    ${pad(k, 12)}${pad(r.n, 7)}${pad(pc(r.n, pool.length), 8)}`
        + `${pad(pc(KILL(a), r.n), 11)}${pad(pc(a.filter((x) => x.out === 'kill').length, r.n), 8)}`
        + `${pad(pc(a.filter((x) => x.out === 'toolKill').length, r.n), 11)}`
        + `${pad(pc(a.filter((x) => x.out === 'blockKill').length, r.n), 10)}`
        + `${pad(pc(a.filter((x) => x.out === 'atkError').length, r.n), 11)}`
        + `${pad(pc(a.filter((x) => x.bt).length, r.n), 13)}`
        + `${pad(pc(a.filter((x) => x.dec).length, r.n), 9)}`
        + `${pad(pc(a.filter((x) => x.out === 'dug').length, r.n), 9)}`
        + `${pc(a.filter((x) => x.out === 'blockBack' || x.out === 'returned').length, r.n)}`);
    }
    // 3 人 vs 2 人的「觀察性差」（僅供對照，無因果力）
    const a2 = pool.filter((x) => x.nJ === 2);
    const a3 = pool.filter((x) => x.nJ === 3);
    if (a2.length && a3.length) {
      const p2 = KILL(a2) / a2.length;
      const p3 = KILL(a3) / a3.length;
      const se = Math.sqrt(p2 * (1 - p2) / a2.length + p3 * (1 - p3) / a3.length);
      say(`    〔觀察性對照〕得分率 3人−2人 = ${((p3 - p2) * 100).toFixed(1)}pp`
        + ` ± ${(se * 100).toFixed(1)}pp（獨立二項 SE）`
        + ` ⇒ ${Math.abs(p3 - p2) >= 2 * se ? '顯著' : '分不出'}——**但這是選擇偏誤下的相關，不是因果**`);
    }
  }
  say('');
  say('  補充：nJ 分佈與「攻擊型態」的交叉（說明選擇偏誤的來源——三人攔集中在哪種球）');
  say(`    ${pad('守方', 6)}${pad('型態', 10)}${pad('n', 7)}${pad('nJ=0', 8)}${pad('nJ=1', 8)}${pad('nJ=2', 8)}nJ=3`);
  for (const D of ['B', 'A']) {
    for (const [lab, f] of [['吊/二次球', isTipDump], ['一般強攻', (x) => !isTipDump(x)]]) {
      const a = allAtk(base, (x) => x.d === D && f(x));
      if (!a.length) continue;
      say(`    ${pad(D, 6)}${pad(lab, 10)}${pad(a.length, 7)}`
        + [0, 1, 2, 3].map((k) => pad(pc(a.filter((x) => (x.nJ ?? 0) === k).length, a.length), 8)).join(''));
    }
  }
  say('');

  say('【B】干預臂（vs base，同 seed 配對）：**這一組才有因果解釋力**');
  say('  cap2a ＝ ai.js:1654 blockFarWing 的 |anchorX|>1.8 放寬成 anchorX!==0');
  say('          ⇒ 攻擊點對側的翼攔手退牆。**但這個掛點壓不乾淨**：lane 只吃 currentRole');
  say('            （middle=0／outside=−1／其餘=+1，ai.js:1652），輪轉到前排兩人同 lane 號時');
  say('            兩人會一起退或一起留 ⇒ 三人牆仍有近半留存（見下面 nJ 分佈）');
  say('  cap2b ＝ (a) ai.js:1679 的 tier 由「位置相鄰度 |i−main|」改成「離 anchorX 的距離排名」');
  say('            ——原式在主攔剛好站中間時 tier 恆為 1/0/1，**根本沒有 tier 2**，');
  say('            所以 ai.js:1007 那條既有退路對半數情形恆不成立（實測只改 (b) 時 nJ=3 不動）');
  say('          (b) ai.js:1007 的 `slot.tier >= 2` 分支改成**無條件**回落（沿用既有 wallBail');
  say('            退防語意 x=原地／z=±2.6，只是把「趕不到才退」改成「一律退」）');
  say('          ⇒ 這才是乾淨的「單一攻擊點最多 2 人上牆，第三人回落補吊球」');
  say('  ⚠ 兩個 patch 都對 A/B 兩隊同時生效（無隊別分支）⇒ 兩側都變，回合動態整體位移。');
  say('');
  const capRows = [
    ['守方 B（commit）全部攻擊', (x) => x.d === 'B'],
    ['守方 B・一般強攻', (x) => x.d === 'B' && !isTipDump(x)],
    ['守方 B・吊/二次球', (x) => x.d === 'B' && isTipDump(x)],
    ['守方 A（read）全部攻擊', (x) => x.d === 'A'],
    ['守方 A・一般強攻', (x) => x.d === 'A' && !isTipDump(x)],
    ['守方 A・吊/二次球', (x) => x.d === 'A' && isTipDump(x)],
  ];
  const metrics = [
    ['攻方得分率', isKill],
    ['被攔死率', (x) => x.out === 'blockKill'],
    ['觸手改變球路率', (x) => x.bt === 1],
    ['攻方失誤率', (x) => x.out === 'atkError'],
    ['救起率', (x) => x.out === 'dug'],
    ['擋回率', (x) => x.out === 'blockBack' || x.out === 'returned'],
  ];
  const dist = (a) => [0, 1, 2, 3]
    .map((k) => pc(a.filter((x) => (x.nJ ?? 0) === k).length, a.length)).join(' ');
  const wP50 = (a) => {
    const v = a.map((x) => x.wallW).filter((x) => x != null);
    return v.length ? `${f2(q(v, 0.5))}m(n=${v.length})` : '-';
  };
  for (const [rowLab, filt] of capRows) {
    say(`  -- ${rowLab} --`);
    say(`     ${pad('指標', 16)}${pad('base', 9)}${pad('臂', 8)}${pad('該臂', 9)}`
      + `${pad('Δ(pp)', 10)}${pad('±SE', 9)}裁決`);
    for (const [mLab, num] of metrics) {
      const bs = seedRates(base, filt, num);
      const bm = mean(bs.filter(Number.isFinite));
      for (const cap of CAPS) {
        const cs = seedRates(by[cap], filt, num);
        const p = paired(bs, cs);
        const cm = mean(cs.filter(Number.isFinite));
        say(`     ${pad(cap === CAPS[0] ? mLab : '', 16)}${pad(`${(bm * 100).toFixed(1)}%`, 9)}`
          + `${pad(cap, 8)}${pad(`${(cm * 100).toFixed(1)}%`, 9)}`
          + `${pad(`${p.d >= 0 ? '+' : ''}${(p.d * 100).toFixed(2)}`, 10)}`
          + `${pad((p.se * 100).toFixed(2), 9)}${p.verdict}（配對 n=${p.n} 局）`);
      }
    }
    // 上牆人數是否真的被壓到 2
    say(`     nJ 分佈 0/1/2/3：base ${dist(allAtk(base, filt))}`
      + CAPS.map((c) => `  →  ${c} ${dist(allAtk(by[c], filt))}`).join(''));
    say(`     過網瞬間牆覆蓋寬 p50：base ${wP50(allAtk(base, filt))}`
      + CAPS.map((c) => `  →  ${c} ${wP50(allAtk(by[c], filt))}`).join(''));
  }
  say('');

  // ══════════════════════ M2 ══════════════════════
  say('════════ M2 吊球現況（base＝真實路徑；cap2a/cap2b 為反事實對照）════════');
  say('');
  say('  定義：dump＝S 二次球（TOUCH.touches===2，ai.js:370/1444）；'
    + 'tip＝輕吊（TOUCH.power<=0.45，口徑同 game.js:354）');
  say(`  隊伍參數：曜石 tipRate=${m.tipRateB} dumpRate=${m.dumpRateB}；玩家隊未指定 ⇒ AI 預設 tipRate=0.1 dumpRate=0.07`);
  say('');
  say(`  ${pad('攻方', 6)}${pad('類別', 12)}${pad('n', 7)}${pad('佔該隊攻擊', 12)}${pad('得分率', 9)}`
    + `${pad('被救起率', 10)}${pad('被攔死率', 10)}${pad('失誤率', 9)}觸手率`);
  for (const T of ['A', 'B']) {
    const tot = allAtk(base, (x) => x.t === T).length;
    for (const [lab, f] of [['S 二次球 dump', (x) => x.dump === 1], ['輕吊 tip', (x) => x.tip === 1 && x.dump === 0],
      ['吊/二次球合計', isTipDump], ['一般強攻', (x) => !isTipDump(x)]]) {
      const a = allAtk(base, (x) => x.t === T && f(x));
      if (!a.length) { say(`  ${pad(T, 6)}${pad(lab, 12)}${pad(0, 7)}`); continue; }
      say(`  ${pad(T, 6)}${pad(lab, 12)}${pad(a.length, 7)}${pad(pc(a.length, tot), 12)}`
        + `${pad(pc(KILL(a), a.length), 9)}`
        + `${pad(pc(a.filter((x) => x.out === 'dug').length, a.length), 10)}`
        + `${pad(pc(a.filter((x) => x.out === 'blockKill').length, a.length), 10)}`
        + `${pad(pc(a.filter((x) => x.out === 'atkError').length, a.length), 9)}`
        + `${pc(a.filter((x) => x.bt).length, a.length)}`);
    }
  }
  say('');
  say('  吊/二次球「救不起來」（直接落地得分）時的落點分佈——座標為守方半場的局部座標');
  say('  lz\'＝離網距離（m，0＝網、9＝底線）；lx\'＝橫向（負＝守方左手邊，±4.5 為邊線）');
  say(`  ${pad('守方', 6)}${pad('n', 6)}${pad("|lx'| p25/p50/p90", 20)}${pad("lz' p25/p50/p90", 20)}`
    + `${pad("前區(lz'<3)", 12)}${pad('中區(3-6)', 11)}後區(>6)`);
  for (const D of ['B', 'A']) {
    const a = allAtk(base, (x) => x.d === D && isTipDump(x) && isKill(x) && x.lz != null);
    if (!a.length) { say(`  ${pad(D, 6)}0`); continue; }
    const side = D === 'A' ? 1 : -1;   // A 的半場在 z>0
    const lz = a.map((x) => Math.abs(x.lz));
    const lx = a.map((x) => Math.abs(x.lx));
    const zc = (lo, hi) => a.filter((x) => Math.abs(x.lz) >= lo && Math.abs(x.lz) < hi).length;
    say(`  ${pad(D, 6)}${pad(a.length, 6)}`
      + `${pad(`${f2(q(lx, 0.25))}/${f2(q(lx, 0.5))}/${f2(q(lx, 0.9))}`, 20)}`
      + `${pad(`${f2(q(lz, 0.25))}/${f2(q(lz, 0.5))}/${f2(q(lz, 0.9))}`, 20)}`
      + `${pad(pc(zc(0, 3), a.length), 12)}${pad(pc(zc(3, 6), a.length), 11)}${pc(zc(6, 99), a.length)}`
      + `   （side=${side}）`);
  }
  say('');
  say('  「第三人退到後場站得到那些落點嗎」——三種取數路徑分開報：');
  say('   ① 重建模型（base 臂）：退防目標點取 ai.js:979-981 的 { x: laneOff*2 = ±3.0, z: ±2.6 }，');
  say('      算落點到「攻擊點對側那一格」的距離。⚠ 這是重建的模型，不是真實路徑上量到的。');
  say('   ② 真實路徑（base 臂）：落點到守方**未參與攔網的前排球員**的最近距離（他們現在站哪就是哪）');
  say('   ③ 反事實 patch 臂（cap2）：同 ②，但翼攔手真的退了牆——這才是「退防後」的實際距離');
  say(`  ${pad('取數路徑', 26)}${pad('守方', 6)}${pad('n', 6)}${pad('距離 p25/p50/p90 (m)', 24)}≤2m 比例（＝有機會碰到）`);
  const RETREAT_Z = 2.6; const RETREAT_X = 3.0;
  for (const D of ['B', 'A']) {
    const side = D === 'A' ? 1 : -1;
    const a = allAtk(base, (x) => x.d === D && isTipDump(x) && isKill(x) && x.lz != null);
    if (a.length) {
      const ds = a.map((x) => {
        // 攻擊點對側的那一格（攻擊過網 x 的反側）
        const s = Math.sign(x.cx ?? 0) || 1;
        return Math.hypot(x.lx - (-s * RETREAT_X), x.lz - side * RETREAT_Z);
      });
      say(`  ${pad('① 重建模型（退防目標點）', 26)}${pad(D, 6)}${pad(a.length, 6)}`
        + `${pad(`${f2(q(ds, 0.25))}/${f2(q(ds, 0.5))}/${f2(q(ds, 0.9))}`, 24)}`
        + `${pc(ds.filter((v) => v <= 2).length, ds.length)}`);
    }
    for (const [lab, res] of [['② 真實路徑（未上牆前排）', base],
      ...CAPS.map((c) => [`③ 反事實 ${c}（同②）`, by[c]])]) {
      const aa = allAtk(res, (x) => x.d === D && isTipDump(x) && isKill(x) && x.dNonJump != null);
      if (!aa.length) { say(`  ${pad(lab, 26)}${pad(D, 6)}0`); continue; }
      const ds = aa.map((x) => x.dNonJump);
      say(`  ${pad(lab, 26)}${pad(D, 6)}${pad(aa.length, 6)}`
        + `${pad(`${f2(q(ds, 0.25))}/${f2(q(ds, 0.5))}/${f2(q(ds, 0.9))}`, 24)}`
        + `${pc(ds.filter((v) => v <= 2).length, ds.length)}`);
    }
  }
  say('');
  say('  吊/二次球**被救起來**時是誰救的（真實路徑；n 遠大於「落地得分」那組，訊號較穩）');
  say(`  ${pad('臂', 8)}${pad('守方', 6)}${pad('n', 6)}${pad('前排救起', 10)}${pad('└該球有上牆的人救', 18)}`
    + `${pad('後排救起', 10)}${pad('救球點離網 p50', 15)}未上牆前排離救球點 p50`);
  for (const [lab, res] of [['base', base], ...CAPS.map((c) => [c, by[c]])]) {
    for (const D of ['B', 'A']) {
      const a = allAtk(res, (x) => x.d === D && isTipDump(x) && x.out === 'dug' && x.digPid);
      if (!a.length) { say(`  ${pad(lab, 8)}${pad(D, 6)}0`); continue; }
      const dz = a.map((x) => Math.abs(x.digZ)).filter(Number.isFinite);
      const dn = a.map((x) => x.digNonJumpDist).filter((v) => v != null);
      say(`  ${pad(lab, 8)}${pad(D, 6)}${pad(a.length, 6)}`
        + `${pad(pc(a.filter((x) => x.digFront).length, a.length), 10)}`
        + `${pad(pc(a.filter((x) => x.digFront && x.digWasJumper).length, a.length), 18)}`
        + `${pad(pc(a.filter((x) => !x.digFront).length, a.length), 10)}`
        + `${pad(f2(q(dz, 0.5)), 15)}${dn.length ? `${f2(q(dn, 0.5))}m (n=${dn.length})` : '-'}`);
    }
  }
  say('');
  say('  配對檢定：讓第三人退防，吊/二次球的得分率動了嗎（第三人回落補吊球的實際效果）');
  say(`  ${pad('守方', 6)}${pad('指標', 14)}${pad('base', 9)}${pad('臂', 8)}${pad('該臂', 9)}`
    + `${pad('Δ(pp)', 10)}${pad('±SE', 9)}裁決`);
  for (const D of ['B', 'A']) {
    for (const [mLab, num] of [['得分率', isKill], ['救起率', (x) => x.out === 'dug'],
      ['觸手率', (x) => x.bt === 1]]) {
      const f = (x) => x.d === D && isTipDump(x);
      const bs = seedRates(base, f, num, 2);
      for (const cap of CAPS) {
        const cs = seedRates(by[cap], f, num, 2);
        const p = paired(bs, cs);
        say(`  ${pad(D, 6)}${pad(cap === CAPS[0] ? mLab : '', 14)}`
          + `${pad(`${(mean(bs.filter(Number.isFinite)) * 100).toFixed(1)}%`, 9)}${pad(cap, 8)}`
          + `${pad(`${(mean(cs.filter(Number.isFinite)) * 100).toFixed(1)}%`, 9)}`
          + `${pad(`${p.d >= 0 ? '+' : ''}${(p.d * 100).toFixed(2)}`, 10)}${pad((p.se * 100).toFixed(2), 9)}`
          + `${p.verdict}（配對 n=${p.n} 局）`);
      }
    }
  }
  say('');

  // ══════════════════════ M3 ══════════════════════
  say('════════ M3 牆寬 BLOCK_SHOULDER_M 敏感度（全部為反事實 patch 臂；0.55＝現值）════════');
  say('');
  for (const D of ['B', 'A']) {
    say(`  -- 守方 ${D}（${D === 'B' ? 'commit' : 'read'}）--`);
    say(`  ${pad('肩距', 8)}${pad('攻擊n', 7)}${pad('攻方得分率', 11)}${pad('被攔死率', 10)}${pad('觸手率', 9)}`
      + `${pad('攻方失誤率', 11)}${pad('牆覆蓋寬p50', 12)}${pad('過網點離牆心p50', 15)}${pad('過網點落在帶內', 14)}nJ=3比例`);
    for (const v of SHOULDERS) {
      const res = by[`sh:${v}`];
      const a = allAtk(res, (x) => x.d === D);
      const w = a.map((x) => x.wallW).filter((x) => x != null);
      const mo = a.map((x) => x.wallMissX).filter((x) => x != null);
      const ib = a.filter((x) => x.inBand != null);
      say(`  ${pad(v + (v === '0.55' ? '★' : ' '), 8)}${pad(a.length, 7)}`
        + `${pad(pc(KILL(a), a.length), 11)}`
        + `${pad(pc(a.filter((x) => x.out === 'blockKill').length, a.length), 10)}`
        + `${pad(pc(a.filter((x) => x.bt).length, a.length), 9)}`
        + `${pad(pc(a.filter((x) => x.out === 'atkError').length, a.length), 11)}`
        + `${pad(f2(q(w, 0.5)), 12)}${pad(f2(q(mo, 0.5)), 15)}`
        + `${pad(pc(ib.filter((x) => x.inBand === 1).length, ib.length), 14)}`
        + `${pc(a.filter((x) => x.nJ === 3).length, a.length)}`);
    }
    say(`  配對 Δ（相對 sh:0.55；逐 seed 配對）`);
    say(`  ${pad('肩距', 8)}${pad('得分率Δ(pp)', 13)}${pad('±SE', 8)}${pad('裁決', 22)}`
      + `${pad('被攔死率Δ(pp)', 15)}${pad('±SE', 8)}裁決`);
    const ref = by['sh:0.55'];
    const f = (x) => x.d === D;
    for (const v of SHOULDERS) {
      if (v === '0.55') continue;
      const res = by[`sh:${v}`];
      const pk = paired(seedRates(ref, f, isKill), seedRates(res, f, isKill));
      const pb = paired(seedRates(ref, f, (x) => x.out === 'blockKill'),
        seedRates(res, f, (x) => x.out === 'blockKill'));
      say(`  ${pad(v, 8)}${pad(`${pk.d >= 0 ? '+' : ''}${(pk.d * 100).toFixed(2)}`, 13)}`
        + `${pad((pk.se * 100).toFixed(2), 8)}${pad(pk.verdict, 22)}`
        + `${pad(`${pb.d >= 0 ? '+' : ''}${(pb.d * 100).toFixed(2)}`, 15)}`
        + `${pad((pb.se * 100).toFixed(2), 8)}${pb.verdict}`);
    }
    say('');
  }
  say('  牆覆蓋寬與過網點的落差分佈（三人牆專屬：只取過網瞬間 nW===3 的球）');
  say(`  ${pad('肩距', 8)}${pad('守方', 6)}${pad('n', 6)}${pad('牆內側三人x全距p50', 20)}`
    + `${pad('覆蓋寬p50', 11)}${pad('離牆心 p50/p90', 16)}帶內比例`);
  for (const v of SHOULDERS) {
    for (const D of ['B', 'A']) {
      const a = allAtk(by[`sh:${v}`], (x) => x.d === D && x.nW === 3 && x.wallW != null);
      if (!a.length) { say(`  ${pad(v, 8)}${pad(D, 6)}0`); continue; }
      const sp = a.map((x) => x.wallXs[2] - x.wallXs[0]);
      const w = a.map((x) => x.wallW);
      const mo = a.map((x) => x.wallMissX);
      say(`  ${pad(v, 8)}${pad(D, 6)}${pad(a.length, 6)}${pad(f2(q(sp, 0.5)), 20)}`
        + `${pad(f2(q(w, 0.5)), 11)}${pad(`${f2(q(mo, 0.5))}/${f2(q(mo, 0.9))}`, 16)}`
        + `${pc(a.filter((x) => x.inBand === 1).length, a.length)}`);
    }
  }
  say('');
  say('── 附：每局攻擊數與觸手數（樣本規模參考）──');
  for (const r of results) {
    const per = r.sets.map((s) => REAL(s.attacks).length);
    const bt = r.sets.map((s) => REAL(s.attacks).filter((x) => x.bt).length);
    say(`  [${pad(r.arm, 8)}] 攻擊/局 p50=${f1(q(per, 0.5))} 合計 ${per.reduce((a, b) => a + b, 0)}`
      + `｜觸手/局 p50=${f1(q(bt, 0.5))} 合計 ${bt.reduce((a, b) => a + b, 0)}`);
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
      env: { ...process.env, BMP_ARM: arm },
      encoding: 'utf8',
      maxBuffer: 1 << 29,
    });
    if (p.status !== 0) {
      process.stderr.write(p.stderr ?? '');
      throw new Error(`臂 ${arm} 失敗（exit ${p.status}）`);
    }
    const line = (p.stdout ?? '').split('\n').find((l) => l.startsWith('##RESULT##'));
    if (!line) { process.stderr.write(p.stdout ?? ''); throw new Error(`臂 ${arm} 無輸出`); }
    results.push(JSON.parse(line.slice('##RESULT##'.length)));
  }
  const text = report(results);
  console.log(text);
  const dir = process.env.BMP_OUT;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'block-marginal.json'), JSON.stringify(results), 'utf8');
    fs.writeFileSync(path.join(dir, 'block-marginal.txt'), `${text}\n`, 'utf8');
    process.stderr.write(`  [輸出寫至 ${dir}]\n`);
  }
}
