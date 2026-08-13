// 教練光圈追問 #2（2026-08-13，commit 2eca8f1 之後）——
// 第一部分：實測「真的跑在遊戲裡」的 `blockAimMidX`（`src/app/matchLoop.js:790`），
//   不自己抄一份公式（抄一份量到的是探針對不對，不是產品對不對）。
// 第二部分：line/cross 中點（0.634m）還能不能更準——測 `read` 人格既有的
//   `predictContactPoint`（`aiState.hitPoint`，`src/sim/ai.js:584`）取代「攻擊手當下 x」
//   當 netCrossingX 的 from 點，是否比現行 blockAimMidX 更準。
//
// 沿用 `tools/coach-marker-block-probe.mjs` 的場景與量測口徑（tut-block、
// tutorialStageFor+restageRotation 重擺、真實 stepGame、150 seeds×6）。
//
// 用法：node tools/coach-marker-crossmid-probe.mjs [seeds=150] [repsPerSeed=6]
import { createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import {
  practiceMatchSetup, tutorialDrills, tutorialStageFor, coachMarkerTarget,
} from '../src/career/practiceMatch.js';
import { createGame, stepGame, restageRotation } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, dutyPosition, AI } from '../src/sim/ai.js';
import { blockAimMidX } from '../src/app/matchLoop.js'; // ★ 產品真的在跑的那一份，不重刻
import { createIntent } from '../src/sim/intent.js';
import { predictNetCrossing } from '../src/sim/flight.js';
import { spikeAimsAt, netCrossingX } from '../src/sim/blockRead.js';
import { isFrontRow } from '../src/sim/rotation.js';
import { NEAR_NET_Z } from '../src/input/matchControls.js';

