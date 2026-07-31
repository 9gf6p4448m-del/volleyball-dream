// 組合攻擊卷 段 B —— 組合排程層（真交叉）量化探針
//
// 用法：node tools/combo-probe.mjs [局數=24]
//
// ★ 這支探針要回答的三件事（段 B 驗收 ①②③）★
//   ① trust 分佈逐值不變（裁定 A 乙的直接證明）——**凍結輸入掃描**，見下方「為什麼不能
//      拿實跑分佈當這一條的判準」。
//   ② 交叉真的發生：發生次數／佔比，以及幾何三條件的**逐條通過率**
//      （不得只報總數——要看得出是哪一條在擋）。
//   ③ 前後腳：兩人**物理起跳 tick**（不是計畫 tick，藍圖 §〇.2）的差值分佈。
//
// ★ 為什麼 ① 要用凍結輸入掃描，而不是實跑的主攻者次數分佈 ★
// 交叉一旦接上抽籤，球路就變了 ⇒ 回合長度、比分、輪轉全部發散 ⇒ 實跑裡「哪些
// (輪轉, flightId, trust 狀態) 組合會出現」本來就不一樣，兩邊的實跑次數分佈**構造上
// 不可能逐值相同**，拿它當「trust 沒被動到」的證據會直接證偽一件其實成立的事。
// 裁定 A 乙真正主張的是：**同一個輸入，選人結果一樣**（pickAttackPoint 及其入參未動）。
// 本節因此凍結輸入：真實 `createGame` ＋ 真實六個輪轉 ＋ 真實 `aiCollectIntents`
// 規劃路徑，只把 flightId／輪轉／seed 當自變數掃過去，逐筆記下被選中的主攻者。
// 這條掃描在基準 worktree 上也跑得起來（本檔對組合層的 import 是選擇性的），
// 兩邊的**逐筆序列雜湊**必須相同。
//
// tick↔秒：SIM_HZ = 60 ⇒ 1 tick = 1/60 s。
import { createHash } from 'node:crypto';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, attackPointsOf } from '../src/sim/ai.js';
import { localToWorld } from '../src/sim/rotation.js';
import * as APPROACH_MOD from '../src/sim/approach.js';

const { applyRouteKinds, CROSS_RATE, TAKEOFF } = APPROACH_MOD;
// 段 B 之前（基準 worktree）沒有這些匯出——選擇性取用，讓本檔在基準上也跑得完
const evaluateCombination = APPROACH_MOD.evaluateCombination ?? null;
const CROSS_PLAY_RATE = APPROACH_MOD.CROSS_PLAY_RATE ?? null;

const SETS = Number(process.argv[2] ?? 24);
// 單 tick 位移小於此＝站著不動（口徑同 tools/tempo-routeb-probe.mjs 的 STILL_EPS）。
// 助跑中的人每 tick 走一個完整步長（≈0.07m），同隊避讓的推擠也有 0.093m ⇒ 這個門檻
// 只會在「moveIntent 的目標就是自己現在的位置」時成立，也就是 sim 自己的
// 「到位即停＝原地拔起」那一格（ai.js 助跑段與攻擊手起跳點分支用的是同一把尺）。
const STILL_EPS = 0.005;
// 「靜止＝起跳」只在起跳點附近才成立（見下方 runSets 內的位置閘註解）。
const NEAR_TAKEOFF_M = 1.0;

const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : 'n/a');

