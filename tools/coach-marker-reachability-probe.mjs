// 教練光圈追問（2026-08-13）——圈改成兩段式（組織時指攻擊手，扣球 TOUCH 一發生就
// 改指 `predictNetCrossing(game.ball).x`，見 `src/career/practiceMatch.js:594-616`
// `netCrossX != null` 那一支）之後，玩家看得到、用得到這個修正嗎？
//
// 沿用 `tools/coach-marker-block-probe.mjs` 的同一份場景與量測口徑（tut-block、
// tutorialStageFor+restageRotation 重擺、真實 stepGame）；PID 全 AI 控制（passive 臂，
// 本檔只做被動觀測，不需要 circle/oracle 控制臂）。
//
// 量五件事：
//   1. 扣球 TOUCH → 球實際過網，隔幾個 tick（mean/p50/p10；p10 才是「來得及」的下限）
//   2. 玩家跑得動多遠——`moveSpeed`（`src/sim/player.js:146-148`）×
//      `staminaPerfMul`（`src/sim/stamina.js:74-77`），用 PID 在每次扣球當下的**實際值**
//      （不是估的），乘上 1 的可用時間，得可移動距離
//   3. 這段可移動距離，蓋不蓋得住圈的位移量（沿用先前探針的定義：攻擊手 x → 過網 x，
//      逐樣本比較，不是只比中位數對中位數）——報「跑得完的比例」
//   4. 扣掉反應時間 200ms(12 tick)／300ms(18 tick) 後，跑得完的比例
//   5. 有沒有更早、更準的替代訊號？測 `src/sim/blockRead.js` 既有的
//      `spikeAimsFor`+`netCrossingX`（＝`blockCommitRead` 的 `AIM_CROSSING_MIX=1`
//      手法：兩條候選過網線 line/cross 的中點）——分別在「攻擊手剛被認出（早、
//      跟現行圈同一時間點）」與「扣球那一刻（晚、跟②的基準線同一時間點）」量準度，
//      跟「攻擊手 x」同時間點的基準值做逐樣本對照。
//
// 用法：node tools/coach-marker-reachability-probe.mjs [seeds=150] [repsPerSeed=6]
import { createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import {
  practiceMatchSetup, tutorialDrills, tutorialStageFor, coachMarkerTarget,
} from '../src/career/practiceMatch.js';
import { createGame, stepGame, restageRotation } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { predictNetCrossing } from '../src/sim/flight.js';
import { moveSpeed } from '../src/sim/player.js';
import { staminaPerfMul } from '../src/sim/stamina.js';
import { spikeAimsFor, netCrossingX } from '../src/sim/blockRead.js';

const SEEDS = Number.parseInt(process.argv[2] ?? '150', 10);
const REPS = Number.parseInt(process.argv[3] ?? '6', 10);
const PID = 'A2';
const MAX_TICKS_PER_RUN = 400000;
const SIM_HZ = 60;

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

function midCrossX(game, attackerId) {
  const atk = game.actors[attackerId];
  if (!atk) return null;
  const aims = spikeAimsFor(game, attackerId);
  const lineX = netCrossingX(atk, aims.line);
  const crossX = netCrossingX(atk, aims.cross);
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
    speedAtSpike: null,     // moveSpeed × staminaPerfMul，PID 當下實際值
    midXAtSpike: null,      // line/cross 中點，扣球那一刻算
    earlyTick: null,        // 攻擊手第一次被認出的 tick（＝現行圈出現的時間點）
    attackerXEarly: null,
    midXEarly: null,        // line/cross 中點，攻擊手剛被認出時算
  };
}

