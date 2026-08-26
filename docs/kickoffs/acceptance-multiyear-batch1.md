# 多年職業生涯卷 批 1 驗收凍結（2026-08-27）

> 凍結於實作動手前；要改只有 02 §2.1 一條路。基準＝main 181ea94。
> 範圍＝年迴圈地基（資料層，零 UI、零 sim 改動）。

## A1 年限表

- `CHAPTER_SEASONS` 斷言逐章：HIGH_SCHOOL=3、UNIVERSITY=4、CORPORATE=1、**PRO=10**。
- pro 章 `chapterCompleted`：章內第 1 年與第 9 年＝false、第 10 年＝true
  （enteredAtSeason 換算路徑，不用全域屆數硬湊）。
- 什麼實作會紅：pro 仍是 1；或改動其他章的值。

## A2 settleProFinale 逐季化

- **第 1 季**（年限未滿）season 打完（含季後賽）後 `settleProFinale()` 回 truthy 並
  封存：`career.seasons` 追加一筆帶 `proRank`、`pro`、**`salary`**（現約年薪）；
  `proFinaleSettled=true`。★壞版自證：這條在 181ea94 上必須紅，且紅在「回 false／
  未封存」的行為斷言，不是旁枝錯誤★
- 冪等：連呼第二次回 false 且 `career.seasons` 長度不變。
- 未打完（seasonConcluded=false）→ false 不封存。
- 非職業章 → false；壞 pro id → false。
- 什麼實作會紅：保留 chapterCompleted 守衛；封存漏 salary；旗標不設。

## A3 advanceSeason pro 分支

- 守衛順序可驗：本季**未結算**（proFinaleSettled=false）→ false 不推進（結算先於推進）。
- 已結算 → 回 truthy，同一 RMW 內：`season.index`+1、`season.seed`＝deriveSeasonSeed
  衍生、`season.schedule`＝新 seed 的 buildProSchedule（含循環 7 場、無殘留季後賽場）、
  `season.results`=[]、`season.pendingMatch` 清空、**`proFinaleSettled` 清為 false**；
  `career.pro`、`career.contract`、`roster.members`、`lineup.trust`（跟人）逐值保留。
- 第 10 年結算後 advanceSeason → false（chapterCompleted 封頂）。
- `career.proRetired=true` 時 → false。
- 決定論：同一存檔重演推進兩次，兩次結果逐值一致。
- 什麼實作會紅：未結算也能推進；旗標不清（第 2 季永遠不能再結算）；schedule 沿用
  舊 seed；trust 歸零。

## A4 contract 結構

- `enterPro` 成功後 `career.contract` 存在且形狀＝`{ salary:正整數, sinceSeason:入章
  屆數 }`；salary＝隊階底薪表（數值屬提案，測試斷言「為正且隊階遞增」不釘死絕對值）。
- 舊檔相容：無 contract 鍵的存檔走 settleProFinale，封存 `salary:null` 不炸。
- 什麼實作會紅：contract 缺鍵；豪門底薪 ≤ 新軍底薪；舊檔炸 TypeError。

## A5 retirePro 與 proCareerOver

- `store.retirePro()`：守衛＝isPro 且本季**已結算**（proFinaleSettled=true）才准退；
  成功 → `career.proRetired=true`；冪等（第二次 false）；非職業章 false。
- `proCareerOver(career, seasonIndex)`（SSOT 單一定義）＝ proRetired ||
  chapterCompleted；退休後與滿 10 年後皆 true，第 1 季未退＝false。
- 什麼實作會紅：未結算可退（本季白打不封存）；proCareerOver 在 UI/store 各自另寫判式。

## A6 舊章零擾動

- 全套既有測試綠（1991 起跳）；`npm run sim-hash`（或等效）＝`34772c06e02243fd` 不動。
- 高中/大學/企業的 advanceSeason 與 settle 路徑行為逐值不變（既有測試代驗）。

## A7 鑑別力紀錄

- A2 壞版自證與 A3「旗標不清」各留一條在 181ea94 檢出紅的紀錄（worktree 實跑，
  紅的斷言原文貼進回報）。

## 修訂紀錄（2026-08-27，批 1 覆審後；Sawmah 逐條拍板）

- **A2 加嚴（拍板「現在補」）**：封存欄位追加 `proFinish`（'champion'/'final'/'semi'/
  'league' 四態，由該季 schedule+results 的季後賽場次判定）。原凍結漏項——覆審
  HIGH：proRank 是循環名次非季後賽結果，champion/finish 吃高中 schema 對職業恆假，
  推進清空 results 後奪冠事實永久不可還原；只有 settleProFinale 握有該季 results，
  晚補救不回。只加欄位與斷言＝加嚴，不動既有鍵。
- **A5 語意修正（拍板甲）**：proCareerOver ＝ proRetired ||（chapterCompleted **且
  proFinaleSettled**）。原標準錯在哪：chapterCompleted 第 10 季「季初」即真，照原
  定義做批 5 強制謝幕會整季跳過第 10 季（覆審 MEDIUM 實測 P2a）；為什麼現在才知道：
  凍結時只驗了「滿 10 年後」的終態，沒驗「第 10 季進行中」的中間態。修正後第 10 季
  未結算＝false（可正常開打）、結算後＝true。
- **A7 紀錄更正（送審後二訂）**：原文「A2 在 181ea94 上必須紅」實測不成立（舊
  年限=1 使 chapterCompleted 守衛恰好放行、該行為在舊樹是綠的；整檔紅是 import
  旁枝）。**可重現的鑑別力證據＝突變測試**（乾淨副本上做、雙向已驗）：
  M1 把 chapterCompleted 守衛加回 settleProFinale → A2/A3 全數行為紅；
  M2 拿掉推進時的 proFinaleSettled:false 重置 → A3 兩條紅；還原後全綠。
  （附註：曾另以「181ea94＋僅改年限」的中間態驗過 A2/A3 行為紅，但那要靠拔除
  新符號 import 的行為探針才跑得動，探針未存檔；照字面拿現行測試檔對舊樹會死在
  import 旁枝、一條斷言都跑不到。故正式證據以 M1/M2 為準——M1 與該中間態同病灶。）
