// 職業聯賽隊伍池（職業章 批 1，2026-08-26）——本地頂級職業聯賽八隊。
//
// ★ 與 corporations.js 同構（卷宗§二地基盤點）★ 欄位鍵集合逐一相同
// （kit/tier/style/level/attrBias/roleBias/trustBias/heights/squad/grades/libero/
// liberoGrade/ace/ai/scoutRead），`proTeam.js` 直接照抄 `corpTeam.js` 的建隊公式。
// 高中 `opponents.js`／大學 `universities.js`／企業 `corporations.js` 三檔零改動
// （凍結驗收 A1-A9）——本表是第四張資料表，不是引擎改動。
//
// ★ 王勝翔（拍板題 3：同季挖角入職業）★ 企業章 ace「制空者」（`corporations.js`
// qingkong-aero squad[4]）——本卷設定＝玩家打完企業那一季，他同季被本地職業最強隊
// 「蒼羽泰坦」挖走，職業生涯早玩家一步。slot/role/title 沿用（outside、'制空者'），
// grade（在隊年資，同企業章 grades 欄位語意）改回 1——他在**這支**新球隊剛報到。
//
// ★ level 是初值不是定案 ★ 企業最強 88。這裡把職業聯賽定位成「比企業聯賽高一截」
// 的頂級舞台：強豪 90-92／中堅 83-85／保底 74-78。批 3 接上賽季迴圈後用治具校準。
//
// ★ scoutRead 三檔沿企業章形狀（拍板題 5：不加深）★ 頂級 0.85／中堅 0.55／保底 0.25。
// 讀取路徑（career.scouting 回退全生涯聚合）的接線是批 2/3 的事，本批只鋪資料。
//
// ★ grades＝在隊年資 ★（同 corporations.js 檔頭語意）。批 1 只有一年、不跑畢業/換血。
//
// 卷宗＝`docs/kickoffs/pro-chapter-kickoff.md`；
// 驗收＝`docs/kickoffs/acceptance-pro-batch1.md`（動手前凍結）。
import { TIER } from './admission.js';

export const PRO_TIER_LABEL = {
  [TIER.POWERHOUSE]: '豪門',
  [TIER.MID]: '勁旅',
  [TIER.WEAK]: '新軍',
};

