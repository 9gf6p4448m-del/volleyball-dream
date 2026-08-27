// 即時 highlight 重播（批3，acceptance-netduel-batch3.md，2026-08-27）：**判定層純函式**
// ——零 DOM／three，node 直測（範式同 signatureBeats.js／receiveJuice.js）。
//
// ★ 為什麼判定住在這裡而不是 matchLoop ★ 批1 的網口對決已經付過一次學費：判定內聯在
// UI 迴圈裡就沒有測試守得住（見 signatureBeats.js 檔頭記的 mbCallFeedbackOf 事故）。
// HR-2 明寫「頻率判定＝純函式（可直測），不在 matchLoop 散寫」，所以「這一分要不要
// 重播、播全版還是短版、字卡寫什麼」整組收在本檔，matchLoop 只做搬運與播放。
//
// 與批1 的關係：網口對決的**現場鏡頭演出路徑（cameraRig sig 構圖）已廢止**——
// 試玩回饋「得分後現場鏡頭看起來不明所以（球員已在歡呼、對決早結束）」。qualify
// 出來的 tool/stuff 改走本檔 → 真慢動作重播。netDuelQualify／netDuelFire（定性與
// 起鏡）仍留在 signatureBeats.js，本檔只吃它們的結論（outcome）。
import { HEAVY_SPIKE_POWER_MIN } from './receiveJuice.js';

// 尾段時長（ms，**演出時間**不是 sim 時間——導播腳本在決定性一拍之後是 0.35 倍慢動作，
// 兩者差三倍）。【試玩必調】提案值，依 2026-08-27 導播腳本實測校準（48 顆真球）：
// 「決定性一拍→落地」在 0.35 倍率下佔 2.4–7.2 秒（中位 5.3；攔網收尾的球 2.5–3.5）。
//   · 全版 3500：攔網收尾（＝網口對決的形狀）整段吃得下，扣球長飛行則截尾 3.5 秒
//   · 短版 1400：只給落地前那一下——看見自己怎麼輸的，但不逗留（kickoff 拍板 1）
// 兩者皆 >0 且短版真的比全版短（HR-3）。
export const HIGHLIGHT_FULL_MS = 3500;
export const HIGHLIGHT_SHORT_MS = 1400;

// 字卡文案（HR-4；繁中台灣用語）。關鍵分是**前綴**：網口對決逢關鍵分＝兩件事都講，
// 不必為組合另開一句。
export const HIGHLIGHT_CAPTION = {
  keyPoint: '關鍵分！',
  tool: '打手出界！',
  stuff: '攔網蓋死！',
};

export const HIGHLIGHT_ICON = { tool: '✋', stuff: '🧱', spike: '💥' };

/**
 * 「重扣直接得分」＝這一分是不是關鍵分重扣的候選（HR-2b 的定性）。
 *
 * 重扣門檻**不另抄數字**：吃 receiveJuice 的 HEAVY_SPIKE_POWER_MIN 單一來源
 * （批2 覆核已把 matchLoop 行內的 0.7 收斂過去，建構上不存在第二份）。
 * 吊球（低力度 spike）因此自動不算——「重扣得分」的重播不該被吊球冒領。
 *
 * @param {object} p
 * @param {string|null} p.reason    DEAD_BALL 的 reason
 * @param {string|null} p.winner    得分方 team
 * @param {object|null} p.lastTouch { team, playerId, kind, power }
 * @returns {boolean}
 */
export function isHeavySpikeKill({ reason, winner, lastTouch } = {}) {
  if (reason !== 'BALL_IN' || !lastTouch) return false;
  if (lastTouch.kind !== 'spike') return false;
  if (lastTouch.team !== winner) return false; // 落在自家半場＝處理失誤，不是扣死
  return (lastTouch.power ?? 1) >= HEAVY_SPIKE_POWER_MIN;
}

/**
 * 這一分要不要即時重播、播多長、字卡寫什麼（HR-2／HR-3／HR-4 的單一判定出口）。
 *
 * 觸發只有兩種（HR-2）：
 *   (a) 網口對決 qualify 成立的 SCORE（打手出界／攔網蓋死）——**不限關鍵分**，
 *       這道演出的存在理由就是網口那一拍；
 *   (b) 重扣直接得分**且**本球是關鍵分——普通重扣得分一場太多次，不播。
 *
 * 全短版（HR-3）只由「我方／對面」決定：我方得分＝全版尾段、對面得分＝短版尾段。
 * ★ 批1 的 seenSignature 頻率經濟對重播不適用 ★——那套是為「同一道招牌演出看第二次
 * 就短版」設計的，重播的資訊量逐球不同（每次是不同的一顆球），沒有「看過了」可言。
 *
 * @param {object} p
 * @param {string|null} p.duelOutcome netDuelQualify 定出的 'tool'|'stuff'（無＝null）
 * @param {string|null} p.reason      DEAD_BALL reason（(b) 用）
 * @param {object|null} p.lastTouch   最後觸球（(b) 用）
 * @param {string|null} p.winner      得分方 team
 * @param {string|null} p.myTeam      玩家所屬 team
 * @param {boolean}     p.keyPoint    本球是否關鍵分（發球當下判定的 keyPointOf）
 * @param {'on'|'off'}  p.pref        演出偏好（全關＝不播；真值字卡不經此處）
 * @returns {null|{kind:'netduel'|'spike', outcome:string|null, mine:boolean,
 *                 mode:'full'|'short', tailMs:number, caption:string, icon:string}}
 */
export function planHighlightReplay({
  duelOutcome = null, reason = null, lastTouch = null,
  winner = null, myTeam = null, keyPoint = false, pref = 'on',
} = {}) {
  if (pref === 'off') return null; // 演出全關：省演出、不吃資訊（pointBanner 照常講真值）
  let kind = null;
  let outcome = null;
  if (duelOutcome === 'tool' || duelOutcome === 'stuff') {
    kind = 'netduel';
    outcome = duelOutcome;
  } else if (keyPoint && isHeavySpikeKill({ reason, winner, lastTouch })) {
    kind = 'spike';
  }
  if (!kind) return null;
  const mine = winner === myTeam;
  const mode = mine ? 'full' : 'short';
  return {
    kind,
    outcome,
    mine,
    mode,
    tailMs: mode === 'full' ? HIGHLIGHT_FULL_MS : HIGHLIGHT_SHORT_MS,
    caption: (keyPoint ? HIGHLIGHT_CAPTION.keyPoint : '')
      + (outcome ? HIGHLIGHT_CAPTION[outcome] : ''),
    icon: outcome ? HIGHLIGHT_ICON[outcome] : HIGHLIGHT_ICON.spike,
  };
}
