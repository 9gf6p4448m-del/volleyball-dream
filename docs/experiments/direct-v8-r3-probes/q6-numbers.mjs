import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { createDirectGame, stepDirectGame } = await import(pathToFileURL(root + '/src/sim/directGame.js'));
const { DIVE_WINDOW_CENTRE, RECEIVE_WINDOW_CENTRE } = await import(pathToFileURL(root + '/src/sim/directReceiveRules.js'));
const { passOutcome } = await import(pathToFileURL(root + '/src/sim/directReceiveAssist.js'));
const { RECEIVE_ASSIST: A, RECEIVE_RULES: R } = await import(pathToFileURL(root + '/src/sim/directConstants.js'));
const { crossingTick } = await import(pathToFileURL(root + '/tools/receive-rules-cases.mjs'));
const H = 1.75, PLATFORM = { x: 0, z: 5 - R.underForward * H }, DROP_Y = 2.5;
const cmd = (s, action = null) => ({ tick: s.tick, sequence: 0, move: { x: 0, z: 0 }, aim: { x: 0, z: -1 }, action });
const pressFor = (T, centre, offset = 0) => T - Math.round(centre - 1 + offset);
function flight(ball) { const s = createDirectGame(); s.player.x = 3.9; s.player.z = 8.5; Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true }); const rows = []; for (let t = 0; t < 240 && s.ball.active; t++) { stepDirectGame(s, [cmd(s)]); rows.push({ tick: t, y: s.ball.y, py: s.ball.py }); } return rows; }
function run(ball, rt, press, seed) { const s = createDirectGame({ seed }); Object.assign(s.ball, ball, { px: ball.x, py: ball.y, pz: ball.z, active: true }); let contact = null; for (let t = 0; t < 240; t++) { stepDirectGame(s, [cmd(s, t === rt ? press : null)]); const e = s.events.find((x) => x.type === 'contact'); if (e && !contact) contact = { ...e, tick: t, salt: s.stats.contacts - 1 }; if (s.events.some((x) => ['ground', 'net', 'out'].includes(x.type))) break; } return { contact, seed }; }
const BAND = [1.2, 1.4, 1.6, 1.8, 1.95].flatMap((d) => [0.4, 1.2, 2.0, 2.8].map((a) => ({ d, x: PLATFORM.x + d * Math.cos(a), z: PLATFORM.z + d * Math.sin(a) })));
const IN_POINTS = [0.1, 0.25, 0.4].flatMap((d) => [3.4, 4.0, 4.6, 5.2, 5.8].map((a) => ({ x: PLATFORM.x + d * Math.cos(a), z: PLATFORM.z + d * Math.sin(a) })));
const rows = flight({ x: BAND[0].x, y: DROP_Y, z: BAND[0].z, vx: 0, vy: 0, vz: 0 });
const ticks = { under: crossingTick(rows, A.platformCueHeight * H).tick, dive: crossingTick(rows, R.diveHeight).tick };
const ratios = [], diveErr = [], underErr = []; let seed = 0;
for (const off of [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) {
  for (const p of BAND) { const r = run({ x: p.x, y: DROP_Y, z: p.z, vx: 0, vy: 0, vz: 0 }, pressFor(ticks.dive, DIVE_WINDOW_CENTRE, off), 'dive', ++seed); const e = r.contact; if (!e?.tier || e.technique !== 'dive') continue; const base = passOutcome({ from: e.position, ballSpeed: e.ballSpeed, technique: 'underhand', tier: e.tier, seed: r.seed, tick: e.tick, salt: e.salt, bodySpeed: 0, errorMultiplier: 1, stance: 1 }); const dx = base.target.x - A.target.x; if (Math.abs(dx) > 0.05) ratios.push((e.target.x - A.target.x) / dx); if (e.tier === 'GOOD') diveErr.push(Math.hypot(e.target.x - A.target.x, e.target.z - A.target.z)); }
  for (const p of IN_POINTS) { const r = run({ x: p.x, y: DROP_Y, z: p.z, vx: 0, vy: 0, vz: 0 }, pressFor(ticks.under, RECEIVE_WINDOW_CENTRE, off), 'receive', ++seed); const e = r.contact; if (e?.tier === 'GOOD' && e.technique === 'underhand' && e.bodySpeed < A.stanceStill) underErr.push(Math.hypot(e.target.x - A.target.x, e.target.z - A.target.z)); }
}
const mean = (a) => a.reduce((v, x) => v + x, 0) / a.length;
console.log(JSON.stringify({ ratios: ratios.length, ratioMean: +mean(ratios).toFixed(4), ratioMaxDev: +Math.max(...ratios.map((v) => Math.abs(v - 1.05))).toFixed(4), diveGood: diveErr.length, diveGoodMean: +mean(diveErr).toFixed(3), underGood: underErr.length, underGoodMean: +mean(underErr).toFixed(3), empirical: +(mean(diveErr) / mean(underErr)).toFixed(3), diveMultiplier: R.diveErrorMultiplier }));
