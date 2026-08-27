// 多年職業生涯卷 小批（2026-08-27 夜拍板）——王勝翔宿敵「生涯鏡像」：決定論年表
// 驅動的年度重逢句變體＋第 10 年退休收束卡。治療多年迴圈裡宿敵線只有「大事件＋
// 逐季同一句輕量重逢」兩層、後段（第 7～10 年）敘事扁平的問題。
//
// ★★ proEvents.js 本身零改動（不是零依賴）★★（驗收凍結 R3：既有挖角大事件
// PRO_WANG_RIVAL_EV／PRO_WANG_TEAMMATE_EV 與既有 pro-wang-annual- 逐季輕量句、
// 兩者互斥的既有邏輯**一字不動**，既有 rival 測試零漂移）。本檔是全新、平行的
// 一條敘事線，事件 id 前綴（`pro-rival-`／`rival-arc-annual-`）與既有
// （`pro-wang-`）刻意不同字串，兩條線在同一次賽前判定各自獨立入帳、互不影響，
// dialogPlay 的隊列只是把兩邊回傳的 lines 接在一起播（見 careerScreen.js dialogPlay）。
// H2 修（見下方）需要讀「玩家曾經敵對/曾經同隊」這個既有事實，本檔**讀**
// PRO_WANG_RIVAL_EV／PRO_WANG_TEAMMATE_EV 這兩顆既有匯出常數（import，不是改動
// 那個檔案的任何一行）——比複製字面更不容易漂移。
//
// ★ 設計裁定（主對話，防敘事與畫面打架，驗收凍結檔頭）★ 鏡像**不含轉隊/出海**——
// 名冊與對陣畫面裡王勝翔仍在蒼羽泰坦，本檔的年表事件句一律以「他還在蒼羽」為前提
// 遣詞（隊籍相關的唯一輸入是玩家自己的 `proId`，用來判斷「玩家現在是他隊友還是
// 對手」，不是王勝翔的隊籍——他的隊籍本檔完全不讀、不猜、不變）。
//
// ★ R1 決定論年表 ★ 純資料表，不吃隨機亂數、不吃比賽勝負結果、不動隊籍——這三條
// 靜態防線由 tests/milestone-rival-batch1.test.mjs 的原始碼掃描斷言直接驗證（掃的
// 是引擎隨機源與勝負欄位的字面呼叫，本檔完全不出現那些字面）。「年」＝與
// proMilestones.js 相同的單一計算（archive 已封存 pro 季數 +1），刻意共用同一顆
// 公式——王勝翔與玩家同季挖角入職業（proEvents.js 檔頭設定），生涯進程天然同步，
// 不必另開一套計數。
//
// 卷宗＝驗收凍結 `docs/kickoffs/acceptance-milestone-rival-20260827.md`（R1–R5）。
//
// ★ 對抗覆審修（2026-08-28，H1/H2/H3）★
// H1：退休卡原本恆用「網子後面/網子那一邊」語氣——同隊玩家看到會打臉 R4「不得出
// 隔網相對語意」。改依 proId 分三款（敵隊／同隊十年隊友告別／出海隔海得知）。
// H2：sameTeam 只看當下 proId 會讓「轉隊瞬間變臉」——王勝翔一路都是同一句敵隊/
// 隊友台詞，沒有過渡。改法：語氣仍由當下 proId 決定（場上現實不騙人），但補一次性
// 過渡句——曾經敵對（PRO_WANG_RIVAL_EV 已播）現在同隊＝「宿敵變隊友」句；反向
// （曾同隊 PRO_WANG_TEAMMATE_EV 已播、現在不同隊）＝「隊友變宿敵」句，各自終身
// 一次，播的那一年取代該年年度句（同年不疊兩句——本檔一季只評一次，見函式本體）。
// 這兩顆 id 常數**直接 import 既有 proEvents.js 的匯出**（本來就是匯出的公開介面，
// 不是「改動」那個檔案）——避免複製字面造成日後漂移。
// H3：RIVAL_DEFAULT_LINE 原文字面與 proEvents.js:92 的年度輕量句逐字相同，同季
// 會連播兩份幾乎一樣的台詞——改寫成語意相近但字面不同的句子，並加測試防回歸複製。
import { proTeamById } from './proTeams.js';
import { isForeignTeamId } from './foreignTeams.js';
import { PRO_WANG_RIVAL_EV, PRO_WANG_TEAMMATE_EV } from './proEvents.js';

