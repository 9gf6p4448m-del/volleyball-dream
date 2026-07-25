// 暫停圍圈幾何（W8 暫停演出，2026-07-26 Sawmah 拍板 B 案：第一人稱圍圈看戰術板）
// 單一事實源：matchView（隊員站位）/cameraRig（第一人稱眼位）/huddleProps（教練與板）
// 三方共用，改圈型只動這裡。座標系：x 沿邊線、z 依隊側鏡射（side＝TEAM_SIDE[team]）
export const HUDDLE = {
  X: -4.5,          // 教練點 x（場邊；沿用 W7.1 集合帶位既有值）
  Z: 8,             // 圈心 z（依隊側鏡射）
  COACH_DZ: 1.15,   // 教練站圈外側（比圈心更遠離球場）
  RADIUS: 1.15,     // 隊員弧半徑（以教練為圓心）
  SPREAD: 0.42,     // 相鄰槽位夾角（rad）——六人約 120° 弧
  WIDEN_X: 1.35,    // x 向展寬（弧稍扁＝橫排感，第一人稱裡兩側都看得到隊友）
  WALK_BACK_TICKS: 90, // 倒數剩 1.5s 散開走回真實位置（沿用 W7.1 值）
};

export function coachPos(side) {
  return { x: HUDDLE.X, z: side * (HUDDLE.Z + HUDDLE.COACH_DZ) };
}

// 第 i 槽（0..n-1）圍圈站位：以教練為圓心、朝球場側展開的弧
export function huddleSlot(side, i, n = 6) {
  const th = (i - (n - 1) / 2) * HUDDLE.SPREAD;
  const c = coachPos(side);
  return {
    x: c.x + HUDDLE.RADIUS * Math.sin(th) * HUDDLE.WIDEN_X,
    z: c.z - side * HUDDLE.RADIUS * Math.cos(th),
  };
}
