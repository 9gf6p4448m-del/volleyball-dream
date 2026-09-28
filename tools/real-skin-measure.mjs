// 寫實球員蒙皮診斷：量化現況＋實驗性微調（docs/experiments/real-skin-diagnosis.md）。
// 用法（一行重跑）：node tools/real-skin-measure.mjs
//   --faces=20k|5k        白模面數（預設 20k）
//   --variants=a,b,...    只跑指定變體（預設全部；名稱見下方 VARIANTS）
//   --json=<path>         另存完整 JSON
//   --bench               每個變體量一次每幀 CPU 成本（單次，受同機負載影響大）
//   --ab=v1,v2            A/B 交替 CPU 基準：各變體與現況交替 5 輪，另附「現況 vs 現況」對照（量測解析度）
// 輸出另含：白模幾何檢查（拓樸、腋下／胯下融合）、熱擴散權重求解耗時
// 走真實路徑：loadRealPlayerAsset（GLTFLoader 讀本機 glb）→ createRealPlayer → createGeoAnimator 逐幀
// → groundLegs → CPU 蒙皮（與 three.js applyBoneTransform 同式，啟動時抽樣比對 getVertexPosition）。
// 實驗變體＝把 src/render/realPlayer.js 原始碼做「精確字串替換」後寫到系統暫存資料夾再 import
// （每個替換目標必須唯一命中，原始碼一改就報錯），或逐幀掛勾（hook，在 animator 之後、蒙皮之前改關節）。
// 不寫回 src/，跑完即刪暫存檔。
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';
import * as ga from '../src/render/geoAnimator.js';
import * as gc from '../src/render/geoCharacter.js';
import * as rpBase from '../src/render/realPlayer.js';
import * as lib from './real-skin-lib.mjs';

// ---- node 端補兩個瀏覽器 API，讓 GLTFLoader（FileLoader → fetch）讀得到本機 glb ----
if (!globalThis.ProgressEvent) {
  globalThis.ProgressEvent = class extends Event { constructor(t, i = {}) { super(t); Object.assign(this, i); } };
}
const netFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('file:')) return new Response(await readFile(fileURLToPath(url)), { status: 200 });
  return netFetch(input, init);
};

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));
const faces = args.faces === '5k' ? '5k' : '20k';
const glbUrl = new URL(`../public/models/real/player_${faces}.glb`, import.meta.url).href;
const SRC = new URL('../src/render/realPlayer.js', import.meta.url);

// ---- 變體產生器 ----
const tmpDirs = [];
async function patchedRealPlayer(name, patches) {
  let text = await readFile(SRC, 'utf8');
  for (const [find, repl] of patches) {
    const count = text.split(find).length - 1;
    if (count !== 1) throw new Error(`變體 ${name}：替換目標命中 ${count} 處（須恰 1 處）：${find.slice(0, 80)}`);
    text = text.replace(find, () => repl);
  }
  const imports = [
    ["from 'three';", `from '${import.meta.resolve('three')}';`],
    ["from 'three/addons/loaders/GLTFLoader.js';", `from '${import.meta.resolve('three/addons/loaders/GLTFLoader.js')}';`],
    ["from './geoCharacter.js';", `from '${new URL('../src/render/geoCharacter.js', import.meta.url).href}';`],
  ];
  for (const [find, repl] of imports) {
    if (text.split(find).length - 1 !== 1) throw new Error(`變體 ${name}：import 行「${find}」不是恰 1 處`);
    text = text.replace(find, () => repl);
  }
  const dir = await mkdtemp(join(tmpdir(), 'real-skin-'));
  tmpDirs.push(dir);
  const file = join(dir, `realPlayer.${name}.mjs`);
  await writeFile(file, text);
  return import(pathToFileURL(file).href);
}

