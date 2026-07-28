// 球員朝向（表現層純函式；零 three.js 依賴，node 可直測）
//
// 07-28 修「扣球時角色會轉圈」：原本 matchView 內嵌兩套互不相干的目標角，
// 中間只隔一道 1.1m 硬門檻——
//   dist > 1.1 → atan2(bdx, bdz)      面向球的「位置」
//   dist <= 1.1 → atan2(-bvx, -bvz)   面向球「飛來的方向」
// 逐幀量測（線上版 main@5518279）顯示一次二傳舉球內 targetYaw 連跳三次
// （跨進 1.1m +110°、觸球球速反轉 +67°、跨回 1.1m 外 +174°），三次最短弧同號
// ⇒ 被一路捲滿一圈（unwrappedYaw 7.20→13.19＝+343°，歷時 0.72s）。
//
// 三道修正（對應下方三組常數）：
// 1) 距離帶連續混合，取代 1.1m 硬跳（角度混合走最短弧，不對數值線性內插）
// 2) 球速方向要「夠快才可信」——舉球最高點水平球速只有 ~1.5 m/s，方向純屬數值雜訊；
//    量測顯示近身球速呈雙峰（0–3 m/s 的舉球/弧頂 vs 5–18 m/s 的扣球/發球/傳球），
//    故在 3→5 m/s 之間淡入，低速一律退回「面向球的位置」
// 3) 轉速上限：最後一道保險，即使目標角仍跳，人也不會整圈繞

export const FACING = {
  // 1) 距離混合帶（原硬門檻 1.1m 置中，帶寬 0.7m）
  NEAR_R: 0.75,          // 內半徑：完全採用「面向來球方向」
  FAR_R: 1.45,           // 外半徑：完全採用「面向球位置」
  // 2) 球速可信門檻（m/s，水平分量）
  MIN_BALL_SPEED: 3.0,   // 低於此＝方向不可信，完全不採用
  FULL_BALL_SPEED: 5.0,  // 高於此＝完全可信
  // 3) 轉身
  TURN_K: 25,            // 指數收斂率（1/秒）——沿用原值，排球轉身要快
  // 轉速上限（rad/s）：10 rad/s ≈ 573°/s，即 180° 轉身最快 0.31 秒。
  // 這已快過真人急停轉身的極限，日常追球完全碰不到上限（不改手感），
  // 只在目標角瞬跳時把「整圈繞」壓成「快速轉半圈以內」。
  MAX_TURN_RATE: 10,
  POS_EPS: 1e-3,         // 球員與球幾乎重疊時，位置方向無意義
  HUDDLE_FACE_W: 0.35,   // 圍圈權重超過此值＝轉向教練（沿用原值）
};

/** 最短弧差（from → to），結果落在 [-π, π] */
export function shortestArc(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 角度混合：沿最短弧從 a 走向 b 的 t（0..1）——直接線性內插數值會在 ±π 出錯 */
export function blendAngle(a, b, t) {
  return a + shortestArc(a, b) * t;
}

/** smoothstep：edge0 以下為 0、edge1 以上為 1，中間 C1 連續（避免混合帶端點折角） */
export function smoothstep(edge0, edge1, v) {
  if (edge1 <= edge0) return v >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 追球朝向：近身混合「面向來球方向」、遠處面向球的位置。
 * @param {object} o
 * @param {number} o.x 球員 x
 * @param {number} o.z 球員 z
 * @param {number} o.ballX 球 x
 * @param {number} o.ballZ 球 z
 * @param {number} o.ballDx 球每個 sim tick 的 x 位移（b.x - b.px）
 * @param {number} o.ballDz 球每個 sim tick 的 z 位移（b.z - b.pz）
 * @param {number} o.simDt sim 固定步長（秒）——把位移換算成 m/s
 * @param {number} o.currentYaw 現有朝向（無任何可信線索時維持不動）
 * @returns {number} 目標 yaw（rad）
 */
export function ballFacingYaw(o) {
  const bdx = o.ballX - o.x;
  const bdz = o.ballZ - o.z;
  const dist = Math.hypot(bdx, bdz);
  const posYaw = dist > FACING.POS_EPS ? Math.atan2(bdx, bdz) : o.currentYaw;

  const ballSpeed = Math.hypot(o.ballDx, o.ballDz) / o.simDt;
  const wSpeed = smoothstep(FACING.MIN_BALL_SPEED, FACING.FULL_BALL_SPEED, ballSpeed);
  const wNear = 1 - smoothstep(FACING.NEAR_R, FACING.FAR_R, dist);
  const w = wSpeed * wNear;
  if (w <= 0) return posYaw;

  const velYaw = Math.atan2(-o.ballDx, -o.ballDz);
  return blendAngle(posYaw, velYaw, w);
}

/**
 * 這一幀該面向哪裡（職責制）：攔網職責鎖面向網；rally 追球；圍圈轉向教練。
 * @param {object} o ballFacingYaw 的全部欄位，另加：
 * @param {string} o.phase gameState.phase
 * @param {number} o.netYaw 面向球網的角度
 * @param {boolean} o.blockDuty 是否攔網職責
 * @param {number} [o.huddleW] 圍圈權重 0..1
 * @param {number} [o.coachX] 教練 x（huddleW 夠高時才用到）
 * @param {number} [o.coachZ] 教練 z
 * @returns {number} 目標 yaw（rad）
 */
export function facingTarget(o) {
  let target = o.netYaw;
  if (o.phase === 'rally' && !o.blockDuty) target = ballFacingYaw(o);
  // 圍圈（暫停/局間）：站定後背對教練不合理，權重高時覆蓋
  if ((o.huddleW ?? 0) > FACING.HUDDLE_FACE_W) {
    target = Math.atan2(o.coachX - o.x, o.coachZ - o.z);
  }
  return target;
}

/**
 * 朝向趨近：指數收斂 ＋ 轉速上限（最後一道保險）。
 * @param {number} current 現有 yaw
 * @param {number} target 目標 yaw
 * @param {number} dt 這一幀的秒數
 * @param {number} [maxRate] 轉速上限（rad/s）；傳 Infinity 可關閉（突變測試用）
 * @returns {number} 新的 yaw
 */
export function approachYaw(current, target, dt, maxRate = FACING.MAX_TURN_RATE) {
  const step = shortestArc(current, target) * (1 - Math.exp(-FACING.TURN_K * dt));
  const cap = maxRate * dt;
  return current + Math.max(-cap, Math.min(cap, step));
}
