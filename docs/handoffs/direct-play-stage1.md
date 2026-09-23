# 直接操作：階段 1 交接（2026-09-24）

## 接手先讀

權威規劃為 `docs/DIRECT_PLAY_BLUEPRINT.md`。舊 `FREEBALL_CLAUDE_CODE_SPEC.md` 是歷史提案，其 Master Prompt 已停用。基準 `e9f5164`，回退分支 `checkpoint/direct-play-baseline-e9f5164`；整合分支 main。最新整合提交請以 `git log -1 -- src/app/directPractice.js` 查詢。

## 本輪實作範圍

- `?mode=direct` 獨立一人一球訓練場；主選單有「直接操作訓練 · 一人一球」。不切換生涯、不改legacy sim/VCR/存檔，不開新連線。
- 固定60Hz純模擬；全身膠囊/球體；連續移動接觸；同一姿勢資料供畫面；真助跑起跳、受限轉身與魚躍位移。沒有接球瞬移/救球保底。
- 手機雙pointer走位/瞄準；起跳、觸球分離；觸球按住短滑可轉向；鍵位可重綁；cancel/blur重置；原生表單與按鈕鍵盤操作不被攔截。
- 固定接球/高球/攔網餵球、身高設定、輔助切換、暫停單步、回放與匯出。匯出含裝置/畫質/standalone/build及最近3600幀效能，不能冒充整場10分鐘。
- `window.__directPractice` 提供 snapshot/pose/metrics/tape/pause/resume/step/verifyReplay/verifyPlaybackAtRate/restart/dispose，僅供訓練驗證。

## 實際驗證與限制

`node --test tests/direct-physics.test.js tests/direct-input.test.js`：31 pass / 0 fail。
`npm test`：2542 pass / 0 fail / 0 skipped（新增31，既有2511保持）。
`npm run build`：成功產生PWA；既有ui/three大型chunk警告與lockstep混合import警告仍存在。

`tools/direct-play-browser.mjs` 透過已安裝的Playwright runtime驗證1280×720、844×390、390×844：真按鍵/原生雙觸控、取消、重新開始、固定餵球接球及起跳扣球、回放、實際app累積器在30/60/120Hz下相同結果、UI界內、dispose。證據在 `docs/experiments/direct-play-evidence/`，以 `browser-report.json` 的時間與成功場景數為準。手機尺寸截圖已實際開圖檢查；仍不等於真機Safari。

覆審曾發現並修正：重新開始未重設input tick timeline；表單鍵盤被快捷鍵攔截；80次保守求交耗盡漏掉0.1mm擦碰；球先落地再碰腿仍記觸球。後兩者皆先加行為測試驗紅，再修綠，第三輪定向覆核為真修、0 CRITICAL/HIGH/MEDIUM。

重要限制：

- **整份藍圖尚未完成**。階段1程式已實作；iPhone體感及真機效能尚未驗收，因此階段2–5尚未開工。
- 真機指定 iPhone 14 Pro / Safari / 主畫面PWA；尚缺iOS版本及真機輸出。桌面headless初始量測約10–20FPS，不能宣稱手機60FPS已達成；回放測試注入的30/60/120Hz數字是決定論驗證，不是實際效能。
- 此為接觸技術原型：程序膠囊造型尚非正式球員動作；墊球碰手掌球面可能偏向側方，平台角度與手感需真機試玩。不可為了容易接球增加隱形觸球半徑或保底。
- 曲線碰撞每tick16微步近似；極近距離平行擦過會增加fallback成本。現無六對六負載證據，擴隊前必須profiling。
- 球碰網/出訓練場邊界即停止，沒有正式rally中的網反彈、救界外球、旋转/空氣阻力或排球規則計數。五動作雛形不是五位置玩法完成。
- 生涯身高/疲勞/信任尚未接入；訓練身高只影響本場膠囊與摸高。完整人體手掌面、平台控制與動作調校要以共享姿勢繼續迭代。

## 可重現操作

固定原地起始位置、朝向-z、身高175cm，tick0餵球：接球在tick29按出手，tick40手掌主動接觸，出球向前上；高球模式tick6起跳、tick8扣球，tick25主動接觸，出球向前下。這些經真feed與輸入路徑驗證，不是人工把球塞在手上。

## 下一步（Claude Code）

1. 先核對main與部署版本，讀browser report並重現一球。不要照舊spec先修已修過的tip。
2. 取得指定iPhone的PWA試玩：走位/瞄準/起跳/出手是否兩拇指可完成、球與身體是否可讀、能否說明失誤並重現好球；用匯出紀錄補iOS/Safari/畫質證據。
3. 對照實際回放調校碰撞形狀與可見動作，不做磁吸。階段1體感未過，不接6v6。
4. 通過後依藍圖階段2接主攻自然攻防，再正式6v6，最後五位置與生涯。任何會改physics結果的新版須更新simulationVersion與回放路由，不能悄悄重解舊卷。

Unity暫不轉。先依同一手機與場景確認不可排除的效能/平台障礙，再用小原型對照，不先承擔完整生涯移植。

## 部署

試玩網址： https://9gf6p4448m-del.github.io/volleyball-dream/?mode=direct
由主選單亦可進入。若PWA未看到入口，先完全關閉重開，並用Safari開同網址核對訓練設定內build時間。**不要清除網站資料或刪除PWA來更新，避免遺失本機生涯存檔。**
實際部署提交/時間另記 `docs/experiments/direct-play-evidence/delivery.md`；缺此檔時不得認定已送達。
