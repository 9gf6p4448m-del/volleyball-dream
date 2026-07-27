// Phase 2 stage 4 — 輕量劇情事件（決策第 9 題：資料驅動事件表，不硬寫 if）
// 賽前/賽後對話框＋隊友 trust 事件（文字、無立繪）；Phase 3 完整劇情在此表上長
// when 條件全宣告式；effect.trust 經 sim trust.js updateTrust 調整持久 baseline
import { nextMatch } from './careerState.js';
import { opponentById } from './opponents.js';

// 命名工程定案（07-25）：speaker 具名——我方隊長＝大山（MB）、二傳＝阿哲；
// 各校角色對應 opponents.js squad 具名（王牌稱號偶爾入台詞，不逐句喊）
export const EVENT_DEFS = [
  {
    id: 'debut',
    moment: 'pre',
    when: { matchId: 'group-1' },
    lines: [
      { speaker: '大山', text: '新人，第一場別想太多——球來了就打，其他交給我們。' },
      { speaker: '阿哲', text: '舉給你的球，放心打。打丟了算我的。' },
    ],
  },
  {
    id: 'mb-warn',
    moment: 'pre',
    when: { opponentId: 'obsidian', stage: 'group' },
    lines: [
      { speaker: '大山', text: '曜石的詹子曜——人稱「黑曜箭」，又快又急。中路封起來之前，別跟他硬碰。' },
    ],
  },
  {
    id: 'first-win',
    moment: 'post',
    when: { wonLast: true, playedCount: 1 },
    effect: { trust: 3 },
    lines: [
      { speaker: '阿哲', text: '打得不錯嘛，新人。下一場，關鍵分也敢給你了。' },
    ],
  },
  {
    id: 'first-loss',
    moment: 'post',
    when: { wonLast: false, lossCount: 1 },
    effect: { trust: 2 },
    lines: [
      { speaker: '阿哲', text: '別背著。輸球是全隊的事——下一顆，我照樣給你。' },
    ],
  },
  {
    id: 'hot-hand',
    moment: 'post',
    when: { minKills: 5 },
    effect: { trust: 4 },
    lines: [
      { speaker: '阿哲', text: '你手感燙起來了。之後的球，會更常到你手上。' },
    ],
  },
  // ---- 技術傳授線（改版裁定：技術經故事習得，每場一招；輸贏都教——敗者也有收穫）----
  {
    id: 'teach-tip',
    moment: 'post',
    when: { lastMatchId: 'group-1' },
    effect: { unlock: 'tip' },
    lines: [
      { speaker: '北原工商・杜品澄', text: '你只會全力打直球啊，新人。力量不夠的時候——用腦子打。' },
      { speaker: '北原工商・杜品澄', text: '看好，手腕放軟、指尖推球。這叫吊球。拿去用吧。' },
    ],
  },
  {
    id: 'teach-dive',
    moment: 'post',
    when: { lastMatchId: 'group-2' },
    effect: { unlock: 'dive' },
    lines: [
      { speaker: '白浪高中・蔡沐恩', text: '看到我們救了幾顆你們以為落地的球嗎？防守不是站著等球來。' },
      { speaker: '白浪高中・蔡沐恩', text: '撲出去。會痛，但球不會落地。這叫魚躍——送你了。' },
      // 主角傳承節點（拍板敘事：對手教主角→隊長請主角教全隊＝隊友 diveRate 解鎖的劇情面）
      // 07-27 拍板 B（自由人天生會魚躍）配套：小守不在「被教」之列——大山順勢點出
      // 他一直是隊上唯一會撲的人（戲份少的角色被看見）
      { speaker: '大山', text: '學到好東西了？回去教教大家——球不落地不結束，全隊都得會。小守那一套，總算有人能陪他練了。' },
    ],
  },
  {
    id: 'teach-pipe',
    moment: 'post',
    when: { lastMatchId: 'group-3' },
    effect: { unlock: 'pipe' },
    lines: [
      { speaker: '曜石體中・詹子曜', text: '你的進攻只有前排三公尺。我們的進攻，是整片場地。' },
      { speaker: '曜石體中・詹子曜', text: '後排起跳、攻擊線後起飛——pipe。學會它，你才算立體。' },
    ],
  },
  {
    id: 'teach-float',
    moment: 'post',
    when: { lastMatchId: 'national-qf' },
    effect: { unlock: 'floatServe' },
    lines: [
      { speaker: '鐵霧工業・劉振鎧', text: '光有力氣的發球，練十年也就那樣。最難接的球——是不轉的球。' },
      { speaker: '鐵霧工業・劉振鎧', text: '掌根擊球心、瞬間停腕。飄浮球會自己跳舞。' },
      // 主角傳承節點（同 teach-dive：隊友 floatServeRate 解鎖的劇情面）
      { speaker: '大山', text: '那手飄浮球——回去也教教大家。發球輪多幾種武器。' },
    ],
  },
  {
    // 拍板 2026-07-22：提前到小組第三場（原排準決賽賽後——scouting 讀取最兇的
    // 準決賽/決賽反而沒工具用，時序自相矛盾；提前後=曜石預告要讀你→假動作正是答案
    id: 'teach-feint',
    moment: 'post',
    when: { lastMatchId: 'group-3' },
    effect: { unlock: 'feint' },
    lines: [
      { speaker: '曜石體中・石宇廷', text: '你的每一球，我們都記下來了。再遇到的時候——你那些慣用線，一條都過不了。' },
      { speaker: '曜石體中・石宇廷', text: '會被讀的人，才需要學騙。眼睛看左、手打右——當作見面禮，拿去。' },
    ],
  },
  {
    id: 'teach-jump',
    moment: 'pre',
    when: { matchId: 'national-final' },
    effect: { unlock: 'jumpServe' },
    // W2(P4) 年級守衛（拍板①保底轉授）：大山（A3）已畢業＝播 altLines 轉授版
    // ——新隊長阿哲以「大山留下的東西」名義轉授，跳發照樣學到（effect 不變）
    elderId: 'A3',
    lines: [
      { speaker: '大山', text: '決賽了。把我壓箱的東西給你——跳躍發球，我們隊史上只有兩個人發得動。' },
      { speaker: '大山', text: '助跑、拋球、當它是扣球打下去。天鷹統治天空的高度——去讓他們見識，遊隼統治天空的速度。' },
    ],
    altLines: [
      { speaker: '阿哲', text: '決賽了。大山學長畢業前，把他壓箱的東西留給了球隊——跳躍發球。他說，交給下一個敢打關鍵球的人。' },
      { speaker: '阿哲', text: '助跑、拋球、當它是扣球打下去。人不在，牆留下的東西還在——去讓天鷹見識，遊隼統治天空的速度。' },
    ],
  },
  {
    id: 'nationals',
    moment: 'pre',
    when: { matchId: 'national-qf' },
    lines: [
      { speaker: '教練', text: '全國賽，單淘汰——輸一場就收隊回家。放開打，別留手。' },
    ],
  },
  // 宿敵差分（stage 5）：小組賽對曜石的勝敗決定再遇的對話——scouting 記憶同步生效
  {
    id: 'rematch-won',
    moment: 'pre',
    when: { matchId: 'national-sf', wonVs: 'obsidian' },
    elderId: 'A3', // W2(P4) 年級守衛：大山已畢業＝阿哲以隊長身分接手宿敵情報
    lines: [
      { speaker: '大山', text: '曜石。小組賽輸給我們之後，他們把你的每一球都看了三遍。' },
      { speaker: '阿哲', text: '他們衝著你來的。慣用的線路會被讀死——換節奏，或者用騙的。' },
    ],
    altLines: [
      { speaker: '阿哲', text: '曜石。小組賽輸給我們之後，他們把你的每一球都看了三遍——這種執念，大山學長那屆就領教過。' },
      { speaker: '阿哲', text: '他們衝著你來的。慣用的線路會被讀死——換節奏，或者用騙的。' },
    ],
  },
  {
    id: 'rematch-lost',
    moment: 'pre',
    when: { matchId: 'national-sf', lostVs: 'obsidian' },
    elderId: 'A3',
    lines: [
      { speaker: '大山', text: '又是曜石。小組賽欠他們一場——今天當面討回來。' },
      { speaker: '阿哲', text: '他們記得你怎麼打的。上次的套路不會再通——拿出新的東西。' },
    ],
    altLines: [
      { speaker: '阿哲', text: '又是曜石。小組賽欠他們一場——學長們沒討回來的帳，今天當面討。' },
      { speaker: '阿哲', text: '他們記得你怎麼打的。上次的套路不會再通——拿出新的東西。' },
    ],
  },
];

