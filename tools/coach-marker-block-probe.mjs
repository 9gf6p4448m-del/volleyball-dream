// 教練光圈量測探針（2026-08-13，攔網那一步 tut-block）——回答試玩兩題：
//   ①「對方 AI 不一定打」──對方真的常常不進攻嗎？
//   ②「不走圈、自己判斷，才攔網到的」──圈的位置準不準、站在裡面攔不攔得到？
//
// ★ 走真實路徑 ★ 場景仍用 `practiceMatch.js` 的 `tutorialStageFor` + `game.js` 的
// `restageRotation`（與 matchLoop 的 `applyTutorialStage` 呼叫同一組函式，只是本檔
// 自己驅動重試迴圈，不經過 `updateTutorial` 的六步狀態機——我們只要 tut-block 一步，
// 反覆重擺不論成敗，跟真人「卡住重試」是同一份場景分佈）。
// 圈的位置直接呼叫 `practiceMatch.js` 的 `coachMarkerTarget`（與 matchLoop.updateCoachMarker
// 同一支函式），不重算一份。攔網幾何走真的 `game.js tryBlock`（sim 本體），不重刻。
//
// ★ 零行為改動 ★ 不改 src/ 一個位元組；三種控制臂（passive/circle/oracle）都是
// 探針自己組 Intent 餵給 `stepGame`，跟其他 tools/*-probe.mjs 的既有作法相同
// （見 tools/block-defend-probe.mjs 的 'stand'/'track' 模式）。
//
// 三臂：
//   passive  PID 全 AI 控制（如 tutorial-stage-probe.mjs 現行做法）──量①③④，
//            不量「PID 自己攔到」（AI 走位比玩家好，會污染③）
//   circle   PID 由探針控制：每 tick 走向「教練圈當下的座標」（追蹤圈，不追球）；
//            圈沒出現時退回 dutyPosition（與非攔網步驟同一套自動帶位邏輯同構）
//   oracle   同 circle，但對方一出手（TOUCH kind=spike）後改追「真正的過網 x」
//            （用 `predictNetCrossing` 現算，不作弊到出手之前）──量幾何上限
//
// 用法：node tools/coach-marker-block-probe.mjs [seeds=120] [repsPerSeed=6]
import { createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import {
  practiceMatchSetup, tutorialDrills, tutorialStageFor, coachMarkerTarget,
} from '../src/career/practiceMatch.js';
import {
  createGame, stepGame, restageRotation,
} from '../src/sim/game.js';
import { createAiState, aiCollectIntents, dutyPosition, AI } from '../src/sim/ai.js';
import { createIntent } from '../src/sim/intent.js';
import { predictNetCrossing } from '../src/sim/flight.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { NEAR_NET_Z } from '../src/input/matchControls.js';

const SEEDS = Number.parseInt(process.argv[2] ?? '120', 10);
const REPS = Number.parseInt(process.argv[3] ?? '6', 10);
const PID = 'A2';
const MAX_TICKS_PER_RUN = 400000;

function freshGame(seed) {
  const setup = practiceMatchSetup({
    player: createCareerPlayer('探針', { seed }),
    members: buildStarterMembers(),
    lineup: null,
    drills: tutorialDrills(),
    seasonIndex: 1,
    seed,
    tutorial: true,
  });
  const game = createGame({
    seed: setup.seed,
    setTarget: 999,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    benches: setup.benches,
    comboScale: setup.comboScale,
    stamina: { A: {}, B: {} },
    momentum: true,
  });
  return game;
}

function newWindow() {
  return {
    attacked: false,          // 嚴格「第一球」：B 第一波（未過網回我方前）有沒有出手扣球
    wholeRallyAttacked: false, // 舊探針口徑：整個回合任何時候 B 有沒有扣過球
    firstCrossDone: false,     // 球是否已經（在 B 第一波內）過網回我方
    spikeSeen: false,
    spikeTick: null,
    spikeCrossX: null,
    spikeCrossTicks: null,
    markerAppearTick: null,   // 這球（重擺後）第一次看到圈的 tick
    markerAtSpikeX: null,     // 出手那一刻圈（＝攻擊手當時 x）的座標
    attackerIdAtSpike: null,
    spikerIdMismatch: false,  // 出手的人與 aiState.attackerId 是否對不上
    blockedByPID: false,
    blockedByAny: false,
    noBTouchAtAll: true,      // 整個點 B 隊完全沒碰到球（發球直接得分/出界）
  };
}

// mode: 'passive' | 'circle' | 'oracle'
function runArm(seed, reps, mode) {
  const game = freshGame(seed);
  const ai = createAiState();
  const myTeam = game.players[PID]?.teamId ?? 'A';
  const otherTeam = myTeam === 'A' ? 'B' : 'A';
  const side = myTeam === 'A' ? 1 : -1;

  const samples = [];
  let restageDue = true;
  let windowState = null;
  let oracleX = null;
  let repsDone = 0;
  let guard = 0;
  let prevPhase = null;

  while (repsDone < reps && guard < MAX_TICKS_PER_RUN) {
    guard += 1;
    if (restageDue) {
      const stage = tutorialStageFor('tut-block', game.match.rotations, PID, myTeam);
      const ok = stage ? restageRotation(game, stage) : false;
      if (ok) {
        restageDue = false;
        windowState = newWindow();
        oracleX = null;
      } else {
        // 這一幀擺不成（例如仍在 rally）：用全 AI 推進一 tick 直到能擺
        stepGame(game, aiCollectIntents(game, ai));
        prevPhase = game.phase;
        continue;
      }
    }

    // 每 tick 都算一次圈（純觀測，不影響任何臂的判定；被動臂也算，供①②④用）
    const marker = coachMarkerTarget('tut-block', {
      attackerId: ai.attackerId,
      actors: game.actors,
      myTeam,
      blockLz: AI.BLOCK_LZ,
      possession: game.rally?.possession,
      phase: game.phase,
    });
    if (marker && windowState.markerAppearTick == null) {
      windowState.markerAppearTick = game.tick;
    }

    let intents;
    if (mode === 'passive') {
      intents = aiCollectIntents(game, ai);
    } else {
      intents = aiCollectIntents(game, ai, [PID]);
      const a = game.actors[PID];
      let targetX;
      let targetZ;
      if (mode === 'oracle' && oracleX != null) {
        targetX = oracleX;
        targetZ = AI.BLOCK_LZ * side;
      } else if (marker) {
        targetX = marker.x;
        targetZ = marker.z;
      } else {
        const duty = dutyPosition(game, myTeam, PID);
        targetX = duty.x;
        targetZ = duty.z;
      }
      const dx = targetX - a.x;
      const dz = targetZ - a.z;
      const d = Math.hypot(dx, dz);
      const move = d > 0.15 ? { x: dx / d, z: dz / d } : { x: 0, z: 0 };
      let action = null;
      if (game.phase === 'rally') {
        const front = isFrontRow(game.match.rotations[myTeam], PID);
        if (front && Math.abs(a.z) < NEAR_NET_Z && game.rally.profile === 'spike'
          && ai.landingTeam === myTeam && game.rally.possession === otherTeam) {
          action = 'block'; // 鏡像 matchControls.js:519-527 的自動跳攔（simpleMode 反射）
        }
      }
      intents.push(createIntent({
        playerId: PID, tick: game.tick, move, action, aim: { x: 0, z: -6.5 * side }, timing: 0.6,
      }));
    }

    const events = stepGame(game, intents);
    for (const e of events) {
      if (e.type === 'TOUCH' && e.team === otherTeam) {
        windowState.noBTouchAtAll = false;
        if (e.kind === 'spike') {
          windowState.wholeRallyAttacked = true;
          if (!windowState.firstCrossDone) windowState.attacked = true;
          if (!windowState.spikeSeen) {
            windowState.spikeSeen = true;
            windowState.spikeTick = e.tick;
            const attackerId = ai.attackerId;
            windowState.attackerIdAtSpike = attackerId;
            windowState.spikerIdMismatch = attackerId != null && attackerId !== e.playerId;
            windowState.markerAtSpikeX = attackerId != null
              ? (game.actors[attackerId]?.x ?? null) : null;
            const cross = predictNetCrossing(game.ball);
            windowState.spikeCrossX = cross?.x ?? null;
            windowState.spikeCrossTicks = cross?.ticks ?? null;
            if (mode === 'oracle' && cross) oracleX = cross.x;
          }
        }
      }
      if (e.type === 'BALL_OVER_NET' && e.toTeam === myTeam) {
        windowState.firstCrossDone = true;
      }
      if (e.type === 'BLOCK_TOUCH' && e.team === myTeam) {
        windowState.blockedByAny = true;
        if (e.playerId === PID) windowState.blockedByPID = true;
      }
    }

    if (prevPhase === 'rally' && game.phase !== 'rally') {
      samples.push(windowState);
      windowState = null;
      restageDue = true;
      repsDone += 1;
    }
    prevPhase = game.phase;
  }
  return { samples, hitGuard: guard >= MAX_TICKS_PER_RUN };
}

function pct(n, d) { return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'NA'; }
function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function stats(nums) {
  const s = [...nums].sort((a, b) => a - b);
  if (s.length === 0) return { n: 0, mean: null, p50: null, p90: null };
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length, mean, p50: quantile(s, 0.5), p90: quantile(s, 0.9),
  };
}

