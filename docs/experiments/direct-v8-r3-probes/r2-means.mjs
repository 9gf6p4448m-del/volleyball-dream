import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const { chase } = await import(pathToFileURL(root + '/tools/receive-assist-probe.mjs'));
const { RECEIVE_ASSIST: A } = await import(pathToFileURL(root + '/src/sim/directConstants.js'));
const c = chase(); const total = c.rows.length; const out = { total, graded: c.rows.filter((r) => r.tier).length, sprays: c.rows.filter((r) => r.spray).length };
for (const tier of ['PERFECT', 'GOOD', 'POOR']) { const r = c.rows.filter((x) => x.tier === tier); out[tier] = { n: r.length, share: +(r.length / total).toFixed(4), mean: +(r.reduce((v, x) => v + Math.hypot(x.x - A.target.x, x.z - A.target.z), 0) / r.length).toFixed(3) }; }
out.pressedRows = total; out.armGapOver = c.rows.filter((r) => r.gap > 0.05).length;
console.log(JSON.stringify(out));
