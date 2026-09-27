// Judgement-frame snap displacement over the chase probe (all 2646 cases):
// distance between where the ball would have been at the end of the judgement
// tick in free flight and where the rule put it (the contact event position).
// Usage: node snap-probe.mjs <repo root>
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { createDirectGame, stepDirectGame, getDirectPose } = await import(pathToFileURL(root + '/src/sim/directGame.js'));
const { closestPoint } = await import(pathToFileURL(root + '/src/sim/directPhysics.js'));
const { resolveHitAction } = await import(pathToFileURL(root + '/src/sim/directReceiveRules.js'));
const { CHASE } = await import(pathToFileURL(root + '/tools/receive-assist-probe.mjs'));
const { DIRECT_PHYSICS: C } = await import(pathToFileURL(root + '/src/sim/directConstants.js'));

const cmd = (s, action, move) => ({ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action });
const G = 9.81;
function arrival(f, y) { const a = -G / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); return { t, x: f.x + f.vx * t, z: f.z + f.vz * t }; }
function freeFlightTick(b) {
  const dt = (1 / 60) / C.substeps;
  let { x, y, z, vx, vy, vz } = b;
  for (let i = 0; i < C.substeps; i++) { vy -= C.gravity * dt; x += vx * dt; y += vy * dt; z += vz * dt; }
  return { x, y, z };
}
function gaps(s) {
  const pose = getDirectPose(s, 0), b = s.ball;
  let arm = Infinity, body = Infinity;
  for (const q of pose) {
    const c = closestPoint(b, q.a, q.b);
    const g = Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z) - q.radius - b.radius;
    body = Math.min(body, g);
    if (q.part === 'forearm' || q.part === 'hand') arm = Math.min(arm, g);
  }
  return { arm: Math.max(0, arm), body: Math.max(0, body) };
}
const cats = { pass: [], sprayPressed: [], sprayNone: [], dive: [] };
const gapRows = { pass: [], sprayPressed: [], sprayNone: [], dive: [] };
const contactHeight = 0.44, forward = 0.3, reaction = 12;
for (const pressMode of ['auto', 'none']) for (const f of CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5]]) for (const [ex, ez] of CHASE.errors) for (const off of CHASE.offsets) {
  const s = createDirectGame(); s.player.x = px; s.player.z = pz;
  Object.assign(s.ball, f, { px: f.x, py: f.y, pz: f.z, active: true });
  const a = arrival(f, contactHeight * s.player.height);
  const goal = { x: a.x + ex, z: a.z + forward * s.player.height + ez };
  const press = Math.round(a.t / (1 / 60)) - 13 + off;
  for (let t = 0; t < 240; t++) {
    const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
    const move = t < reaction || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
    const action = pressMode === 'auto' && t === Math.max(0, press) ? resolveHitAction(s) : null;
    const before = { x: s.ball.x, y: s.ball.y, z: s.ball.z, vx: s.ball.vx, vy: s.ball.vy, vz: s.ball.vz };
    stepDirectGame(s, [cmd(s, action, move)]);
    const hit = s.events.find((e) => e.type === 'contact');
    if (hit && (hit.tier || hit.spray)) {
      const free = freeFlightTick(before);
      const disp = Math.hypot(hit.position.x - free.x, hit.position.y - free.y, hit.position.z - free.z);
      const cat = hit.tier ? (hit.technique === 'dive' ? 'dive' : 'pass') : hit.timing === 'none' ? 'sprayNone' : 'sprayPressed';
      cats[cat].push(disp);
      gapRows[cat].push(gaps(s));
      break;
    }
    if (s.events.some((e) => ['ground', 'net', 'out'].includes(e.type))) break;
  }
}
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : NaN; };
for (const [k, v] of Object.entries(cats)) {
  const g = gapRows[k];
  console.log(k, `n=${v.length}`, `median=${q(v, 0.5).toFixed(3)}`, `p95=${q(v, 0.95).toFixed(3)}`, `max=${(v.length ? Math.max(...v) : NaN).toFixed(3)}`,
    `armGap>0.05=${g.filter((x) => x.arm > 0.05).length}`, `bodyGap>0.05=${g.filter((x) => x.body > 0.05).length}`);
}
