#!/usr/bin/env node
// 寫實球員卷 2B · E1 鏡像還原探針（docs/kickoffs/real-player-stage2-match.md「### 2B 驗收」E1）
//
// 「意圖方向」＝在 b1ae67d^（＝1fd5da6，右側關節在 +X 的時代）量出的方向對 X 取鏡像。
// 1fd5da6 的 animator 只 export createGeoAnimator、createGeoCharacter 只有 5 參數——所以不能
// 直接跑 D0 腳本；本探針以 tools/motion-2b-lib.mjs 的最小插樁載入兩個版本，對每個姿勢走
// hold 路徑（w=1）讀關節世界座標：左右上臂、左右前臂、肩線、髖線（線取水平投影）。
//
// 用法（repo 根目錄）：
//   node tools/motion-2b-e1-mirror.mjs [--d0-json <D0 腳本 JSON>] [--restore-only-json <純還原版 D0 JSON>] [--out <報告 JSON>]
// 判定：健全性（≤0.5°）、25 姿勢逐向量 ≤5°（例外表逐條驗證依據）、bump.contact.span ≤0.20 m、
// spike.wind.shline <180°。任一不過 exit 1。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROOT, loadVersion, holdPose, worldPoints, e1Vectors, mirrorX, angleDeg,
} from './motion-2b-lib.mjs';

const OLD = '1fd5da6';  // b1ae67d^
const BASE = 'f4ccbec'; // 2B 動工基準
const LIST25 = ['bumpReady', 'bumpHit', 'setReach', 'setPush', 'spikeWind', 'spikeUnlock', 'spikeHit', 'spikeFollow',
  'windup', 'approachBack', 'approachDrive', 'landDeep', 'landRise', 'diveReach', 'diveSprawl', 'divePush', 'serveReady',
  'floatWind', 'floatPush', 'gasp', 'dejected', 'waveUp', 'waveSide', 'blockLoad', 'windupHesitant'];
const VECS = ['rUpperArm', 'lUpperArm', 'rForearm', 'lForearm', 'shoulderLine', 'hipLine'];
const TOL = 5;
const SANITY_TOL = 0.5;

// 例外表（E1：唯一允許的例外＝還原後會違反 E2 文獻範圍〔附 D0 表列號〕或有來源的教學描述〔附 URL〕）。
// basis:'E2' 的 rows 必須在「純還原版」D0 JSON 中判定為超出（--restore-only-json），否則此例外不成立。
// 只列真的偏離 >5° 的向量；未列的向量一律照 5° 判。
export const EXCEPTIONS = {};

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  return {
    d0Json: get('--d0-json', resolve(ROOT, 'docs/experiments/motion-d0-measure.json')),
    restoreOnlyJson: get('--restore-only-json', null),
    out: get('--out', null),
  };
}

function measure(v, pose) {
  const c = holdPose(v, pose);
  return e1Vectors(worldPoints(c.rig));
}

function compare(intentV, curV) {
  const out = {};
  for (const k of VECS) out[k] = angleDeg(mirrorX(intentV[k]), curV[k]);
  return out;
}

