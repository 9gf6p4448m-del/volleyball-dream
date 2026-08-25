# 驗收凍結——大二卷批 1：大學版屆間推進＋年限放行（2026-08-25）

拍板依據＝`uni-year2-kickoff.md` 題 1/3/4。設計：`CHAPTER_SEASONS.university` 1→4；
大學換血另寫專用模組（不動 `graduation.js`——高中版綁 grade 3／手寫新生表／隊長交接，
卷宗慣例「另寫大學專用模組，高中一行不動」）；推進分流在 `careerStore.advanceSeason`
（大學賽程重建需要 schoolId，store 層才有——`enterUniversity` 先例）；
`careerState.advanceSeason` 的大學顯式守衛**保留**（高中純函式不管大學）。

## 驗收條件（凍結，改動依 02 §2.1）

- **B1-1 推進成功**：大學章 league 8/8 的存檔呼叫 `store.advanceSeason()` 回 truthy；
  `season.index` +1、`chapterSeasonOf` 進到下一年；新賽程＝8 場 league（決定論：
  同存檔重跑逐值同，且 seed 與上一年不同）；`results`/`events` 清空。
  ★改前紅★：改前程式碼上此路徑回 false（顯式守衛 no-op）——實跑紀錄。
- **B1-2 未收束不推進**：7/8 呼叫回 false、存檔逐值不動。
  ★C4 改寫聲明（02 §2.1 程序）★：債 C 的 C4 測試（「大學打完也 no-op」）由本批作廢
  改寫為雙態（未打完 no-op／打完推進）——改寫依據＝C4 凍結文自述「防**大二卷接線前**
  誤放行」，本批即該接線點；「未打完不得放行」半邊原樣繼承。
- **B1-3 換血決定論**：推進後 grade 4 成員離隊入 `alumni`（帶 seasonIndex）、其餘
  grade+1；每個離隊者有一名 grade 1 同 role 決定論新生補位（同 seed 重跑逐值同、
  名字不與在隊/校友重複）；lineup 重排含玩家、被擠掉者不消失。
- **B1-4 信任帶走**（題 3 翻盤本體）：推進前後 `player.trust.fromSetter` 與
  `floorShare` 逐值不變（斷言兩欄位）。
- **B1-5 年限**：大四（`chapterSeasonOf`=4）季末 `chapterCompleted`=true ⇒
  `store.advanceSeason()` 回 false（收尾儀式＝批 4，本批只要不放行）。
- **B1-6 高中零回歸**：全套測試綠（基準 1690，C4 改寫外不得少）；
  `sim-hash-probe` 同基準 34772c06e02243fd；高中推進路徑既有測試全綠。