// W2(P4) canon 事件年級守衛（拍板①保底轉授）：帶 elderId 的事件，該成員已不在
// 現役名冊（畢業入 alumni）＝改播 altLines（effect/id 不變——技術照學、去重照走）。
// members＝現役名冊；null/undefined（無名冊的舊路徑）＝視同在隊、播原版（安全預設）。
export function resolveEventsForRoster(evs, members) {
  if (!Array.isArray(members)) return evs;
  return evs.map((e) => (
    e.elderId && e.altLines && !members.some((m) => m.id === e.elderId)
      ? { ...e, lines: e.altLines }
      : e
  ));
}

// ---- W5 逐出台詞（B5 拍板：2 行極簡，被逐者一行＋隊長一行，平靜克制）----
// 玩家主動點擊觸發（非賽程狀態驅動），故不進 EVENT_DEFS 條件比對；沿用 {speaker,text}
// 形狀以復用 dialogPlay（呼叫端包一層 [{ lines: EXPEL_LINES }]）。
// W1(P4)：speaker 大山→阿哲——大山第 1 屆末畢業，第 2 屆起逐出仍可觸發，畢業者
// 不得開口（隊長交接未拍板＝W2 議題，暫由三屆全程在隊的信任核心代言）
export const EXPEL_LINES = [
  { speaker: '（離隊者）', text: '……我明白。這段路，謝謝你們帶我走過。' },
  { speaker: '阿哲', text: '是你自己選的路。走吧——別回頭。' },
];