// ════════════════════════════════════════════════════════════
// ① 凍結輸入掃描：同一組輸入下的主攻者選擇（trust 分佈的逐值證據）
// ════════════════════════════════════════════════════════════
function trustSweep() {
  const w = localToWorld('A', 1.2, 1.2);
  const picks = {};
  const kinds = {};
  const seq = [];
  let combos = 0;
  for (let seed = 1; seed <= 6; seed += 1) {
    const g = createGame({ seed });
    const base = g.match.rotations.A.slice();
    for (let rot = 0; rot < 6; rot += 1) {
      g.match.rotations.A = [...base.slice(rot), ...base.slice(0, rot)];
      for (let f = 1; f <= 60; f += 1) {
        const ai = createAiState();
        g.phase = 'rally';
        Object.assign(g.rally, {
          flightId: f,
          profile: 'arc',
          possession: 'A',
          touches: 1,
          lastTouchTeam: 'A',
          lastToucherId: null,
          touchLockTick: -1,
        });
        const b = g.ball;
        b.x = w.x; b.y = 3.0; b.z = w.z; b.vx = 0; b.vy = 0.5; b.vz = 0;
        b.px = b.x; b.py = b.y; b.pz = b.z;
        aiCollectIntents(g, ai);
        if (!ai.attackerId) continue;
        picks[ai.attackerId] = (picks[ai.attackerId] ?? 0) + 1;
        kinds[ai.attackKind] = (kinds[ai.attackKind] ?? 0) + 1;
        if (ai.attackCombo) combos += 1;
        // 逐筆序列（不是只有次數統計）——次數相同但順序不同也要抓得出來
        seq.push(`${seed}/${rot}/${f}:${ai.attackerId}`);
      }
    }
    g.match.rotations.A = base;
  }
  return {
    picks, kinds, combos, n: seq.length, hash: createHash('sha256').update(seq.join('\n')).digest('hex').slice(0, 16),
  };
}

