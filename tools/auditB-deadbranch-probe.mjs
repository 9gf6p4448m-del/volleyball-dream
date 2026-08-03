// B 路稽核探針 —— 恆真／恆假／不可達分支的實跑證實（唯讀，零 src/ 改動）
//
// 用法：
//   node tools/auditB-deadbranch-probe.mjs [局數=24]
//
// ★ 本檔對 `src/`、`tests/`、其他 tools 一個位元組都不寫。★
//
// ── 要證實／否證的五個判斷式 ────────────────────────────────
// D1 `ai.js:2127` spikeClearsNet 的 `yNet >= NET_HEIGHT + RADIUS + 0.04`（＝2.575）
//    疑似恆真：`spikeVelocity` 本身就會把飛行時間拉長到「過網高度 >= clearance」，
//    而 clearance ＝ `spikeClearanceFor(route, timing=1)` ＝ 該 route 帶**下緣**
//    ∈ {quick 2.655, wing 2.66, back 2.75}（timing=1 ⇒ 不可能是 tip 2.575）。
//    ⇒ yNet 的下確界 2.655 > 門檻 2.575，這道「打不過網就不硬扣」的閘從未擋下任何一球。
//    量法有兩條，互相獨立：
//      (a) **真實路徑**：AI 第三擊的 Intent 是 spike 還是 receive。在
//          `legalSpike && ball.y >= SPIKE_MIN_Y` 都成立的樣本裡，action==='receive'
//          ⟺ spikeClearsNet 回 false（chooseTouch 的唯一其他出口）。
//      (b) **真實函式的性質掃描**：拿 `spikeVelocity`／`heightAtNet`／`spikeClearanceFor`
//          （皆為 src 的匯出，不重抄邏輯）在大範圍幾何上掃 yNet − 門檻 的最小值。
//    ⚠ 鑑別力：同時報 yNet 的實際分佈——若 min(yNet) 遠高於門檻，代表「要讓這道閘
//      有鑑別力，門檻至少要高過 min(yNet)」，這才是它失效的量。
//
// D2 `ai.js:1391` `bs !== 0`（攔網讀期 MB 邊線讓位）
//    構造性恆假：該區塊在 `if (planX == null)` 內，而 `anchorX = planX ?? 0`
//    ⇒ anchorX 在該分支是**字面常數 0** ⇒ `bs = Math.sign(0) = 0`。
//    無 runtime 觀測點（anchorX 是區域變數），本檔只做 `Math.sign` 的行為存證，
//    並量「讀期分支被走到的頻率」證明這段程式碼真的常常被執行到（不是死路本身）。
//
// D3 `game.js:953` receiveQualityMul 的 `r = min(1, dist / reach)`，呼叫端傳
//    `reach = TUNING.REACH_RADIUS`（1.3，＝收斂前的基底），但實際接球可及半徑
//    已收斂為 `reachRadiusFor(RECEIVE) = 0.38×H`。分子分母不同座標系 ⇒ r 的值域塌掉，
//    「勉強搆＝散佈 ×1.1」那一端到不了。量 AI 決策時點的 dist 分佈與 r 的上界。
//
// D4 `ai.js:1253-1256` AI 魚躍閘用 `TUNING.REACH_RADIUS`(1.3) 當「站著搆不到」的下界，
//    但站立接球可及已收斂到 0.38×H≈0.67。⇒ dist ∈ (真實可及, 1.3] 這一段
//    「搆不到、也不撲」＝結構性放生區。量 dist 的分桶佔比。
//
// D5 `ai.js:1226` 跳舉帶 `ball.y ∈ (standingReach+0.35, spikeReach]`——量它非空、
//    且真的有 jump:true 的 set Intent 出去（對照 aiState.jumpSet 抽中率）。
//
// ── 證據取得路徑（全部走真實路徑）────────────────────────────
// 建隊＝`careerMatchSetup`（同 sim-hash-probe／triple-block-probe）；雙方 AI 代打。
// 每 tick 在 `aiCollectIntents` **回傳後、`stepGame` 之前**取樣：那一刻的
// `game.ball`／`game.actors` 正是 `decideOne` 當時看到的輸入（decideOne 不改狀態），
// 所以量到的幾何量與 AI 判斷式吃的是**同一組數字**，不是事後重建。
// 判斷式的結果一律從**發出去的 Intent** 讀，不重抄 src 的邏輯（避免循環論證）。

import { createGame, stepGame, TUNING, spikeClearanceFor } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI, attackPointsOf } from '../src/sim/ai.js';
import { applyRouteKinds, evaluateCombinations, COMBO_TYPES } from '../src/sim/approach.js';
import { spikeVelocity, heightAtNet } from '../src/sim/flight.js';
import { reachRadiusFor, REACH_ACTION } from '../src/sim/reach.js';
import { standingReach, spikeReach, moveSpeed } from '../src/sim/player.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { COURT, BALL, SIM_DT } from '../src/sim/constants.js';
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