// 王勝翔所屬球隊 id——同 proEvents.js 的 WANG_PRO_TEAM_ID（那顆是模組內未匯出的
// const，本檔刻意不 import 它以維持零依賴、零改動；重複這個字面值以資料完整性
// 自我檢查（RIVAL_TEAM_EXISTS）守住「拼錯字不會靜默失效」，同 proEvents.js 慣例）。
const WANG_TEAM_ID = 'cangyu-titans';
export const RIVAL_TEAM_EXISTS = proTeamById(WANG_TEAM_ID) != null;

// ── R1 決定論年表（★試玩必調★ 提案值，驗收凍結 R1 給定的五個年份）──
export const RIVAL_YEAR_CAPTAIN = 3;   // 第 3 年隊長
export const RIVAL_YEAR_MVP = 5;       // 第 5 年 MVP
export const RIVAL_YEAR_SLUMP = 7;     // 第 7 年低谷
export const RIVAL_YEAR_FINAL = 9;     // 第 9 年宣布最後一年
export const RIVAL_YEAR_RETIRE = 10;   // 第 10 年退休

// 年表本身（純資料，供測試直接檢查決定論性質——同一個 year 恆對應同一個 key）
export const RIVAL_YEAR_TABLE = {
  [RIVAL_YEAR_CAPTAIN]: 'captain',
  [RIVAL_YEAR_MVP]: 'mvp',
  [RIVAL_YEAR_SLUMP]: 'slump',
  [RIVAL_YEAR_FINAL]: 'finalYear',
};

// ── 事件 id（career.events 去重鍵；刻意與既有 pro-wang- 前綴不同字串）──
export const RIVAL_ARC_ANNUAL_PREFIX = 'rival-arc-annual-';
export const RIVAL_RETIRE_EV = 'pro-rival-retire';
// H2 新增：先敵後友／先友後敵的一次性過渡句（各自終身一次）
export const RIVAL_ARC_SWITCH_TO_MATE_EV = 'rival-arc-switch-mate';
export const RIVAL_ARC_SWITCH_TO_FOE_EV = 'rival-arc-switch-foe';

const line = (speaker, text) => ({ speaker, text });

// ── R2 年度重逢輕量句：敵隊語氣（隔網相對）四款＋預設句 ──（★文案屬提案★）
const RIVAL_LINES = {
  captain: '……隊長袖標戴上了？蒼羽的網那邊，換我盯著你打。',
  mvp: 'MVP 獎盃是拿到手了。但這片天空的天花板，還是要靠今天這場來量。',
  slump: '這一年打得不太順？別指望我手下留情——網子只認今天站在對面的人。',
  finalYear: '最後一年了……你打算怎麼收尾？我這邊，可不打算讓你風光退場。',
};
// H3 修：原句與 proEvents.js 既有年度輕量句（"……又是你。今年的你，比去年難纏了
// 嗎？網子那邊見。"）逐字相同，同季會連播兩份幾乎一樣的台詞——改寫成語意相近但
// 字面不同的句子（見 tests/milestone-rival-batch1.test.mjs 的逐字不重複防回歸測試）。
const RIVAL_DEFAULT_LINE = '……這一年，換你先開口，還是我先發球？網子那邊，照樣不留情面。';

// ── R4 同隊語氣變體：至少隊長/MVP 兩款（實作全數四款）——不得出「隔網相對」語意 ──
const TEAMMATE_LINES = {
  captain: '隊長袖標戴上了？那更好——這個更衣室，我信得過交在你手上。',
  mvp: 'MVP 獎盃是你的。但一個人扛不起一整季，這片天空還是我們一起撐的。',
  slump: '這一年打得不太順？沒事，同一件球衣，這種時候才看得出誰陪誰扛。',
  finalYear: '最後一年了……好好打完，別留遺憾——這件球衣，你穿得起。',
};
const TEAMMATE_DEFAULT_LINE = '……又是新的一季。這片天空，我們還在同一邊扛。';

