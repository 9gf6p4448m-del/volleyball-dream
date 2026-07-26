// Phase 4 W3 — 轉位事件（教練談話）資料層：純函式，零 DOM/IO。
// 憲法 Q7：換位＝劇情事件驅動，gated on 位置旗標 open（Sawmah 手批）；
// 縫隙 3：志願位置達 open＝優先觸發；縫隙 1：每個轉位事件必附被取代者的劇情安排
// （阿哲組＝層次二導師，介面契約見 mentor.js；其餘＝層次一敘事稿，按名冊解版本——
// resolveEventsForRoster 範式：誰在隊、誰開口）。
// UI 掛點＝careerScreen 屆間鏈尾端；接受的存檔面＝careerStore.applyPositionChange。

// libero＝工單 §8 AL 槽建隊特例（已落地：defaultLineup L 特例＋careerMatchSetup
// liberos 通道＋applyPositionChange 放行）——候選齊四位置
export const TALK_CANDIDATES = ['setter', 'middle', 'opposite', 'libero'];

const nameOf = (members, id, fallback) => members?.find((m) => m.id === id)?.name ?? fallback;

// 談話判定：open 且非現任位置，志願優先、其餘按候選序（決定論）。
// 回傳 null＝本屆間無談話；{ role, offerLines, acceptLines, declineLines }
export function positionTalkFor({ flags, player, members }) {
  if (!player) return null;
  const cur = player.currentRole ?? 'outside';
  const asp = player.aspiration;
  const order = [...new Set([asp, ...TALK_CANDIDATES])].filter((r) => TALK_CANDIDATES.includes(r));
  const role = order.find((r) => r !== cur && flags?.[r] === 'open');
  if (!role) return null;
  return {
    role,
    offerLines: offerLinesFor(role, asp === role),
    acceptLines: acceptLinesFor(role, members ?? []),
    declineLines: DECLINE_LINES,
  };
}

// ---- 教練開場（縫隙 3 培育話術的兌現：志願命中＝回收入學面談的承諾）----

function offerLinesFor(role, aspMatch) {
  if (role === 'setter') {
    return aspMatch ? [
      { speaker: '教練', text: '還記得入學面談我說的話嗎——先從主攻練起，把球感練全，我看著你。' },
      { speaker: '教練', text: '我看完了。你看場的那雙眼睛，已經是舉球員的眼睛。' },
      { speaker: '教練', text: '轉舉球員。從下一場起，這支隊的進攻由你組織——要不要接？' },
    ] : [
      { speaker: '教練', text: '阿哲昨晚跟我談了很久。' },
      { speaker: '教練', text: '他說，隊裡看場最準的不是他，是你。我同意。' },
      { speaker: '教練', text: '轉舉球員。這支隊的進攻交到你手上——要不要接？' },
    ];
  }
  if (role === 'middle') {
    return aspMatch ? [
      { speaker: '教練', text: '入學那天你登記了攔中，我要你先從主攻練起。你等到今天了。' },
      { speaker: '教練', text: '中間的牆缺一塊。你的攔網時機，我看了一整季。' },
      { speaker: '教練', text: '轉攔中——要不要接？' },
    ] : [
      { speaker: '教練', text: '你在網前的判斷，比誰都快半拍。' },
      { speaker: '教練', text: '中間的牆，需要的正是這半拍。轉攔中——要不要接？' },
    ];
  }
  if (role === 'libero') {
    return aspMatch ? [
      { speaker: '教練', text: '入學面談那天我說過——你的身材是天生的自由人，先從主攻練起，我看著你。' },
      { speaker: '教練', text: '我看著你把球感練全了。現在，地板是你的了。' },
      { speaker: '教練', text: '轉自由人。異色球衣、後排的每一寸地——要不要接？' },
    ] : [
      { speaker: '教練', text: '你接球的判斷，全隊沒人比得上——包括小守。' },
      { speaker: '教練', text: '不能得分的位置，是把全隊的分都扛在背上的位置。' },
      { speaker: '教練', text: '轉自由人——要不要接？' },
    ];
  }
  // opposite
  return aspMatch ? [
    { speaker: '教練', text: '你登記志願那天寫的是右翼重砲。我記著，一直記著。' },
    { speaker: '教練', text: '轉主攻對角。右翼的高球、後排的 D 球，全歸你——要不要接？' },
  ] : [
    { speaker: '教練', text: '你的攻擊，硬到左翼快裝不下了。' },
    { speaker: '教練', text: '右翼缺一門重砲。轉主攻對角——要不要接？' },
  ];
}