const SETS = Number.parseInt(process.argv[2] ?? '24', 10);
const MAX_TICKS = 400000;
const OPPS = ['obsidian', 'white-wave', 'black-pine'];

// ════════════════════════════════════════════════════════════
// 累加器
// ════════════════════════════════════════════════════════════
const acc = {
  // D1
  // d1.ctrlReceive＝對照臂：第三擊在「不合法攻擊 ∨ 球太低」時的 receive 次數。
  // 它證明「action==='receive'」這個觀測格**是量得到的**——若對照臂也是 0，
  // 代表探針根本看不見 receive，D1 的 0/N 就沒有鑑別力（02 §6.1 條 1）。
  d1: { n: 0, spike: 0, receive: 0, ballY: [], ctrlReceive: 0, ctrlN: 0 },
  // D2
  d2: { blockerTicks: 0, readTicks: 0 },
  // D3
  d3: { dists: [], heights: new Set() },
  // D4：對方來球、球下墜且已低於 DIVE_MAX_Y 時，被指派接球者離球的水平距離分桶
  d4: { buckets: [0, 0, 0, 0, 0], n: 0, samples: [] },
  // D5
  d5: { setIntents: 0, jumpSetIntents: 0, jumpFlagTicks: 0, setWindowTicks: 0, bandY: [] },
  // 附帶：passTier 分佈（S1 反解宣稱 87/8/5，順帶查它沒有退化）
  tier: { perfect: 0, ok: 0, poor: 0, null: 0 },
  // 附帶：攔網手態分佈（retract 是否真的出得來）
  hand: { press: 0, vertical: 0, retract: 0 },
  // D4b：以「一顆球」為單位——這顆來球有沒有出現過「只落在放生區、從沒進過可觸/可撲區」
  d4b: { flights: 0, everTry: 0, everDive: 0, strandedOnly: 0 },
  // D6：組合攻擊 9 條結構條件在**真實池**上的 true/false 次數
  d6: { n: 0, byType: {} },
};
for (const t of COMBO_TYPES) acc.d6.byType[t] = {};

function setupMatch(oppId, run) {
  const career = createCareer({ seed: 700000 + run * 6151, playerName: '稽核' });
  const player = createCareerPlayer('稽核');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: oppId, label: '' };
  return careerMatchSetup(career, player, entry, roster, null);
}