// ── R2 出海變體：玩家出海期間換句（既有 isForeignTeamId 判定重用，不新增判定）──
const FOREIGN_LINE = '休息室的電視轉播著海外的比分——王勝翔的名字，這一季不在對面，也不在身邊。';

// ── H2 新增：先敵後友／先友後敵的一次性過渡句（★文案屬提案★，各終身一次，
//    播的那一年取代該年年度句——本檔一季只評一次，見函式本體，同年不會疊播）──
const SWITCH_TO_MATE_LINE = '別人眼裡的死對頭，這下換穿同一件球衣——王勝翔沒多說什麼，只把置物櫃讓出隔壁那格。';
const SWITCH_TO_FOE_LINE = '曾經同一個更衣室，這下要隔網相見了——王勝翔只留下一句：這次不留情面。';

/**
 * R3 第 10 年退休收束卡（★文案屬提案★）——終身一次，播過之後這條宿敵線永久停播
 * （呼叫端的 played.includes(RIVAL_RETIRE_EV) 短路擋住後續所有年度句，見下方判定）。
 * H1 修：語氣依「玩家此刻的隊籍現實」分三款——敵隊、同隊十年隊友告別、出海隔海
 * 得知——不再恆用「網子後面/網子那一邊」語氣（同隊玩家看到那樣的退休卡等於自己
 * 打自己臉，牴觸 R4「不得出隔網相對語意」）。王勝翔本人的隊籍仍完全不讀、不猜、
 * 不變（本檔設計裁定原文，見檔頭）——這裡只讀玩家自己的 proId。
 */
// H1 殘餘修（第二輪對抗覆審）：三款退休卡原本各含一句「十年」/「大半」這類共處
// 時長量化字樣——TEAMMATE 款「這片天空我們一起扛過大半」對第 8 年才轉隊過來的
// 玩家明顯失真（跟王勝翔實際共處不到大半）。改寫成不量化共處年資的告別語氣
// （方向：「同一件球衣的日子不論長短」），RIVAL／FOREIGN 兩款順手一併拿掉同型
// 量化字樣（「十年」/「第十年」/「十年前」）以防同一種失真換個位置復發——見
// tests/milestone-rival-batch1.test.mjs 的字面防回歸測試（三款文案逐一斷言不含）。
const RETIRE_LINES_RIVAL = [
  line('', '賽季公告欄貼出一則簡短聲明——蒼羽泰坦的制空者，打完這一年就退役。'),
  line('王勝翔', '夠了——這片天空，我扛過、也讓別人扛過了。這一頁，翻過去了。'),
  line('王勝翔', '往後這片網子後面站的人是誰，我會在看台上看著。祝你，還打得下去。'),
  line('', '最後一場哨聲響起，通道口卻沒有人再等你——網子那一邊，換了新的名字。'),
];
const RETIRE_LINES_TEAMMATE = [
  line('', '賽季公告欄貼出一則簡短聲明——蒼羽泰坦的制空者，打完這一年就退役。'),
  line('王勝翔', '同一件球衣的日子不論長短，能一起扛過，這件事我不會忘——這身球衣，換我先脫下來了。'),
  line('王勝翔', '往後更衣室你那格置物櫃旁邊會空一格。有空，別忘了看台上還有我一個。'),
  line('', '最後一場哨聲響起，你轉頭想喊他一起走——他已經先一步，把置物櫃清空了。'),
];
const RETIRE_LINES_FOREIGN = [
  line('', '休息室的電視轉播裡插播一則簡短跑馬燈——蒼羽泰坦的制空者，這一年打完就退役。'),
  line('', '隔著一整片海，你只能從轉播畫面認出他退場時的背影——連一句道別都遞不到。'),
  line('', '當初那句「終於同一個聯賽了」，如今隔著海，連對手都當不成了。'),
];

/** H1：退休卡依玩家此刻的隊籍現實分三款——王勝翔本人的隊籍不讀、不猜、不變。 */
function retireEventFor(proId) {
  const retireLines = isForeignTeamId(proId) ? RETIRE_LINES_FOREIGN
    : proId === WANG_TEAM_ID ? RETIRE_LINES_TEAMMATE
      : RETIRE_LINES_RIVAL;
  return { id: RIVAL_RETIRE_EV, lines: retireLines };
}