// ---- W7.1 屆間訓練營台詞（#6 拍板 C 案：主角 stamina +2/屆走事件不走灑點）----
export const OFFSEASON_TRAINING_LINES = [
  { speaker: '教練', text: '這個冬天沒白練——你的底氣厚了。（耐力 +2）' },
];

// ---- W5 賽季開場（A4 拍板：最小劇情，衛冕/捲土重來各一段隊長對話）----
// advanceSeason 成功後由 careerScreen 播放（衛冕＝defend、止步捲土重來＝comeback）。
// W1(P4)：speaker 大山→阿哲——開場只在進入第 2/3 屆時播，而大山第 1 屆末必畢業，
// 亡靈不得訓話（UI 實跑抓到的敘事 bug）；隊長交接未拍板＝W2 議題
export const SEASON_OPENERS = {
  defend: [
    { speaker: '阿哲', text: '新的一屆了。現在全國都認得遊隼——冠軍掛在我們身上，每一隊都衝著我們來。' },
  ],
  comeback: [
    { speaker: '阿哲', text: '輸掉的那場記著就好。名冊還在、你也更強了——這一屆，遊隼重新起飛。' },
  ],
};

// ---- 學招預告（Sawmah 07-23 拍板：情蒐帶開頭字幕）----
// 這場打完會傳授、且尚未播過的技術（輸贏都教——既有政策）。從 EVENT_DEFS 導出＝
// 自維護：教學鏈改場次/加招式，預告自動跟。只看 post＋lastMatchId（賽前 pre 傳授
// 如決賽跳發，進場前已播完，無需預告）；跨屆已學（events 保留）不再預告。
export function upcomingTeach(career, matchId) {
  const triggered = career?.events ?? [];
  return EVENT_DEFS
    .filter((e) => e.moment === 'post' && e.when.lastMatchId === matchId
      && e.effect?.unlock && !triggered.includes(e.id))
    .map((e) => e.effect.unlock);
}

