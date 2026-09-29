// 寫實蒙皮修正 S14：腋下薄片（上臂皮脫離臂軸）。
// 驗收：docs/kickoffs/real-skin-acceptance.md 修訂紀錄 R10。量法與門檻的凍結定義：
//   docs/experiments/real-skin-evidence/ruler-v2/R10/S14-criteria-frozen.md（在跑任何受測版本之前提交）。
//
// 用法：node tools/real-skin-armpit-web.mjs [--faces=20k|5k] [--json=<path>] [--txt=<path>] [--baseline=<8720597 上本工具的 json>]
//
// 量法（純幾何，不讀任何權重做判定）：
//  ・頂點集 V：凍結手臂集合（tools/real-skin-frozen-sets.json）中部位＝上臂（armPart 0）的頂點，左右各一組。
//    凍結頂點若有被畫出的手臂複製點，取其代表點中的最差值（R5 NF3 的 armReps）。
//  ・臂軸：上臂骨段＝骨架中 r/lShoulder 骨原點 → r/lElbow 骨原點。
//    綁定時用 inverse(boneInverse) 的平移；當幀用 bone.matrixWorld 的平移。
//  ・對每個 v∈V：r0＝綁定位置到綁定臂軸線段的距離；r1＝當幀蒙皮位置（lib.skinPositions，畫面 mesh.geometry）到
//    當幀臂軸線段的距離，除以臂段長度比 s＝|當幀臂段|／|綁定臂段|（抵銷根節點縮放）。離軸量 δ＝r1−r0。
//    皮若剛性跟著上臂走，δ≈0；被留在胸側、拉成薄片的皮，δ 很大。
//  ・每幀每臂輸出：δ>2 cm 的頂點數、δ 最大值（cm）。
//  ・門檻（R10 S14，凍結）：20k、5k 的 9 幀，每幀每臂「δ>2 cm 頂點數 ≤ 現況＋30」且「δ 最大 ≤ 現況＋1.0 cm」
//    （點數比整數，位移四捨五入到 mm 後比）。現況＝8720597，用本工具量。
// 輸出不含時間戳：同輸入逐位元相同。
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import * as lib from './real-skin-lib.mjs';
import * as V2 from './real-skin-penetration-v2.mjs';

export const OFF = 0.02; // δ>2 cm
export const GATE = { count: 30, mm: 10 }; // 現況＋30 點、現況＋1.0 cm
export const BASELINE_REALPLAYER_SHA12 = V2.BASELINE_REALPLAYER_SHA12;

function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  let t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
}
const trans = (m) => [m.elements[12], m.elements[13], m.elements[14]];

// 回傳 { r: { off, max, n }, l: {...} }；P0＝綁定位置、P1＝當幀蒙皮位置
export function armpitWeb(setup, faces, skeleton, P1) {
  const { R } = setup; const F = setup.frozen.fz[faces]; const BONES = setup.mods.rp.BONES;
  const out = {};
  for (const [s, ids, parts] of [['r', F.arm.r, F.arm.rPart], ['l', F.arm.l, F.arm.lPart]]) {
    const bs = BONES.indexOf(`${s}Shoulder`); const be = BONES.indexOf(`${s}Elbow`);
    if (bs < 0 || be < 0) throw new Error(`骨架裡沒有 ${s}Shoulder／${s}Elbow`);
    const S0 = trans(new THREE.Matrix4().copy(skeleton.boneInverses[bs]).invert());
    const E0 = trans(new THREE.Matrix4().copy(skeleton.boneInverses[be]).invert());
    const S1 = trans(skeleton.bones[bs].matrixWorld); const E1 = trans(skeleton.bones[be].matrixWorld);
    const sc = Math.hypot(E1[0] - S1[0], E1[1] - S1[1], E1[2] - S1[2]) / Math.hypot(E0[0] - S0[0], E0[1] - S0[1], E0[2] - S0[2]);
    let off = 0; let max = -Infinity; let n = 0; let arg = -1;
    ids.forEach((i, k) => {
      if (parts[k] !== 0) return;
      n += 1;
      const r0 = segDist([R.P[i * 3], R.P[i * 3 + 1], R.P[i * 3 + 2]], S0, E0);
      let d = -Infinity;
      for (const v of R.armReps.get(i)) d = Math.max(d, segDist([P1[v * 3], P1[v * 3 + 1], P1[v * 3 + 2]], S1, E1) / sc - r0);
      if (d > OFF) off += 1;
      if (d > max) { max = d; arg = i; }
    });
    out[s] = { n, off, max, arg };
  }
  return out;
}