async function main() {
  const args = parseArgs();
  const old = await loadVersion(OLD);
  const base = await loadVersion(BASE);
  const cur = await loadVersion(null);
  const report = { old: OLD, base: BASE, sanity: [], poses: [], checks: {}, pass: {} };

  // ── 健全性：舊版肩 z 與 pelvisY/chestY 皆為 0、且兩版都有的姿勢，意圖 vs 基準現況 ≤0.5° ──
  const zeroish = (p) => (p.rSh?.[1] ?? 0) === 0 && (p.lSh?.[1] ?? 0) === 0 && !(p.pelvisY) && !(p.chestY);
  const sanityPoses = Object.keys(old.A.POSES).filter((k) => zeroish(old.A.POSES[k]) && base.A.POSES[k]);
  // 另加一個只有 x 旋轉的非對稱合成姿勢（兩版同值注入），讓健全性不只量到「手臂垂直下垂」這種平凡情形
  const synth = { rSh: [-1.3, 0], lSh: [-0.4, 0], rEl: -0.8, lEl: -0.2, spine: 0.3, spineUp: 0.1, neck: -0.2, crouch: 0.1 };
  old.A.POSES.__sanityX = { ...synth };
  base.A.POSES.__sanityX = { ...synth };
  sanityPoses.push('__sanityX');
  for (const p of sanityPoses) {
    const ang = compare(measure(old, p), measure(base, p));
    const worst = Math.max(...Object.values(ang));
    report.sanity.push({ pose: p, worst, ang, ok: worst <= SANITY_TOL });
  }
  // 反向（探針要看得出鏡像錯誤）：同一組非零 z／pelvisY 注入兩版，未還原時必須明顯偏離
  const sens = { rSh: [-1.0, 0.3], lSh: [-0.6, -0.2], rEl: -0.5, lEl: -0.3, spine: 0.1, pelvisY: 0.3, chestY: 0.2 };
  old.A.POSES.__sensZ = { ...sens };
  base.A.POSES.__sensZ = { ...sens };
  const sensAng = compare(measure(old, '__sensZ'), measure(base, '__sensZ'));
  report.sensitivity = { pose: '__sensZ（z 與 pelvisY/chestY 非零、未還原）', ang: sensAng };

  // ── 25 姿勢 ──
  let restoreOnly = null;
  if (args.restoreOnlyJson) restoreOnly = JSON.parse(readFileSync(args.restoreOnlyJson, 'utf8'));
  const roOut = new Set((restoreOnly?.rows ?? []).filter((r) => r.kind === 'angle' && r.out === true).map((r) => r.id));
  const missing = [];
  for (const p of LIST25) {
    if (!old.A.POSES[p] || !cur.A.POSES[p]) { missing.push(p); continue; }
    const intent = measure(old, p);
    const angCur = compare(intent, measure(cur, p));
    const angBase = compare(intent, measure(base, p));
    const exc = EXCEPTIONS[p] ?? null;
    const vec = {};
    for (const k of VECS) {
      const within = angCur[k] <= TOL;
      let excOk = null;
      if (!within && exc && exc.vectors.includes(k)) {
        excOk = exc.basis === 'E2'
          ? (restoreOnly != null && exc.rows.length > 0 && exc.rows.every((r) => roOut.has(r)))
          : (typeof exc.url === 'string' && /^https?:\/\//.test(exc.url));
      }
      vec[k] = { cur: angCur[k], base: angBase[k], within, exception: excOk };
    }
    const ok = Object.values(vec).every((x) => x.within || x.exception === true);
    report.poses.push({ pose: p, ok, vec, exception: exc });
  }

  // ── 另兩條直接量（讀 D0 腳本 JSON）──
  const d0 = JSON.parse(readFileSync(args.d0Json, 'utf8'));
  const span = d0.frames['bump-contact'].m.wristSpan;
  const shline = d0.frames['spike-wind'].m.shLine;
  report.checks = { d0Json: args.d0Json, bumpContactSpan: span, spikeWindShLine: shline };

  report.pass.sanity = report.sanity.every((s) => s.ok) && Math.max(...Object.values(sensAng)) > TOL;
  report.pass.poses = missing.length === 0 && report.poses.every((p) => p.ok);
  report.pass.span = span <= 0.2;
  report.pass.shline = shline < 180;
  report.pass.all = Object.values(report.pass).every(Boolean);
  report.missing = missing;

  // ── 輸出 ──
  const f = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));
  console.log(`[E1] 健全性（意圖 vs 基準 ${BASE}，門檻 ${SANITY_TOL}°）：`);
  for (const s of report.sanity) console.log(`  ${s.ok ? 'OK  ' : 'FAIL'} ${s.pose.padEnd(12)} 最大 ${f(s.worst)}°`);
  console.log(`  反向（z/pelvisY 非零、未還原）最大偏離 ${f(Math.max(...Object.values(sensAng)))}°（須 > ${TOL}°）`);
  console.log(`[E1] 25 姿勢（現況 vs 意圖；括號＝基準 ${BASE} vs 意圖）：`);
  for (const p of report.poses) {
    const cells = VECS.map((k) => {
      const x = p.vec[k];
      const flag = x.within ? '' : x.exception === true ? '*' : '!';
      return `${k}=${f(x.cur)}${flag}(${f(x.base)})`;
    });
    console.log(`  ${p.ok ? 'OK  ' : 'FAIL'} ${p.pose.padEnd(15)} ${cells.join(' ')}`);
  }
  if (missing.length) console.log(`  缺姿勢：${missing.join(', ')}`);
  console.log(`[E1] bump.contact.span=${span.toFixed(4)} m（≤0.20）${report.pass.span ? 'OK' : 'FAIL'}；spike.wind.shline=${shline.toFixed(2)}°（<180）${report.pass.shline ? 'OK' : 'FAIL'}`);
  console.log(`[E1] 例外成立＝*、超出且無例外＝!。總判定：${report.pass.all ? 'PASS' : 'FAIL'}`);
  if (args.out) writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.pass.all ? 0 : 1);
}

main();
