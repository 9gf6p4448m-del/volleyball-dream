# 多年職業生涯卷 批 2 驗收凍結（2026-08-27）

> 凍結於實作動手前；要改只有 02 §2.1 一條路。基準＝main cfef5c2。
> 範圍＝續約迴圈 UI 接線＋一次性回填（零 sim 改動；轉隊選項＝批 3、真謝幕卡＝批 5）。
> ★續約薪水公式的係數與所有文案屬提案（試玩可改）；凍結的是性質與接線行為★

## B1 一次性回填（backfillProMultiyear，store 層）

- 舊形狀存檔（isPro、無 `career.contract`）呼叫後：contract 存在＝`{salary: 隊階底薪,
  sinceSeason: 章節 enteredAtSeason}`。
- 已結算舊檔（proFinaleSettled=true、最後一筆 pro 封存無 `proFinish`、season.results
  仍含季後賽場）呼叫後：該筆封存補上 proFinish 且值與 results 實況一致（冠軍檔＝
  'champion'）；**封存其他鍵逐值不動**。
- 冪等：第二次呼叫存檔位元組不變。新存檔（已有 contract 與 proFinish）＝no-op。
- 非職業章＝no-op。
- **接線順序**：renderCareer 職業分支在任何「推進」入口可按之前已執行回填
  （送審 MEDIUM：回填必須先於推進鈕，否則第一次推進清 results＝冠軍事實永久遺失）。
- 什麼實作會紅：回填漏 proFinish 只補 contract；推進鈕先於回填可按。

## B2 續約＋推進

- `advanceSeason({proSalary: 正整數})`：pro 分支同一次 RMW 內更新 `contract.salary`
  ＝proSalary，其餘行為與批 1 A3 逐值相同；不帶 opts 或帶壞值（0/負/非整數）＝
  contract 逐值保留（A3 既有測試代驗不帶 opts 面）。
- 什麼實作會紅：續約寫 salary 與推進拆成兩次寫（crash 窗口）；壞值也寫入。

## B3 續約薪水公式（proRenewalSalaryFor，純函式）

- 輸入（team, proRank, proFinish）→ 正整數。
- 性質斷言（不釘死絕對值）：①同隊同 finish 下名次單調——rank 1 的薪 ≥ rank 8
  ②同隊同名次下 'champion' > 'league' ③恆 ≥ 1 ④壞值（rank 0/null、未知 finish）
  不炸、照保守給。
- 什麼實作會紅：名次反向；冠軍沒加成；壞值 NaN。

## B4 收尾卡＝續約談判卡（UI wiring）

- 職業季末收尾卡（結算成功後）：
  - 標題「職業第 N 年・完」（N＝chapterSeasonOf，不再恆「元年」）。
  - **非末季且未退休**：顯示「✍ 續約留隊」鈕（帶新年薪數字）與「👋 高掛球鞋」鈕；
    續約鈕按下＝advanceSeason({proSalary: 公式值}) 後回生涯畫面（新季可出戰）；
    退休鈕按下＝先確認卡，確認後 retirePro()。
  - **末季（章內第 10 年）**：不顯示續約鈕（死按鈕防線——2464/2666 同型事故），
    顯示謝幕佔位（真謝幕卡＝批 5）。
  - wiring 測試斷言「字出現在對的容器」（dialogPlay/overlay 契約教訓）。
- 退休後（proRetired）renderCareer 職業分支：不再出現「▶ 出戰」與收尾卡迴圈，
  顯示生涯已收束佔位＋「📊 回看生涯數據」。
- 什麼實作會紅：末季仍給續約鈕；退休後還能出戰；標題仍寫死元年。

## B5 生涯數據頁

- 職業封存列顯示名次標籤（proRank）；proFinish==='champion' 的列亮 🏆 並計入
  合計 titles 顯示；企業封存列同步補 corpRank 名次標籤（同一格顯示邏輯，順修
  覆審 LOW）。高中/大學列逐字不變（既有測試代驗）。
- 什麼實作會紅：職業冠軍季 🏆 不亮；高中列文案變動。

## B6 舊語意文案清理

- careerScreen 職業段不再出現「職業元年」字樣（2584/2586/3436 與 3407-3412 註解）；
  「續約談判・敬請期待」移除（被真選單取代）。grep 'careerScreen.js' 無
  「職業元年」＝機械判定。

## B7 全套與 sim

- 全套既有測試綠（2008 起跳）；sim-hash `34772c06e02243fd` 不動。

## B8 鑑別力

- B1 至少一條在「無回填實作」上紅的行為斷言（新測本身構成——實作前紅、實作後綠，
  紀錄實跑輸出）；B4 末季分支用治具把屆數推到章內第 10 年驗「無續約鈕」。
