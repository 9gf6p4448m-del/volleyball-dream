// 實驗用快速評估：S1(a) S2(b) S3(e) S4(c) S11(f)，對一個 realPlayer 模組（可用常數覆寫的暫存副本）
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const WT = 'C:/Users/shung/worktrees/volleyball-skin';
const SCR = 'C:/Users/shung/AppData/Local/Temp/claude/C--Users-shung/ce506562-b18a-4ac0-8c2e-663a20246803/scratchpad/skin';
const V2 = await import(pathToFileURL(`${WT}/tools/real-skin-penetration-v2.mjs`).href);
const TD = await import(pathToFileURL(`${WT}/tools/real-skin-torso-drag.mjs`).href);
const lib = await import(pathToFileURL(`${WT}/tools/real-skin-lib.mjs`).href);
import { realpathSync } from 'node:fs';
const NM = realpathSync(`${WT}/node_modules/three`).split(String.fromCharCode(92)).join('/');
const THREE_URL = pathToFileURL(`${NM}/build/three.module.js`).href;
const GLTF_URL = pathToFileURL(`${NM}/examples/jsm/loaders/GLTFLoader.js`).href;

let seq = 0;
// overrides: [[find, repl], ...]（每個 find 必須恰好命中 1 次）
export async function makeMod(overrides = [], src = `${WT}/src/render/realPlayer.js`) {
  let text = await readFile(src, 'utf8');
  const reps = [
    ["from 'three';", `from '${THREE_URL}';`],
    ["from 'three/addons/loaders/GLTFLoader.js';", `from '${GLTF_URL}';`],
    ["from './geoCharacter.js';", `from '${pathToFileURL(`${WT}/src/render/geoCharacter.js`).href}';`],
    ...overrides,
  ];
  for (const [find, repl] of reps) {
    const n = text.split(find).length - 1;
    if (n !== 1) throw new Error(`override 命中 ${n} 次：${find}`);
    text = text.replace(find, () => repl);
  }
  await mkdir(`${SCR}/mods`, { recursive: true });
  const file = `${SCR}/mods/rp${process.pid}_${seq += 1}.mjs`;
  await writeFile(file, text);
  return import(pathToFileURL(file).href);
}

const baseCache = {};
async function baselines(faces) {
  if (baseCache[faces]) return baseCache[faces];
  const E = `${WT}/docs/experiments/real-skin-evidence`;
  const pen = JSON.parse(await readFile(`${E}/ruler-v2/R3/frozen-rerun/before-${faces}.json`, 'utf8'));
  const f = JSON.parse(await readFile(`${E}/ruler-v2/R3/R4/f-base-${faces}.json`, 'utf8'));
  let m = null;
  try { m = JSON.parse(await readFile(`${E}/before-${faces}.json`, 'utf8')); } catch { /* */ }
  return (baseCache[faces] = { pen, f, m });
}

export async function evaluate(rp, faces = '5k', { keys = null, quiet = false } = {}) {
  const setup = await V2.loadSetup(faces, { rpMod: rp });
  const B = await baselines(faces);
  const F = setup.frozen.fz[faces];
  const out = {};
  for (const key of lib.ALL_KEYS) {
    if (keys && !keys.includes(key.id)) continue;
    const { real, P1 } = V2.poseKey(setup, key);
    const nb = V2.penetrationV2(setup.R, setup.Sb, P1);
    const ne = V2.penetrationV2(setup.R, setup.Se, P1);
    const ga = real.p.mesh.geometry.attributes;
    const fd = TD.torsoDrag(F, setup.R.P, P1, real.p.mesh.skeleton, rp.BONES, ga.skinIndex.array, ga.skinWeight.array, setup.R.reps);
    const a = lib.metricStretch(setup.R, P1);
    const c = lib.metricSpineSkin(setup.R, P1);
    out[key.id] = { a: { over2: a.over2, p99: a.p99 }, b: { r: [nb.r.inside, nb.r.maxDepth], l: [nb.l.inside, nb.l.maxDepth] },
      e: { r: [ne.r.inside, ne.r.maxDepth], l: [ne.l.inside, ne.l.maxDepth] }, f: { over: fd.over, max: fd.max }, c: { jump: c.maxJump, total: c.total } };
  }
  // 判定
  const cm = (m) => Number((m * 100).toFixed(1));
  const fails = [];
  const lines = [];
  for (const [id, v] of Object.entries(out)) {
    const pb = B.pen.rows[id].b.new; const fb = B.f.rows[id];
    const bf = [];
    if (v.a.over2 > 30 || Number(v.a.p99.toFixed(1)) > 2.5) bf.push('S1');
    for (const s of ['r', 'l']) {
      if (v.b[s][0] > pb[s].inside || cm(v.b[s][1]) > cm(pb[s].maxDepth)) bf.push(`S2i${s}`);
      if (['K3a', 'K3b', 'K4a'].includes(id) && (v.b[s][0] > 10 || cm(v.b[s][1]) > 1.0)) bf.push(`S2ii${s}`);
      if (['K4b', 'K4c'].includes(id) && (v.b[s][0] > 30 || cm(v.b[s][1]) > 2.0)) bf.push(`S2iii${s}`);
      if (['K4a', 'K4b', 'K4c'].includes(id) && (v.e[s][0] > 10 || cm(v.e[s][1]) > 1.0)) bf.push(`S3${s}`);
    }
    if (v.f.over > fb.over + 30 || Math.round(v.f.max * 1000) > Math.round(fb.max * 1000) + 10) bf.push('S11');
    if (bf.length) fails.push(`${id}:${bf.join(',')}`);
    lines.push(`${id} a ${v.a.over2}/${v.a.p99.toFixed(2)} | b r ${v.b.r[0]}/${cm(v.b.r[1])} l ${v.b.l[0]}/${cm(v.b.l[1])} (base ${pb.r.inside}/${cm(pb.r.maxDepth)} ${pb.l.inside}/${cm(pb.l.maxDepth)}) | e r ${v.e.r[0]}/${cm(v.e.r[1])} l ${v.e.l[0]}/${cm(v.e.l[1])} | f ${v.f.over}/${cm(v.f.max)} (≤${fb.over + 30}/${cm(fb.max) + 1}) | c ${v.c.jump.toFixed(1)}/${v.c.total.toFixed(1)} ${bf.length ? '✗ ' + bf.join(',') : ''}`);
  }
  if (!quiet) console.log(lines.join('\n'));
  return { out, fails, lines };
}
