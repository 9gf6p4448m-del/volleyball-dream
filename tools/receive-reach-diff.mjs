// V3 (U4, 2026-09-27): the receive reach toward the judged ball (receiveReach /
// receiveAhead, constants receiveReachLimit / receiveReachSpeed) is picture
// only. Compare two code trees — the tree as it is and a copy whose reach
// constants differ (e.g. receiveReachLimit 0) — over the same inputs: chase
// grid (contextual press), chase grid never pressed, A14 / A16 / A16b grids.
// Per case the first touch (tick, kind, part, id, tier, technique, timing,
// offset, target) must be identical, and for a ball nothing touched the
// terminal event (type, tick, judged, miss stage) too. After a touch the ball
// leaves from the drawn arms (R6 measures there), so its contact position and
// its landing (tick, spot) may differ; the terminal type / miss stage after a
// touch is reported on its own line. Read-only.
// Usage: node tools/receive-reach-diff.mjs <rootA> <rootB>
import { pathToFileURL } from 'node:url';
const load = async (root) => {
  const imp = (p) => import(pathToFileURL(root + p));
  const G = await imp('/src/sim/directGame.js'), RR = await imp('/src/sim/directReceiveRules.js'), P = await imp('/tools/receive-assist-probe.mjs'), K = await imp('/src/sim/directConstants.js');
  return { ...G, ...RR, CHASE: P.CHASE, reach: { limit: K.DIRECT_PHYSICS.receiveReachLimit, speed: K.DIRECT_PHYSICS.receiveReachSpeed } };
};
const [LA, LB] = [await load(process.argv[2]), await load(process.argv[3])];
const r3 = (v) => (v == null ? v : Math.round(v * 1000) / 1000);
function sig(events) {
  const c = events.find((e) => e.type === 'contact'), end = events.find((e) => ['ground', 'net', 'out'].includes(e.type));
  const judge = c ? { tick: c.tick, kind: c.tier ? 'pass' : c.spray ? 'spray' : 'body', part: c.part, id: c.id, tier: c.tier ?? null, technique: c.technique ?? null, timing: c.timing ?? null, offset: r3(c.offset), target: c.target ? [r3(c.target.x), r3(c.target.z)] : null } : null;
  const pos = c ? [r3(c.position.x), r3(c.position.y), r3(c.position.z)] : null;
  const fin = end ? { type: end.type, tick: end.tick, judged: end.judged, miss: end.miss?.stage ?? null } : null;
  const landing = end ? [r3(end.position.x), r3(end.position.z)] : null;
  return { judge, pos, fin, landing };
}
const G_ = 9.81, H = 1.75;
function arrival(f, y) { const a = -G_ / 2, b = f.vy, c = f.y - y; const t = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a); return { t, x: f.x + f.vx * t, z: f.z + f.vz * t }; }
function chaseCases(L) {
  const out = [];
  for (const mode of ['auto', 'none']) for (const f of L.CHASE.feeds) for (const [px, pz] of [[-1, 6], [1, 6], [0, 7.5]]) for (const [ex, ez] of L.CHASE.errors) for (const off of L.CHASE.offsets) out.push({ kind: 'chase-' + mode, f, px, pz, ex, ez, off, mode });
  return out;
}
function runChase(L, c) {
  const s = L.createDirectGame(); s.player.x = c.px; s.player.z = c.pz;
  Object.assign(s.ball, c.f, { px: c.f.x, py: c.f.y, pz: c.f.z, active: true });
  const a = arrival(c.f, 0.44 * H), goal = { x: a.x + c.ex, z: a.z + 0.3 * H + c.ez }, press = Math.round(a.t * 60) - 13 + c.off;
  const all = [];
  let reached = 0;
  for (let t = 0; t < 240; t++) {
    const dx = goal.x - s.player.x, dz = goal.z - s.player.z, d = Math.hypot(dx, dz);
    const move = t < 12 || d < 0.08 ? { x: 0, z: 0 } : { x: dx / Math.max(d, 0.4), z: dz / Math.max(d, 0.4) };
    const action = c.mode === 'auto' && t === Math.max(0, press) ? L.resolveHitAction(s) : null;
    L.stepDirectGame(s, [{ tick: s.tick, sequence: 0, move, aim: { x: 0, z: -1 }, action }]);
    reached = Math.max(reached, Math.abs(s.player.receiveReach ?? 0), Math.abs(s.player.receiveAhead ?? 0));
    all.push(...s.events);
    if (s.events.some((e) => ['ground', 'net', 'out'].includes(e.type))) break;
  }
  return { events: all, reached };
}
function runFeedGrid(L, c) {
  const s = L.createDirectGame(); s.player.x = c.x; s.player.z = c.z;
  const all = [];
  let reached = 0;
  for (let t = 0; t < 240; t++) {
    const action = t === 0 ? 'feed' : t === c.rt ? L.resolveHitAction(s) : null;
    L.stepDirectGame(s, [{ tick: s.tick, sequence: 0, move: c.moveAt ? c.moveAt(t) : { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action }]);
    reached = Math.max(reached, Math.abs(s.player.receiveReach ?? 0), Math.abs(s.player.receiveAhead ?? 0));
    all.push(...s.events);
    if (s.events.some((e) => ['ground', 'net', 'out'].includes(e.type))) break;
  }
  return { events: all, reached };
}
const grids = [];
for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) for (const z of [4.8, 5.0, 5.2]) for (let rt = 18; rt <= 40; rt++) grids.push({ kind: 'A14', x, z, rt });
for (const x0 of [-0.6, -0.3, 0.3, 0.6]) for (const m of [0.1, 0.2, 0.3]) for (let rt = 18; rt <= 40; rt++) grids.push({ kind: 'A16', x: x0, z: 5, rt, moveAt: (t) => (t >= 20 ? { x: -Math.sign(x0) * m, z: 0 } : { x: 0, z: 0 }) });
for (const dir of [-1, 1]) for (const x0 of [0.3, 0.6, 0.9, 1.2, 1.5]) for (const stop of [26, 30, 34, 38, 99]) for (let rt = 18; rt <= 40; rt++) grids.push({ kind: 'A16b', x: -dir * x0, z: 5, rt, moveAt: (t) => ({ x: t >= 10 && t < stop ? dir * 0.5 : 0, z: 0 }) });
const tally = {}, add = (k) => (tally[k] = (tally[k] ?? 0) + 1), ex = [];
let reachedA = 0, reachedB = 0;
const cases = [...chaseCases(LA).map((c) => ({ ...c, run: runChase })), ...grids.map((c) => ({ ...c, run: runFeedGrid }))];
for (const c of cases) {
  const ra = c.run(LA, c), rb = c.run(LB, c);
  reachedA = Math.max(reachedA, ra.reached); reachedB = Math.max(reachedB, rb.reached);
  const a = sig(ra.events), b = sig(rb.events);
  add(`${c.kind} n`);
  const js = JSON.stringify(a.judge) === JSON.stringify(b.judge), ps = JSON.stringify(a.pos) === JSON.stringify(b.pos), fs = JSON.stringify(a.fin) === JSON.stringify(b.fin), ls = JSON.stringify(a.landing) === JSON.stringify(b.landing);
  const touched = !!(a.judge || b.judge);
  const finKind = (f) => (f ? `${f.type}/${f.judged}/${f.miss ?? '-'}` : 'none');
  const example = () => `${c.kind} ${JSON.stringify({ ...c, f: c.f ? [c.f.vx, c.f.vy, c.f.vz] : undefined, moveAt: undefined, run: undefined })}: A ${JSON.stringify(a.judge)} ${JSON.stringify(a.fin)} | B ${JSON.stringify(b.judge)} ${JSON.stringify(b.fin)}`;
  if (!js) {
    add(`${c.kind} FIRST TOUCH DIFFERS`);
    add(`${c.kind}   ${a.judge?.kind ?? 'none'}${a.judge?.tier ? ':' + a.judge.tier : ''} -> ${b.judge?.kind ?? 'none'}${b.judge?.tier ? ':' + b.judge.tier : ''}`);
    if (ex.length < 8) ex.push(example());
  } else if (!touched && !fs) {
    add(`${c.kind} UNTOUCHED BALL, TERMINAL DIFFERS`);
    if (ex.length < 8) ex.push(example());
  } else if (touched && finKind(a.fin) !== finKind(b.fin)) {
    add(`${c.kind} same first touch, terminal type/miss after the touch differs`);
    add(`${c.kind}   ${finKind(a.fin)} -> ${finKind(b.fin)}`);
    if (ex.length < 8) ex.push(example());
  } else {
    if (!ps) add(`${c.kind} same first touch, contact position differs (allowed)`);
    if (touched && (!fs || !ls)) add(`${c.kind} same first touch, landing tick/spot after the touch differs (allowed)`);
  }
}
const differs = Object.entries(tally).filter(([k]) => k.includes('DIFFERS')).reduce((v, [, n]) => v + n, 0);
console.log(JSON.stringify({ A: { root: process.argv[2].split(/[\\/]/).pop(), ...LA.reach, maxReachSeen: r3(reachedA) }, B: { root: process.argv[3].split(/[\\/]/).pop(), ...LB.reach, maxReachSeen: r3(reachedB) }, differs, tally, ex }, null, 1));
