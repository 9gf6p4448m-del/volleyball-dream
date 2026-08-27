// 企業章敘事層（批 4，2026-08-25）——合約卡文案、薪水選擇點、王勝翔錨點、
// 收尾卡點名（國外強權＋條件簡子嵐）。
//
// ★ 文案全屬提案（試玩回饋即改）★ 凍結的是可達性與機制（acceptance-corp-batch4.md）。
// ★ 拍板題 2 ★ 排球為主＋輕量成人元素：合約/薪水只做敘事與少量選擇點，
//   不做經濟數值系統——本檔沒有任何「錢」的數值欄位，只有話。
// ★ 拍板題 1 ★ 國外強權職業聯賽＝世界觀存在、本章僅敘事點名（接簡子嵐
//   「更大的海」`events.js:503` 伏筆）；可玩與否留職業章再裁。
import { CORPORATIONS, corporationById } from './corporations.js';
// 職業章批 2 覆審 MEDIUM 修：甩開句對職業對手也適用（見 corpShakeOffEvents 註解）
import { proTeamById } from './proTeams.js';
import {
  leagueScoutZones, scoutFocusZone, SCOUT_COLD_SHARE, SCOUT_MIN_SAMPLE, SCOUT_ZONE_LABEL,
} from './careerState.js';

// ── A4-1 入隊合約敘事（併入入社報到卡，零新機制）──
export const CORP_CONTRACT_LINES = [
  '三年合約。白天你是這家公司的職員，傍晚五點半，你是球隊的人。',
  '第一次有人為打球付你薪水——金額不大，但那張聘書上寫著「排球隊」三個字。',
];

// ── A4-2 季中薪水選擇點 ──
// 旗標落在 season.events（單一事實來源；RMW 在 careerStore.corpPaydayChoice）。
export const CORP_PAYDAY_EV = 'corp-payday-1';

export const CORP_PAYDAY_CARD = {
  title: '第一份薪水',
  body: '月底。人生第一筆「打排球賺來的錢」進了戶頭。更衣室裡，老手們用眼角餘光看你——新人領第一份薪水，是有規矩的。',
  treat: { label: '照規矩——請全隊吃一頓', note: '老手們笑著拍你的肩。有些距離，是一頓熱炒拉近的。' },
  save: { label: '寄回家', note: '你想起了高中體育館的地板。這筆錢有更該去的地方——隊上的人沒說什麼，但都看見了。' },
};

/**
 * 薪水卡該不該播。**純函式**。
 * 判準：企業賽程打完 ≥2 場、賽季尚未打完（7/7 之後不補播——結算優先，A4-2）、
 * 旗標未落。career＝careerState 視圖（schedule/results/events）。
 */
export function corpPaydayDue(career) {
  const corpGames = (career?.schedule ?? []).filter((m) => m?.round === 'corp');
  if (!corpGames.length) return false;
  const played = corpGames.filter(
    (m) => (career.results ?? []).some((r) => r.matchId === m.id),
  ).length;
  if (played < 2 || played >= corpGames.length) return false;
  return !(career.events ?? []).includes(CORP_PAYDAY_EV);
}

// ── A4-3 王勝翔錨點（首戰擎空航太的賽前亮相）──
// 走既有 fireEvents 管道（e.id 入帳＝career.events 去重、一生一次）。
export const CORP_WANG_INTRO_EV = 'corp-wang-intro';
const WANG_TEAM_ID = 'qingkong-aero'; // ＝corporations.js 王勝翔那一隊

export function corpAnchorPreEvents(career, matchEntry) {
  if (matchEntry?.opponentId !== WANG_TEAM_ID || matchEntry?.round !== 'corp') return [];
  if ((career?.events ?? []).includes(CORP_WANG_INTRO_EV)) return [];
  // ★ line＝{speaker, text} 物件（dialogPlay 的 paintLine 契約）★ 批 4 出廠時寫成
  // 字串＝正式遊戲裡整段空白泡泡（探針卷 M4 接線實跑抓到，2026-08-26 修）
  return [{
    id: CORP_WANG_INTRO_EV,
    lines: [
      { speaker: '', text: '熱身時，網子另一邊有人停下了動作。' },
      { speaker: '王勝翔', text: '……你也爬到這裡了。' },
      { speaker: '王勝翔', text: '我先到四年。這片天空長什麼樣子，我比誰都清楚——' },
      { speaker: '王勝翔', text: '所以今天，讓我看看你這四年，練出了什麼。' },
      { speaker: '', text: '高中那年說要直接挑戰企業聯賽的男人，就站在那裡。制空者——現在是這個聯賽的天花板。' },
    ],
  }];
}

