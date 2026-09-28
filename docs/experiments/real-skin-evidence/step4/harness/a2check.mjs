// A2(a)(e) 近似：9 幀，腕／膝主權重群質心到關節距離的變化、手（幾何選取）到腕距離
import { pathToFileURL } from 'node:url';
import { makeMod } from './evalh.mjs';
const WT = 'C:/Users/shung/worktrees/volleyball-skin';
const BK = await import(pathToFileURL(`${WT}/tools/bake-real-skin-weights.mjs`).href);
const V2 = await import(pathToFileURL(`${WT}/tools/real-skin-penetration-v2.mjs`).href);
const lib = await import(pathToFileURL(`${WT}/tools/real-skin-lib.mjs`).href);
const faces = process.argv[2] || '5k';
const P = JSON.parse(process.argv[3] || '{}');
const params = { ...BK.PARAMS, ...P, AUX: { ...BK.PARAMS.AUX, ...(P.AUX || {}) } };
const rp = await makeMod([["const baked = await loadBakedWeights(url, pos);", "const baked = globalThis.__W ? globalThis.__W(pos, nor, geometry.index.array) : null;"]]);
if (process.argv[4] !== 'computed') globalThis.__W = (pos, nor, index) => BK.bakeWeights(rp, pos, nor, index, params);
const setup = await V2.loadSetup(faces, { rpMod: rp });
const G = setup.G; const SI = G.attributes.skinIndex.array; const SW = G.attributes.skinWeight.array; const Pb = G.attributes.position.array; const n = Pb.length / 3;
const groups = { rWrist: [], lWrist: [], rKnee: [] };
for (let i = 0; i < n; i++) { let b = -1, bw = -1; for (let k = 0; k < 4; k++) if (SW[i*4+k] > bw) { bw = SW[i*4+k]; b = SI[i*4+k]; } const nm = rp.BONES[b]; if (groups[nm]) groups[nm].push(i); }
let maxR = 0, maxL = 0; for (let i = 0; i < n; i++) { const x = Pb[i*3]; if (x < 0) maxR = Math.max(maxR, -x); else maxL = Math.max(maxL, x); }
const hands = { r: [], l: [] }; for (let i = 0; i < n; i++) { const x = Pb[i*3]; if (x < 0 && -x >= maxR - 0.1) hands.r.push(i); if (x > 0 && x >= maxL - 0.1) hands.l.push(i); }
const cen = (P1, ids) => { const c = [0,0,0]; for (const i of ids) for (let d = 0; d < 3; d++) c[d] += P1[i*3+d]; return c.map((v) => v / ids.length); };
const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const rows = {}; let hmax = 0;
for (const key of lib.ALL_KEYS) {
  const { real, P1 } = V2.poseKey(setup, key);
  const J = real.p.rig.joints;
  const r = {};
  for (const bn of Object.keys(groups)) { const j = J[bn]; j.updateWorldMatrix(true, false); const jp = [j.matrixWorld.elements[12], j.matrixWorld.elements[13], j.matrixWorld.elements[14]]; r[bn] = dist(cen(P1, groups[bn]), jp); }
  for (const s of ['r', 'l']) { const j = J[`${s}Wrist`]; const jp = [j.matrixWorld.elements[12], j.matrixWorld.elements[13], j.matrixWorld.elements[14]]; r[`hand${s}`] = dist(cen(P1, hands[s]), jp); hmax = Math.max(hmax, r[`hand${s}`]); }
  rows[key.id] = r;
}
const dev = {}; for (const bn of Object.keys(groups)) { const v = Object.values(rows).map((r) => r[bn]); dev[bn] = (Math.max(...v) - Math.min(...v)).toFixed(3); }
console.log('groups', Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), 'devRange', dev, 'handMax', hmax.toFixed(3));
