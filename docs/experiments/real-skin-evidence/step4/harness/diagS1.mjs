import { pathToFileURL } from 'node:url';
import { makeMod } from './evalh.mjs';
const WT = 'C:/Users/shung/worktrees/volleyball-skin';
const BK = await import(pathToFileURL(`${WT}/tools/bake-real-skin-weights.mjs`).href);
const V2 = await import(pathToFileURL(`${WT}/tools/real-skin-penetration-v2.mjs`).href);
const lib = await import(pathToFileURL(`${WT}/tools/real-skin-lib.mjs`).href);
const faces = process.argv[2] || '5k';
const P = JSON.parse(process.argv[3] || '{}');
const want = (process.argv[4] || 'K1a,K4c').split(',');
const params = { ...BK.PARAMS, ...P, AUX: { ...BK.PARAMS.AUX, ...(P.AUX || {}) } };
const rp = await makeMod([["const baked = await loadBakedWeights(url, pos);", "const baked = globalThis.__W(pos, nor, geometry.index.array);"]]);
globalThis.__W = (pos, nor, index) => BK.bakeWeights(rp, pos, nor, index, params);
const setup = await V2.loadSetup(faces, { rpMod: rp });
const { R } = setup; const G = setup.G; const SI = G.attributes.skinIndex.array; const SW = G.attributes.skinWeight.array;
const prim = setup.loaded.primary;
const wstr = (v) => { const a = []; for (let k = 0; k < 4; k++) if (SW[v*4+k] > 0.005) a.push(`${rp.BONES[SI[v*4+k]]}:${SW[v*4+k].toFixed(2)}`); return a.join(','); };
for (const key of lib.ALL_KEYS.filter((k) => want.includes(k.id))) {
  const { P1 } = V2.poseKey(setup, key);
  const m = lib.metricStretch(R, P1);
  const groups = {};
  for (const t of m.flagged) {
    const vs = [R.index[t*3], R.index[t*3+1], R.index[t*3+2]];
    const cy = vs.reduce((s, v) => s + R.P[v*3+1], 0) / 3; const cx = vs.reduce((s, v) => s + R.P[v*3], 0) / 3; const cz = vs.reduce((s, v) => s + R.P[v*3+2], 0) / 3;
    const bones = vs.map((v) => rp.BONES[prim[v]]).sort().join('/');
    const k = `${bones} y${cy.toFixed(2)[0]}${(Math.round(cy*20)/20).toFixed(2)} z${(Math.round(cz*20)/20).toFixed(2)} x${(Math.round(cx*20)/20).toFixed(2)}`;
    (groups[k] ??= []).push(t);
  }
  console.log(`== ${key.id} over2 ${m.over2} p99 ${m.p99.toFixed(2)} max ${m.maxStretch.toFixed(1)}`);
  for (const [k, ts] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
    const v = R.index[ts[0]*3];
    console.log(`  ${ts.length} ${k} | e.g. v${v}: ${wstr(v)} / v${R.index[ts[0]*3+1]}: ${wstr(R.index[ts[0]*3+1])} / v${R.index[ts[0]*3+2]}: ${wstr(R.index[ts[0]*3+2])}`);
  }
}
