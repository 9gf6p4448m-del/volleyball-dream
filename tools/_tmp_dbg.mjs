globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
const THREE = await import('three');
const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { isFrontRow } = await import('../src/sim/rotation.js');
const { createMatchControls, NEAR_NET_Z } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { createCareer, createCareerPlayer, careerMatchSetup } = await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
const career = createCareer({ seed: 900000, playerName: '探針' });
const player = createCareerPlayer('探針');
const setup = careerMatchSetup(career, player, { id: 'group-3', stage: 'group', opponentId: 'obsidian', label: '' }, { capacity: 12, members: buildStarterMembers() }, null);
const game = createGame({ seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles, liberos: setup.liberos, setTarget: 25, ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}), ...(setup.benches ? { benches: setup.benches } : {}) });
console.log('A2 player:', JSON.stringify({ id: game.players.A2?.id, role: game.players.A2?.currentRole, name: game.players.A2?.name }));
console.log('rotations A:', JSON.stringify(game.match.rotations.A));
const ai = createAiState();
const dom = { addEventListener() {} };
const camera = new THREE.PerspectiveCamera(60, 16/9, 0.1, 200); camera.position.set(0,6,14); camera.lookAt(0,1,0); camera.updateMatrixWorld();
const rig = { setLook(){}, resetLook(){}, gazePoint(){return null;}, getMode(){return 'third';} };
const controls = createMatchControls(dom, camera, 'A2', rig, true);
let served = false;
let n2 = 0, nFront = 0, nNear = 0, zs = [];
let guard = 0;
while (game.phase !== 'set_over' && game.phase !== 'matchover' && guard < 400000) {
  guard += 1;
  if (game.phase !== 'serve') served = false;
  else if (serverId(game.match) === 'A2' && game.tick >= game.serveReadyTick && !served) { controls.serveNow(game, controls.serveZones(game)[0].aim, null); served = true; }
  const r = game.rally;
  if (game.phase === 'rally' && r.possession === 'B' && r.touches === 2) {
    n2 += 1;
    const fr = isFrontRow(game.match.rotations.A, 'A2');
    if (fr) nFront += 1;
    const z = game.actors.A2.z;
    if (fr) zs.push(Number(z.toFixed(2)));
    if (fr && Math.abs(z) < NEAR_NET_Z) nNear += 1;
  }
  const its = [...controls.collect(game, ai), ...aiCollectIntents(game, ai, ['A2'])];
  const ev = stepGame(game, its);
  controls.onEvents(ev);
}
console.log('ticks with B touches==2:', n2, 'front:', nFront, 'nearNet:', nNear, 'NEAR_NET_Z', NEAR_NET_Z);
zs.sort((a,b)=>a-b);
console.log('front-row A2 z p10/p50/p90:', zs[Math.floor(zs.length*0.1)], zs[Math.floor(zs.length*0.5)], zs[Math.floor(zs.length*0.9)]);
