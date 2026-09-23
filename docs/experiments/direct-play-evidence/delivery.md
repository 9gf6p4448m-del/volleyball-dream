# 送達證明 — 2026-09-24

- 實作提交：`ca8c035`；最後程式提交：`2b53e7e`（將效能文字改為本裝置量測）。兩者已推送 origin/main。
- 指令 `npm run deploy:pages`：正式build成功、輸出 `Published`。
- `git log origin/gh-pages -1 --format='%H %cI %s'`：`8a0577e17aafbd539aeea86a1a3262879e5a0ca1 2026-09-24T02:24:46+08:00 Updates`。
- GitHub Pages 發布工作 [35902288221](https://github.com/9gf6p4448m-del/volleyball-dream/actions/runs/35902288221)：`completed / success`，head_sha與上述gh-pages相同。
- 公開首頁HTTP 200，其入口為 `assets/index-BySfQBh-.js`，與本機dist/index.html相同。不是只檢查部署分支。
- 對公開網址實跑 `node tools/direct-play-browser.mjs --delivery`，`DIRECT_BASE_URL=https://9gf6p4448m-del.github.io/volleyball-dream`。
- 實際輸出：`PASS delivery: menu navigation, direct practice, export metadata; direct-v1 · 2026-09-24 02:24`。
- 公開網站測試涵蓋：主選單入口可點、實際進入direct、匯出回放含裝置資訊、沒有fatal/pageerror，設定面板不被出手按鈕覆蓋。報告 `delivery-browser.json`，截圖 `menu-entry.png` / `delivery-settings.png`；截图已開圖核對。

使用者入口：[直接操作訓練](https://9gf6p4448m-del.github.io/volleyball-dream/?mode=direct)，或PWA主選單「直接操作訓練 · 一人一球」。

PWA若仍是舊版，完全關閉再開，並以Safari同網址核對訓練設定build為 `2026-09-24 02:24`。不要清除網站資料或刪除PWA，避免影響本機生涯存檔。

範圍：送達的是階段1一人一球原型。iPhone14Pro真機60FPS、體感、完整6v6與生涯接入**未驗證／未實作**，不因本次發布成功而視為完成。
