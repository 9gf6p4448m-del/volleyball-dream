// 大學對手池（大學卷 批 5，2026-08-14）——九所大學、一個聯賽。
//
// ★ 為什麼九所全在同一個聯賽 ★ 2026-08-14 Sawmah 拍板：**候選校＝聯賽成員**。
// 你選了哪一所就進哪一所，其餘八所全變成這一年的對手 ⇒ 升學畫面上看到的每一個
// 舊識，這一年都真的會在球場上碰到。單循環 8 場剛好是階段一的一個賽季（題 2）。
//
// ★ 這張表是資料，不是引擎 ★ 高中那份 `opponents.js` 一行不動（卷宗 §三-4）：
// 高中的平衡治具不必重跑、`sim-hash` 不被推移。欄位刻意與 `opponents.js` 同構
// （`buildOpponentTeam` 吃得下），批 6 的大學排程模組直接取用。
//
// ★ level 是初值不是定案 ★ 高中最強是天鷹 72。這裡強豪 78-82／中段 70-74／
// 弱校 62-66 是「比高中高一截」的第一版猜測，**批 6 接上賽程後用治具校準**——
// 現在沒有大學賽程可跑，任何數字都還沒有實測支撐，不假裝有。
//
// 卷宗＝`docs/kickoffs/university-chapter-kickoff.md`；
// 驗收＝`docs/kickoffs/acceptance-uni-batch5.md`（動手前凍結）。
import { TIER, admissionTiersFor } from './admission.js';

// ════════════════════════════════════════════════════════════════
// 舊識（高中回來的人）
// ════════════════════════════════════════════════════════════════
// ★ 王勝翔不在這裡 ★ 他的伏筆原文寫「**直接**挑戰企業聯賽」（`events.js:471-478`），
// 把他塞進大學等於當著玩家的面改掉已經講過的話。其餘三位 ace 的伏筆與大學相容：
//   詹子曜「北部的大學強豪」→ 北陵（強豪）。他大玩家兩屆 ⇒ 玩家大一時他大三。
//   劉振鎧「國家隊青年隊」  → 瀚崎體大（國青搖籃）。與玩家同屆 ⇒ 大一。
//   簡子嵐「更大的海」      → 海硯（老牌沉了、正在重建）。★不是強豪★——
//     「更大的海」不等於「更安全的船」，他去的是一所要人把船划出去的學校。
// 這些名字必須與 `opponents.js` 逐字相同（同一個人，不是同名的新角色）；
// `tests/university.test.mjs` 的 B5-1 會對照既有名單逐字驗。
export const UNI_ALUMNI_ACES = Object.freeze(['詹子曜', '劉振鎧', '簡子嵐', '曾家松']);

// ★ 不升學的人 ★ 伏筆已經播出去的去向，不得被任何分配邏輯覆寫。
// 王勝翔＝`events.js:471-478`「**直接**挑戰企業聯賽」。這裡的存在理由是：他**招募得到**
// （`recruitment.js:227` sky-hawk 槽），玩家挖走他之後他就在名冊裡、第 3 屆是三年級
// ⇒ 同屆隊友的分配會把他送進大學，當著玩家的面推翻已經講過的話（對抗覆審實測到）。
export const NOT_ATTENDING = Object.freeze(['王勝翔']);

// 等級的顯示用中文（同 `FINISH_LABEL`：只給畫面看，判斷一律用 `TIER` 的值）。
export const TIER_LABEL = {
  [TIER.POWERHOUSE]: '強豪',
  [TIER.MID]: '中段',
  [TIER.WEAK]: '弱校',
};

