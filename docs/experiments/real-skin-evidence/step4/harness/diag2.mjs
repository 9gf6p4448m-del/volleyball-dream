import { pathToFileURL } from 'node:url';
import { makeMod } from './evalh.mjs';
const WT = 'C:/Users/shung/worktrees/volleyball-skin';
const BK = await import(pathToFileURL(`${WT}/tools/bake-real-skin-weights.mjs`).href);
const V2 = await import(pathToFileURL(`${WT}/tools/real-skin-penetration-v2.mjs`).href);
const lib = await import(pathToFileURL(`${WT}/tools/real-skin-lib.mjs`).href);
const faces = process.argv[2] || '5k';
const P = JSON.parse(process.argv[3] || '{}');
const want = (process.argv[4] || 'K4a').split(',');
const params = { ...BK.PARAMS, ...P, AUX: { ...BK.PARAMS.AUX, ...(P.AUX || {}) } };
const rp = await makeMod([["const baked = await loadBakedWeights(url, pos);", "const baked = globalThis.__W(pos, nor, geometry.index.array);"]]);
globalThis.__W = (pos, nor, index) => BK.bakeWeights(rp, pos, nor, index, params);
const setup = await V2.loadSetup(faces, { rpMod: rp });
const { R, Sb, Se } = setup; const G = setup.G; const SI = G.attributes.skinIndex.array; const SW = G.attributes.skinWeight.array;
const L = rp.LANDMARKS;
const wstr = (v) => { const a = []; for (let k = 0; k < 4; k++) if (SW[v*4+k] > 0.005) a.push(`${rp.BONES[SI[v*4+k]]}:${SW[v*4+k].toFixed(2)}`); return a.join(','); };
for (const key of lib.ALL_KEYS.filter((k) => want.includes(k.id))) {
  const { P1 } = V2.poseKey(setup, key);
  for (const [m, S] of [['b', Sb], ['e', Se]]) {
    const nv = V2.penetrationV2(R, S, P1);
    const byPart = {};
    for (const f of nv.flagged) { const k = `${f.side}${['U','F','H'][R.armPart[f.i]]}`; (byPart[k] ??= []).push(f); }
    for (const [k, fs] of Object.entries(byPart)) {
      fs.sort((a, b) => b.depth - a.depth);
      const f = fs[0]; const i = f.i;
      console.log(`${key.id} (${m}) ${k} n=${fs.length} max ${(f.depth*100).toFixed(1)} | deepest v${i} bind (${[0,1,2].map((d)=>R.P[i*3+d].toFixed(3)).join(',')}) w ${wstr(i)}`);
    }
  }
}