const mmOf = (m) => Math.round(m * 1000);
export function gateCheck(rows, base) {
  const frames = {};
  for (const [id, v] of Object.entries(rows)) {
    frames[id] = {};
    for (const s of ['r', 'l']) {
      const z = base.rows[id][s];
      const okN = v[s].off <= z.off + GATE.count; const okD = mmOf(v[s].max) <= mmOf(z.max) + GATE.mm;
      frames[id][s] = { ok: okN && okD, okN, okD, base: { off: z.off, max: z.max } };
    }
  }
  const pass = Object.values(frames).every((f) => f.r.ok && f.l.ok);
  return { pass, frames };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
  }));
  const faces = args.faces === '5k' ? '5k' : '20k';
  const setup = await V2.loadSetup(faces);
  const hashes = {};
  for (const [k, rel] of [['realPlayer.js', '../src/render/realPlayer.js'], ['geoAnimator.js', '../src/render/geoAnimator.js'],
    ['geoCharacter.js', '../src/render/geoCharacter.js'], [`player_${faces}.glb`, `../public/models/real/player_${faces}.glb`],
    [`player_${faces}.weights.glb`, `../public/models/real/player_${faces}.weights.glb`],
    ['real-skin-lib.mjs', './real-skin-lib.mjs'], ['real-skin-penetration-v2.mjs', './real-skin-penetration-v2.mjs'],
    ['real-skin-armpit-web.mjs', './real-skin-armpit-web.mjs']]) {
    try { hashes[k] = await V2.sha12(new URL(rel, import.meta.url)); } catch { hashes[k] = '（無此檔）'; }
  }
  hashes['real-skin-frozen-sets.json'] = setup.frozen.fileSha.slice(0, 12);
  const rows = {};
  for (const key of lib.ALL_KEYS) {
    const { real, pk, P1 } = V2.poseKey(setup, key);
    const r = armpitWeb(setup, faces, real.p.mesh.skeleton, P1);
    rows[key.id] = { seq: pk?.type ?? null };
    for (const s of ['r', 'l']) rows[key.id][s] = { n: r[s].n, off: r[s].off, max: Number(r[s].max.toFixed(6)), arg: r[s].arg };
  }
  const cm = (m) => (m * 100).toFixed(1);
  const out = [];
  out.push(`# real-skin-armpit-web S14 腋下薄片（上臂皮脫離臂軸）（faces=${faces}）`);
  out.push('量法：凍結上臂頂點（手臂代表點取最差）離當幀上臂骨軸的距離（÷臂段長度比）減去綁定時離軸距離＝δ；列 δ>2 cm 頂點數／δ 最大');
  out.push(`輸入 sha256 前 12 碼：${Object.entries(hashes).map(([k, v]) => `${k} ${v}`).join('、')}`);
  out.push(`權重來源：${setup.loaded.weightsSource ?? 'computed（此版 src 無 weightsSource 欄位）'}；上臂頂點 右 ${rows.K1a.r.n}／左 ${rows.K1a.l.n}`);
  out.push('| 幀 | 序列 | 右 δ>2cm 數 | 右 δ 最大 cm | 左 δ>2cm 數 | 左 δ 最大 cm |');
  out.push('|---|---|---|---|---|---|');
  for (const [id, v] of Object.entries(rows)) out.push(`| ${id} | ${v.seq ?? '待命'} | ${v.r.off} | ${cm(v.r.max)} | ${v.l.off} | ${cm(v.l.max)} |`);
  let gate = null;
  if (args.baseline && args.baseline !== '1') {
    const base = JSON.parse(await readFile(args.baseline, 'utf8'));
    if (base.faces !== faces) throw new Error(`--baseline 面數 ${base.faces} ≠ ${faces}`);
    if (base.hashes?.['realPlayer.js'] !== BASELINE_REALPLAYER_SHA12) throw new Error(`--baseline 的 realPlayer.js 雜湊 ${base.hashes?.['realPlayer.js']} ≠ 8720597 的 ${BASELINE_REALPLAYER_SHA12}（現況必須在 8720597 上量）`);
    for (const k of new Set([...Object.keys(base.hashes ?? {}), ...Object.keys(hashes)])) {
      if (k === 'realPlayer.js' || k === `player_${faces}.weights.glb`) continue; // 受測物（src 與其烘焙權重）
      if (base.hashes?.[k] !== hashes[k]) throw new Error(`--baseline 的輸入雜湊 ${k} ${base.hashes?.[k]} ≠ 本次 ${hashes[k]}，不能比較`);
    }
    gate = gateCheck(rows, base);
    out.push('', `## S14 門檻（對照 8720597 現況：每幀每臂 δ>2 cm 數 ≤ 現況＋${GATE.count}、δ 最大 ≤ 現況＋${GATE.mm / 10} cm，位移比 mm）`);
    for (const [id, g] of Object.entries(gate.frames)) {
      const v = rows[id];
      const f = (s) => `${s === 'r' ? '右' : '左'} ${v[s].off}/${cm(v[s].max)}（上限 ${g[s].base.off + GATE.count}/${((mmOf(g[s].base.max) + GATE.mm) / 10).toFixed(1)}）${g[s].ok ? '' : ' ✗'}`;
      out.push(`- ${id}：${g.r.ok && g.l.ok ? '過' : '不過'}｜${f('r')}｜${f('l')}`);
    }
    out.push(`- 判定：${gate.pass ? '綠（9 幀全過）' : `紅（不過 ${Object.values(gate.frames).filter((g) => !(g.r.ok && g.l.ok)).length} 幀）`}`);
  }
  const text = `${out.join('\n')}\n`;
  process.stdout.write(text);
  if (args.txt && args.txt !== '1') await writeFile(args.txt, text);
  if (args.json && args.json !== '1') await writeFile(args.json, `${JSON.stringify({ faces, method: 'S14 armpit-web R10', hashes, rows, gate }, null, 1)}\n`);
}
