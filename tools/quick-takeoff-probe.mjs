// 07-29 Sawmah 試玩：「快攻看起來會先走到網子前停一下，然後才起跳」。
// §4 A1 把 MB 改成一速（二傳觸球前就跑完助跑站上起跳點）之後，中位數是對的，
// 但**尾巴很長**——有些球提前跑完，站在起跳點乾等半秒以上才到 takeoffTick。
// 本探針量的就是那條尾巴：一速 route 的「到位（停止水平移動）→ 起跳 tick」靜止長度。
//
// 用法：node tools/quick-takeoff-probe.mjs [局數，預設 40]
import { createGame, stepGame } from '../src/sim/game.js';
import { createAiState, aiCollectIntents } from '../src/sim/ai.js';

const SETS = Number(process.argv[2] ?? 40);
// 靜止判準（m/tick）：全速跑 ≈0.067m/tick；同隊避讓推擠最多 0.19m/tick。
// 5mm/tick＝0.3m/s，肉眼即「站著不動」
const STILL = 0.005;

const stallToTakeoff = [];  // 到位 → 起跳 tick 之間的靜止 tick 數（核心量化）
const stallToHit = [];      // 擊球前的連續靜止 tick 數（含滯空段，供對照）
const leadToSet = [];       // 二傳實際觸球 tick − 到位 tick（正值＝觸球前已離地）
const takeoffToHit = [];    // 起跳 tick → 實際擊球 tick（windup 動畫 45 tick 夠不夠播）
const takeoffToSet = [];    // 起跳 tick → 二傳實際觸球 tick（一速的真提前量）
const setToHit = [];        // 二傳觸球 → 擊球（快攻球飛行時間）
const setBias = [];         // 二傳觸球預估誤差＝實際 − 預估（正值＝預估偏早）
// ★核心對照：「到位後到**畫面上的起跳**之間站了幾 tick」——同一份 sim 軌跡，
// 只換觸發規則。舊＝matchLoop 的 hitPoint 倒數（ticksToHit≤24 或球近且下墜）；
// 新＝sim 自己的 route.takeoffTick
const stallOldCue = [];
const stallNewCue = [];
const TAKEOFF_LEAD_TICKS = 24; // matchLoop 的 TUNING.TAKEOFF_LOOKBACK_TICKS
let airborneBeforeSet = 0;  // 二傳觸球前已到位（＝一速定義成立）
let quickRoutes = 0;        // 一速 route 總數（有 takeoffTick 且真的走到那一 tick）

