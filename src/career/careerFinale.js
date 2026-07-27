// W4(P4) Q5 — 生涯結算資料層（純函式、零 DOM/IO）：三屆定格＋招募全記錄＋
// 隊友具名送別＋主角版畢業儀式段落＋下一章佔位文案。
// 規格對標「來投開箱以上」（犧牲順序最優先保護項）。
// 送別台詞＝結算場合（隊友送「你」）——與屆末畢業儀式（送學長）不同場合、不同表；
// 具名班底手寫、招募生/補位員 generic（resolveEventsForRoster 名冊解版本同範式）

// 第 3 屆末可能在隊的具名班底（id 對應 STARTER_DEFS／FRESHMAN_HANDWRITTEN）
const FINALE_FAREWELL_BY_ID = {
  A1: [ // 阿哲——三年同行（玩家轉 S 時他是導師；台詞不分位置也成立）
    { speaker: '阿哲', text: '三年了。第一場比賽我跟你說「打丟了算我的」——後來你一顆都沒讓我扛。' },
    { speaker: '阿哲', text: '去打你的排球吧。這支隊，我們會看好。' },
  ],
  A5: [ // 小飛——成長弧養成角色（一年級入學、與玩家同屆畢業）
    { speaker: '小飛', text: '同一天入學，同一天畢業——欸，我們是同梯欸。' },
    { speaker: '小飛', text: '下次見面，別在網子同一邊了。我要親手攔你一顆。' },
  ],
  AL: [ // 小守——自由人（玩家轉 L 時讓位者；台詞不分位置也成立）
    { speaker: '小守', text: '你摔在地板上的每一球，我都記得。地板記性很好——它會記得你。' },
  ],
  N1: [ // 小雷——叛逆型「拆牆的人」（第 2 屆入學）
    { speaker: '小雷', text: '哼，畢業就跑？牆還沒拆完欸。……算了。前輩，路上小心。' },
  ],
  N2: [ // 小白——「不落地教」（第 3 屆入學）
    { speaker: '小白', text: '球沒落地，就還沒結束。所以這不是結束——你的球，還在飛。' },
  ],
};

const roleWord = { setter: '舉球', middle: '攔網', opposite: '重砲', libero: '防守', outside: '攻擊' };

// 4.5A 小件：招募生具名送別（recruitKey 對句，13 槽全補——含 -2 第二人；
// 招募生不再落 generic）。speaker＝隊內暱稱（與名冊 m.name 一致，naming 慣例）
const FINALE_FAREWELL_BY_RECRUIT = {
  'north-tech': [{ speaker: '阿澄', text: '你這三年的節奏，我都幫你數過了——一拍都沒亂。接下來的路，照這個拍子走。' }],
  'white-wave': [{ speaker: '小浪', text: '白浪教你的那句話，你帶到了最後——球沒落地，你的排球就不會結束。' }],
  obsidian: [{ speaker: '阿曜', text: '跟得上我快攻的人不多，你是一個。大學的球場——換你逼我跟上。' }],
  'iron-mist': [{ speaker: '阿鐵', text: '發球跟人生一樣，往死裡打就對了。畢業快樂——下次，網子對面見。' }],
  'sky-hawk': [{ speaker: '阿鷹', text: '在天鷹，我把王牌讓了出去。在遊隼——謝謝你讓我重新當回主角。天空的事，交給後面的人吧。' }],
  'gale-shore': [{ speaker: '小嵐', text: '我設計過幾百套球路。沒算到的只有一件事——最後一站，會捨不得走。' }],
  'black-pine': [{ speaker: '老松', text: '牆的最後一年，砌在遊隼。值得——這兩個字，畢業前再說一次。' }],
  'obsidian-2': [{ speaker: '小磐', text: '在曜石，我是第二座山。在這裡——我當了一次自己的山。謝了。' }],
  'iron-mist-2': [{ speaker: '阿霜', text: '出手不帶感情——但這句有：跟你打球，很好。' }],
  'sky-hawk-2': [{ speaker: '大隼', text: '在天鷹我是影子。在這裡，你讓我當過主角——這份帳，大學見面再還。' }],
  'gale-shore-2': [{ speaker: '阿汐', text: '潮水會退。可是在遊隼打過的每一條線，都不會消失。' }],
  'black-pine-2': [{ speaker: '大柏', text: '牆後面那門砲，你真的把它拉出來用了。……打得很痛快。' }],
};

