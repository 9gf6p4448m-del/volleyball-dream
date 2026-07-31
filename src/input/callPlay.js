// 組合攻擊卷 段 E（2026-07-31）— 叫套路的選項池與回饋文案
//
// 兩條輸入路徑共用本檔（同源鐵則的 UI 側）：
//   甲：死球窗「叫套路」面板（`ui/callPanel.js`）——真實對應＝二傳背後的手勢
//   乙：S 遠段面板（`app/matchLoop.js` 的 `setReady === false` 分支）——臨場改判
// 選項清單一律由 sim 的 `offeredCallTypes()` 給，**面板列得出來的就是解析器認得的**。
//
// ★ 甲之三的兩種語意（上位裁定書 §四.2）★
//   S    ＝**指令**：本來就決定傳給誰，直接生效
//   非 S ＝**請求**：只能為自己叫，由 S 的 AI 依 trust 權衡採納與否
// UI 硬性要求「回饋必須分得開」——本檔用**三條互相獨立的通道**同時表達，
// 任一條被色盲／小螢幕／關音效吃掉，另外兩條仍分得出來：
//   ① 圖示：⚡指令 ／ 🙋請求 ／ 🔄改判
//   ② 詞：「指令」「請求」「改判」寫在文字裡，不倚賴圖示
//   ③ 顏色：指令＝琥珀（我說了算）／請求＝天藍（我在拜託）／被無視＝灰
// 面板自己也照同一套（見 callPanel 的標題與按鈕文案）＝按下去之前就知道是哪一種。
import { offeredCallTypes } from '../sim/approach.js';
import { KIND_LABELS } from './setOptions.js';

export const CALL_LABELS = { cross: '交叉', tandem: '夾塞', delay: '時間差' };
export const CALL_DESCS = {
  cross: 'MB 打快攻當誘餌，你從他背後穿過去',
  tandem: '貼著快攻手同一條線、身後再跳一次',
  delay: '快攻手先跳，你等他落地那一刻才擊球',
};

// 兩種語意的表現層規格（單一真相：面板與回饋讀同一份，不會一邊說指令一邊說請求）
export const CALL_MODES = {
  command: { icon: '⚡', word: '指令', color: '#ffd166', hint: '你是二傳——說了算' },
  request: { icon: '🙋', word: '請求', color: '#6ee7ff', hint: '你只能為自己叫——二傳理不理看信任' },
  replan:  { icon: '🔄', word: '改判', color: '#ffd166', hint: '一傳歪了——臨場換套路' },
};

// 開面板的人是不是二傳＝指令；其餘一律請求（甲之三，玩家只能代表自己）
export function callModeOf(game, playerId) {
  return game.players?.[playerId]?.currentRole === 'setter' ? 'command' : 'request';
}

// 選項池。**不預先變灰任何一項**——變灰要預判一傳品質＝作弊（裁定 E 明文），
// 湊不出來一律等到當場再回饋。
export function callOptionsFor(game, playerId) {
  const mode = callModeOf(game, playerId);
  return offeredCallTypes().map((type) => ({
    type,
    mode,
    label: CALL_LABELS[type] ?? type,
    desc: CALL_DESCS[type] ?? '',
  }));
}

// 裁定 E：湊不出套路時**當場回饋失敗**，且說得出是**哪一條**沒過。
// 鍵＝`resolveCalledPlay` 回傳的 reason（＝第一個沒過的 check），sim 只給機器碼。
const REASON_TEXT = {
  hasMain: '你不在這一波的攻擊池裡',
  mainKind: null, // 動態：要講出他實際被排到哪條線（見 reasonTextOf）
  tier: '一傳沒到位，沒有快攻可搭',
  partner: 'MB 不在前排（或他就是接一傳的人）',
  crosses: '兩條線沒有交會',
  behind: '穿不到快攻手身後',
  outOfReach: '兩人擊球點太近，一個人就攔得完',
  lane: '不同線，夾不起來',
  depth: '前後疊得不夠深',
  stagger: '兩人節奏沒錯開',
  notCrossing: '這球的幾何是交叉、不是夾塞',
  earlier: '誘餌沒有先跳',
  inWindow: '誘餌落地與你擊球對不上',
  launched: '來不及了——人已經起跑',
};

function reasonTextOf(reason, actualKind) {
  if (reason === 'mainKind') {
    const k = KIND_LABELS[actualKind] ?? actualKind;
    return k ? `你這球被排到「${k}」` : '你這球跑的不是那條線';
  }
  return REASON_TEXT[reason] ?? '這球湊不出來';
}

// aiState.callOutcome → 一則浮動字卡（null＝本波沒有叫牌，不出字卡）。
// routes＝aiState.approach?.routes（拿主攻者實際跑的線，讓 mainKind 的回饋講得具體）
export function callFeedbackOf(outcome, routes = null) {
  if (!outcome) return null;
  const spec = CALL_MODES[outcome.mode] ?? CALL_MODES.request;
  const name = CALL_LABELS[outcome.type] ?? outcome.type;
  const head = `${spec.icon}${spec.word}・${name}`;
  if (outcome.outcome === 'command' || outcome.outcome === 'accepted') {
    // 兩種語意的「成功」也要分得開：指令是「照跑」，請求是「二傳點頭了」
    const tail = outcome.mode === 'request' ? '二傳點頭了！' : '照跑！';
    return { text: `${head}——${tail}`, color: spec.color, ms: 1400 };
  }
  if (outcome.outcome === 'refused') {
    // 請求專屬：被無視。**不得與「湊不出來」共用文案**——玩家的下一步完全不同
    // （被無視＝先把球打好累積信任；湊不出來＝這球換一個套路叫）
    return { text: `${head}——二傳沒理你（信任不夠）`, color: '#9fb0cc', ms: 1400 };
  }
  const actual = routes?.find((r) => r.pid === outcome.mainId)?.kind ?? null;
  return {
    text: `${head}——${reasonTextOf(outcome.reason, actual)}`,
    color: '#ff8a8a',
    ms: 1600,
  };
}

// 面板上的「已叫牌」狀態列（按下去之後、球還沒發之前看得到自己剛才做了什麼）
export function pendingCallTextOf(called) {
  if (!called?.type) return null;
  const spec = CALL_MODES[called.isSetter ? 'command' : 'request'];
  return `${spec.icon} 已下${spec.word}：${CALL_LABELS[called.type] ?? called.type}`;
}
