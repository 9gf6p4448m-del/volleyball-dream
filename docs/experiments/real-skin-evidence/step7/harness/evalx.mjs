// step7（驗收修訂 R12）實作者自評用快速評估治具——不是正式量尺（正式量尺由量尺方改讀一般 Mesh 後另跑）。
// 判定邏輯逐行照抄 step6/harness/evalh.mjs（S1 R7、S2 R9、S3、S11 R4、S13 R8/R10、S14 R10）；差別只有「讀哪裡」：
//  ・綁定位置／權重：p.bindGeometry（R12 起 mesh.geometry 只剩 position／normal／color／index）
//  ・當幀位置 P1：p.renderedPositions()＝畫面實際送進 GPU 的陣列（CPU 蒙皮＋碰撞修正後），先斷言它就是 mesh 的 position 陣列
//  ・skin 選項：比較用原型（DQS 等）自己算 P1（不走 src），其餘量法完全相同
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const WT = new URL('../../../../../', import.meta.url);
const tool = (f) => import(new URL(`tools/${f}`, WT).href);
export const V2 = await tool('real-skin-penetration-v2.mjs');
const TD = await tool('real-skin-torso-drag.mjs');
const AF = await tool('real-skin-arm-follow.mjs');
export const AW = await tool('real-skin-armpit-web.mjs');
export const lib = await tool('real-skin-lib.mjs');
export const WT_PATH = decodeURIComponent(WT.pathname).replace(/^\/([A-Za-z]:)/, '$1');

// 與 V2.loadSetup 相同，只把「畫面幾何」換成 R12 的讀法
export async function loadSetup(faces, rp) {
  V2.installNodeFetch();
  const glbUrl = new URL(`public/models/real/player_${faces}.glb`, WT);
  const loaded = await rp.loadRealPlayerAsset(glbUrl.href);
  const mods = { ...V2.MODS, rp };
  const probe = lib.makeReal(mods, loaded);
  const G = probe.p.bindGeometry;
  if (G !== loaded.geometry) throw new Error('bindGeometry 不是 asset.geometry');
  checkRendered(probe.p, G, '載入');
  for (const a of V2.GAME_ARGS) checkRendered(rp.createRealPlayer(loaded, a), G, `遊戲參數 身高 ${a.height}`);
  V2.weightCheck(G);
  const asset = { ...loaded, geometry: G };
  const R0 = lib.bindRegions(asset, rp.LANDMARKS);
  const frozen = await V2.loadFrozen();
  const { R, Sb, Se } = V2.applyFrozen(R0, frozen.fz[faces], await V2.glbIndex(glbUrl),
    { SI: G.attributes.skinIndex.array, SW: G.attributes.skinWeight.array, bones: rp.BONES });
  return { faces, glbUrl, asset, loaded, G, R, Sb, Se, frozen, mods };
}
// R12 讀法的前提：畫的就是量的（mesh 的 position 陣列＝renderedPositions、同一份 index、一般 Mesh、無子物件／hook／morph）
export function checkRendered(p, G, where) {
  const m = p.mesh; const g = m.geometry;
  if (m.isSkinnedMesh || !m.isMesh) throw new Error(`${where}：不是一般 Mesh`);
  if (g.attributes.position.array !== p.renderedPositions()) throw new Error(`${where}：renderedPositions 不是 mesh 的 position 陣列`);
  if (g.attributes.normal.array !== p.renderedNormals()) throw new Error(`${where}：renderedNormals 不是 mesh 的 normal 陣列`);
  if (g.index !== G.index) throw new Error(`${where}：index 與綁定幾何不同`);
  if (Object.keys(g.morphAttributes).length || m.morphTargetInfluences) throw new Error(`${where}：有 morph`);
  if (m.children.length || m.visible === false) throw new Error(`${where}：子物件或不可見`);
  if (m.onBeforeRender !== V2.MODS.THREE.Object3D.prototype.onBeforeRender) throw new Error(`${where}：onBeforeRender`);
}

const baseCache = {};
async function baselines(faces) {
  if (baseCache[faces]) return baseCache[faces];
  const E = new URL('docs/experiments/real-skin-evidence/', WT);
  const j = async (f) => JSON.parse(await readFile(new URL(f, E), 'utf8'));
  return (baseCache[faces] = {
    pen: await j(`ruler-v2/R3/frozen-rerun/before-${faces}.json`), f: await j(`ruler-v2/R3/R4/f-base-${faces}.json`),
    s1: (await j(`ruler-v2/R7/s1-base-${faces}.json`)).results.base.keys, s14: await j(`ruler-v2/R10/s14-base-${faces}.json`),
  });
}