// 取當下應觸發的事件（依表序；已觸發者不重複）。
// moment 'pre'＝出戰前（條件看下一場）；'post'＝賽後回到生涯畫面（條件看最後一場）
export function dueEvents(career, moment) {
  const triggered = career.events ?? [];
  const last = career.results[career.results.length - 1] ?? null;
  const next = nextMatch(career);
  return EVENT_DEFS.filter(
    (e) => e.moment === moment && !triggered.includes(e.id) &&
      matchesWhen(e.when, { career, last, next }),
  );
}

// ---- W7 D1 舊隊情結（拍板 A：動態賽前事件——EVENT_DEFS 開動態入口、不硬編 12 條）----
// 名冊中來自下一場對手原隊的隊友（dna.teamId＝招募來源隊）→ 賽前插一段動態對話
// （speaker＝隊友名、模板帶原隊名）。id 綁 member×原隊＝每人對原隊一生一次
// （去重走 career.events 既有管道；場內效果 D2/D3 每次對戰都生效，不受此限）。
// 與 dueEvents 靜態表分開：這裡需要 roster（dueEvents 只吃 career），呼叫端合流
export function oldTeamPreEvents(career, roster) {
  const next = nextMatch(career);
  if (!next) return [];
  const triggered = career.events ?? [];
  const teamName = opponentById(next.opponentId)?.name ?? '老東家';
  // W1(P4)：收尾句由現任隊長講——大山畢業後（第 2 屆起）不得開口；名冊無 captain
  // 旗標時（隊長交接未拍板＝W2 議題）暫由阿哲代言
  const captain = (roster?.members ?? []).find((m) => m.captain)?.name ?? '阿哲';
  return (roster?.members ?? [])
    .filter((m) => m.dna?.teamId === next.opponentId)
    .map((m) => ({
      id: `old-team-${m.id}-${next.opponentId}`,
      moment: 'pre',
      lines: [
        { speaker: m.name, text: `${teamName}……我以前的隊。這場讓我上，我不會手軟。` },
        { speaker: captain, text: '不用你說。把你練出來的人就在網子對面——打給他們看。' },
      ],
    }))
    .filter((e) => !triggered.includes(e.id));
}

// ---- W1(P4) 畢業儀式（憲法 Q1/Q3/Q4；儀式規格對標來投開箱）----
// 我方畢業者具名台詞：大山＝隊長級離別重場、阿烈＝輕量但有記憶點、三年級招募生＝
// 「短暫相遇的告別」（四名三年級招牌各有專屬句，其餘走通用款）；
// 播報＝對手 ace 畢業一句話＋「舊王牌去向」伏筆（大學章埋線，不展開）。
// 純建構器：吃畢業名單回台詞列，呼叫端（careerScreen）以 dialogPlay 播放。

// 我方創隊班底的專屬離別（member id 對句；查無＝通用款）
const FAREWELL_BY_ID = {
  A3: [
    { speaker: '大山', text: '……三年，就這樣打完了。體育館的燈，原來這麼亮。' },
    { speaker: '大山', text: '我把遊隼交給你們。牆不在了——你們自己，就要是牆。' },
    { speaker: '大山', text: '還有你，新人。那種關鍵球，以後每一顆都要敢打。學長只能陪你到這裡了。' },
  ],
  A4: [
    { speaker: '阿烈', text: '哼——不習慣講這種話。球給你們了，別打得比我斯文。' },
  ],
  // W3(P4) 甲3③ 阿岩專屬離別（阿烈級份量＋一段專屬對話）：安靜離場的留白處理——
  // 台詞不堆量，重量靠演出；「牆」交給無名接班者（不指名，對照小雷/大山戲的留白）。
  // 與小雷的專屬對話由 graduationCeremonySegments 依名冊追加（N1 在隊才有）
  A6: [
    { speaker: '阿岩', text: '……嗯。輪到我了。' },
    { speaker: '阿岩', text: '三年，我都站在網子中間。話不多——牆本來就不用說話。' },
    { speaker: '阿岩', text: '以後誰站中間，誰就是牆。不用是誰。站上去，就是了。' },
  ],
};

