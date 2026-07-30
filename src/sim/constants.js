// 模擬核心常數 — 本目錄（src/sim）不得 import three.js 或任何畫面/輸入層程式碼（架構鐵律）

// 固定步長：模擬一律以 60Hz 運算，與 render 幀率脫鉤
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
// 單一畫面幀最多補償的模擬時間（避免分頁切回時的 spiral of death）
export const MAX_FRAME_DELTA = 0.25;

// 標準排球場（單位：公尺）；座標系：網在 z=0，場地長軸為 z，寬軸為 x，y 向上
export const COURT = {
  LENGTH: 18, // 全長（每半場 9m）
  WIDTH: 9,
  ATTACK_LINE: 3, // 攻擊線距中線
  FREE_ZONE: 3, // 界外自由區寬度
  LINE_WIDTH: 0.05,
  NET_HEIGHT: 2.43, // 男子網高
  NET_BAND: 1.0, // 網面垂直高度（網下緣 = NET_HEIGHT - NET_BAND）
  NET_OVERHANG: 0.5, // 網面超出邊線的長度（到網柱）
};

export const BALL = {
  RADIUS: 0.105, // 週長 65–67cm
  GRAVITY: -9.81,
  RESTITUTION: 0.76, // 地板反彈係數
  GROUND_FRICTION: 0.98, // 觸地時水平速度衰減
  NET_RESTITUTION: 0.25, // 觸網後 z 向反彈（網是軟的）
  NET_DAMPING: 0.5, // 觸網後 x/y 速度衰減
  WALL_RESTITUTION: 0.5, // 自由區邊界反彈（把球留在場景內）
  REST_SPEED: 0.3, // 低於此垂直速度視為停止反彈
};

// 發球循環：每 SERVE_PERIOD 秒重置一次，變化全部由 cycle 序號決定（決定論）
export const SERVE_PERIOD = 6;

// ==== §十 階段五 基準 B：旋鈕收斂進度 ====
// t ＝ 0 為基準 A 現值、1 為 §1.3 目標值；裁定書 §4.2①：每段 +0.25、共四段、**所有旋鈕同步**。
// **住在 constants.js 的理由**：`blockBand.js` 需要它算收斂後的單人半寬，
// 而 blockBand 不能 import game.js（game.js 反過來 import blockBand ⇒ 循環）。
// 攔網半寬必須維持**單一真相**——sim 的 TUNING 與玩家面板（`input/attackZones.js`）
// 共用同一把尺，那是既有設計，有測試守著（`reach-volume.test.mjs` 的「陷阱 1」）。
export const CONVERGE_T = 0.75;