// skin(p, setup) → { P, N? }：比較用原型；省略＝讀 p.renderedPositions()（正式實作）
export async function evaluate(rp, faces, { skin = null, dump = null, keys = null, setup = null } = {}) {
  setup = setup || await loadSetup(faces, rp);
  const B = await baselines(faces);
  const F = setup.frozen.fz[faces];
  const G = setup.G; const SI = G.attributes.skinIndex.array; const SW = G.attributes.skinWeight.array;
  const out = {};
  const af = AF.armFollow(setup, faces);
  for (const key of lib.ALL_KEYS) {
    if (keys && !keys.includes(key.id)) continue;
    const real = lib.makeReal(setup.mods, setup.loaded);
    checkRendered(real.p, G, `幀 ${key.id}`);
    lib.driveKey(setup.mods, [real], key);
    const r = skin ? skin(real.p, setup) : { P: Float32Array.from(real.p.renderedPositions()), N: Float32Array.from(real.p.renderedNormals()) };
    const P1 = r.P;
    const nb = V2.penetrationV2(setup.R, setup.Sb, P1);
    const ne = V2.penetrationV2(setup.R, setup.Se, P1);
    const fd = TD.torsoDrag(F, setup.R.P, P1, real.p.skeleton, rp.BONES, SI, SW, setup.R.reps);
    const a = lib.metricStretch(setup.R, P1);
    const web = AW.armpitWeb(setup, faces, real.p.skeleton, P1);
    out[key.id] = {
      a: { over2: a.over2, p99: a.p99 }, b: { r: [nb.r.inside, nb.r.maxDepth], l: [nb.l.inside, nb.l.maxDepth] },
      e: { r: [ne.r.inside, ne.r.maxDepth], l: [ne.l.inside, ne.l.maxDepth] }, f: { over: fd.over, max: fd.max },
      w: { r: [web.r.off, web.r.max, web.r.arg], l: [web.l.off, web.l.max, web.l.arg] },
    };
    if (dump) await dump(key, real, r, setup, web);
  }
  const cm = (m) => Number((m * 100).toFixed(1));
  const fails = []; const lines = [];
  for (const [id, v] of Object.entries(out)) {
    const pb = B.pen.rows[id].b.new; const fb = B.f.rows[id];
    const bf = [];
    { const p = Number(v.a.p99.toFixed(2)); const zb = B.s1[id].a; const zp = Number(zb.p99.toFixed(2));
      const ok = (v.a.over2 <= 30 && p <= 2.5) || (v.a.over2 <= zb.over2 && p <= zp && p <= 6.0); if (!ok) bf.push('S1'); }
    for (const s of ['r', 'l']) {
      if (id === 'K1a') { const lim = faces === '20k' ? [40, 4.0] : [5, 3.5]; if (v.b[s][0] > lim[0] || cm(v.b[s][1]) > lim[1]) bf.push(`S2i${s}`); }
      else if (v.b[s][0] > pb[s].inside || cm(v.b[s][1]) > cm(pb[s].maxDepth)) bf.push(`S2i${s}`);
      if (['K3a', 'K3b', 'K4a'].includes(id) && (v.b[s][0] > 10 || cm(v.b[s][1]) > 1.0)) bf.push(`S2ii${s}`);
      if (['K4b', 'K4c'].includes(id) && (v.b[s][0] > 30 || cm(v.b[s][1]) > 2.0)) bf.push(`S2iii${s}`);
      if (['K4b', 'K4c'].includes(id) && (v.e[s][0] > 10 || cm(v.e[s][1]) > 1.0)) bf.push(`S3${s}`);
      if (id === 'K4a') { const pe = B.pen.rows[id].e.new[s]; if (v.e[s][0] > pe.inside || cm(v.e[s][1]) > cm(pe.maxDepth)) bf.push(`S3${s}`); }
    }
    if (v.f.over > fb.over + 30 || Math.round(v.f.max * 1000) > Math.round(fb.max * 1000) + 10) bf.push('S11');
    for (const s of ['r', 'l']) { const z = B.s14.rows[id][s]; if (v.w[s][0] > z.off + 30 || Math.round(v.w[s][1] * 1000) > Math.round(z.max * 1000) + 10) bf.push(`S14${s}`); }
    if (bf.length) fails.push(`${id}:${bf.join(',')}`);
    const z14 = B.s14.rows[id];
    lines.push(`${id} S1 ${v.a.over2}/${v.a.p99.toFixed(2)} | S2 r ${v.b.r[0]}/${cm(v.b.r[1])} l ${v.b.l[0]}/${cm(v.b.l[1])} (現況 ${pb.r.inside}/${cm(pb.r.maxDepth)} ${pb.l.inside}/${cm(pb.l.maxDepth)}) | S3 r ${v.e.r[0]}/${cm(v.e.r[1])} l ${v.e.l[0]}/${cm(v.e.l[1])} | S11 ${v.f.over}/${cm(v.f.max)} (≤${fb.over + 30}/${(cm(fb.max) + 1).toFixed(1)}) | S14 r ${v.w.r[0]}/${cm(v.w.r[1])} l ${v.w.l[0]}/${cm(v.w.l[1])} (≤${z14.r.off + 30}/${(cm(z14.r.max) + 1).toFixed(1)} ${z14.l.off + 30}/${(cm(z14.l.max) + 1).toFixed(1)}) ${bf.length ? '✗ ' + bf.join(',') : ''}`);
  }
  lines.push(`S13 r ${af.r.mean.toFixed(3)} l ${af.l.mean.toFixed(3)} ${af.pass ? '' : '✗ S13'}`);
  if (!af.pass) fails.push('S13');
  return { out, fails, lines, setup };
}
export { pathToFileURL };
