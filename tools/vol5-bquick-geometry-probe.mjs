// 卷五 量測項 3（2026-08-02）：B 快的幾何參數空間——落點 lx 送得到哪個擊球點
//
// 待裁題 1 要定 B 快的 lx／lz／t。`setAimFor` 給的是**舉球落點**，攻擊手真正的
// **擊球點**是「球墜到扣球窗上緣時的水平位置」——兩者不是同一個數，弧越低差越大
//（`approach.js:31-38` 的既有實測：apex 4.2＋落點 −4.4 → 擊球點 −2.87、飛行 64 tick）。
// A 快那條弧（t=0.4 ⇒ QUICK_APEX 3.4）沒有同款換算表，本探針把它補上。
//
// 取得路徑＝**真實函式**：呼叫 sim 自己的 `velocityForApex` 產生舉球初速、
// 再用 sim 自己的 `predictContactPoint` 找擊球點。不重抄任何一條彈道公式。
//
// ⚠ 這支不跑整局：彈道是純物理，與比賽狀態無關，餵一顆球給真實函式即可。
//   這是**重建的模型**還是真實路徑？——用的是真實的物理函式與真實常數，
//   但情境是合成的（二傳站在標準位置）。結論僅用於**縮小候選範圍**，
//   最終參數落地後仍要用整局探針複驗（實作提示 2c 的三個數之一）。
//
// 用法：node tools/vol5-bquick-geometry-probe.mjs
import { TUNING } from '../src/sim/game.js';
import { velocityForApex, predictContactPoint } from '../src/sim/flight.js';
import { localToWorld } from '../src/sim/rotation.js';
import { BALL } from '../src/sim/constants.js';

// 二傳站位（隊伍視角）：舉球發生在網前 2 號位附近。取 setAimFor 的參考系原點側。
// lz 用快攻落點的同一深度帶，lx=0＝二傳正前方。
const SETTER_LOCAL = { lx: 0.6, lz: 1.6, y: 2.1 }; // y≈舉球手點高度
const CONTACT_Y = 2.6; // 扣球窗上緣（攻擊手擊球高度帶）——只用來定義「擊球點」

const TEAM = 'A';
const from = (() => {
  const w = localToWorld(TEAM, SETTER_LOCAL.lx, SETTER_LOCAL.lz);
  return { x: w.x, y: SETTER_LOCAL.y, z: w.z };
})();

function hitPointFor(aimLx, aimLz, apex) {
  const w = localToWorld(TEAM, aimLx, aimLz);
  const v = velocityForApex(from, { x: w.x, y: BALL.RADIUS, z: w.z }, apex);
  const ball = { x: from.x, y: from.y, z: from.z, vx: v.vx, vy: v.vy, vz: v.vz };
  ball.px = ball.x; ball.py = ball.y; ball.pz = ball.z;
  const cp = predictContactPoint(ball, CONTACT_Y);
  if (!cp) return null;
  // 世界座標換回隊伍視角的 lx（localToWorld 的逆：A 隊 lx 與世界 x 同向）
  const originW = localToWorld(TEAM, 0, aimLz);
  const unitW = localToWorld(TEAM, 1, aimLz);
  const ux = unitW.x - originW.x;
  const uz = unitW.z - originW.z;
  const lx = ((cp.x - originW.x) * ux + (cp.z - originW.z) * uz) / (ux * ux + uz * uz);
  return { lx, ticks: cp.ticks };
}

console.log('=== 卷五 量測項 3：B 快的落點 → 擊球點換算（真實 velocityForApex + predictContactPoint）===\n');
console.log(`二傳站位（隊伍視角）lx ${SETTER_LOCAL.lx} lz ${SETTER_LOCAL.lz} y ${SETTER_LOCAL.y}`);
console.log(`擊球窗上緣 contactY = ${CONTACT_Y} m\n`);

const ARCS = [
  { name: 'A 快弧（t<0.5）', apex: TUNING.QUICK_APEX, t: 0.4 },
  { name: '二速弧（0.5≤t<0.65）', apex: TUNING.SHOOT_APEX, t: 0.55 },
  { name: '高球弧（t≥0.65）', apex: TUNING.SET_APEX, t: 0.75 },
];

for (const arc of ARCS) {
  console.log(`-- ${arc.name}　apex ${arc.apex} m --`);
  console.log('落點lx   擊球點lx   飛行tick   擊球點/落點');
  for (const aimLx of [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 4.4]) {
    const r = hitPointFor(aimLx, 1.0, arc.apex);
    if (!r) { console.log(`${String(aimLx).padStart(5)}      （墜不到 contactY）`); continue; }
    const ratio = aimLx === 0 ? null : r.lx / aimLx;
    console.log(`${String(aimLx).padStart(5)}   ${r.lx.toFixed(2).padStart(8)}`
      + `   ${String(r.ticks).padStart(8)}   ${ratio == null ? '   n/a' : ratio.toFixed(3).padStart(6)}`);
  }
  console.log('');
}

console.log('-- 交叉驗證：既有註解的實測值對得上嗎 --');
const check = hitPointFor(-4.4, 1.3, TUNING.SHOOT_APEX);
console.log(`approach.js:34 寫「apex 4.2＋落點 -4.4 → 擊球點 lx -2.87、飛行 64 tick」`);
console.log(`本探針同條件：擊球點 lx ${check ? check.lx.toFixed(2) : 'n/a'}`
  + `、飛行 ${check ? check.ticks : 'n/a'} tick`);
console.log('  ↑ 對不上代表本探針的合成情境（二傳站位／contactY）與當初那次試算不同一組，'
  + '\n    數字只能當**相對關係**用（比例、單調性），不得當絕對值寫進參數。');
