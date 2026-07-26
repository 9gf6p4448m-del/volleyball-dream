// Phase 4 W3 — 阿哲導師介面契約（縫隙 1 層次二「表現讀取導師」）
// W3 只立契約：規則資料形狀＋純函式解析器＋決定論測試；W4 box score 上線後接真實數據
// （掛點＝賽後鏈，玩家 currentRole==='setter' 時逐場檢查）。規則觸發＝決定論非隨機、
// 按序檢查第一條命中即觸發（每場至多一句——導師是前輩的關心，不是 AI 教練百科）。
//
// ★ Box score 輸入契約（W4 記帳端必須供給的最小欄位；來源＝sim 決定論事件流攔截）：
//   {
//     sets:   { [pid]: number },   // 玩家=S 本場對每位隊友的舉球分配數
//     names:  { [pid]: string },   // pid → 顯示名（台詞插值用）
//     keyPoint: { sets: number, kills: number },  // 關鍵分（賽點/24 分後）的分配數與成功數
//     consecErrors: number,        // 本場最長連續失誤段（玩家舉球歸因）
//     result: { won: boolean },
//   }

export const MENTOR_RULES = [
  {
    // 連續失誤後的鼓勵（拍板核心條目；鼓勵優先於一切檢討——前輩先當人再當教練）
    id: 'slump-cheer',
    hits: (bs) => (bs.consecErrors ?? 0) >= 3,
    lines: () => [
      { speaker: '阿哲', text: '連噴三顆的滋味不好受吧。我也嚐過，比你想的更多次。' },
      { speaker: '阿哲', text: '下一球照你的節奏舉。失誤要忘得快——這也是舉球員的技術。' },
    ],
  },
  {
    // 分配集中度（拍板核心條目：「你都只舉給小飛」）
    id: 'concentration',
    hits: (bs) => {
      const counts = Object.values(bs.sets ?? {});
      const total = counts.reduce((a, b) => a + b, 0);
      return total >= 8 && Math.max(0, ...counts) / total >= 0.5;
    },
    lines: (bs) => {
      const [pid] = Object.entries(bs.sets).sort((a, b) => b[1] - a[1])[0];
      const name = bs.names?.[pid] ?? '同一個人';
      return [
        { speaker: '阿哲', text: `今天的球，一半以上都到了${name}手上。` },
        { speaker: '阿哲', text: '信任是好事。但被對手讀死，就是另一回事了——舉球員的牌，要藏。' },
      ];
    },
  },
  {
    // 關鍵分表現（拍板核心條目）
    id: 'key-nerve',
    hits: (bs) => (bs.keyPoint?.sets ?? 0) >= 2
      && (bs.keyPoint.kills / bs.keyPoint.sets) >= 0.5,
    lines: () => [
      { speaker: '阿哲', text: '關鍵分你敢把球給出去，還給對了地方。' },
      { speaker: '阿哲', text: '這種膽子，我練了兩年才有。你比我快。' },
    ],
  },
  {
    // 分配散度讚許（第 4 條：集中度的鏡像——牌桌打得漂亮也要有人說）
    id: 'spread-praise',
    hits: (bs) => {
      const counts = Object.values(bs.sets ?? {});
      const total = counts.reduce((a, b) => a + b, 0);
      return total >= 8 && Math.max(0, ...counts) / total <= 0.34;
    },
    lines: () => [
      { speaker: '阿哲', text: '今天對面的攔網手，到最後都還在猜你要舉哪。' },
      { speaker: '阿哲', text: '漂亮。這就是舉球員的牌桌。' },
    ],
  },
];

// 賽後導師台詞：第一條命中的規則（決定論）；無命中＝null（導師不硬找話講）
export function dueMentorLines(boxScore) {
  if (!boxScore) return null;
  for (const rule of MENTOR_RULES) {
    if (rule.hits(boxScore)) return { id: rule.id, lines: rule.lines(boxScore) };
  }
  return null;
}