// ════════════════════════════════════════════════════════════════
// 八支職業球隊
// ════════════════════════════════════════════════════════════════
export const PRO_TEAMS = [
  // ---- 豪門兩家（powerhouse）----
  {
    id: 'cangyu-titans',
    name: '蒼羽泰坦',
    tier: TIER.POWERHOUSE,
    style: 'power',
    scoutRead: 0.85,
    kit: {
      jersey: 0x151b3d, shorts: 0x05070f, trim: 0xd4af6a,
      libero: { jersey: 0xd4af6a, shorts: 0x05070f, trim: 0x151b3d },
    },
    level: 92,
    attrBias: { power: 8, jump: 7, block: 4 },
    roleBias: { outside: { power: 6 } },
    trustBias: { outside: 10 },
    heights: [1.90, 1.95, 2.03, 1.98, 1.93, 2.00],
    // slot4＝王勝翔（同企業章：outside、身高微長至 1.93）
    squad: ['談繼宇', '岳擎宸', '童擘天', '酈懷淵', '王勝翔', '洛景衡'],
    grades: [6, 3, 8, 5, 1, 2],
    libero: '沈聞雪',
    liberoGrade: 6,
    ace: { slot: 4, name: '王勝翔', title: '制空者' },
    ai: { tipRate: 0.06, dumpRate: 0.05, jumpServeRate: 0.42, diveRate: 0.13, blockPersona: 'read' },
  },
  {
    id: 'tiegu-warlords',
    name: '鐵骨戰王',
    tier: TIER.POWERHOUSE,
    style: 'wall',
    scoutRead: 0.85,
    kit: {
      jersey: 0x1a1a1a, shorts: 0x0a0a0a, trim: 0xb3272d,
      libero: { jersey: 0xb3272d, shorts: 0x0a0a0a, trim: 0x1a1a1a },
    },
    level: 90,
    attrBias: { block: 9, stamina: 4 },
    roleBias: { middle: { block: 6, jump: 3 } },
    trustBias: { middle: 8 },
    heights: [1.89, 1.94, 2.04, 1.97, 1.92, 2.01],
    squad: ['尉遲翊', '韓聿修', '費長庚', '諸葛硯', '樓觀瀾', '於子墨'],
    grades: [7, 4, 6, 3, 5, 2],
    libero: '談星野',
    liberoGrade: 7,
    ace: { slot: 2, name: '費長庚', title: '不倒城' },
    ai: { tipRate: 0.05, dumpRate: 0.04, floatServeRate: 0.16, diveRate: 0.09, blockPersona: 'commit' },
  },
  // ---- 勁旅三家（mid）----
  {
    id: 'feiyan-swift',
    name: '飛燕魁星',
    tier: TIER.MID,
    style: 'quick',
    scoutRead: 0.55,
    kit: {
      jersey: 0x2e7d5b, shorts: 0x0f2e21, trim: 0xf2d675,
      libero: { jersey: 0xf2d675, shorts: 0x0f2e21, trim: 0x2e7d5b },
    },
    level: 85,
    attrBias: { speed: 8, reaction: 5, stamina: 3, power: -2 },
    roleBias: { middle: { speed: 5 } },
    trustBias: { middle: 8 },
    heights: [1.86, 1.91, 1.99, 1.94, 1.89, 1.97],
    squad: ['柳知微', '姜聞遠', '慕容燁', '云漸鴻', '賀秋原', '竺明遠'],
    grades: [5, 6, 7, 4, 2, 3],
    libero: '上官栩',
    liberoGrade: 5,
    ace: { slot: 2, name: '慕容燁', title: '瞬影' },
    ai: { tipRate: 0.1, dumpRate: 0.08, floatServeRate: 0.2, diveRate: 0.12, blockPersona: 'read' },
  },
  {
    id: 'haoyue-current',
    name: '皓月潮聲',
    tier: TIER.MID,
    style: 'serve',
    scoutRead: 0.55,
    kit: {
      jersey: 0x274472, shorts: 0x0d1b30, trim: 0xe8e8e8,
      libero: { jersey: 0xe8e8e8, shorts: 0x0d1b30, trim: 0x274472 },
    },
    level: 84,
    attrBias: { serve: 9, stamina: 5, control: -2 },
    roleBias: {},
    trustBias: {},
    heights: [1.85, 1.90, 1.98, 1.93, 1.88, 1.96],
    squad: ['顧星潯', '蕭浪川', '東方岑', '荀望舒', '齊嶼帆', '費潮生'],
    grades: [6, 8, 4, 5, 2, 3],
    libero: '柯聽濤',
    liberoGrade: 4,
    ace: { slot: 1, name: '蕭浪川', title: '滿月弦' },
    ai: { tipRate: 0.08, dumpRate: 0.06, jumpServeRate: 0.4, diveRate: 0.12, blockPersona: 'read' },
  },
  {
    id: 'qingshuang-sentinel',
    name: '青霜哨兵',
    tier: TIER.MID,
    style: 'defense',
    scoutRead: 0.55,
    kit: {
      jersey: 0x6b7f8c, shorts: 0x242c31, trim: 0xdff3f7,
      libero: { jersey: 0xdff3f7, shorts: 0x242c31, trim: 0x6b7f8c },
    },
    level: 83,
    attrBias: { reaction: 8, control: 5, power: -3 },
    roleBias: { libero: { reaction: 5 } },
    trustBias: {},
    heights: [1.84, 1.89, 1.97, 1.92, 1.87, 1.95],
    squad: ['舒聞硯', '尉離塵', '卓寒陽', '聞人肅', '花惜遠', '展文瀾'],
    grades: [5, 4, 3, 9, 2, 6],
    libero: '童知遇',
    liberoGrade: 8,
    ace: { slot: 3, name: '聞人肅', title: '寒霜壁' },
    ai: { tipRate: 0.18, dumpRate: 0.1, floatServeRate: 0.2, diveRate: 0.22, blockPersona: 'read' },
  },
  // ---- 新軍三家（weak）----
  {
    id: 'yingfeng-rangers',
    name: '影風遊俠',
    tier: TIER.WEAK,
    style: 'trick',
    scoutRead: 0.25,
    kit: {
      jersey: 0x3a3a4a, shorts: 0x151520, trim: 0x8fd6c7,
      libero: { jersey: 0x8fd6c7, shorts: 0x151520, trim: 0x3a3a4a },
    },
    level: 78,
    attrBias: { control: 4, reaction: 3, stamina: -4 },
    roleBias: {},
    trustBias: {},
    heights: [1.81, 1.87, 1.94, 1.90, 1.85, 1.92],
    squad: ['苗夜卿', '甄浪白', '童千川', '賀無涯', '顏聽風', '岑寂野'],
    grades: [4, 7, 3, 5, 2, 6],
    libero: '江少澄',
    liberoGrade: 3,
    ace: { slot: 1, name: '甄浪白', title: '幻風' },
    ai: { tipRate: 0.24, dumpRate: 0.15, floatServeRate: 0.25, diveRate: 0.1, blockPersona: 'read' },
  },
  {
    id: 'chunyang-newstars',
    name: '春陽新星',
    tier: TIER.WEAK,
    style: 'steady',
    scoutRead: 0.25,
    kit: {
      jersey: 0xe8955c, shorts: 0x4a2e14, trim: 0xfff0d9,
      libero: { jersey: 0xfff0d9, shorts: 0x4a2e14, trim: 0xe8955c },
    },
    level: 76,
    attrBias: { stamina: 5, power: -3 },
    roleBias: {},
    trustBias: {},
    heights: [1.80, 1.86, 1.93, 1.89, 1.84, 1.91],
    squad: ['溫知遠', '樊少陽', '鍾明遠', '於暖枝', '柳新晴', '白樺'],
    grades: [3, 8, 5, 4, 2, 6],
    libero: '尹晨光',
    liberoGrade: 5,
    ace: { slot: 1, name: '樊少陽', title: '初升' },
    ai: { tipRate: 0.12, dumpRate: 0.06, floatServeRate: 0.26, diveRate: 0.1, blockPersona: 'read' },
  },
  {
    id: 'moye-outlaws',
    name: '墨夜浪人',
    tier: TIER.WEAK,
    style: 'steady',
    scoutRead: 0.25,
    kit: {
      jersey: 0x2b2b2b, shorts: 0x111111, trim: 0x8a8a8a,
      libero: { jersey: 0x8a8a8a, shorts: 0x111111, trim: 0x2b2b2b },
    },
    level: 74,
    attrBias: { control: 5, reaction: 2, jump: -4, speed: -3 },
    roleBias: {},
    trustBias: {},
    heights: [1.79, 1.85, 1.92, 1.88, 1.83, 1.90],
    squad: ['桑夜白', '墨承宇', '賀孤舟', '尉遲夜', '談風塵', '洛无名'],
    grades: [9, 5, 8, 6, 3, 4],
    libero: '蕭浪跡',
    liberoGrade: 9,
    ace: { slot: 2, name: '賀孤舟', title: '孤影' },
    ai: { tipRate: 0.2, dumpRate: 0.09, floatServeRate: 0.28, diveRate: 0.07, blockPersona: 'read' },
  },
];

