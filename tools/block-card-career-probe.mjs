// 題 E 收尾探針 2 —— career 真實路徑（對曜石）上兩張賭局字卡的觸發率
//
// 目的：排除「headless 有卡、career 環境沒卡」的環境差（aiProfiles 注入／隊伍代號）。
// 逐扣球分三類：扣球者＝玩家角色／玩家有跑助跑線／玩家只當二傳（本波第二觸是他）。
// 對每類記 blockBetFeedbackOf 的實際回卡。零 src 改動。
// 跑法：node tools/block-card-career-probe.mjs [局數=10]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { blockBetFeedbackOf, createBlockBetArm } from '../src/input/blockBetFeedback.js';
import {
  createCareer, createCareerPlayer, careerMatchSetup,
} from '../src/career/careerState.js';
import { buildStarterMembers } from '../src/career/roster.js';

const SETS = Number.parseInt(process.argv[2] ?? '10', 10);

const tally = {
  spikes: 0, meSpiker: 0, meRoute: 0, meSetterOnly: 0, other: 0,
  cardWhenSpiker: { bet: 0, hit: 0 },
  cardWhenRoute: { bet: 0, hit: 0 },
  cardWhenSetterOnly: { bet: 0, hit: 0 },
};

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
  const meId = Object.keys(game.players)
    .find((pid) => game.players[pid

]?.name === '探針')
    ?? Object.keys(game.players).find((pid) => game.players[pid]?.isPlayer);
  if (!meId) { console.log('找不到玩家角色，略過'); continue; }
  const ai = createAiState();
  // 2026-08-05 收尾 2 改版：改走與 matchLoop 同形的遞延結算路徑（createBlockBetArm）
  // ——事件逐一餵 onEvent、每 tick 餵一次 onFrame(ball.z)，結算那一刻才呼叫
  // blockBetFeedbackOf。量的就是「球到網那一刻」的回卡率。
  const arm = createBlockBetArm();
  let spikeMeta = null; // 本波扣球的分類（結算時歸類用）
  let guard = 0;
  const bucket = (c, slot) => {
    if (!c) return;
    if (/賭中/.test(c.text)) slot.hit += 1; else slot.bet += 1;
  };
  const resolve = (p) => {
    const card = blockBetFeedbackOf(game, ai, meId, p.spikerId,
      { setterId: p.setterId, ranRoute: p.ranRoute });
    if (!spikeMeta) return;
    if (spikeMeta.kind === 'spiker') bucket(card, tally.cardWhenSpiker);
    else if (spikeMeta.kind === 'route') bucket(card, tally.cardWhenRoute);
    else if (spikeMeta.kind === 'setter') bucket(card, tally.cardWhenSetterOnly);
  };
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    for (const e of stepGame(game, intents)) {
      let ctx = null;
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        tally.spikes += 1;
        const ranRoute = ai.approach?.team === 'A'
          && !!ai.approach.routes?.some((rt) => rt.pid === meId);
        ctx = { ranRoute }; // 武裝時快照（與 matchLoop 同形）
        if (e.playerId === meId) { tally.meSpiker += 1; spikeMeta = { kind: 'spiker' }; }
        else if (ranRoute) { tally.meRoute += 1; spikeMeta = { kind: 'route' }; }
        else { spikeMeta = { kind: 'setterMaybe' }; }
      }
      const armed = arm.onEvent(e, 'A', game.rally.flightId, ctx);
      if (armed) {
        if (spikeMeta?.kind === 'setterMaybe') {
          if (armed.setterId === meId) { tally.meSetterOnly += 1; spikeMeta = { kind: 'setter' }; }
          else { tally.other += 1; spikeMeta = null; }
        }
        resolve(armed);
        spikeMeta = null;
      }
      if (e.type === 'DEAD_BALL') spikeMeta = null;
    }
    const armed = arm.onFrame(game.ball?.z ?? 0);
    if (armed) {
      if (spikeMeta?.kind === 'setterMaybe') {
        if (armed.setterId === meId) { tally.meSetterOnly += 1; spikeMeta = { kind: 'setter' }; }
        else { tally.other += 1; spikeMeta = null; }
      }
      resolve(armed);
      spikeMeta = null;
    }
  }
}

console.log(`career 對曜石 ${SETS} 局：A 隊扣球 ${tally.spikes}`);
console.log(`  扣球者＝玩家: ${tally.meSpiker}　回卡 賭錯 ${tally.cardWhenSpiker.bet}／賭中 ${tally.cardWhenSpiker.hit}`);
console.log(`  玩家有跑線  : ${tally.meRoute}　回卡 賭錯 ${tally.cardWhenRoute.bet}／賭中 ${tally.cardWhenRoute.hit}`);
console.log(`  玩家只當二傳: ${tally.meSetterOnly}　回卡 賭錯 ${tally.cardWhenSetterOnly.bet}／賭中 ${tally.cardWhenSetterOnly.hit}`);
console.log(`  其他        : ${tally.other}`);
