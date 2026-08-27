# 驗收凍結：追發配飄浮/跳發（2026-08-27，動手前凍結）

> 出處：使用者 08-27 試玩疑問「追發是不是只能發一般的發球，不能發飄跟跳發」→ 拍板「追發配飄跳發」。
> 形狀＝沿用發球主面板既有慣例（變體是並列按鈕、不是第三層）：追發第二層在三個目標名之外，
> 依 canFloatServe / canJumpServe 各多一排「飄·名」（cyan）／「跳·名」（orange）。零 sim 改動。

## 驗收條件（逐條可機械判定；「什麼樣的實作會讓這條變紅」附在括號）

1. `chasePanelItems` 在 `gates.canFloatServe` 為真時，對每個目標多一顆 `style:'float'` 的「飄·名」；
   `canJumpServe` 同理產 `style:'jump'` 的「跳·名」；兩閘皆假時輸出與現行**逐項相同**
   （紅法：沒接 gates、或未解鎖也長出變體＝gate 沒做在行為層，違 B7-4 同則）。
2. 按下「飄·名」→ `controls.serveNow` 收到 `(aim=該目標基準位, style='float')`，經真 controls
   `collect` 出的發球 intent `style==='float'`；「跳·名」同理 timing>1.1 走跳發路徑；
   按原本名字鈕 style 仍為 null（紅法：`applyChaseChoice` 第三參數仍寫死 null——即現行實作，
   新測試必須在這個壞版上紅在行為斷言）。
3. 「← 返回」行為逐值不變：不發球、收層（紅法：變體改動弄壞 back 分支）。
4. `npm test` 全綠（動手前實跑基準＝2206 綠 @ `6da3d2b`）；不動 `src/sim/**`（`git diff --stat` 為證）。
5. 鑑別力實測：把 `applyChaseChoice` 的 style 傳遞改回 `null` 重跑新測試＝紅，且紅在
   「intent.style 不是 float/jump」的行為斷言，不是旁枝錯誤。