const BY_ID = new Map(PRO_TEAMS.map((t) => [t.id, t]));

/** 查一支職業隊（查無回 null，同 `corporationById` 的慣例）。 */
export function proTeamById(id) {
  return BY_ID.get(id) ?? null;
}

// ════════════════════════════════════════════════════════════════
// 隊階底薪（多年職業生涯卷批 1）
// ════════════════════════════════════════════════════════════════
// 新人約年薪（單位：萬元/年）。★數值屬提案（試玩可改）★ 凍結的是性質
// （acceptance-multiyear-batch1 A4）：為正、且隊階遞增（豪門＞勁旅＞新軍）。
// 續約的加成公式＝批 2，本表只管入章首約。
const PRO_BASE_SALARY = {
  [TIER.POWERHOUSE]: 600,
  [TIER.MID]: 420,
  [TIER.WEAK]: 280,
};

/** 這支球隊的新人約底薪。壞值（查無隊階）照最低給——不猜。 */
export function proBaseSalaryFor(team) {
  return PRO_BASE_SALARY[team?.tier] ?? PRO_BASE_SALARY[TIER.WEAK];
}

// 續約薪水（多年卷批 2）。★係數屬提案（試玩可改）★ 凍結的是性質
// （acceptance-multiyear-batch2 B3）：名次單調、冠軍加成、恆正、壞值保守。
const RENEWAL_RANK_MUL = [1.3, 1.2, 1.1, 1.1, 1.0, 1.0, 0.9, 0.9]; // rank 1..8
const RENEWAL_FINISH_MUL = {
  champion: 1.15, final: 1.05, semi: 1.0, league: 1.0,
};

