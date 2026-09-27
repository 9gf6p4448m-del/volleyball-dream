// A14/A16/A16b under the ruled denominator (contact while the pressed action's
// window offset is inside the timing window), with the same grids as 3e90288.
// Usage: node denominator-probe.mjs <repo root>
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { createDirectGame, stepDirectGame } = await import(pathToFileURL(root + '/src/sim/directGame.js'));
const { resolveHitAction } = await import(pathToFileURL(root + '/src/sim/directReceiveRules.js'));
const { windowScale } = await import(pathToFileURL(root + '/src/sim/directReceiveAssist.js'));
const { RECEIVE_ASSIST: A } = await import(pathToFileURL(root + '/src/sim/directConstants.js'));
const cmd = (s, action = null, extra = {}) => ({ tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action, ...extra });
const timed = (hit) => !!hit && (hit.tier || hit.spray) && ['forearm', 'hand'].includes(hit.part) && hit.offset != null && Math.abs(hit.offset) <= A.goodTicks * windowScale(hit.ballSpeed);
const zoneOf = (r) => r.end === 'ground' && r.z >= 0.5 && r.z <= 3 && Math.abs(r.x) <= 3;
function outcome(x, z, rt) {
  const s = createDirectGame(); s.player.x = x; s.player.z = z;
  let hit = null, apex = -Infinity, action = null;
  for (let t = 0; t < 240; t++) {
    const a = t === 0 ? 'feed' : t === rt ? resolveHitAction(s) : null; if (t === rt) action = a;
    stepDirectGame(s, [cmd(s, a)]);
    for (const e of s.events) {
      if (e.type === 'contact' && !hit) hit = e;
      if (['ground', 'net', 'out'].includes(e.type)) return { hit, action, wholeActive: !!hit && hit.active && ['forearm', 'hand'].includes(hit.part), timed: timed(hit), end: e.type, x: s.ball.x, z: s.ball.z, apex };
    }
    if (hit) apex = Math.max(apex, s.ball.y);
  }
  return null;
}
const rows = [];
for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) for (const z of [4.8, 5.0, 5.2]) for (let rt = 18; rt <= 40; rt++) { const r = outcome(x, z, rt); if (r) rows.push(r); }
const summarize = (label, rs) => {
  const n = rs.length, zone = rs.filter(zoneOf).length, net = rs.filter((r) => r.end === 'net').length;
  const apex = rs.map((r) => r.apex).sort((a, b) => a - b), med = apex[apex.length >> 1];
  const tiers = {}; for (const r of rs) { const k = r.hit?.tier ?? (r.hit?.spray ? 'spray' : r.hit ? 'body' : 'none'); tiers[k] = (tiers[k] ?? 0) + 1; }
  const dives = rs.filter((r) => r.hit?.technique === 'dive').length;
  console.log(label, `n=${n} zone=${zone} (${(zone / n).toFixed(3)}) net=${net} apexMedian=${(med ?? NaN).toFixed(2)} dives=${dives}`, JSON.stringify(tiers));
};
summarize('A14 wholeActive', rows.filter((r) => r.wholeActive));
summarize('A14 timed', rows.filter((r) => r.timed));
summarize('A14 timed&tier', rows.filter((r) => r.timed && r.hit.tier));
console.log('A14 timed but no tier:', rows.filter((r) => r.timed && !r.hit.tier).length, 'tier but not timed:', rows.filter((r) => !r.timed && r.hit?.tier).length);

function movingRows(cases) {
  const out = [];
  for (const { x0, moveAt, rt } of cases) {
    const s = createDirectGame(); s.player.x = x0; s.player.z = 5.0;
    let hit = null, vx = 0;
    for (let t = 0; t < 240; t++) {
      stepDirectGame(s, [{ ...cmd(s, t === 0 ? 'feed' : t === rt ? resolveHitAction(s) : null), move: moveAt(t) }]);
      let end = null;
      for (const e of s.events) { if (e.type === 'contact' && !hit) { hit = e; vx = s.player.vx; } if (['ground', 'net', 'out'].includes(e.type)) end = e.type; }
      if (end) { if (Math.abs(vx) >= 0.05) out.push({ hit, wholeActive: !!hit && hit.active && ['forearm', 'hand'].includes(hit.part), timed: timed(hit), end, x: s.ball.x, z: s.ball.z, apex: 0 }); break; }
    }
  }
  return out;
}
const a16 = [];
for (const x0 of [-0.6, -0.3, 0.3, 0.6]) for (const m of [0.1, 0.2, 0.3]) for (let rt = 18; rt <= 40; rt++) a16.push({ x0, rt, moveAt: (t) => (t >= 20 ? { x: -Math.sign(x0) * m, z: 0 } : { x: 0, z: 0 }) });
const r16 = movingRows(a16);
summarize('A16 wholeActive', r16.filter((r) => r.wholeActive));
summarize('A16 timed', r16.filter((r) => r.timed));
const a16b = [];
for (const dir of [-1, 1]) for (const x0 of [0.3, 0.6, 0.9, 1.2, 1.5]) for (const stop of [26, 30, 34, 38, 99]) for (let rt = 18; rt <= 40; rt++) a16b.push({ x0: -dir * x0, rt, moveAt: (t) => ({ x: t >= 10 && t < stop ? dir * 0.5 : 0, z: 0 }) });
const r16b = movingRows(a16b);
summarize('A16b wholeActive', r16b.filter((r) => r.wholeActive));
summarize('A16b timed', r16b.filter((r) => r.timed));
summarize('A16b timed noDive', r16b.filter((r) => r.timed && r.hit.technique !== 'dive'));
console.log('A16b body deflections with pose-active arm:', r16b.filter((r) => r.hit && !(r.hit.tier || r.hit.spray) && r.hit.active && ['forearm', 'hand'].includes(r.hit.part)).length);
