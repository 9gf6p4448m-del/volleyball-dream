// 4.5A 宿敵三幕——莊敬嶺「攀天者」（純函式；零 DOM/存檔 IO/非種子隨機）
// 人設＝phase4-w4-status.md §7 案 B：曾在牆的另一邊，爬過來之後把牆砌得更高。
// 掛點（拍板 §1-1 硬保底）：幕一＝第 1 屆決賽（首遇）、幕二＝第 2 屆準決賽（bo3）、
// 幕三＝第 3 屆決賽；玩家止步＝屆末旁觀播報版（三幕鏈不斷）。
// 分版軸（拍板 §1-3，勿全積展開）：幕一/幕三分鏡子（你高）/牆（你矮）、幕二共用；
// 賽後分勝/敗；幕三坦白條件句依「你怎麼贏他的」——轉 L＞打法＞基底，長高只作附加變體。
// 動態事件範式沿 oldTeamPreEvents：id 進 career.events 去重（各幕綁定屆數＝天然一次性）。
import { nextMatch, careerStage } from './careerState.js';
import { RIVAL_TEAM_ID } from './schedule.js';
import { opponentById } from './opponents.js';
import { kitFor } from './teamKit.js';

const RIVAL = '天鷹學園・莊敬嶺';
const MA = '天鷹學園・馬振羽';

// 各幕的賽程掛點（屆數 → matchId）；保底階梯（schedule.nationalLadderFor）保證對手＝天鷹
export const RIVAL_ACT_MATCH = { 1: 'national-final', 2: 'national-sf', 3: 'national-final' };

export function rivalActNo(seasonIndex, matchId) {
  return RIVAL_ACT_MATCH[seasonIndex] === matchId ? seasonIndex : null;
}

// 鏡子/牆門檻（裁量，快照如實記錄）：≥183cm＝鏡子——heightAdvice ADVICE_BANDS 的
// 183-192 帶下緣（該帶首選位置＝攻擊手＝「天生就有」的身高語意）；莊敬嶺本人 188。
// 逐幕以當屆現值判定（成長跨帶＝幕一牆/幕三鏡子是合法敘事：他看著你長高）。
export const MIRROR_HEIGHT_CM = 183;
export function playerHeightCm(player) {
  const m = player?.height?.current;
  return Number.isFinite(m) ? Math.round(m * 100) : 175;
}
export function mirrorOrWall(heightCm) {
  return heightCm >= MIRROR_HEIGHT_CM ? 'mirror' : 'wall';
}

// 「曾實戰交手」代理判定（裁量）：任何對天鷹的實戰都會留情蒐（mergeScouting 場末必寫）
// ——跨屆持久，涵蓋幕一實戰與小組抽到/邀請天鷹的場次
function hasFacedRival(career) {
  return !!career?.scouting?.[RIVAL_TEAM_ID];
}

// 本屆國賽是否實戰過天鷹（旁觀版守衛：打過＝賽後版已播，不掛旁觀）
// ★ 隱性耦合（2026-08-09 覆審 L2）★ `startsWith('national-')` 現在也會命中**八強循環**
// 的三場（`national-qf`／`national-rr2`／`national-rr3`）。目前之所以仍然正確，唯一的
// 理由是天鷹**抽不進循環組**（`schedule.js drawRoundRobinOpponents` 排除當屆淘汰賽兩隊）。
// 要放寬那個抽籤池之前，先回來看這一行——否則「循環組撞到天鷹並打輸」會被當成
// 「幕次已實戰」而把旁觀播報吃掉，三幕鏈就斷一環。
function playedRivalNationalThisSeason(career) {
  return (career.results ?? []).some(
    (r) => r.opponentId === RIVAL_TEAM_ID && String(r.matchId).startsWith('national-'),
  );
}