// ── 跑三臂 ──────────────────────────────────────────────
console.log(`=== 教練光圈量測（seeds=${SEEDS}，每 seed ${REPS} 次重擺 tut-block）===`);
console.log(`跑法：node tools/coach-marker-block-probe.mjs ${SEEDS} ${REPS}`);
console.log('');

const passiveAll = [];
const circleAll = [];
const oracleAll = [];
let anyGuardHit = false;
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const p = runArm(seed * 97 + 3, REPS, 'passive');
  const c = runArm(seed * 97 + 3, REPS, 'circle');
  const o = runArm(seed * 97 + 3, REPS, 'oracle');
  passiveAll.push(...p.samples);
  circleAll.push(...c.samples);
  oracleAll.push(...o.samples);
  if (p.hitGuard || c.hitGuard || o.hitGuard) anyGuardHit = true;
}

if (anyGuardHit) console.log('⚠ 至少一次跑到 MAX_TICKS_PER_RUN 上限，數字可能不完整\n');

// ---- ① 對方到底多常進攻 ----
const N = passiveAll.length;
const strictAttacked = passiveAll.filter((w) => w.attacked).length;
const wholeAttacked = passiveAll.filter((w) => w.wholeRallyAttacked).length;
const noTouch = passiveAll.filter((w) => w.noBTouchAtAll).length;
const receivedButNoSpikeInWindow = passiveAll.filter(
  (w) => !w.noBTouchAtAll && !w.attacked,
).length;

