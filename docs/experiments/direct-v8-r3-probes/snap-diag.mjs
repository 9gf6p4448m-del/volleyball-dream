import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { createDirectGame, stepDirectGame, getDirectPose } = await import(pathToFileURL(root + '/src/sim/directGame.js'));
const { resolveHitAction, platformCentre } = await import(pathToFileURL(root + '/src/sim/directReceiveRules.js'));
const { CHASE } = await import(pathToFileURL(root + '/tools/receive-assist-probe.mjs'));
const { DIRECT_PHYSICS: C } = await import(pathToFileURL(root + '/src/sim/directConstants.js'));
const cmd = (s, action, move) => ({ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action });
const G = 9.81;
function arrival(f, y) { const a = -G / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); return { t, x: f.x + f.vx * t, z: f.z + f.vz * t }; }
function freeFlightTick(b) { const dt = (1 / 60) / C.substeps; let { x, y, z, vx, vy, vz } = b; for (let i = 0; i < C.substeps; i++) { vy -= C.gravity * dt; x += vx * dt; y += vy * dt; z += vz * dt; } return { x, y, z }; }
const rows = [];
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
    if (hit && hit.tier && hit.technique !== 'dive') {
      const free = freeFlightTick(before), pc = platformCentre(getDirectPose(s, 0));
      const h = Math.hypot(free.x - pc.x, free.z - pc.z), dy = free.y - pc.y;
      rows.push({ disp: Math.hypot(hit.position.x - free.x, hit.position.y - free.y, hit.position.z - free.z), h, dy, reach: s.player.receiveReach, ahead: s.player.receiveAhead, tick: s.player.actionTick, tech: hit.technique, off: hit.offset });
      break;
    }
    if (s.events.some((e) => ['ground', 'net', 'out'].includes(e.type))) break;
  }
}
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))]; };
const under = rows.filter((r) => r.tech === 'underhand');
console.log('n', rows.length, 'underhand', under.length);
for (const k of ['disp', 'h', 'dy']) console.log(k, 'median', q(under.map((r) => r[k]), 0.5).toFixed(3), 'p95', q(under.map((r) => r[k]), 0.95).toFixed(3), 'p05', q(under.map((r) => r[k]), 0.05).toFixed(3));
const big = under.filter((r) => r.disp > 0.12).slice(0, 8);
console.log(big.map((r) => JSON.stringify({ disp: +r.disp.toFixed(3), h: +r.h.toFixed(3), dy: +r.dy.toFixed(3), reach: +r.reach.toFixed(3), ahead: +r.ahead.toFixed(3), tick: r.tick, off: r.off })).join('\n'));
console.log('saturated reach', under.filter((r) => Math.abs(Math.abs(r.reach) - 0.2) < 1e-6).length, 'saturated ahead', under.filter((r) => Math.abs(Math.abs(r.ahead) - 0.2) < 1e-6).length);