// 肩部（spineUpper↔r/lShoulder）專用的權重衰減寬度
const SIGMA_LINE = 'const SIGMA = 0.03; // 權重平滑衰減寬度（m）';
const W_LINE = 'const w = Math.exp(-(((eff[b] - eff[pb]) / SIGMA) ** 2));';
function sigmaPairPatch(rule) {
  return [
    [SIGMA_LINE, `${SIGMA_LINE}\nconst __SIG = ${rule};`],
    [W_LINE, 'const w = Math.exp(-(((eff[b] - eff[pb]) / __SIG(BONES[pb], BONES[b])) ** 2));'],
  ];
}
// 權重覆寫掛勾：loadRealPlayerAsset 改呼叫注入的權重函式（下游部位標籤、接縫拆分、鞋底集合照舊由真實程式算）
const OVERRIDE_PATCH = [
  'const w = computeSkinWeights(pos, nor);',
  'const w = (globalThis.__realSkinOverride ?? computeSkinWeights)(pos, nor, geometry.index.array);',
];

// 乙：鎖骨／肩帶骨（胸鎖關節為樞紐）＋依上臂抬舉角度程序化上提（肩肱節律），
// 盂肱關節局部旋轉反向補償＝上臂世界方向不變，只有肩關節中心隨肩帶上移
const CLAV = { x: 0.035, y: 1.48, z: 0.03 }; // 胸鎖關節（BASE_H 空間；右側 x 取負）
const CLAVICLE_PATCHES = [
  ["'rShoulder', 'rElbow', 'rWrist', 'lShoulder', 'lElbow', 'lWrist', 'rAnkle', 'lAnkle',\n];",
    "'rShoulder', 'rElbow', 'rWrist', 'lShoulder', 'lElbow', 'lWrist', 'rAnkle', 'lAnkle', 'rClav', 'lClav',\n];"],
  ["rShoulder: 'spineUpper', rElbow: 'rShoulder', rWrist: 'rElbow',\n  lShoulder: 'spineUpper',",
    "rShoulder: 'rClav', rElbow: 'rShoulder', rWrist: 'rElbow', rClav: 'spineUpper', lClav: 'spineUpper',\n  lShoulder: 'lClav',"],
  ["for (const k of ['Hip', 'Knee', 'Ankle', 'Toe', 'Shoulder', 'Elbow', 'Wrist', 'HandTip']) {",
    `LANDMARKS.rClav = [${-CLAV.x}, ${CLAV.y}, ${CLAV.z}];\nfor (const k of ['Hip', 'Knee', 'Ankle', 'Toe', 'Shoulder', 'Elbow', 'Wrist', 'HandTip', 'Clav']) {`],
  ["  SEGMENTS[`${s}Shoulder`] = { segs: [[L[`${s}Shoulder`], L[`${s}Elbow`]]], r: 0.05 };",
    "  SEGMENTS[`${s}Shoulder`] = { segs: [[L[`${s}Shoulder`], L[`${s}Elbow`]]], r: 0.05 };\n  SEGMENTS[`${s}Clav`] = { segs: [[L[`${s}Clav`], L[`${s}Shoulder`]]], r: 0.06 };"],
  ["    joints[`${s}Ankle`] = ankle;\n  }",
    "    joints[`${s}Ankle`] = ankle;\n    const clav = new THREE.Object3D();\n    joints.spineUpper.add(clav);\n    clav.add(joints[`${s}Shoulder`]);\n    joints[`${s}Clav`] = clav;\n  }"],
];
// 熱擴散權重：注入 loadRealPlayerAsset 的權重覆寫，並記錄每次求解耗時（本機 node）
const heatTimes = [];
// keepBelowY：綁定 y ≤ 此值的頂點（小腿以下、含鞋底）保留現行權重——鞋底非零影響數不變，groundLegs 成本不變
async function useHeat(mod, { keepBelowY = null } = {}) {
  const { heatWeightsFactory } = await import('./real-skin-heat.mjs');
  const f = heatWeightsFactory(mod);
  globalThis.__realSkinOverride = (pos, nor, index) => {
    const t = performance.now(); const r = f(pos, nor, index); heatTimes.push(performance.now() - t);
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
  return mod;
}
const HOOKS = lib.makeHooks(THREE);
const restAbductHook = HOOKS.restAbduct;
const twistSplitHook = HOOKS.twistSplit;
const clavicleHook = HOOKS.clavicle;

const VARIANTS = {
  base: { label: '現況（55cc61b）', load: async () => rpBase },
  sigmaShoulder: {
    label: '甲-1 肩部混合帶加寬（spineUpper↔肩 σ 0.03→0.10）',
    load: () => patchedRealPlayer('sigmaShoulder', sigmaPairPatch("(a, b) => ((a === 'spineUpper' && /Shoulder$/.test(b)) || (b === 'spineUpper' && /Shoulder$/.test(a)) ? 0.10 : SIGMA)")),
  },
  sigmaTorso: {
    label: '甲-2 軀幹三段混合帶加寬（pelvis/spine/spineUpper 互相 σ 0.03→0.10）',
    load: () => patchedRealPlayer('sigmaTorso', sigmaPairPatch("(a, b) => (/^(pelvis|spine|spineUpper)$/.test(a) && /^(pelvis|spine|spineUpper)$/.test(b) ? 0.10 : SIGMA)")),
  },
  noNormalTest: {
    label: '甲-5 對照：拿掉法線可見性測試（每骨皆有效），σ 不變',
    load: () => patchedRealPlayer('noNormalTest', [['if (dot > -0.1) valid[b] = 1;', 'valid[b] = 1;']]),
  },
  sigmaAll: {
    label: '甲-3 全身 σ 0.03→0.08',
    load: () => patchedRealPlayer('sigmaAll', [[SIGMA_LINE, 'const SIGMA = 0.08;']]),
  },
  heat: {
    label: '甲-4 熱擴散權重（Baran–Popović bone heat 的 JS 實作；丙 Blender 同演算法的代理）',
    load: async () => useHeat(await patchedRealPlayer('heat', [OVERRIDE_PATCH])),
    after: () => { delete globalThis.__realSkinOverride; },
  },
  heatCombo: {
    label: '甲-4＋己＋乙-2 熱擴散權重＋零姿勢外展 12°＋扭轉分段',
    load: async () => useHeat(await patchedRealPlayer('heatCombo', [OVERRIDE_PATCH])),
    after: () => { delete globalThis.__realSkinOverride; },
    hook: HOOKS.chain(restAbductHook(12), twistSplitHook(0.5)),
  },
  heatCombo8: {
    label: '甲-4＋己＋乙-2 熱擴散權重＋零姿勢外展 8°（A2(d) 10° 以內）＋扭轉分段',
    load: async () => useHeat(await patchedRealPlayer('heatCombo8', [OVERRIDE_PATCH])),
    after: () => { delete globalThis.__realSkinOverride; },
    hook: HOOKS.chain(restAbductHook(8), twistSplitHook(0.5)),
  },
  heatCombo8Upper: {
    label: '推薦組合＋CPU 緩解：熱擴散只用在小腿中段（y>0.45 m）以上＋零姿勢外展 8°＋扭轉分段',
    load: async () => useHeat(await patchedRealPlayer('heatCombo8Upper', [OVERRIDE_PATCH]), { keepBelowY: 0.45 }),
    after: () => { delete globalThis.__realSkinOverride; },
    hook: HOOKS.chain(restAbductHook(8), twistSplitHook(0.5)),
  },
  heatClavicle: {
    label: '甲-4＋乙＋己 熱擴散權重＋鎖骨骨（肩肱節律）＋零姿勢外展 12°＋扭轉分段',
    load: async () => useHeat(await patchedRealPlayer('heatClavicle', [...CLAVICLE_PATCHES, OVERRIDE_PATCH])),
    after: () => { delete globalThis.__realSkinOverride; },
    hook: HOOKS.chain(restAbductHook(12), twistSplitHook(0.5), clavicleHook()),
  },
  restAbduct8: {
    label: '己 綁定零姿勢修正：手臂下垂時肩外展 +8°（依抬舉角淡出；A2(d) 10° 以內）',
    load: async () => rpBase, hook: restAbductHook(8),
  },
  restAbduct: {
    label: '己 綁定零姿勢修正：手臂下垂時肩外展 +12°（依抬舉角淡出）',
    load: async () => rpBase, hook: restAbductHook(12),
  },
  restAbduct18: {
    label: '己 綁定零姿勢修正：手臂下垂時肩外展 +18°（依抬舉角淡出）',
    load: async () => rpBase, hook: restAbductHook(18),
  },
  twistSplit: {
    label: '乙-2 胸椎扭轉分一半到 spine（程序化，動畫資料不改）',
    load: async () => rpBase, hook: twistSplitHook(0.5),
  },
  clavicle0: {
    label: '乙-1 對照：只加鎖骨骨（權重），肩帶不動（上提 0°）',
    load: () => patchedRealPlayer('clavicle0', CLAVICLE_PATCHES), hook: clavicleHook({ maxDeg: 0 }),
  },
  clavicle: {
    label: '乙-1 鎖骨／肩帶骨＋肩肱節律上提（φ>30° 後線性，全舉 15°，Ludewig 2004）',
    load: () => patchedRealPlayer('clavicle', CLAVICLE_PATCHES), hook: clavicleHook(),
  },
  clavicle30: {
    label: '乙-1 敏感度：肩帶上提加倍（全舉 30°）',
    load: () => patchedRealPlayer('clavicle30', CLAVICLE_PATCHES), hook: clavicleHook({ maxDeg: 30 }),
  },
  clavicleSigma: {
    label: '甲＋乙 鎖骨骨＋肩部與軀幹 σ 0.10＋扭轉分段＋零姿勢外展',
    load: () => patchedRealPlayer('clavicleSigma', [
      ...CLAVICLE_PATCHES,
      ...sigmaPairPatch("(a, b) => { const s = /^(pelvis|spine|spineUpper|rClav|lClav)$/; const sh = /(Shoulder|Clav)$/; return ((s.test(a) && s.test(b)) || (sh.test(a) && (s.test(b) || sh.test(b))) || (sh.test(b) && s.test(a))) ? 0.10 : SIGMA; }"),
    ]),
    hook: HOOKS.chain(restAbductHook(12), twistSplitHook(0.5), clavicleHook()),
  },
};

// ---- 跑 ----
const want = args.variants ? args.variants.split(',') : Object.keys(VARIANTS);
const geoms = gc.geometries();
const results = {};
const t0 = Date.now();
for (const name of want) {
  const V = VARIANTS[name];
  if (!V) throw new Error(`未知變體 ${name}（可用：${Object.keys(VARIANTS).join(', ')}）`);
  const rp = await V.load();
  const mods = { THREE, rp, ga, gc };
  const asset = await rp.loadRealPlayerAsset(glbUrl);
  V.after?.();
  const R = lib.bindRegions(asset, rp.LANDMARKS);
  const d = lib.metricWeights(asset, rp.BONES, rp.LANDMARKS, rp.BONES.includes('rClav') ? [['rClav', 'rShoulder', 'rShoulder', 'rElbow'], ['spineUpper', 'rClav', 'rClav', 'rShoulder']] : []);
  const keys = {};
  for (const key of lib.ALL_KEYS) {
    const m = lib.measureKey(mods, asset, R, key, { hook: V.hook ?? null, geoms: name === 'base' ? geoms : null });
    if (name === 'base' && key.id === 'K4a') {
      // 自我檢查：CPU 蒙皮與 three.js SkinnedMesh.getVertexPosition 逐點一致
      let maxErr = 0;
      const v = new THREE.Vector3();
      for (let i = 0; i < R.n; i += 97) {
        m.real.p.mesh.getVertexPosition(i, v);
        maxErr = Math.max(maxErr, Math.hypot(v.x - m.P1[i * 3], v.y - m.P1[i * 3 + 1], v.z - m.P1[i * 3 + 2]));
      }
      if (maxErr > 1e-5) throw new Error(`CPU 蒙皮與 getVertexPosition 不一致：${maxErr}`);
      results.selfCheck = { skinVsThree: maxErr, sampled: Math.ceil(R.n / 97) };
    }
    const { P1, real, geoSubject, ...rest } = m;
    delete rest.a.flagged; delete rest.b.flagged;
    keys[key.id] = rest;
  }
  results[name] = {
    label: V.label, faces: asset.faces, verts: R.n,
    region: { shoulderTris: R.shoulderTris.length, armR: R.armVerts.r.length, armL: R.armVerts.l.length, torsoTris: R.torsoTris.length },
    // groundLegs 的 soleMin 每次 IK 迭代逐一計算鞋底頂點的非零影響（realPlayer.js:471-476）：決定論的 CPU 工作量指標
    sole: { verts: asset.sole.n, nonzero: Array.from(asset.sole.sw).filter((w) => w > 0).length },
    weights: d, keys,
  };
  process.stderr.write(`  ${name} 完成（${((Date.now() - t0) / 1000).toFixed(1)} s）\n`);
}
for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });

// ---- 每幀 CPU 成本（--bench）：14 名球員 × animator.update＋掛勾＋groundLegs＋skeleton.update ----
if (args.bench) {
  results.bench = {};
  for (const name of want) {
    const V = VARIANTS[name];
    const rp = await V.load();
    const asset = await rp.loadRealPlayerAsset(glbUrl);
    V.after?.();
    const mods = { THREE, rp, ga, gc };
    const subs = Array.from({ length: 14 }, (_, i) => lib.makeReal(mods, asset, { hook: V.hook ?? null, id: `B${i}` }));
    const frame = (k) => {
      for (const [i, s] of subs.entries()) {
        s.pre();
        const y = s.anim.update(1 / 60, (k + i) % 120 < 60 ? 4 : 0, 0, 1);
        s.post(y);
        s.p.skeleton.update();
      }
    };
    for (let k = 0; k < 300; k += 1) frame(k); // 暖機（JIT）
    const N = 1200;
    const t1 = performance.now();
    for (let k = 0; k < N; k += 1) frame(k);
    results.bench[name] = (performance.now() - t1) / N;
  }
  for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
}

// ---- A/B 交替 CPU 基準（--ab=變體,變體…）：每個變體與現況交替 5 輪×1500 幀；另跑「現況 vs 現況」對照＝量測解析度 ----
async function benchSubjects(name) {
  const V = VARIANTS[name];
  const rp = await V.load();
  const asset = await rp.loadRealPlayerAsset(glbUrl);
  V.after?.();
  return Array.from({ length: 14 }, (_, i) => lib.makeReal({ THREE, rp, ga, gc }, asset, { hook: V.hook ?? null, id: `B${i}` }));
}
function benchRun(subs, N) {
  const frame = (k) => {
    for (const [i, s] of subs.entries()) {
      s.pre(); const y = s.anim.update(1 / 60, (k + i) % 120 < 60 ? 4 : 0, 0, 1); s.post(y); s.p.skeleton.update();
    }
  };
  for (let k = 0; k < 300; k += 1) frame(k);
  const t1 = performance.now();
  for (let k = 0; k < N; k += 1) frame(k);
  return (performance.now() - t1) / N;
}
if (args.ab) {
  results.ab = {};
  const baseSubs = await benchSubjects('base');
  for (const name of ['base', ...args.ab.split(',')]) {
    const other = await benchSubjects(name); // name＝base 時是第二份獨立的現況（對照組）
    const a = []; const b = [];
    for (let r = 0; r < 5; r += 1) { a.push(benchRun(baseSubs, 1500)); b.push(benchRun(other, 1500)); }
    results.ab[name === 'base' ? '對照：現況 vs 現況' : name] = { base: a, variant: b };
  }
  for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
}

