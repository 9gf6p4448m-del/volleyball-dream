// 職業章批 5（2026-08-26）——敘事層（本卷最後一批）：職業合約卡文案、
// 王勝翔同場宿敵線（同隊/敵隊互斥各一生一次）、收尾卡點名（國外強權＋條件簡子嵐）。
//
// ★ 範本＝企業章批 4（corpEvents.js）★ 同構：dialogPlay 契約一律 {speaker,text}
// 物件（批 4 出廠 bug 教訓——探針卷抓過字串 lines＝空白泡泡）；一生一次走既有
// fireEvents 管道（e.id 入帳＝career.events 去重）；round 守衛防跨章誤觸發。
// ★ 拍板題 3（pro-chapter-kickoff.md）★ 王勝翔同季被本地職業最強隊「蒼羽泰坦」
// 挖角＝資歷差四年首次同聯賽——玩家簽**他隊** → 循環賽首次對戰蒼羽泰坦的賽前
// 事件（資歷差＋高中伏筆「直接挑戰企業聯賽」收束）；玩家簽**蒼羽泰坦** → 隊內
// 首見事件（不播對戰版）。兩情境由 teamId 是否等於蒼羽泰坦決定，結構互斥
// （同一個存檔的 teamId 只會是其一），各自獨立的 event id 各一生一次。
import { proTeamById } from './proTeams.js';

// ── B5-1 入隊合約敘事（併入 showProDone，同構 corpEvents.js 的 CORP_CONTRACT_LINES）──
export const PRO_CONTRACT_LINES = [
  '沒有導師、沒有學分——只有一張寫著數字的合約。這一次，排球是你唯一的身分。',
  '更衣室的置物櫃是空的，等你自己把名字貼上去——企業聯賽那張貼紙，你留在了上一段。',
];

// ── B5-2 王勝翔同場宿敵線 ──
const WANG_PRO_TEAM_ID = 'cangyu-titans'; // proTeams.js 王勝翔被挖角去的隊
export const PRO_WANG_RIVAL_EV = 'pro-wang-rival'; // 敵隊變體：循環賽首戰對上
export const PRO_WANG_TEAMMATE_EV = 'pro-wang-teammate'; // 同隊變體：隊內首見

/**
 * 王勝翔宿敵線的賽前事件。**純函式**，走 fireEvents 管道（e.id 入帳＝一生一次）。
 * @param career     careerState 視圖（events 陣列供去重判斷）
 * @param matchEntry 賽程項（`round !== 'pro'` 一律不適用——高中/大學/企業/季後賽
 *                   零誤觸發；季後賽 round 是 'semi'/'final'，同樣被這道守衛擋掉）
 * @param teamId     玩家所屬職業隊 id（`store.loadPro()`，非職業章存檔恆 null）
 * @returns 0 或 1 個事件的陣列（同 corpAnchorPreEvents 的回傳形狀）
 */
export function proWangRivalPreEvents(career, matchEntry, teamId) {
  if (matchEntry?.round !== 'pro') return [];
  if (teamId === WANG_PRO_TEAM_ID) {
    // 同隊變體：隊內首見——掛在球員視角「第一場職業賽前」（schedule 播放順序的
    // 第一筆 id，不是 roundNo——finale 重排會讓 roundNo 不等於播放順序，見
    // proSchedule.js buildProSchedule 的 order 陣列），不看對手是誰、不是對戰事件。
    if (matchEntry.id !== 'pro-r1') return [];
    if ((career?.events ?? []).includes(PRO_WANG_TEAMMATE_EV)) return [];
    return [{
      id: PRO_WANG_TEAMMATE_EV,
      lines: [
        { speaker: '', text: '更衣室裡，王勝翔的球衣掛在你隔壁的置物櫃上。' },
        { speaker: '王勝翔', text: '……你也走到這裡來了。' },
        { speaker: '王勝翔', text: '高中那年我說要直接挑戰企業聯賽——現在看來，我只是繞了個彎，比你早到而已。' },
        { speaker: '王勝翔', text: '不過這次，我們是同一邊的。這片天空，一起扛。' },
      ],
    }];
  }
  // 敵隊變體：循環賽首次對戰蒼羽泰坦
  if (matchEntry.opponentId !== WANG_PRO_TEAM_ID) return [];
  if ((career?.events ?? []).includes(PRO_WANG_RIVAL_EV)) return [];
  return [{
    id: PRO_WANG_RIVAL_EV,
    lines: [
      { speaker: '', text: '球員通道口，王勝翔已經在等——他比你早到了整整四年。' },
      { speaker: '王勝翔', text: '……終於。同一個聯賽，同一片天空下了。' },
      { speaker: '王勝翔', text: '高中那年我說要直接挑戰企業聯賽——我做到了，還多繞一圈爬到了頂端。你呢？' },
      { speaker: '王勝翔', text: '你比我慢了四年。但今天，這四年不算數——網子只認今天站在對面的人。' },
      { speaker: '', text: '制空者。這個聯賽的天花板，終於要跟你正面對上。' },
    ],
  }];
}

// ── B5-3 收尾卡點名（同構 corpClosingLines，職業章＝生涯終章的收束版）──
/**
 * 職業章收尾卡的點名句。國外強權恆點名（決策 7 敘事層級不變、世界觀存在、不可玩）；
 * 大學名冊封存含簡子嵐時加「更大的海」收束句（企業章 A4-4 慣例同款判準）。
 * @param uniRoster `store.loadUniRoster()` 的回傳（可為 null）
 */
export function proClosingLines(uniRoster = null) {
  const lines = [
    '本土最高的聯賽，你站到了這裡。但休息室的電視還亮著海外轉播——那邊的排球，是另一個次元的事，遠得像傳說。',
  ];
  const hasJian = (uniRoster?.members ?? []).some((m) => m?.fullName === '簡子嵐');
  if (hasJian) {
    lines.push('畫面一閃而過，海外聯賽的轉播名單上有個熟悉的背號——簡子嵐真的出海了，「更大的海」從來不是比喻。');
  }
  return lines;
}

// 資料完整性自我檢查（測試用）：王勝翔的隊要真的存在於職業八隊表
export const WANG_PRO_TEAM_EXISTS = proTeamById(WANG_PRO_TEAM_ID) != null;
