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
const ARMS = ['rUpperArm', 'lUpperArm', 'rForearm', 'lForearm'];
const ZH = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5548173/';
const KOACH = 'https://www.koachvolleyball.com/guides/overhead-setting-the-setter-s-technique';
const IYV_SPIKE = 'https://www.improveyourvolley.com/spiking-in-volleyball.html';
export const EXCEPTIONS = {
  bumpReady: { vectors: ARMS, rows: ['bump.start.head', 'bump.start.uarm', 'bump.start.elbow'],
    note: '還原後起始幀肘全直 180°（文獻 158.8±11.6）、上臂 25.8°（9.1±10）；校準為肘彎 −0.36、保留胸椎前傾不補償' },
  setReach: { vectors: ARMS, rows: ['set.load.elflex'], url: KOACH,
    note: '還原後雙腕相距 0.748 m（肘屈到 100° 仍 0.60 m），違反教學描述「hands a few centimeters apart、拇指食指成三角、在額頭上方」；保留雙手靠攏（0.297 m）並把肘屈校準到 100°' },
  setPush: { vectors: ARMS, rows: ['set.push.elflex.fast'], url: KOACH,
    note: '同上；還原後出手雙腕相距 0.748 m，保留靠攏（0.152 m），肘屈校準到 40°（fast／seven 型）' },
  spikeWind: { vectors: [...ARMS, 'shoulderLine', 'hipLine'], rows: ['spike.wind.shline', 'spike.wind.sep'],
    note: '還原後轉體方向已正確但幅度不足（肩線 162.2°、分離 2.9°）；依 Zahálka 加大到肩線 105、髖線 157——胸椎轉動帶著雙臂一起轉，世界方向因此偏離' },
  spikeUnlock: { vectors: [...ARMS, 'shoulderLine', 'hipLine'], url: ZH,
    note: 'Zahálka 2017 肩線角自最大後擺 105° 單調增加到擊球 137°；還原值（胸 −0.16）在校準後的引臂（肩線 107.6°）與擊球（136.8°）之間會先超轉到 167.5° 再轉回 136.8°；改為兩者之間（胸 −0.72，肩線 116.1°）' },
  spikeHit: { vectors: [...ARMS, 'shoulderLine', 'hipLine'],
    rows: ['spike.hit.abd', 'spike.hit.elflex', 'spike.hit.hadd', 'spike.hit.shline', 'spike.hit.hipline', 'spike.hit.sep'],
    note: '擊球臂改側上方、肘彎 34°（Reeser 2010）；轉體照 Zahálka；非擊球臂 z 已還原，世界方向偏離來自軀幹轉動與側傾' },
  spikeFollow: { vectors: ['rUpperArm', 'rForearm'], url: IYV_SPIKE,
    note: '還原會讓擊球臂收勢往外張；教學描述「spiking arm coming down across your body」，且原註解本意即「跨體收回往左髖」——保留現況跨體（非擊球臂、骨盆已還原 0.00°）' },
  floatPush: { vectors: ['rUpperArm', 'rForearm'], rows: ['servefloat.hit.abd', 'servefloat.hit.elflex', 'servefloat.hit.hadd'],
    note: '擊球臂改側上方、肘彎 50°（Reeser 2010 飄球）；非擊球臂已還原（3.40°）' },
};

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
        // 依據至少一項成立：列號在純還原版 D0 JSON 中確實超出，或附有來源 URL 的教學描述
        const rowsOk = restoreOnly != null && (exc.rows ?? []).length > 0 && exc.rows.every((r) => roOut.has(r));
        const urlOk = typeof exc.url === 'string' && /^https?:\/\//.test(exc.url);
        excOk = rowsOk || urlOk;
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
  // 例外逐條：還原後量值（純還原版 D0）／現況量值（--d0-json）／依據
  const rowVal = (json, id) => json?.rows?.find((r) => r.id === id);
  const d0Now = JSON.parse(readFileSync(args.d0Json, 'utf8'));
  report.exceptionDetail = [];
  for (const p of report.poses) {
    if (!p.exception) continue;
    const rows = (p.exception.rows ?? []).map((id) => {
      const ro = rowVal(restoreOnly, id); const now = rowVal(d0Now, id);
      return { id, lit: now?.lit?.mean, tol: now?.tol, restored: ro?.current, restoredOut: ro?.out, now: now?.current, nowOut: now?.out };
    });
    report.exceptionDetail.push({ pose: p.pose, vectors: p.exception.vectors, rows, url: p.exception.url ?? null, note: p.exception.note });
    console.log(`  例外 ${p.pose}：${p.exception.note}`);
    for (const r of rows) console.log(`    ${r.id}：還原後 ${r.restored}（${r.restoredOut ? '超出' : '範圍內'}）→ 現況 ${r.now}（${r.nowOut ? '超出' : '範圍內'}）；文獻 ${r.lit}±${r.tol}`);
    if (p.exception.url) console.log(`    來源：${p.exception.url}`);
  }
  console.log(`[E1] bump.contact.span=${span.toFixed(4)} m（≤0.20）${report.pass.span ? 'OK' : 'FAIL'}；spike.wind.shline=${shline.toFixed(2)}°（<180）${report.pass.shline ? 'OK' : 'FAIL'}`);
  console.log(`[E1] 例外成立＝*、超出且無例外＝!。總判定：${report.pass.all ? 'PASS' : 'FAIL'}`);
  if (args.out) writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.pass.all ? 0 : 1);
}

main();
