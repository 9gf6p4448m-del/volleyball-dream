// 產生被穿入表面凍結集合（驗收檔 R3；定義見 docs/experiments/real-skin-evidence/ruler-v2/R3-criteria-frozen.md）。
// 只在 src 未改動的 8720597（拋棄式工作樹）執行一次：node tools/real-skin-freeze-sets.mjs --out=<路徑>
// 內容（20k／5k 各一份）：S_b／S_e 三角形索引、S_e 主骨頂點數、手臂頂點（左右＋部位）、S_b 頂點的主骨與綁定法線（供量法 (f)）、
// 綁定位置雜湊與三角形數（相容性）、每個集合的 sha256（完整性）。規則＝tools/real-skin-penetration-v2.mjs 的 live 模式。
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as lib from './real-skin-lib.mjs';
import * as V2 from './real-skin-penetration-v2.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
if (!args.out || args.out === '1') throw new Error('需要 --out=<路徑>');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const head = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--', 'src');
if (dirty) throw new Error(`src 有未提交改動，不能產生凍結集合：\n${dirty}`);

const TORSO = ['pelvis', 'spine', 'spineUpper'];
const out = {
  meta: {
    source: head,
    rules: {
      Sb: 'lib.bindRegions(asset, LANDMARKS).torsoTris（|x|≤0.21、y 0.75–1.55、三頂點都不是手臂頂點）',
      Se: '三頂點主骨（skinWeight 最大者、嚴格 > 取第一個）皆 ∈ {pelvis, rHip, lHip}',
      arm: 'lib.bindRegions 的 armVerts／armPart（距臂軸 ≤9 cm，上臂 t≥0.3）',
      SbVerts: 'S_b 三角形用到的頂點（遞增）；mainBone＝該頂點的主骨名（skinWeight 最大者、嚴格 > 取第一個）；normal＝lib.vertexNormals（綁定幾何，Float32 原值，每頂點 3 個）',
      sha: '完整性：Sb／Se／armR／armL／SbVerts＝排序後 Int32 ID 的 sha256（前 12 碼＝量尺表頭「集合指紋」）；armRPart／armLPart／SbMainBone／SbNormal／SeVerts＝該欄 JSON 字串的 sha256',
      compat: 'tris＝三角形數；verts＝綁定頂點數（8720597 上等於 glb 原頂點數、無接縫拆分複製點）；bindPosSha＝前 verts 個綁定位置 Float32 位元組的 sha256 前 16 碼；indexSha＝索引（＝glb 原索引）Uint32 位元組的 sha256，量尺據此逐角核對當前索引（複製點須對回來源）並檢查孤兒',
    },
    torsoBones: TORSO,
  },
};
// glb 原頂點數（POSITION accessor count）：確認 8720597 上沒有接縫拆分的複製點，凍結的頂點索引都指向白模原頂點
async function glbVertCount(url) {
  const buf = await readFile(fileURLToPath(url));
  const j = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  if (j.meshes.length !== 1 || j.meshes[0].primitives.length !== 1) throw new Error('glb 不是單一 mesh／primitive');
  return j.accessors[j.meshes[0].primitives[0].attributes.POSITION].count;
}
for (const faces of ['20k', '5k']) {
  const setup = await V2.loadSetup(faces, { live: true });
  const { asset, R, Sb, Se } = setup;
  const SI = asset.geometry.attributes.skinIndex.array; const SW = asset.geometry.attributes.skinWeight.array;
  const BONES = setup.mods.rp.BONES;
  const mainBone = (i) => { let best = -1; let bw = -1; for (let k = 0; k < 4; k += 1) if (SW[i * 4 + k] > bw) { bw = SW[i * 4 + k]; best = SI[i * 4 + k]; } return BONES[best]; };
  const sbIds = [...new Set(Sb.tris.flatMap((t) => [R.index[t * 3], R.index[t * 3 + 1], R.index[t * 3 + 2]]))].sort((a, b) => a - b);
  const N0 = lib.vertexNormals(R.P, R.index);
  const n0 = await glbVertCount(setup.glbUrl);
  if (R.n !== n0) throw new Error(`${faces}：綁定頂點 ${R.n} ≠ glb 原頂點 ${n0}（有接縫拆分複製點，凍結索引會依賴權重）`);
  const gi = await V2.glbIndex(setup.glbUrl);
  if (gi.index.length !== R.index.length || gi.index.some((v, k) => v !== R.index[k])) throw new Error(`${faces}：當前索引與 glb 原索引不同（凍結時必須逐項相同）`);
  const mb = sbIds.map((i) => mainBone(i));
  const normal = sbIds.flatMap((i) => [0, 1, 2].map((d) => N0[i * 3 + d]));
  const sortedTris = (a) => [...a].sort((x, y) => x - y);
  const F = {
    verts: R.n, tris: R.index.length / 3, bindPosSha: V2.bindPosSha(R.P, R.n), indexSha: V2.u32Sha(R.index), bridgeTris: asset.bridgeTris,
    Sb: { tris: sortedTris(Sb.tris) },
    Se: { tris: sortedTris(Se.tris), verts: Se.verts },
    arm: { r: [...R.armVerts.r], rPart: R.armVerts.r.map((i) => R.armPart[i]), l: [...R.armVerts.l], lPart: R.armVerts.l.map((i) => R.armPart[i]) },
    SbVerts: { ids: sbIds, mainBone: mb, normal },
  };
  // 手臂頂點清單本來就是遞增（bindRegions 依索引掃描），排序只為保險；部位跟著同一順序
  if (F.arm.r.some((v, k) => k && v < F.arm.r[k - 1]) || F.arm.l.some((v, k) => k && v < F.arm.l[k - 1])) throw new Error('手臂頂點不是遞增');
  if (F.Sb.tris.some((t, k) => t !== Sb.tris[k]) || F.Se.tris.some((t, k) => t !== Se.tris[k])) throw new Error('三角形清單不是遞增（凍結後順序會變，量尺輸出可能不同）');
  F.sha = V2.frozenShas(F);
  const counts = {};
  for (const b of mb) counts[b] = (counts[b] || 0) + 1;
  F.SbVerts.counts = Object.fromEntries(Object.entries(counts).sort((a, b) => BONES.indexOf(a[0]) - BONES.indexOf(b[0])));
  out[faces] = F;
  const nonTorso = mb.filter((b) => !TORSO.includes(b)).length;
  process.stderr.write(`  ${faces}：S_b ${F.Sb.tris.length} 三角形／${sbIds.length} 頂點（主骨 ${JSON.stringify(F.SbVerts.counts)}；非軀幹 ${nonTorso}）、S_e ${F.Se.tris.length}（主骨頂點 ${F.Se.verts}）、手臂 ${F.arm.r.length}／${F.arm.l.length}\n`);
}
const text = `${JSON.stringify(out)}\n`;
await writeFile(args.out, text);
process.stderr.write(`  整檔 sha256：${createHash('sha256').update(text).digest('hex')}\n`);
