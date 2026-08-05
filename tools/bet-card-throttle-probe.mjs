// 題 E 收尾 3 —— 賭局字卡節流參數「先量再定」
//
// 背景：收尾 2 之後親扣回卡率 91%，Sawmah 回「加節流，看看會不會太少」。
// 本探針**不猜數字**：先跑真實 career 對局收集「若不節流會出哪些卡」的完整時間軸
//（含 rally 序號、是否關鍵分、賭中/賭錯），再對候選冷卻值離線重放，算出每局剩幾張。
//
// 為什麼要量：本專案已有九個「拿沒量過的數字去卡另一個沒量過的量」的前例
//（恆真/恆假判準）。冷卻若比實際出卡間隔還短＝形同沒節流；比一局還長＝整局零卡。
//
// 零 src 行為改動；只讀公開狀態＋呼叫既有純函式。
// 跑法：node tools/bet-card-throttle-probe.mjs [局數=10]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import {
  blockBetFeedbackOf, createBlockBetArm, createBetCardGate, BET_CARD_COOLDOWN_RALLIES,
} from '../src/input/blockBetFeedback.js';
import { keyPointOf } from '../src/ui/presentation.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

const SETS = Number.parseInt(process.argv[2] ?? '10', 10);
const CANDIDATES = [0, 2, 3, 4, 6, 8, 12]; // 冷卻＝距上次出卡至少幾個 rally

// 每局一條時間軸：[{ rally, keyPoint, hit }]（hit＝賭中卡，否則賭錯卡）
const timelines = [];

for (let run = 0; run < SETS; run += 1) {
  const career = createCareer({ seed: 770000 + run * 7919, playerName: '探針' });
  const player = createCareerPlayer('探針');
  const roster = { capacity: 12, members: buildStarterMembers() };
  const entry = { id: 'group-3', stage: 'group', opponentId: 'obsidian', label: '' };
  const setup = careerMatchSetup(career, player, entry, roster, null);
  const game = createGame({
    seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles,
    liberos: setup.liberos, setTarget: 25,
    ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}),
    ...(setup.benches ? { benches: setup.benches } : {}),
  });
  const meId = Object.keys(game.players).find((pid) => game.players[pid]?.name === '探針')
    ?? Object.keys(game.players).find((pid) => game.players[pid]?.isPlayer);
  if (!meId) continue;
  const ai = createAiState();
  const arm = createBlockBetArm();
  const line = [];
  let rally = 0;
  let guard = 0;
  const resolve = (p) => {
    const card = blockBetFeedbackOf(game, ai, meId, p.spikerId,
      { setterId: p.setterId, ranRoute: p.ranRoute });
    if (card) line.push({ rally, keyPoint: keyPointOf(game), hit: /賭中/.test(card.text) });
  };
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    for (const e of stepGame(game, intents)) {
      let ctx = null;
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        ctx = {
          ranRoute: ai.approach?.team === 'A'
            && !!ai.approach.routes?.some((rt) => rt.pid === meId),
        };
      }
      const armed = arm.onEvent(e, 'A', game.rally.flightId, ctx);
      if (armed) resolve(armed);
      if (e.type === 'DEAD_BALL') rally += 1;
    }
    const armed = arm.onFrame(game.ball?.z ?? 0);
    if (armed) resolve(armed);
  }
  timelines.push(line);
}

const avg = (xs) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));

// 離線重放：冷卻 N rally；關鍵分不受冷卻（一律出）；本局第一張一律出。
// `hitFree`＝賭中卡不受冷卻（變體 B：吵的是賭錯 10.6/局，賭中僅 3.4/局且訊息量更高）
function replay(line, cooldown, hitFree = false) {
  let last = -Infinity;
  let shown = 0;
  let keyShown = 0;
  let hits = 0;
  for (const c of line) {
    const first = last === -Infinity;
    const free = c.keyPoint || (hitFree && c.hit);
    if (first || free || c.rally - last >= cooldown) {
      shown += 1;
      if (c.keyPoint) keyShown += 1;
      if (c.hit) hits += 1;
      last = c.rally; // 免冷卻的卡也重置冷卻＝不會出完馬上又出
    }
  }
  return { shown, keyShown, hits };
}

console.log(`career 對曜石 ${SETS} 局（AI 代打；評估點＝球到網，與 matchLoop 同路徑）`);
console.log(`不節流：每局平均 ${avg(timelines.map((l) => l.length)).toFixed(1)} 張`
  + `（賭中 ${avg(timelines.map((l) => l.filter((c) => c.hit).length)).toFixed(1)}`
  + `／賭錯 ${avg(timelines.map((l) => l.filter((c) => !c.hit).length)).toFixed(1)}）`);
// ★ 收尾：用**生產端真正的閘**（createBetCardGate）重放一次，確認離線重放的數字
// 與實際上線行為一致——離線模型算對、生產端寫錯的話這一行會露餡（02 §6.1 條 4）
{
  const real = timelines.map((line) => {
    const gate = createBetCardGate();
    return line.filter((c) => gate.allow({
      rally: c.rally, keyPoint: c.keyPoint, hit: c.hit,
    })).length;
  });
  console.log(`\n【生產端實閘（BET_CARD_COOLDOWN_RALLIES=${BET_CARD_COOLDOWN_RALLIES}）】`
    + `每局 ${avg(real).toFixed(1)} 張（最少 ${Math.min(...real)}／最多 ${Math.max(...real)}）`);
}

for (const hitFree of [false, true]) {
  console.log(hitFree
    ? '\n【變體 B：賭中不受冷卻（只節流賭錯）】'
    : '\n【變體 A：兩種卡一起節流】');
  console.log('冷卻(rally)  每局張數   其中賭中   其中關鍵分   最少的一局   最多的一局');
  for (const cd of CANDIDATES) {
    const res = timelines.map((l) => replay(l, cd, hitFree));
    const shown = res.map((r) => r.shown);
    console.log(
      `${String(cd).padStart(6)}      ${avg(shown).toFixed(1).padStart(6)}`
      + `    ${avg(res.map((r) => r.hits)).toFixed(1).padStart(6)}`
      + `     ${avg(res.map((r) => r.keyShown)).toFixed(1).padStart(6)}`
      + `      ${String(Math.min(...shown)).padStart(6)}`
      + `      ${String(Math.max(...shown)).padStart(6)}`,
    );
  }
}