function runSet(setup) {
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const ai = createAiState();
  for (const p of Object.values(game.players)) acc.d3.heights.add(p.height.current);

  let lastTierFlight = -1;
  let lastComboFlight = -1;
  // D4b：一顆來球（flightId）為單位的桶命中記錄
  let curFlight = -1;
  let fl = null;
  const closeFlight = () => {
    if (!fl) return;
    acc.d4b.flights += 1;
    if (fl.tryOk) acc.d4b.everTry += 1;
    if (fl.diveOk) acc.d4b.everDive += 1;
    // 「只進得了放生區」＝全程沒有任何一 tick 落在「伸手可及」或「撲得到」
    if (fl.stranded && !fl.tryOk && !fl.diveOk) acc.d4b.strandedOnly += 1;
    fl = null;
  };

  while (game.phase !== 'set_over' && game.phase !== 'matchover' && game.tick < MAX_TICKS) {
    const r = game.rally;
    const b = game.ball;
    // ★ 取樣點：intent 產生後、stepGame 之前。此刻的 ball/actors 就是 decideOne 的輸入。
    const intents = aiCollectIntents(game, ai, []);

    // ---- D1：第三擊的攻擊／保守二選一 ----
    if (game.phase === 'rally' && r.touches === 2) {
      for (const it of intents) {
        if (it.tick !== game.tick) continue;
        if (it.action !== 'spike' && it.action !== 'receive') continue;
        const p = game.players[it.playerId];
        if (!p || p.teamId !== r.possession) continue;
        // chooseTouch 第三擊分支的前兩個條件（純可觀察量，不是被測判斷式本身）
        const rot = game.match.rotations[p.teamId];
        const side = p.teamId === 'A' ? 1 : -1;
        const lzNow = side * game.actors[it.playerId].z;
        const legalSpike = p.currentRole !== 'libero'
          && (isFrontRow(rot, it.playerId) || lzNow > COURT.ATTACK_LINE + 0.05);
        if (!legalSpike || b.y < AI.SPIKE_MIN_Y) {
          // 對照臂：前置條件沒過的第三擊。這一格必須量得到 receive，
          // 否則主臂的 0/N 只是「探針看不見 receive」而不是「判斷式恆真」。
          acc.d1.ctrlN += 1;
          continue;
        }
        // 此時 canSpike 的唯一未知項＝spikeClearsNet
        acc.d1.n += 1;
        acc.d1.ballY.push(b.y);
        if (it.action === 'spike') acc.d1.spike += 1; else acc.d1.receive += 1;
      }
    }

    // ---- D2：攔網分支被走到的頻率（讀期＝blockPlan 尚未建立） ----
    if (game.phase === 'rally' && r.possession) {
      for (const team of ['A', 'B']) {
        if (r.possession === team) continue;
        const rot = game.match.rotations[team];
        const receivingArc = ai.landingTeam === team && r.profile !== 'spike';
        if (receivingArc) continue;
        for (const pid of rot) {
          if (!isFrontRow(rot, pid)) continue;
          acc.d2.blockerTicks += 1;
          if (!ai.blockPlan || ai.blockPlan.team !== team) acc.d2.readTicks += 1;
        }
      }
    }

    // ---- D3 / D4：接球者的決策時點幾何 ----
    if (game.phase === 'rally') {
      for (const it of intents) {
        if (it.tick !== game.tick) continue;
        const p = game.players[it.playerId];
        if (!p) continue;
        const a = game.actors[it.playerId];
        const dist = Math.hypot(b.x - a.x, b.z - a.z);
        if (it.action === 'receive') acc.d1.ctrlReceive += 1; // 通道有效性對照（見 D1 輸出）
        if (it.action === 'receive' && r.touches === 0) acc.d3.dists.push(dist);
        // D5
        if (it.action === 'set') {
          acc.d5.setIntents += 1;
          if (it.jump === true) { acc.d5.jumpSetIntents += 1; acc.d5.bandY.push(b.y); }
        }
      }
      // D4：來球（touches===0）、球下墜且已進入魚躍高度帶，量主追者的水平距離
      if (r.touches === 0 && ai.claimId && b.vy < 0 && b.y <= TUNING.DIVE_MAX_Y) {
        const p = game.players[ai.claimId];
        const a = game.actors[ai.claimId];
        if (p && a) {
          const dist = Math.hypot(b.x - a.x, b.z - a.z);
          const recvR = reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, p.height.current);
          const diveR = reachRadiusFor(REACH_ACTION.DIVE, TUNING, p.height.current);
          const tryLo = recvR * AI.ATTEMPT_RADIUS;         // AI 願意伸手的上界
          const simDive = diveR + BALL.RADIUS;             // sim 魚躍真的搆得到的上界
          const aiDiveLo = TUNING.REACH_RADIUS;            // AI 願意撲的下界（1.30）
          const aiDiveHi = TUNING.REACH_RADIUS * TUNING.DIVE_REACH_MUL; // 2.34
          acc.d4.n += 1;
          if (r.flightId !== curFlight) { closeFlight(); curFlight = r.flightId; fl = {}; }
          if (dist <= tryLo) { acc.d4.buckets[0] += 1; fl.tryOk = true; }  // 伸手可及
          else if (dist <= aiDiveLo) { acc.d4.buckets[1] += 1; fl.stranded = true; } // ★放生區★
          else if (dist <= simDive) { acc.d4.buckets[2] += 1; fl.diveOk = true; }    // 撲得到
          else if (dist <= aiDiveHi) acc.d4.buckets[3] += 1;               // ★撲了也搆不到★
          else acc.d4.buckets[4] += 1;                                     // 太遠
          if (acc.d4.samples.length < 5000) {
            acc.d4.samples.push({ dist, tryLo, simDive });
          }
        }
      }
      // D5：第二觸窗內 aiState.jumpSet 的旗標時間
      if (r.touches === 1 && r.possession === ai.landingTeam) {
        acc.d5.setWindowTicks += 1;
        if (ai.jumpSet) acc.d5.jumpFlagTicks += 1;
      }
      // ---- D6：組合攻擊的 9 條結構條件在**真實池**上到底擋過幾次 ----
      // 池的重建方式逐字抄 `ai.js replanContextOf`（那是 src 自己重建同一顆池的作法），
      // 三個輸入全部取自本波已定案的協調層狀態 ⇒ 與 ensureFlightPlan 當時算的是同一顆池。
      // `evaluateCombinations` 是 src 的匯出純函式，直接呼叫＝真實路徑，不重抄判斷式。
      if (r.touches === 1 && r.flightId !== lastComboFlight
        && ai.landingTeam && r.possession === ai.landingTeam && ai.attackerId) {
        lastComboFlight = r.flightId;
        const team = ai.landingTeam;
        const tier = ai.passTier ?? 'perfect';
        const pts = applyRouteKinds(
          attackPointsOf(game, team, ai.claimId, tier, ai.passReceiverId),
          { flightId: r.flightId, seed: game.seed ?? 0, passTier: tier },
        );
        const { byType } = evaluateCombinations(pts, ai.attackerId, {
          team, flightId: r.flightId, seed: game.seed ?? 0, passTier: tier,
          comboScale: game.comboScale ?? 1,
        });
        acc.d6.n += 1;
        for (const t of COMBO_TYPES) {
          // evaluateCombinations 回的 byType[type] **就是** checks 物件本身（approach.js:832）
          const checks = byType[t] ?? {};
          const bucket = acc.d6.byType[t];
          for (const [k, v] of Object.entries(checks)) {
            bucket[k] ??= { t: 0, f: 0 };
            if (v) bucket[k].t += 1; else bucket[k].f += 1;
          }
        }
      }
      // 附帶：passTier / hand
      if (r.touches === 1 && r.flightId !== lastTierFlight) {
        lastTierFlight = r.flightId;
        const t = ai.passTier ?? 'null';
        if (acc.tier[t] !== undefined) acc.tier[t] += 1;
      }
      for (const it of intents) {
        if (it.action === 'block' && it.tick === game.tick) {
          const h = it.hand ?? 'vertical';
          if (acc.hand[h] !== undefined) acc.hand[h] += 1;
        }
      }
    }

    stepGame(game, intents);
  }
  closeFlight();
}

