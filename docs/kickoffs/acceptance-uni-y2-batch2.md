# 驗收凍結——大二卷批 2：治具跳年（2026-08-25）

設計：新 URL 參數 `devuni=<校id>:<年1-4>`，須與既有 `devseed`/`devslot` 同時合法
才生效。★治具走正式路徑★：`store.enterUniversity(schoolId)` → 迴圈〔合成當季
league 戰績（勝敗交錯決定論）→ `store.advanceSeason()`〕到目標年——世界推進不另造
一條（換血/封存/信任帶走全吃批 1 的真實鏈）；治具合成的只有「當季戰績」。
注意：devuni 直接進指定校＝**繞過升學候選集合檢查**（治具語意，如實註記）。

## 驗收條件（凍結，改動依 02 §2.1）

- **B2-1 跳年**：`?devseed=quarter&devslot=3&devuni=north-ridge:3` 載入後——
  章節＝大學、school＝north-ridge、`chapterSeasonOf`＝3、當季 league 8 場零戰績
  （該年開局）、`career.seasons` 含大一大二摘要（真實推進的副產物）。
  ★改前紅★：devuni 參數在改前不存在＝被忽略、停在升學畫面——資料層測試在改前
  程式碼跑必紅於行為斷言。
- **B2-2 走正式路徑（機械判定）**：devSeed.js 不得 import
  buildUniSchedule/uniSeasonTurnover/buildUniMembers（grep 證明）——推進只透過
  store 公開方法。
- **B2-3 守衛**：devuni 缺席＝行為與批 1 逐值相同；devuni 亂帶（無冒號/校不存在/
  年超界 0、5、非整數）＝`devUniRequest` 回 null、忽略之、其餘照舊；
  devseed/devslot 缺任一時 devuni 單獨出現＝零寫入（既有守衛已保證，測試釘住）。
- **B2-4 決定論**：同參數兩次執行，最終存檔逐值相同。
- **B2-5 全套綠（基準 1696 不得少）＋sim-hash 同基準 34772c06e02243fd**。
- **範圍註記**：main.js 接線（3 行）零 node 覆蓋（純瀏覽器進入點，08-24 事故已知
  盲區）——批 2 收尾以瀏覽器實開 `?devuni=` 驗證並附截圖或 console 證據。
