// 組合攻擊卷 段 E（2026-07-31）— 叫套路的選項池與回饋文案
//
// ★ 卷五（2026-08-02 裁定 1）：**只剩一條輸入路徑** ★
//   乙：S 遠段面板（`app/matchLoop.js` 的 `setReady === false` 分支）——球在飛的時候講戰術
// 路徑甲（死球窗面板 `ui/callPanel.js`）連同該檔整支退場：玩家在死球窗不知道自己被排到
// 哪條線、也不知道一傳品質，叫的是願望不是決策。乙走的是同一支 `resolveCalledPlay`、
// 同一個窗界（`touches === 1`），但一傳品質已知 ⇒ 資訊足夠，是真的決策。
// 選項清單一律由 sim 的 `offeredCallTypes()` 給，**面板列得出來的就是解析器認得的**。
//
// ★ 2026-08-01 戰術重做卷 題 0：只剩一種語意 ★
//   S    ＝**指令**：本來就決定傳給誰，直接生效
//   非 S ＝**沒有叫套路這件事**（面板開不了、選項池是空的）
// 舊制的「請求」（非 S 為自己叫、由 S 的 AI 依 trust 擲骰採納與否）已廢除——
// 玩家叫的是願望不是決策。新制改成：S 決策 → 非 S 收到**球內提示**（`ui/routeCue.js`）
// →用既有移動輸入自己決定跑不跑，非 S 在死球窗沒有事情做。
// 回饋仍用**三條互相獨立的通道**（圖示／詞／顏色）表達，任一條被色盲／小螢幕吃掉，
// 另外兩條仍分得出來：⚡指令（琥珀）／🔄改判／湊不出來（紅）。
import { offeredCallTypes } from '../sim/approach.js';
import { KIND_LABELS } from './setOptions.js';

// 卷五：`bquick` 是**單人改線**型（只動 MB 自己那條線，沒有配合者），與上面三型
// 的「兩人配合」不同族，但走同一個面板、同一支 `resolveCalledPlay`。
export const CALL_LABELS = {
  // 2026-08-03 Sawmah 命名裁定：與 setOptions.js 的 KIND_LABELS 對齊——
  // 同一個戰術在死球窗叫「交叉」、球內提示卻寫「交叉攻擊」，玩家會以為是兩件事。
  cross: '交叉攻擊', tandem: '夾塞', delay: '時間差', bquick: 'B快',
};
export const CALL_DESCS = {
  cross: 'MB 打快攻當誘餌，你從他背後穿過去',
  tandem: '貼著快攻手同一條線、身後再跳一次',
  delay: '快攻手先跳，你等他落地那一刻才擊球',
  bquick: 'MB 的快攻往 4 號位側拉開，一個人跑（不必配合）',
};

// 表現層規格（單一真相：面板與回饋讀同一份）。
// `request` 已於 2026-08-01 隨舊語意刪除——不得再加回來。
// ★ 2026-08-05（稽核 08-03 存疑項覆核）★ `replan` 這一支目前**沒有取用路徑**：
// `approach.js` 的解析器恆回 `mode: 'command'`（「叫套路的人一定是 S」），
// 08-03 也把 `ai.js applyReplanCall` 寫死的 `'replan'` 改回讀解析器的值。
// **保留不刪**：它是 `callFeedbackOf` 的查表項，若哪天恢復「改判」語意（例如死球窗入口
// 重開），只要解析器回 `'replan'` 就會自己活過來；刪掉反而要連文案一起重寫。
export const CALL_MODES = {
  command: { icon: '⚡', word: '指令', color: '#ffd166', hint: '你是二傳——說了算' },
  replan:  { icon: '🔄', word: '改判', color: '#ffd166', hint: '一傳歪了——臨場換戰術' },
};

// 只有二傳叫得了套路；非 S 回 null＝**沒有可用的語意**（不是「另一種語意」）
export function callModeOf(game, playerId) {
  return game.players?.[playerId]?.currentRole === 'setter' ? 'command' : null;
}