/** 下一年的續約年薪：底薪 × 名次係數 × 季後賽係數。壞值照最保守給——不猜。 */
export function proRenewalSalaryFor(team, proRank, proFinish) {
  const base = proBaseSalaryFor(team);
  const r = Number.isInteger(proRank) && proRank >= 1 && proRank <= RENEWAL_RANK_MUL.length
    ? proRank : RENEWAL_RANK_MUL.length;
  // 批 5 覆審 L1 同型順修：原型鏈鍵（'constructor'）會查到函式→NaN 薪水寫進合約
  const f = Object.hasOwn(RENEWAL_FINISH_MUL, proFinish ?? '') ? RENEWAL_FINISH_MUL[proFinish] : 1.0;
  return Math.max(1, Math.round(base * RENEWAL_RANK_MUL[r - 1] * f));
}

// ════════════════════════════════════════════════════════════════
// 挖角邀約集合（企業章名次 → 哪些職業隊來邀）
// ════════════════════════════════════════════════════════════════
// 沿 `corporations.js` 的 `corpOffersFor` 同一套哲學：**成績決定天花板，玩家決定
// 要什麼樣的故事**。輸入＝企業章封存的 `corpRank`（`careerStore.settleCorpFinale`
// 寫入，1–8）。★階梯數字屬提案（試玩可改，卷宗§四）★ 凍結的是兩條性質
// （acceptance-pro-batch1 A6）：①單調——名次越好集合只增不縮 ②任何輸入非空。
const OFFER_TIERS_BY_RANK = [
  { max: 2, tiers: [TIER.POWERHOUSE, TIER.MID, TIER.WEAK] }, // 冠亞軍：三階全開
  { max: 4, tiers: [TIER.MID, TIER.WEAK] },                  // 四強以上：中堅＋新軍
  { max: Infinity, tiers: [TIER.WEAK] },                     // 其餘與壞值：新軍保底
];

/** 這個企業名次拿得到哪些職業隊的邀約。壞值（0/null/非整數）照最低給——不猜。 */
export function proOffersFor(corpRank) {
  const r = Number.isInteger(corpRank) && corpRank >= 1 ? corpRank : Infinity;
  const { tiers } = OFFER_TIERS_BY_RANK.find((t) => r <= t.max);
  const set = new Set(tiers);
  return PRO_TEAMS.filter((t) => set.has(t.tier));
}