console.log('[①] 對方進攻頻率（passive 臂，N=' + N + ' 個重擺樣本）');
console.log(`  嚴格「第一球」定義（B 第一波過網回我方前有沒有扣球）：`
  + `${strictAttacked}/${N} ＝ ${pct(strictAttacked, N)}`);
console.log(`  舊探針口徑（整個點任何時候 B 有沒有扣過球）：`
  + `${wholeAttacked}/${N} ＝ ${pct(wholeAttacked, N)}`);
console.log(`  其中：B 完全沒碰到球（我方發球直接得失分）＝${noTouch}/${N} ＝ ${pct(noTouch, N)}`);
console.log(`        B 有碰球但第一波沒能組織出扣球（一傳崩/送安全球被我方直接拿分等）＝`
  + `${receivedButNoSpikeInWindow}/${N} ＝ ${pct(receivedButNoSpikeInWindow, N)}`);
console.log('');

// ---- ② 圈的位置準不準 ----
const spikes = passiveAll.filter((w) => w.spikeSeen && w.markerAtSpikeX != null
  && w.spikeCrossX != null);
const diffs = spikes.map((w) => Math.abs(w.markerAtSpikeX - w.spikeCrossX));
const dStats = stats(diffs);
const mismatches = passiveAll.filter((w) => w.spikerIdMismatch).length;
const spikeSeenCount = passiveAll.filter((w) => w.spikeSeen).length;
console.log(`[②] 圈準不準（出手當下圈的 x vs 該球實際過網 x；N=${spikes.length} 次扣球）`);
console.log(`  |差距| 公尺：mean=${dStats.mean?.toFixed(3)}　p50=${dStats.p50?.toFixed(3)}　`
  + `p90=${dStats.p90?.toFixed(3)}`);
