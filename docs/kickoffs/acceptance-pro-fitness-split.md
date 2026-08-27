# 職業屆間體能格「不互斥」改制 驗收（動手前凍結，2026-08-27）

拍板（Sawmah「想要不互斥」）：體能特訓脫離三選一互斥——屆間＝「路線選一
（聲望/傳承/情報/跳過）」＋「體能（耐力/控球 +2 或先不練）」兩段各自獨立、
各自一次。基準：HEAD=c2a81a4、`npm test` 2158 全綠。
範圍＝careerStore.js（雙 pending）＋careerScreen.js（屆間卡兩段）＋既有測試按
新行為更新（清單見 FS-4）。

- FS-1 `npm test` 全綠（更新後零紅）。
- FS-2 雙 pending 狀態機：advanceSeason pro 分支與 transferPro 在**同一次 RMW**
  同時設 proGrowthPending 與 proFitnessPending（＝endingSeason+1）；路線選項只清
  proGrowthPending、體能（選或跳過）只清 proFitnessPending；體能同一屆間只能執行
  一次（旗標已清即拒絕）；fitness 的守衛從 proGrowthPending 改吃 proFitnessPending；
  舊存檔缺 proFitnessPending＝該屆無體能段（不猜、下屆自然出現）。守衛綁 prev。
- FS-3 UI：同一張屆間卡兩段——路線段（原四格，選完該段消失）＋體能段（耐力/控球
  子選單＋「先不練」跳過，完成該段消失）；兩段都完成才關卡放行出戰；中斷重開
  （crash 復原）各自未完成的段還在。
- FS-4 既有測試更新清單（行為變更由使用者拍板；**僅限下列，未列者零改動**）：
  ①tests/multiyear-pro-batch4b.test.mjs F5 鏈——「跳過後可出戰」改為「路線跳過＋
  體能跳過後可出戰」等新預期；②tests/foreign-batch3.test.mjs 的 makeScreen 跳過
  迴圈——補跳體能段；裁定甲測試若受兩段版面影響按新版面改斷言目標不改判準；
  ③tests/pro-fitness-growth.test.mjs——pending 語意換成 proFitnessPending、
  加「路線與體能同屆各自都能拿到」新鏈測。每一處更動附一行「新預期行為」註解。
- FS-5 突變實測 ≥2 各恰紅（結構連帶紅按 §2.1 前例記數）：①fitness 成功後不清
  proFitnessPending → 同屆重複 +2 必紅；②路線選項誤連清 proFitnessPending →
  「同屆路線後仍可練體能」鏈測必紅。紀錄寫測試檔頭。
- FS-6 高中/大學集訓零改動；海外屆間同樣兩段（鏈測一條）。

數值零新增；體能效果與解鎖閘沿 FIT 批單一來源不動。

---
【追記 2026-08-27（主對話裁定）】FS-4 清單外一處必要漣漪：tests/multiyear-pro-batch2.md
（誤，正確為 .test.mjs）「同批連點賽季落幕」的治具在 chooseProGrowth('rest') 後補一行
('fitness-skip')——advanceSeason 現在同 RMW 設兩顆 pending，不補則該測卡在體能段、
因結構原因紅（與其守的重入判準無關）。判準本身零改動、實作誠實揭露，按 §2.1 認定
非移動及格線。FS-5 突變①②連帶紅條數（3/12、2/12）按 foreign-batch2 前例記數。
