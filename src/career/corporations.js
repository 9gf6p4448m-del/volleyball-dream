// 企業聯賽隊伍池（成人/企業章 批 1，2026-08-25）——八家企業、一個聯賽。
//
// ★ 候選隊＝聯賽成員 ★ 沿大學卷同一個拍板精神（`universities.js:3-5`）：你簽了哪一家
// 就進哪一家，其餘七家全是這一年的對手 ⇒ 選秀畫面上看到的每一個名字，這一年都真的
// 會在球場上碰到。八隊單循環 7 場＝階段一的一個賽季（卷宗題 3「先做一年最小可玩」）。
//
// ★ 這張表是資料，不是引擎 ★ 高中 `opponents.js` 與大學 `universities.js` 一行不動
// （凍結驗收 A1-6）；欄位刻意與兩者同構（`buildOpponentTeam` 吃得下），
// `corpSchedule.js` 直接取用。
//
// ★ level 是初值不是定案 ★ 大學最強是北陵 82。這裡強豪 86-88／中堅 79-81／
// 保底 72-75 是「比大學高一截」的第一版猜測，批 3 接上賽季迴圈後用治具校準——
// 現在沒有企業賽程可跑，任何數字都還沒有實測支撐，不假裝有。
//
// ★ scoutRead（2026-08-26 單調治療探針卷修訂）★ 08-25 批 3 原裁定「刻意不設、
// 到時加欄即可」——後半是錯的：既有閘吃「個別交手紀錄」（careerState seen），
// 企業單循環每隊只碰一次、加欄也永不觸發。探針卷拍板題 1 改為**球探開季建檔**：
// corp 對手在 careerMatchSetup 以全生涯聚合分佈（leagueScoutZones）回退，本表
// 的 scoutRead 因此生效。三檔梯度＝強豪 0.85／中堅 0.55／保底 0.25
//（★屬提案試玩可調★；參照高中天鷹 0.9）。大學表維持不設（拍板題 4：探針限企業）。
//
// ★ grades 在這裡＝在隊年資 ★（成人沒有年級）。同名欄位、語意改記「第幾年」——
// 沿用欄位名是因為 `buildCorpMembers` 與 `buildUniMembers` 同形（A1-5），而企業章
// 階段一只有一年、不跑任何畢業/換血邏輯（uniTurnover 的 grade>=4 判準不會碰到這張表）。
//
// 卷宗＝`docs/kickoffs/corporate-chapter-kickoff.md`；
// 驗收＝`docs/kickoffs/acceptance-corp-batch1.md`（動手前凍結）。
import { TIER } from './admission.js';

// 等級的顯示用中文（企業語彙；判斷一律用 `TIER` 的值，同 `TIER_LABEL` 慣例）。
export const CORP_TIER_LABEL = {
  [TIER.POWERHOUSE]: '強豪',
  [TIER.MID]: '中堅',
  [TIER.WEAK]: '保底',
};