// 隊友具名送別（Q5）：手寫者用手寫、招募生用 recruitKey 具名句（4.5A）、
// 其餘（補位員）每人一句 generic（具名、帶位置詞）。順序＝具名先、其餘按名冊序
export function finaleFarewellLines(members, playerId = 'A2') {
  const lines = [];
  const rest = [];
  for (const m of members ?? []) {
    if (m.id === playerId) continue;
    const own = FINALE_FAREWELL_BY_ID[m.id]
      ?? FINALE_FAREWELL_BY_RECRUIT[m.recruitKey ?? m.origin];
    if (own) lines.push(...own);
    else {
      rest.push({
        speaker: m.name,
        text: `跟你打${roleWord[m.role] ?? '排球'}的日子，很好。畢業快樂。`,
      });
    }
  }
  return [...lines, ...rest];
}

// 主角版畢業儀式段落（graduationRitual.perGraduate 同形 [{member, lines}]——
// 逐位聚光鏈的單人版：這次站在光裡的是你）。台詞吃戰績誠實分版。
// 4.5B §5-2（B＋案「同一套架構、三年遞進」）：傳入 heightStartM（一年級身高）
// 且與現在身高有差＝拆兩段——先聚光「三年前走進體育館的你」（一年級身高的模型），
// 收光、再聚光「現在的你」。零新機制：多一位「畢業者」＝同一條逐位聚光鏈。
export function finaleRitualSegments({
  playerName, champion, role = 'outside', heightM = 1.75, heightStartM = null,
}) {
  const openLine = { speaker: '教練', text: `${playerName}——三年前你走進體育館，遞給我一張寫著身高的體檢表。` };
  const restLines = [
    champion
      ? { speaker: '教練', text: '三年後，你把全國冠軍的獎盃放在了那張桌上。謝謝你，讓我看到這一天。' }
      : { speaker: '教練', text: '獎盃我們沒能全部拿下。但你打出來的每一球，都不欠這三年。' },
    { speaker: playerName, text: '……謝謝教練。謝謝大家。' },
    { speaker: playerName, text: '排球，我會一直打下去。' },
  ];
  const grew = heightStartM != null && Math.abs(heightStartM - heightM) > 0.005;
  if (!grew) {
    return [{
      member: { id: 'A2', name: playerName, role, height: heightM },
      lines: [openLine, ...restLines],
    }];
  }
  return [
    {
      member: { id: 'A2', name: playerName, role, height: heightStartM },
      lines: [
        openLine,
        { speaker: '教練', text: '那時的你，就這麼高。站在網子底下，抬著頭看每一個人。' },
      ],
    },
    {
      member: { id: 'A2', name: playerName, role, height: heightM },
      lines: restLines,
    },
  ];
}

// 三屆總結（吃 Q9 累積頁同一資料底）：seasons＝歷屆封存＋本屆；recruitment＝招募全記錄
export function buildFinaleSummary({ seasons, recruitment, memberNames = {} }) {
  const sum = {
    kills: 0, tipKills: 0, aces: 0, blockPoints: 0, perfects: 0,
    digs: 0, assistDigs: 0, rallySaves: 0, wins: 0, losses: 0, titles: 0,
  };
  for (const sn of seasons) {
    for (const k of ['kills', 'tipKills', 'aces', 'blockPoints', 'perfects', 'digs', 'assistDigs', 'rallySaves']) {
      sum[k] += sn.totals?.[k] ?? 0;
    }
    sum.wins += sn.wins;
    sum.losses += sn.losses;
    if (sn.champion) sum.titles += 1;
  }
  const joined = (recruitment?.recruited ?? []).map((oppId) => memberNames[oppId] ?? oppId);
  const expelled = (recruitment?.expelled ?? []).map((e) => e.member?.name ?? '');
  return { seasons, sum, recruits: { joined, expelled } };
}

// 下一章佔位（Q5：大學/實業團章 kickoff 另開，本輪只留門）
export const NEXT_CHAPTER_LINES = {
  title: '第一章・完',
  sub: '高中三年——你的排球夢，落地生根',
  next: '下一章：更高的舞台　敬請期待',
};
