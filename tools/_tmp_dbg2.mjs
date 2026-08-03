globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { serverId } = await import('../src/sim/match.js');
const { createCareer, createCareerPlayer, careerMatchSetup } = await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
const career = createCareer({ seed: 900000, playerName: '探針' });
const player = createCareerPlayer('探針');
const setup = careerMatchSetup(career, player, { id: 'group-3', stage: 'group', opponentId: 'obsidian', label: '' }, { capacity: 12, members: buildStarterMembers() }, null);
const game = createGame({ seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles, liberos: setup.liberos, setTarget: 25, ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}), ...(setup.benches ? { benches: setup.benches } : {}) });
const ai = createAiState();
let hitA = 0, hitA2 = 0, hitB = 0, tot = 0, guard = 0;
const samp = [];
while (game.phase !== 'set_over' && guard < 200000) {
  guard += 1;
  if (game.phase === 'serve' && serverId(game.match) === 'A2') { /* AI serves for A2 since we include all */ }
  const r = game.rally;
  if (game.phase === 'rally' && r.possession === 'B' && r.touches === 2 && ai.blockPlan) {
    tot += 1;
    if (ai.blockPlan.team === 'A') hitA += 1;
    if (ai.blockPlan.team === 'B') hitB += 1;
    if (ai.blockPlan.team === 'A' && ai.blockPlan.byPid?.A2) { hitA2 += 1; if (samp.length < 5) samp.push(JSON.stringify(ai.blockPlan.byPid.A2)); }
  }
  stepGame(game, aiCollectIntents(game, ai));
}
console.log({ tot, hitA, hitB, hitA2 });
console.log(samp);