// 幕三坦白條件句（拍板 §1-3 優先序：轉 L ＞ 打法 ＞ 基底；長高＝附加變體非主判定）。
// 打法版門檻（裁量，快照記錄）：天鷹情蒐樣本 spikes ≥ 12 且（假動作＋吊球）佔比 ≥ 0.35
// ——用「他親眼看過的你」判定「你讓我的高度沒用」，資料與敘事同源。
export const STYLE_MIN_SPIKES = 12;
export const STYLE_DECEPTION_SHARE = 0.35;
// 長高變體門檻（裁量）：三年累計 ≥ 8cm（165-175 帶成長幅度帶上緣——「肉眼可見地長」）
export const GROW_TALL_CM = 8;

export function confessionVariant({ player, career }) {
  const grewCm = grownTotalCm(player);
  if (player?.currentRole === 'libero') return { key: 'libero', grewTall: grewCm >= GROW_TALL_CM };
  const tal = career?.scouting?.[RIVAL_TEAM_ID];
  const spikes = tal?.spikes ?? 0;
  const deception = (tal?.feints ?? 0) + (tal?.zones?.tip ?? 0);
  if (spikes >= STYLE_MIN_SPIKES && deception / spikes >= STYLE_DECEPTION_SHARE) {
    return { key: 'style', grewTall: grewCm >= GROW_TALL_CM };
  }
  return { key: 'base', grewTall: grewCm >= GROW_TALL_CM };
}

function grownTotalCm(player) {
  const plan = player?.height?.plan;
  const cur = playerHeightCm(player);
  return Array.isArray(plan) && plan.length ? cur - plan[0] : 0;
}

// ---- 幕一・碾壓（第 1 屆決賽首遇）----

const ACT1_PRE = {
  wall: [
    { speaker: '阿哲', text: '天鷹學園……全國的天花板。對面那個一年級，就是莊敬嶺。' },
    { speaker: RIVAL, text: '遊隼的一年級？……站直一點。' },
    { speaker: RIVAL, text: '嗯。這個高度——連我的助跑都不用。' },
    { speaker: RIVAL, text: '排球是高的人的運動。這不是我說的，是每一顆被攔死的球說的。' },
    { speaker: '阿哲', text: '別聽他的。球落在哪裡，才是排球說話的方式。' },
  ],
  mirror: [
    { speaker: '阿哲', text: '天鷹學園……全國的天花板。對面那個一年級，就是莊敬嶺。' },
    { speaker: RIVAL, text: '遊隼的一年級……你幾公分？' },
    { speaker: RIVAL, text: '……不用回答。我看得出來——你天生就有。' },
    { speaker: RIVAL, text: '我最恨你這種人。拿著別人用命去換的東西，還打得這麼隨便。' },
    { speaker: RIVAL, text: '今天讓你看看，同樣的高度——被逼出來的那種，長什麼樣子。' },
  ],
};

const ACT1_POST_LOST = {
  wall: [
    { speaker: RIVAL, text: '看清楚了？這就是高度。不服氣就去長。長不了的話——' },
    { speaker: RIVAL, text: '我證明過了。爬不上來，是你不夠想。' },
    { speaker: RIVAL, text: '……不過，最後那幾顆球。你明知道搆不到，還是跳了。' },
    { speaker: RIVAL, text: '明年也來決賽。我在牆頂等你。' },
    { speaker: '大山', text: '記住這種輸法。……然後把它變成別的東西。' },
  ],
  mirror: [
    { speaker: RIVAL, text: '就這樣？' },
    { speaker: RIVAL, text: '你有我拚了三年才搆到的東西，卻打出這種球。' },
    { speaker: RIVAL, text: '浪費。全場最讓我想贏的是你，最不堪一擊的也是你。' },
    { speaker: RIVAL, text: '把你的身高當一回事。明年——我要贏的是認真的你。' },
    { speaker: '大山', text: '被同年級講到這份上……記住今天。明年，讓他把這些話吞回去。' },
  ],
};

