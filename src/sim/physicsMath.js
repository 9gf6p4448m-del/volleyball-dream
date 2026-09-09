// Free Ball 風格純物理與彈道數學引擎（零 three.js / DOM 依賴，零 GC 分配）
// 提供解析拋物線反解、落點預測、擊球時機評估與物理散佈偏折計算

export const TIMING_GRADE = {
  PERFECT: 'PERFECT',
  GOOD: 'GOOD',
  EARLY: 'EARLY',
  LATE: 'LATE',
  MISS: 'MISS',
};

/**
 * 彈道發射速度求解器（Launch Velocity Solver）
 * 給定起點、目標點、期望弧頂高度與重力，解析計算三維初速向量與飛行時間
 * 
 * @param {{x: number, y: number, z: number}} start 起點座標
 * @param {{x: number, y: number, z: number}} target 目標落地/接球座標
 * @param {number} apexHeight 拋物線頂點高度（公尺）
 * @param {number} gravity 重力加速度（正數，預設 9.81）
 * @returns {{vx: number, vy: number, vz: number, time: number}} 初速度向量與總飛行時間
 */
export function calculateLaunchVelocity(start, target, apexHeight, gravity = 9.81) {
  const g = Math.abs(gravity);
  const effectiveApex = Math.max(apexHeight, Math.max(start.y, target.y) + 0.1);

  const vy = Math.sqrt(2 * g * Math.max(effectiveApex - start.y, 0.01));
  const tUp = vy / g;
  const tDown = Math.sqrt(2 * Math.max(effectiveApex - target.y, 0.01) / g);
  const tTotal = Math.max(tUp + tDown, 0.05);

  return {
    vx: (target.x - start.x) / tTotal,
    vy,
    vz: (target.z - start.z) / tTotal,
    time: tTotal,
  };
}

/**
 * 解析落點預測器（Landing Predictor）
 * 根據當前位置、初速與重力，解析計算接觸地面（或特定高度）的座標與剩餘時間
 * 
 * @param {{x: number, y: number, z: number}} pos 當前位置
 * @param {{vx: number, vy: number, vz: number}} vel 當前速度
 * @param {number} groundY 目標高度（預設 0 為地板）
 * @param {number} gravity 重力加速度（預設 9.81）
 * @returns {{x: number, z: number, time: number}} 落地座標與剩餘時間（秒）
 */
export function predictLandingAnalytical(pos, vel, groundY = 0, gravity = 9.81) {
  const g = Math.abs(gravity);
  const deltaY = pos.y - groundY;

  // 判別式：vy^2 + 2 * g * (y0 - groundY)
  const discriminant = vel.vy * vel.vy + 2 * g * deltaY;
  if (discriminant < 0) {
    return { x: pos.x, z: pos.z, time: 0 };
  }

  // 正根為未來著地時刻
  const t = (vel.vy + Math.sqrt(discriminant)) / g;
  const safeT = Math.max(0, t);

  return {
    x: pos.x + vel.vx * safeT,
    z: pos.z + vel.vz * safeT,
    time: safeT,
  };
}

/**
 * 擊球時機窗口評估器（Timing Window Evaluator）
 * 評估玩家擊球時間點相對於最佳擊球窗（Sweet Spot）的偏差
 * 
 * @param {number} actualTime 玩家揮臂時刻（秒）
 * @param {number} sweetSpotTime 最佳擊球時刻（秒）
 * @param {number} perfectWindow Perfect 容忍窗（預設 ±0.08s）
 * @param {number} goodWindow Good 容忍窗（預設 ±0.18s）
 * @returns {{grade: string, diff: number, score: number}} 等級、時間差（秒）、歸一化品質分數 [0, 1]
 */
export function evaluateTiming(actualTime, sweetSpotTime, perfectWindow = 0.08, goodWindow = 0.18) {
  const diff = actualTime - sweetSpotTime;
  const absDiff = Math.abs(diff);

  let grade = TIMING_GRADE.MISS;
  if (absDiff <= perfectWindow) {
    grade = TIMING_GRADE.PERFECT;
  } else if (absDiff <= goodWindow) {
    grade = TIMING_GRADE.GOOD;
  } else if (diff > goodWindow) {
    grade = TIMING_GRADE.LATE;
  } else {
    grade = TIMING_GRADE.EARLY;
  }

  // 歸一化品質分數：0 代表剛好在 Good 邊緣或出界，1 代表完美正中 sweetSpot
  const score = Math.max(0, Math.min(1, 1 - absDiff / goodWindow));

  return { grade, diff, score };
}

/**
 * 扣殺下釘初速計算器（Spike Launch Vector with Downward Penetration）
 * 結合時機品質，解放銳利下釘角度與高速衝擊
 * 
 * @param {{x: number, y: number, z: number}} from 擊球點
 * @param {{x: number, z: number}} targetAim 玩家瞄準落點
 * @param {number} baseSpeed 基礎扣球速度
 * @param {number} timingScore 時機品質分數 [0, 1]
 * @param {string} timingGrade 時機等級 (PERFECT/GOOD/LATE/EARLY)
 * @returns {{vx: number, vy: number, vz: number, speed: number}}
 */
export function calculateSpikeVelocity(from, targetAim, baseSpeed = 18, timingScore = 1.0, timingGrade = TIMING_GRADE.PERFECT) {
  const dx = targetAim.x - from.x;
  const dz = targetAim.z - from.z;
  const horizDist = Math.hypot(dx, dz) || 1;

  // Perfect 獲得超速加成（+35%），Good 為基礎速，早晚扣則衰減
  let speedMultiplier = 1.0;
  if (timingGrade === TIMING_GRADE.PERFECT) {
    speedMultiplier = 1.35;
  } else if (timingGrade === TIMING_GRADE.GOOD) {
    speedMultiplier = 1.0 + (timingScore - 0.5) * 0.3;
  } else {
    speedMultiplier = 0.65;
  }

  const finalSpeed = baseSpeed * speedMultiplier;

  // 飛行時間估算
  const flightTime = Math.max(horizDist / finalSpeed, 0.16);

  // 垂直速度直接下扎（向下俯衝角度）
  const gravityCompensation = 0.5 * 9.81 * flightTime;
  const downwardPush = (0 - from.y) / flightTime; // 目標是砸向地面
  const vy = downwardPush + gravityCompensation;

  return {
    vx: (dx / horizDist) * finalSpeed * 0.9,
    vy,
    vz: (dz / horizDist) * finalSpeed * 0.9,
    speed: finalSpeed,
  };
}
