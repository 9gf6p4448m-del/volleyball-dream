// 海外聯賽隊伍池（國外聯賽卷 批 1，2026-08-27）——「寰宇超級聯賽」四隊，比本地職業聯賽
// 高一截的舞台。
//
// ★ 與 proTeams.js 同構（卷宗§一地基盤點）★ 欄位鍵集合＝PRO_TEAMS 各隊鍵集合再加
// `league: 'foreign'`——`foreignTeam.js` 直接照抄 `proTeam.js` 的建隊公式，`level +
// attrBias + roleBias` 同一條座標系，另造一套換算等於同名不同義（`02 §6.1` 第 2 條）。
// `opponents.js`／`universities.js`／`corporations.js`／`proTeams.js` 四張既有資料表
// 零改動（凍結驗收 F1-1）——本表是第五張資料表，不是引擎改動。
//
// ★ id 解析全域慣例（卷宗§一核心架構決策）★ 海外 4 隊併進 `proTeams.js` 的 BY_ID，
// 讓 20+ 個既有 `proTeamById` 消費點零改動自動支援海外；`PRO_TEAMS` 陣列本身
// （`proRounds`／`proOffersFor`／`proTable` 建列）維持純國內 8 隊不動，海外賽程另走
// 本檔＋`foreignSchedule.js`。**本檔不得 import `proTeams.js`**（併表方向是單向
// proTeams→foreignTeams，反向會成環）；`foreignTeamById`／`isForeignTeamId` 因此
// 用自己的 `FOREIGN_TEAMS`-only 表判斷，不依賴呼叫端傳來的 `league` 欄位（卷宗§一
// 「不依賴 league 欄位讀取端」）。
//
// ★ 強度＝拍板題 3（只調數值不加機制）★ 霸主 2（level 95/94）＋列強 2（92/91），
// 高於國內豪門的 90-92；戰術使用率拉滿（jumpServeRate/floatServeRate 0.45-0.5、
// diveRate 0.15-0.22）——押線判定與 sim 機制零改動，只是資料表數字更硬。
//
// ★ 薪水＝拍板題 4（顯示美金＋內部台幣萬同座標系）★ `career.contract.salary` 一律
// 台幣萬（與國內同一顆座標系，防「同名不同義」）；`TWD_PER_USD`／`usdOf` 是顯示層
// 換算，批 3 UI 才會用到，本批只鋪好函式。匯率定死常數（提案 1:31）。
//
// ★ scoutRead 沿國內同 tier 值（卷宗§一）★ 霸主 0.85／列強 0.55——不加深、不另訂。
//
// ★ grades＝在隊年資 ★（同 proTeams.js／corporations.js 檔頭語意）。批 1 只有一年、
// 不跑畢業/換血。
//
// 卷宗＝`docs/kickoffs/foreign-league-kickoff.md`；
// 驗收＝`docs/kickoffs/acceptance-foreign-batch1.md`（動手前凍結）。
import { TIER } from './admission.js';

export const FOREIGN_LEAGUE_NAME = '寰宇超級聯賽';

export const FOREIGN_TIER_LABEL = {
  [TIER.POWERHOUSE]: '霸主',
  [TIER.MID]: '列強',
};