const ACT1_POST_WON = {
  wall: [
    { speaker: RIVAL, text: '……為什麼。' },
    { speaker: RIVAL, text: '高度在我這邊，數字全部在我這邊。為什麼獎盃在你們那邊。' },
    { speaker: RIVAL, text: '……不對。不是你贏了——是我還不夠想。' },
    { speaker: RIVAL, text: '記住今天。這是你最後一次，從我搆不到的地方拿走東西。' },
    { speaker: '阿哲', text: '他到最後都沒說一句「你很強」。……這種人，明年更麻煩。' },
  ],
  mirror: [
    { speaker: RIVAL, text: '輸給誰都行——就是不想輸給你。' },
    { speaker: RIVAL, text: '你知道自己今天贏在哪裡嗎？……不知道吧。你連這個都不用知道，就贏了。' },
    { speaker: RIVAL, text: '最讓我睡不著的，就是這個。' },
    { speaker: RIVAL, text: '明年我會回來。到時候，請你認真到——不得不記住我。' },
    { speaker: '阿哲', text: '贏了還被記恨成這樣……你們倆的帳，看來要打三年。' },
  ],
};

// ---- 幕二・被逼到牆邊（第 2 屆準決賽，bo3；鏡/牆共用）----
// 「逼到牆邊」的張力寫死在事件裡（不依比分）：他為你加練一年／贏了仍想不通那顆球

const ACT2_PRE_FACED = [
  { speaker: '阿哲', text: '準決賽——天鷹。三戰兩勝，這次不是一球定生死。' },
  { speaker: RIVAL, text: '又是你。' },
  { speaker: RIVAL, text: '這一年，我每天比全隊多留一小時。加練的時候只想一件事——' },
  { speaker: RIVAL, text: '你那幾顆過了我的手的球，為什麼會過。' },
  { speaker: RIVAL, text: '今天，一顆都不會再過。' },
  { speaker: '阿哲', text: '他為你練了一年。……我們也不是白過的。三局，跟他拚完。' },
];

const ACT2_PRE_FIRST = [
  { speaker: '阿哲', text: '準決賽——天鷹學園。去年站上頒獎台的隊，在這裡等我們。' },
  { speaker: RIVAL, text: '遊隼……去年沒走到我面前的隊。' },
  { speaker: RIVAL, text: '我叫莊敬嶺。記住沒關係，忘了也沒關係——反正打完今天，你只會記得一件事。' },
  { speaker: RIVAL, text: '排球，是高的人的運動。' },
  { speaker: '阿哲', text: '大話讓他說。三戰兩勝——我們一局一局拆。' },
];

const ACT2_POST_WON = [
  { speaker: RIVAL, text: '……再打一局。' },
  { speaker: RIVAL, text: '我知道結束了。我是說——再打一局，我就能想通。' },
  { speaker: RIVAL, text: '多練的每一小時、多長的每一公分，全都在漲。可是站在上面的，為什麼還是你。' },
  { speaker: RIVAL, text: '……牆沒有倒。牆只是——' },
  { speaker: '阿哲', text: '他第一次沒把話說完。……走，決賽在等我們。' },
];

const ACT2_POST_LOST = [
  { speaker: RIVAL, text: '贏了。兩局。' },
  { speaker: RIVAL, text: '……那為什麼，那顆球還是過了我的手。' },
  { speaker: RIVAL, text: '算了。你聽好——把你輸的想通。我也有要想通的東西。' },
  { speaker: RIVAL, text: '明年，決賽。別在半路被別人收走。' },
  { speaker: '阿哲', text: '贏的人比我們還不甘心……那傢伙，到底在跟什麼打？' },
];

// ---- 幕三・坦白（第 3 屆決賽）----

const ACT3_PRE = {
  wall: [
    { speaker: '阿哲', text: '最後一年，決賽——又是天鷹，又是他。三年了。' },
    { speaker: RIVAL, text: '你來了。' },
    { speaker: RIVAL, text: '三年，你在爬，我在砌。今天——都到頂了。' },
    { speaker: RIVAL, text: '上來吧。這道牆等你三年了，它值得一個像樣的答案。' },
  ],
  mirror: [
    { speaker: '阿哲', text: '最後一年，決賽——又是天鷹，又是他。三年了。' },
    { speaker: RIVAL, text: '你來了。' },
    { speaker: RIVAL, text: '三年前我以為，我恨的是你的身高。後來每次跟你打，我就更不確定一次。' },
    { speaker: RIVAL, text: '最後一場了。打完，我就會知道——這三年，我到底在跟什麼打。' },
  ],
  // 從未交手的首遇決賽（幕一/幕二皆旁觀；鏡/牆語彙由賽後承擔——裁量記快照）
  first: [
    { speaker: '阿哲', text: '決賽——天鷹學園。三年，我們終於走到他面前。' },
    { speaker: RIVAL, text: '遊隼。三年都差一步的隊，最後一年走到了。' },
    { speaker: RIVAL, text: '我在這座牆頂站了三年，等一個能讓我全力以赴的對手。' },
    { speaker: RIVAL, text: '來吧。讓我看看，最後一年才上來的人，帶了什麼。' },
  ],
};