// 阿岩×小雷的離別對話（甲3③ 專屬對話；留白＝阿岩不挽留、小雷不承諾）
const IWAN_RAI_EXCHANGE = [
  { speaker: '小雷', text: '……我才不會替你守什麼牆。' },
  { speaker: '阿岩', text: '嗯。你會拆掉它，蓋一面新的。……也好。' },
];

// 三年級招牌球員的專屬告別（recruitKey 對句）
const FAREWELL_BY_RECRUIT = {
  obsidian: [{ speaker: '阿曜', text: '只有一年，但跟你們打球，比在曜石三年都痛快。網子對面再見——大學的舞台。' }],
  'sky-hawk': [{ speaker: '阿鷹', text: '決賽的天空，讓給你了。下次見面，我會在更高的地方等。' }],
  'gale-shore': [{ speaker: '小嵐', text: '風要往前吹了。你們的節奏——我會在某個球場想起來。' }],
  'black-pine': [{ speaker: '老松', text: '這面牆，最後一年砌在遊隼。……值得。' }],
};

// 對手 ace 畢業播報（ace 名對句：一句話＋去向伏筆；查無＝通用款）
const ACE_FAREWELL_BY_NAME = {
  詹子曜: '曜石體中「黑曜箭」詹子曜畢業——據說北部的大學強豪，已經為他留了球衣。',
  王勝翔: '天鷹學園「制空者」王勝翔畢業——傳聞他要直接挑戰企業聯賽的天空。',
  簡子嵐: '青嵐水產「颱風眼」簡子嵐畢業——風停了？不，聽說只是換了一片更大的海。',
  曾家松: '黑松實業「最後的牆」曾家松畢業。牆離開了黑松——但牆沒有倒，大學排壇等著他。',
  劉振鎧: '鐵霧工業「鐵彈道」劉振鎧畢業——下一站，據說是國家隊青年隊的靶場。',
};

// W3(P4) 結構化儀式段落（演出版消費）：opening／perGraduate（逐畢業者＝聚光段）／
// aceLines／closing。members＝當屆名冊（阿岩×小雷對話的在隊判定；省略＝無追加）。
// graduationCeremonyLines＝本函式的攤平（退化對話卡與既有呼叫端同一事實源）
export function graduationCeremonySegments({ graduates = [], aceGrads = [], members = [] } = {}) {
  const opening = [
    { speaker: '教練', text: '賽季結束了。三年級的最後一天——全隊到齊，送他們一程。' },
  ];
  const perGraduate = graduates.map((m) => {
    const own = FAREWELL_BY_ID[m.id] ?? FAREWELL_BY_RECRUIT[m.recruitKey ?? m.origin];
    const lines = own
      ? [...own]
      : [{ speaker: m.name, text: '謝謝大家。這段路，我不會忘。' }];
    // W2(P4) 隊長交接（拍板：阿哲正式接任）：大山離別後、儀式鏈內完成交接
    if (m.id === 'A3') {
      lines.push({ speaker: '大山', text: '阿哲。隊長臂章，從今天起是你的——遊隼的節奏，交給你握。' });
      lines.push({ speaker: '阿哲', text: '……收下了，學長。牆不在了不算完——牆教過的東西，換我來傳。' });
    }
    // 甲3③ 阿岩×小雷專屬對話（小雷在隊才有；他不在＝阿岩獨白收尾的留白）
    if (m.id === 'A6' && members.some((x) => x.id === 'N1')) {
      lines.push(...IWAN_RAI_EXCHANGE);
    }
    return { member: m, lines };
  });
  const aceLines = aceGrads.map((a) => ({
    speaker: '播報',
    text: ACE_FAREWELL_BY_NAME[a.name]
      ?? `${a.teamName}「${a.title}」${a.name} 畢業——他的去向，是下一個舞台的故事。`,
  }));
  const closing = [
    { speaker: '教練', text: '明天起，新的一屆。體育館的鑰匙——交給留下來的人。' },
  ];
  return { opening, perGraduate, aceLines, closing };
}