// ---- 接受後的被取代者劇情（縫隙 1；名冊解版本）----

function acceptLinesFor(role, members) {
  if (role === 'setter') {
    // 阿哲組＝層次二「表現讀取導師」：讓出主舉、轉副手兼導師（現實 5-1 雙舉概念）。
    // 導師對話由 box score 規則觸發＝W4 接數據（介面契約在 mentor.js）；此處是交接當下
    return [
      { speaker: '阿哲', text: '不用教練說，我自己來講。' },
      { speaker: '阿哲', text: '位置給你。別擺那種臉——我不是退下來，是升格。副手，兼你的教練。' },
      { speaker: '阿哲', text: '從今天起，你舉的每一球我都看著。舉歪了我會唸；舉順了——我也會唸。習慣吧。' },
    ];
  }
  if (role === 'middle') {
    const hasIwan = members.some((m) => m.id === 'A6');
    const hasRai = members.some((m) => m.id === 'N1');
    if (hasIwan && hasRai) {
      // 第 2 屆：阿岩仍在（安靜寡言）＋小雷（叛逆型「拆牆的人」）——兩代 MB 同場的交接
      return [
        { speaker: nameOf(members, 'A6', '阿岩'), text: '……牆，交給你。好好蓋。' },
        { speaker: nameOf(members, 'N1', '小雷'), text: '哈？這樣也行？搶位置的居然是你。' },
        { speaker: nameOf(members, 'N1', '小雷'), text: '行啊。那從今天起你也是牆了——我連你一起拆。練球見真章。' },
      ];
    }
    if (hasRai) {
      // 第 3 屆：阿岩已畢業——小雷獨挑（對照組：叛逆型面對競爭的姿態）
      return [
        { speaker: nameOf(members, 'N1', '小雷'), text: '搶位置的來了。……我等這種戲碼很久了。' },
        { speaker: nameOf(members, 'N1', '小雷'), text: '醜話說前面——你蓋不住的球，別怪我快攻沒人開路。用攔網說話。' },
      ];
    }
    const mb = members.find((m) => m.role === 'middle');
    return [
      { speaker: mb?.name ?? '隊友', text: '位置讓給你。……拜託，把中間守住。' },
    ];
  }
  if (role === 'libero') {
    // 小守（AL）讓位＝層次一；第 3 屆 L 手寫新生在隊＝三人關係版（人設未定案＝
    // 不具名不寫性格，只留位置關係——甲3② 拍板：選案接線另輪，屆時改寫此版）
    const hasFreshLibero = members.some((m) => m.role === 'libero' && m.origin === 'handwritten');
    const base = [
      { speaker: '小守', text: '異色球衣給你。……說真的，有一點鬆了口氣，也有一點捨不得。' },
      { speaker: '小守', text: '後排這片地，比看起來大十倍。摔下去的時候，想著球，別想著痛。' },
    ];
    if (hasFreshLibero) {
      base.push({ speaker: '小守', text: '那個一年級的，也走這條路。你們倆——會把彼此逼得更強吧。' });
    }
    return base;
  }
  // opposite：被取代者＝現任 OPP（補位員或招募生——名冊直查；縫隙 1 層次一）
  const opp = members.find((m) => m.role === 'opposite');
  return [
    { speaker: opp?.name ?? '隊友', text: '右翼……讓給你。本來想著，能一直打到畢業的。' },
    { speaker: opp?.name ?? '隊友', text: '沒關係。下一場，讓我在板凳上看清楚——你值不值這個位置。' },
  ];
}

export const DECLINE_LINES = [
  { speaker: '教練', text: '行。位置不是我塞給你的，是你自己拿的——想通了，門一直開著。' },
];