/**
 * 宿敵生涯鏡像的賽前判定。**純函式**——判定風格與觸發時機同構
 * proMilestonePreEvents（只在職業章常規賽第一場賽前判定一次；round 守衛擋掉
 * 季後賽與其他章節）；career.events 一生一次／逐季旗標同 proWangRivalPreEvents。
 *
 * @param career     careerState 視圖（`.events`／`.schedule`，同 proMilestonePreEvents）
 * @param matchEntry 賽程項
 * @param proId      玩家目前所屬職業隊 id（`store.loadPro()`）——只用來判斷「玩家
 *                   現在是王勝翔的隊友還是對手」與「玩家是否出海」，不讀王勝翔隊籍
 * @param archive    store.loadSeasonArchive() 的回傳（與 proMilestonePreEvents 同一份）
 * @returns 0～2 個事件的陣列（H2 邊界修：過渡句＋退休卡同季重疊時回傳兩筆，見下方）
 */
export function rivalArcPreEvents(career, matchEntry, proId, archive) {
  if (matchEntry?.round !== 'pro' && matchEntry?.round !== 'foreign') return [];
  const schedule = career?.schedule ?? [];
  if (!schedule.length || schedule[0]?.id !== matchEntry?.id) return [];
  const played = career?.events ?? [];
  if (played.includes(RIVAL_RETIRE_EV)) return []; // R3：退休後，重逢句永久停播
  const seasons = (archive ?? []).filter((s) => typeof s?.pro === 'string' && proTeamById(s.pro));
  const year = seasons.length + 1; // 與 proMilestonePreEvents 共用同一顆年資公式
  const isRetireYear = year >= RIVAL_YEAR_RETIRE;
  const sameTeam = !isForeignTeamId(proId) && proId === WANG_TEAM_ID; // R4：同隊語氣變體判準

  // H2 邊界修（第二輪對抗覆審）：過渡句判斷提到退休短路**之前**評估。原本
  // `year>=RIVAL_YEAR_RETIRE` 排在過渡判斷前面，會讓「第 9 年季末才轉隊」的玩家
  // 過渡句被退休卡短路掉、退休卡播完後又被最上面的「退休後永久停播」短路，導致
  // 過渡句永久漏播。現在：過渡條件成立時一律先給過渡句；若同時也到了退休年，
  // 額外把退休卡接在後面一起回傳（陣列——dialogPlay 的 flatMap 會接龍播完，見
  // careerScreen.js dialogPlay），過渡在前、退休在後，兩個旗標各自入帳。
  // 出海期間不判過渡（過渡只發生在國內敵隊/隊友之間，出海分支照舊走下方年度句）。
  if (!isForeignTeamId(proId)) {
    if (sameTeam && played.includes(PRO_WANG_RIVAL_EV) && !played.includes(RIVAL_ARC_SWITCH_TO_MATE_EV)) {
      const switchEvent = { id: RIVAL_ARC_SWITCH_TO_MATE_EV, lines: [line('王勝翔', SWITCH_TO_MATE_LINE)] };
      return isRetireYear ? [switchEvent, retireEventFor(proId)] : [switchEvent];
    }
    if (!sameTeam && played.includes(PRO_WANG_TEAMMATE_EV) && !played.includes(RIVAL_ARC_SWITCH_TO_FOE_EV)) {
      const switchEvent = { id: RIVAL_ARC_SWITCH_TO_FOE_EV, lines: [line('王勝翔', SWITCH_TO_FOE_LINE)] };
      return isRetireYear ? [switchEvent, retireEventFor(proId)] : [switchEvent];
    }
  }
  if (isRetireYear) {
    return [retireEventFor(proId)]; // 無未播過渡句——照舊只回退休卡一個
  }
  const annualId = `${RIVAL_ARC_ANNUAL_PREFIX}${year}`;
  if (played.includes(annualId)) return [];
  if (isForeignTeamId(proId)) {
    return [{ id: annualId, lines: [line('', FOREIGN_LINE)] }];
  }
  const key = RIVAL_YEAR_TABLE[year] ?? null;
  const text = sameTeam
    ? (key ? TEAMMATE_LINES[key] : TEAMMATE_DEFAULT_LINE)
    : (key ? RIVAL_LINES[key] : RIVAL_DEFAULT_LINE);
  return [{ id: annualId, lines: [line('王勝翔', text)] }];
}
