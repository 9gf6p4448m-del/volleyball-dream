// 「叫戰術對你這個位置是什麼」——單一真相源（2026-08-09）
//
// ★ 為什麼獨立成一個葉模組 ★ 這份文案有兩個消費端：
//   ① `events.js` 的 `teach-call`（第一次集訓，`roleLines`）——第一次學會這道閘時
//   ② `positionEvents.js` 的轉位接受對話——**學會之後才換位置**的人的補課
// 而 `events.js → careerState.js → positionEvents.js` 已經是一條相依鏈，
// 若讓 positionEvents 反向 import events 就成環。本檔零 career 相依 ⇒ 兩邊都 import 得起來，
// 文案也只有一份（剛剛才修過「體力／控制」vs「耐力／控球」的同名分岔，不再製造第二次）。
//
// ★ 這些句子必須與碼一致 ★（teach-call 原註解的要求，照搬）：
//   OH ＝ `cross` 主攻只認 `left`／OPP ＝ 交叉走不到 `right`、`delay` 認 `right`，
//   且夾塞（🤝）是 OPP 專屬／MB ＝ 配合者恆為 `quick`＋`bquick` 單人型是他的／
//   L ＝ 一傳 tier 決定攻擊池（`perfect` 才有快攻）／S ＝ 唯一拿得到叫牌清單的人。

export const CALL_PLAY_ROLE_LINES = {
  setter: { speaker: '阿哲', text: '你也是舉球的——那這套不是給你「點菜」用的，是你的球權。誰跑、誰當幌子，你決定。' },
  outside: { speaker: '阿哲', text: '交叉那條線就是你的——中間先跳把牆拐走，你從他背後穿出來，我喊交叉多半就是喊你。還有一條不用等我：一傳起來的時候你自己按內切，從外面切進中路，那一下你說了算。' },
  opposite: { speaker: '阿哲', text: '你在右邊，交叉走不到你那條線——你的是夾塞：貼在中間那個的正後方跑，牆被他吃住，你從同一條路再打一次。一傳起來想跑就自己按夾塞，別等我喊。' },
  middle: { speaker: '阿哲', text: '你不是被叫的那個——你是幌子。牆跟著你走，別人才有地方打。當然，偶爾我是真的給你，B快。' },
  libero: { speaker: '阿哲', text: '你不進攻，但每一套都從你的一傳開始——一傳到位，快攻和交叉才叫得出來；一傳歪了，就只剩兩邊高球。' },
};

// 轉位補課的開場橋接句：沒有這一句，位置說明會像突然插播。
const BRIDGE = { speaker: '阿哲', text: '還有一件事——你換了位置，那套叫出來的戰術對你的意思也跟著換了。' };

/**
 * 轉位接受時要不要補一段「叫戰術對新位置是什麼」。
 *
 * ★ 為什麼需要它 ★ `teach-call` 是 once 事件、掛在第一次集訓（seasonIndex=2），
 * 播的是**當下那個位置**的 `roleLines`。第 3 屆才轉任 OPP 的玩家於是永遠聽不到夾塞那段，
 * 卻在比賽裡看得到那顆 🤝 紫鈕（`canCallPlay` 同時管 S 的分配面板、OH 的內切、OPP 的夾塞）。
 *
 * ★ 閘在「已經學會」而不是屆數 ★ 還沒學會的人不必補課——他之後的第一次集訓會照常上，
 * 那時 `resolveEventsForRole` 已經吃的是轉位後的新位置，補了反而變重播。
 *
 * @param {object} o.role   轉任的**新**位置
 * @param {object} o.player 轉位前的主角（技術欄不因轉位改變，前後讀都一樣）
 * @returns {Array} 要接在轉位接受對話尾端的台詞（空陣列＝不補）
 */
export function callPlayBriefFor({ role, player }) {
  if ((player?.techniques?.callPlay ?? 0) < 1) return [];
  const line = CALL_PLAY_ROLE_LINES[role];
  return line ? [BRIDGE, line] : [];
}