// 選項池。非 S 一律空陣列（他在死球窗沒有事情做）。
// **不預先變灰任何一項**——變灰要預判一傳品質＝作弊（裁定 E 明文），
// 湊不出來一律等到當場再回饋。
export function callOptionsFor(game, playerId) {
  const mode = callModeOf(game, playerId);
  if (!mode) return [];
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
  // ★ 2026-08-03 更正：主詞錯了 ★ 原文「**你**不在這一波的攻擊池裡」——但叫戰術的
  // 一定是 S，而 S 永遠不在攻擊池（那份池給的是攻擊手）⇒ 這句話對玩家恆真且恆無資訊。
  // 它是舊制「非 S 也能叫套路」時代的殘骸，那個語意 2026-08-01 已廢除（見本檔 :10-15）。
  // 實際觸發條件（approach.js:909-916）＝`commandMainId(points, ['left'], …)` 找不到人
  // ＝這一波沒有人跑左翼。**實測是最常見的單一失敗原因**（415 次／全體遠段波 27.8%，
  // tools/call-feasibility-probe.mjs n=1491）。
  // ★ 2026-08-05 修正我自己 08-04 造成的重複鍵 ★ 那天我以為 `hasMain` 沒有文案、
  // 在本表下方又加了一個 `hasMain`——JS 物件**後者覆蓋前者**，等於把這條（更具體、
  // 且附實測依據的）文案蓋掉了。已移除重複鍵，並把本條升級成**依戰術型別動態**：
  // `COMBO_MAIN_KINDS = { cross:['left'], tandem:['right'], delay:['left','right'] }`
  // ⇒ 原文「沒有人跑左翼」只對 cross 正確，叫夾塞時該講的是右翼。
  hasMain: null, // 動態：依 type 講出缺的是哪一條線（見 reasonTextOf）
  mainKind: null, // 動態：要講出他實際被排到哪條線（見 reasonTextOf）
  // ★ 2026-08-03 更正 ★ 原文「一傳沒到位」讀的是**逐點的 main.tier**（approach.js:759），
  // 不是面板標題用的 `aiState.passTier`——實測有 1/1491 波標題印著「一傳到位」、
  // 字卡卻說「一傳沒到位」，同一個畫面上兩句話互相矛盾。改成只講機制、不重述品質。
  tier: '這球排不出快攻線，搭不上',
  // 2026-07-31 文案對調：原文把罕見的「不在前排」放前面、常見的「他接了一傳」放進括號。
  // 依據＝段 B 逐條通過率（tools/combo-probe.mjs）：一傳到位 22.6% → 有 quick 配合者 20.8%，
  // 這一關只擋掉 1.8pp；而名冊是 {MB,MB} 對角（lineup.js:25,29），任何一輪都有一個 MB 在前排
  // ⇒ 真的擋在這裡時，主因幾乎一定是「前排那個 MB 接了這一傳」（D2 針對性發球吃掉 transition）。
  // ★ 2026-08-03 更正：與 `hasQuick` 問的是**同一件事實**，卻留著同一顆「猜成因」地雷 ★
  // 證據：一傳到位分層下 `delay` 的 partner 失敗 42 次、`bquick` 的 hasQuick 失敗 42 次，
  // **逐值相同**（同上探針）。實際觸發條件＝池裡沒有（主攻者以外的）人在跑 A 快。
  // 成因不只一種，而**成因已經印在面板標題上了**（一傳到位／可用／勉強）——
  // 理由句只陳述判定結果，不猜，這樣結構上就不可能再猜錯。
  partner: '這一波沒有人跑快攻可以搭',
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
  // 卷五・單人型專用：組合的 hasMain 問的是「有沒有夠格的主攻者」，單人型問的是
  // 「這一波到底有沒有人在跑 A 快」——兩者的實情不同，文案不共用。
  // ★ 2026-08-03 二度更正 ★ 同日稍早改成「前排 MB 接了這一傳，或他不在前排」，
  // 把最常見的成因擺第一個——**但那是照註解猜的，沒有量**。實測（同上探針，197 次）：
  // 78.7% 發生在一傳 ok/poor（整波根本不產生快攻線），我擺第一的那個只佔 21.3%。
  // ⇒ 改成不猜成因。一傳品質已經印在面板標題上，理由句只要陳述判定結果。
  hasQuick: '這一波沒有人跑快攻',
  playsOff: '這個賽季還沒有戰術可以叫',
};

