// W6 試玩回饋查證探針（唯讀觀測，不改任何遊戲行為）
// Q2 臂：生涯第一場（主角未學魚躍、A diveRate=0 鏡像 careerMatchSetup）——
//   逐 tick 偵測 A 隊 divedUntil 上升沿（含撲空），分類 rescue（自家持球 touches≥1
//   ＝救噴必撲路徑，繞過 diveRate）vs standard（diveRate 擲骰），驗證
//   「第一場隊友會撲」的來源與頻率。
// Q3 臂：主角已學魚躍（diveRate 0.16 鏡像解鎖後）——逐 tick 評估 matchControls
//   自動魚躍判定式（claim/backup＋站立搆不到 1.3<dist≤2.34＋低球下墜 y≤1.15），
//   對每個 (flight, player) 首次成立記：觸發距離、球最終落點距演員距離
//   （landingDist ≤1.3＝「其實站著/半步就搆到」＝近球誤撲候選）。
// 用法：node tools/dive-probe.mjs [runs=40]
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { predictLanding } from '../src/sim/flight.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

const RUNS = Number.parseInt(process.argv[2] ?? '40', 10);
const MAX_TICKS = 200000;

function setupMatch(seedBase, run, diveUnlocked) {
  const career = createCareer({ seed: seedBase + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  if (diveUnlocked) player.techniques.dive = 1; // 解鎖臂（Q3）；未解鎖臂維持 0（Q2）
  const roster = { capacity: 12, members: buildStarterMembers() };
  return careerMatchSetup(career, player, career.schedule[0], roster, null);
}

function playProbe(setup, onTick) {
  const g = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
  });
  const ai = createAiState();
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    onTick(g, ai);
    stepGame(g, aiCollectIntents(g, ai));
  }
  return g;
}

// ---- Q2 臂：未解鎖第一場的 A 隊魚躍實況 ----
{
  let matchesWithTeammateDive = 0;
  let totalDives = 0;
  let rescueDives = 0;
  let standardDives = 0;
  let a2Dives = 0;
  const samples = [];
  for (let run = 0; run < RUNS; run += 1) {
    const setup = setupMatch(500000, run, false);
    if ((setup.aiProfiles?.A?.diveRate ?? -1) !== 0) {
      throw new Error(`Q2 前提破功：A diveRate=${setup.aiProfiles?.A?.diveRate}（未解鎖應為 0）`);
    }
    const prevDived = {};
    let divesThisMatch = 0;
    playProbe(setup, (g) => {
      for (const [id, a] of Object.entries(g.actors)) {
        if (g.players[id].teamId !== 'A') continue;
        const prev = prevDived[id] ?? -1;
        if (a.divedUntil > g.tick && a.divedUntil !== prev) {
          // divedUntil 上升沿＝一次魚躍出手（撲到/撲空都算）
          const r = g.rally;
          const rescue = r.possession === 'A' && r.touches >= 1;
          if (id === 'A2') a2Dives += 1;
          else {
            totalDives += 1;
            divesThisMatch += 1;
            if (rescue) rescueDives += 1;
            else standardDives += 1;
            if (samples.length < 5) {
              samples.push({ run, tick: g.tick, id, touches: r.touches, possession: r.possession });
            }
          }
        }
        prevDived[id] = a.divedUntil;
      }
    });
    if (divesThisMatch > 0) matchesWithTeammateDive += 1;
  }
  console.log('=== Q2 臂：生涯第一場（主角未學魚躍、A diveRate=0）×', RUNS, '場 ===');
  console.log(`隊友魚躍出手：共 ${totalDives} 次（rescue 救噴 ${rescueDives}／standard 擲骰 ${standardDives}）`);
  console.log(`出現過隊友魚躍的場次：${matchesWithTeammateDive}/${RUNS}（${Math.round((matchesWithTeammateDive / RUNS) * 100)}%）`);
  console.log(`主角 A2 魚躍出手：${a2Dives} 次（未解鎖應為 0）`);
  console.log('樣本：', JSON.stringify(samples));
}

// ---- Q3 臂：主角自動魚躍判定式的觸發幾何（解鎖後） ----
{
  const fired = new Set(); // `${flightId}:${playerId}` 首次成立才記
  const stats = { fires: 0, landLE09: 0, landLE13: 0, landGT13: 0, dists: [], landDists: [] };
  for (let run = 0; run < RUNS; run += 1) {
    const setup = setupMatch(700000, run, true);
    playProbe(setup, (g, ai) => {
      const r = g.rally;
      if (g.phase !== 'rally') return;
      const b = g.ball;
      if (!(b.vy < 0 && b.y <= TUNING.DIVE_MAX_Y)) return;
      for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'AL']) {
        if (ai.claimId !== id && ai.backupId !== id) continue;
        const a = g.actors[id];
        if (!a || g.tick < a.divedUntil) continue;
        const canTouch = r.touches < 3 &&
          !(r.profile === 'serve' && r.lastTouchTeam === 'A') &&
          r.lastToucherId !== id;
        if (!canTouch) continue;
        const dist = Math.hypot(b.x - a.x, b.z - a.z);
        if (!(dist > TUNING.REACH_RADIUS && dist <= TUNING.REACH_RADIUS * TUNING.DIVE_REACH_MUL)) continue;
        const key = `${run}:${r.flightId}:${id}`;
        if (fired.has(key)) continue;
        fired.add(key);
        const landing = predictLanding(b);
        const landDist = landing ? Math.hypot(landing.x - a.x, landing.z - a.z) : null;
        stats.fires += 1;
        stats.dists.push(dist);
        if (landDist !== null) {
          stats.landDists.push(landDist);
          if (landDist <= 0.9) stats.landLE09 += 1;
          else if (landDist <= TUNING.REACH_RADIUS) stats.landLE13 += 1;
          else stats.landGT13 += 1;
        }
      }
    });
  }
  const med = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)].toFixed(2) : '—';
  };
  console.log('\n=== Q3 臂：自動魚躍判定式觸發幾何（解鎖後）×', RUNS, '場 ===');
  console.log(`觸發樣本：${stats.fires}（每 flight×player 首次成立）`);
  console.log(`觸發瞬間距離 中位數 ${med(stats.dists)} m（窗口 1.30–2.34）`);
  console.log(`球最終落點距演員：中位數 ${med(stats.landDists)} m`);
  const pct = (n) => `${Math.round((n / Math.max(1, stats.fires)) * 100)}%`;
  console.log(`  ≤0.9m（幾乎落在腳邊＝明確誤撲帶）：${stats.landLE09}（${pct(stats.landLE09)}）`);
  console.log(`  0.9–1.3m（站立可及內＝可普通接）：${stats.landLE13}（${pct(stats.landLE13)}）`);
  console.log(`  >1.3m（站著真的搆不到＝魚躍合理）：${stats.landGT13}（${pct(stats.landGT13)}）`);
  // W6.1 落點閘（matchControls diveLandingOutOfReach＝落點距離>REACH_RADIUS 才撲）套用後：
  console.log(`落點閘後仍觸發：${stats.landGT13}（${pct(stats.landGT13)}）；被閘下（改普通接）：${stats.landLE09 + stats.landLE13}（${pct(stats.landLE09 + stats.landLE13)}）`);
}
