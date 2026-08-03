// Phase 4 W2 — 身高→位置建議與教練話術（純函式，零 three.js/DOM，node 可測）
// 憲法依據：Q7（誠實建議→志願登記→一律 OH 出道）＋縫隙 3（培育邏輯話術）。
// 拍板（W2 工單 A2/A3/A4）：
//   映射表區帶重疊＝並列雙建議（「兩條路都看好你」），不用種子擲骰傾斜；
//   建議只看當下身高不偷看成長種子；台詞埋成長預留句（陳述事實、不許諾終點）；
//   屆間跨帶＝教練追加動態評語（「現在的你，我重新看好 MB」式）；
//   三段式模板：誠實判定 →（建議位未開放時）培育邏輯 → 志願確認；
//   志願違背建議＝追加尊重存疑句（「行，用球說服我」——轉位事件的情感前置投資）。
// W2 現況：五位置玩法工程＝W3+，除 OH 外全部未開放——培育邏輯句恆出現於非 OH 建議。
import { ROLE_ABBR } from './roster.js';

const ROLE_NAME = {
  // 2026-08-03 Sawmah 命名裁定：OPP 一律叫「舉對」（舉球員的對角）
  setter: '舉球員', outside: '主攻手', middle: '攔中', opposite: '舉對', libero: '自由人',
};

// A2 映射表（公分；找第一個 cm < max 的帶——165/175/183/192 落在各自上一帶的下緣）
export const ADVICE_BANDS = [
  { key: 'under165', max: 165, primary: ['libero'], secondary: 'setter' },
  { key: 'b165to175', max: 175, primary: ['libero', 'setter'], secondary: 'outside' },
  { key: 'b175to183', max: 183, primary: ['setter', 'outside'], secondary: 'opposite' },
  { key: 'b183to192', max: 192, primary: ['outside', 'opposite'], secondary: 'middle' },
  { key: 'over192', max: Infinity, primary: ['middle'], secondary: 'opposite' },
];

export function adviceFor(cm) {
  const band = ADVICE_BANDS.find((b) => cm < b.max) ?? ADVICE_BANDS[ADVICE_BANDS.length - 1];
  return { ...band, cm };
}

export function roleLabel(role) {
  return `${ROLE_NAME[role] ?? role}（${ROLE_ABBR[role] ?? '?'}）`;
}

// ---- A4 第一段：誠實判定（依帶各一段；並列帶明說「兩條路都看好你」）----
const JUDGE_BY_BAND = {
  under165: (cm) => `${cm} 公分……不高，這我不騙你。但排球場上有一個位置，天生就是留給不高的人的——自由人。球不落地，比誰都重要。`,
  b165to175: (cm) => `${cm} 公分。自由人的靈活你有，舉球員的視野你也搆得著——兩條路我都看好你，這不是客套話。`,
  b175to183: (cm) => `${cm} 公分，很標準的球員身材。組織的舉球員、得分的主攻手——兩條路都看好你，看你想當供球的人，還是終結的人。`,
  b183to192: (cm) => `${cm} 公分——好身材。主攻或對角，兩條路都看好你：一邊吃全隊的球權，一邊扛關鍵分的砲位。`,
  over192: (cm) => `${cm} 公分……全隊抬頭看你的高度。攔中——網前那道牆，就該是你的位置。`,
};

// 成長預留句（A3 配套 1：陳述事實、不許諾終點）
const GROWTH_RESERVE_LINE = { speaker: '教練', text: '還有——你這個年紀還會長，別把路走死。' };

// ---- A4 第二段：培育邏輯（縫隙 3 原句精神；建議位未開放＝先從主攻練起）----
const NURTURE_BY_ROLE = {
  libero: '你的身材是天生的自由人——但一年級先從主攻練起，把攻防的球感練全，我看著你。',
  setter: '舉球員要先懂攻擊手要什麼球——一年級先從主攻練起，打過的人才舉得出好球。',
  middle: '牆不是光靠高度砌的——一年級先從主攻練起，懂進攻的人，才知道怎麼攔進攻。',
  opposite: '對角的砲，是從主攻的線路裡練出來的——一年級先打主攻，把揮臂練滿。',
  outside: '主攻正好是一年級的起點——先把這條路打穩，其他的路，隨時能開。',
};