const ACT3_OPEN = {
  won: {
    wall: [
      { speaker: RIVAL, text: '結束了……啊。' },
      { speaker: RIVAL, text: '三年。我把牆砌到連自己都搆不到的高度——你還是把球，放在了我身後的地板上。' },
    ],
    mirror: [
      { speaker: RIVAL, text: '結束了……啊。' },
      { speaker: RIVAL, text: '三年，我想贏的一直是你。現在輸了——奇怪的是，好像也放下了什麼。' },
    ],
  },
  lost: {
    wall: [
      { speaker: RIVAL, text: '我贏了。牆，砌到最後一天了。' },
      { speaker: RIVAL, text: '……那為什麼。站在網子那邊的你，看起來一點都不像輸的人。' },
    ],
    mirror: [
      { speaker: RIVAL, text: '我贏了。連你也贏過了——恨了三年的身高，今天終於踩在腳下。' },
      { speaker: RIVAL, text: '……為什麼。為什麼一點都不痛快。' },
    ],
  },
};

// 條件句組（轉 L／打法；基底＝直接進坦白）
const ACT3_VARIANT = {
  libero: [
    { speaker: RIVAL, text: '三年，我把牆砌到沒有人跳得過。' },
    { speaker: RIVAL, text: '然後你脫下主攻的球衣，穿上那件異色的——你連跳都不用跳。' },
    { speaker: RIVAL, text: '我砌的牆，你繞過去了。……原來還有這條路。原來一直都有。' },
  ],
  style: [
    { speaker: RIVAL, text: '你的每一球我都看過。輕吊、假動作、打在我指尖上的那些。' },
    { speaker: RIVAL, text: '你從來沒想跳過我的牆——你是讓我的牆，沒有用。' },
    { speaker: RIVAL, text: '高度沒輸過。輸的是「排球只有高度」這句話。' },
  ],
  base: [],
};

// 坦白核心（勝敗共用）＋勝敗收束
const ACT3_CONFESS = [
  { speaker: RIVAL, text: '……跟你說一件事。我也曾在牆的這一邊。' },
  { speaker: RIVAL, text: '國中三年，一百五十幾公分——體育館裡，沒有人看我一眼。' },
  { speaker: RIVAL, text: '後來我長高了，就發誓把牆砌得比誰都高。只有牆夠高，我爬上來這件事，才算數。' },
];

const ACT3_CLOSE = {
  won: [
    { speaker: RIVAL, text: '可是你沒有爬。你在牆下面站了三年——站得比我穩。' },
    { speaker: RIVAL, text: '不爬牆的人，也站得住。……我花了三年才看懂。值得。' },
  ],
  lost: [
    { speaker: RIVAL, text: '我贏了，三年全贏了。可是你站在那邊三年，始終沒有變成第二個我。' },
    { speaker: RIVAL, text: '贏的是我。先低頭的——也是我。' },
  ],
};

// 長高附加變體（非主判定；接在坦白後）
const ACT3_GROWN_EXTRA = [
  { speaker: RIVAL, text: '還有——這三年，你長高了。長高的人我見多了；沒被高度改變打法的，你是第一個。' },
];

// 馬振羽一句戲（小件包：接班線被凍結的「等不到的人」；大學章伏筆，僅此一句）
const MA_LINE = [
  { speaker: MA, text: '同一屆有他，我等了三年也沒等到天鷹的天空。……大學見。下一片天，我不等了——我去搶。' },
];