const SEEDS = Number.parseInt(process.argv[2] ?? '150', 10);
const REPS = Number.parseInt(process.argv[3] ?? '6', 10);
const PID = 'A2';
const MAX_TICKS_PER_RUN = 400000;
const SIM_HZ = 60;
const BLOCK_HALF_WIDTH_NOW = 0.5; // src/sim/blockBand.js：CONVERGE_T=1.0 時的現值

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
  return createGame({
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
}

// 候選 v2：拿 `aiState.hitPoint`（read 人格已經在用的「球會落到扣球窗上緣時的水平位置」，
// `ai.js:584` `predictContactPoint(game.ball, AI.SPIKE_APPROACH_Y)`）取代「攻擊手當下 x」
// 當 netCrossingX 的起點——只有 touches===2（舉球完成、球已飛向攻擊手）之後才有值。
function midFromHitPoint(hitPoint, team) {
  if (!hitPoint) return null;
  const aims = spikeAimsAt(hitPoint, team);
  const lineX = netCrossingX(hitPoint, aims.line);
  const crossX = netCrossingX(hitPoint, aims.cross);
  if (!Number.isFinite(lineX) || !Number.isFinite(crossX)) return null;
  return (lineX + crossX) / 2;
}

function newWindow() {
  return {
    spikeSeen: false,
    spikeTick: null,
    spikeCrossX: null,
    spikeCrossTicks: null,
    attackerXAtSpike: null,
    midXAtSpike: null,        // blockAimMidX，扣球那一刻
    earlyTick: null,          // 攻擊手第一次被認出的 tick（touches===1）
    midXEarly: null,          // blockAimMidX，攻擊手剛被認出時
    setTick: null,            // touches 第一次變 2 的 tick（舉球完成）
    hitPointEarly: null,      // 那一刻的 aiState.hitPoint（{x,z,ticks}）
    hitPointPreSpike: null,   // touches===2 期間最後一次觀察到的 hitPoint（扣球前一刻）
  };
}

// mode: 'passive' | 'circle_v2' | 'oracle'
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
        stepGame(game, aiCollectIntents(game, ai));
        prevPhase = game.phase;
        continue;
      }
    }

    // ★ 順序修正 ★ aiCollectIntents 要先跑，`ai.attackerId`／`ai.hitPoint` 才會反映
    // 「這一 tick」的 touches（先前版本在呼叫前就讀，量到的是慢一拍的舊值——
    // touches 剛變 2 的那一 tick，`ai.hitPoint` 其實還是 touches==1 時的 null）。
    let intents;
    if (mode === 'passive') {
      intents = aiCollectIntents(game, ai);
    } else {
      intents = aiCollectIntents(game, ai, [PID]);
    }

    // 觀測：攻擊手剛被認出（touches===1）＝現行圈第一次出現的時間點
    if (windowState.earlyTick == null && game.phase === 'rally'
      && game.rally?.possession === otherTeam && ai.attackerId) {
      windowState.earlyTick = game.tick;
      windowState.midXEarly = blockAimMidX(game, ai.attackerId);
    }
    // 觀測：舉球完成（touches===2）之後，aiState.hitPoint 的早／晚兩個讀數
    if (game.phase === 'rally' && game.rally?.possession === otherTeam
      && game.rally?.touches === 2) {
      if (windowState.setTick == null) {
        windowState.setTick = game.tick;
        windowState.hitPointEarly = ai.hitPoint ? { ...ai.hitPoint } : null;
      }
      if (ai.hitPoint) windowState.hitPointPreSpike = { ...ai.hitPoint };
    }

    const marker = coachMarkerTarget('tut-block', {
      attackerId: ai.attackerId,
      actors: game.actors,
      myTeam,
      blockLz: AI.BLOCK_LZ,
      possession: game.rally?.possession,
      phase: game.phase,
      crossMidX: blockAimMidX(game, ai.attackerId), // ★ 現行production公式 ★
    });

    if (mode !== 'passive') {
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
          action = 'block';
        }
      }
      intents.push(createIntent({
        playerId: PID, tick: game.tick, move, action, aim: { x: 0, z: -6.5 * side }, timing: 0.6,
      }));
    }

    const events = stepGame(game, intents);
    for (const e of events) {
      if (e.type === 'TOUCH' && e.team === otherTeam && e.kind === 'spike'
        && !windowState.spikeSeen) {
        windowState.spikeSeen = true;
        windowState.spikeTick = e.tick;
        const attackerId = ai.attackerId;
        windowState.attackerXAtSpike = attackerId != null
          ? (game.actors[attackerId]?.x ?? null) : null;
        windowState.midXAtSpike = blockAimMidX(game, attackerId);
        const cross = predictNetCrossing(game.ball);
        windowState.spikeCrossX = cross?.x ?? null;
        windowState.spikeCrossTicks = cross?.ticks ?? null;
        if (mode === 'oracle' && cross) oracleX = cross.x;
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
  return samples;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function stats(nums) {
  const s = nums.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return { n: 0, mean: null, p50: null, p90: null };
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length, mean, p50: quantile(s, 0.5), p90: quantile(s, 0.9),
  };
}
function pct(n, d) { return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'NA'; }

console.log(`=== blockAimMidX 實測＋更準訊號探索（seeds=${SEEDS}，每 seed ${REPS} 次重擺）===`);
console.log(`跑法：node tools/coach-marker-crossmid-probe.mjs ${SEEDS} ${REPS}`);
console.log('');

const passiveAll = [];
const circleAll = [];
const oracleAll = [];
for (let seed = 1; seed <= SEEDS; seed += 1) {
  passiveAll.push(...runArm(seed * 97 + 3, REPS, 'passive'));
  circleAll.push(...runArm(seed * 97 + 3, REPS, 'circle_v2'));
  oracleAll.push(...runArm(seed * 97 + 3, REPS, 'oracle'));
}

const spikes = passiveAll.filter((w) => w.spikeSeen && w.spikeCrossX != null);
const N = spikes.length;

// ================= 第一部分：實測 blockAimMidX =================
console.log('━━━━━━━━━━━━━━ 第一部分：實測已上線的 blockAimMidX ━━━━━━━━━━━━━━');
console.log('');

// 1. blockAimMidX vs 實際過網 x（扣球那一刻的讀數，跟修前 37.0% 基準同一時間點）
const validMid = spikes.filter((w) => w.midXAtSpike != null);
const midDiffs = validMid.map((w) => Math.abs(w.midXAtSpike - w.spikeCrossX));
const midStats = stats(midDiffs);
console.log(`[1] blockAimMidX(game, attackerId) vs 球實際過網 x（扣球那一刻的讀數；N=${validMid.length}）`);
console.log(`  |誤差| 公尺：mean=${midStats.mean?.toFixed(3)}　p50=${midStats.p50?.toFixed(3)}　`
  + `p90=${midStats.p90?.toFixed(3)}`);
console.log('');

// 2. 落在攔網可及半寬內的比例 vs 修前基準（攻擊手 x）
const withinMid = midDiffs.filter((d) => d <= BLOCK_HALF_WIDTH_NOW).length;
const baseDiffs = validMid.map((w) => Math.abs(w.attackerXAtSpike - w.spikeCrossX));
const withinBase = baseDiffs.filter((d) => d <= BLOCK_HALF_WIDTH_NOW).length;
console.log(`[2] 落在攔網可及半寬 ${BLOCK_HALF_WIDTH_NOW}m 內的比例（玩家真正在意的數字）`);
console.log(`  blockAimMidX（現行）：${withinMid}/${validMid.length} ＝ ${pct(withinMid, validMid.length)}`);
console.log(`  攻擊手 x（修前基準，同一組樣本重算，非引用舊數字）：`
  + `${withinBase}/${validMid.length} ＝ ${pct(withinBase, validMid.length)}`);
console.log('');

// 3. 個人攔網率（circle_v2 臂＝走現行 blockAimMidX 圈）vs oracle 上限
function blockSummary(label, arr) {
  const spikeN = arr.filter((w) => w.spikeSeen).length;
  const pidN = arr.filter((w) => w.blockedByPID).length;
  const anyN = arr.filter((w) => w.blockedByAny).length;
  console.log(`  ${label}：對方扣球 ${spikeN} 次 → PID 本人攔到 ${pidN} 次（${pct(pidN, spikeN)}）`
    + `／隊上任何前排攔到 ${anyN} 次（${pct(anyN, spikeN)}）`);
}
console.log('[3] 個人攔網率（PID 由探針控制走位＋自動跳攔，站現行圈）');
blockSummary('circle_v2 臂（現行 blockAimMidX 圈）', circleAll);
blockSummary('oracle 臂（幾何上限對照，不變）', oracleAll);
console.log('  （對照：修前照舊圈 7.0%、oracle 上限 18.1%——見 coach-marker-block-probe.mjs 先前輸出）');
console.log('');

// ================= 第二部分：還能不能更準 =================
console.log('━━━━━━━━━━━━━━ 第二部分：還能不能更準（探索）━━━━━━━━━━━━━━');
console.log('');
console.log('查過 blockSetterTendency（ai.js:2266）／setterLeanOf（blockRead.js:269）／'
  + 'blockCommitRead（blockRead.js:293）：這三支解的是「攻擊手是誰」（人的仲裁），'
  + '不是「他要打哪條線」——攻擊手已知的前提下不適用，略過。');
console.log('改測 `read` 人格既有的 `aiState.hitPoint`（`predictContactPoint`，ai.js:584）'
  + '取代「攻擊手當下 x」當 netCrossingX 的起點：');
console.log('');

const rowsHit = spikes.filter((w) => w.hitPointPreSpike && w.midXAtSpike != null);
const v2PreSpike = rowsHit.map((w) => midFromHitPoint(w.hitPointPreSpike, 'B'));
// team 參數僅影響 side/sign，教學局固定 B 為對方隊——若非 A/B 兩隊環境需調整
const diffV2Pre = rowsHit.map((w, i) => (v2PreSpike[i] != null
  ? Math.abs(v2PreSpike[i] - w.spikeCrossX) : null)).filter((v) => v != null);
const statsV2Pre = stats(diffV2Pre);
const withinV2Pre = diffV2Pre.filter((d) => d <= BLOCK_HALF_WIDTH_NOW).length;

console.log(`[5a] hitPoint 版中點，取「扣球前最後一次觀察到的 hitPoint」（N=${diffV2Pre.length}）`);
console.log(`  |誤差| 公尺：mean=${statsV2Pre.mean?.toFixed(3)}　p50=${statsV2Pre.p50?.toFixed(3)}　`
  + `p90=${statsV2Pre.p90?.toFixed(3)}`);
console.log(`  落在 ${BLOCK_HALF_WIDTH_NOW}m 內：${withinV2Pre}/${diffV2Pre.length} ＝ `
  + `${pct(withinV2Pre, diffV2Pre.length)}`);
const midAtSpikeForRows = rowsHit.map((w) => Math.abs(w.midXAtSpike - w.spikeCrossX));
const statsMidForRows = stats(midAtSpikeForRows);
console.log(`  對照（同一組樣本）blockAimMidX 扣球當下：p50=${statsMidForRows.p50?.toFixed(3)}`);
const better = rowsHit.filter((w, i) => diffV2Pre[i] != null
  && diffV2Pre[i] < midAtSpikeForRows[i]).length;
console.log(`  hitPoint 版比 blockAimMidX 更準的樣本：${better}/${rowsHit.length} ＝ `
  + `${pct(better, rowsHit.length)}`);
console.log('');

const rowsHitEarly = spikes.filter((w) => w.hitPointEarly && w.midXEarly != null
  && w.setTick != null && w.earlyTick != null);
const v2Early = rowsHitEarly.map((w) => midFromHitPoint(w.hitPointEarly, 'B'));
const diffV2Early = rowsHitEarly.map((w, i) => (v2Early[i] != null
  ? Math.abs(v2Early[i] - w.spikeCrossX) : null)).filter((v) => v != null);
const statsV2Early = stats(diffV2Early);
const withinV2Early = diffV2Early.filter((d) => d <= BLOCK_HALF_WIDTH_NOW).length;
console.log(`[5b] hitPoint 版中點，取「touches===2 第一次成立那一刻」（最早可得；N=${diffV2Early.length}）`);
console.log(`  |誤差| 公尺：mean=${statsV2Early.mean?.toFixed(3)}　p50=${statsV2Early.p50?.toFixed(3)}　`
  + `p90=${statsV2Early.p90?.toFixed(3)}`);
console.log(`  落在 ${BLOCK_HALF_WIDTH_NOW}m 內：${withinV2Early}/${diffV2Early.length} ＝ `
  + `${pct(withinV2Early, diffV2Early.length)}`);
console.log('');

// 時間點什麼時候到——跟現行 touches===1（攻擊手剛被認出）比，晚了幾 tick
const leadLoss = rowsHitEarly.map((w) => w.setTick - w.earlyTick);
const leadLossStats = stats(leadLoss);
console.log('[5c] 輸入可得時間點：hitPoint 要等 touches===2（舉球完成），比現行 touches===1'
  + '（攻擊手剛被認出）晚：');
console.log(`  晚幾 tick：mean=${leadLossStats.mean?.toFixed(1)}　p50=${leadLossStats.p50?.toFixed(1)}　`
  + `（${(leadLossStats.p50 / SIM_HZ).toFixed(2)}s）`);
const stillLead = rowsHitEarly.map((w) => (w.spikeTick + (spikes.find((s) => s === w)
  ?.spikeCrossTicks ?? 0)) - w.setTick);
console.log('  即使晚了這些，touches===2 那一刻距離球實際過網仍有提前量（供對照，不是新結論）：'
  + `p50=${stats(stillLead).p50?.toFixed(1)} tick`);
