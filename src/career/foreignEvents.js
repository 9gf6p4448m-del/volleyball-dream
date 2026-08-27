// 國外聯賽卷 批 4（2026-08-27）——敘事層：簡子嵐海外重逢一次性事件（本卷最後一批）。
//
// ★ 範本＝proEvents.js（proWangRivalPreEvents／proClosingLines）★ 同構：dialogPlay
// 契約一律 {speaker,text} 物件（proEvents.js 檔頭已記過的出廠 bug 教訓——字串 lines
// 會變空白泡泡）；一生一次走既有 fireEvents 管道（e.id 入帳＝career.events 去重）；
// round 守衛防跨章誤觸發（同 proWangRivalPreEvents 對 round!=='pro' 的擋法）。
//
// ★ 不造新角色、不動任何隊伍資料表 ★（卷宗§一拍板題 5）：簡子嵐不進海外 squad，
// 只是敘事層事件——她「在這個聯賽的某隊」是台詞裡的說法，不對應資料表任何一支
// FOREIGN_TEAMS 的 squad 成員，因此本函式不查、不比對 opponentId。
//
// 卷宗＝`docs/kickoffs/foreign-league-kickoff.md`；
// 驗收＝`docs/kickoffs/acceptance-foreign-batch4.md`（F4-2/F4-3/F4-6）。

export const FOREIGN_JIAN_REUNION_EV = 'foreign-jian-reunion';

/**
 * 簡子嵐海外重逢的賽前事件。**純函式**，走 fireEvents 管道（e.id 入帳＝一生一次）。
 * @param matchEntry 賽程項（`round !== 'foreign'` 一律不適用——高中/大學/企業/國內
 *                   職業/海外季後賽 zero 誤觸發；海外季後賽 round 沿用 'semi'/'final'，
 *                   同樣被這道守衛擋掉，同 proWangRivalPreEvents 對季後賽的擋法）
 * @param played     `career.events` 陣列（去重用，同 proWangRivalPreEvents 的 `played`）
 * @param uniRoster  `store.loadUniRoster()` 的回傳（可為 null）——判準與 proClosingLines
 *                   的 hasJian 同款：大學名冊封存含 fullName '簡子嵐'
 * @returns 0 或 1 個事件的陣列（同 proWangRivalPreEvents 的回傳形狀）
 */
export function foreignJianEventFor(matchEntry, played, uniRoster) {
  if (matchEntry?.round !== 'foreign') return [];
  const hasJian = (uniRoster?.members ?? []).some((m) => m?.fullName === '簡子嵐');
  if (!hasJian) return [];
  if ((played ?? []).includes(FOREIGN_JIAN_REUNION_EV)) return [];
  return [{
    id: FOREIGN_JIAN_REUNION_EV,
    lines: [
      { speaker: '', text: '球員通道口，一個熟悉的背號正在暖身——球衣換了隊名，但那個站姿，還是「颱風眼」。' },
      { speaker: '簡子嵐', text: '……真的走到這裡了。上次比賽表訂出來那天，我還在猜你會不會也站上這片海。' },
      { speaker: '簡子嵐', text: '大學那年我說「還有更大的海」——現在你自己走出來看到了，是不是比想像中更大？' },
      { speaker: '', text: '網子架起來之前，她笑了一下，轉身走回自己那半場——重逢只夠說這幾句，剩下的，用球說。' },
    ],
  }];
}
