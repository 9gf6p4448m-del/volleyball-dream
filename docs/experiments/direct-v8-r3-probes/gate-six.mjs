import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { createDirectGame, stepDirectGame, getDirectPose } = await import(pathToFileURL(root + '/src/sim/directGame.js'));
const { contextAction } = await import(pathToFileURL(root + '/src/sim/directReceiveRules.js'));
const { DIRECT_PHYSICS: C } = await import(pathToFileURL(root + '/src/sim/directConstants.js'));
const H = 1.75;
const cmd = (s, action = null) => ({ tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action });
function freeFlightTick(b) { const dt = (1 / 60) / C.substeps; let { x, y, z, vx, vy, vz } = b; for (let i = 0; i < C.substeps; i++) { vy -= C.gravity * dt; x += vx * dt; y += vy * dt; z += vz * dt; } return { x, y, z }; }
function forearmDistance(pose, b) { let best = Infinity; for (const q of pose) { if (q.part !== 'forearm') continue; const dx = q.b.x - q.a.x, dz = q.b.z - q.a.z, l2 = dx * dx + dz * dz; const u = l2 > 1e-12 ? Math.max(0, Math.min(1, ((b.x - q.a.x) * dx + (b.z - q.a.z) * dz) / l2)) : 0; best = Math.min(best, Math.hypot(b.x - (q.a.x + dx * u), b.z - (q.a.z + dz * u))); } return best; }
function lateChase(ex, off) {
  const feed = { x: 0, y: 2.8, z: 0.8, vx: -1.5, vy: 0, vz: 4 };
  const s = createDirectGame(); s.player.x = 0; s.player.z = 7.5;
  Object.assign(s.ball, feed, { px: feed.x, py: feed.y, pz: feed.z, active: true });
  const tArrive = Math.sqrt(2 * (feed.y - 0.44 * H) / C.gravity);
  const goal = { x: feed.x + feed.vx * tArrive + ex, z: feed.z + feed.vz * tArrive + 0.3 * H };
  const press = Math.round(tArrive * 60) - 13 + off;
  const out = { ex, off, context: null, hit: null, gate: null };
  for (let t = 0; t < 240; t++) {
    const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
    const move = t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
    let action = null;
    if (t === press) { out.context = contextAction(s); action = out.context ?? 'receive'; }
    const before = { ...s.ball };
    stepDirectGame(s, [{ ...cmd(s, action), move }]);
    const e = s.events.find((x) => x.type === 'contact');
    if (e) { out.hit = `${e.part}:${e.tier}/${e.technique}@${t}`; out.gate = +forearmDistance(getDirectPose(s, 0), freeFlightTick(before)).toFixed(3); break; }
    if (s.events.some((x) => ['ground', 'net', 'out'].includes(x.type))) break;
  }
  return out;
}
for (const ex of [0, 0.3, -0.3]) for (const off of [-3, -6]) console.log(JSON.stringify(lateChase(ex, off)));