// ★ 2026-08-04 結構性護欄 ★ `sim` 端每新增一個失敗 reason，這裡就得補一句文案，
// 否則玩家看到的是 fallback「這球湊不出來」——`hasMain` 就是這樣漏了一輪沒人發現。
// 本清單＝`approach.js` 會回出的**全部** reason（`resolveCalledPlay` 的直接 return
// ＋ `firstFailedCheck` 會挑到的 checks 鍵）＋ `ai.js applyReplanCall` 的 `launched`。
// 守門測試在 `tests/called-play.test.mjs`：清單裡每一個都必須查得到文案。
export const ALL_CALL_REASONS = [
  'playsOff', 'hasQuick', 'hasMain', 'mainKind', 'partner',
  'crosses', 'behind', 'outOfReach',
  'lane', 'depth', 'stagger', 'notCrossing',
  'earlier', 'inWindow', 'launched',
];

// 各戰術要求主攻者跑的線（鏡像 `approach.js` 的 COMBO_MAIN_KINDS，只為講人話用）。
// 實測 `hasMain` 是最常見的單一失敗原因（415 次／全體遠段波 27.8%，
// tools/call-feasibility-probe.mjs n=1491）⇒ 這句話玩家看得最多，值得講精確。
const MAIN_LANE_TEXT = { cross: '左翼', tandem: '右翼', delay: '左右翼' };

function reasonTextOf(reason, actualKind, type = null) {
  if (reason === 'mainKind') {
    const k = KIND_LABELS[actualKind] ?? actualKind;
    return k ? `你這球被排到「${k}」` : '你這球跑的不是那條線';
  }
  if (reason === 'hasMain') {
    const lane = MAIN_LANE_TEXT[type];
    return lane ? `這一波沒有人跑${lane}，${CALL_LABELS[type] ?? type}搭不起來`
      : '這一波沒有人跑得了主攻線';
  }
  return REASON_TEXT[reason] ?? '這球湊不出來';
}

// aiState.callOutcome → 一則浮動字卡（null＝本波沒有叫牌，不出字卡）。
// routes＝aiState.approach?.routes（拿主攻者實際跑的線，讓 mainKind 的回饋講得具體）
export function callFeedbackOf(outcome, routes = null) {
  if (!outcome) return null;
  const spec = CALL_MODES[outcome.mode] ?? CALL_MODES.command;
  const name = CALL_LABELS[outcome.type] ?? outcome.type;
  const head = `${spec.icon}${spec.word}・${name}`;
  if (outcome.outcome === 'command') {
    return { text: `${head}——照跑！`, color: spec.color, ms: 1400 };
  }
  const actual = routes?.find((r) => r.pid === outcome.mainId)?.kind ?? null;
  // 2026-08-03：失敗字卡 1600 → 2800ms。Sawmah 實玩回報「跳出來的時間很短，
  // 我看不出來為什麼我不能叫」——失敗的文案比成功的長得多（要講出哪一條沒過），
  // 卻用同一個量級的時間，讀不完。成功那條維持 1400（只有四個字）。
  return {
    text: `${head}——${reasonTextOf(outcome.reason, actual, outcome.type)}`,
    color: '#ff8a8a',
    ms: 2800,
  };
}

// 面板上的「已叫牌」狀態列（按下去之後、球還沒發之前看得到自己剛才做了什麼）
export function pendingCallTextOf(called) {
  if (!called?.type) return null;
  const spec = CALL_MODES.command; // 叫得了套路的只有 S ⇒ 恆為指令
  return `${spec.icon} 已下${spec.word}：${CALL_LABELS[called.type] ?? called.type}`;
}