function runPassive(seed, reps) {
  const game = freshGame(seed);
  const ai = createAiState();
  const myTeam = game.players[PID]?.teamId ?? 'A';
  const otherTeam = myTeam === 'A' ? 'B' : 'A';

  const samples = [];
  let restageDue = true;
  let windowState = null;
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
      } else {
        stepGame(game, aiCollectIntents(game, ai));
        prevPhase = game.phase;
        continue;
      }
    }

    // 早訊號：與現行圈同一個判準（`coachMarkerTarget` 不傳 netCrossX 時的早段邏輯，
    // `src/career/practiceMatch.js:598-601`）——對方持球、且已認出攻擊手
    if (windowState.earlyTick == null && game.phase === 'rally'
      && game.rally?.possession === otherTeam && ai.attackerId) {
      windowState.earlyTick = game.tick;
      windowState.attackerXEarly = game.actors[ai.attackerId]?.x ?? null;
      windowState.midXEarly = midCrossX(game, ai.attackerId);
    }

    const events = stepGame(game, aiCollectIntents(game, ai));
    for (const e of events) {
      if (e.type === 'TOUCH' && e.team === otherTeam && e.kind === 'spike'
        && !windowState.spikeSeen) {
        windowState.spikeSeen = true;
        windowState.spikeTick = e.tick;
        const attackerId = ai.attackerId;
        windowState.attackerXAtSpike = attackerId != null
          ? (game.actors[attackerId]?.x ?? null) : null;
        if (attackerId != null) windowState.midXAtSpike = midCrossX(game, attackerId);
        const player = game.players[PID];
        windowState.speedAtSpike = moveSpeed(player) * staminaPerfMul(game, player);
        const cross = predictNetCrossing(game.ball);
        windowState.spikeCrossX = cross?.x ?? null;
        windowState.spikeCrossTicks = cross?.ticks ?? null;
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
  if (s.length === 0) return { n: 0, mean: null, p10: null, p50: null, p90: null };
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length, mean, p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9),
  };
}
function pct(n, d) { return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'NA'; }

console.log(`=== 教練光圈追問：玩家看得到／用得到嗎（seeds=${SEEDS}，每 seed ${REPS} 次重擺）===`);
console.log(`跑法：node tools/coach-marker-reachability-probe.mjs ${SEEDS} ${REPS}`);
console.log('');

const all = [];
for (let seed = 1; seed <= SEEDS; seed += 1) {
  all.push(...runPassive(seed * 97 + 3, REPS));
}
const spikes = all.filter((w) => w.spikeSeen && w.spikeCrossX != null
  && w.spikeCrossTicks != null && w.attackerXAtSpike != null);
const N = spikes.length;

// ---- 1. 扣球到過網的 tick 數 ----
const ticksStats = stats(spikes.map((w) => w.spikeCrossTicks));
console.log(`[1] 扣球 TOUCH → 球實際過網的 tick 數（N=${N}）`);
console.log(`  tick：mean=${ticksStats.mean?.toFixed(1)}　p50=${ticksStats.p50?.toFixed(1)}　`
  + `p10=${ticksStats.p10?.toFixed(1)}　p90=${ticksStats.p90?.toFixed(1)}`);
console.log(`  換算秒：mean=${(ticksStats.mean / SIM_HZ).toFixed(3)}s　`
  + `p50=${(ticksStats.p50 / SIM_HZ).toFixed(3)}s　p10=${(ticksStats.p10 / SIM_HZ).toFixed(3)}s`);
console.log('');

// ---- 2. 玩家能跑多遠 ----
const speedStats = stats(spikes.map((w) => w.speedAtSpike));
console.log(`[2] PID 當下實際移動速度（moveSpeed×staminaPerfMul，src/sim/player.js:146-148 `
  + '＋ src/sim/stamina.js:74-77；N=' + N + '）');
console.log(`  m/s：mean=${speedStats.mean?.toFixed(3)}　p50=${speedStats.p50?.toFixed(3)}　`
  + `（全樣本 min=${Math.min(...spikes.map((w) => w.speedAtSpike)).toFixed(3)}／`
  + `max=${Math.max(...spikes.map((w) => w.speedAtSpike)).toFixed(3)}）`);
console.log('');

