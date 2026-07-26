// 暫停圍圈幾何（W8 暫停演出；07-26 Sawmah 二輪拍板：真圓圈＋固定圈口視角——
// 初版扁弧「像站一排」且鏡頭跟輪轉位每次構圖不同，皆否決）
// 單一事實源：matchView（隊員站位）/cameraRig（第一人稱眼位）/huddleProps（教練與板）
// 三方共用，改圈型只動這裡。座標系：x 沿邊線、z 依隊側鏡射（side＝TEAM_SIDE[team]）
export const HUDDLE = {
  X: -4.5,          // 圈心 x（場邊；沿用 W7.1 集合帶位既有值）
  Z: 8.4,           // 圈心 z＝教練站位（依隊側鏡射）
  RADIUS: 1.25,     // 圍圈半徑（以教練為圓心）
  WALK_BACK_TICKS: 90, // 倒數剩 1.5s 散開走回真實位置（沿用 W7.1 值）
};

// 六個圈位角度（deg→rad）：0＝朝球場的「圈口」＝主角/鏡頭固定位；其餘環繞教練。
// 實測修正：±72 近側（60 太貼鏡頭）、±136 遠側、163 後位——180 正後方會與教練
// 前後重疊成「後排隊友舉板」錯視，偏 17° 讓他從教練身側探出
const ANGLES = [0, -72, 72, -136, 136, 163].map((d) => (d * Math.PI) / 180);

export function coachPos(side) {
  return { x: HUDDLE.X, z: side * HUDDLE.Z };
}

// 第 i 圈位（0..5）：0 恆為圈口（朝球場）；角度自圈口順逆交錯展開
export function huddleSlot(side, i) {
  const th = ANGLES[((i % 6) + 6) % 6];
  const c = coachPos(side);
  return {
    x: c.x + HUDDLE.RADIUS * Math.sin(th),
    z: c.z - side * HUDDLE.RADIUS * Math.cos(th),
  };
}
