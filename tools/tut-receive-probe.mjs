// 量測治具（2026-08-13，量測用，不改 src/）——教學局 tut-receive 第一步：
// 「玩家要打幾球才拿到第一次 receive/dive 觸球」是不是異常慢。
//
// 建隊走真實路徑：practiceMatchSetup（同 matchConfig.js 對 practice 分支的呼叫）；
// gameOptions 鏡像 matchConfig.js:126-137（practice 分支：stamina 對稱、momentum:true、
// 無 series、setTarget=25）。逐 tick 用 aiCollectIntents+stepGame 跑（同 balance-sim.mjs
// playMatch 的手法）。
//
// 每個 B 隊發球回合（我方接發）在**發球執行前**用真實函式現場算：
//   - isBackRow(rotations.A, 'A2')                         ← 折損①候選
//   - hash01(score.A*53+score.B*149+401+seed) < AI.SERVE_TARGET_RATE  ← 折損②候選
//     （公式照抄 ai.js:2990-2991，serveTarget 本身沒 export，只好抄同一顆純函式）
//   - serveTargetPidOf(g,'B')                              ← 誰是這球的指名目標
//   - attackPointsOf(g,'A',null,'perfect') 有沒有 A2       ← 折損③候選
//     （serveTargetPidOf 內部只挑 isBackRow 的候選；但候選池本身可能因
//      techniques.pipe===0 就把 A2 排除，這是與①分開的另一道折損）
// 該回合結束後掃事件流找「我方第一個 TOUCH」是不是 A2 的 receive/dive，量出
// ★真正的仲裁結果★，不是只停在「有沒有被指名」。
//
// 用法：node tools/tut-receive-probe.mjs [seeds=200]
// 輸出：主控台摘要＋逐 seed CSV（TUT_CSV 環境變數指定路徑；預設落 scratchpad）
import { createCareerPlayer } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { practiceMatchSetup, tutorialDrills } from '../src/career/practiceMatch.js';
import { createGame, stepGame } from '../src/sim/game.js';
import {
  createAiState, aiCollectIntents, AI, serveTargetPidOf, attackPointsOf,
} from '../src/sim/ai.js';
import { isBackRow } from '../src/sim/rotation.js';
import { serverId } from '../src/sim/match.js';
import { hash01 } from '../src/sim/rng.js';

const SEEDS = Number.parseInt(process.argv[2] ?? '200', 10);
const MAX_TICKS = 400000;
const PID = 'A2';
const CSV_PATH = process.env.TUT_CSV
  ?? 'C:\\Users\\shung\\AppData\\Local\\Temp\\claude\\C--Users-shung\\20eaca06-820d-48b6-84cd-201a4a8bcc6a\\scratchpad\\tut-receive-probe.csv';

