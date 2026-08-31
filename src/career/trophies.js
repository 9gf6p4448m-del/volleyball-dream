// 大作感二卷 批6（2026-08-30）：獎盃彙整——「存檔→獎盃清單」純函式，只讀不寫。
// 資料源＝store.loadSeasonArchive() 的逐季封存（欄位語意見 careerStore：champion＝
// 高中全國冠軍布林、uniRank/corpRank＝聯賽名次、proFinish＝季後賽四態）。
// 里程碑不讀事件旗標、直接從封存重導——公式與 proMilestones.js 的常數同源
// （事件旗標埋在對話機制裡，封存才是可靠的既成事實）。
import {
  MILESTONE_VETERAN_YEAR, MILESTONE_DYNASTY_TITLES, MILESTONE_FINAL_PUSH_YEAR,
} from './proMilestones.js';
import { isForeignTeamId } from './foreignTeams.js';

// seasons＝loadSeasonArchive() 回傳（逐季，含各章）；回傳 [{icon,title,sub}] 依時間序
export function collectTrophies({ seasons = [] } = {}) {
  const list = [];
  let proSeasons = 0;
  let proTitles = 0;
  for (const sn of seasons) {
    if (!sn) continue;
    const n = sn.index ?? '?';
    if (sn.champion) list.push({ icon: '🏆', title: '全國冠軍', sub: `高中・第 ${n} 屆` });
    if (sn.uniRank === 1) list.push({ icon: '🏆', title: '大學聯賽冠軍', sub: `第 ${n} 季` });
    if (sn.corpRank === 1) list.push({ icon: '🏆', title: '企業聯賽冠軍', sub: `第 ${n} 季` });
    if (typeof sn.proFinish === 'string') {
      proSeasons += 1;
      if (sn.proFinish === 'champion') {
        proTitles += 1;
        // 候補池卷 P4-1（銷大作感二卷小債）：章別從封存的 pro 隊 id 推導——
        // 封存本來就存 `pro: proId`（careerStore settleProFinale），不必新增欄位。
        // 舊檔缺 pro 欄位＝回落不分章的舊標題（誠實：不猜）。
        const title = sn.pro == null ? '季後賽總冠軍'
          : isForeignTeamId(sn.pro) ? '海外聯賽總冠軍' : '職業聯賽總冠軍';
        list.push({ icon: '🏆', title, sub: `第 ${n} 季` });
      }
    }
  }
  // 里程碑（職業年資從封存數，與 proMilestones 常數同源）
  if (proSeasons >= MILESTONE_VETERAN_YEAR) {
    list.push({ icon: '🎖️', title: '老兵之年', sub: `職業第 ${MILESTONE_VETERAN_YEAR} 年仍在陣中` });
  }
  if (proTitles >= MILESTONE_DYNASTY_TITLES) {
    list.push({ icon: '👑', title: '王朝', sub: `${MILESTONE_DYNASTY_TITLES} 座總冠軍` });
  }
  if (proSeasons >= MILESTONE_FINAL_PUSH_YEAR) {
    list.push({ icon: '🔥', title: '最後衝刺', sub: `職業第 ${MILESTONE_FINAL_PUSH_YEAR} 年` });
  }
  return list;
}