// ════════════════════════════════════════════════════════════
// 跑
// ════════════════════════════════════════════════════════════
for (let s = 0; s < SETS; s += 1) {
  runSet(setupMatch(OPPS[s % OPPS.length], s));
}

// ════════════════════════════════════════════════════════════
// D1(b) 真實函式的性質掃描 —— 不重抄邏輯，直接呼叫 src 的匯出
// ════════════════════════════════════════════════════════════
// 掃描域＝實戰可達的擊球幾何超集：
//   from  擊球點：|x| ≤ 4.5、y ∈ [SPIKE_MIN_Y, 3.6]、|z| ∈ [0.05, 4.5]
//   to    目標：對面半場（含 SPIKE_ZONES 的 |lx| 4.1／lz 2.3–5 全覆蓋）＋界外緩衝
//   speed spikeSpeed 的全值域 [BASE, BASE + 100×PER] = [9, 26]
//   clearance 走真實 `spikeClearanceFor(route, 1)`，route 取 spikeRouteAt 在 timing=1
//             可能回的三種（tip 需 timing ≤ 0.45，預判固定用 timing=1 ⇒ 不可能）
const THRESH = COURT.NET_HEIGHT + BALL.RADIUS + 0.04;
const ROUTES_AT_T1 = ['quick', 'wing', 'back'];
let sweepN = 0;
let sweepBelowThresh = 0;
let sweepBelowClear = 0;
let minMarginThresh = Infinity;
let minYNet = Infinity;
let maxYNet = -Infinity;
const sweepCf = { 2.6: 0, 2.7: 0, 2.8: 0, 3: 0 };
{
  // 決定論的偽亂數（不吃 sim 的 rng，純掃描）
  let s = 123456789;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const SWEEP = 400000;
  for (let i = 0; i < SWEEP; i += 1) {
    const sideSign = rnd() < 0.5 ? 1 : -1;
    const from = {
      x: (rnd() * 2 - 1) * 4.5,
      y: AI.SPIKE_MIN_Y + rnd() * (3.6 - AI.SPIKE_MIN_Y),
      z: sideSign * (0.05 + rnd() * 4.45),
    };
    const to = {
      x: (rnd() * 2 - 1) * 5.5,
      y: BALL.RADIUS,
      z: -sideSign * (0.5 + rnd() * 8.5),
    };
    const speed = TUNING.SPIKE_SPEED_BASE + rnd() * 100 * TUNING.SPIKE_SPEED_PER;
    const route = ROUTES_AT_T1[i % 3];
    const clearance = spikeClearanceFor(route, 1);
    const v = spikeVelocity(from, to, speed, TUNING.SPIKE_MIN_TIME, clearance);
    const yNet = heightAtNet(from, v);
    if (yNet === null) continue;
    sweepN += 1;
    if (yNet < minYNet) minYNet = yNet;
    if (yNet > maxYNet) maxYNet = yNet;
    if (yNet < THRESH) sweepBelowThresh += 1;
    for (const cf of [2.6, 2.7, 2.8, 3]) if (yNet < cf) sweepCf[cf] += 1;
    if (yNet < clearance - 1e-9) sweepBelowClear += 1;
    minMarginThresh = Math.min(minMarginThresh, yNet - THRESH);
  }
}