// ════════════════════════════════════════════════════════════════
// 九所大學
// ════════════════════════════════════════════════════════════════
// `cost` 三軸＝升學畫面上**明講的代價**（卷宗 §三之二）：
//   ball  球權——你的球會有多少
//   record 戰績——這一年打得到哪裡
//   tech  技術——★2026-08-24 批 7 拍板 4：這一軸不再承諾「學得快」★
//         大學章的技術傳授是**各校同場次**（第 3 場壓手、第 6 場追發，判準見
//         events.js 的 uniLeaguePlayed），強弱校在技術軸上完全打平。這一欄因此
//         改成描述「隊上的人是什麼樣子」——那是真的、也確實經由球權與戰績影響你，
//         但它不是一張「來這裡技術解鎖比較快」的支票（階段一兌現不了）。
//         ⚠ 不要把這一欄刪掉：批 5 的 B5-7（三軸文字非空、同 tier 不得雷同）
//         是凍結條文，刪欄會撞它。要換的是內容，不是結構。
// ★ 逐校寫不同的話 ★ 九校同一套字＝玩家看不出差別，那個取捨就是假的。
// 「選擇的痛苦要來自玩家知道代價還是選了，不是來自他被騙。」
export const UNIVERSITIES = [
  // ---- 強豪三所（powerhouse）----
  {
    id: 'north-ridge',
    kit: { jersey: 0x5b3fa8, shorts: 0x1e1440, trim: 0xd8cff0, libero: { jersey: 0xd8cff0, shorts: 0x1e1440, trim: 0x5b3fa8 } }, // 王者紫——移動的牆自帶威儀
    name: '北陵大學',
    tier: TIER.POWERHOUSE,
    style: 'wall',
    blurb: '北部的傳統霸主。八年裡拿過五次冠軍，牆高得讓人不想起跳。',
    trait: '高度與紀律——攔網是一堵會移動的牆，失誤少到讓你懷疑自己',
    cost: {
      ball: '這裡的球先給三年級。你的第一年多半在替補席上看，看得很清楚而已。',
      record: '打得到全國決賽——只要你進得了那六個人。',
      tech: '每天對練的都是全國級的手。你會知道自己差在哪裡——每一天都知道。',
    },
    level: 82,
    attrBias: { block: 6, control: 4 },
    roleBias: { middle: { block: 8, jump: 4 } },
    trustBias: { middle: 10 },
    heights: [1.84, 1.90, 2.00, 1.93, 1.88, 1.97],
    squad: ['韓子峰', '卓立崧', '詹子曜', '程柏岑', '湯宇嵩', '任昱崙'],
    grades: [4, 2, 3, 4, 1, 2],
    libero: '龍以恆',
    liberoGrade: 3,
    ace: { slot: 2, name: '詹子曜', title: '黑曜箭' },
    alumni: ['詹子曜'],
    ai: { tipRate: 0.08, dumpRate: 0.06, jumpServeRate: 0.2, diveRate: 0.08, blockPersona: 'read' },
  },
  {
    id: 'hanchi-sport',
    kit: { jersey: 0x8e1f2f, shorts: 0x2e0a10, trim: 0xe8d5a0, libero: { jersey: 0xe8d5a0, shorts: 0x2e0a10, trim: 0x8e1f2f } }, // 體大酒紅——體能暴力的血色
    name: '瀚崎體育大學',
    tier: TIER.POWERHOUSE,
    style: 'power',
    blurb: '國家隊青年隊的搖籃。這裡的人一天練六小時，把身體當器材操。',
    trait: '純粹的體能暴力——扣球又高又重，二十五分裡有八分是硬扣進去的',
    cost: {
      ball: '你會有球，但要先在體能訓練裡活下來——排在你前面的人也很強。',
      record: '四強是基本盤，這裡的人拿冠軍當任務不是夢想。',
      tech: '教練組有國青教練。他們看過太多好手了，不會為你一個人停下來。',
    },
    level: 80,
    attrBias: { power: 8, jump: 6, stamina: 4 },
    roleBias: { opposite: { power: 8 } },
    trustBias: { opposite: 8 },
    heights: [1.85, 1.91, 1.98, 1.95, 1.89, 1.96],
    squad: ['韋擎宇', '施駿霆', '崔立剛', '劉振鎧', '童奕勳', '練昱豪'],
    // 劉振鎧＝2（二輪覆審 N2 更正）：他高中 grade 2（`opponents.js:186`，第 2 屆末畢業）
    // ⇒ 玩家第 4 屆入學時他已經念了一年。原本填 1 會把一個早你一年畢業的人畫成同屆新生。
    // 對照：詹子曜高中 grade 3（第 1 屆末畢業）⇒ 大三；簡子嵐／曾家松高中 grade 1
    // （與玩家同屆）⇒ 大一。
    grades: [3, 2, 4, 2, 2, 3],
    libero: '顧毅安',
    liberoGrade: 2,
    ace: { slot: 3, name: '劉振鎧', title: '鐵彈道' },
    alumni: ['劉振鎧'],
    ai: { tipRate: 0.05, dumpRate: 0.04, jumpServeRate: 0.35, diveRate: 0.1, blockPersona: 'read' },
  },
  {
    id: 'chiyang',
    kit: { jersey: 0xe07018, shorts: 0x38200a, trim: 0xffe2b8, libero: { jersey: 0x3a2410, shorts: 0x38200a, trim: 0xe07018 } }, // 麒陽焦橙——正午的太陽
    name: '麒陽大學',
    tier: TIER.POWERHOUSE,
    style: 'quick',
    blurb: '全國四強的常客。他們的快攻節奏快到轉播鏡頭都跟不上。',
    trait: '速度體系——二傳把球壓得極低，中路與兩翼同時起跳，你得先猜對',
    cost: {
      ball: '快攻體系認節奏不認人，跟不上的人球權自然歸零。',
      record: '穩定的四強；決賽要看那一天二傳的手感。',
      tech: '這裡的節奏比你打過的任何一場都快。跟得上，你才算是其中一個。',
    },
    level: 78,
    attrBias: { speed: 8, reaction: 6 },
    roleBias: { setter: { control: 8 }, middle: { speed: 6 } },
    trustBias: { middle: 14 },
    heights: [1.83, 1.88, 1.96, 1.90, 1.86, 1.94],
    squad: ['席昕睿', '高曦成', '龐晨翊', '焦煒倫', '江旭閔', '顏昭霖'],
    grades: [2, 3, 1, 4, 2, 1],
    libero: '邵旭安',
    liberoGrade: 3,
    ace: { slot: 3, name: '焦煒倫', title: '正午重砲' },
    alumni: [],
    ai: { tipRate: 0.14, dumpRate: 0.1, floatServeRate: 0.2, diveRate: 0.12, blockPersona: 'read' },
  },
  // ---- 中段三所（mid）----
  {
    id: 'haiyan',
    kit: { jersey: 0x36567c, shorts: 0x101e2e, trim: 0xd0e0ea, libero: { jersey: 0xd0e0ea, shorts: 0x101e2e, trim: 0x36567c } }, // 硯台藍——老派墨色
    name: '海硯大學',
    tier: TIER.MID,
    style: 'trick',
    blurb: '老牌強權，但最好的那批人五年前就畢業了。現在他們在重建。',
    trait: '球路變化多、老派的默契——他們知道怎麼打，只是還缺人',
    cost: {
      ball: '缺人就是機會：只要你打得動，二傳很快就會開始找你。',
      record: '八強上下。要走更遠，得靠你們這一屆自己補上那個洞。',
      tech: '教練懂得很多，但隊裡沒有能把你逼到極限的對手。',
    },
    level: 72,
    attrBias: { control: 6, reaction: 4 },
    roleBias: { setter: { control: 6 } },
    trustBias: {},
    heights: [1.82, 1.87, 1.94, 1.89, 1.85, 1.93],
    squad: ['簡子嵐', '池書渡', '田墨凡', '秦潮生', '何硯青', '尤沛霖'],
    grades: [1, 3, 2, 4, 1, 2],
    libero: '官承澈',
    liberoGrade: 3,
    ace: { slot: 0, name: '簡子嵐', title: '颱風眼' },
    alumni: ['簡子嵐'],
    ai: { tipRate: 0.2, dumpRate: 0.12, floatServeRate: 0.22, diveRate: 0.12, blockPersona: 'read' },
  },
  {
    id: 'chengguang',
    kit: { jersey: 0xf5b8a0, shorts: 0x4a3a22, trim: 0xfff3e0, libero: { jersey: 0x4a3a22, shorts: 0x2e2414, trim: 0xf5b8a0 } }, // 曙光杏——最後一道光的暖
    name: '承光大學',
    tier: TIER.MID,
    style: 'defense',
    blurb: '綜合大學，隊員都是先讀書再打球的人。他們靠的是不會掉的球。',
    trait: '防守與默契——沒有嚇人的攻擊，但你要贏得先扣穿他們十二次',
    cost: {
      ball: '球權分得很平均，沒有人是王牌，也沒有人被冷落。',
      record: '十六強到八強。這裡的人不把輸球當世界末日。',
      tech: '學長很願意帶你，只是他們自己也還在摸索。',
    },
    level: 70,
    attrBias: { reaction: 8, speed: 4, power: -3 },
    roleBias: { libero: { reaction: 6 } },
    trustBias: {},
    heights: [1.80, 1.85, 1.92, 1.87, 1.83, 1.91],
    squad: ['賀晏群', '鄒皓天', '曾家松', '侯朗晉', '甘子昀', '童明祐'],
    grades: [4, 2, 1, 3, 2, 1],
    libero: '唐晞平',
    liberoGrade: 4,
    ace: { slot: 'L', name: '唐晞平', title: '最後一道光' },
    // 曾家松＝黑松「未完成的牆」。`events.js:475` 已經播出去的畢業台詞寫
    // 「大學排壇等著看他砌完」——伏筆講了就要有著落，漏掉他和把王勝翔寫進來
    // 是同一種錯（對抗覆審指出）。★ 他不是這裡的王牌 ★ 承光的隊魂是自由人，
    // 他還在砌那面牆——這比直接讓他當王牌更接近那句台詞。
    alumni: ['曾家松'],
    ai: { tipRate: 0.22, dumpRate: 0.1, floatServeRate: 0.18, diveRate: 0.2, blockPersona: 'read' },
  },
  {
    id: 'luze-tech',
    kit: { jersey: 0x97862c, shorts: 0x2c2a10, trim: 0xf0ecc8, libero: { jersey: 0xdce8d8, shorts: 0x2c2a10, trim: 0x97862c } }, // 鹿澤橄欖——硬地上的草色
    name: '鹿澤科技大學',
    tier: TIER.MID,
    style: 'serve',
    blurb: '地方科大，土法煉鋼。他們的發球練到手臂結繭，一輪能連得五分。',
    trait: '發球壓迫——接不好第一球，這場就一直在追分',
    cost: {
      ball: '你打得好就有球，這裡沒有輩分，只有數據。',
      record: '八強邊緣，抽籤好的話能再往上一場。',
      tech: '練得很凶，但沒有人會告訴你為什麼要那樣練。',
    },
    level: 74,
    attrBias: { serve: 10, power: 4, control: -3 },
    roleBias: {},
    trustBias: {},
    heights: [1.81, 1.88, 1.95, 1.91, 1.86, 1.93],
    squad: ['潘原鋒', '邱野翔', '應耕碩', '段拓凡', '熊柏原', '溫野磐'],
    grades: [2, 4, 1, 3, 2, 1],
    libero: '蔣田恩',
    liberoGrade: 2,
    ace: { slot: 3, name: '段拓凡', title: '硬地重砲' },
    alumni: [],
    ai: { tipRate: 0.08, dumpRate: 0.06, jumpServeRate: 0.4, diveRate: 0.1, blockPersona: 'read' },
  },
  // ---- 弱校三所（weak）----
  {
    id: 'songhe',
    kit: { jersey: 0xbfa878, shorts: 0x3f3524, trim: 0x3f5a48, libero: { jersey: 0x3f5a48, shorts: 0x243528, trim: 0xbfa878 } }, // 原木×松青——湊滿人數的樸素
    name: '松河大學',
    tier: TIER.WEAK,
    style: 'steady',
    blurb: '球隊差一點就要解散了。你來，第一天就是先發。',
    trait: '人數勉強湊滿——認真但生澀，每一分都打得很用力',
    cost: {
      ball: '球隨你打。想扣幾球扣幾球，沒有人跟你搶。',
      record: '第一輪就可能結束。這裡沒有人打過全國賽。',
      tech: '你是隊上最強的人。沒有人追得上你的球，也沒有人會叫你停下來。',
    },
    level: 64,
    attrBias: { stamina: 4, power: -4 },
    roleBias: {},
    trustBias: {},
    heights: [1.78, 1.84, 1.90, 1.86, 1.82, 1.88],
    squad: ['車沅安', '白川宇', '常溪堯', '麥汎博', '雷沐凡', '尹淵祺'],
    grades: [3, 2, 1, 4, 1, 2],
    libero: '阮溪佑',
    liberoGrade: 2,
    ace: { slot: 1, name: '白川宇', title: '獨木橋' },
    alumni: [],
    ai: { tipRate: 0.12, dumpRate: 0.06, floatServeRate: 0.3, diveRate: 0.06, blockPersona: 'read' },
  },
  {
    id: 'daiban',
    kit: { jersey: 0x8474a4, shorts: 0x2a2438, trim: 0xe8e0c0, libero: { jersey: 0xe8e0c0, shorts: 0x2a2438, trim: 0x8474a4 } }, // 岱坂岩紫——山的暮色
    name: '岱坂技術學院',
    tier: TIER.WEAK,
    style: 'power',
    blurb: '今年剛升上甲組。全隊沒有人打過一場全國級的比賽，包括教練。',
    trait: '生猛但沒章法——體力驚人，判斷全憑直覺',
    cost: {
      ball: '你是唯一打過全國賽的人，球當然給你。',
      record: '升格第一年，能贏一場就是校史。',
      tech: '沒有人會擋你試任何東西——包括那些不該試的。',
    },
    level: 62,
    attrBias: { stamina: 6, jump: 3, control: -6 },
    roleBias: {},
    trustBias: {},
    heights: [1.79, 1.86, 1.92, 1.89, 1.84, 1.90],
    squad: ['邢子勤', '房嘉禾', '齊柏昀', '于振遠', '甯皓丞', '巫仲霖'],
    grades: [1, 2, 3, 2, 1, 4],
    libero: '苗俊安',
    liberoGrade: 1,
    ace: { slot: 3, name: '于振遠', title: '未馴的臂' },
    alumni: [],
    ai: { tipRate: 0.06, dumpRate: 0.04, jumpServeRate: 0.25, diveRate: 0.05, blockPersona: 'read' },
  },
  {
    id: 'meixi',
    kit: { jersey: 0xd4668f, shorts: 0x3c1428, trim: 0xffe0ec, libero: { jersey: 0x2f1a26, shorts: 0x24101c, trim: 0xd4668f } }, // 梅紅——打好玩的也要打得漂亮
    name: '梅溪大學',
    tier: TIER.WEAK,
    style: 'trick',
    blurb: '這裡的排球隊比較像社團。他們打球是為了開心，而且真的很開心。',
    trait: '沒有壓力的球隊——會玩很多花招，但關鍵分沒有人想扛',
    cost: {
      ball: '要多少有多少，因為其他人根本不介意誰扣。',
      record: '不會有戰績。他們連報名表都是截止前一天才交的。',
      tech: '這裡沒有人在乎輸贏。留下來的理由要你自己找。',
    },
    level: 66,
    attrBias: { control: 3, power: -5, stamina: -3 },
    roleBias: {},
    trustBias: {},
    heights: [1.80, 1.85, 1.91, 1.87, 1.83, 1.89],
    squad: ['甄逸凡', '岑雲開', '尚悠然', '池逸群', '石雲哲', '柳雲騏'],
    grades: [4, 3, 2, 1, 2, 3],
    libero: '卓雲平',
    liberoGrade: 4,
    ace: { slot: 1, name: '岑雲開', title: '打好玩的' },
    alumni: [],
    ai: { tipRate: 0.28, dumpRate: 0.16, floatServeRate: 0.28, diveRate: 0.08, blockPersona: 'read' },
  },
];

