// Phase 5 W1 §9 — `ActionPhaseContract`（純算術、零狀態、零 rng；sim 核心）
//
// **這份契約是從兩個既有案例抽出來的，不是先設計好給它們套的**
// （憲法 §五「相位契約的時序」：一個案例抽出來的是那個案例的形狀）：
//   案例 A ＝ §2／§4 助跑四段（`approach.js` 的 route ＋ `ai.js` 的助跑分支）
//   案例 B ＝ §6 B1 攔網 commit 人格（`blockRead.js` ＋ `ai.js` 的 blockCommitTargetX）
//
// 兩個案例逐段對照後，共有的形狀只有下面這一組（**沒有第三個案例，就沒有第三個欄位**）：
//
// | 相位 | 助跑（案例 A） | 攔網 commit（案例 B） |
// |---|---|---|
// | `wait`    | 站在自己那條線的助跑起點等二傳（`route.start`） | 還沒發現有人在跑快攻＝狀態尚未建立 |
// | `chase`   | 跑向起跳點（`route.takeoff`，到位即停） | 跟死那個越線往網跑的人（逐 tick 更新 x） |
// | `air`     | 滯空收勢，不再水平移動 | 攔網跳滯空，**不能橫移** |
// | `release` | 落回 cover／職責位 | 落地，跑一次 close 時間預算 |
//
// 契約的三條硬性內容（都是兩個案例本來就在做的事，此處只是變成同一句話）：
//
// 1. **段界只有兩種來源**：sim 擁有的 tick 錨點，或場上看得見的事件。
//    事件驅動的那一段，作法是「事件發生時把 tick 寫下來」，寫下之後就交還本契約解析
//    ——案例 B 的 `jumpTick`（被跟的人不再推進＝他拔起來了）就是這個作法；
//    案例 A 的 `startTick`／`takeoffTick` 則是事前由 `setTick` 排定。
//    **錨點從哪來不歸契約管，契約只管邊界由它決定。**
// 2. **`air` 的窗長一律沿用既有 sim 常數，契約不另立標準**：
//    案例 A ＝ `approach.js` 的 `AIR_TICKS`（24＝`TUNING.TAKEOFF_LOOKBACK_TICKS`，
//    與後排踏線違例判定共用同一個回溯窗）；案例 B ＝ `TUNING.BLOCK_WINDOW`（48）。
// 3. **錨點算不出來（`null`）＝停在前一段**，不得瞎猜——呼叫端據此回落既有行為
//    （案例 A：`setTick` 預測失效 ⇒ 一路站在助跑起點；案例 B：還沒鎖定 ⇒ 照追球軸）。
//
// 契約**不管空間目標**：兩個案例的目標形狀天差地遠（案例 A 是世界座標點餵 moveIntent、
// 案例 B 是一個純量 x 餵攔網站位），硬湊一個共同型別會是為想像中的第三個案例造欄位。
// 每一段各自擁有一個 sim 端決定的目標，這件事寫在上表裡當規格，不長成 API。

export const ACTION_PHASE = {
  WAIT: 'wait',       // 還沒進場
  CHASE: 'chase',     // 追一個目標
  AIR: 'air',         // 滯空：不再水平移動
  RELEASE: 'release', // 收勢完成，交還既有行為
};

// 這一 tick 落在哪一段。
//   enterTick  進場錨點；`null`＝還沒進場（或錨點算不出來）⇒ 恆 `wait`
//   airTick    進滯空的錨點；`null`＝還沒起跳 ⇒ 停在 `chase`
//   airTicks   滯空窗長（呼叫端給既有 sim 常數，見上方第 2 條）
export function actionPhaseAt(tick, { enterTick = null, airTick = null, airTicks = 0 } = {}) {
  if (enterTick == null || tick < enterTick) return ACTION_PHASE.WAIT;
  if (airTick == null || tick < airTick) return ACTION_PHASE.CHASE;
  return tick < airTick + airTicks ? ACTION_PHASE.AIR : ACTION_PHASE.RELEASE;
}