// graduates＝我方畢業成員快照（graduation.splitGraduates）；aceGrads＝
// careerState.graduatingAces 輸出。回傳 dialogPlay 可直接吃的台詞列
export function graduationCeremonyLines({ graduates = [], aceGrads = [], members = [] } = {}) {
  const s = graduationCeremonySegments({ graduates, aceGrads, members });
  return [
    ...s.opening,
    ...s.perGraduate.flatMap((g) => g.lines),
    ...s.aceLines,
    ...s.closing,
  ];
}

// W1(P4) 新生入學（輕量見面演出；手寫新生的支線重場＝之後的週次，本週不做內容）
// 手寫新生見面句依 id 對句（人設定案後在此補；07-26 拍板 B 案雷紹齊＝叛逆型）
const FRESHMAN_GREETING_BY_ID = {
  N1: '……雷紹齊，中間手。先說好——我不是來當第二個大山的。',
};
const FRESHMAN_GREETING_BY_ROLE = {
  setter: '我來讓球去它該去的地方。',
  middle: '攔網——交給我試試。',
  opposite: '右邊的砲位，我想接下來。',
  outside: '主攻的位置，我會追上學長們的。',
  libero: '球不落地——聽說這是遊隼的規矩。',
};

export function freshmenIntroLines(freshmen = []) {
  if (!freshmen.length) return [];
  const lines = [{ speaker: '教練', text: '進來吧——今年的新生。' }];
  for (const f of freshmen) {
    lines.push({
      speaker: f.name,
      text: f.origin === 'handwritten'
        ? (FRESHMAN_GREETING_BY_ID[f.id] ?? '請、請多指教！')
        : (FRESHMAN_GREETING_BY_ROLE[f.role] ?? '請多指教！'),
    });
  }
  lines.push({ speaker: '教練', text: '都是生面孔——場上見真章。解散！' });
  return lines;
}

// 事件入帳（不可變）；career.events 為已觸發 id 清單（v3 相容：欄位缺席視同空）
export function recordEvent(career, id) {
  return { ...career, events: [...(career.events ?? []), id] };
}

function matchesWhen(when, { career, last, next }) {
  for (const [key, val] of Object.entries(when)) {
    switch (key) {
      case 'matchId':
        if (next?.id !== val) return false;
        break;
      case 'opponentId':
        if (next?.opponentId !== val) return false;
        break;
      case 'stage':
        if (next?.stage !== val) return false;
        break;
      case 'wonLast':
        if (!last || !!last.won !== val) return false;
        break;
      case 'lastMatchId':
        if (last?.matchId !== val) return false;
        break;
      case 'wonVs': // 曾勝過該隊（宿敵差分用）
        if (!ctxCareerHasResult(career, val, true)) return false;
        break;
      case 'lostVs':
        if (!ctxCareerHasResult(career, val, false)) return false;
        break;
      case 'playedCount':
        if (career.results.length !== val) return false;
        break;
      case 'lossCount':
        if (career.results.filter((r) => !r.won).length !== val) return false;
        break;
      case 'minKills':
        if (((last?.stats?.kills ?? 0) + (last?.stats?.tipKills ?? 0)) < val) return false;
        break;
      default:
        return false; // 未知條件鍵＝不觸發（安全預設；打錯字不會誤發事件）
    }
  }
  return true;
}

function ctxCareerHasResult(career, opponentId, won) {
  return career.results.some((r) => r.opponentId === opponentId && !!r.won === won);
}