// ════════════════════════════════════════════════════════════
// ②③ 實跑
// ════════════════════════════════════════════════════════════
//
// 逐條通過率的取得路徑（`02 §6.1` 條 4）：**不重刻判斷式**。在每個規劃點用真實函式
// （attackPointsOf → applyRouteKinds → evaluateCombination）重建一次，並用
// `combo` 是否與 sim 內部產出的 `ai.attackCombo` 逐值相同來自我驗證重建的忠實度
// （下方 `fidelityMismatch` 必須為 0，否則本節的 checks 全部作廢）。
function runSets() {
  const kindCount = {};
  const attackerCount = {};
  const checkTally = {};
  const comboBy = {};              // `${mainKind}` → 次數
  let planPoints = 0;
  let comboPlans = 0;
  let fidelityMismatch = 0;
  let comboSpikes = 0;             // 組合成立且主攻者真的扣成的次數
  const physByTempo = {};          // tempo → 物理起跳（相對二傳觸球）：**整個池**（含誘餌）
  const physSpiker = {};           // 同上，但只取**真的扣成那一人**＝口徑校準用
  const stagger = [];              // 前後腳：main 物理起跳 − partner 物理起跳
  const staggerPlanned = [];       // 對照：同兩人的**計畫** tick 差（藍圖 §〇.2 的兩個座標系）
  // ---- ④ 段 B2：前後腳的代價面（口徑同 tools/tempo-probe.mjs ③）----
  const mainStand = [];            // 交叉主攻者**擊球前連續靜止** tick＝罰站
  const mainSetToHit = [];         // 交叉主攻者的 二傳實際觸球 → 擊球 tick（弧線常數）
  const mainPhys = [];             // 交叉主攻者物理起跳（相對二傳觸球）
  const partnerPhys = [];          // 配合者物理起跳（相對二傳觸球）
  const leadAvail = [];            // 規劃點能給的提前量＝預估 setTick − 規劃 tick
  const leadUsed = [];             // 實際生效的提前量＝預估 setTick − max(startTick, 規劃 tick)
  const startGap = [];             // 起步生效那一刻，主攻者離助跑起點多遠（m）

  for (let seed = 11; seed < 11 + SETS; seed += 1) {
    const g = createGame({ seed, setTarget: 25 });
    const ai = createAiState();
    let prevApproach = null;
    let curCombo = null;           // 本波的組合（規劃點記下）
    let curRoutes = null;          // 本波的 route 表（結算時查 tempo 用）
    let waveSetTick = null;        // 本波二傳實際觸球的 tick
    let waveSpiker = null;         // 本波真的扣成的人（口徑校準用）
    const prevPos = {};
    const stillRun = {};           // pid → 目前連續靜止了幾 tick（④ 罰站用，跨波累計）
    let stopTick = {};             // pid → 本波第一次「真的停下來」的絕對 tick
    // 一波結束才結算：一速的物理起跳發生在二傳觸球**之前**，當下還不知道要減去多少
    // ——當場相減會拿到上一波的 setTick（首版就是這樣量出 p50=141 的假值）。
    const flushWave = () => {
      if (!curRoutes) return;
      if (waveSetTick != null) {
        for (const rt of curRoutes) {
          if (stopTick[rt.pid] === undefined) continue;
          (physByTempo[rt.tempo] ??= []).push(stopTick[rt.pid] - waveSetTick);
          if (rt.pid === waveSpiker) (physSpiker[rt.tempo] ??= []).push(stopTick[rt.pid] - waveSetTick);
        }
      }
      if (curCombo
        && stopTick[curCombo.mainId] !== undefined
        && stopTick[curCombo.partnerId] !== undefined) {
        stagger.push(stopTick[curCombo.mainId] - stopTick[curCombo.partnerId]);
        if (waveSetTick != null) {
          mainPhys.push(stopTick[curCombo.mainId] - waveSetTick);
          partnerPhys.push(stopTick[curCombo.partnerId] - waveSetTick);
        }
        const rMain = curRoutes.find((x) => x.pid === curCombo.mainId);
        const rPart = curRoutes.find((x) => x.pid === curCombo.partnerId);
        if (rMain?.takeoffTick != null && rPart?.takeoffTick != null) {
          staggerPlanned.push(rMain.takeoffTick - rPart.takeoffTick);
        }
      }
      curRoutes = null;
      curCombo = null;
      waveSetTick = null;
      waveSpiker = null;
      stopTick = {};
    };
    let guard = 0;
    while (g.phase !== 'set_over' && guard < 300000) {
      guard += 1;
      const intents = aiCollectIntents(g, ai);

      // ---- 規劃點（ai.approach 換了一份新的）----
      if (ai.approach && ai.approach !== prevApproach) {
        flushWave();
        planPoints += 1;
        const team = ai.approach.team;
        if (ai.attackerId) attackerCount[ai.attackerId] = (attackerCount[ai.attackerId] ?? 0) + 1;
        if (evaluateCombination) {
          const pts = applyRouteKinds(
            attackPointsOf(g, team, ai.claimId, ai.passTier, ai.passReceiverId),
            { flightId: g.rally.flightId, seed: g.seed ?? 0, passTier: ai.passTier },
          );
          const ev = evaluateCombination(pts, ai.attackerId, {
            team, flightId: g.rally.flightId, seed: g.seed ?? 0, passTier: ai.passTier,
          });
          for (const [k, v] of Object.entries(ev.checks)) {
            const t = (checkTally[k] ??= { pass: 0, seen: 0 });
            t.seen += 1;
            if (v) t.pass += 1;
          }
          if (JSON.stringify(ev.combo) !== JSON.stringify(ai.attackCombo ?? null)) {
            fidelityMismatch += 1;
          }
        }
        curCombo = ai.attackCombo ?? null;
        curRoutes = ai.approach.routes ?? [];
        if (curCombo) {
          comboPlans += 1;
          comboBy[curCombo.mainKind] = (comboBy[curCombo.mainKind] ?? 0) + 1;
          // ④ 提前量：規劃點（＝本 tick）到預估二傳觸球之間有多少 tick 可用。
          // startTick 早於規劃點的部分是**拿不到的**（route 是這一刻才存在的）
          // ⇒ leadUsed 才是實際生效的偏移，leadAvail 是它的上界。
          const stPlan = ai.approach.setTick;
          const rMain = curRoutes.find((x) => x.pid === curCombo.mainId);
          if (stPlan != null && rMain?.startTick != null) {
            leadAvail.push(stPlan - g.tick);
            leadUsed.push(stPlan - Math.max(rMain.startTick, g.tick));
            const am = g.actors[curCombo.mainId];
            if (am) startGap.push(Math.hypot(am.x - rMain.start.x, am.z - rMain.start.z));
          }
        }
        prevApproach = ai.approach;
      }

      // ---- 物理起跳＝「跑到位、停下來拔起」的那一 tick（攔網手讀得到的值）----
      // **不是** route.takeoffTick（計畫值；藍圖 §〇.2 一速兩者差 29 tick、
      // blockRead.js 明文刻意不讀 route 表）。判準＝單 tick 位移 < STILL_EPS，
      // 即 sim 自己那句「到位即停＝原地拔起」（ai.js 助跑段／攻擊手起跳點分支同一把尺）。
      for (const rt of (curRoutes ?? [])) {
        const pid = rt.pid;
        const a = g.actors[pid];
        if (!a || stopTick[pid] !== undefined) continue;
        const p0 = prevPos[pid];
        if (!p0) continue;
        // 起步之後才算（起步前站在助跑起點等，那不是起跳）
        if (rt.startTick == null || g.tick < rt.startTick + 2) continue;
        // ★ 而且人必須真的**離開助跑起點** ★ 被選中的攻擊手有一段「一氣呵成助跑」的
        // 等待姿勢（ai.js:896-910）：起步 tick 到了他仍站在助跑起點不動，等球墜近才衝。
        // 少了這道濾網，三速攻擊手的「物理起跳」會被量成那段罰站的第一格
        // （首版實測 p50 掉到 +12，而逐波軌跡實際是 +81）。
        if (Math.hypot(a.x - rt.start.x, a.z - rt.start.z) <= TAKEOFF.SETTLE) continue;
        // ★ 段 B2 修正：**還要真的站在自己那條線的起跳點附近** ★
        // 段 B 的版本只要求「離開起點後第一次靜止」。那在段 B 成立，因為三速的人在
        // 二傳觸球前一直站在助跑起點（被上一行濾掉）；但 tempoGap > 0 之後主攻者在
        // 觸球前就已經在半路上，而**二傳觸球會讓全隊重新規劃、每個人各自吃一次
        // reactionTicks（實測 ~10 tick）**——那 10 tick 的靜止會被記成「物理起跳」，
        // 量到的前後腳因此塌成 ~7 tick 的假值（逐 tick 軌跡：主攻者在 set+0 站在
        // 離起跳點 3.1m 的半路上，set+2 又跑起來，真正到位是 set+45）。
        // 這道位置閘就是「量測位置」那一條（`02 §6.1` 條 5）：靜止只有發生在起跳點
        // 附近時才是起跳。1.0m 的餘裕＝名目起跳點與 hitPoint 導出的實際起跳點之差
        // （實測 0.44m），比半路上的距離（≥2m）小一個量級。
        if (Math.hypot(a.x - rt.takeoff.x, a.z - rt.takeoff.z) > NEAR_TAKEOFF_M) continue;
        if (Math.hypot(a.x - p0.x, a.z - p0.z) < STILL_EPS) stopTick[pid] = g.tick;
      }
      for (const pid of Object.keys(g.actors)) {
        const a = g.actors[pid];
        // ④ 連續靜止計數（罰站量法，口徑同 tools/tempo-probe.mjs ③：擊球那一刻
        // 已經連續站著不動幾 tick）——與上面的「第一次靜止」是兩個不同的量。
        const p0 = prevPos[pid];
        const st = p0 ? Math.hypot(a.x - p0.x, a.z - p0.z) : 1;
        stillRun[pid] = st < STILL_EPS ? (stillRun[pid] ?? 0) + 1 : 0;
        prevPos[pid] = { x: a.x, z: a.z };
      }

      const ev = stepGame(g, intents);
      for (const e of ev) {
        if (e.type === 'TOUCH' && e.touches === 2 && curRoutes && ai.approach?.team === e.team) {
          waveSetTick = g.tick;
        }
        if (e.type === 'TOUCH' && e.kind === 'spike' && e.touches === 3) {
          const k = ai.attackKind ?? 'n/a';
          kindCount[k] = (kindCount[k] ?? 0) + 1;
          waveSpiker = e.playerId;
          if (curCombo && curCombo.mainId === e.playerId) {
            comboSpikes += 1;
            mainStand.push(stillRun[e.playerId] ?? 0);
            if (waveSetTick != null) mainSetToHit.push(g.tick - waveSetTick);
          }
        }
        if (e.type === 'DEAD_BALL') flushWave();
      }
    }
    flushWave();
  }
  return {
    kindCount, attackerCount, checkTally, comboBy, planPoints, comboPlans,
    fidelityMismatch, comboSpikes, physByTempo, physSpiker, stagger, staggerPlanned,
    mainStand, mainSetToHit, mainPhys, partnerPhys, leadAvail, leadUsed, startGap,
  };
}

