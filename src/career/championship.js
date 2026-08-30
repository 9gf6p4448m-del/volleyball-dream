// 大作感二卷 批1＋批4（2026-08-30）：冠軍判定純函式，matchLoop 結算時消費。
//
// 兩種賽制、兩支判定：
// - 單場決勝（批1）：「贏這一場＝奪冠」——高中全國賽決賽（national-final）、
//   職業/海外季後賽決賽（pro-final*/foreign-final*，多年制每年重長、id 帶尾碼故
//   用 startsWith）→ shouldCelebrateChampionship
// - 聯賽積分制（批4）：uni-r*/corp-r* 贏壓軸戰不等於奪冠，看最終輪結算後的
//   積分榜名次 → leagueChampionshipTitleOf（名次由呼叫端用 uniTable/corpTable 現算）
import { UNI_ROUNDS } from './uniSchedule.js';
import { CORP_ROUNDS } from './corpSchedule.js';

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

// ── 大作感二卷 批4（2026-08-30）：聯賽（積分制）冠軍 ──
// 檔頭說的「後補」補在這裡：大學/企業冠軍看的是最終輪結算後的積分榜名次，
// 勝敗不進判定（輸掉壓軸戰仍可能榜首封王）。輪次數與 buildUniSchedule/
// buildCorpSchedule 同源（該生成器保證壓軸＝最後一輪）。
const UNI_FINALE_ID = `uni-r${UNI_ROUNDS}`;
const CORP_FINALE_ID = `corp-r${CORP_ROUNDS}`;

export function isLeagueFinaleEntry(entry) {
  const id = entry?.id;
  return id === UNI_FINALE_ID || id === CORP_FINALE_ID;
}

// playerRank/complete＝uniTable/corpTable 的回傳（單一事實來源，呼叫端現算）
export function leagueChampionshipTitleOf(entry, playerRank, complete) {
  if (!isLeagueFinaleEntry(entry) || !complete || playerRank !== 1) return null;
  return entry.id === UNI_FINALE_ID ? '大學聯賽冠軍' : '企業聯賽冠軍';
}
