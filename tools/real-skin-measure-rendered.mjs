// 寫實蒙皮 S1／S4（(a)(b)(c)(d) 與 2A 指標）的「畫面讀法」驅動（驗收修訂 R12：量尺改讀畫面實際畫出的一般 Mesh 當幀 position）。
// tools/real-skin-measure.mjs 與 tools/real-skin-lib.mjs 依驗收檔「量測基準（凍結）」不得修改（git diff 2da331f 須為空），
// 所以本檔只換「頂點位置從哪裡讀」：計算邏輯一律呼叫 lib 的 metricStretch／metricPenetration／metricSpineJoints／
// metricSpineSkin／metric2A／metricWeights，與 lib.measureKey 同順序、同參數。
//  ・SkinnedMesh（舊錨點，例 8720597）：P1＝lib.skinPositions（與 measure.mjs 相同，json 的 keys 應逐值相同）。
//  ・一般 Mesh（R12 起）：P1＝mesh.geometry.attributes.position.array（＝renderedPositions()；先過
//    real-skin-penetration-v2 的 assertRenderedMesh 斷言），不再自行蒙皮。
// 用法：node tools/real-skin-measure-rendered.mjs [--faces=20k|5k] [--json=<path>] [--txt=<path>]
// json 形狀與 real-skin-measure.mjs --variants=base 相同（results.base.keys[幀].a／c 等），供 tools/real-skin-r7-judge.mjs 讀。
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import * as ga from '../src/render/geoAnimator.js';
import * as gc from '../src/render/geoCharacter.js';
import * as rp from '../src/render/realPlayer.js';
import * as lib from './real-skin-lib.mjs';
import * as V2 from './real-skin-penetration-v2.mjs';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
  }));
  const faces = args.faces === '5k' ? '5k' : '20k';
  // 先走定稿量尺的 loadSetup：凍結集合／索引對應／權重合法／網格本體／遊戲參數等全部斷言（不改本檔的計算）
  const setup = await V2.loadSetup(faces);
  const mods = { THREE, rp, ga, gc };
  const asset = setup.loaded;
  const rendered = setup.rendered;
  const G = setup.G;
  const R = lib.bindRegions(asset, rp.LANDMARKS);
  const d = lib.metricWeights(asset, rp.BONES, rp.LANDMARKS, []);
  const geoms = gc.geometries();
  const keys = {};
  for (const key of lib.ALL_KEYS) {
    const real = lib.makeReal(mods, asset);
    const geo = lib.makeGeo(mods, null);
    const pk = lib.driveKey(mods, [real, geo], key);
    let P1;
    if (rendered) {
      V2.assertRenderedMesh(real.p, asset.geometry, `幀 ${key.id}`);
      P1 = real.p.mesh.geometry.attributes.position.array;
      for (const g of setup.game) V2.assertSameSkinning(real, g.p, THREE, `幀 ${key.id} ${g.args.playerId}`);
    } else P1 = lib.skinPositions(THREE, real.p);
    const N1 = lib.vertexNormals(P1, R.index);
    const a = lib.metricStretch(R, P1);
    const b = lib.metricPenetration(R, P1, N1);
    const c = { joints: lib.metricSpineJoints(THREE, real.rig), skin: lib.metricSpineSkin(R, P1) };
    const twoA = lib.metric2A(THREE, R, P1, real.p);
    const SW = G.attributes.skinWeight.array;
    const prob = new Set(b.flagged.arm);
    for (const t of a.flagged) for (let e = 0; e < 3; e += 1) prob.add(R.index[t * 3 + e]);
    let multi = 0;
    for (const i of prob) { let cnt = 0; for (let k = 0; k < 4; k += 1) if (SW[i * 4 + k] >= 0.05) cnt += 1; if (cnt >= 2) multi += 1; }
    const geoRef = { pen: lib.geoPenetration(THREE, geo.rig, geoms), yaw: lib.geoSpineYaw(THREE, geo.rig) };
    delete a.flagged; delete b.flagged;
    keys[key.id] = { key: key.id, seq: pk?.type ?? null, t: pk?.t ?? null, a, b, c, d: { problemVerts: prob.size, multiFrac: prob.size ? multi / prob.size : null }, twoA, geo: geoRef };
  }
  const results = {
    base: {
      label: `src 現行（${rendered ? '一般 Mesh：讀 mesh.geometry.attributes.position' : 'SkinnedMesh：lib.skinPositions'}）`,
      faces: asset.faces, verts: R.n,
      region: { shoulderTris: R.shoulderTris.length, armR: R.armVerts.r.length, armL: R.armVerts.l.length, torsoTris: R.torsoTris.length },
      sole: { verts: asset.sole.n, nonzero: Array.from(asset.sole.sw).filter((w) => w > 0).length },
      weights: d, keys, readMode: rendered ? 'rendered' : 'skinned',
    },
  };
  const f2 = (x) => (x == null ? '—' : Number(x).toFixed(2));
  const f0 = (x) => (x == null ? '—' : Math.round(x).toString());
  const out = [`# real-skin-measure-rendered（faces=${faces}；讀法 ${results.base.readMode}）`,
    `鞋底頂點 ${results.base.sole.verts}、非零影響 ${results.base.sole.nonzero}；面數 ${results.base.faces}、頂點 ${results.base.verts}；肩部三角形 ${results.base.region.shoulderTris}`,
    '| 幀 | 序列 | (a) σ1 最大/P99 | (a) >2× 數 | (c) 關節扭 骨盆/腰/胸° | (c) 皮 總扭° | (c) 皮 最大扭跳°/2cm @y |', '|---|---|---|---|---|---|---|'];
  for (const [id, k] of Object.entries(keys)) {
    const j = k.c.joints; const s = k.c.skin;
    out.push(`| ${id} | ${k.seq ?? '待命'} | ${f2(k.a.maxStretch)}/${f2(k.a.p99)} | ${k.a.over2} | ${f2(j.pelvis.twist)}/${f2(j.spine.twist)}/${f2(j.spineUpper.twist)} | ${f2(s.total)} | ${f2(s.maxJump)} @${f2(s.maxJumpY)} |`);
  }
  const text = `${out.join('\n')}\n`;
  process.stdout.write(text);
  if (args.txt && args.txt !== '1') await writeFile(args.txt, text);
  if (args.json && args.json !== '1') await writeFile(args.json, `${JSON.stringify({ faces, results }, null, 1)}\n`);
}
