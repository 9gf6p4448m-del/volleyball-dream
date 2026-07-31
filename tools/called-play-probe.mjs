// 組合攻擊卷 段 E — 玩家叫套路的**前置量測**探針
//
// ★ 為什麼要先量 ★
// 「非 S 的請求經 trust 權衡」需要一個把 trust 映射成採納機率的判準。
// 本專案 07-31 已抓到六個恆假，其中三個出在「提議的判準」——共同形狀＝
// **拿一個看起來合理的數字去卡另一個沒實際量過的量**。
// 所以動手前先量：真實生涯對局裡，攻擊池內各人的 effectiveTrust 長什麼樣、
// 「我的 trust ÷ 池內最高 trust」這個比值實際跨多大的帶。
//
// 取得路徑（`02 §6.1` 條 4）：**不重刻判斷式**——池子用真實的
// attackPointsOf → applyRouteKinds 重建，並以「sim 自己選出的 attackerId
// 必定落在重建的池內」自我驗證忠實度（poolMismatch 必須為 0）。
//
// 跑法：node tools/called-play-probe.mjs [每對手場數=1]
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, attackPointsOf } from '../src/sim/ai.js';
import { applyRouteKinds } from '../src/sim/approach.js';
import { effectiveTrust, trustToWeights } from '../src/sim/trust.js';

const PER_OPPONENT = Number(process.argv[2] ?? 1);
const MAX_TICKS = 400000;

const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');

const heroRatios = [];   // 主角（玩家那名球員）在池內的 trust 比值
const allRatios = [];    // 池內每個人的 trust 比值
const heroShares = [];   // 主角的 trust 權重佔比（trustToWeights，無 floorShare）
const allShares = [];
const heroTrusts = [];
const poolMax = [];
const poolSizes = [];
let planPoints = 0;
let heroInPool = 0;
let poolMismatch = 0;

function playOne(seed, opponentId) {
  const career = createCareer({ seed });
  const player = createCareerPlayer('探針', { seed });
  const members = buildStarterMembers();
  const lineup = defaultLineup(members, player.id, player.currentRole);
  const roster = { capacity: 12, members, alumni: [] };
  const setup = careerMatchSetup(
    career, player, { id: 'group-1', opponentId }, roster, lineup, 1,
  );
  const g = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles, liberos: setup.liberos,
  });
  const ai = createAiState();
  const heroId = player.id;
  let lastFlight = -1;
  while (g.phase !== 'set_over' && g.tick < MAX_TICKS) {
    // 規劃點＝我方持球第二觸窗（ensureFlightPlan 的 touches===1 分支同一個條件）
    const r = g.rally;
    const isPlan = g.phase === 'rally' && r.possession === 'A' && r.touches === 1
      && r.flightId !== lastFlight;
    stepGame(g, aiCollectIntents(g, ai));
    if (isPlan && ai.attackerId) {
      lastFlight = r.flightId;
      const pts = applyRouteKinds(
        attackPointsOf(g, 'A', ai.claimId, ai.passTier ?? 'perfect', ai.passReceiverId),
        { flightId: r.flightId, seed: g.seed ?? 0, passTier: ai.passTier ?? 'perfect' },
      );
      if (!pts.some((p) => p.pid === ai.attackerId)) { poolMismatch += 1; continue; }
      planPoints += 1;
      poolSizes.push(pts.length);
      const trusts = pts.map((p) => effectiveTrust(g, g.players[p.pid]));
      const mx = Math.max(...trusts);
      poolMax.push(mx);
      for (const t of trusts) allRatios.push(mx > 0 ? t / mx : 0);
      // 既有尺規：trustToWeights（含 rowFactor 後排折減），**不套 floorShare**
      const w = trustToWeights(pts.map((p, k) => ({ trust: trusts[k], rowFactor: p.rowFactor })));
      for (const v of w) allShares.push(v);
      const i = pts.findIndex((p) => p.pid === heroId);
      if (i >= 0) {
        heroInPool += 1;
        heroTrusts.push(trusts[i]);
        heroRatios.push(mx > 0 ? trusts[i] / mx : 0);
        heroShares.push(w[i]);
      }
    }
  }
}

for (const opp of OPPONENTS) {
  for (let i = 0; i < PER_OPPONENT; i += 1) {
    playOne(1 + i * 101 + OPPONENTS.indexOf(opp) * 7919, opp.id);
  }
}

const band = (arr, lo, hi) => arr.filter((v) => v >= lo && v < hi).length;
console.log(`規劃點 ${planPoints}　池大小 p50 ${q(poolSizes, 0.5)}　池忠實度不符 ${poolMismatch}（須為 0）`);
console.log(`池內最高 trust：min ${f2(Math.min(...poolMax))} p50 ${f2(q(poolMax, 0.5))} max ${f2(Math.max(...poolMax))}`);
console.log(`主角在池內 ${heroInPool}/${planPoints}　主角 effectiveTrust：`
  + `min ${f2(Math.min(...heroTrusts))} p50 ${f2(q(heroTrusts, 0.5))} max ${f2(Math.max(...heroTrusts))}`);
for (const [name, arr] of [
  ['主角比值', heroRatios], ['池內全員比值', allRatios],
  ['★主角 trust 權重佔比', heroShares], ['★池內全員權重佔比', allShares],
]) {
  console.log(`\n${name} 比值 trust÷池內最高（n=${arr.length}）：`
    + ` min ${f2(Math.min(...arr))} p10 ${f2(q(arr, 0.1))} p50 ${f2(q(arr, 0.5))}`
    + ` p90 ${f2(q(arr, 0.9))} max ${f2(Math.max(...arr))}`);
  console.log(`  分帶： <0.25 ${band(arr, 0, 0.25)}　0.25–0.5 ${band(arr, 0.25, 0.5)}`
    + `　0.5–0.75 ${band(arr, 0.5, 0.75)}　0.75–1 ${band(arr, 0.75, 1)}　=1 ${arr.filter((v) => v >= 1).length}`);
}
