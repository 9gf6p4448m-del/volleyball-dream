// 07-28 試玩兩問：①生涯配置（含自由人）下 S 到底接不接殺球/救球
// ②「一氣呵成助跑」（07-23 拍板）實際效果——攻擊手到位後還要站著等多久才擊球
// 用法：node tools/attack-flow-probe.mjs
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';
import { isBackRow } from '../src/sim/rotation.js';

const ARRIVE_GAP = 0.6; // 視為「已到球下」的水平距離（m）
// 引臂起跳的觸發條件：`node tools/attack-flow-probe.mjs old` 跑 07-28 追修前的版本做對比
const OLD_RULE = process.argv[2] === 'old';

// ③ windup（引臂起跳，序列 0.75s）觸發時機：matchLoop 的條件在 sim 值上重現
const windupLead = { front: [], back: [] };
let noWindup = { front: 0, back: 0 };

const nearAt = []; // windup 觸發當下，攻擊手離球的水平距離（判斷會不會浮空滑行）
const recv = { serve: {}, spike: {}, rescue: {} };
const waits = { front: [], back: [] };
let totals = { serve: 0, spike: 0, rescue: 0 };

for (let seed = 1; seed <= 40; seed += 1) {
  // 註：不開自由人（liberos 需完整 Player 物件，走生涯建隊通道才有）。
  // 生涯場有 L 吃後排防守，S 的接球比例只會比這裡更低——本探針是「上限」
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  let atk = null; // { pid, arrivedTick, back }
  let windupAt = {}; // pid → 起手 tick（每 flight 重置）
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    if (g.rally.flightId !== (windupAt.__f ?? -1)) windupAt = { __f: g.rally.flightId };
    const profile = g.rally.profile;
    const touches = g.rally.touches;
    const possession = g.rally.possession;
    // 攻擊手到位時刻：第三擊、選定攻擊手、已在球的水平位置附近
    if (touches === 2 && ai.attackerId && ai.landing) {
      const a = g.actors[ai.attackerId];
      const gap = Math.hypot(ai.landing.x - a.x, ai.landing.z - a.z);
      if (gap <= ARRIVE_GAP && (!atk || atk.pid !== ai.attackerId)) {
        atk = {
          pid: ai.attackerId,
          arrivedTick: g.tick,
          back: isBackRow(g.match.rotations[g.players[ai.attackerId].teamId], ai.attackerId),
        };
      }
    }
    // windup 條件（matchLoop:1368）——與「是否已到球下」無關，獨立追蹤
    if (touches === 2 && ai.claimId && windupAt[ai.claimId] === undefined) {
      const a = g.actors[ai.claimId];
      const b = g.ball;
      const ticksToHit = ai.hitPoint?.ticks != null ? ai.hitPoint.ticks - (g.tick - ai.planTick) : null;
      const near = Math.hypot(b.x - a.x, b.z - a.z);
      // 起跳（離地）觸發：新版對齊 sim 的 TAKEOFF_LOOKBACK_TICKS(24)；old＝追修前
      const hit = OLD_RULE
        ? (b.vy < 0 && b.y < 3.6 && near < 2.2)
        : ((ticksToHit !== null && ticksToHit <= 24)
          || (b.vy < 0 && b.y < 3.6 && near < 2.2));
      if (hit) { windupAt[ai.claimId] = g.tick; nearAt.push(near); }
    }
    const ev = stepGame(g, aiCollectIntents(g, ai));
    for (const e of ev) {
      // 擊球：從「到位」到「出手」之間站了幾 tick
      if (e.type === 'TOUCH' && e.kind === 'spike' && atk && e.playerId === atk.pid) {
        (atk.back ? waits.back : waits.front).push(g.tick - atk.arrivedTick);
        const key = atk.back ? 'back' : 'front';
        const wt = windupAt[atk.pid];
        if (wt === undefined) noWindup[key] += 1;
        else windupLead[key].push(g.tick - wt);
        atk = null;
      }
      if (e.type === 'DEAD_BALL') atk = null;
      // 第一觸歸屬：接發／接殺／救自家噴球
      if (e.type === 'TOUCH' && e.touches === 1) {
        const role = g.players[e.playerId].currentRole;
        const bucket = profile === 'serve' ? 'serve' : profile === 'spike' ? 'spike' : null;
        if (bucket) { recv[bucket][role] = (recv[bucket][role] ?? 0) + 1; totals[bucket] += 1; }
      }
      // 救球（我方持球中的亂飛球被再次觸到）＝補 touch
      if (e.type === 'TOUCH' && e.touches >= 2 && e.kind === 'dive') {
        const role = g.players[e.playerId].currentRole;
        recv.rescue[role] = (recv.rescue[role] ?? 0) + 1; totals.rescue += 1;
      }
    }
  }
}

const pct = (o, t) => Object.entries(o).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${((v / t) * 100).toFixed(1)}%`).join('  ');
const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const ms = (t) => `${t} tick（${(t / 60).toFixed(2)}s）`;

console.log('── ① 誰接球（生涯配置：含自由人）──');
console.log(`接發球 n=${totals.serve}：`, pct(recv.serve, totals.serve));
console.log(`接殺球 n=${totals.spike}：`, pct(recv.spike, totals.spike));
console.log(`救球/補 touch n=${totals.rescue}：`, pct(recv.rescue, totals.rescue));

console.log('\n── ② 攻擊手「到球下之後還站多久才擊球」──');
for (const [k, arr] of [['前排', waits.front], ['後排(pipe)', waits.back]]) {
  if (!arr.length) { console.log(`${k}：無樣本`); continue; }
  console.log(`${k} n=${arr.length}：p50=${ms(q(arr, 0.5))}  p90=${ms(q(arr, 0.9))}  max=${ms(Math.max(...arr))}`);
  const stall = arr.filter((t) => t >= 30).length;
  console.log(`   站超過 0.5 秒的比例：${((stall / arr.length) * 100).toFixed(1)}%`);
}

console.log('');
console.log('-- 3 windup 引臂起跳（動畫 0.75s＝45 tick）能播多久 --');
for (const [k, arr] of [['前排', windupLead.front], ['後排(pipe)', windupLead.back]]) {
  const miss = noWindup[k === '前排' ? 'front' : 'back'];
  if (!arr.length) { console.log(k + '：無樣本（完全沒觸發 ' + miss + ' 次）'); continue; }
  const p50 = q(arr, 0.5);
  console.log(k + ' n=' + arr.length + '（完全沒觸發 ' + miss + ' 次）：觸發→擊球 p50=' + p50 + ' tick（' + (p50 / 60).toFixed(2) + 's）  p90=' + q(arr, 0.9) + ' tick');
  console.log('   播不完 0.75s 動畫的比例：' + ((arr.filter((t) => t < 45).length / arr.length) * 100).toFixed(1) + '%');
}

console.log('');
console.log('-- 4 **離地起跳**當下離球距離＝空中前飄（真人前排 0.3-0.5m、後排更大）--');
console.log('n=' + nearAt.length + '：p50=' + q(nearAt, 0.5).toFixed(2) + 'm  p90=' + q(nearAt, 0.9).toFixed(2) + 'm  max=' + Math.max(...nearAt).toFixed(2) + 'm');
console.log('   超過 3m 的比例：' + ((nearAt.filter((d) => d > 3).length / nearAt.length) * 100).toFixed(1) + '%');
