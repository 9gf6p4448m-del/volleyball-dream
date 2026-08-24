# 隊伍配色卷 批 1 — 驗收條件（2026-08-24 凍結，02 §2.1）

> 動手前凍結。色距量測＝redmean 加權 RGB 距離（純算術、無依賴、決定論），
> 校準依據：已知「該撞」參照對（白 vs 米白＝80、金 vs 橙金＝86、近同色＝12）
> 全部落在 90 以下 ⇒ 門檻 100/150 對這類混淆有鑑別力。
> 我方錨定色（不動）：球衣 `0x2e7bff`、自由人 `0xffc531`。

## K1 sim-hash 逐值不變
`npm test` 全綠，sim-hash 基準 `2f60f04312b666db` 不變。純渲染的鐵證。

## K2 隊隊可辨（identity）
16 隊（高中 7＋大學 9）球衣主色兩兩 redmean 距離 **≥ 100**，由
`checkKitPalette()` 斷言、進 node 測試永久守門。
★鑑別力對照（測試內建）：對「兩隊同球衣色」的壞色票，`checkKitPalette()`
必須回報違規（此測試在正確實作下綠、在「檢查函式恆空」的壞實作下紅）★

## K3 可讀性硬約束＋自由人對比
- 每隊球衣色與自由人色，對我方球衣 `0x2e7bff` 與我方自由人 `0xffc531`
  距離皆 **≥ 150**（同場可讀性）。
- 每隊隊內：球衣 vs 自由人距離 **≥ 150**（FIVB 對比色）。
同一 `checkKitPalette()` 斷言家族。

## K4 敵我語意與既有畫面不變
- `matchView.js` `TAG_COLORS`、`scoreboard.js` 氣勢計配色、`geoCharacter.js`
  我方 `TEAM_KIT.A`／`LIBERO_KIT.A` 逐值不動（git diff 為證）。
- 快速比賽（無 careerCtx）與練習賽（紅白對抗）：雙方球衣維持現行預設
  藍/紅（單測：`resolveMatchConfig` 該兩情境 `kits` 為空）。
- 宿敵客場橫幅維持 `#7db2ff` 視覺錨（改由 kit 資料供給，值不變）。

## K5 回退安全
無 `kit` 欄位的隊伍 def：`kitFor(def)` 回 null、`createGeoCharacter` 回落
現行側別預設色，比賽組裝不炸（單測覆蓋）。

## K6 瀏覽器層驗證（08-24 main.js 零覆蓋教訓，node 綠不足以放行）
本機 vite 實跑，三張實際截圖：
1. `?devkit` 預覽頁：16 隊卡片＋3D 球衣舞台正常顯示。
2. 生涯大學場（`?devseed` 治具路徑）實開一場：對手穿該校隊色、對手自由人穿異色。
3. 快速比賽（`?quick=1`）：雙方維持現行藍/紅（K4 的實機對照）。
高中場的接線正確性由 node 單測背書（高中 def 經 `careerMatchSetup` 產出
`kits.B`＝該隊 kit，與大學走同一條 `matchOpponentDef` 收斂入口）。

## 色票（題 3 提案版——使用者看圖後可改值，改值不動上述門檻）
16 隊 jersey/libero 主色已通過全部門檻（最小 identity 對＝102）；
定案值以實作後的資料檔為準，本檔不重抄。