for (let seed = 1; seed <= SETS; seed += 1) {
  const g = createGame({ seed, setTarget: 25 });
  const ai = createAiState();
  const live = new Map(); // key → 追蹤中的一速 route（只保留「當前這一條助跑計畫」）
  let liveKey = null;     // 當前計畫的識別（隊伍＋預估二傳觸球 tick）
  let guard = 0;
  while (g.phase !== 'set_over' && guard < 300000) {
    guard += 1;
    const app = ai.approach;
    // 助跑計畫換人／消失（來球＝作廢）→ 未結案的追蹤直接丟棄，不得跨計畫配對
    const cur = app?.routes?.length && app.setTick != null ? `${app.team}:${app.setTick}` : null;
    if (cur !== liveKey) { live.clear(); liveKey = cur; }
    if (cur) {
      for (const r of app.routes) {
        if (r.tempo !== 'one' || r.takeoffTick == null) continue;
        const key = `${app.team}:${app.setTick}:${r.pid}`;
        const a = g.actors[r.pid];
        let e = live.get(key);
        if (!e) {
          e = {
            pid: r.pid, takeoffTick: r.takeoffTick, planSetTick: app.setTick,
            startTick: r.startTick, prev: { x: a.x, z: a.z },
            still: 0, stall: null, arriveTick: null, netArriveTick: null,
            setTick: null, counted: false,
          };
          live.set(key, e);
        } else {
          const d = Math.hypot(a.x - e.prev.x, a.z - e.prev.z);
          e.prev = { x: a.x, z: a.z };
          if (d < STILL) e.still += 1;
          else { e.still = 0; e.arriveTick = null; }
          if (e.still === 1) e.arriveTick = g.tick; // 這一段連續靜止的起點
          // 助跑起步後第一次停下＝「跑到網前站定」那一刻（之後再挪動也不重設）
          if (e.still === 1 && e.netArriveTick == null
            && e.startTick != null && g.tick > e.startTick) e.netArriveTick = g.tick;
        }
        // 起跳那一 tick 結算「到位→起跳」的靜止長度
        if (!e.counted && g.tick >= e.takeoffTick) {
          e.counted = true;
          e.stall = e.still;
          stallToTakeoff.push(e.still);
          quickRoutes += 1;
        }
        // 舊觸發規則（matchLoop 修前）：第三擊、本人 claim、hitPoint 倒數進窗
        if (!e.oldCued && g.rally.touches === 2 && ai.claimId === r.pid) {
          const toHit = ai.hitPoint?.ticks != null
            ? ai.hitPoint.ticks - (g.tick - ai.planTick) : null;
          const near = Math.hypot(g.ball.x - a.x, g.ball.z - a.z);
          if ((toHit !== null && toHit <= TAKEOFF_LEAD_TICKS)
            || (g.ball.vy < 0 && g.ball.y < 3.6 && near < 2.2)) {
            e.oldCued = true;
            if (e.netArriveTick != null) {
              stallOldCue.push(g.tick - e.netArriveTick);
              // 同一條 route 的新規則值（同樣本、同一份軌跡，只換觸發 tick）
              stallNewCue.push(Math.max(0, e.takeoffTick - e.netArriveTick));
            }
          }
        }
      }
    }
    const ev = stepGame(g, aiCollectIntents(g, ai));
    for (const e2 of ev) {
      // 二傳實際觸球：對該隊所有追蹤中的一速 route 記提前量
      if (e2.type === 'TOUCH' && e2.touches === 2) {
        for (const e of live.values()) {
          if (e.setTick != null) continue;
          e.setTick = g.tick;
          takeoffToSet.push(g.tick - e.takeoffTick);
          setBias.push(g.tick - e.planSetTick);
          if (e.arriveTick != null && e.arriveTick <= g.tick) {
            airborneBeforeSet += 1;
            leadToSet.push(g.tick - e.arriveTick);
          } else leadToSet.push(-1); // 二傳觸球時還在跑＝一速定義沒成立
        }
      }
      if (e2.type === 'TOUCH' && e2.kind === 'spike') {
        for (const e of live.values()) {
          if (e.pid !== e2.playerId || e.setTick == null) continue;
          stallToHit.push(e.still);
          takeoffToHit.push(g.tick - e.takeoffTick);
          setToHit.push(g.tick - e.setTick);
        }
      }
      if (e2.type === 'DEAD_BALL') { live.clear(); liveKey = null; }
    }
  }
}

const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const line = (name, arr) => {
  if (!arr.length) { console.log(`${name}：無樣本`); return; }
  const over = arr.filter((t) => t >= 30).length;
  console.log(`${name} n=${arr.length}：p50=${q(arr, 0.5)}  p90=${q(arr, 0.9)}  max=${Math.max(...arr)} tick`
    + `　>0.5s(30t) 佔 ${((over / arr.length) * 100).toFixed(1)}%`);
};

console.log(`── 一速（MB 快攻）起跳時機　${SETS} 局 ──`);
line('① 到位→起跳的靜止 tick（核心）', stallToTakeoff);
line('② 擊球前連續靜止 tick（含滯空）', stallToHit);
console.log(`③ 二傳觸球前已到位（一速定義）：${quickRoutes ? ((airborneBeforeSet / leadToSet.length) * 100).toFixed(1) : 'n/a'}%`
  + `（n=${leadToSet.length}）　提前量 p50=${q(leadToSet.filter((v) => v >= 0), 0.5)} tick`);
line('④ 起跳→實際擊球 tick（windup 45t 可播窗）', takeoffToHit);
line('⑤ 起跳→二傳實際觸球（一速真提前量）', takeoffToSet);
line('⑥ 二傳觸球→擊球（快攻球飛行時間）', setToHit);
line('⑦ 二傳觸球 tick 預估誤差（實際−預估）', setBias);
console.log('');
console.log('── ★到位後到「畫面上的起跳」之間的靜止 tick（同一份 sim 軌跡，只換觸發規則）──');
line('　舊：hitPoint 倒數（ticksToHit≤24）', stallOldCue);
line('　新：sim 的 route.takeoffTick    ', stallNewCue);