// ════════════════════════════════════════════════════════════
// 輸出
// ════════════════════════════════════════════════════════════
const q = (arr, p) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))];
};
const f = (v, d = 3) => (v == null || !Number.isFinite(v) ? '   n/a' : v.toFixed(d).padStart(7));
const pct = (k, n) => `${(100 * k / (n || 1)).toFixed(2)}%`;
const sePP = (k, n) => (n ? (100 * Math.sqrt((k / n) * (1 - k / n) / n)).toFixed(2) : 'n/a');

console.log(`=== B 路稽核探針（${SETS} 局，AI vs AI，careerMatchSetup 真實建隊）===\n`);
console.log(`CONVERGE_T = ${TUNING.CONVERGE_T}｜REACH_RADIUS(基底) = ${TUNING.REACH_RADIUS}`);
const HS = [...acc.d3.heights].sort((a, b) => a - b);
console.log(`場上身高範圍：${f(HS[0], 2)} – ${f(HS[HS.length - 1], 2)} m（相異 ${HS.length} 種）\n`);

// ---- D1 ----
console.log('──── D1 `ai.js:2127` spikeClearsNet 的過網門檻 ────');
console.log(`門檻＝NET_HEIGHT+RADIUS+0.04 = ${THRESH.toFixed(3)}`);
console.log('clearance（timing=1，即預判用的值）＝各 route 帶下緣：');
for (const rt of ROUTES_AT_T1) {
  console.log(`  ${rt.padEnd(6)} ${spikeClearanceFor(rt, 1).toFixed(3)}`
    + `   （帶：[${TUNING.SPIKE_CLEARANCE[rt].join(', ')}]）`);
}
console.log(`  tip    ${spikeClearanceFor('tip', 1).toFixed(3)}   ← timing=1 > TIP_CLEAR_T`
  + `(${TUNING.TIP_CLEAR_T}) ⇒ spikeRouteAt 不可能回 tip`);
console.log('');
console.log('(a) 真實路徑：AI 第三擊在「合法攻擊 ∧ 球高於 SPIKE_MIN_Y」下的出手選擇');
console.log(`    樣本 n = ${acc.d1.n}`);
console.log(`    action='spike'   ${acc.d1.spike}  (${pct(acc.d1.spike, acc.d1.n)})`);
console.log(`    action='receive' ${acc.d1.receive}  (${pct(acc.d1.receive, acc.d1.n)})`
  + `  ← 這一格 ⟺ spikeClearsNet 回 false`);
console.log(`    球高分佈 y：p0 ${f(q(acc.d1.ballY, 0))} p50 ${f(q(acc.d1.ballY, 0.5))}`
  + ` p100 ${f(q(acc.d1.ballY, 1))}`);
console.log(`    （前置條件沒過而被排除的第三擊 n = ${acc.d1.ctrlN}）`);
console.log(`    【對照臂・通道有效性】同一個觀測通道（讀 intent.action）在全場量到的`);
console.log(`      action='receive' 總次數 = ${acc.d1.ctrlReceive}`);
console.log(`      ↑ 遠大於 0 ⇒ 'receive' 這一格量得到；主臂的 0 是判斷式恆真，不是探針瞎`);
console.log('');
console.log(`(b) 真實函式性質掃描（spikeVelocity → heightAtNet，n = ${sweepN}）`);
console.log(`    yNet 範圍：min ${f(minYNet)}  max ${f(maxYNet)}`);
console.log(`    yNet < 門檻(${THRESH.toFixed(3)}) 的次數：${sweepBelowThresh} / ${sweepN}`);
console.log(`    yNet < 自己的 clearance 的次數：${sweepBelowClear} / ${sweepN}`);
console.log(`    最小餘裕 min(yNet − 門檻) = ${f(minMarginThresh)}`);
console.log(`    ⇒ 鑑別力：門檻要 > ${f(minYNet)} 才可能擋下任何一球（現值 ${THRESH.toFixed(3)}）`);
console.log(`    【對照臂】同一組樣本改用反事實門檻：`);
for (const cf of [2.60, 2.70, 2.80, 3.00]) {
  console.log(`      門檻 ${cf.toFixed(2)} ⇒ 會被擋下 ${sweepCf[cf]} / ${sweepN}`);
}
console.log('      ↑ 反事實門檻 > 2.655 時計數變成非 0 ⇒ 掃描本身有能力回報「擋下」，'
  + '現值 0 是門檻太低所致');
console.log('');