const BY_ID = new Map(UNIVERSITIES.map((u) => [u.id, u]));

/** 查一所大學（查無回 null，同 `opponentById` 的慣例）。 */
export function universityById(id) {
  return BY_ID.get(id) ?? null;
}

/**
 * 這個高中成績開得出哪些學校。
 * ★ 規則不在這裡 ★ 成績 → 等級的判定是 `admission.admissionTiersFor`（批 2 訂的），
 * 本函式只把等級換成學校——規則寫兩份，遲早兩邊漂移。
 */
export function admissibleSchoolsFor(finish) {
  const tiers = new Set(admissionTiersFor(finish));
  return UNIVERSITIES.filter((u) => tiers.has(u.tier));
}

// ════════════════════════════════════════════════════════════════
// 同屆隊友的去向（題 4「高中那些人全部回來」）
// ════════════════════════════════════════════════════════════════
// ★ 為什麼是算出來的、不是寫死的 ★ 玩家的隊友是誰取決於他招募了誰、逐出了誰——
// 寫死一張表等於假設每個人的第三年名冊都一樣。這裡用**戰力排序＋輪流分發**：
// 強的人去強的學校（那是升學評定的同一套邏輯，只是對象換成隊友），同分用 id 排序，
// 全程零亂數 ⇒ 同一份存檔永遠得到同一批去向（存檔裡不必再存一份）。
//
// ⚠ 不追蹤程序生成的補位新生（`drawName` 那批）：拍板寫明只分配同屆的具名隊友，
//    補位員連 persona 都是生成的，替他寫去向只會稀釋真正認得的人。
//    ——這裡的判準是 `growth.grade === 3`（與玩家同屆），補位新生年級較低自然落榜。

