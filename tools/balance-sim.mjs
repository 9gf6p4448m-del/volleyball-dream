// stage 7 平衡治具 — 無頭生涯模擬：量測六場勝率曲線（盲調終結者）
// 用法：node tools/balance-sim.mjs [runs=100]
// 模型：玩家 A2 由 AI 代打（近似基準——真人有讀攔網/假動作/魚躍，應優於此線）；
// 成長照實際規則：每場 gp 由表現實算、平均灑點；技術照傳授時程；
// scouting 跨場真實累積（宿敵記憶生效）。全決定論（seed 掃描）。
// W6 跨屆模式（C1）：VD_SEASONS=N＝每條生涯連跑 N 屆（advanceSeason 純函式推進，
// 名冊成長/招募進度/宿敵記憶跨屆保留；titles 綁衛冕難度 TITLE_LEVEL_BONUS）。
// 量測：逐屆勝率曲線、衛冕曲線（依屆初 titles 分組）、招募跨屆流動（入隊率/入隊屆）。
// 注意：治具「打好打滿」（止步後國賽照打取數據）＝wins 軸入隊率是上緣；逐出未建模。
import {
  createCareer, createCareerPlayer, careerMatchSetup, recordResult, nextMatch,
  mergeScouting, careerStage, advanceSeason,
} from '../src/career/careerState.js';
import { buildStarterMembers, applyRosterGrowth, openSlots } from '../src/career/roster.js';
import {
  buildRecruitMember, RECRUIT_TRUST, RECRUIT_CONDS,
  accrueRecruitProgress, conditionMet, nextRecruitId,
} from '../src/career/recruitment.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { matchStatsFor, growthPointsFor, GROWTH, GROWABLE_ATTRS } from '../src/career/growth.js';

const RUNS = Number.parseInt(process.argv[2] ?? '100', 10);
const MAX_TICKS = 400000;
// 治具隔離開關（W2 平衡歸因用）：
// VD_NO_ROSTER=1＝不帶名冊（＝W1 前基準隊伍）；VD_NO_GROWTH=1＝帶名冊但關隊友成長
// VD_FULL_ROSTER=1（W4 招募臂）＝滿名冊、三名最高強度轉學生（曜石 MB／鐵霧 OPP／
// 天鷹 OH）以真實入隊初值 trust 10 頂上三個攻擊位——量測招募對勝率曲線的上移幅度
// （只採數據、不設通過門檻；此臂固定名冊，不跑招募鏡像）
const USE_ROSTER = process.env.VD_NO_ROSTER !== '1';
const USE_GROWTH = process.env.VD_NO_GROWTH !== '1';
const USE_FULL_ROSTER = process.env.VD_FULL_ROSTER === '1';
const SEASONS = Math.max(1, Number.parseInt(process.env.VD_SEASONS ?? '1', 10));

// 傳授時程（events.js teach-* 的鏡像）：場次索引完成後解鎖（跨屆冪等——已學不重覆）
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

// 招募入隊鏡像（settleRecruitJoins 的無 store 版，同表序/同規則）：
// 條件達成＋有空位→生成入隊；額滿＝條件保持、progress 不清（與正式路徑一致）
function settleJoinsMirror(roster, recruitment, careerSeed, season, joinLog) {
  let r = roster;
  let rec = recruitment;
  for (const key of Object.keys(RECRUIT_CONDS)) {
    if (rec.recruited.includes(key) || !conditionMet(rec, key)) continue;
    if (openSlots(r) <= 0) continue;
    const id = nextRecruitId(r.members, rec.expelled);
    r = { ...r, members: [...r.members, buildRecruitMember(key, careerSeed, id)] };
    rec = { ...rec, recruited: [...rec.recruited, key] };
    joinLog.push({ key, season });
  }
  return { roster: r, recruitment: rec };
}

const matchIds = ['group-1', 'group-2', 'group-3', 'national-qf', 'national-sf', 'national-final'];
const wins = Object.fromEntries(matchIds.map((id) => [id, 0]));
const margins = Object.fromEntries(matchIds.map((id) => [id, []]));
let champions = 0;
let reachedFinal = 0;

// 跨屆收集器（SEASONS>1 才輸出；wins/margins/champions 維持「第 1 屆」語義不變）
const perSeason = Array.from({ length: SEASONS }, () => ({
  wins: Object.fromEntries(matchIds.map((id) => [id, 0])),
  champions: 0,
}));
const byTitles = new Map(); // 屆初 titles → { seasons, wins:{matchId:勝}, champions }
const joinStats = {}; // recruitKey → { joined, seasonSum }
let rosterEndSizeSum = 0;