// ---- D2 ----
console.log('──── D2 `ai.js:1391` `bs !== 0`（讀期 MB 邊線讓位）────');
console.log(`Math.sign(0)  = ${Math.sign(0)}     ⇒ (0 !== 0) = ${0 !== 0}`);
console.log(`Math.sign(-0) = ${Math.sign(-0)}    ⇒ (-0 !== 0) = ${-0 !== 0}`);
console.log('該區塊位於 `if (planX == null)` 內，而 `anchorX = planX ?? 0`');
console.log('⇒ anchorX 在該分支是字面常數 0 ⇒ bs 恆為 0 ⇒ 整段讓位程式碼不可達（構造性）');
console.log(`前排攔網分支被走到的 tick 數：${acc.d2.blockerTicks}`);
console.log(`其中處於「讀期」（blockPlan 尚未建立，planX 必為 null）：${acc.d2.readTicks}`
  + `  (${pct(acc.d2.readTicks, acc.d2.blockerTicks)})`);
console.log('  ↑ 這一格證明該分支確實常被執行 ⇒ 是「分支活著但內層條件恆假」，不是整段死路');
console.log('');

// ---- D3 ----
console.log('──── D3 `game.js:953` receiveQualityMul 的到位程度 r ────');
console.log(`呼叫端傳 reach = TUNING.REACH_RADIUS = ${TUNING.REACH_RADIUS}（收斂前基底）`);
const rMaxByH = HS.map((h) => ({
  h,
  recvR: reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, h),
  rMax: (reachRadiusFor(REACH_ACTION.RECEIVE, TUNING, h) + BALL.RADIUS) / TUNING.REACH_RADIUS,
}));
const rMaxAll = Math.max(...rMaxByH.map((e) => e.rMax));
console.log(`實際接球可及半徑 reachRadiusFor(RECEIVE)：`
  + `${f(Math.min(...rMaxByH.map((e) => e.recvR)))} – ${f(Math.max(...rMaxByH.map((e) => e.recvR)))}`);
console.log(`⇒ 觸球成立時 dist 的結構上界 = 可及 + 球半徑 ⇒ r 的結構上界 = ${f(rMaxAll)}`);
console.log(`AI 決策時點的接球 dist（n=${acc.d3.dists.length}）：`
  + `p50 ${f(q(acc.d3.dists, 0.5))} p90 ${f(q(acc.d3.dists, 0.9))} max ${f(q(acc.d3.dists, 1))}`);
const rObsMax = acc.d3.dists.length ? q(acc.d3.dists, 1) / TUNING.REACH_RADIUS : null;
console.log(`⇒ 實測 r 的最大值 = ${f(rObsMax)}（設計值域 [0, 1]）`);
const posLo = TUNING.RECV_POS_MIN;
const posHi = TUNING.RECV_POS_MIN + TUNING.RECV_POS_RANGE;
console.log(`到位修正 = RECV_POS_MIN + RECV_POS_RANGE × r = ${posLo} + ${TUNING.RECV_POS_RANGE}×r`);
console.log(`  設計區間 [${posLo}, ${posHi.toFixed(2)}]；`
  + `結構可達 [${posLo}, ${(posLo + TUNING.RECV_POS_RANGE * rMaxAll).toFixed(4)}]；`
  + `實測可達 [${posLo}, ${rObsMax == null ? 'n/a' : (posLo + TUNING.RECV_POS_RANGE * rObsMax).toFixed(4)}]`);
console.log('');

// ---- D4 ----
console.log('──── D4 `ai.js:1253-1256` 魚躍閘的下界 vs 收斂後的站立可及 ────');
const dsn = acc.d4.n;
const B = acc.d4.buckets;
const sTryLo = acc.d4.samples.length ? q(acc.d4.samples.map((x) => x.tryLo), 0.5) : null;
const sSimDive = acc.d4.samples.length ? q(acc.d4.samples.map((x) => x.simDive), 0.5) : null;
console.log(`取樣＝來球(touches=0)、球下墜且 y ≤ DIVE_MAX_Y(${TUNING.DIVE_MAX_Y}) 的每一 tick，`);
console.log(`      量主追者(aiState.claimId)離球的水平距離。n = ${dsn}`);
console.log(`分桶界線（中位數）：伸手可及 ${f(sTryLo)}｜AI 撲球下界 ${f(TUNING.REACH_RADIUS)}`
  + `｜sim 撲球上界 ${f(sSimDive)}｜AI 撲球上界 ${f(TUNING.REACH_RADIUS * TUNING.DIVE_REACH_MUL)}`);
