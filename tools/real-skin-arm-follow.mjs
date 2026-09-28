// 寫實蒙皮修正 S13：手臂跟隨——上臂中段皮膚頂點的軀幹骨權重平均值。
// 驗收：docs/kickoffs/real-skin-acceptance.md 修訂紀錄 R7（c075fb7）。門檻：左右臂皆 ≤0.30（20k、5k）。
//
// 用法：node tools/real-skin-arm-follow.mjs [--faces=20k|5k] [--json=<path>] [--txt=<path>]
//
// 量法（量尺方定義）：
//  ・取帶：上臂骨段（肩地標→肘地標）參數 t∈[0.40, 0.60]（中心 0.5、半寬 0.10）的手臂皮膚頂點。
//    地標用 8720597 的值（寫死於 FROZEN_LANDMARKS，量尺中立：不隨實作改地標而移動取帶）；頂點須屬凍結手臂集合
//    （tools/real-skin-frozen-sets.json，armPart＝上臂），並以 bindRegions 同一規則重算：到臂軸三段折線最近段為上臂段、
//    該段參數 t 落在帶內。
//    半寬 0.10 的理由：上臂段長 ≈0.31 m，±0.10＝±3.1 cm，帶的兩端離肩地標 ≥9.2 cm、離肘地標 ≥12.3 cm——
//    避開肩頭／腋下（凍結手臂集合本就排除 t<0.30）與肘窩的權重過渡區，又讓 5k 每臂仍有足夠頂點（實數見輸出）。
//  ・每個取帶頂點的軀幹權重＝其 skinWeight 中骨名屬 pelvis／spine／spineUpper 者的總和（輔助骨 ArmAux／ArmHalf
//    等非這三骨者不計入，照 R7 字面「軀幹骨（pelvis／spine／spineUpper）」）。
//    權重讀畫面實際使用的 mesh.geometry（V2.loadSetup 的 G；含其全部斷言：同一份資料、網格本體、索引、權重合法、
//    遊戲參數）。凍結頂點若有被畫出的手臂複製點，取其手臂代表點中軀幹權重最大者（最差值）。
//  ・每臂輸出：取帶頂點數、軀幹權重平均（判定用，比到小數第 3 位：四捨五入到 0.001 後 ≤0.300）、中位數、最大。
// 輸出不含時間戳：同輸入逐位元相同。
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as V2 from './real-skin-penetration-v2.mjs';

export const TORSO = ['pelvis', 'spine', 'spineUpper'];
export const BAND = { center: 0.5, half: 0.10 };
export const GATE = 0.30; // R7：兩臂皆 ≤0.30
// 8720597 src/render/realPlayer.js 的 LANDMARKS（右側；左側 x 取負）。量尺中立：取帶不隨實作的地標改動而移動
export const FROZEN_LANDMARKS = {
  rShoulder: [-0.178, 1.47, -0.075], rElbow: [-0.363, 1.227, -0.049],
};
const ARM_DIST = 0.09; // 與 lib.REGION.armDist（凍結手臂集合的規則）相同

function closestOnSeg(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  let t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return { t, d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) };
}
const mirror = (v) => [-v[0], v[1], v[2]];