// ════════════════════════════════════════════════════════════════
// 四支海外球隊
// ════════════════════════════════════════════════════════════════
export const FOREIGN_TEAMS = [
  // ---- 霸主兩家（powerhouse）----
  {
    id: 'aurora-orion',
    name: '極光獵戶',
    league: 'foreign',
    tier: TIER.POWERHOUSE,
    style: 'power',
    scoutRead: 0.85,
    kit: {
      jersey: 0x0a2e52, shorts: 0x041420, trim: 0xd8f0ff,
      libero: { jersey: 0xd8f0ff, shorts: 0x041420, trim: 0x0a2e52 },
    },
    level: 95,
    attrBias: { power: 10, jump: 7, block: 3 },
    roleBias: { outside: { power: 7 }, opposite: { power: 5 } },
    trustBias: { outside: 12 },
    heights: [1.92, 1.98, 2.06, 2.01, 1.96, 2.04],
    // 北歐系洋名——「・」分隔名/姓，同企業章對外籍教練譯名的既有慣例
    squad: ['艾瑞克・林德奎斯特', '艾納・索爾森', '比約恩・哈康森', '拉爾斯・維克', '古斯塔夫・林恩', '尼爾斯・奧斯特柏格'],
    grades: [5, 7, 4, 6, 2, 5],
    libero: '索倫・卡爾森',
    liberoGrade: 6,
    ace: { slot: 1, name: '艾納・索爾森', title: '極光巨錘' },
    ai: { tipRate: 0.05, dumpRate: 0.04, jumpServeRate: 0.48, diveRate: 0.16, blockPersona: 'commit' },
  },
  {
    id: 'solar-toro',
    name: '烈日鬥牛',
    league: 'foreign',
    tier: TIER.POWERHOUSE,
    style: 'serve',
    scoutRead: 0.85,
    kit: {
      jersey: 0xc23b22, shorts: 0x4a1206, trim: 0xffd166,
      libero: { jersey: 0xffd166, shorts: 0x4a1206, trim: 0xc23b22 },
    },
    level: 94,
    attrBias: { serve: 11, jump: 5, stamina: 3 },
    roleBias: { outside: { serve: 5 } },
    trustBias: { outside: 8, opposite: 4 },
    heights: [1.90, 1.97, 2.05, 1.99, 1.94, 2.03],
    // 拉丁系洋名
    squad: ['迭戈・費南德斯', '拉斐爾・莫拉萊斯', '馬可・維拉諾瓦', '安德烈・桑托斯', '伊萬・岡薩雷斯', '巴勃羅・雷耶斯'],
    grades: [6, 8, 5, 4, 3, 6],
    libero: '路易斯・卡布拉爾',
    liberoGrade: 5,
    ace: { slot: 1, name: '拉斐爾・莫拉萊斯', title: '烈日重炮' },
    ai: { tipRate: 0.06, dumpRate: 0.05, floatServeRate: 0.49, diveRate: 0.19, blockPersona: 'read' },
  },
  // ---- 列強兩家（mid）----
  {
    id: 'azure-albatross',
    name: '蒼穹信天翁',
    league: 'foreign',
    tier: TIER.MID,
    style: 'quick',
    scoutRead: 0.55,
    kit: {
      jersey: 0x1d4e6b, shorts: 0x0b1f2b, trim: 0xf2f2f2,
      libero: { jersey: 0xf2f2f2, shorts: 0x0b1f2b, trim: 0x1d4e6b },
    },
    level: 92,
    attrBias: { speed: 9, reaction: 6, control: 3 },
    roleBias: { middle: { speed: 6 } },
    trustBias: { middle: 8 },
    heights: [1.87, 1.93, 2.00, 1.95, 1.90, 1.98],
    // 英語系洋名
    squad: ['詹姆斯・惠特克', '奧利佛・肯特', '亨利・布萊克伍德', '查爾斯・霍克斯', '威廉・皮爾斯', '亞瑟・蘭道夫'],
    grades: [4, 6, 3, 7, 2, 5],
    libero: '喬治・唐納文',
    liberoGrade: 4,
    ace: { slot: 1, name: '奧利佛・肯特', title: '蒼穹疾羽' },
    ai: { tipRate: 0.09, dumpRate: 0.07, jumpServeRate: 0.46, diveRate: 0.17, blockPersona: 'read' },
  },
  {
    id: 'schwarzwald-ritter',
    name: '黑森鐵騎',
    league: 'foreign',
    tier: TIER.MID,
    style: 'wall',
    scoutRead: 0.55,
    kit: {
      jersey: 0x1c1c1c, shorts: 0x0a0a0a, trim: 0x8a1f2b,
      libero: { jersey: 0x8a1f2b, shorts: 0x0a0a0a, trim: 0x1c1c1c },
    },
    level: 91,
    attrBias: { block: 10, stamina: 4 },
    roleBias: { middle: { block: 7, jump: 3 } },
    trustBias: { middle: 10 },
    heights: [1.88, 1.94, 2.08, 1.96, 1.91, 2.05],
    // 德語系洋名
    squad: ['馬克斯・霍夫曼', '卡爾・施耐德', '迪特里希・鮑爾', '約納斯・韋伯', '塞巴斯蒂安・克魯格', '萊納・費舍爾'],
    grades: [7, 5, 8, 4, 3, 6],
    libero: '托比亞斯・朗格',
    liberoGrade: 7,
    ace: { slot: 2, name: '迪特里希・鮑爾', title: '黑森壁壘' },
    ai: { tipRate: 0.05, dumpRate: 0.04, floatServeRate: 0.47, diveRate: 0.21, blockPersona: 'read' },
  },
];