function runOne(seed) {
  const player = createCareerPlayer('探針', { seed });
  const members = buildStarterMembers();
  const setup = practiceMatchSetup({
    player, members, lineup: null, drills: tutorialDrills(),
    seasonIndex: 1, seed, tutorial: true,
  });
  // 鏡像 matchConfig.js:126-137 的 practice 分支（stamina 對稱雙邊皆 {}；momentum 恆開；
  // bo1＝不傳 series；setTarget 25＝production 預設）
  const g = createGame({
    seed: setup.seed,
    setTarget: 25,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    benches: setup.benches,
    comboScale: setup.comboScale,
    stamina: { A: {}, B: {} },
    momentum: true,
  });
  const ai = createAiState();

  let rallyIndex = 0;
  let firstReceiveRally = null;
  let prevPhase = null;
  let pending = null; // { rallyIndex, backRow, directed, targetsPlayer, poolHasPlayer, mark }
  const bRallies = [];
  let eventsCursor = 0;

  function resolvePending(endMark) {
    if (!pending) return;
    const slice = g.events.slice(pending.mark, endMark);
    const firstATouch = slice.find((e) => e.type === 'TOUCH' && e.team === 'A');
    const receivedByPlayer = !!firstATouch && firstATouch.playerId === PID
      && (firstATouch.kind === 'receive' || firstATouch.kind === 'dive');
    bRallies.push({ ...pending, receivedByPlayer, ace: !firstATouch });
    pending = null;
  }

  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    if (g.phase === 'set_break') break; // bo1 練習賽不會進來；防呆
    if (g.phase === 'serve' && prevPhase !== 'serve') {
      resolvePending(g.events.length);
      rallyIndex += 1;
      const sPid = serverId(g.match);
      const sTeam = g.players[sPid]?.teamId;
      if (sTeam === 'B') {
        const backRow = isBackRow(g.match.rotations.A, PID);
        const { score } = g.match;
        // ai.js:2990-2991 serveTarget() 的同一顆 roll（該函式未 export，公式原樣照抄）
        const roll = hash01(score.A * 53 + score.B * 149 + 401 + (g.seed ?? 0));
        const directed = roll < AI.SERVE_TARGET_RATE;
        const targetPid = directed ? serveTargetPidOf(g, 'B') : null;
        const pool = attackPointsOf(g, 'A', null, 'perfect');
        pending = {
          rallyIndex,
          backRow,
          directed,
          targetsPlayer: directed && targetPid === PID,
          poolHasPlayer: pool.some((pt) => pt.pid === PID),
          mark: g.events.length,
        };
      }
    }
    prevPhase = g.phase;
    const intents = aiCollectIntents(g, ai);
    stepGame(g, intents);
    for (let i = eventsCursor; i < g.events.length; i += 1) {
      const e = g.events[i];
      if (firstReceiveRally === null && e.type === 'TOUCH' && e.playerId === PID
        && (e.kind === 'receive' || e.kind === 'dive')) {
        firstReceiveRally = rallyIndex;
      }
    }
    eventsCursor = g.events.length;
  }
  resolvePending(g.events.length);

  return {
    seed, firstReceiveRally, totalRallies: rallyIndex, bRallies,
    playerPipe: player.techniques.pipe,
  };
}

function pct(n, d) { return d ? ((100 * n) / d).toFixed(1) : 'NA'; }
function quantile(arr, q) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
  return s[idx];
}

const results = [];
for (let i = 0; i < SEEDS; i += 1) {
  results.push(runOne(1000 + i * 7919));
}

// ── 彙總 ──
const found = results.filter((r) => r.firstReceiveRally !== null);
const neverCount = results.length - found.length;
const rallyCounts = found.map((r) => r.firstReceiveRally);

let allB = 0;
let allBackRow = 0;
let allDirected = 0;
let allDirectedAtPlayer = 0;
let allDirectedAtPlayerReceived = 0;
let backRowRallies = 0;
let backRowPoolHasPlayer = 0;
let frontRowRallies = 0;
let frontRowReceived = 0;
let backRowReceived = 0;

// 「這些球」＝每個 seed 中，玩家拿到第一次 receive 之前（含那一球）的 B 發球回合
let preFirstB = 0;
let preFirstDirectedAtPlayer = 0;

for (const r of results) {
  const cutoff = r.firstReceiveRally ?? Infinity;
  for (const br of r.bRallies) {
    allB += 1;
    if (br.backRow) { allBackRow += 1; backRowRallies += 1; if (br.poolHasPlayer) backRowPoolHasPlayer += 1; if (br.receivedByPlayer) backRowReceived += 1; }
    else { frontRowRallies += 1; if (br.receivedByPlayer) frontRowReceived += 1; }
    if (br.directed) allDirected += 1;
    if (br.targetsPlayer) {
      allDirectedAtPlayer += 1;
      if (br.receivedByPlayer) allDirectedAtPlayerReceived += 1;
    }
    if (br.rallyIndex <= cutoff) {
      preFirstB += 1;
      if (br.targetsPlayer) preFirstDirectedAtPlayer += 1;
    }
  }
}

const poolExcludedWhenBackRow = backRowRallies - backRowPoolHasPlayer;

