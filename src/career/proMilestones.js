// 多年職業生涯卷 小批（2026-08-27 夜拍板）——「後段年份里程碑事件」：治療多年迴圈
// 後段（第 5～9 年）同質的敘事錨點。純函式層，**同構** proEvents.js 的
// proWangRivalPreEvents（自帶 career.events 去重、走既有 fireEvents 管道入帳一生一次；
// pro 章節內 season.events 跨季不清空——見 careerStore.js advanceSeason 的 pro 分支，
// 新一季只換 schedule/results/pendingMatch，events 原樣帶入）。
//
// ★ M1 硬性凍結條款：觸發判定只吃既有封存資料 ★ archive＝store.loadSeasonArchive()
// 的形狀（每筆＝settleProFinale 逐季寫入的 { ...archiveSeasonSummary(season), proRank,
// pro, salary, proFinish }）——不新增任何記帳欄位、不讀 career.chapter.enteredAtSeason
// （那是另一顆單一事實來源，chapterSeasonOf 用，M1 刻意不用它，理由見驗收凍結檔頭）。
// 「職業年資第 N 年」＝已封存的 pro 季數（含國內／海外，畢竟是玩家自己的生涯資歷，
// 不像 R 卷的宿敵鏡像要排除轉隊/出海敘事）+1（正要開打、尚未封存的這一季）。
//
// 卷宗＝驗收凍結 `docs/kickoffs/acceptance-milestone-rival-20260827.md`（M1–M5）。
import { proTeamById } from './proTeams.js';

// ── 事件 id（career.events 去重鍵，同 PRO_WANG_RIVAL_EV 的記帳慣例）──
export const MILESTONE_VETERAN_EV = 'pro-milestone-veteran'; // ①老兵之年
export const MILESTONE_DYNASTY_EV = 'pro-milestone-dynasty'; // ②王朝
export const MILESTONE_FINAL_PUSH_EV = 'pro-milestone-final-push'; // ③最後衝刺

// ── 觸發門檻（★試玩必調★ 提案值，驗收凍結 M1 給定的三個數字）──
export const MILESTONE_VETERAN_YEAR = 5;
export const MILESTONE_DYNASTY_TITLES = 3;
export const MILESTONE_FINAL_PUSH_YEAR = 9;

// ── 小獎勵（★試玩必調★ 提案值：全隊信任 +2 級別。MEDIUM 覆審修正措辭：這是
//    career 層寫入——本檔／careerStore.js／careerScreen.js 三處改動，src/sim
//    程式碼零改動一行——但寫入的值**會**在下一場比賽生效：careerState.js 建隊時
//    用 trustOf(lineup.trust) 塞進 sim Player.trust.fromSetter，sim/trust.js 的
//    trustToWeights（未改動）讀的正是這顆值，觸發它的那一場分配權重因此改變。
//    正確講法是「改動的程式碼不在 sim、但效果會流進 sim 讀到的資料」，不是
//    「效果隔絕在 sim 之外」。
//    消費端＝careerScreen.js fireEvents 的 effect.teamTrust 分支 →
//    careerStore.js applyTeamTrustBonus（RMW 寫 lineup.trust，全隊夾限 0–100））──
export const MILESTONE_TEAM_TRUST_BONUS = 2;

/** archive 裡真的是「職業季」的封存筆數（pro 欄位能解出真實球隊——防壞封存誤數）。 */
function proSeasonsArchived(archive) {
  return (archive ?? []).filter((s) => typeof s?.pro === 'string' && proTeamById(s.pro));
}

/** 已封存季數中拿過 proFinish==='champion' 的筆數（王朝門檻用）。 */
function championsArchived(archive) {
  return proSeasonsArchived(archive).filter((s) => s.proFinish === 'champion').length;
}

const line = (speaker, text) => ({ speaker, text });

// ── 三張敘事卡的演出內容（★文案屬提案★，同構既有 proEvents.js 款式）──
const VETERAN_LINES = [
  line('', '更衣室的置物櫃換過三輪主人，你的那一格卻沒挪過位置——老面孔剩你一個。'),
  line('教練', '第五個年頭了。新人看你的眼神跟看場上老兵沒兩樣——這份重量，你扛得起。'),
];
const DYNASTY_LINES = [
  line('', '獎盃櫃第三次挪出位置——這次隊史留言板上有人寫：「王朝，不是偶然。」'),
  line('教練', '三座冠軍，隨便哪支球隊都得叫你們一聲王朝。這份信任，是你們自己打出來的。'),
];
const FINAL_PUSH_LINES = [
  line('', '球員通道的公告欄貼出新賽程——你數了數，這是第九年。時間比想像中跑得快。'),
  line('教練', '衝刺的年份到了。該證明的還沒證明完，就沒有慢下來的理由。'),
];

/**
 * 里程碑事件的賽前判定。**純函式**——同 proWangRivalPreEvents 的守衛風格：
 * ①只在職業章的常規賽（round 'pro' 或 'foreign'，季後賽 'semi'/'final' 不判定，
 *   同宿敵線的守衛，避免季後賽/其他章節同名 round 誤觸發）
 * ②只在本季第一場賽前判定一次（`career.schedule[0].id === matchEntry.id`——
 *   賽程重建時 r1 恆是陣列第一筆，growProSchedule 只在尾端長季後賽場次，不影響）
 * ③各自獨立的 career.events 一生一次旗標（同一季理論上可能同時跨兩個門檻，
 *   各自判各自的旗標，互不影響——回傳 0～3 個事件）
 *
 * @param career     careerState 視圖（`.events` 去重、`.schedule` 判斷「本季第一場」）
 * @param matchEntry 賽程項
 * @param archive    store.loadSeasonArchive() 的回傳（不含本季，本季尚未結算封存）
 * @returns 0～3 個事件的陣列（同 corpAnchorPreEvents／proWangRivalPreEvents 的回傳形狀）
 */
export function proMilestonePreEvents(career, matchEntry, archive) {
  if (matchEntry?.round !== 'pro' && matchEntry?.round !== 'foreign') return [];
  const schedule = career?.schedule ?? [];
  if (!schedule.length || schedule[0]?.id !== matchEntry?.id) return [];
  const played = career?.events ?? [];
  const seasons = proSeasonsArchived(archive);
  const year = seasons.length + 1; // 已封存季數 +1＝正要開打的這一年（M1 凍結公式）
  const titles = championsArchived(archive);
  const out = [];
  if (year >= MILESTONE_VETERAN_YEAR && !played.includes(MILESTONE_VETERAN_EV)) {
    out.push({
      id: MILESTONE_VETERAN_EV,
      effect: { teamTrust: MILESTONE_TEAM_TRUST_BONUS },
      lines: VETERAN_LINES,
    });
  }
  if (titles >= MILESTONE_DYNASTY_TITLES && !played.includes(MILESTONE_DYNASTY_EV)) {
    out.push({
      id: MILESTONE_DYNASTY_EV,
      effect: { teamTrust: MILESTONE_TEAM_TRUST_BONUS },
      lines: DYNASTY_LINES,
    });
  }
  if (year >= MILESTONE_FINAL_PUSH_YEAR && !played.includes(MILESTONE_FINAL_PUSH_EV)) {
    out.push({
      id: MILESTONE_FINAL_PUSH_EV,
      effect: { teamTrust: MILESTONE_TEAM_TRUST_BONUS },
      lines: FINAL_PUSH_LINES,
    });
  }
  return out;
}