// ★ 去向已經寫死的人不進分配 ★ 資料表裡的 `alumni`（詹子曜們）與 `NOT_ATTENDING`
// （王勝翔）都是「已經有答案的人」。他們**招募得到**，被挖走後就成了玩家的隊友、
// 第 3 屆也是三年級——沒有這道過濾，詹子曜會同時出現在北陵（寫死）與另一所（分配），
// 王勝翔會出現在他明說不會去的地方。判準是「這個名字有沒有既定去向」，不是「他在不在
// 玩家隊上」——後者才是會被玩家的招募行為繞過的那種寫法。
const PREPLACED = new Set([
  ...UNIVERSITIES.flatMap((u) => u.alumni ?? []),
  ...NOT_ATTENDING,
]);

const ATTR_KEYS = ['jump', 'power', 'reaction', 'stamina', 'speed', 'control', 'serve', 'block'];

function powerOf(member) {
  const a = member?.attributes ?? {};
  return ATTR_KEYS.reduce((s, k) => s + (Number.isFinite(a[k]) ? a[k] : 0), 0);
}

// 分層順序＝強豪 → 中段 → 弱校。★ 集中在這裡 ★ 別處再排一次就會漂移。
const TIER_ORDER = [TIER.POWERHOUSE, TIER.MID, TIER.WEAK];
const SCHOOLS_BY_TIER = TIER_ORDER.map((t) => UNIVERSITIES.filter((u) => u.tier === t).map((u) => u.id));

