// 夾塞診斷 彙整：讀 tools/tandem-block-probe.mjs 的輸出，算跨臂 Δ 與 SE，
// 並把「BLOCK_REACH_X 到底在比什麼」攤開（過網 x vs 擊球 x）。零 `src/` 改動、純讀檔。
//
// 用法：node tools/tandem-diag-analyze.mjs <run1 目錄>
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2];
if (!DIR) throw new Error('用法：node tools/tandem-diag-analyze.mjs <目錄>');
const ARMS = ['base', 'h1', 'h2', 'h1h2'];
const TAG = fs.readdirSync(DIR).find((f) => f.endsWith('-base-600.json')).split('-')[0];

const load = (arm) => JSON.parse(fs.readFileSync(path.join(DIR, `${TAG}-${arm}-600.json`), 'utf8'));
const loadRows = (arm) => JSON.parse(fs.readFileSync(path.join(DIR, `${TAG}-${arm}-600-rows.json`), 'utf8'));

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const seM = (a) => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) / a.length);
};
const f = (v, d = 2) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));
// 兩個獨立比例的差與合成 SE
const dSE = (se1, se2) => Math.sqrt(se1 * se1 + se2 * se2);

const S = Object.fromEntries(ARMS.map((a) => [a, load(a)]));

console.log('=== ① 反事實三臂 vs base：夾塞（每臂 600 局、同一組 seed，但幾何一改軌跡即發散 ⇒ 不配對）===');
console.log('臂     n夾塞 | 被攔死%±SE | Δ vs base ±SE   | 判讀      | 得分%±SE  | Δ得分±SE       | 淨得分% | Δ淨得分  | 觸手% | 進帶%');
const b = S.base.byCombo.tandem;
for (const arm of ARMS) {
  const o = S[arm].byCombo.tandem.outcome;
  const dBk = o.bkPct - b.outcome.bkPct;
  const dBkSE = dSE(o.bkSE, b.outcome.bkSE);
  const dK = o.killPct - b.outcome.killPct;
  const dKSE = dSE(o.killSE, b.outcome.killSE);
  const verdict = arm === 'base' ? '（基準）'
    : (Math.abs(dBk) > 2 * dBkSE ? `降 ${f(-dBk, 1)}pp（>2SE）` : '分不出（<2SE）');
  console.log(`${arm.padEnd(6)} ${String(o.n).padStart(5)} | ${f(o.bkPct).padStart(5)}±${f(o.bkSE).padStart(4)} |`
    + ` ${f(dBk).padStart(6)}±${f(dBkSE).padStart(4)} | ${verdict.padEnd(16)} |`
    + ` ${f(o.killPct).padStart(5)}±${f(o.killSE).padStart(4)} |`
    + ` ${f(dK).padStart(6)}±${f(dKSE).padStart(4)} |`
    + ` ${f(o.netPct).padStart(6)} | ${f(o.netPct - b.outcome.netPct).padStart(7)} |`
    + ` ${f(o.touchPct).padStart(5)} | ${f(o.inBandPct).padStart(5)}`);
}
console.log('\n對照：同一臂裡的「無組合 right 線」（＝夾塞的同一名 OPP 沒跑戰術時）');
console.log('臂     n right | 被攔死%±SE | 得分%±SE  | 淨得分% | 觸手% | 進帶%');
for (const arm of ARMS) {
  const o = S[arm].noneRight.outcome;
  console.log(`${arm.padEnd(6)} ${String(o.n).padStart(6)} | ${f(o.bkPct).padStart(5)}±${f(o.bkSE).padStart(4)} |`
    + ` ${f(o.killPct).padStart(5)}±${f(o.killSE).padStart(4)} | ${f(o.netPct).padStart(6)} |`
    + ` ${f(o.touchPct).padStart(5)} | ${f(o.inBandPct).padStart(5)}`);
}

console.log('\n=== ② 飛行時間（假說 2 的直接量）===');
console.log('臂     | 夾塞擊球lz mean±SE | 夾塞擊球→過網 mean±SE | Δ vs base ±SE | right線擊球→過網 mean±SE');
for (const arm of ARMS) {
  const g = S[arm].byCombo.tandem.geom;
  const r = S[arm].byKind.right.geom;
  const d = g.flightMean - S.base.byCombo.tandem.geom.flightMean;
  const dse = dSE(g.flightSE, S.base.byCombo.tandem.geom.flightSE);
  console.log(`${arm.padEnd(6)} | ${f(g.hitLzMean, 3)}±${f(g.hitLzSE, 3)} |`
    + ` ${f(g.flightMean).padStart(7)}±${f(g.flightSE)} | ${f(d).padStart(6)}±${f(dse)} |`
    + ` ${f(r.flightMean).padStart(7)}±${f(r.flightSE)}`);
}