const ACT3_TAIL = {
  won: [{ speaker: '阿哲', text: '……走吧。頒獎台在等我們。' }],
  lost: [{ speaker: '阿哲', text: '三年，打完了。輸給這樣的傢伙——這三年也算值了。走吧。' }],
};

// ---- 止步降級版（拍板 §1-1）：屆末旁觀播報，三幕鏈不斷；單一版本（矩陣紀律：
// 鏡/牆×勝敗×條件句只在拍板指定處展開，旁觀短版不分版——裁量記快照）----

const WATCH = {
  1: [
    { speaker: '播報', text: '全國決賽落幕——冠軍，天鷹學園！' },
    { speaker: '播報', text: '一年級主攻莊敬嶺——決賽的天空，被一個一年級統治了。' },
    { speaker: '阿哲', text: '莊敬嶺……跟你同屆。' },
    { speaker: '阿哲', text: '我們止步的地方，有同年級的人已經站上了頒獎台。記住這個名字。' },
  ],
  2: [
    { speaker: '播報', text: '本屆冠軍——天鷹學園！莊敬嶺把決賽，打成了他一個人的獨角戲。' },
    { speaker: '阿哲', text: '他在準決賽等我們。……我們沒走到。' },
    { speaker: '阿哲', text: '明年是最後一年了。再爬不上去，就只能一直在看台上看他。' },
  ],
  3: [
    { speaker: '播報', text: '高中最後一個夏天——冠軍，天鷹學園，莊敬嶺。' },
    { speaker: '播報', text: '頒獎台上，他依然沒有笑。三年，沒有人爬上他砌的那道牆。' },
    ...MA_LINE,
    { speaker: '阿哲', text: '三年，我們終究沒跟他打到那一場。' },
    { speaker: '阿哲', text: '……沒打完的比賽，畢業之後還很長。把這個名字，帶去大學吧。' },
  ],
};

// ---- 事件建構（動態事件：{id, moment, lines}——fireEvents 以 id 入帳去重）----

// 4.5B §6：演出 metadata（camera/camOpts——careerScreen dialogPlay 消費；
// 純表現層宣告、零邏輯影響；career 層只給語意（角度/身高），幾何在 beatStage 收斂）
const withCam = (lines, cam, camOpts = null) => lines.map((l) => ({ ...l, cam, camOpts }));
const RIVAL_HEIGHT_M = 1.88;
// 隊伍配色卷批 3 B4：宿敵三幕的 B 側 subjects 恆是天鷹本隊——用同一組
// kitFor(opponentById(...)) 資料源（與客隊橫幅/應援色同步，不另抄色值）餵給
// beatStage 的 opts.opponentKit，讓 confront/exit/rimlight-solo 都認得出「這是天鷹」
const RIVAL_KIT = kitFor(opponentById(RIVAL_TEAM_ID));
const confrontOpts = (player, angle) => ({
  angle, playerHeightM: playerHeightCm(player) / 100, rivalHeightM: RIVAL_HEIGHT_M,
  opponentKit: RIVAL_KIT,
});

// 賽前：下一場＝本屆掛點場且對手＝天鷹
export function rivalPreEvents({ career, seasonIndex, player }) {
  const next = nextMatch(career);
  const act = next ? rivalActNo(seasonIndex, next.id) : null;
  if (!act || next.opponentId !== RIVAL_TEAM_ID) return [];
  const triggered = career.events ?? [];
  const id = `rival-act${act}-pre`;
  if (triggered.includes(id)) return [];
  const side = mirrorOrWall(playerHeightCm(player));
  let lines;
  if (act === 1) {
    // 幕一隔網注視（專屬 beat #3）：牆版＝他俯視量你、鏡子版＝平視
    lines = withCam(ACT1_PRE[side], 'confront',
      confrontOpts(player, side === 'wall' ? 'down' : 'level'));
  } else if (act === 2) {
    lines = hasFacedRival(career) ? ACT2_PRE_FACED : ACT2_PRE_FIRST;
  } else if (hasFacedRival(career)) {
    // 幕三賽前對峙：鏡子版同高度平視／牆版仰角（三年對照組的收尾格）
    lines = withCam(ACT3_PRE[side], 'confront',
      confrontOpts(player, side === 'wall' ? 'up' : 'level'));
  } else {
    lines = withCam(ACT3_PRE.first, 'confront', confrontOpts(player, 'level'));
  }
  return [{ id, moment: 'pre', lines }];
}