// ---- 輸出 ----
const f2 = (x) => (x == null ? '—' : Number(x).toFixed(2));
const f3 = (x) => (x == null ? '—' : Number(x).toFixed(3));
const f0 = (x) => (x == null ? '—' : Math.round(x).toString());
const line = (cells) => `| ${cells.join(' | ')} |`;
const out = [];
out.push(`# real-skin-measure（faces=${faces}，${new Date().toISOString()}）`);
if (results.selfCheck) out.push(`自我檢查：CPU 蒙皮 vs getVertexPosition 最大差 ${results.selfCheck.skinVsThree.toExponential(2)} m（抽 ${results.selfCheck.sampled} 點）`);
for (const name of want) {
  const r = results[name];
  out.push('', `## ${name}：${r.label}`);
  out.push(`鞋底頂點 ${r.sole.verts}、非零影響 ${r.sole.nonzero}（groundLegs 每次 IK 迭代的工作量正比於此）`);
  out.push(`面數 ${r.faces}、頂點 ${r.verts}；區域：肩部三角形 ${r.region.shoulderTris}、手臂頂點 右 ${r.region.armR}／左 ${r.region.armL}、軀幹三角形 ${r.region.torsoTris}`);
  out.push(line(['幀', '序列', '(a) σ1 最大/P99', '(a) >2× 數/面積cm²', '(a) 壓扁<0.5', '(a) 最長邊 m',
    '(b) 右 最深 m', '(b) 右 穿入/>1cm/不定', '(b) 左 最深 m', '(b) 左 穿入/>1cm/不定',
    '(c) 關節扭 骨盆/腰/胸°', '(c) 皮 總扭°', '(c) 皮 最大扭跳°/2cm @y', '(c) 胸關節±4cm 佔比', '(c) 相鄰片最大折角° @y',
    '(d) 問題頂點 多骨%', 'B3 手離腕 右/左 m', 'B3 鞋底 m', 'B5 背號 後/前 m']));
  out.push(line(Array(19).fill('---')));
  for (const [id, k] of Object.entries(r.keys)) {
    const j = k.c.joints; const s = k.c.skin;
    out.push(line([id, k.seq ?? '待命', `${f2(k.a.maxStretch)}/${f2(k.a.p99)}`, `${k.a.over2}/${f0(k.a.over2AreaCm2)}`, k.a.crushed, f3(k.a.maxEdge),
      f3(k.b.r.maxDepth), `${k.b.r.inside}/${k.b.r.deeper1cm}/${k.b.r.undetermined}`, f3(k.b.l.maxDepth), `${k.b.l.inside}/${k.b.l.deeper1cm}/${k.b.l.undetermined}`,
      `${f0(j.pelvis.twist)}/${f0(j.spine.twist)}/${f0(j.spineUpper.twist)}`, f0(s.total), `${f0(s.maxJump)} @${f2(s.maxJumpY)}`,
      s.shareUpper == null ? '—' : `${Math.round(s.shareUpper * 100)}%`, `${f0(s.maxFold)} @${f2(s.maxFoldY)}`,
      k.d.multiFrac == null ? '—' : `${Math.round(k.d.multiFrac * 100)}%（${k.d.problemVerts}）`,
      `${f3(k.twoA.hand_r)}/${f3(k.twoA.hand_l)}`, f3(k.twoA.soleMin), `${f3(k.twoA.plate_back)}/${f3(k.twoA.plate_front)}`]));
  }
  out.push('', '(b) 分區（手臂部位→最近軀幹面所在區：穿入點數／最深 cm；胸 ≥1.15 m、腹 0.95–1.15、臀腿 <0.95）');
  for (const [id, k] of Object.entries(r.keys)) {
    const z = (s) => Object.entries(k.b[s].zones).map(([zk, v]) => `${zk} ${v.n}/${(v.max * 100).toFixed(1)}`).join('、') || '無';
    out.push(`- ${id} 右：${z('r')}｜左：${z('l')}`);
  }
  const w = r.weights;
  out.push('', `(d) 權重：多骨（≥2 骨 w≥0.05）${(w.multi2 * 100).toFixed(1)}%、≥3 骨 ${(w.multi3 * 100).toFixed(1)}%`);
  out.push(line(['父→子', '混合頂點數', '混合帶 P5–P95 cm', '子骨 10%→90% 過渡 cm', '局部等效過渡寬 cm（0.8/P90 梯度）']));
  out.push(line(['---', '---', '---', '---', '---']));
  for (const [pair, v] of Object.entries(w.pairs)) out.push(line([pair, v.blendVerts, f2(v.bandCm), v.transitionCm ?? '—', f2(v.localWidthCm)]));
  if (name === 'base') {
    out.push('', '幾何人對照（同輸入驅動；手臂膠囊頂點在軀幹／骨盆膠囊內的深度、軀幹膠囊與胸節世界偏航）');
    out.push(line(['幀', '右 最深 m', '右 穿入點', '左 最深 m', '左 穿入點', '軀幹膠囊偏航°', '胸節偏航°']));
    out.push(line(Array(7).fill('---')));
    for (const [id, k] of Object.entries(r.keys)) {
      const g = k.geo;
      out.push(line([id, f3(g.pen.r.maxDepth), `${g.pen.r.inside}/${g.pen.r.samples}`, f3(g.pen.l.maxDepth), `${g.pen.l.inside}/${g.pen.l.samples}`, f0(g.yaw.torsoCapsule), f0(g.yaw.chest)]));
    }
  }
  if (r.keys.K1a) {
    out.push('', `(c) 蒙皮逐片剖面 K1a 引臂（[y m, twist°, swing°]）：`, JSON.stringify(r.keys.K1a.c.skin.profile));
  }
}
// ---- 白模幾何檢查（任務 3：腋下、胯下融合；拓樸）----
{
  const baseAsset = await rpBase.loadRealPlayerAsset(glbUrl);
  const mf = lib.meshFusion(baseAsset, rpBase.LANDMARKS);
  results.mesh = { ...mf, armpit: { r: { apexY: mf.armpit.r.apexY, belowShoulder: mf.armpit.r.belowShoulder }, l: { apexY: mf.armpit.l.apexY, belowShoulder: mf.armpit.l.belowShoulder } }, armpitTraceR: mf.armpit.r.trace, crotch: { legSplitY: mf.crotch.legSplitY, crotchLandmark: mf.crotch.crotchLandmark, shortsHem: mf.crotch.shortsHem } };
  out.push('', `## 白模幾何檢查（faces=${faces}）`);
  out.push(`頂點 ${mf.verts}（依位置焊接後 ${mf.weldedVerts}）、三角形 ${mf.tris}、退化 ${mf.degenerate}、開口邊 ${mf.openEdges}、非流形邊 ${mf.nonManifoldEdges}、分離塊 ${mf.components.length}`);
  for (const s of ['r', 'l']) {
    const a = mf.armpit[s];
    out.push(`腋下（${s === 'r' ? '右' : '左'}）：手臂截面自成一圈的最高高度 y=${f3(a.apexY)} m（肩關節下 ${f3(a.belowShoulder)} m）`);
  }
  out.push(`右腋下水平截面（y m：迴圈數、手臂與軀幹水平間距 m、軀幹半寬 m）：${mf.armpit.r.trace.map((t) => `${f2(t.y)}：${t.loops}、${t.gap == null ? '相連' : f3(t.gap)}、${f3(t.torsoHalf)}`).join('；')}`);
  out.push(`胯下：兩腿各自成圈的最高高度 y=${f3(mf.crotch.legSplitY)} m（解剖胯下地標 ${mf.crotch.crotchLandmark}、褲管口 ${mf.crotch.shortsHem}）`);
}
if (heatTimes.length) {
  results.heatSolveMs = heatTimes;
  out.push('', `熱擴散權重求解耗時（本機 node，faces=${faces}）：${Math.min(...heatTimes).toFixed(0)}–${Math.max(...heatTimes).toFixed(0)} ms（${heatTimes.length} 次）`);
}
if (results.ab) {
  const ms = (x) => `${(x.reduce((q, v) => q + v, 0) / x.length).toFixed(3)}±${Math.sqrt(x.reduce((q, v, _, arr) => q + (v - arr.reduce((u, w) => u + w, 0) / arr.length) ** 2, 0) / (x.length - 1)).toFixed(3)}`;
  out.push('', 'A/B 交替 CPU 基準（本機 node，14 名球員×1500 幀×5 輪；同機負載會讓絕對值漂移，只看同一輪內的相對差）');
  for (const [n, v] of Object.entries(results.ab)) {
    const rel = v.variant.map((x, i) => x / v.base[i] - 1);
    out.push(`- ${n}：現況 ${ms(v.base)} ms、變體 ${ms(v.variant)} ms；逐輪相對差 ${rel.map((x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`).join(' ')}（平均 ${(rel.reduce((q, x) => q + x, 0) / rel.length * 100).toFixed(0)}%）`);
  }
}
if (results.bench) {
  out.push('', '每幀 CPU 成本（本機 node，14 名球員：animator.update＋掛勾＋groundLegs＋skeleton.update；不含 GPU）');
  for (const [n, ms] of Object.entries(results.bench)) out.push(`- ${n}：${ms.toFixed(3)} ms／幀`);
}
console.log(out.join('\n'));
if (args.json && args.json !== '1') {
  await writeFile(args.json, JSON.stringify({ faces, results }, null, 1));
  console.log(`\nJSON：${args.json}`);
}
