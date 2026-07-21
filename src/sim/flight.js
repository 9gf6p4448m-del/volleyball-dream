// 彈道工具（純函式）— 給定起點/目標解出擊球初速；落點預測直接複用 stepBall 物理
import { BALL, SIM_DT } from './constants.js';
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

// 扣球球路（快速平直）：速度標量 → 初速向量
// AI 的過網預判與 sim 的實際擊球共用此函式（單一公式來源，不得各自手刻）
export function spikeVelocity(from, to, speed, minTime) {
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  return velocityForTime(from, to, Math.max(d / speed, minTime));
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