console.log(`  attackerId 與實際出手者不符：${mismatches}/${spikeSeenCount} ＝ `
  + `${pct(mismatches, spikeSeenCount)}`);
const BLOCK_HALF_WIDTH_NOW = 0.5; // src/sim/blockBand.js：CONVERGE_T=1.0 時的現值
const withinReach = diffs.filter((d) => d <= BLOCK_HALF_WIDTH_NOW).length;
console.log(`  對照：目前攔網帶半寬 TUNING.BLOCK_REACH_X ＝ ${BLOCK_HALF_WIDTH_NOW}m`
  + `（src/sim/blockBand.js，CONVERGE_T=1.0）`);
console.log(`  圈的落點落在該半寬內（|差距|≤${BLOCK_HALF_WIDTH_NOW}m）：`
  + `${withinReach}/${diffs.length} ＝ ${pct(withinReach, diffs.length)}`);
console.log('');

// ---- ③ 站在圈裡攔得到嗎 ----
function blockSummary(label, arr) {
  const spikeN = arr.filter((w) => w.spikeSeen).length;
  const pidN = arr.filter((w) => w.blockedByPID).length;
  const anyN = arr.filter((w) => w.blockedByAny).length;
  console.log(`  ${label}：對方扣球 ${spikeN} 次 → PID 本人攔到 ${pidN} 次（${pct(pidN, spikeN)}）`
    + `／隊上任何前排攔到 ${anyN} 次（${pct(anyN, spikeN)}）`);
  return { spikeN, pidN, anyN };
}
console.log('[③] 站在圈裡攔得到嗎（circle／oracle 臂：PID 由探針控制走位＋自動跳攔）');
blockSummary('circle 臂（追教練圈，圈沒出現時退回職責位）', circleAll);
blockSummary('oracle 臂（出手後改追真正過網 x，幾何上限對照組）', oracleAll);
console.log('');

// ---- ④ 圈什麼時候出現 ----
const leadSamples = passiveAll
  .filter((w) => w.spikeSeen && w.markerAppearTick != null
    && w.spikeCrossTicks != null)
  .map((w) => (w.spikeTick + w.spikeCrossTicks) - w.markerAppearTick);
const lStats = stats(leadSamples);
console.log(`[④] 圈提前多久出現（圈第一次出現的 tick → 該球實際過網的 tick；N=${leadSamples.length}，`
  + '60 tick/秒)');
console.log(`  提前量 tick：mean=${lStats.mean?.toFixed(1)}　p50=${lStats.p50?.toFixed(1)}　`
  + `p90=${lStats.p90?.toFixed(1)}`);
console.log(`  換算秒：mean=${(lStats.mean / 60).toFixed(2)}s　p50=${(lStats.p50 / 60).toFixed(2)}s`);
console.log('');
console.log('（passive 臂另兼查①②④；③的攔網率不用 passive 臂，因為 passive 臂 PID 是全 AI'
  + '走位，會比玩家強，直接拿它的攔網率當「站在圈裡」的答案會失真）');