// 賽後：最後一場＝本屆掛點場對天鷹——勝/敗分版；幕三加條件句＋坦白＋馬振羽
export function rivalPostEvents({ career, seasonIndex, player }) {
  const last = career.results[career.results.length - 1] ?? null;
  const act = last ? rivalActNo(seasonIndex, last.matchId) : null;
  if (!act || last.opponentId !== RIVAL_TEAM_ID) return [];
  const triggered = career.events ?? [];
  const id = `rival-act${act}-post`;
  if (triggered.includes(id)) return [];
  const side = mirrorOrWall(playerHeightCm(player));
  let lines;
  if (act === 1) {
    // 幕一賽後：他轉身走離、鏡頭不追，餘隊伍剪影（exit 模板）
    lines = withCam((last.won ? ACT1_POST_WON : ACT1_POST_LOST)[side], 'exit',
      { rivalHeightM: RIVAL_HEIGHT_M, opponentKit: RIVAL_KIT });
  } else if (act === 2) {
    // 幕二斷句 beat（專屬 #2）：勝版＝他第一次擦汗、敗版＝握拳盯著手心的靜止一拍
    lines = withCam(
      last.won ? ACT2_POST_WON : ACT2_POST_LOST,
      'rimlight-solo',
      { heightM: RIVAL_HEIGHT_M, role: 'outside', pose: last.won ? 'wipe' : 'fist', opponentKit: RIVAL_KIT },
    );
  } else {
    const outcome = last.won ? 'won' : 'lost';
    const variant = confessionVariant({ player, career });
    const facing = confrontOpts(player, side === 'wall' ? 'up' : 'level');
    const confess = { ...facing, lighting: 'confess' }; // 專屬 #1：場館燈滅、只留兩人光帶
    lines = [
      ...withCam(ACT3_OPEN[outcome][side], 'confront', facing),
      ...withCam(ACT3_VARIANT[variant.key], 'confront', facing),
      ...withCam(ACT3_CONFESS, 'confront', confess),
      ...withCam(ACT3_CLOSE[outcome], 'confront', confess),
      ...(variant.grewTall ? withCam(ACT3_GROWN_EXTRA, 'confront', confess) : []),
      // 馬振羽一句：隊伍末端邊光單人（rimlight-solo 模板，不搶主場景）
      ...withCam(MA_LINE, 'rimlight-solo', { heightM: 1.84, role: 'opposite', opponentKit: RIVAL_KIT }),
      ...ACT3_TAIL[outcome], // 阿哲收尾＝回純對話卡（演出讓位給收束）
    ];
  }
  return [{ id, moment: 'post', lines }];
}

// 屆末旁觀（止步降級版）：本屆止步且國賽未實戰天鷹——場邊看他奪冠
export function rivalSpectatorEvents({ career, seasonIndex }) {
  const act = RIVAL_ACT_MATCH[seasonIndex] ? seasonIndex : null;
  if (!act) return [];
  if (careerStage(career) !== 'eliminated') return [];
  if (playedRivalNationalThisSeason(career)) return [];
  const triggered = career.events ?? [];
  const id = `rival-act${act}-watch`;
  if (triggered.includes(id)) return [];
  // 止步旁觀（三幕通用）：看台視角遠景＋頒獎台定格（stands 模板）。
  // 債清批 2026-08-26 接線：場上 B 隊剪影＝天鷹（奪冠方）穿 RIVAL_KIT；
  // A 隊＝匿名決賽對手維持預設（本事件僅高中章觸發、kitA 恆 null，不會誤穿我方校服）
  return [{ id, moment: 'post', lines: WATCH[act], camera: 'stands', cameraOpts: { opponentKit: RIVAL_KIT } }];
}