// ── ③ BLOCK_REACH_X 到底在比什麼：過網 x vs 擊球 x ──
console.log('\n=== ③ 幾何錯位：判準比的是「擊球點距離」，閘門比的是「過網 x 距離」===');
console.log('臂/組別          n | |擊球x| p50/mean | |過網x| p50/mean | |擊球x−過網x| p50 | 牆首人x p50 | dx=|過網x−手x| p50');
function crossTable(rows, label) {
  const hx = rows.filter((r) => r.hit).map((r) => Math.abs(r.hit.x));
  const nx = rows.filter((r) => r.blk).map((r) => Math.abs(r.blk.ballX));
  const shift = rows.filter((r) => r.hit && r.blk).map((r) => Math.abs(Math.abs(r.hit.x) - Math.abs(r.blk.ballX)));
  const wx = rows.filter((r) => r.blk && r.blk.wall.length).map((r) => Math.abs(r.blk.wall[0].x));
  const dx = rows.filter((r) => r.blk && r.blk.bestDx != null).map((r) => r.blk.bestDx);
  console.log(`${label.padEnd(16)} ${String(rows.length).padStart(5)} |`
    + ` ${f(q(hx, 0.5), 3)}/${f(mean(hx), 3)} | ${f(q(nx, 0.5), 3)}/${f(mean(nx), 3)} |`
    + ` ${f(q(shift, 0.5), 3).padStart(14)} | ${f(q(wx, 0.5), 3).padStart(10)} | ${f(q(dx, 0.5), 3).padStart(16)}`);
}
for (const arm of ARMS) {
  const rows = loadRows(arm);
  crossTable(rows.filter((r) => r.combo === 'tandem'), `${arm}/夾塞`);
  if (arm === 'base') crossTable(rows.filter((r) => r.combo === 'none' && r.kind === 'right'), 'base/無組right');
}

// ── ④ 攔死者的「站在哪」──
console.log('\n=== ④ 攔死夾塞的那名攔網手（base 臂）===');
{
  const rows = loadRows('base').filter((r) => r.combo === 'tandem' && r.out === 'blockKill' && r.blk?.bestId);
  const dxq = []; const dxHit = []; const dxNet = []; const airs = []; const wallN = [];
  const roles = {};
  for (const r of rows) {
    const m = r.blk.wall.find((w) => w.id === r.blk.bestId);
    if (!m) continue;
    if (r.quickAtHit) dxq.push(Math.abs(m.x - r.quickAtHit.x));
    if (r.hit) dxHit.push(Math.abs(m.x - r.hit.x));
    dxNet.push(Math.abs(m.x - r.blk.ballX));
    airs.push(r.blk.tick - m.start);
    wallN.push(r.blk.wall.length);
    roles[m.id] = (roles[m.id] ?? 0) + 1;
  }
  console.log(`攔死 n=${rows.length}`);
  console.log(`  |手x − 快攻手x|（擊球那刻）  p50 ${f(q(dxq, 0.5), 3)}  mean ${f(mean(dxq), 3)}±${f(seM(dxq), 3)}`);
  console.log(`  |手x − 夾塞擊球x|            p50 ${f(q(dxHit, 0.5), 3)}  mean ${f(mean(dxHit), 3)}±${f(seM(dxHit), 3)}`);
  console.log(`  |手x − 球過網x|（＝閘門 dx） p50 ${f(q(dxNet, 0.5), 3)}  mean ${f(mean(dxNet), 3)}±${f(seM(dxNet), 3)}`);
  console.log(`  ≤ BLOCK_REACH_X 0.5 的比例   ${f((dxNet.filter((v) => v <= 0.5).length / dxNet.length) * 100)}%`);
  console.log(`  接觸時距離自己起跳           p50 ${q(airs, 0.5)} tick（AIR_TICKS=24 ⇒ 已落地者佔 ${f((airs.filter((v) => v > 24).length / airs.length) * 100)}%）`);
  console.log(`  牆上人數                     p50 ${q(wallN, 0.5)} mean ${f(mean(wallN), 2)}`);
  console.log(`  攔死者身分分佈（pid→次數）   ${JSON.stringify(roles)}`);
}

// ── ⑤ 藍圖「條件 5」如果照字面加上去會怎樣 ──
const ap = await import('../src/sim/approach.js');
const bb = await import('../src/sim/blockBand.js');
const geo = ap.crossGeometryOf('A', 'tandem', 'quick');
console.log('\n=== ⑤ 把交叉的「條件 5 搆不到」原封不動套到夾塞上（純幾何試算，不需實跑）===');
console.log(`  crossGeometryOf('A','tandem','quick').gap = ${geo.gap.toFixed(4)} m`);
console.log(`  BLOCK_HALF_WIDTH (= TUNING.BLOCK_REACH_X) = ${bb.BLOCK_HALF_WIDTH}`);
console.log(`  ⇒ outOfReach = ${geo.outOfReach}  ★ 恆真：這條判準比的是兩個起跳點的**三維距離**，`);
console.log('     夾塞的 Δlz 就有 1.0m，光深度差本身就把 gap 撐過 0.5 ⇒ 加上去也擋不掉任何一球。');
console.log(`  同一組數字的橫向分量 |Δlx| = ${Math.abs(0.3 - 0).toFixed(4)} m ＜ 0.5 ⇒ 橫向其實搆得到。`);