console.log(`  ① dist ≤ 伸手可及           ${String(B[0]).padStart(7)}  ${pct(B[0], dsn)}`);
console.log(`  ② 伸手可及 < dist ≤ 1.30    ${String(B[1]).padStart(7)}  ${pct(B[1], dsn)}`
  + ` ± ${sePP(B[1], dsn)}pp  ★搆不到也不撲＝放生區★`);
console.log(`  ③ 1.30 < dist ≤ sim 撲球上界 ${String(B[2]).padStart(6)}  ${pct(B[2], dsn)}`
  + `   （撲了搆得到）`);
console.log(`  ④ sim 上界 < dist ≤ 2.34     ${String(B[3]).padStart(6)}  ${pct(B[3], dsn)}`
  + `   ★撲了也搆不到＝白躺 42 tick★`);
console.log(`  ⑤ dist > 2.34               ${String(B[4]).padStart(7)}  ${pct(B[4], dsn)}`);
const fb = acc.d4b;
console.log(`【以一顆來球為單位】進過魚躍高度帶的來球 n = ${fb.flights}`);
console.log(`  曾進「伸手可及」：${fb.everTry} (${pct(fb.everTry, fb.flights)})`
  + `｜曾進「撲得到」：${fb.everDive} (${pct(fb.everDive, fb.flights)})`);
console.log(`  ★只進得了放生區、全程沒有任何一 tick 可觸也可撲：${fb.strandedOnly}`
  + ` (${pct(fb.strandedOnly, fb.flights)} ± ${sePP(fb.strandedOnly, fb.flights)}pp)★`);
console.log('');

// ---- D6 ----
console.log('──── D6 組合攻擊的結構條件在真實池上的 true/false 次數 ────');
console.log(`取樣＝每個第二觸窗重建一次真實攻擊池並呼叫 evaluateCombinations。n = ${acc.d6.n}`);
console.log('（`roll`＝觸發骰、`hasMain`／`mainKind`／`tier`／`partner`＝資格前置；其餘為幾何／時序結構條件）');
console.log('⚠ 原始 false 次數會被**提早 return** 汙染（沒過的前置條件會讓後面每一條都留在初值 false）。');
console.log('  真正有意義的是「**被求值到**時的 false 次數」＝上一道閘的 true 次數 − 本條的 true 次數。');
// 結構條件是由同一個幾何/時序函式一次算完的 ⇒ 它們的「被求值母數」都等於 partner 的 true 數
const STRUCT = {
  cross: ['crosses', 'behind', 'outOfReach'],
  tandem: ['lane', 'depth', 'stagger', 'notCrossing'],
  delay: ['earlier', 'inWindow'],
};
for (const t of COMBO_TYPES) {
  const bucket = acc.d6.byType[t];
  const keys = Object.keys(bucket);
  if (!keys.length) { console.log(`  ${t}：無取樣`); continue; }
  const denom = bucket.partner?.t ?? 0;
  console.log(`  ${t}（被求值母數＝partner 通過數 = ${denom}）`);
  for (const k of keys) {
    const { t: tt, f: ff } = bucket[k];
    const isStruct = STRUCT[t].includes(k);
    let note = '';
    if (isStruct) {
      const condFalse = denom - tt;
      note = `  ← 被求值 ${denom} 次，其中 false ${condFalse} 次`
        + (condFalse === 0 && denom > 0 ? '  ★恆真：從未擋下任何東西★' : '');
    } else if (tt === 0 && ff > 0) {
      note = '  ★ true 次數 0 ⇒ 本條恆假 ★';
    } else if (k === 'hasMain' && ff === 0) {
      note = '  ← false 0 次（mainId 恆取自同一顆池，此守衛不可能失敗）';
    }
    console.log(`    ${k.padEnd(12)} true ${String(tt).padStart(5)}  false(原始) ${String(ff).padStart(5)}${note}`);
  }
}
console.log('');

// ---- D5 ----
console.log('──── D5 `ai.js:1226` 跳舉的高度帶 ────');
const hEx = HS[Math.floor(HS.length / 2)];
const exP = { height: { current: hEx }, attributes: { jump: 50 } };
console.log(`以中位身高 ${f(hEx, 2)}m、jump=50 為例：`
  + `站舉上緣 = standingReach+0.35 = ${f(standingReach(exP) + 0.35)}；`
  + `跳舉上緣 = spikeReach = ${f(spikeReach(exP))}`);
console.log(`⇒ 跳舉帶寬 ${f(spikeReach(exP) - standingReach(exP) - 0.35)} m（非空 ⇒ 不是恆假）`);
console.log(`set Intent 總數 ${acc.d5.setIntents}；其中 jump:true = ${acc.d5.jumpSetIntents}`
  + `  (${pct(acc.d5.jumpSetIntents, acc.d5.setIntents)})`);
