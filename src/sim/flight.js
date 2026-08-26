// 彈道工具（純函式）— 給定起點/目標解出擊球初速；落點預測直接複用 stepBall 物理
import { BALL, COURT, SIM_DT } from './constants.js';
import { stepBall } from './ball.js';

const G = -BALL.GRAVITY; // 正值重力

// 以「弧頂高度」解速度：適合發球/墊球/舉球等拋物線球路
// apexY 必須高於起點與目標，否則自動抬升到可解的最低弧頂
export function velocityForApex(from, to, apexY) {
  const minApex = Math.max(from.y, to.y) + 0.15;
  const apex = Math.max(apexY, minApex);

  const vy = Math.sqrt(2 * G * (apex - from.y));
  const tUp = vy / G;
  const tDown = Math.sqrt((2 * (apex - to.y)) / G);
  const T = tUp + tDown;

  return {
    vx: (to.x - from.x) / T,
    vy,
    vz: (to.z - from.z) / T,
    time: T,
  };
}

// 以「飛行時間」解速度：適合扣球等快速平直球路（vy 含重力補償）
export function velocityForTime(from, to, T) {
  return {
    vx: (to.x - from.x) / T,
    vy: (to.y - from.y) / T + 0.5 * G * T,
    vz: (to.z - from.z) / T,
    time: T,
  };
}

// 扣球球路：速度標量 → 初速向量；跨網時帶「網口通過高度目標」——
// clearance＝這一球要以多高（球心）通過網面：自然彈道低於目標時拉長飛行時間
// 讓球帶弧越網（真實 pipe/吊球本來就是弧線）；自然彈道已高於目標（高手點貼網
// 直線）→ T 不變、速度不受影響（目標是下限語意，壓不下去是幾何事實）。
// §十-4 彈道自由度：clearance 由攻擊型態×出手品質決定（game.js spikeClearanceFor），
// 未傳＝沿用歷史常數（探針/舊呼叫相容）。
// AI 的過網預判與 sim 的實際擊球共用此函式（單一公式來源，不得各自手刻）
const NET_CLEARANCE = COURT.NET_HEIGHT + BALL.RADIUS + 0.12; // 預設網口通過高度
// timeMul（批 4c 覆審修 2）：飛行時間拉伸倍率，**在所有下限（d/speed、minTime、
// 過網淨空解）都取完之後**才乘上去——語意是「這一球整體變慢、弧變高、落點不變」。
// 折在 speed 上的舊做法會被過網淨空下限吞掉（近網/軟角度 T 由淨空解主導，speed
// 折了 T 不動＝零效果，覆審實測 61% 落點逐值無效）；折在 T 上則任何落點都有效。
// 預設 1＝逐值同原式（AI 預判、既有呼叫端零改動）。
export function spikeVelocity(from, to, speed, minTime, clearance = NET_CLEARANCE, timeMul = 1) {
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  let T = Math.max(d / speed, minTime);
  if ((from.z > 0) !== (to.z > 0)) {
    const f = from.z / (from.z - to.z); // 網面（z=0）落在全程的比例位置
    const need = clearance - from.y - f * (to.y - from.y);
    const denom = 0.5 * G * f * (1 - f);
    if (need > 0 && denom > 1e-9) T = Math.max(T, Math.sqrt(need / denom));
  }
  return velocityForTime(from, to, T * timeMul);
}

// 該球路通過網面（z=0）時的高度；不會過網（vz 同向或為零）回傳 null
export function heightAtNet(from, v) {
  if (v.vz === 0) return null;
  const t = -from.z / v.vz;
  if (!(t > 0)) return null;
  return from.y + v.vy * t + 0.5 * BALL.GRAVITY * t * t;
}

// 落點預測：複製球體、用同一套 stepBall 物理步進到首次觸地
// 回傳 { x, z, ticks } 或 null（超過上限，理論上不會發生）
export function predictLanding(ball, maxTicks = 900) {
  const b = { ...ball };
  for (let i = 1; i <= maxTicks; i += 1) {
    const prevY = b.y;
    stepBall(b, SIM_DT);
    if (prevY > BALL.RADIUS + 1e-9 && b.y <= BALL.RADIUS + 1e-9) {
      return { x: b.x, z: b.z, ticks: i };
    }
  }
  return null;
}

// 過網點預測：球從**現在**起飛到網面（z=0）時的水平位置、高度與剩餘 tick。
//
// ★ 為什麼要有這一支（2026-08-11 慢速彈道校正卷）★
// 攔網的結算完全發生在網面上：`game.js stepRally` 判過網用的是「z 正負翻越」、
// `tryBlock` 取的是**過網那一 tick 的 `b.x`／`b.y`**。而攔網手的時鐘與瞄準原本
// 都錨在 `predictContactPoint`（攻擊手會在哪裡、第幾 tick 擊到球）——那是**擊球點**，
// 不是過網點。兩者只在「擊球→過網」很短（典型扣球實測 p50 8 tick）時才近似相等；
// 球慢（中路搶救式出手，實測 p50 15、p95 32 tick）就整個對不上。
// 本函式讓「球會在第幾 tick、從哪個 x 過網」變成可算的量——**球已經被打出來之後**，
// 這是場上每個人都看得見的公開物理（與 `predictLanding`／`predictContactPoint` 同一
// 套 `stepBall`，單一公式來源，不另手刻拋物線）。
//
// ⚠ 判過網的述詞逐字抄 `stepRally`：`(prevZ > 0) !== (b.z > 0) && prevZ !== b.z`
//   ——同一件事只有一種判法，兩邊分岔就會出現「AI 以為會過、sim 說沒過」。
// 先落地（不過網）或超過上限 → null＝沒有這個量，呼叫端須回落既有行為。
export function predictNetCrossing(ball, maxTicks = 900) {
  const b = { ...ball };
  for (let i = 1; i <= maxTicks; i += 1) {
    const prevZ = b.z;
    stepBall(b, SIM_DT);
    if ((prevZ > 0) !== (b.z > 0) && prevZ !== b.z) return { x: b.x, y: b.y, ticks: i };
    if (b.y <= BALL.RADIUS + 1e-9) return null; // 先觸地＝這一球不會過網
  }
  return null;
}

// 接觸點預測（走位深度）：球下墜途中「墜到接球舒適高度 contactY」時的水平位置——
// 接球者瞄這個點才會真的站在球正下方（而非瞄地板落點、球墜落期間人被拋在後方）。
// 用同一套 stepBall 物理，找第一次「由上墜破 contactY 且正在下墜」的 tick。
// 球全程高於 contactY（如平飛快球）或已在其下 → 回退地板落點（predictLanding）。
export function predictContactPoint(ball, contactY, maxTicks = 900) {
  const b = { ...ball };
  for (let i = 1; i <= maxTicks; i += 1) {
    const prevY = b.y;
    stepBall(b, SIM_DT);
    if (b.vy < 0 && prevY > contactY && b.y <= contactY) {
      return { x: b.x, z: b.z, ticks: i };
    }
    if (b.y <= BALL.RADIUS + 1e-9) break; // 已觸地仍未墜到 contactY（低平球）
  }
  return predictLanding(ball, maxTicks);
}
