import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { createDirectGame, stepDirectGame, getDirectPose } = await import(pathToFileURL(root + '/src/sim/directGame.js'));
const { resolveHitAction, DIVE_WINDOW_CENTRE, contextAction } = await import(pathToFileURL(root + '/src/sim/directReceiveRules.js'));
const { CHASE } = await import(pathToFileURL(root + '/tools/receive-assist-probe.mjs'));
const { DIRECT_PHYSICS: C, RECEIVE_RULES: R } = await import(pathToFileURL(root + '/src/sim/directConstants.js'));
const cmd = (s, action, move = { x: 0, z: 0 }) => ({ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action });
const G = 9.81;
function arrival(f, y) { const a = -G / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); return { t, x: f.x + f.vx * t, z: f.z + f.vz * t }; }
function freeFlightTick(b) { const dt = (1 / 60) / C.substeps; let { x, y, z, vx, vy, vz } = b; for (let i = 0; i < C.substeps; i++) { vy -= C.gravity * dt; x += vx * dt; y += vy * dt; z += vz * dt; } return { x, y, z }; }
function gateDistance(pose, b) { let best = Infinity; for (const q of pose) { if (q.part !== 'forearm') continue; const dx = q.b.x - q.a.x, dz = q.b.z - q.a.z, l2 = dx * dx + dz * dz; const u = l2 > 1e-12 ? Math.max(0, Math.min(1, ((b.x - q.a.x) * dx + (b.z - q.a.z) * dz) / l2)) : 0; best = Math.min(best, Math.hypot(b.x - (q.a.x + dx * u), b.z - (q.a.z + dz * u))); } return best; }
const dists = [];
for (const f of CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5]]) for (const [ex, ez] of CHASE.errors) for (const off of CHASE.offsets) {
  const s = createDirectGame(); s.player.x = px; s.player.z = pz;
  Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
  const a = arrival(f, 0.44 * s.player.height);
  const goal = { x: a.x + ex, z: a.z + 0.3 * s.player.height + ez };
  const press = Math.round(a.t / (1 / 60)) - 13 + off;
  for (let t = 0; t < 240; t++) {
    const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
    const move = t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
    const action = t === Math.max(0, press) ? resolveHitAction(s) : null;
    const before = { ...s.ball };
    stepDirectGame(s, [cmd(s, action, move)]);
    const hit = s.events.find((e) => e.type === 'contact');
    if (hit && hit.tier && hit.technique === 'dive') { dists.push({ g: gateDistance(getDirectPose(s, 0), freeFlightTick(before)), off, f, px, pz, ex, ez }); break; }
    if (s.events.some((e) => ['ground', 'net', 'out'].includes(e.type))) break;
  }
}
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))]; };
console.log('chase dives', dists.length, 'gate median', q(dists.map((d) => d.g), 0.5).toFixed(3), 'p95', q(dists.map((d) => d.g), 0.95).toFixed(3), 'max', Math.max(...dists.map((d) => d.g)).toFixed(3), '>0.5:', dists.filter((d) => d.g > 0.5).length);
console.log(dists.filter((d) => d.g > 0.5).slice(0, 5).map((d) => JSON.stringify(d)).join('\n'));
// Boundary: player near the sideline, ball dropping beyond it (still inside the band).
for (const [px, bx] of [[3.6, 5.2], [3.9, 5.6], [-3.7, -5.3]]) {
  const s = createDirectGame(); s.player.x = px; s.player.z = 5;
  const ball = { x: bx, y: 2.5, z: 5 - R.underForward * 1.75, vx: 0, vy: 0, vz: 0 };
  Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true });
  let pressed = false, res = null;
  for (let t = 0; t < 240; t++) {
    let action = null;
    if (!pressed && t === 40 - 19) { action = contextAction(s); pressed = true; res = { context: action }; }
    const before = { ...s.ball };
    stepDirectGame(s, [cmd(s, action)]);
    const hit = s.events.find((e) => e.type === 'contact');
    if (hit) { res.hit = `${hit.part}:${hit.tier}/${hit.technique}`; res.gate = gateDistance(getDirectPose(s, 0), freeFlightTick(before)).toFixed(2); res.tick = t; res.px = s.player.x.toFixed(2); break; }
    if (s.events.some((e) => ['ground', 'net', 'out'].includes(e.type))) { res.end = s.events.find((e) => ['ground', 'net', 'out'].includes(e.type)).type; res.miss = JSON.stringify(s.events.find((e) => e.miss)?.miss); break; }
  }
  console.log('boundary', px, bx, JSON.stringify(res));
}