console.log(`第二觸窗 tick 數 ${acc.d5.setWindowTicks}；aiState.jumpSet 為真的 tick`
  + ` ${acc.d5.jumpFlagTicks} (${pct(acc.d5.jumpFlagTicks, acc.d5.setWindowTicks)})`);
if (acc.d5.bandY.length) {
  console.log(`實際跳舉時的球高：p0 ${f(q(acc.d5.bandY, 0))} p50 ${f(q(acc.d5.bandY, 0.5))}`
    + ` p100 ${f(q(acc.d5.bandY, 1))}`);
}
console.log('');

// ---- 附帶 ----
console.log('──── 附帶：兩個「輸入會不會死掉」的對照量 ────');
const tn = acc.tier.perfect + acc.tier.ok + acc.tier.poor + acc.tier.null;
console.log(`passTier：perfect ${pct(acc.tier.perfect, tn)}｜ok ${pct(acc.tier.ok, tn)}`
  + `｜poor ${pct(acc.tier.poor, tn)}｜null ${pct(acc.tier.null, tn)}（n=${tn}）`);
const hn = acc.hand.press + acc.hand.vertical + acc.hand.retract;
console.log(`攔網手態：press ${pct(acc.hand.press, hn)}｜vertical ${pct(acc.hand.vertical, hn)}`
  + `｜retract ${pct(acc.hand.retract, hn)}（n=${hn}）`);
console.log('');

// ════════════════════════════════════════════════════════════
// D7：跨檔 symbolic 發現的 runtime 坐實（各自 3 行以內，直接呼叫 src 的匯出）
// ════════════════════════════════════════════════════════════
console.log('──── D7 其餘發現的 runtime 坐實 ────');
{
  const { spikeBiasOf, digReadFor } = await import('../src/input/liberoRead.js');
  const { BLOCK_COMMIT } = await import('../src/sim/blockRead.js');
  const { offeredCallTypes } = await import('../src/sim/approach.js');

  // (1) liberoRead.js:61-62 —— 把 player **物件**當 pid 傳給 spikeBiasOf
  const g = createGame({ seed: 1 });
  const pid = g.match.rotations.B[0];
  g.scoutTally[pid] = {
    zones: { line: 40, cross: 2, middle: 1, tip: 1 }, routes: {}, feints: 0, spikes: 44,
    serves: { jumps: 0, floats: 0, total: 0 },
  };
  const byId = spikeBiasOf(g, pid);                 // 正確用法（digSuggestionFor 走這條）
  const byObj = spikeBiasOf(g, g.players[pid]);     // digReadFor 實際走的那條
  const read = digReadFor(g, { claimId: pid });
  console.log(`(1) liberoRead.js:61-62 —— spikeBiasOf 的入參型別`);
  console.log(`    spikeBiasOf(game, '${pid}')            → ${JSON.stringify(byId)}`);
  console.log(`    spikeBiasOf(game, game.players[pid])   → ${JSON.stringify(byObj)}`
    + `   ← digReadFor 傳的是這個`);
  console.log(`    digReadFor(...).markText               → ${JSON.stringify(read?.markText)}`
    + `${read?.markText == null ? '   ★恆為 null：情蒐線索文字從未顯示過★' : ''}`);

  // (2) blockRead.js:162 OUTER_LAG_MUL
  console.log(`(2) BLOCK_COMMIT.OUTER_LAG_MUL = ${BLOCK_COMMIT.OUTER_LAG_MUL}`
    + `　⇒ outerLag = round(reactionTicks × ${BLOCK_COMMIT.OUTER_LAG_MUL}) 恆為 0`
    + `${BLOCK_COMMIT.OUTER_LAG_MUL === 0 ? '　★外圍時序降級整段 no-op★' : ''}`);
  console.log(`    （連帶 OUTER_LZ=${BLOCK_COMMIT.OUTER_LZ.toFixed(2)}／`
    + `OUTER_LX=${BLOCK_COMMIT.OUTER_LX} 兩條判準對輸出零影響）`);
  console.log(`    BLOCK_COMMIT.AIM_CROSSING_MIX = ${BLOCK_COMMIT.AIM_CROSSING_MIX}`
    + `　⇒ ai.js:1678 的 \`if (mix > 0)\` 恆真 ⇒ :1686 的 fallback return 不可達`
    + `（ai.js:1673 註解「出廠 MIX=0」已過期）`);

  // (3) approach.js offeredCallTypes —— tandem 永不進面板
  const offered = offeredCallTypes();
  console.log(`(3) offeredCallTypes() = ${JSON.stringify(offered)}`
    + `${offered.includes('tandem') ? '' : '　★不含 tandem ⇒ callPlay.js:89-92 四句文案不可達★'}`);
}