// ════════════════════════════════════════════════════════════════
// 八家企業
// ════════════════════════════════════════════════════════════════
// `cost` 三軸＝選秀畫面上**明講的代價**（沿升學畫面同一套鍵，UI 可複用）：
//   ball   球權——你的球會有多少
//   record 戰績——這一年打得到哪裡
//   tech   環境——隊上的人是什麼樣子（沿大學批 7 拍板：不承諾「學得快」）
// ★ 逐隊寫不同的話 ★ 八隊同一套字＝玩家看不出差別，那個取捨就是假的。
export const CORPORATIONS = [
  // ---- 強豪兩家（powerhouse）----
  {
    id: 'qingkong-aero',
    scoutRead: 0.85,
    kit: { jersey: 0x1b3f7a, shorts: 0x0a1a30, trim: 0xcfe0f5, libero: { jersey: 0xcfe0f5, shorts: 0x0a1a30, trim: 0x1b3f7a } }, // 深空藍——天花板的顏色
    name: '擎空航太',
    tier: TIER.POWERHOUSE,
    style: 'power',
    blurb: '企業聯賽的天空本身——七年裡六座冠軍。有人高中畢業那天說要挑戰的，就是這裡。',
    trait: '天花板——高度、火力、經驗每一項都是聯賽第一，弱點要用顯微鏡找',
    cost: {
      ball: '每個位置都坐著打了五年十年的老手。你的球要從他們手裡一分一分拿回來。',
      record: '冠軍是這家公司的預設值。拿不到，年終檢討的是整支球隊。',
      tech: '隊上一半的人穿過國家隊的衣服。他們不會等你，但你追得上就帶你飛。',
    },
    level: 88,
    attrBias: { power: 7, jump: 6, block: 4 },
    roleBias: { outside: { power: 6 } },
    trustBias: { outside: 10 },
    heights: [1.88, 1.93, 2.01, 1.96, 1.92, 1.99],
    // 王勝翔＝slot 4（outside，同高中天鷹 `opponents.js:255` 的位置與 1.92 身高）。
    // 伏筆兌現：`events.js:502`「傳聞他要直接挑戰企業聯賽的天空」——他高中畢業
    // （玩家第 3 屆末）直接進來，玩家大學四年打完才到 ⇒ 他的年資比玩家早四年。
    squad: ['厲擎宇', '霍騰嶽', '聶雲樓', '龔震霆', '王勝翔', '鄔擎峰'],
    grades: [7, 3, 9, 5, 5, 2],
    libero: '游定遠',
    liberoGrade: 6,
    ace: { slot: 4, name: '王勝翔', title: '制空者' },
    ai: { tipRate: 0.07, dumpRate: 0.05, jumpServeRate: 0.4, diveRate: 0.12, blockPersona: 'read' },
  },
  {
    id: 'panshi-heavy',
    scoutRead: 0.85,
    kit: { jersey: 0x4a4f55, shorts: 0x1c1f24, trim: 0xe8862a, libero: { jersey: 0xe8862a, shorts: 0x1c1f24, trim: 0x4a4f55 } }, // 鋼灰×熔橙——廠房與爐火
    name: '磐石重工',
    tier: TIER.POWERHOUSE,
    style: 'wall',
    blurb: '重工業的老字號，三十年沒掉出過四強。他們的攔網像廠房的鋼樑——你知道在哪，還是過不去。',
    trait: '鋼樑攔網——高度不是最高，但手永遠在你要打的那條線上',
    cost: {
      ball: '這裡論資排輩。前三年叫學徒，球給你是恩賜不是制度。',
      record: '四強保底，決賽常客。老師傅們知道怎麼把賽季走完。',
      tech: '每個老手都有一套自己的手藝，肯教。問題是你要先讓他們覺得你值得教。',
    },
    level: 86,
    attrBias: { block: 8, stamina: 4 },
    roleBias: { middle: { block: 6, jump: 3 } },
    trustBias: { middle: 8 },
    heights: [1.86, 1.92, 2.02, 1.95, 1.90, 1.98],
    squad: ['莫守拙', '裴天工', '燕鎮嶽', '鐵慕宏', '關嶽川', '宗磐生'],
    grades: [8, 4, 6, 3, 5, 2],
    libero: '洪定坤',
    liberoGrade: 7,
    ace: { slot: 2, name: '燕鎮嶽', title: '鋼樑' },
    ai: { tipRate: 0.06, dumpRate: 0.05, floatServeRate: 0.18, diveRate: 0.1, blockPersona: 'commit' },
  },
  // ---- 中堅三家（mid）----
  {
    id: 'chaoxi-marine',
    scoutRead: 0.55,
    kit: { jersey: 0x0e6e8c, shorts: 0x06222e, trim: 0xe6f4f8, libero: { jersey: 0xe6f4f8, shorts: 0x06222e, trim: 0x0e6e8c } }, // 遠洋青——甲板上的天色
    name: '潮汐海運',
    tier: TIER.MID,
    style: 'serve',
    blurb: '跑遠洋的公司，隊員一半上過船。他們的發球帶著海上的風——又飄又沉。',
    trait: '發球壓迫——每一輪發球都像一陣湧浪，接不穩就一路被推著走',
    cost: {
      ball: '船上的規矩：能做事的人就有位置。第一個月就會知道你算不算能做事。',
      record: '中段偏上。風向對的年份，他們掀得翻任何一家強豪。',
      tech: '老船員的球風都很野，各有各的怪招——沒有系統，但每一招都是真的用過的。',
    },
    level: 81,
    attrBias: { serve: 9, stamina: 5, control: -2 },
    roleBias: {},
    trustBias: {},
    heights: [1.84, 1.90, 1.97, 1.93, 1.87, 1.95],
    squad: ['甘潮生', '凌破濤', '鄭遠洋', '翁千帆', '駱汛安', '余浪平'],
    grades: [5, 6, 4, 7, 2, 3],
    libero: '柯望潮',
    liberoGrade: 4,
    ace: { slot: 1, name: '凌破濤', title: '離岸流' },
    ai: { tipRate: 0.08, dumpRate: 0.06, jumpServeRate: 0.38, diveRate: 0.12, blockPersona: 'read' },
  },
  {
    id: 'lieyang-petro',
    scoutRead: 0.55,
    kit: { jersey: 0xb32418, shorts: 0x330a06, trim: 0xffd08a, libero: { jersey: 0xffd08a, shorts: 0x330a06, trim: 0xb32418 } }, // 烈陽紅——煉塔頂的火
    name: '烈陽石化',
    tier: TIER.MID,
    style: 'quick',
    blurb: '輪三班的煉油廠養出來的球隊。快攻節奏像產線——一秒都不等人。',
    trait: '產線快攻——落地就起跳、起跳就出手，慢半拍的人連球都看不到',
    cost: {
      ball: '節奏認人：跟得上產線的就有球，跟不上的站在原地看一整年。',
      record: '中段常客。快攻對飆的日子能贏強豪，被摸透節奏的日子誰都打不過。',
      tech: '輪班的人時間都很碎，練球狠而短。你會學會在二十分鐘裡把一件事練到位。',
    },
    level: 80,
    attrBias: { speed: 8, reaction: 5, stamina: 3, power: -2 },
    roleBias: { middle: { speed: 5 } },
    trustBias: { middle: 8 },
    heights: [1.83, 1.89, 1.96, 1.92, 1.86, 1.94],
    squad: ['武烈揚', '古晨曦', '焦炎昆', '秦炬燃', '華亭午', '明曦哲'],
    grades: [6, 3, 5, 4, 2, 7],
    libero: '賴溫恕',
    liberoGrade: 5,
    ace: { slot: 2, name: '焦炎昆', title: '常燃塔' },
    ai: { tipRate: 0.12, dumpRate: 0.1, floatServeRate: 0.2, diveRate: 0.12, blockPersona: 'read' },
  },
  {
    id: 'baigang-precision',
    scoutRead: 0.55,
    kit: { jersey: 0xc8ccd2, shorts: 0x2e3138, trim: 0x2563a8, libero: { jersey: 0x2563a8, shorts: 0x2e3138, trim: 0xc8ccd2 } }, // 銀白×工程藍——卡尺的顏色
    name: '白鋼精機',
    tier: TIER.MID,
    style: 'defense',
    blurb: '做精密機床的。他們防守的站位準到像用卡尺量過——誤差以毫米計。',
    trait: '毫米防守——沒有嚇人的攻擊，但每一球都會回來，直到你先受不了',
    cost: {
      ball: '這裡什麼都量：觸球數、到位率、失誤格。數據好看，球權自然來。',
      record: '八隊裡的第四第五名——穩得像機台，也很難再往上。',
      tech: '隊裡的人話少，做事準。你犯的每一個錯都會被指出來，一次。',
    },
    level: 79,
    attrBias: { reaction: 8, control: 5, power: -3 },
    roleBias: { libero: { reaction: 5 } },
    trustBias: {},
    heights: [1.82, 1.88, 1.95, 1.91, 1.85, 1.93],
    squad: ['席準衡', '范修遠', '屠萬鈞', '喬正德', '邊立恆', '戴精一'],
    grades: [9, 5, 3, 6, 4, 2],
    libero: '毛慎微',
    liberoGrade: 8,
    ace: { slot: 0, name: '席準衡', title: '公差零' },
    ai: { tipRate: 0.2, dumpRate: 0.12, floatServeRate: 0.22, diveRate: 0.2, blockPersona: 'read' },
  },
  // ---- 保底三家（weak）----
  {
    id: 'lvyuan-foods',
    scoutRead: 0.25,
    kit: { jersey: 0x3e7d3a, shorts: 0x142a12, trim: 0xf2ecd8, libero: { jersey: 0xf2ecd8, shorts: 0x142a12, trim: 0x3e7d3a } }, // 原野綠——包裝紙上的田
    name: '綠原食品',
    tier: TIER.WEAK,
    style: 'steady',
    blurb: '做罐頭跟麵條的公司。球隊是員工福利的延伸——但裡面有幾個人還沒放棄。',
    trait: '樸實無華——沒有體系也沒有明星，靠不放棄一顆球撐住比分',
    cost: {
      ball: '球隨你打。這裡缺的從來不是球權，是一個能扛著大家往前的人。',
      record: '墊底圈的常客。贏一場，餐廳會加菜。',
      tech: '有個打過甲組的老前輩當教練，他教得動的東西不多了，但都是真心的。',
    },
    level: 75,
    attrBias: { stamina: 5, power: -3 },
    roleBias: {},
    trustBias: {},
    heights: [1.80, 1.86, 1.93, 1.89, 1.83, 1.91],
    squad: ['田常青', '麥穗豐', '倪家倉', '農以誠', '伍粟安', '穆原野'],
    grades: [4, 2, 8, 6, 3, 5],
    libero: '粘守誠',
    liberoGrade: 7,
    ace: { slot: 1, name: '麥穗豐', title: '收割手' },
    ai: { tipRate: 0.12, dumpRate: 0.06, floatServeRate: 0.28, diveRate: 0.1, blockPersona: 'read' },
  },
  {
    id: 'xingqiao-elec',
    scoutRead: 0.25,
    kit: { jersey: 0x3b2f86, shorts: 0x120e2e, trim: 0x9fe8d8, libero: { jersey: 0x9fe8d8, shorts: 0x120e2e, trim: 0x3b2f86 } }, // 星紫×螢光青——深夜機房
    name: '星橋電子',
    tier: TIER.WEAK,
    style: 'trick',
    blurb: '科技園區的加班大戶。練球時間是擠出來的，球路卻鬼得很——工程師的歪腦筋全用在這。',
    trait: '歪腦筋球路——吊球、快慢變速、發球落點刁鑽，體力見底前很難纏',
    cost: {
      ball: '沒人搶球，因為大家是來紓壓的。你認真，他們就把球都給你。',
      record: '排名倒數，但每一家強豪都在他們手上丟過一局——然後加班季就到了。',
      tech: '隊上的人什麼都會分析，包括你的動作。聽一半就好，另一半是熬夜的胡話。',
    },
    level: 74,
    attrBias: { control: 4, reaction: 3, stamina: -4 },
    roleBias: {},
    trustBias: {},
    heights: [1.79, 1.85, 1.92, 1.88, 1.82, 1.90],
    squad: ['苑書弈', '邵程遠', '管敬業', '嵇夜白', '都會宸', '杭日新'],
    grades: [3, 5, 2, 4, 6, 1],
    libero: '虞測安',
    liberoGrade: 2,
    ace: { slot: 0, name: '苑書弈', title: '深夜變奏' },
    ai: { tipRate: 0.26, dumpRate: 0.16, floatServeRate: 0.26, diveRate: 0.08, blockPersona: 'read' },
  },
  {
    id: 'nanfeng-textile',
    scoutRead: 0.25,
    kit: { jersey: 0xb08d57, shorts: 0x362a18, trim: 0x6a8ea0, libero: { jersey: 0x6a8ea0, shorts: 0x362a18, trim: 0xb08d57 } }, // 舊布駝×褪藍——五十年的布樣
    name: '南風紡織',
    tier: TIER.WEAK,
    style: 'steady',
    blurb: '五十年的老紡織廠，球隊比一些隊員的爸爸還老。飛梭停了，球還在飛。',
    trait: '老而彌堅——反應慢了半步，站位卻永遠在對的地方，經驗吃掉你一半的球',
    cost: {
      ball: '老前輩們巴不得有年輕人來扛。第一天起你就是主力，也是唯一的希望。',
      record: '聯賽墊底。他們的目標是球隊別在自己這一代收掉。',
      tech: '這裡的人打了二十年球，講不出理論，但你每個壞習慣他們一眼就看得出來。',
    },
    level: 72,
    attrBias: { control: 5, reaction: 2, jump: -4, speed: -3 },
    roleBias: {},
    trustBias: {},
    heights: [1.78, 1.84, 1.91, 1.87, 1.81, 1.89],
    squad: ['紀敦厚', '程萬縷', '佘織雲', '溫故仁', '雲天錦', '桑晚成'],
    grades: [10, 7, 8, 9, 6, 5],
    libero: '婁緯經',
    liberoGrade: 9,
    ace: { slot: 3, name: '溫故仁', title: '舊梭' },
    ai: { tipRate: 0.22, dumpRate: 0.1, floatServeRate: 0.3, diveRate: 0.06, blockPersona: 'read' },
  },
];

