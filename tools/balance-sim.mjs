// stage 7 平衡治具 — 無頭生涯模擬：量測六場勝率曲線（盲調終結者）
// 用法：node tools/balance-sim.mjs [runs=100]
// 模型：玩家 A2 由 AI 代打（近似基準——真人有讀攔網/假動作/魚躍，應優於此線）；
// 成長照實際規則：每場 gp 由表現實算、平均灑點；技術照傳授時程；
// scouting 跨場真實累積（宿敵記憶生效）。全決定論（seed 掃描）。
import {
  createCareer, createCareerPlayer, careerMatchSetup, recordResult, nextMatch,
  mergeScouting, careerStage,
} from '../src/career/careerState.js';
import { buildStarterMembers, applyRosterGrowth } from '../src/career/roster.js';
import { buildRecruitMember, RECRUIT_TRUST } from '../src/career/recruitment.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { matchStatsFor, growthPointsFor, GROWTH, GROWABLE_ATTRS } from '../src/career/growth.js';

const RUNS = Number.parseInt(process.argv[2] ?? '100', 10);
const MAX_TICKS = 400000;
// 治具隔離開關（W2 平衡歸因用）：
// VD_NO_ROSTER=1＝不帶名冊（＝W1 前基準隊伍）；VD_NO_GROWTH=1＝帶名冊但關隊友成長
// VD_FULL_ROSTER=1（W4 招募臂）＝滿 10 人名冊、三名最高強度轉學生（曜石 MB／鐵霧 OPP／
// 天鷹 OH）以真實入隊初值 trust 10 頂上三個攻擊位——量測招募對勝率曲線的上移幅度
// （只採數據、不設通過門檻；平衡調整留 W6）
const USE_ROSTER = process.env.VD_NO_ROSTER !== '1';
const USE_GROWTH = process.env.VD_NO_GROWTH !== '1';
const USE_FULL_ROSTER = process.env.VD_FULL_ROSTER === '1';

// 傳授時程（events.js teach-* 的鏡像）：場次索引完成後解鎖
const TEACH_AFTER = {
  0: ['tip'],
  1: ['dive'],
  2: ['pipe', 'feint'],
  3: ['floatServe'],
};
const TEACH_BEFORE_FINAL = ['jumpServe'];

function playMatch(setup) {
  const g = createGame({
    seed: setup.seed,
    teams: setup.teams,
    aiProfiles: setup.aiProfiles,
    liberos: setup.liberos,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
  });
  const ai = createAiState();
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    stepGame(g, aiCollectIntents(g, ai));
  }
  return g;
}

// 平均灑點：可成長屬性輪流 +1（上限 90）——玩家實際會集中灑，此為中性基準
function spendEvenly(player, points) {
  let left = points;
  let i = 0;
  let stuck = 0;
  while (left > 0 && stuck < GROWABLE_ATTRS.length) {
    const key = GROWABLE_ATTRS[i % GROWABLE_ATTRS.length].key;
    if (player.attributes[key] < GROWTH.ATTR_CAP) {
      player.attributes[key] += 1;
      left -= 1;
      stuck = 0;
    } else {
      stuck += 1;
    }
    i += 1;
  }
}

const matchIds = ['group-1', 'group-2', 'group-3', 'national-qf', 'national-sf', 'national-final'];
const wins = Object.fromEntries(matchIds.map((id) => [id, 0]));
const margins = Object.fromEntries(matchIds.map((id) => [id, []]));
let champions = 0;
let reachedFinal = 0;

for (let run = 0; run < RUNS; run += 1) {
  let career = createCareer({ seed: 100000 + run * 7919, playerName: '治具' });
  const player = createCareerPlayer('治具');
  // W2 名冊管線（鏡像正式路徑）：具名個性化 starter＋逐場表現驅動成長
  let roster = { capacity: 10, members: buildStarterMembers() };
  let lineup = null;
  if (USE_FULL_ROSTER) {
    // 招募臂：R1 曜石 MB／R2 鐵霧 OPP／R3 天鷹 OH（決定論生成，同正式入隊路徑）；
    // 陣容＝[S, 玩家OH, R-MB, R-OPP, R-OH, MB]——對角 5-1 合法、轉學生頂上三攻擊位
    const rIds = [];
    for (const oppId of ['obsidian', 'iron-mist', 'sky-hawk']) {
      const id = `R${rIds.length + 1}`;
      roster.members.push(buildRecruitMember(oppId, career.seed, id));
      rIds.push(id);
    }
    lineup = {
      starters: ['A1', 'A2', rIds[0], rIds[1], rIds[2], 'A6'],
      libero: 'AL',
      rotationStart: 0,
      trust: {
        A1: 20, A3: 20, A4: 20, A5: 20, A6: 20,
        [rIds[0]]: RECRUIT_TRUST, [rIds[1]]: RECRUIT_TRUST, [rIds[2]]: RECRUIT_TRUST,
      },
    };
  }
  for (let mi = 0; mi < matchIds.length; mi += 1) {
    if (mi === 5) for (const k of TEACH_BEFORE_FINAL) player.techniques[k] = 1;
    const entry = career.schedule[mi];
    const setup = careerMatchSetup(career, player, entry, USE_ROSTER ? roster : null, lineup);
    const g = playMatch(setup);
    const won = g.match.winner === 'A';
    const s = g.match.score;
    if (won) wins[entry.id] += 1;
    margins[entry.id].push(s.A - s.B);
    if (mi === 4 && careerStage(career) !== 'eliminated') reachedFinal += won ? 1 : 0;
    // 成長：實算 gp → 平均灑點；技術照傳授時程；隊友表現驅動成長（W2）
    const stats = matchStatsFor(g.events, 'A2', 'A');
    spendEvenly(player, growthPointsFor(stats, won));
    for (const k of TEACH_AFTER[mi] ?? []) player.techniques[k] = 1;
    if (USE_GROWTH) {
      roster = { ...roster, members: applyRosterGrowth(roster.members, g.events, 'A', entry.id) };
    }
    // scouting 跨場累積（宿敵記憶）；戰績照實記（全國賽輸了也繼續模擬後段取數據）
    career = mergeScouting(career, entry.opponentId, g.scoutTally.A2);
    career = recordResult(career, {
      matchId: entry.id, won, scoreFor: s.A, scoreAgainst: s.B,
    });
  }
  // 冠軍線：六場全部真實串接下，國賽三連勝才算
  const natWins = career.results.slice(3).filter((r) => r.won).length;
  if (natWins === 3) champions += 1;
}

const pct = (n) => `${Math.round((n / RUNS) * 100)}%`;
const avg = (a) => (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1);
console.log(`\n=== 勝率曲線（${RUNS} 次生涯模擬；A2=AI 代打基準，真人應高於此）===`);
for (const id of matchIds) {
  console.log(`${id.padEnd(16)} 勝率 ${pct(wins[id]).padStart(4)}  平均分差 ${avg(margins[id])}`);
}
console.log(`\n奪冠率（國賽三連勝）：${pct(champions)}`);
