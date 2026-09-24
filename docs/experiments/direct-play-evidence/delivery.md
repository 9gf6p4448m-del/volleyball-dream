# 公開 PWA 送達證明 — direct-v3（2026-09-24）

- 程式提交：`da5cf36`（分支 `feat/direct-v3-receive-assist`，已推送 origin；尚未合併 `main`）。
- 指令 `npm run deploy:pages`：正式 build 成功，輸出 `Published`。
- `git log origin/gh-pages -1 --format="%H %cI %s"`：`93791a6d4d9135a80e5efcde4d942ad98d60a968 2026-09-24T12:30:24+08:00 Updates`。
- [GitHub Pages 發布工作 35955977937](https://github.com/9gf6p4448m-del/volleyball-dream/actions/runs/35955977937)：`completed / success`，head SHA 為 `93791a6d4d9135a80e5efcde4d942ad98d60a968`。
- 對公開網址執行，環境變數 `DIRECT_BASE_URL=https://9gf6p4448m-del.github.io/volleyball-dream`：
  - `node tools/direct-play-browser.mjs --delivery` 實際輸出：`PASS delivery: menu navigation, direct practice, export metadata; direct-v3 · 2026-09-24 12:29`。
  - `node tools/direct-play-browser.mjs --assist` 實際輸出：`PASS assist: 3 viewports with visible receive turn, contact, replay`。證據：`assist-browser.json`、`*-receive-assist-*.png`。

使用者入口：[直接操作訓練](https://9gf6p4448m-del.github.io/volleyball-dream/?mode=direct)，或 PWA 主選單「直接操作訓練 · 一人一球」。

若主畫面 PWA 還顯示舊版，完全關閉後重開，並用 Safari 同網址核對訓練設定 build 為 `2026-09-24 12:29`。不要清除網站資料或刪除 PWA，以免影響本機生涯存檔。

本次送達 direct-v3 接球迎球容錯（見 `docs/handoffs/direct-play-receive-assist-v3.md`）。iPhone 14 Pro 真機觸控手感、持續 60 FPS、完整 6v6 與生涯整合尚未驗證或實作。

## 前版紀錄

direct-v2 程式提交 `51f1f74`，於 `2026-09-24T02:56:00+08:00` 發布為 gh-pages `955e9961c835258349f4c57094cbc4486c58928e`；[發布工作 35905889489](https://github.com/9gf6p4448m-del/volleyball-dream/actions/runs/35905889489) 成功，當時公開站輸出 `PASS delivery: …; direct-v2 · 2026-09-24 02:55`，已由本次 direct-v3 取代。

direct-v1 程式提交 `ca8c035`、效能文字提交 `2b53e7e`，於 `2026-09-24T02:24:46+08:00` 發布為 gh-pages `8a0577e17aafbd539aeea86a1a3262879e5a0ca1`；[發布工作 35902288221](https://github.com/9gf6p4448m-del/volleyball-dream/actions/runs/35902288221) 成功。當時公開站測試輸出 `PASS delivery: menu navigation, direct practice, export metadata; direct-v1 · 2026-09-24 02:24`，已由本次 direct-v2 取代。
