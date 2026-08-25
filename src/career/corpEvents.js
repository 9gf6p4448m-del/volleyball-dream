// 企業章敘事層（批 4，2026-08-25）——合約卡文案、薪水選擇點、王勝翔錨點、
// 收尾卡點名（國外強權＋條件簡子嵐）。
//
// ★ 文案全屬提案（試玩回饋即改）★ 凍結的是可達性與機制（acceptance-corp-batch4.md）。
// ★ 拍板題 2 ★ 排球為主＋輕量成人元素：合約/薪水只做敘事與少量選擇點，
//   不做經濟數值系統——本檔沒有任何「錢」的數值欄位，只有話。
// ★ 拍板題 1 ★ 國外強權職業聯賽＝世界觀存在、本章僅敘事點名（接簡子嵐
//   「更大的海」`events.js:503` 伏筆）；可玩與否留職業章再裁。
import { CORPORATIONS } from './corporations.js';

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
  return [{
    id: CORP_WANG_INTRO_EV,
    lines: [
      '熱身時，網子另一邊有人停下了動作。',
      '王勝翔：「……你也爬到這裡了。」',
      '王勝翔：「我先到四年。這片天空長什麼樣子，我比誰都清楚——」',
      '王勝翔：「所以今天，讓我看看你這四年，練出了什麼。」',
      '高中那年說要直接挑戰企業聯賽的男人，就站在那裡。制空者——現在是這個聯賽的天花板。',
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

// 資料完整性自我檢查（測試用）：王勝翔的隊要真的存在於八隊表
export const WANG_TEAM_EXISTS = CORPORATIONS.some((c) => c.id === WANG_TEAM_ID);