for (let run = 0; run < RUNS; run += 1) {
  let career = createCareer({ seed: 100000 + run * 7919, playerName: '治具' });
  const player = createCareerPlayer('治具');
  // W2 名冊管線（鏡像正式路徑）：具名個性化 starter＋逐場表現驅動成長
  // capacity 12＝schema v2 現值（W5 拍板 10→12）
  let roster = { capacity: 12, members: buildStarterMembers() };
  let recruitment = { progress: {}, recruited: [], expelled: [] };
  let lineup = null;
  const joinLog = [];
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
  for (let season = 1; season <= SEASONS; season += 1) {
    const titlesAtStart = career.titles ?? 0;
    if (!byTitles.has(titlesAtStart)) {
      byTitles.set(titlesAtStart, {
        seasons: 0,
        wins: Object.fromEntries(matchIds.map((id) => [id, 0])),
        champions: 0,
      });
    }
    const tGroup = byTitles.get(titlesAtStart);
    tGroup.seasons += 1;
    for (let mi = 0; mi < matchIds.length; mi += 1) {
      if (mi === 5) for (const k of TEACH_BEFORE_FINAL) player.techniques[k] = 1;
      const entry = career.schedule[mi];
      const setup = careerMatchSetup(career, player, entry, USE_ROSTER ? roster : null, lineup);
      const g = playMatch(setup);
      const won = g.match.winner === 'A';
      const s = g.match.score;
      if (season === 1) {
        if (won) wins[entry.id] += 1;
        margins[entry.id].push(s.A - s.B);
        if (mi === 4 && careerStage(career) !== 'eliminated') reachedFinal += won ? 1 : 0;
      }
      if (won) {
        perSeason[season - 1].wins[entry.id] += 1;
        tGroup.wins[entry.id] += 1;
      }
      // 成長：實算 gp → 平均灑點；技術照傳授時程；隊友表現驅動成長（W2；W6 起帶屆數冪等鍵）
      const stats = matchStatsFor(g.events, 'A2', 'A');
      spendEvenly(player, growthPointsFor(stats, won));
      for (const k of TEACH_AFTER[mi] ?? []) player.techniques[k] = 1;
      if (USE_GROWTH) {
        roster = {
          ...roster,
          members: applyRosterGrowth(roster.members, g.events, 'A', entry.id, season),
        };
      }
      // 招募鏡像（正式路徑＝settleCareerMatch 累加→renderCareer 入隊，同節拍）；
      // FULL_ROSTER 臂固定名冊不跑（避免與手動注入的 R1-R3 重複入隊）
      if (USE_ROSTER && !USE_FULL_ROSTER) {
        recruitment = accrueRecruitProgress(recruitment, {
          opponentId: entry.opponentId, matchId: entry.id, won,
          events: g.events, playerId: 'A2', myTeam: 'A',
        });
        ({ roster, recruitment } = settleJoinsMirror(roster, recruitment, career.seed, season, joinLog));
      }
      // scouting 跨場累積（宿敵記憶）；戰績照實記（全國賽輸了也繼續模擬後段取數據）
      career = mergeScouting(career, entry.opponentId, g.scoutTally.A2);
      career = recordResult(career, {
        matchId: entry.id, won, scoreFor: s.A, scoreAgainst: s.B,
      });
    }
    // 冠軍線：六場全部真實串接下，國賽三連勝才算
    const natWins = career.results.slice(3).filter((r) => r.won).length;
    if (natWins === 3) {
      perSeason[season - 1].champions += 1;
      tGroup.champions += 1;
      if (season === 1) champions += 1;
    }
    if (season < SEASONS) career = advanceSeason(career);
  }
  for (const j of joinLog) {
    joinStats[j.key] = joinStats[j.key] ?? { joined: 0, seasonSum: 0 };
    joinStats[j.key].joined += 1;
    joinStats[j.key].seasonSum += j.season;
  }
  rosterEndSizeSum += roster.members.length + 1; // ＋玩家 1 席（rosterCount 語義）
}

const pct = (n) => `${Math.round((n / RUNS) * 100)}%`;
const avg = (a) => (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1);
console.log(`\n=== 勝率曲線（${RUNS} 次生涯模擬；A2=AI 代打基準，真人應高於此）===`);
for (const id of matchIds) {
  console.log(`${id.padEnd(16)} 勝率 ${pct(wins[id]).padStart(4)}  平均分差 ${avg(margins[id])}`);
}
console.log(`\n奪冠率（國賽三連勝）：${pct(champions)}`);

if (SEASONS > 1) {
  console.log(`\n=== 跨屆勝率（VD_SEASONS=${SEASONS}，每屆 ${RUNS} 條生涯）===`);
  for (let s = 0; s < SEASONS; s += 1) {
    const row = matchIds.map((id) => pct(perSeason[s].wins[id]).padStart(4)).join(' ');
    console.log(`第 ${s + 1} 屆  ${row}  奪冠 ${pct(perSeason[s].champions)}`);
  }
  console.log('\n=== 衛冕曲線（依屆初 titles 分組；TITLE_LEVEL_BONUS 收斂性）===');
  for (const t of [...byTitles.keys()].sort((a, b) => a - b)) {
    const gp = byTitles.get(t);
    const p = (n) => `${Math.round((n / gp.seasons) * 100)}%`.padStart(4);
    const row = matchIds.map((id) => p(gp.wins[id])).join(' ');
    console.log(`titles=${t}（${String(gp.seasons).padStart(4)} 屆） ${row}  奪冠 ${p(gp.champions)}`);
  }
  if (USE_ROSTER && !USE_FULL_ROSTER) {
    console.log('\n=== 招募跨屆流動（打好打滿＝上緣；逐出未建模）===');
    for (const key of Object.keys(RECRUIT_CONDS)) {
      const j = joinStats[key];
      const rate = j ? pct(j.joined) : '  0%';
      const meanSeason = j ? (j.seasonSum / j.joined).toFixed(1) : '—';
      console.log(`${key.padEnd(16)} 入隊率 ${rate.padStart(4)}  平均入隊屆 ${meanSeason}`);
    }
    console.log(`名冊終量平均 ${(rosterEndSizeSum / RUNS).toFixed(1)}/12（含玩家）`);
  }
}
