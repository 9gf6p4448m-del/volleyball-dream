// `SHOOT.left_inside` 掃描的彙整表（讀 tools/inside-cut-shoot-sweep.mjs 各臂的 JSON）
// 用法：node tools/inside-cut-shoot-sweep-report.mjs /tmp/sweep
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? '/tmp/sweep';
const ARMS = ['off', '-0.9', '-1.0', '-1.3', '-1.6', '-2.0', '-2.5'];
const OPPS = [['north-tech', 'read 隊（跟球型）'], ['obsidian', 'commit 隊（賭攔型）']];

const load = (a) => {
  const raw = readFileSync(path.join(DIR, `${a}.json`), 'utf8');
  const i = raw.indexOf('__JSON__');
  if (i < 0) throw new Error(`臂 ${a} 沒有輸出：\n${raw.slice(0, 600)}`);
  return JSON.parse(raw.slice(i + 8));
};
const f = (v, d = 1) => (v == null || Number.isNaN(v) ? '  -  ' : v.toFixed(d));
const pm = (v, se, d = 1) => `${f(v, d)}±${f(se, 2)}`;

const data = Object.fromEntries(ARMS.map((a) => [a, load(a)]));
const HW = data.off.blockHalfWidth;
const say = [];
const P = (s = '') => say.push(s);

P('═══ SHOOT.left_inside 掃描（強制二速；off 臂＝裁定 A 之前的三速對照）═══');
P(`每臂 ${data['-1.3'].sets} 局／對手，**同種子配對**（run 0..N-1 逐一對應）`);
P(`BLOCK_HALF_WIDTH（跟死快攻的中間攔網手涵蓋半寬）＝ ${HW}m`);
P('★ 強制二速＝各臂絕對值不等於出廠 35% 混合值，只能互相比較 ★');
P('');

for (const [oid, olabel] of OPPS) {
  P(`── ${olabel} ──`);
  P('  h(名目擊球點)  SHOOT   n     淨得分        罩到率        擦頂%        手身%  擦側%  實測lx  擊球高  到位誤差  二傳→擊球');
  for (const a of ARMS) {
    const d = data[a];
    const c = d.opp[oid].inside;
    const tag = a === 'off' ? 'off(三速)' : a === '-1.3' ? `${a}(現行)` : a;
    const shoot = d.shoot == null ? '  -  ' : f(d.shoot, 2);
    const out = d.h != null && Math.abs(c.lx) <= HW ? ' ❌出局' : '';
    P(`  ${tag.padEnd(13)} ${String(shoot).padStart(6)} ${String(c.n).padStart(5)}`
      + `  ${pm(c.net, c.netSE).padStart(12)}  ${pm(c.cov, c.covSE).padStart(12)}`
      + `  ${pm(c.top, c.topSE).padStart(11)}  ${f(c.body).padStart(5)}  ${f(c.side).padStart(5)}`
      + `  ${f(c.lx, 2).padStart(6)}  ${f(c.ballY, 2)}  ${f(c.dist, 2).padStart(6)}    ${f(c.react, 0).padStart(3)}${out}`);
  }
  // 直線對照（同一臂裡的 left，用來確認對照組沒有跟著漂）
  P('  ·對照（同臂的直線 left，幾何完全沒動——它若跟著動就代表是抽樣漂移不是旋鈕效果）：');
  for (const a of ARMS) {
    const c = data[a].opp[oid].line;
    P(`     ${(a === 'off' ? 'off' : a).padEnd(6)} n=${String(c.n).padStart(5)}  淨得分=${pm(c.net, c.netSE)}  罩到率=${pm(c.cov, c.covSE)}  擦頂=${f(c.top)}%`);
  }
  P('');
}

// 對照 off 臂的差值（主判準）
P('── 相對 off（三速內切＝要救回的目標線）的差距，正值＝比目標線好 ──');
for (const [oid, olabel] of OPPS) {
  const base = data.off.opp[oid].inside;
  const parts = ARMS.filter((a) => a !== 'off').map((a) => {
    const c = data[a].opp[oid].inside;
    const d = c.net - base.net;
    const se = Math.sqrt(c.netSE ** 2 + base.netSE ** 2);
    return `${a}: ${d >= 0 ? '+' : ''}${f(d)}pp(z=${f(Math.abs(d) / se, 1)})`;
  });
  P(`  ${olabel}　off 基準 ${f(base.net)}pp｜${parts.join('　')}`);
}
P('');
P('── 擦頂率隨旋鈕的變化（上一輪指認的因果鏈；不動＝這個旋鈕不是那條鏈上的把手）──');
for (const [oid, olabel] of OPPS) {
  const parts = ARMS.map((a) => `${a === 'off' ? 'off' : a}:${f(data[a].opp[oid].inside.top)}%`);
  P(`  ${olabel}　${parts.join('　')}`);
}
console.log(say.join('\n'));