export function armFollow(setup, faces) {
  const { R, G } = setup;
  const F = setup.frozen.fz[faces];
  const BONES = setup.mods.rp.BONES;
  const TI = new Set(TORSO.map((b) => { const i = BONES.indexOf(b); if (i < 0) throw new Error(`骨架裡沒有 ${b}`); return i; }));
  const SI = G.attributes.skinIndex.array; const SW = G.attributes.skinWeight.array;
  const torsoW = (v) => { let s = 0; for (let q = 0; q < 4; q += 1) if (TI.has(SI[v * 4 + q])) s += SW[v * 4 + q]; return s; };
  const out = {};
  for (const [s, ids, parts] of [['r', F.arm.r, F.arm.rPart], ['l', F.arm.l, F.arm.lPart]]) {
    const sh = s === 'r' ? FROZEN_LANDMARKS.rShoulder : mirror(FROZEN_LANDMARKS.rShoulder);
    const el = s === 'r' ? FROZEN_LANDMARKS.rElbow : mirror(FROZEN_LANDMARKS.rElbow);
    const vals = []; const sel = [];
    ids.forEach((i, k) => {
      if (parts[k] !== 0) return; // 凍結集合：最近段為上臂
      const p = [R.P[i * 3], R.P[i * 3 + 1], R.P[i * 3 + 2]];
      const c = closestOnSeg(p, sh, el);
      if (c.d > ARM_DIST || Math.abs(c.t - BAND.center) > BAND.half) return;
      let w = -Infinity;
      for (const v of R.armReps.get(i)) w = Math.max(w, torsoW(v));
      vals.push(w); sel.push(i);
    });
    if (!vals.length) throw new Error(`${s === 'r' ? '右' : '左'}臂上臂中段取帶沒有任何頂點（取帶或凍結集合有誤），停止`);
    const sorted = [...vals].sort((a, b) => a - b);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    out[s] = { n: vals.length, mean, median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], ids: V2.setPrint(sel) };
  }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const ok = (x) => r3(x.mean) <= GATE;
  return { ...out, pass: ok(out.r) && ok(out.l), okR: ok(out.r), okL: ok(out.l) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
  }));
  const faces = args.faces === '5k' ? '5k' : '20k';
  const setup = await V2.loadSetup(faces);
  const res = armFollow(setup, faces);
  const hashes = {};
  const files = [['realPlayer.js', '../src/render/realPlayer.js'], ['geoAnimator.js', '../src/render/geoAnimator.js'],
    ['geoCharacter.js', '../src/render/geoCharacter.js'], [`player_${faces}.glb`, `../public/models/real/player_${faces}.glb`],
    [`player_${faces}.weights.glb`, `../public/models/real/player_${faces}.weights.glb`],
    ['real-skin-lib.mjs', './real-skin-lib.mjs'], ['real-skin-penetration-v2.mjs', './real-skin-penetration-v2.mjs'],
    ['real-skin-arm-follow.mjs', './real-skin-arm-follow.mjs']];
  for (const [k, rel] of files) {
    try { hashes[k] = await V2.sha12(new URL(rel, import.meta.url)); } catch { hashes[k] = '（無此檔）'; }
  }
  hashes['real-skin-frozen-sets.json'] = setup.frozen.fileSha.slice(0, 12);
  // 權重來源：新版 loadRealPlayerAsset 會標 weightsSource（'baked'＝讀了烘焙檔）；8720597 沒有此欄位＝現算
  const src = setup.loaded.weightsSource ?? 'computed（此版 src 無 weightsSource 欄位）';
  const f3 = (x) => x.toFixed(3);
  const out = [];
  out.push(`# real-skin-arm-follow S13 手臂跟隨（faces=${faces}）`);
  out.push(`量法：上臂段（8720597 地標，肩→肘）t∈[${BAND.center - BAND.half}, ${BAND.center + BAND.half}]、屬凍結手臂集合上臂的皮膚頂點；軀幹權重＝pelvis／spine／spineUpper 權重和（讀畫面 mesh.geometry；手臂複製點取最差）`);
  out.push(`輸入 sha256 前 12 碼：${Object.entries(hashes).map(([k, v]) => `${k} ${v}`).join('、')}`);
  out.push(`權重來源：${src}`);
  out.push('| 臂 | 取帶頂點數 | 軀幹權重平均 | 中位數 | 最大 | 取帶頂點指紋 | 判定（平均 ≤0.300） |');
  out.push('|---|---|---|---|---|---|---|');
  for (const [s, nm, ok] of [['r', '右', res.okR], ['l', '左', res.okL]]) {
    const x = res[s];
    out.push(`| ${nm} | ${x.n} | ${f3(x.mean)} | ${f3(x.median)} | ${f3(x.max)} | ${x.ids.sha} | ${ok ? '過' : '不過'} |`);
  }
  out.push(`- 判定：${res.pass ? '綠（兩臂皆 ≤0.30）' : '紅'}`);
  const text = `${out.join('\n')}\n`;
  process.stdout.write(text);
  if (args.txt && args.txt !== '1') await writeFile(args.txt, text);
  if (args.json && args.json !== '1') {
    const j = { faces, method: 'S13 arm-follow R7', band: BAND, gate: GATE, hashes, weightsSource: src, pass: res.pass };
    for (const s of ['r', 'l']) j[s] = { n: res[s].n, mean: Number(res[s].mean.toFixed(6)), median: Number(res[s].median.toFixed(6)), max: Number(res[s].max.toFixed(6)), idsSha: res[s].ids.sha };
    await writeFile(args.json, `${JSON.stringify(j, null, 1)}\n`);
  }
}