// ---- 3+4. 逐樣本比較：需要跑的距離 vs 跑得動的距離 ----
const need = spikes.map((w) => Math.abs(w.attackerXAtSpike - w.spikeCrossX));
const needStats = stats(need);
console.log(`[3] 需要跑的距離（攻擊手 x → 過網 x，逐樣本｜N=${N}）`);
console.log(`  m：mean=${needStats.mean?.toFixed(3)}　p50=${needStats.p50?.toFixed(3)}　`
  + `p90=${needStats.p90?.toFixed(3)}`);

function feasibility(reactionTicks) {
  let ok = 0;
  for (const w of spikes) {
    const availTicks = Math.max(0, w.spikeCrossTicks - reactionTicks);
    const availTime = availTicks / SIM_HZ;
    const maxDist = w.speedAtSpike * availTime;
    const needDist = Math.abs(w.attackerXAtSpike - w.spikeCrossX);
    if (maxDist >= needDist) ok += 1;
  }
  return { ok, n: spikes.length };
}
const f0 = feasibility(0);
console.log(`  逐樣本判：可用時間(=①的 tick／60)×速度 ≥ 需要距離 → 跑得完 ${f0.ok}/${f0.n} ＝ `
  + `${pct(f0.ok, f0.n)}（不扣反應時間）`);
console.log('');

console.log('[4] 扣掉人類反應時間後，跑得完的比例');
for (const [label, ticks] of [['200ms(12 tick)', 12], ['300ms(18 tick)', 18]]) {
  const f = feasibility(ticks);
  console.log(`  反應 ${label}：${f.ok}/${f.n} ＝ ${pct(f.ok, f.n)}`);
}
console.log('');

// ---- 5. 更早更準的替代訊號：line/cross 中點（既有 blockCommitRead 手法）----
function compareMethod(label, methodField, baselineField) {
  const rows = spikes.filter((w) => w[methodField] != null && w[baselineField] != null);
  const methodDiff = rows.map((w) => Math.abs(w[methodField] - w.spikeCrossX));
  const baseDiff = rows.map((w) => Math.abs(w[baselineField] - w.spikeCrossX));
  const ms = stats(methodDiff);
  const bs = stats(baseDiff);
  const better = rows.filter((w, i) => methodDiff[i] < baseDiff[i]).length;
  console.log(`  ${label}（N=${rows.length}）`);
  console.log(`    line/cross 中點 |差距|：mean=${ms.mean?.toFixed(3)}　p50=${ms.p50?.toFixed(3)}　`
    + `p90=${ms.p90?.toFixed(3)}`);
  console.log(`    攻擊手 x（同時間點基準）|差距|：mean=${bs.mean?.toFixed(3)}　`
    + `p50=${bs.p50?.toFixed(3)}　p90=${bs.p90?.toFixed(3)}`);
  console.log(`    中點比基準更準的樣本：${better}/${rows.length} ＝ ${pct(better, rows.length)}`);
}
console.log('[5] 更早更準的替代訊號：`spikeAimsFor`+`netCrossingX`'
  + '（src/sim/blockRead.js:33-41，＝ blockCommitRead 的 AIM_CROSSING_MIX=1 手法）');
compareMethod(
  '(a) 早——攻擊手剛被認出時算（跟現行圈同一時間點，有完整提前量）',
  'midXEarly', 'attackerXEarly',
);
const earlyLead = stats(spikes.filter((w) => w.earlyTick != null)
  .map((w) => w.spikeTick + w.spikeCrossTicks - w.earlyTick));
console.log(`    這個時間點的提前量（tick，供對照）：p50=${earlyLead.p50?.toFixed(1)}　`
  + `(${(earlyLead.p50 / SIM_HZ).toFixed(2)}s)`);
compareMethod(
  '(b) 晚——扣球那一刻算（跟②③的基準線同一時間點，上限對照）',
  'midXAtSpike', 'attackerXAtSpike',
);
