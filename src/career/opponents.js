// Phase 2 stage 2 — 對手參數檔（純資料；數值差×風格差）
// trait＝識別特徵：供劇情層與情蒐錄影帶（stage 5）引用；賽前敵情一行字
// scoutRead＝情蒐讀取強度（0-1：讀你的慣用線收攏攔網；弱隊不讀）
// level＝全屬性基準；attrBias＝全隊屬性偏移；roleBias＝角色屬性偏移；
// trustBias＝舉球分配傾向（疊在基準 trust 上）；heights＝六槽身高
// （槽序同 lineup：S/OH/MB/OPP/OH/MB）；ai＝風格機率（皆決定論 hash 消費）
// TODO(naming)：各隊 name/trait 為佔位命名，命名工程統一潤稿（球員名由 buildOpponentTeam
// 以「name＋N號」動態組出——見 careerState.js buildOpponentTeam）
export const OPPONENTS = [
  {
    id: 'north-tech',
    name: '北原工商',
    style: 'steady',
    trait: '紀律型隊伍——發球保守、失誤極少，節奏四平八穩',
    level: 52,
    attrBias: { control: 6 },
    roleBias: {},
    trustBias: {},
    heights: [1.80, 1.85, 1.92, 1.86, 1.83, 1.90],
    scoutRead: 0,
    ai: { tipRate: 0.06, dumpRate: 0.04, floatServeRate: 0.25, diveRate: 0.03 }, // 控制系：飄浮發球、防守韌性低（少魚躍）
  },
  {
    id: 'white-wave',
    name: '白浪高中',
    style: 'defense',
    trait: '防守黏得可怕——救球救不完，還愛用吊球打亂你的節奏',
    level: 57, // 平衡治具 07-22：group-2 勝率 92%>group-1 86% 倒掛——加黏不加暴力
    attrBias: { reaction: 10, speed: 6, power: -4 },
    roleBias: {},
    trustBias: {},
    heights: [1.81, 1.84, 1.90, 1.85, 1.83, 1.89],
    scoutRead: 0.25,
    ai: { tipRate: 0.22, dumpRate: 0.08, floatServeRate: 0.15, diveRate: 0.15 }, // 防守隊招牌：拚命魚躍、球不落地不放棄
  },
  {
    id: 'obsidian',
    name: '曜石體中',
    style: 'quick',
    trait: '這隊 MB 攔網極快、快攻又急又狠——中路是他們的天下',
    level: 60,
    attrBias: {},
    roleBias: { middle: { block: 10, jump: 8, power: 4 } },
    trustBias: { middle: 22 },
    heights: [1.83, 1.87, 1.98, 1.89, 1.85, 1.96],
    scoutRead: 0.7,
    ai: { tipRate: 0.1, dumpRate: 0.1, jumpServeRate: 0.05, diveRate: 0.08 },
  },
  // W6 A1 新隊①（level 55，北原↔白浪空檔）：變化球隊——身材矮、火力弱，
  // 靠球路變化（吊球/二次球/飄浮球）打亂節奏；攔網差＝扣過去很痛快
  {
    id: 'gale-shore',
    name: '青嵐水產', // TODO(naming)
    style: 'trick',
    trait: '球路花得要命——吊球、二次球、飄浮球輪番來，節奏全在他們手裡', // TODO(naming)
    level: 55,
    attrBias: { control: 8, power: -6, block: -4 },
    roleBias: { setter: { control: 6 } },
    trustBias: { setter: 6 },
    heights: [1.79, 1.83, 1.89, 1.84, 1.82, 1.87],
    scoutRead: 0.15,
    ai: { tipRate: 0.28, dumpRate: 0.18, floatServeRate: 0.35, diveRate: 0.1 },
  },
  {
    id: 'iron-mist',
    name: '鐵霧工業',
    style: 'serve',
    trait: '發球輪就是他們的得分輪——強力發球連發，一傳頂不住就崩',
    level: 64,
    attrBias: { serve: 12, power: 4 },
    roleBias: {},
    trustBias: {},
    heights: [1.84, 1.89, 1.95, 1.91, 1.87, 1.93],
    scoutRead: 0.5,
    ai: { tipRate: 0.08, dumpRate: 0.06, jumpServeRate: 0.45, floatServeRate: 0.2, diveRate: 0.08 }, // 發球輪就是得分輪
  },
  // W6 A1 新隊②（level 67，鐵霧↔天鷹空檔）：高牆型——攔網手一排比一排高，
  // 正面硬扣會被一路蓋回來；腳步偏慢＝吊球與快節奏是解法
  {
    id: 'black-pine',
    name: '黑松實業', // TODO(naming)
    style: 'wall',
    trait: '高牆型隊伍——攔網手一排比一排高，硬扣過去的球都會被蓋回來', // TODO(naming)
    level: 67,
    attrBias: { block: 10, jump: 6, speed: -3 },
    roleBias: { middle: { block: 6 } },
    trustBias: { middle: 10 },
    heights: [1.86, 1.93, 2.01, 1.95, 1.91, 1.99],
    scoutRead: 0.6,
    ai: { tipRate: 0.06, dumpRate: 0.05, jumpServeRate: 0.15, floatServeRate: 0.1, diveRate: 0.07 },
  },
  {
    id: 'sky-hawk',
    name: '天鷹學園',
    style: 'power',
    trait: '全國決賽常客——兩翼重砲全面壓制，硬碰硬幾乎沒有勝算',
    level: 72,
    attrBias: { power: 6, jump: 5 },
    roleBias: { outside: { power: 6 } },
    trustBias: { outside: 8 },
    heights: [1.86, 1.92, 1.99, 1.94, 1.90, 1.97],
    scoutRead: 0.9,
    ai: { tipRate: 0.1, dumpRate: 0.08, jumpServeRate: 0.25, floatServeRate: 0.1, diveRate: 0.13 }, // 強隊全能：積極魚躍
  },
];

export function opponentById(id) {
  return OPPONENTS.find((o) => o.id === id) ?? null;
}