// ════════════════════════════════════════════════════════════
// 輸出
// ════════════════════════════════════════════════════════════
const sweep = trustSweep();
console.log('══ ① 凍結輸入掃描：主攻者選擇（trust 分佈的逐值證據）══');
console.log(`  樣本 n=${sweep.n}（6 seed × 6 輪轉 × 60 flightId，真實 aiCollectIntents 規劃路徑）`);
console.log(`  ★ 逐筆序列雜湊 = ${sweep.hash} ★  ← 與基準 worktree 必須逐值相同`);
console.log(`  每個 pid 被選為主攻者的次數：${JSON.stringify(sweep.picks)}`);
console.log(`  （參考）本次的攻擊線分佈：${JSON.stringify(sweep.kinds)}`);
console.log(`  （參考）本掃描內的組合成立次數：${sweep.combos}／${sweep.n} = ${pct(sweep.combos, sweep.n)}`);

const r = runSets();
console.log(`\n══ ② 實跑（seed 11..${10 + SETS}，${SETS} 局）：交叉的發生與逐條條件 ══`);
console.log(`  CROSS_RATE（內切，未動）=${CROSS_RATE}　CROSS_PLAY_RATE（交叉，新）=${CROSS_PLAY_RATE}`);
console.log(`  規劃點 ${r.planPoints} 次；其中組合成立 ${r.comboPlans} 次 = ${pct(r.comboPlans, r.planPoints)}`);
console.log(`  組合型別分佈：${JSON.stringify(r.comboBy)}`);
console.log(`  組合成立且主攻者真的扣成：${r.comboSpikes} 次`);
console.log(`  重建忠實度（重建的 combo ≠ sim 內部的 attackCombo 的次數）：${r.fidelityMismatch}`
  + `${r.fidelityMismatch === 0 ? '（0＝下面的逐條通過率有效）' : ' ★ 非 0＝本節作廢 ★'}`);
