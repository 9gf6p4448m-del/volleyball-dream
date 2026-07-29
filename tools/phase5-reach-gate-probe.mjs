// Phase 5 §十 量測探針 —— 「觸球判定改了，到底有沒有咬到？」
//
// ★ 為什麼需要這支 ★
// 階段一末段把可及體膨脹一個球半徑（統一 ⑤ 的兩套標準）後，逐值 hash 探針
// （tools/sim-hash-probe.mjs）竟然顯示行為零變化——10.5cm 不可能沒影響。
// 原因是 **sim 的閘門不是唯一的閘門**：AI 在送出觸球 intent 之前，自己還有一道
// 更嚴的門（`ai.js` 的 `AI.ATTEMPT_RADIUS = 0.95` ⇒ 1.3 × 0.95 ＝ 1.235m）。
// 全 AI 對局裡，dist 落在 (1.3, 1.405] 的 intent **根本不會被送出**，
// 於是放寬 sim 側的閘門對 AI 比賽毫無效果。
//
// ⇒ **教訓：sim 判定的可及半徑，只有在比 AI 自己的門更嚴時才會咬到行為。**
//   階段五要把接球可及縮到 身高×0.38（≈0.70m）——那時它會遠比 1.235m 嚴，
//   會真的咬，而且會連帶讓 `AI.ATTEMPT_RADIUS`／`CLOSE_RADIUS` 這兩個
//   「REACH_RADIUS 的比例」失去原本的校準意義（它們是對著 1.3 訂的）。
//   本探針就是量這件事的尺。
//
// ★ 怎麼跑 ★
//   node tools/phase5-reach-gate-probe.mjs [場數=3]
//   VD_SEED_BASE=99 node tools/phase5-reach-gate-probe.mjs
//
// ★ 輸出的意思 ★
//   殼層命中 ＝ 舊可及體擋掉、新可及體放行的觸球嘗試次數（＝行為變更的實際觸發數）
//   若為 0，代表這次判定變更被上游的 AI 閘門完全遮蔽，sim 的 hash 不會有任何變化。
import { createCareer, createCareerPlayer, careerMatchSetup } from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';
import { defaultLineup } from '../src/career/lineup.js';
import { OPPONENTS } from '../src/career/opponents.js';
import { createGame, stepGame, TUNING } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, AI } from '../src/sim/ai.js';
import { reachVolumeFor, ballInReach } from '../src/sim/reach.js';
import { staminaPerfMul } from '../src/sim/stamina.js';
import { BALL } from '../src/sim/constants.js';

const MATCHES = Number.parseInt(process.argv[2] ?? '3', 10);
const SEED_BASE = Number.parseInt(process.env.VD_SEED_BASE ?? '1', 10);
const TOUCH_ACTIONS = new Set(['receive', 'set', 'spike', 'dive']);

let attempts = 0;
let shellHit = 0;
let shellHoriz = 0;
let shellVert = 0;
let maxDist = 0;
const distByAction = {};

for (let i = 0; i < MATCHES; i += 1) {
  const seed = SEED_BASE + i * 101;
  const career = createCareer({ seed });
  const pl = createCareerPlayer('探針', { seed });
  const members = buildStarterMembers();
  const setup = careerMatchSetup(
    career, pl, { id: 'group-1', opponentId: OPPONENTS[i % OPPONENTS.length].id },
    { capacity: 12, members, alumni: [] },
    defaultLineup(members, pl.id, pl.currentRole), 1,
  );
  const g = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles, liberos: setup.liberos,
  });
  const ai = createAiState();
  while (g.phase !== 'set_over' && g.tick < 400000) {
    const intents = aiCollectIntents(g, ai);
    for (const it of intents) {
      if (!TOUCH_ACTIONS.has(it.action)) continue;
      const p = g.players[it.playerId];
      const a = g.actors[it.playerId];
      if (!p || !a) continue;
      attempts += 1;
      const base = {
        player: p, actor: a, action: it.action, jump: it.jump,
        jumpMul: staminaPerfMul(g, p), tuning: TUNING,
      };
      const v0 = reachVolumeFor({ ...base, inflate: 0 });
      const v1 = reachVolumeFor({ ...base, inflate: BALL.RADIUS });
      const r0 = ballInReach(g.ball, v0);
      const r1 = ballInReach(g.ball, v1);
      if (r0.dist > maxDist) maxDist = r0.dist;
      (distByAction[it.action] ??= []).push(r0.dist);
      if (!r0.ok && r1.ok) {
        shellHit += 1;
        if (r0.dist > v0.r) shellHoriz += 1;
        if (g.ball.y > v0.yMax) shellVert += 1;
      }
    }
    stepGame(g, intents);
  }
}

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

console.log(`== 佈景 ==  ${MATCHES} 局（雙方 AI 代打）　種子基底 ${SEED_BASE}`);
console.log('');
console.log('== 球半徑統一（可及體膨脹 BALL.RADIUS）的實際觸發 ==');
console.log(`觸球嘗試 intent 總數           ${attempts}`);
console.log(`殼層命中（舊擋掉、新放行）     ${shellHit}`
  + `${shellHit === 0 ? '  ← 被上游閘門完全遮蔽，sim hash 不會變' : ''}`);
console.log(`  其中水平超出舊半徑           ${shellHoriz}`);
console.log(`  其中高過舊頂端               ${shellVert}`);
console.log('');
console.log('== 為什麼：兩道閘門誰比較嚴 ==');
console.log(`sim 水平閘  TUNING.REACH_RADIUS          ${TUNING.REACH_RADIUS.toFixed(4)} m`);
console.log(`AI 自己的閘 REACH_RADIUS × ATTEMPT_RADIUS ${(TUNING.REACH_RADIUS * AI.ATTEMPT_RADIUS).toFixed(4)} m`
  + '  ← 更嚴者先擋');
console.log(`AI 實際送出的 intent 最大 dist            ${maxDist.toFixed(4)} m`);
console.log('');
console.log('== 各動作的實際到位落差（供階段五訂目標值參考）==');
for (const [k, arr] of Object.entries(distByAction).sort()) {
  console.log(`  ${k.padEnd(8)} n=${String(arr.length).padStart(6)}  `
    + `p50=${pct(arr, 0.5).toFixed(3)}m  p90=${pct(arr, 0.9).toFixed(3)}m  `
    + `max=${Math.max(...arr).toFixed(3)}m`);
}