const BY_ID = new Map(CORPORATIONS.map((c) => [c.id, c]));

/** 查一家企業（查無回 null，同 `universityById` 的慣例）。 */
export function corporationById(id) {
  return BY_ID.get(id) ?? null;
}

// ════════════════════════════════════════════════════════════════
// 邀約集合（U4 聯賽名次 → 哪些企業隊來邀）
// ════════════════════════════════════════════════════════════════
// 沿升學評定同一套哲學（`admission.js`）：**成績決定天花板，玩家決定要什麼樣的故事**。
// 輸入＝U4 封存的 `uniRank`（`careerStore.settleUniFinale` 寫入，1–9）。
// ★ 階梯數字屬提案（試玩可改）★ 凍結的是兩條性質（acceptance-corp-batch1 A1-7）：
//   ① 單調——名次越好集合只增不減 ② 任何輸入非空——最差也有保底隊可去。
const OFFER_TIERS_BY_RANK = [
  { max: 2, tiers: [TIER.POWERHOUSE, TIER.MID, TIER.WEAK] }, // 冠亞軍：三階全開
  { max: 6, tiers: [TIER.MID, TIER.WEAK] },                  // 中段：中堅＋保底
  { max: Infinity, tiers: [TIER.WEAK] },                     // 其餘與壞值：保底
];

/** 這個大學名次拿得到哪些隊的邀約。壞值（0/null/非整數）照最低給——不猜。 */
export function corpOffersFor(uniRank) {
  const r = Number.isInteger(uniRank) && uniRank >= 1 ? uniRank : Infinity;
  const { tiers } = OFFER_TIERS_BY_RANK.find((t) => r <= t.max);
  const set = new Set(tiers);
  return CORPORATIONS.filter((c) => set.has(c.tier));
}
