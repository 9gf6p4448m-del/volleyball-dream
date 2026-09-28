// 寫實蒙皮修正 S11：量法 (f)「軀幹面被手臂拖動」。
// 驗收：docs/kickoffs/real-skin-acceptance.md 修訂紀錄 R3、R4（剛性參考改定義）；操作化定義：docs/experiments/real-skin-evidence/ruler-v2/R3-criteria-frozen.md
//
// 用法：node tools/real-skin-torso-drag.mjs [--faces=20k|5k] [--variant=base|heat|heatUpper|heatTorsoOnly|heatNoArm|heatNoLeg] [--json=<path>] [--txt=<path>] [--baseline=<(f) json>]
//   base      ＝src 現行 realPlayer.js
//   heat      ＝純熱擴散候選：同 tools/real-skin-measure.mjs 的 heat 變體載入法（OVERRIDE_PATCH＋tools/real-skin-heat.mjs），全身熱擴散、無掛勾
//   heatUpper ＝同上但小腿中段以下（綁定 y≤0.45）保留現行權重（診斷報告推薦的實作權重，只供參考）
//   heatTorsoOnly／heatNoArm／heatNoLeg＝heat 權重在 S_b 框內（綁定 |x|≤0.21、0.75≤y≤1.55，同 lib.REGION）把骨名符合
//     ZERO_RE 的權重歸零、其餘重新正規化（R4 鑑別③「F1 反例」與腿／手臂單獨貢獻參考；歸零法照 R3 對抗審查 zz-legonly.mjs）
//   --baseline：拿 8720597 上量的 (f) json 當現況值，套 R3 門檻（每幀 >2 cm 點數 ≤ 現況＋30、最大往內位移 ≤ 現況＋1.0 cm；位移比 0.1 cm）
//
// 量法（R4）：凍結集合（tools/real-skin-frozen-sets.json）的 S_b 頂點中，8720597 主骨屬 pelvis／spine／spineUpper 者（計入規則照 R3）；
//   剛性參考 r＝受測權重只保留 pelvis／spine／spineUpper、重新正規化後的蒙皮位置（當幀蒙皮矩陣 bone.matrixWorld × boneInverse，
//   同 lib.skinPositions）；剛性參考法線 n＝同一組軀幹限定權重混合的骨矩陣 3×3 × 凍結綁定法線，正規化。
//   受測權重在三骨上總和為 0 的頂點退回 R3 原定義（8720597 主骨剛體的矩陣）。
//   蒙皮後 s＝lib.skinPositions（完整受測權重）；往內位移 d＝(s−r)·(−n)。
// 不改 tools/real-skin-lib.mjs、tools/real-skin-measure.mjs；變體只把 src/render/realPlayer.js 精確替換後寫到系統暫存再 import。
// 輸出不含時間戳：同輸入逐位元相同。
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import * as lib from './real-skin-lib.mjs';
import * as V2 from './real-skin-penetration-v2.mjs';

export const TORSO = ['pelvis', 'spine', 'spineUpper'];
export const DRAG_OVER = 0.02; // R3：往內 >2 cm
export const GATE = { count: 30, mm: 10 }; // R3：現況＋30 點、現況＋1.0 cm
// 現況＝8720597：--baseline 必須是 base 變體、realPlayer.js 雜湊＝8720597 的值（去 CR 後 sha256 前 12 碼；R3 對抗審查 F4）
export const BASELINE_REALPLAYER_SHA12 = 'b1489d7878dc';