// ---- A4 第三段：志願確認 ----
const ASK_LINE = { speaker: '教練', text: '說吧，你想走哪個位置？志願我記著——時候到了，我親自來開這扇門。' };

// 創角教練面談（三段式全串；呼叫端以 dialogPlay 播放後開志願選單）
export function coachAdviceLines(cm) {
  const adv = adviceFor(cm);
  const lines = [{ speaker: '教練', text: JUDGE_BY_BAND[adv.key](cm) }];
  lines.push({
    speaker: '教練',
    text: `次選的話，${roleLabel(adv.secondary)}也走得通。`,
  });
  lines.push(GROWTH_RESERVE_LINE);
  // 建議位未開放（W2＝OH 以外全未開放）→ 培育邏輯；建議含 OH 亦給出道說明
  const nurtureRole = adv.primary.includes('outside') ? 'outside' : adv.primary[0];
  lines.push({ speaker: '教練', text: NURTURE_BY_ROLE[nurtureRole] });
  lines.push(ASK_LINE);
  return lines;
}

// ---- 志願回覆（primary 命中／secondary／違背建議三分支×五位置全覆蓋）----
const AFFIRM_BY_ROLE = {
  libero: '自由人——好。那件不同色的球衣，等你贏得它。',
  setter: '舉球員——好。全隊的節奏交到你手上之前，先學會看懂每一個人。',
  outside: '主攻——好。那就沒什麼好繞的，從今天起直直往前打。',
  opposite: '對角——好。關鍵分的重量，你遲早要習慣。',
  middle: '攔中——好。那道牆，我等你砌起來。',
};
const SECONDARY_REPLY = '不是我第一眼看好的路——但講得通。這條志願，我記下了。';
const DOUBT_BY_ROLE = {
  libero: '你要往地板鑽？行，用球說服我——先讓我看到球不落地。',
  setter: '你想舉球？行，用球說服我——先讓我看到你眼裡有全場。',
  outside: '主攻？行，用球說服我——先讓我看到你的線路，不只一條。',
  opposite: '對角？行，用球說服我——先扛得起關鍵分再說。',
  middle: '你要去網前當牆？行，用球說服我——先讓我看到你的攔網時機。',
};

export function aspirationReplyLines(cm, role) {
  const adv = adviceFor(cm);
  const lines = [];
  if (adv.primary.includes(role)) {
    lines.push({ speaker: '教練', text: AFFIRM_BY_ROLE[role] });
  } else if (adv.secondary === role) {
    lines.push({ speaker: '教練', text: SECONDARY_REPLY });
  } else {
    lines.push({ speaker: '教練', text: DOUBT_BY_ROLE[role] ?? '行，用球說服我。' });
  }
  lines.push({
    speaker: '教練',
    text: `志願登記：${roleLabel(role)}。一年級，先從主攻手出發——去吧。`,
  });
  return lines;
}

// ---- A3 配套 2：屆間跨帶檢查（長高跨進新身高帶＝教練追加動態評語）----
const BAND_SHIFT_COMMENT = {
  b165to175: '長高了之後再看——舉球員那條路，現在的你也搆得到了。',
  b175to183: '這個身高，主攻的門對你開了——現在的你，我重新看好攻擊線。',
  b183to192: '現在的你，我重新看好對角——那個扛關鍵分的砲位，你搆得到了。',
  over192: '現在的你，我重新看好攔中——那道牆，輪到你來砌。',
};

// 跨帶＝回傳教練評語台詞列；未跨帶＝null（呼叫端跳過）
export function bandShiftLines(fromCm, toCm) {
  const from = adviceFor(fromCm);
  const to = adviceFor(toCm);
  if (from.key === to.key) return null;
  const text = BAND_SHIFT_COMMENT[to.key]
    ?? '身高變了，看你的眼光也得跟著變——路，比去年多了一條。';
  return [{ speaker: '教練', text }];
}
