# 職業屆間體能格 驗收（動手前凍結，2026-08-27）

拍板（Sawmah）：職業屆間三選一加第五格「體能——耐力或控球 +2」，理由「才有變強的感覺」。
沿集訓同一來源（trainingCamp 的 campAttrOptions／applyCampAttrTraining），控球格的
「紅白賽全科目完成才開放」閘照舊生效（unlockControl 吃 save.practice）。每年可重複選
（到頂為止），與聲望/傳承/情報同層互斥（每年仍只選一條路）。
基準：HEAD=4d4036e、`npm test` 2148 全綠。範圍＝careerStore.js（chooseProGrowth）＋
careerScreen.js（屆間卡）＋新測試。

- FIT-1 `npm test` 全綠（既有 2148 條零紅）。
- FIT-2 chooseProGrowth('fitness', attrKey)：attrKey 限集訓屬性池；幅度/上限/控球
  解鎖判定**全部經 campAttrOptions／applyCampAttrTraining 單一來源**（careerStore
  不得另抄 2/80/75 任何一個數字）；耐力到頂 80 拒絕；控球未解鎖拒絕、解鎖後上限 75；
  成功後 proGrowthPending 清除（同其他選項）；壞 attrKey／null 拒絕；無一次性旗標
  （下一屆間可再選）。守衛綁 prev 讀值（既有慣例）。
- FIT-3 UI：屆間卡新增「🏋 體能特訓」格→子選單列 campAttrOptions（ready＝按鈕顯示
  現值→加後值；not ready＝灰字附 reason 原文——「已達上限 80」「尚未開放——紅白賽
  科目全完成才開」）；全部 not ready→主卡灰字標示不出按鈕（裁定甲同款樣式）；
  國內與海外屆間卡都出現。
- FIT-4 既有四選項（聲望/傳承/情報/跳過）行為零漂移：既有 multiyear-pro-batch4b
  與 foreign 系列測試零紅＋至少一條錨定斷言（選聲望仍 +6 封頂 100）。
- FIT-5 突變實測 ≥2（①cap 守衛拿掉→到頂仍可加必紅 ②unlockControl 閘拿掉→未解鎖
  可練控球必紅），各恰紅一條，紀錄寫測試檔頭（真的做過才寫）。

數值（+2/80/75）＝集訓既有拍板值，本批零新數字。

---
【追記 2026-08-27（主對話裁定，02 §2.1 例外同 foreign-batch2 前例）】
FIT-5 ①「恰紅一條」實測紅 2/10——耐力與控球共用 trainingCamp 同一段 cap 護欄
（單一來源的結構事實），紅得更多不會放過壞實作。裁定：①以「≥1 紅可歸因」為準。
