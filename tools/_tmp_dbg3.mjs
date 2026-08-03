const winListeners = {};
globalThis.window = { innerWidth: 1280, innerHeight: 720,
  addEventListener(t, f) { (winListeners[t] ??= []).push(f); }, removeEventListener() {} };
const fire = (t, code) => { for (const f of [...(winListeners[t] ?? [])]) f({ code, repeat: false, preventDefault() {} }); };
const THREE = await import('three');
const { createGame, stepGame } = await import('../src/sim/game.js');
const { createAiState, aiCollectIntents } = await import('../src/sim/ai.js');
const { isFrontRow, TEAM_SIDE } = await import('../src/sim/rotation.js');
const { createMatchControls, NEAR_NET_Z } = await import('../src/input/matchControls.js');
const { serverId } = await import('../src/sim/match.js');
const { createCareer, createCareerPlayer, careerMatchSetup } = await import('../src/career/careerState.js');
const { buildStarterMembers } = await import('../src/career/roster.js');
console.log('TEAM_SIDE', JSON.stringify(TEAM_SIDE));
const career = createCareer({ seed: 900000, playerName: '探針' });
const player = createCareerPlayer('探針');
const setup = careerMatchSetup(career, player, { id: 'group-3', stage: 'group', opponentId: 'obsidian', label: '' }, { capacity: 12, members: buildStarterMembers() }, null);
const game = createGame({ seed: setup.seed, teams: setup.teams, aiProfiles: setup.aiProfiles, liberos: setup.liberos, setTarget: 25, ...(setup.scoutRead ? { scoutRead: setup.scoutRead } : {}), ...(setup.benches ? { benches: setup.benches } : {}) });
const ai = createAiState();
const dom = { addEventListener() {} };
const camera = new THREE.PerspectiveCamera(60, 16/9, 0.1, 200); camera.position.set(0,6,14); camera.lookAt(0,1,0); camera.updateMatrixWorld();
const rig = { setLook(){}, resetLook(){}, gazePoint(){return null;}, getMode(){return 'third';} };
const controls = createMatchControls(dom, camera, 'A2', rig, true);
const held = new Set(); let served = false, guard = 0;
const samples = [];
let prevZ = null;
while (game.phase !== 'set_over' && guard < 200000) {
  guard += 1;
  if (game.phase !== 'serve') served = false;
  else if (serverId(game.match) === 'A2' && game.tick >= game.serveReadyTick && !served) { controls.serveNow(game, controls.serveZones(game)[0].aim, null); served = true; }
  const r = game.rally; const A = game.actors.A2;
  const front = game.phase === 'rally' && isFrontRow(game.match.rotations.A, 'A2');
  const def = game.phase === 'rally' && r.possession && r.possession !== 'A' && r.profile !== 'serve';
  const bo = (front && def) ? controls.blockOptions(game, ai) : null;
  const opt = bo ? (bo.find(o=>o.key==='cross') ?? bo.find(o=>o.key==='line')) : null;
  const tx = opt && opt.x != null ? opt.x : A.x;
  if (front && def) { globalThis.__bo=(globalThis.__bo||0)+1; if (opt) globalThis.__boh=(globalThis.__boh||0)+1; }
  const want = new Set();
  if (front && def) {
    if (A.z - 0.6 > 0.15) want.add('KeyW'); else if (0.6 - A.z > 0.15) want.add('KeyS');
    if (tx - A.x > 0.15) want.add('KeyD'); else if (A.x - tx > 0.15) want.add('KeyA');
  }
  for (const k of held) if (!want.has(k)) { fire('keyup', k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { fire('keydown', k); held.add(k); }
  const b0z = game.ball.z;
  const ev = stepGame(game, [...controls.collect(game, ai), ...aiCollectIntents(game, ai, ['A2'])]);
  controls.onEvents(ev);
  if (b0z <= 0 && game.ball.z > 0 && front && r.profile==='spike') {
    globalThis.__c=(globalThis.__c||0)+1; if (Math.abs(A.x-game.ball.x)<=1.1) globalThis.__ok=(globalThis.__ok||0)+1;
    if (samples.length<12) samples.push({t:game.tick, ax:+A.x.toFixed(2), az:+A.z.toFixed(2), bx:+game.ball.x.toFixed(2), by:+game.ball.y.toFixed(2)});
  }
  for (const e of ev) if (e.type==='BLOCK_TOUCH' && e.team==='A') { globalThis.__bt=(globalThis.__bt||0)+1; if (e.playerId==='A2') globalThis.__bt2=(globalThis.__bt2||0)+1; }
}
console.log({boTicks:globalThis.__bo, boHit:globalThis.__boh, crossFront:globalThis.__c, inReach:globalThis.__ok, teamBT:globalThis.__bt, a2BT:globalThis.__bt2});
console.table(samples);