/**
 * 同屆隊友各自去了哪所大學。**純函式、決定論**。
 * @param members `save.roster.members`
 * @returns `{ [schoolId]: [{ id, name, fullName, role }] }`（沒人的學校不出現）
 */
export function alumniPlacementsFor(members = null) {
  const peers = (Array.isArray(members) ? members : [])
    .filter((m) => m?.growth?.grade === 3 && typeof m.fullName === 'string' && m.fullName)
    .filter((m) => !PREPLACED.has(m.fullName));
  if (!peers.length) return {};
  // 先排序再分發＝名冊順序（招募／畢業會打亂它）不影響結果
  const sorted = [...peers].sort((a, b) => (
    powerOf(b) - powerOf(a) || String(a.id).localeCompare(String(b.id))
  ));
  // ★ 分層，不是依序填滿 ★ 先前寫成「照順序輪流塞進九所」，結果三個隊友會**全部**
  // 進強豪校（前三所都是強豪）——強弱之分整個不見了。改成按名次的**相對位置**決定
  // 等級：前 1/3 去強豪、中 1/3 中段、後 1/3 弱校，組內再輪流分到該等級的三所。
  // ★ 取每個名次的**區間中點**，分母至少 3 ★ 直接用 `i * 3 / n` 的話，只有一位同屆
  // 隊友時 `floor(0)` ＝ 無條件直上第一強豪（二輪覆審 N4）——那不是分層，是退化。
  // 中點取樣讓 n=1 落在中段、n=2 落在強豪＋弱校（三輪覆審實跑更正：`floor(1.5/2*3)=2`
  // 是弱校不是中段——兩個人一強一弱，中間那層留給人多的時候），n≥3 起與均分同義。
  const out = {};
  sorted.forEach((m, i) => {
    const tierIdx = Math.min(TIER_ORDER.length - 1,
      Math.floor(((i + 0.5) / sorted.length) * TIER_ORDER.length));
    const tierSchools = SCHOOLS_BY_TIER[tierIdx];
    const schoolId = tierSchools[i % tierSchools.length];
    (out[schoolId] ||= []).push({
      id: m.id, name: m.name ?? m.fullName, fullName: m.fullName, role: m.role ?? 'outside',
    });
  });
  return out;
}