const BY_ID = new Map(FOREIGN_TEAMS.map((t) => [t.id, t]));

/**
 * 查一支海外隊（查無回 null，同 `proTeamById` 的慣例）。
 * ★ 只用本檔自己的表判斷，不依賴呼叫端傳來的 `league` 欄位或 `proTeams.js` 併表後的
 * BY_ID ★——`proTeams.js` 併表是單向依賴（它 import 本檔），本檔反向 import 會成環。
 */
export function foreignTeamById(id) {
  return BY_ID.get(id) ?? null;
}

/** 這個 id 是不是海外隊（同上：只查本檔的表，不靠 league 欄位）。 */
export function isForeignTeamId(id) {
  return BY_ID.has(id);
}

// ════════════════════════════════════════════════════════════════
// 匯率（拍板題 4：顯示美金＋內部台幣萬同座標系，匯率定死常數）
// ════════════════════════════════════════════════════════════════
export const TWD_PER_USD = 31;

/** 台幣萬 → 美金萬，回一位小數數字。顯示層用（批 3），本批只鋪函式。 */
export function usdOf(salaryWan) {
  return Math.round((salaryWan / TWD_PER_USD) * 10) / 10;
}

// ════════════════════════════════════════════════════════════════
// 隊階底薪（同 proTeams.js PRO_BASE_SALARY 同一套哲學：入海外首約）
// ════════════════════════════════════════════════════════════════
// ★數值屬提案（試玩可改）★ 凍結的是性質（acceptance-foreign-batch1 F1-4）：
// 為正、隊階遞增（霸主＞列強）、單位＝台幣萬（同國內座標系，不是美金）。
const FOREIGN_BASE_SALARY = {
  [TIER.POWERHOUSE]: 1900,
  [TIER.MID]: 1300,
};

/** 這支海外隊的首約底薪（台幣萬）。壞值（查無隊階）照低給——不猜。 */
export function foreignBaseSalaryFor(team) {
  return FOREIGN_BASE_SALARY[team?.tier] ?? FOREIGN_BASE_SALARY[TIER.MID];
}

// 海外續約表（同 proTeams.js RENEWAL_RANK_MUL／RENEWAL_FINISH_MUL 同一套哲學）。
// ★係數屬提案（試玩可改）★ 凍結的是性質（acceptance-foreign-batch1 F1-4）：
// rank 越好係數越高（單調不增）、champion 係數＞final、恆正整數。
const FOREIGN_RENEWAL_RANK_MUL = [1.35, 1.2, 1.05, 0.95]; // rank 1..4（4 隊聯賽）
const FOREIGN_RENEWAL_FINISH_MUL = {
  champion: 1.15, final: 1.05, semi: 1.0, league: 1.0,
};

/** 下一年的海外續約年薪（台幣萬）：底薪 × 名次係數 × 季後賽係數。壞值照最保守給——不猜。 */
export function foreignRenewalSalaryFor(team, rank, finish) {
  const base = foreignBaseSalaryFor(team);
  const r = Number.isInteger(rank) && rank >= 1 && rank <= FOREIGN_RENEWAL_RANK_MUL.length
    ? rank : FOREIGN_RENEWAL_RANK_MUL.length;
  // 原型鏈鍵（'constructor'）防線同 proTeams.js:255——照抄，不得漏。
  const f = Object.hasOwn(FOREIGN_RENEWAL_FINISH_MUL, finish ?? '') ? FOREIGN_RENEWAL_FINISH_MUL[finish] : 1.0;
  return Math.max(1, Math.round(base * FOREIGN_RENEWAL_RANK_MUL[r - 1] * f));
}
