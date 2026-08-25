# 大學謝幕卷・批 1 驗收凍結（資料/狀態機）（2026-08-25）

> 凍結物。改動任一條均須照 02 §2.1 走使用者同意程序。
> 「紅」欄＝什麼樣的實作會讓這條變紅（訂立時自答）。

- **B1-1 U4 封存**：U4 季末（`seasonConcluded`＝true）呼叫新結算入口後，`career.seasons`
  長度＝4，且第 4 筆含 `uniRank`（與 `uniTable` 對同一 schedule/results 現算值一致）與
  `school`。紅＝不封存、封存到錯的名次、或漏 uniRank/school 鍵。
- **B1-2 冪等**：結算入口連呼兩次，`career.seasons` 仍 4 筆、內容不變。紅＝重複封存成 5 筆。
- **B1-3 未打完不結算**：`seasonConcluded`＝false 時入口拒絕（回 false/no-op），無任何存檔寫入。
  紅＝半場數據被封存。
- **B1-4 旗標與既有行為不變**：結算後 save 上有謝幕完成旗標（名稱由實作定，測試以行為斷言
  「旗標結算前不存在、結算後為 true」）；`advanceSeason` 在 U4 末仍 return false（不因本批
  開始推進）。紅＝旗標缺失，或 advanceSeason 行為改變。
- **B1-5 封存形狀一致**：第 4 筆的鍵集＝前 3 筆大學封存的鍵集（`archiveSeasonSummary` 全鍵
  ＋`uniRank`＋`school`），既有消費端（careerScreen 名次顯示/🏆 計數）無需改動即納入。
  紅＝形狀不一致導致消費端要特判。
- **全域**：全套 `node --test` 綠（基準 1710，只增不減）；sim-hash 34772c06e02243fd 不動；
  改前 worktree 紅驗證＝新測試在凍結落點 SHA 上因行為斷言而紅。