// (f) 核心：F＝凍結集合的一個面數版本；P0＝綁定位置；P1＝蒙皮後位置；skeleton＝當幀骨架；boneNames＝模組的 BONES；
// SI／SW＝受測（當前）權重的 skinIndex／skinWeight（與 P1 同一份）
// reps＝applyFrozen 的代表點表（凍結頂點 → 被畫出的原頂點＋複製點）；每個凍結頂點取所有代表中最大的 d（第 2 輪 N1）
export function torsoDrag(F, P0, P1, skeleton, boneNames, SI, SW, reps = null) {
  const { ids, mainBone, normal } = F.SbVerts;
  const TI = TORSO.map((b) => {
    const bi = boneNames.indexOf(b);
    if (bi < 0) throw new Error(`骨架裡沒有 ${b}`);
    return bi;
  });
  const M = TI.map((bi) => new THREE.Matrix4().multiplyMatrices(skeleton.bones[bi].matrixWorld, skeleton.boneInverses[bi]).elements);
  let used = 0; let excluded = 0; let fallback = 0; let over = 0; let max = -Infinity; let arg = -1;
  const e = new Float64Array(16);
  for (let k = 0; k < ids.length; k += 1) {
    const b = TORSO.indexOf(mainBone[k]); // 8720597 的主骨（凍結）；非軀幹骨不計
    if (b < 0) { excluded += 1; continue; }
    used += 1;
    let dk = -Infinity; let fb = false;
    for (const i of (reps ? reps.get(ids[k]) : [ids[k]])) {
    // R4：受測權重只保留三軀幹骨、重新正規化後的混合矩陣；三骨總和 0 → 退回 R3（8720597 主骨剛體）
    const wt = [0, 0, 0];
    for (let q = 0; q < 4; q += 1) { const t = TI.indexOf(SI[i * 4 + q]); if (t >= 0) wt[t] += SW[i * 4 + q]; }
    const ws = wt[0] + wt[1] + wt[2];
    if (ws > 0) {
      e.fill(0);
      for (let t = 0; t < 3; t += 1) { if (!wt[t]) continue; const m = M[t]; const w = wt[t] / ws; for (let c = 0; c < 16; c += 1) e[c] += w * m[c]; }
    } else { fb = true; e.set(M[b]); }
    const x = P0[i * 3]; const y = P0[i * 3 + 1]; const z = P0[i * 3 + 2];
    const r = [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; // 剛性參考位置
    const a = normal[k * 3]; const c = normal[k * 3 + 1]; const f = normal[k * 3 + 2];
    let nx = e[0] * a + e[4] * c + e[8] * f; let ny = e[1] * a + e[5] * c + e[9] * f; let nz = e[2] * a + e[6] * c + e[10] * f;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const d = -((P1[i * 3] - r[0]) * nx + (P1[i * 3 + 1] - r[1]) * ny + (P1[i * 3 + 2] - r[2]) * nz);
    if (d > dk) dk = d;
    }
    if (fb) fallback += 1;
    if (dk > DRAG_OVER) over += 1;
    if (dk > max) { max = dk; arg = k; }
  }
  return { used, excluded, fallback, over, max, arg: arg < 0 ? null : { id: ids[arg], bone: mainBone[arg], bindY: Number(P0[ids[arg] * 3 + 1].toFixed(3)) } };
}

// 熱擴散變體（同 tools/real-skin-measure.mjs 的 patchedRealPlayer＋OVERRIDE_PATCH＋useHeat；每個替換目標必須恰好命中 1 處）
// zeroRe：S_b 框內（綁定 |x|≤0.21、0.75≤y≤1.55）骨名符合者權重歸零、其餘重新正規化（總和 0 則維持原樣，同 zz-legonly.mjs）
export const ZERO_RE = {
  heatTorsoOnly: 'Shoulder|Elbow|Wrist|Hip|Knee|Ankle|neck', // R4 鑑別③：F1 反例（框內只剩軀幹骨）
  heatNoArm: 'Shoulder|Elbow|Wrist', // 參考：只歸零手臂＝腿權重的單獨貢獻
  heatNoLeg: 'Hip|Knee|Ankle', // 參考：只歸零腿＝手臂權重的單獨貢獻
};
async function heatModule(keepBelowY, zeroRe = null) {
  let text = await readFile(new URL('../src/render/realPlayer.js', import.meta.url), 'utf8');
  const reps = [
    ['const w = computeSkinWeights(pos, nor);', 'const w = (globalThis.__realSkinOverride ?? computeSkinWeights)(pos, nor, geometry.index.array);'],
    ["from 'three';", `from '${import.meta.resolve('three')}';`],
    ["from 'three/addons/loaders/GLTFLoader.js';", `from '${import.meta.resolve('three/addons/loaders/GLTFLoader.js')}';`],
    ["from './geoCharacter.js';", `from '${new URL('../src/render/geoCharacter.js', import.meta.url).href}';`],
  ];
  for (const [find, repl] of reps) {
    const n = text.split(find).length - 1;
    if (n !== 1) throw new Error(`熱擴散變體：替換目標命中 ${n} 處（須恰 1 處）：${find}`);
    text = text.replace(find, () => repl);
  }
  const dir = await mkdtemp(join(tmpdir(), 'real-skin-drag-'));
  const file = join(dir, 'realPlayer.heat.mjs');
  await writeFile(file, text);
  const mod = await import(pathToFileURL(file).href);
  const { heatWeightsFactory } = await import('./real-skin-heat.mjs');
  const f = heatWeightsFactory(mod);
  globalThis.__realSkinOverride = (pos, nor, index) => {
    const r = f(pos, nor, index);
    if (zeroRe) {
      const re = new RegExp(zeroRe);
      const Z = new Set(mod.BONES.map((b, bi) => (re.test(b) ? bi : -1)).filter((bi) => bi >= 0));
      for (let i = 0; i < pos.length / 3; i += 1) {
        const x = pos[i * 3]; const y = pos[i * 3 + 1];
        if (Math.abs(x) > lib.REGION.torsoX || y < lib.REGION.torsoY0 || y > lib.REGION.torsoY1) continue;
        let sw = 0;
        for (let k = 0; k < 4; k += 1) { if (Z.has(r.skinIndex[i * 4 + k])) r.skinWeight[i * 4 + k] = 0; sw += r.skinWeight[i * 4 + k]; }
        if (sw > 0) for (let k = 0; k < 4; k += 1) r.skinWeight[i * 4 + k] /= sw;
      }
    }
    if (keepBelowY != null) {
      const b = mod.computeSkinWeights(pos, nor);
      for (let i = 0; i < pos.length / 3; i += 1) {
        if (pos[i * 3 + 1] > keepBelowY) continue;
        for (let k = 0; k < 4; k += 1) { r.skinIndex[i * 4 + k] = b.skinIndex[i * 4 + k]; r.skinWeight[i * 4 + k] = b.skinWeight[i * 4 + k]; }
        r.primary[i] = b.primary[i];
      }
    }
    return r;
  };
  return { mod, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const mmOf = (m) => Math.round(m * 1000);
export function gateCheck(rows, base) {
  const res = {};
  for (const [id, v] of Object.entries(rows)) {
    const z = base.rows[id];
    const okN = v.over <= z.over + GATE.count; const okD = mmOf(v.max) <= mmOf(z.max) + GATE.mm;
    res[id] = { ok: okN && okD, okN, okD, base: { over: z.over, max: z.max } };
  }
  return { pass: Object.values(res).every((x) => x.ok), frames: res };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
  }));
  const faces = args.faces === '5k' ? '5k' : '20k';
  const variant = args.variant && args.variant !== '1' ? args.variant : 'base';
  if (!['base', 'heat', 'heatUpper', ...Object.keys(ZERO_RE)].includes(variant)) throw new Error(`未知變體 ${variant}`);
  let heat = null;
  if (variant !== 'base') heat = await heatModule(variant === 'heatUpper' ? 0.45 : null, ZERO_RE[variant] ?? null);
  const setup = await V2.loadSetup(faces, heat ? { rpMod: heat.mod } : {});
  delete globalThis.__realSkinOverride;
  if (heat) await heat.cleanup();
  const F = setup.frozen.fz[faces];
  const hashes = {};
  for (const [k, rel] of [['realPlayer.js', '../src/render/realPlayer.js'], ['geoAnimator.js', '../src/render/geoAnimator.js'],
    ['geoCharacter.js', '../src/render/geoCharacter.js'], [`player_${faces}.glb`, `../public/models/real/player_${faces}.glb`], ['real-skin-lib.mjs', './real-skin-lib.mjs'],
    ['real-skin-penetration-v2.mjs', './real-skin-penetration-v2.mjs'], ['real-skin-torso-drag.mjs', './real-skin-torso-drag.mjs'],
    ...(heat ? [['real-skin-heat.mjs', './real-skin-heat.mjs']] : [])]) {
    hashes[k] = await V2.sha12(new URL(rel, import.meta.url));
  }
  hashes['real-skin-frozen-sets.json'] = setup.frozen.fileSha.slice(0, 12);
  const rows = {};
  let used = 0; let excluded = 0; let fallback = 0;
  for (const key of lib.ALL_KEYS) {
    const { real, pk, P1 } = V2.poseKey(setup, key);
    const ga = real.p.mesh.geometry.attributes;
    const r = torsoDrag(F, setup.R.P, P1, real.p.mesh.skeleton, setup.mods.rp.BONES, ga.skinIndex.array, ga.skinWeight.array, setup.R.reps);
    used = r.used; excluded = r.excluded; fallback = r.fallback;
    rows[key.id] = { seq: pk?.type ?? null, over: r.over, max: Number(r.max.toFixed(6)), arg: r.arg };
  }
  const cm = (m) => (m * 100).toFixed(1);
  const out = [];
  out.push(`# real-skin-torso-drag (f) 軀幹面被手臂拖動（faces=${faces}，variant=${variant}）`);
  out.push('量法（R4）：凍結 S_b 頂點中 8720597 主骨屬 pelvis／spine／spineUpper 者；剛性參考＝受測權重只留三軀幹骨、重新正規化的蒙皮（三骨權重和 0 者退回 8720597 主骨剛體）；往內位移＝(蒙皮後−剛性參考)·(−剛性參考法線)');
  out.push(`輸入 sha256 前 12 碼：${Object.entries(hashes).map(([k, v]) => `${k} ${v}`).join('、')}`);
  const cnt = Object.entries(F.SbVerts.counts);
  out.push(`頂點（凍結 S_b ${F.SbVerts.ids.length}，依 8720597 主骨）：計入 ${used}（${cnt.filter(([k]) => TORSO.includes(k)).map(([k, v]) => `${k} ${v}`).join('、')}）、主骨非軀幹不計 ${excluded}（${cnt.filter(([k]) => !TORSO.includes(k)).map(([k, v]) => `${k} ${v}`).join('、')}）；計入者中三軀幹骨權重和為 0、退回 R3 剛體 ${fallback}`);
  out.push('| 幀 | 序列 | 往內 >2 cm 頂點數 | 最大往內位移 cm | 最大處（主骨、綁定 y m） |');
  out.push('|---|---|---|---|---|');
  for (const [id, v] of Object.entries(rows)) out.push(`| ${id} | ${v.seq ?? '待命'} | ${v.over} | ${cm(v.max)} | ${v.arg ? `${v.arg.bone}、${v.arg.bindY}` : '—'} |`);
  let gate = null;
  if (args.baseline && args.baseline !== '1') {
    const base = JSON.parse(await readFile(args.baseline, 'utf8'));
    if (base.faces !== faces) throw new Error(`--baseline 面數 ${base.faces} ≠ ${faces}`);
    if (base.hashes?.['real-skin-frozen-sets.json'] !== hashes['real-skin-frozen-sets.json']) throw new Error('--baseline 用的凍結檔與本次不同，不能比較');
    if (base.hashes?.['real-skin-torso-drag.mjs'] !== hashes['real-skin-torso-drag.mjs']) throw new Error('--baseline 由不同版本的 (f) 工具產生（量法可能不同），不能比較；請用本工具在 8720597 重產現況');
    if (base.variant !== 'base') throw new Error(`--baseline 必須是現況（variant=base），收到 variant=${base.variant}`);
    if (base.hashes?.['realPlayer.js'] !== BASELINE_REALPLAYER_SHA12) throw new Error(`--baseline 的 realPlayer.js 雜湊 ${base.hashes?.['realPlayer.js']} ≠ 8720597 的 ${BASELINE_REALPLAYER_SHA12}（現況必須在 8720597 上量）`);
    if (base.hashes?.[`player_${faces}.glb`] !== hashes[`player_${faces}.glb`]) throw new Error('--baseline 的白模 glb 與本次不同，不能比較');
    // 第 2 輪 N3：除 realPlayer.js（受測物，已鎖 8720597）與 real-skin-heat.mjs（變體專用）外，兩邊記錄的每個輸入雜湊都要相同
    const hk = new Set([...Object.keys(base.hashes ?? {}), ...Object.keys(hashes)]);
    for (const k of hk) {
      if (k === 'realPlayer.js' || k === 'real-skin-heat.mjs') continue;
      if (base.hashes?.[k] !== hashes[k]) throw new Error(`--baseline 的輸入雜湊 ${k} ${base.hashes?.[k]} ≠ 本次 ${hashes[k]}，不能比較`);
    }
    gate = gateCheck(rows, base);
    out.push('', `## S11 門檻（對照 ${args.baseline.replace(/\\/g, '/').split('/').slice(-1)[0]}：每幀 >2 cm 點數 ≤ 現況＋${GATE.count}、最大往內位移 ≤ 現況＋${GATE.mm / 10} cm，位移比 0.1 cm）`);
    for (const [id, g] of Object.entries(gate.frames)) {
      const v = rows[id];
      out.push(`- ${id}：${g.ok ? '過' : '不過'}（點數 ${v.over} vs 上限 ${g.base.over + GATE.count}${g.okN ? '' : ' ✗'}；最大 ${cm(v.max)} vs 上限 ${((mmOf(g.base.max) + GATE.mm) / 10).toFixed(1)} cm${g.okD ? '' : ' ✗'}）`);
    }
    out.push(`- 判定：${gate.pass ? '綠（9 幀全過）' : `紅（不過 ${Object.values(gate.frames).filter((g) => !g.ok).length} 幀）`}`);
  }
  const text = `${out.join('\n')}\n`;
  process.stdout.write(text);
  if (args.txt && args.txt !== '1') await writeFile(args.txt, text);
  if (args.json && args.json !== '1') {
    await writeFile(args.json, `${JSON.stringify({ faces, variant, method: 'R4', hashes, used, excluded, fallback, rows, gate }, null, 1)}\n`);
  }
}
