// 大作感二卷 批1（2026-08-30）：冠軍戰判定——純函式、零依賴，matchLoop 結算時消費。
//
// 「贏下這一場＝奪冠」只在單場決勝的賽制成立：高中全國賽決賽（national-final）、
// 職業/海外季後賽決賽（pro-final*/foreign-final*，見 proSchedule.PLAYOFF_MATCH_IDS，
// 多年制每年重長、id 帶尾碼故用 startsWith）。大學/企業是聯賽積分制（uni-r*/corp-r*，
// round: 'league'）——贏壓軸戰不等於奪冠（名次由積分表決定），**刻意不在此列**，
// 聯賽冠軍的慶祝要掛在積分結算處，列入本卷後補清單。
const CHAMPIONSHIP_TITLES = [
  { match: (id) => id === 'national-final', title: '全國冠軍' },
  { match: (id) => id.startsWith('pro-final'), title: '職業聯賽總冠軍' },
  { match: (id) => id.startsWith('foreign-final'), title: '海外聯賽總冠軍' },
];

// entry＝生涯賽程的 matchEntry；回傳冠軍字卡標題，非冠軍戰回 null
export function championshipTitleOf(entry) {
  const id = entry?.id;
  if (typeof id !== 'string') return null;
  const hit = CHAMPIONSHIP_TITLES.find((c) => c.match(id));
  return hit ? hit.title : null;
}

// 勝利的冠軍戰才慶祝（雙向：普通勝場／冠軍戰敗北都回 null）
export function shouldCelebrateChampionship(entry, won) {
  return won ? championshipTitleOf(entry) : null;
}