console.log('  ── 逐條通過率（分母＝走到該條的規劃點；前一條沒過就不會走到下一條）──');
const ORDER = ['hasMain', 'mainKind', 'tier', 'partner', 'crosses', 'behind', 'outOfReach', 'roll'];
const LABEL = {
  hasMain: '主攻者在池內',
  mainKind: "主攻者跑 'left'（＝可升級成交叉）",
  tier: '一傳到位（perfect）',
  partner: '池內有 quick 配合者（幾何最近）',
  crosses: '條件2 穿越（線段 lx 區間含 0）',
  behind: '條件3 後方（lz(0) > quick 起跳 lz）',
  outOfReach: '條件5 搆不到（> BLOCK_REACH_X）',
  roll: `觸發骰（CROSS_PLAY_RATE=${CROSS_PLAY_RATE}）`,
};
for (const k of ORDER) {
  const t = r.checkTally[k];
  if (!t) continue;
  console.log(`    ${LABEL[k].padEnd(34)} ${String(t.pass).padStart(5)}/${String(t.seen).padStart(5)}`
    + ` = ${pct(t.pass, t.seen).padStart(7)}`);
}
console.log(`  攻擊線實跑分佈（第三擊扣球）：${JSON.stringify(r.kindCount)}`);
const L = r.kindCount;
const ohLine = (L.left ?? 0) + (L.left_inside ?? 0) + (L.cross ?? 0);
console.log(`  OH 左線內：直線 ${pct(L.left ?? 0, ohLine)}／內切 ${pct(L.left_inside ?? 0, ohLine)}`
  + `／交叉 ${pct(L.cross ?? 0, ohLine)}（名目 ${((1 - CROSS_RATE) * (1 - (CROSS_PLAY_RATE ?? 0)) * 100).toFixed(1)}`
  + `／${(CROSS_RATE * 100).toFixed(1)}／${((1 - CROSS_RATE) * (CROSS_PLAY_RATE ?? 0) * 100).toFixed(1)}）`);
console.log(`  （參考）實跑主攻者次數：${JSON.stringify(r.attackerCount)}`
  + '　※ 實跑分佈**不是** ① 的判準（球路發散，見檔頭）');

console.log('\n══ ③ 前後腳：兩人的物理起跳 tick 差（裁定 D 丙＝先量再定，本節只交分佈）══');
console.log('  量測口徑：起步後第一個「單 tick 位移 < 0.005m」的 tick＝人跑到位停下來拔起；'
  + '\n  **不是** route.takeoffTick（計畫值，一速兩者差 29 tick，藍圖 §〇.2）');
