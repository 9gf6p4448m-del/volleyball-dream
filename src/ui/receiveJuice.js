// 接球微回饋（丙1/丙2，acceptance-netduel-batch2.md，2026-08-27 批2）：純判定層。
// 教訓沿用 blockBetFeedback.js/signatureBeats.js 的既有先例——門檻寫在 matchLoop 的
// UI 迴圈裡沒有測試守得住（mbCallFeedbackOf 檔頭記過的事故），抽成具名純函式，
// matchLoop 只做讀 s.lastTouch／呼叫，不內聯任何數字。

// 重扣門檻——**單一來源**：matchLoop 既有「重扣定格接慢動作」分支與丙1 的
// isHeavySpikeDig 都 import 這一個常數（批2 覆核時把 matchLoop 原行內 0.7 收斂過來，
// 建構上不再存在第二份）。改門檻只改這裡。
export const HEAVY_SPIKE_POWER_MIN = 0.7;

/**
 * 丙1（NJ-2）：這一次觸球是不是「重扣被救起」的那一下。
 *
 * 判定＝上一次觸球是對方的重扣（kind==='spike' 且 power≥門檻）、這一次是我方
 * （跨隊）的非扣球觸球——把對面那顆重扣接了下來。排除 event.kind==='spike'：
 * 扣球者自己那一下已經有獨立的 hit-stop 通道（matchLoop 既有邏輯），不重疊觸發。
 *
 * @param {{team:string, kind:string, power?:number}|null} prevTouch 這個事件發生前
 *   的最後一次觸球快照（呼叫端必須在覆寫 s.lastTouch 前取樣，見 matchLoop 註解）
 * @param {{type:string, kind?:string, team:string}|null} event 正在處理的事件
 * @returns {boolean}
 */
export function isHeavySpikeDig(prevTouch, event) {
  if (!prevTouch || !event || event.type !== 'TOUCH') return false;
  if (event.kind === 'spike') return false;
  if (prevTouch.kind !== 'spike') return false;
  if ((prevTouch.power ?? 1) < HEAVY_SPIKE_POWER_MIN) return false;
  return prevTouch.team !== event.team;
}

/**
 * 丙2（NJ-3）：這一次觸球是不是「魚躍成功救起」。
 *
 * 撲空沒有 TOUCH 事件——geoAnimator.js／matchView.js 既有設計：撲救動畫由
 * `divedUntil` 偵測驅動，撲到／撲空都演完整套，但只有撲到才有 TOUCH（球未落地、
 * 我方繼續）。因此只要 TOUCH 的 kind 是 'dive'，就是一次成功救起——慢動作只獎成功。
 *
 * @param {{type:string, kind?:string}|null} event
 * @returns {boolean}
 */
export function isDiveSaveTouch(event) {
  return !!event && event.type === 'TOUCH' && event.kind === 'dive';
}
