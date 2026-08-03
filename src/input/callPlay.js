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
  hasMain: '你不在這一波的攻擊池裡',
  mainKind: null, // 動態：要講出他實際被排到哪條線（見 reasonTextOf）
  tier: '一傳沒到位，沒有快攻可搭',
  // 2026-07-31 文案對調：原文把罕見的「不在前排」放前面、常見的「他接了一傳」放進括號。
  // 依據＝段 B 逐條通過率（tools/combo-probe.mjs）：一傳到位 22.6% → 有 quick 配合者 20.8%，
  // 這一關只擋掉 1.8pp；而名冊是 {MB,MB} 對角（lineup.js:25,29），任何一輪都有一個 MB 在前排
  // ⇒ 真的擋在這裡時，主因幾乎一定是「前排那個 MB 接了這一傳」（D2 針對性發球吃掉 transition）。
  partner: '前排 MB 接了這一傳，沒時間跑快攻（或他不在前排）',
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
  // 2026-08-03 更正：括號裡原本寫「一傳沒到位，或 MB 不在前排」＝**猜的兩個原因**，
  // 而實際觸發條件是「池裡沒有人跑 A 快」，成因至少三種，且依本檔 :67-70 的實測，
  // **最常見的是「前排那個 MB 接了這一傳」**（D2 針對性發球專吃這個）。
  // Sawmah 實玩回報「MB 明明在前排卻說他在後排」＝被這句猜錯的括號誤導。
  // 講不出確切原因就不要猜——只陳述判定結果，並把最常見的成因擺第一個。
  hasQuick: '這一波沒有人跑快攻——前排 MB 接了這一傳，或他不在前排',
  playsOff: '這個賽季還沒有戰術可以叫',
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
    text: `${head}——${reasonTextOf(outcome.reason, actual)}`,
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
