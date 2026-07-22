// Phase 2 stage 2 — 對手參數檔（純資料；數值差×風格差）
// trait＝識別特徵：供劇情層與情蒐錄影帶（stage 5）引用；賽前敵情一行字
// level＝全屬性基準；attrBias＝全隊屬性偏移；roleBias＝角色屬性偏移；
// trustBias＝舉球分配傾向（疊在基準 trust 上）；heights＝六槽身高
// （槽序同 lineup：S/OH/MB/OPP/OH/MB）；ai＝風格機率（皆決定論 hash 消費）
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
    ai: { tipRate: 0.06, dumpRate: 0.04, powerServeRate: 0 },
  },
  {
    id: 'white-wave',
    name: '白浪高中',
    style: 'defense',
    trait: '防守黏得可怕——救球救不完，還愛用吊球打亂你的節奏',
    level: 56,
    attrBias: { reaction: 8, speed: 5, power: -4 },
    roleBias: {},
    trustBias: {},
    heights: [1.81, 1.84, 1.90, 1.85, 1.83, 1.89],
    ai: { tipRate: 0.22, dumpRate: 0.08, powerServeRate: 0 },
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
    ai: { tipRate: 0.1, dumpRate: 0.1, powerServeRate: 0.05 },
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
    ai: { tipRate: 0.08, dumpRate: 0.06, powerServeRate: 0.45 },
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
    ai: { tipRate: 0.1, dumpRate: 0.08, powerServeRate: 0.25 },
  },
];

export function opponentById(id) {
  return OPPONENTS.find((o) => o.id === id) ?? null;
}