// ── A4-4 收尾卡點名 ──
/**
 * 收尾卡的點名句。國外強權恆點名（題 1）；大學名冊封存含簡子嵐時加傳聞句
 * （他的伏筆「更大的海」`events.js:503`＋大學送別「海硯之後，還有更大的海」）。
 * @param uniRoster `store.loadUniRoster()` 的回傳（可為 null）
 */
export function corpClosingLines(uniRoster = null) {
  const lines = [
    '休息室的電視上，海外聯賽的轉播還亮著——更快的球、更高的牆。大人的聯賽之上，還有一片海。',
  ];
  const hasJian = (uniRoster?.members ?? []).some((m) => m?.fullName === '簡子嵐');
  if (hasJian) {
    lines.push('聽說簡子嵐真的出海了——「更大的海」不是比喻。轉播名單上，有一個熟悉的名字。');
  }
  return lines;
}

// ── 探針卷（2026-08-26）：賽後甩開句——反制迴路的「得利端」可視化 ──
// 拍板題 3：被盯（賽前）與甩開（賽後）兩端都要看得見。走 postEvs/fireEvents 管道
// （per-match id 入帳＝每場最多一次）。判準鏡射 sim 的冷線：本場打被盯線的佔比
// < SCOUT_COLD_SHARE 且本場樣本 >=6——你整場躲開他們賭的那條線，sim 真的給了
// 攔網折扣（game.js scoutBlockMul <0.15 分支），這句只是把它說出來。
export function corpShakeOffEvents(career) {
  const results = career?.results ?? [];
  if (!results.length) return [];
  const last = results[results.length - 1];
  const entry = (career.schedule ?? []).find((m) => m.id === last.matchId);
  // 職業章批 2 覆審 MEDIUM 修：round 閘原鎖死 'corp'——職業章賽前「被盯」警示
  // 會顯示（careerScreen:1007 已補四表）、賽後甩開句卻恆空＝反制迴路單向斷裂
  // （探針卷「感受不到＝機制不存在」）。判準改資料表口徑（同批 matchOpponentDef
  // 的做法）：對手在企業表或職業表且 scoutRead>0 就適用，不再比對 round 字串。
  if (entry?.round !== 'corp' && entry?.round !== 'pro') return [];
  const id = `corp-shakeoff-${last.matchId}`;
  if ((career.events ?? []).includes(id)) return [];
  const corp = corporationById(entry.opponentId) ?? proTeamById(entry.opponentId);
  if (!corp || !(corp.scoutRead > 0)) return [];
  // 賽前被盯線＝聚合**剔除本場對手的紀錄**（mergeScouting 已把本場記進去，
  // 不剔會拿被污染的分佈自證——careerState.leagueScoutZones 的 excludeId 註解）
  const focus = scoutFocusZone(leagueScoutZones(career, { excludeId: entry.opponentId })?.zones);
  if (!focus) return [];
  const mine = career.scouting?.[entry.opponentId]?.zones ?? null;
  if (!mine) return [];
  const total = (mine.line ?? 0) + (mine.cross ?? 0) + (mine.middle ?? 0) + (mine.tip ?? 0);
  if (total < SCOUT_MIN_SAMPLE) return [];
  if ((mine[focus.zone] ?? 0) / total >= SCOUT_COLD_SHARE) return [];
  return [{
    id,
    lines: [{
      speaker: '',
      text: `整場比賽，你幾乎沒有碰${SCOUT_ZONE_LABEL[focus.zone]}——${corp.name}的球探報告在第一局就過期了。他們的攔網，一直在等一顆不會來的球。`,
    }],
  }];
}

// 資料完整性自我檢查（測試用）：王勝翔的隊要真的存在於八隊表
export const WANG_TEAM_EXISTS = CORPORATIONS.some((c) => c.id === WANG_TEAM_ID);