console.log('=== tut-receive 折損量測（node tools/tut-receive-probe.mjs %d） ===', SEEDS);
console.log(`跑法：node tools/tut-receive-probe.mjs ${SEEDS}`);
console.log('');
console.log('[1] 玩家拿到第一次 receive/dive 之前要打幾球（rally＝每次發球起算一球）：');
console.log(`  seeds=${SEEDS}／找到=${found.length}／整場沒發生=${neverCount}（${pct(neverCount, results.length)}%）`);
if (rallyCounts.length) {
  const mean = rallyCounts.reduce((s, v) => s + v, 0) / rallyCounts.length;
  console.log(`  平均 ${mean.toFixed(2)} 球／中位數 ${quantile(rallyCounts, 0.5)} 球／90 百分位 ${quantile(rallyCounts, 0.9)} 球`);
  console.log(`  分布（球數:場次）：${JSON.stringify(rallyCounts.reduce((m, v) => { m[v] = (m[v] ?? 0) + 1; return m; }, {}))}`);
}
console.log('');
console.log('[2] 「這些球」（每 seed 中，拿到第一次 receive 之前含那一球的所有 B 發球回合）：');
console.log(`  B 發球回合共 ${preFirstB} 球，其中「白隊發球且目標=玩家」的有 ${preFirstDirectedAtPlayer} 球（${pct(preFirstDirectedAtPlayer, preFirstB)}%）`);
console.log('');
console.log('[3] 前排／後排折損（isBackRow 那道折損是不是真的）：');
console.log(`  全部 B 發球回合＝${allB}；玩家後排＝${backRowRallies}（${pct(backRowRallies, allB)}%）／前排＝${frontRowRallies}（${pct(frontRowRallies, allB)}%）`);
console.log(`  前排回合中玩家仍實際接到球的比例＝${frontRowReceived}/${frontRowRallies}（${pct(frontRowReceived, frontRowRallies)}%）`);
console.log(`  後排回合中玩家實際接到球的比例＝${backRowReceived}/${backRowRallies}（${pct(backRowReceived, backRowRallies)}%）`);
console.log(`  ★後排回合中，玩家連候選池（attackPointsOf）都進不去的比例＝${poolExcludedWhenBackRow}/${backRowRallies}（${pct(poolExcludedWhenBackRow, backRowRallies)}%）★`);
console.log(`  （techniques.pipe 全部 seed 皆＝${results[0].playerPipe}——教學局是第 1 屆，尚未學會後排攻擊）`);
console.log('');
console.log(`[4] AI.SERVE_TARGET_RATE（讀出來的實際值）＝${AI.SERVE_TARGET_RATE}`);
console.log(`  全部 B 發球回合中，roll<RATE 真的觸發指名的比例＝${allDirected}/${allB}（${pct(allDirected, allB)}%）`);
console.log('');
console.log('[5] 球確實發向玩家時（directed 且 targetPid===A2），最後真正接到的人是不是玩家：');
console.log(`  ${allDirectedAtPlayer}/${allB}（${pct(allDirectedAtPlayer, allB)}%）球被指名發給玩家；其中玩家真的接到＝${allDirectedAtPlayerReceived}/${allDirectedAtPlayer}（${pct(allDirectedAtPlayerReceived, allDirectedAtPlayer)}%）`);

// 落 CSV（逐 seed）
const rows = ['seed,firstReceiveRally,totalRallies,bRallyCount,backRowCount,directedAtPlayerCount,receivedWhenDirected'];
for (const r of results) {
  const b = r.bRallies;
  rows.push([
    r.seed, r.firstReceiveRally ?? '', r.totalRallies, b.length,
    b.filter((x) => x.backRow).length,
    b.filter((x) => x.targetsPlayer).length,
    b.filter((x) => x.targetsPlayer && x.receivedByPlayer).length,
  ].join(','));
}
const fs = await import('node:fs');
fs.mkdirSync(CSV_PATH.replace(/[^\\/]+$/, ''), { recursive: true });
fs.writeFileSync(CSV_PATH, rows.join('\n'));
console.log('');
console.log(`逐 seed 明細已落檔：${CSV_PATH}`);
