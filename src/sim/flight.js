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

// 扣球球路：速度標量 → 初速向量；跨網時帶「網口淨空約束」——
// 直線彈道從攻擊線後（pipe/D 球）或近網輕吊都過不了網，需要時自動拉長
// 飛行時間讓球帶弧越網（真實 pipe/吊球本來就是弧線）。前排全力扣的直線
// 本就淨空 → T 不變、速度不受影響。
// AI 的過網預判與 sim 的實際擊球共用此函式（單一公式來源，不得各自手刻）
const NET_CLEARANCE = COURT.NET_HEIGHT + BALL.RADIUS + 0.12; // 網口最低通過高度
export function spikeVelocity(from, to, speed, minTime) {
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  let T = Math.max(d / speed, minTime);
  if ((from.z > 0) !== (to.z > 0)) {
    const f = from.z / (from.z - to.z); // 網面（z=0）落在全程的比例位置
    const need = NET_CLEARANCE - from.y - f * (to.y - from.y);
    const denom = 0.5 * G * f * (1 - f);
    if (need > 0 && denom > 1e-9) T = Math.max(T, Math.sqrt(need / denom));
  }
  return velocityForTime(from, to, T);
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
