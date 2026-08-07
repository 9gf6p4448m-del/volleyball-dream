// 不變量掃描（`02 §6.1` 條 6）— 夾塞字卡／結算回饋的 mine｜decoy 兩臂實測分佈
//
// 為什麼要量：2026-08-07 覆審 MEDIUM-4(a) 讓兩張卡依「這球是不是你的」分文案。
// 若其中一臂在真實遊玩中永不出現，那條分支就是死碼（而另一臂等於沒分岔）。
// 順帶量出 `captureTandemAssign` 的每波張數（覆審 HIGH-1 的回歸指標）。
//
// 跑法：node tools/tandem-card-branch-probe.mjs [局數]
import { createGame, stepGame, createDefaultTeams } from '../src/sim/game.js';
import { createAiState, aiCollectIntents, tandemStateOf } from '../src/sim/ai.js';
import { captureTandemAssign, captureTandemOutcome } from '../src/app/matchLoop.js';

const SETS = Number.parseInt(process.argv[2] ?? '6', 10);
const PID = 'A4';

const tally = {
  assign: { mine: 0, decoy: 0 }, outcome: { mine: 0, decoy: 0 },
  episodes: [], keys: {},
};

for (let i = 0; i < SETS; i += 1) {
  const game = createGame({ seed: 500000 + i * 7919, teams: createDefaultTeams(), setTarget: 25 });
  const ai = createAiState();
  const s = { game, aiState: ai, playerId: PID, tandemAssignArmed: true };
  let cur = null;
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    if (!ai.tandemCall && tandemStateOf(game, ai, PID).open) ai.tandemCall = { pid: PID };
    stepGame(game, aiCollectIntents(game, ai, []));
    captureTandemOutcome(s);
    captureTandemAssign(s);
    const c = ai.attackCombo;
    const mineNow = !!c && c.type === 'tandem' && c.mainId === PID;
    if (mineNow && cur === null) cur = 0;
    if (s.tandemAssignPending) {
      tally.assign[s.tandemAssignPending] += 1;
      s.tandemAssignPending = false;
      if (cur === null) cur = 0;
      cur += 1;
    }
    if (!mineNow && cur !== null) { tally.episodes.push(cur); cur = null; }
    if (s.tandemOutcomeLatch) {
      const oc = s.tandemOutcomeLatch;
      const key = oc.outcome === 'applied' ? (oc.reason ?? 'applied') : (oc.reason ?? 'missed');
      tally.keys[key] = (tally.keys[key] ?? 0) + 1;
      tally.outcome[oc.mine ? 'mine' : 'decoy'] += 1;
      s.tandemOutcomeLatch = null;
      s.tandemFeedbackDone = true;
      ai.tandemCall = null;
      s.tandemFeedbackDone = false;
    }
  }
  if (cur !== null) tally.episodes.push(cur);
}

const withCard = tally.episodes.filter((n) => n > 0);
const counts = {};
for (const n of withCard) counts[n] = (counts[n] ?? 0) + 1;
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
console.log(`== 夾塞字卡分支實測（${SETS} 局，窗開就按）==`);
console.log(`  字卡 assign：mine ${tally.assign.mine}（${pct(tally.assign.mine, tally.assign.mine + tally.assign.decoy)}）`
  + `　decoy ${tally.assign.decoy}（${pct(tally.assign.decoy, tally.assign.mine + tally.assign.decoy)}）`);
console.log(`  結算 outcome：mine ${tally.outcome.mine}（${pct(tally.outcome.mine, tally.outcome.mine + tally.outcome.decoy)}）`
  + `　decoy ${tally.outcome.decoy}（${pct(tally.outcome.decoy, tally.outcome.mine + tally.outcome.decoy)}）`);
console.log(`  結算 key 分佈：${Object.entries(tally.keys).map(([k, v]) => `${k}=${v}`).join('／')}`);
console.log(`  ★每波張數★ 有卡的波 ${withCard.length} 個，張數分佈：`
  + `${Object.entries(counts).map(([n, c]) => `${n} 張×${c} 波`).join('／')}`);