console.log('  ── 口徑校準：各節奏的物理起跳（相對二傳觸球 tick）──');
console.log('     藍圖 §〇.2 的基準（tools/tempo-routeb-probe.mjs 量的是**真的扣成那一人**）：'
  + '一速 +15／二速 +44／三速 +68');
for (const t of ['one', 'two', 'three']) {
  const a = r.physSpiker[t] ?? [];
  const all = r.physByTempo[t] ?? [];
  console.log(`     ${t.padEnd(6)} 扣成者 n=${String(a.length).padStart(4)}`
    + `  p25=${q(a, 0.25)}  p50=${q(a, 0.5)}  p75=${q(a, 0.75)}`
    + `　｜整池（含誘餌） n=${String(all.length).padStart(4)}  p50=${q(all, 0.5)}`);
}
console.log('  ── 交叉兩人的前後腳（main 物理起跳 − partner 物理起跳；正值＝主攻者後起跳）──');
if (!r.stagger.length) {
  console.log('     n=0 ★ 沒有樣本 ★');
} else {
  const s = r.stagger;
  console.log(`     n=${s.length}  min=${q(s, 0)}  p10=${q(s, 0.1)}  p25=${q(s, 0.25)}`
    + `  **p50=${q(s, 0.5)}**  p75=${q(s, 0.75)}  **p90=${q(s, 0.9)}**  max=${q(s, 0.999)}`
    + `  平均 ${mean(s).toFixed(1)}`);
  const buckets = {};
  for (const v of s) {
    const b = Math.floor(v / 10) * 10;
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  console.log(`     分佈（每 10 tick 一格，tick 差 → 筆數）：${JSON.stringify(
    Object.fromEntries(Object.keys(buckets).map(Number).sort((a, b) => a - b)
      .map((k) => [`${k}~${k + 9}`, buckets[k]])),
  )}`);
  console.log(`     同時起跳（差 0 tick）佔比：${pct(s.filter((v) => v === 0).length, s.length)}`);
  if (r.staggerPlanned.length) {
    const pl = r.staggerPlanned;
    console.log(`     ※ 對照：同兩人的**計畫** tick 差 p50=${q(pl, 0.5)}／p90=${q(pl, 0.9)}`
      + '（兩個座標系不同值＝護欄 3 的存在理由）');
  }
}
// ── ④ 段 B2：前後腳的代價面 ──
const CROSS_TEMPO_GAP = APPROACH_MOD.CROSS_TEMPO_GAP ?? null;
console.log('\n══ ④ 前後腳的代價面（tempoGap 的取捨；罰站口徑同 tools/tempo-probe.mjs ③）══');
console.log(`  CROSS_TEMPO_GAP = ${CROSS_TEMPO_GAP}（交叉主攻者比三速黃金錨點提早幾 tick 起步）`);
const row = (label, arr, unit = 'tick') => {
  if (!arr?.length) { console.log(`  ${label.padEnd(30)} n=0`); return; }
  console.log(`  ${label.padEnd(30)} n=${String(arr.length).padStart(4)}`
    + `  p10=${q(arr, 0.1)}  p50=${q(arr, 0.5)}  p90=${q(arr, 0.9)}  平均 ${mean(arr).toFixed(1)} ${unit}`);
};
row('主攻者物理起跳 − 二傳觸球', r.mainPhys);
row('配合者物理起跳 − 二傳觸球', r.partnerPhys);
row('主攻者 二傳觸球→擊球', r.mainSetToHit);
row('★ 主攻者擊球前連續靜止（罰站）', r.mainStand);
if (r.mainStand.length) {
  const over = r.mainStand.filter((v) => v > 30).length;
  console.log(`     站 > 0.5s（30 tick，07-23 硬線）佔比：${pct(over, r.mainStand.length)}`
    + `　｜ 站 > 0.2s（12 tick＝AI.APPROACH_LEAD 的容許量）：`
    + `${pct(r.mainStand.filter((v) => v > 12).length, r.mainStand.length)}`);
}
row('規劃點可用提前量（上界）', r.leadAvail);
row('實際生效提前量', r.leadUsed);
row('起步時離助跑起點', r.startGap, 'm');
console.log(`  主攻者扣成率：${pct(r.comboSpikes, r.comboPlans)}（${r.comboSpikes}/${r.comboPlans}）`);

console.log(`\n（BLOCK_REACH_X=${TUNING.BLOCK_REACH_X}）`);
