// 題 E 收尾探針 2 —— career 真實路徑（對曜石）上兩張賭局字卡的觸發率
//
// 目的：排除「headless 有卡、career 環境沒卡」的環境差（aiProfiles 注入／隊伍代號）。
// 逐扣球分三類：扣球者＝玩家角色／玩家有跑助跑線／玩家只當二傳（本波第二觸是他）。
// 對每類記 blockBetFeedbackOf 的實際回卡。零 src 改動。
// 跑法：node tools/block-card-career-probe.mjs [局數=10]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { blockBetFeedbackOf } from '../src/input/blockBetFeedback.js';
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
  let lastSetPid = null;
  let guard = 0;
  while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
    guard += 1;
    const intents = aiCollectIntents(game, ai, []);
    for (const e of stepGame(game, intents)) {
      if (e.type === 'TOUCH' && e.kind === 'set' && e.team === 'A') lastSetPid = e.playerId;
      if (e.type === 'DEAD_BALL') lastSetPid = null;
      if (e.type === 'TOUCH' && e.kind === 'spike' && e.team === 'A') {
        tally.spikes += 1;
        const card = blockBetFeedbackOf(game, ai, meId, e.playerId);
        const bucket = (c, slot) => {
          if (!c) return;
          if (/賭中/.test(c.text)) slot.hit += 1; else slot.bet += 1;
        };
        const ranRoute = ai.approach?.team === 'A'
          && !!ai.approach.routes?.some((rt) => rt.pid === meId);
        if (e.playerId === meId) { tally.meSpiker += 1; bucket(card, tally.cardWhenSpiker); }
        else if (ranRoute) { tally.meRoute += 1; bucket(card, tally.cardWhenRoute); }
        else if (lastSetPid === meId) { tally.meSetterOnly += 1; bucket(card, tally.cardWhenSetterOnly); }
        else tally.other += 1;
      }
    }
  }
}

console.log(`career 對曜石 ${SETS} 局：A 隊扣球 ${tally.spikes}`);
console.log(`  扣球者＝玩家: ${tally.meSpiker}　回卡 賭錯 ${tally.cardWhenSpiker.bet}／賭中 ${tally.cardWhenSpiker.hit}`);
console.log(`  玩家有跑線  : ${tally.meRoute}　回卡 賭錯 ${tally.cardWhenRoute.bet}／賭中 ${tally.cardWhenRoute.hit}`);
console.log(`  玩家只當二傳: ${tally.meSetterOnly}　回卡 賭錯 ${tally.cardWhenSetterOnly.bet}／賭中 ${tally.cardWhenSetterOnly.hit}`);
console.log(`  其他        : ${tally.other}`);
