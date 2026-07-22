# Phase 2 技術債審查（2026-07-22）

審查範圍：`src/main.js`、`src/career/`、`src/render/`、`src/ui/careerScreen.js`、`src/input/matchControls.js`、`src/sim/`、`tests/`。
基線驗證：`npm test`（159/159 綠）、`npm run build`（成功，見下方 bundle 警告）。**未修改任何 `src/` 檔案**——本檔僅為審查結論。

## 結論先行

Phase 2 一天疊了六個 stage，核心模擬層（`src/sim/`）決定論紀律守得很嚴（purity test 通過、159 測試全綠），問題集中在**組裝層**：`main.js` 的 `runMatch()` 已經長成一個吃下所有系統的巨函式；生涯存檔的雙 key 寫入完全沒查回傳值，配額爆掉會靜默壞資料；情蒐錄影帶在每場開賽當下同步跑掉半局模擬（Node 實測單次 732ms），正好撞上手機已知的 37fps 天花板。以下 12 條依嚴重度排序，CRITICAL/HIGH 建議收尾前處理，MEDIUM/LOW 可排進 stage 7 但不阻塞。

---

## CRITICAL

### C1. 情蒐錄影帶同步阻塞主執行緒（開賽當下，手機最敏感的時刻）
- **檔案**：`src/career/scoutTape.js:13-42`（`buildScoutTape`），呼叫端 `src/main.js:131-133`
- **問題**：`buildScoutTape` 用完整 25 分制（`createGame` 未傳 `setTarget`）跑一場無頭模擬，`MAX_SIM_TICKS = 30000`（500 模擬秒）當上限，才收 ≤3 段精華。這段迴圈是同步的，且**恰好卡在生涯每場開賽的那一刻**——與 `await createMatchView`（模型/幾何組裝）幾乎同時發生，是整個流程裡最吃 CPU 的窗口。
- **證據**：`npm test` 裡「情蒐錄影帶：決定論預生成 ≤3 卷」單一測試耗時 **732.1ms**（見測試輸出），這還是桌機 Node 執行；手機已知只有 37fps（≈27ms/frame 預算），這段同步工作會造成肉眼可見的長時間凍結／掉幀。
- **修法**：① 降低 `setTarget`（例如 8-10 分）縮短模擬長度——情蒐只需要幾段精華，不需要模擬到接近整局；② 或把迴圈拆成每 N tick 用 `requestIdleCallback`/分幀執行；③ 長期可搬進 Web Worker。優先做①，成本最低。

### C2. 生涯雙 key 存檔寫入不查回傳值，配額失敗＝靜默壞資料/免費點數
- **檔案**：
  - `src/main.js:700`（`careerCtx.store.savePlayer(careerCtx.player)`，未查回傳）
  - `src/main.js:706`（`careerCtx.store.saveCareer(recordResult(...))`，未查回傳）
  - `src/ui/careerScreen.js:117-118`（`fireEvents`：`store.saveCareer(c); store.savePlayer(player);`，均未查）
  - `src/ui/careerScreen.js:336-337`（`spend`：先寫 `savePlayer(mutate())`〈屬性已加點〉，再寫 `saveCareer({...growthPoints: gp-cost})`〈扣點〉，兩次寫入互相獨立、都未查回傳）
- **對照**：唯一正確處理的是 `src/ui/careerScreen.js:180`（新生涯開局）：`if (!store.saveCareer(career) || !store.savePlayer(player)) { setMsg(...) }`——同一份存檔層，四處不查、一處查，行為不一致。
- **風險**：`careerStore.js` 的 `write()` 在 localStorage 配額滿/私密模式下回傳 `false` 而不 throw（`careerStore.js:20-27`）。以 `spend` 為例：若 `savePlayer` 成功（屬性 +1 已落袋）但緊接的 `saveCareer` 失敗（扣點沒存進去），玩家等於白拿一點；反過來若賽末的 `savePlayer`（假動作熟練度）成功但 `saveCareer`（本場戰績/成長點數/情蒐記憶）失敗，整場比賽結果直接消失且無任何提示，下次開生涯畫面該場還是「未打」。
- **修法**：所有呼叫點比照 `careerScreen.js:180` 的模式查回傳值並 `setMsg`/提示使用者；或在 `careerStore.js` 提供一個 `saveBoth(career, player)` 封裝，內部固定順序＋查驗＋失敗時回滾語意，取代目前四處手動兩次呼叫的模式。

---

## HIGH

### H1. 匯入存檔沒驗證 opponentId 有效性，壞資料延遲到開戰才讓 app 整個炸掉
- **檔案**：`src/career/careerState.js:252-284`（`deserializeCareer`）、`src/ui/careerScreen.js:40-50`（匯入的 try/catch）、`src/main.js:112-114`（`careerMatchSetup` 呼叫點，無 try/catch）
- **問題**：`deserializeCareer` 只驗證欄位「存在」與型別（`schedule`/`results` 是陣列、每個 `m.id`/`m.opponentId` 為 truthy），**不驗證 `opponentId` 是否為已知對手**。手改或跨版本汙染的存檔可以帶著任意字串當 `opponentId`，順利通過 `importSave`（`careerScreen.js:44-49` 的 try/catch 因此完全接不到問題）。玩家點「出戰」時，`careerMatchSetup`（`careerState.js:225-226`）才 `throw`（`未知對手 ${matchEntry.opponentId}`），而這個呼叫發生在 `main.js:112` 的 `async function runMatch` 內、完全沒有 try/catch，等於未攔截的 rejected promise——畫面直接卡死/空白，玩家拿不到任何錯誤訊息。
- **測試缺口對應任務指定的「匯入存檔壞資料變體」**：`tests/career.test.mjs` 的匯入測試只涵蓋合法 roundtrip 與 v1 升級（`career.test.mjs:258`），沒有「schedule 完整但 opponentId 是垃圾值」這種結構合法、語意錯誤的變體。
- **修法**：`deserializeCareer` 內對每筆 `schedule[i].opponentId` 呼叫 `opponentById` 驗證存在；或在 `careerMatchSetup` 的呼叫端（`main.js` 的 `onPlay`）包 try/catch，失敗時導回生涯畫面並顯示訊息，而不是讓整頁掛掉。

### H2. `runMatch()` 是吃下全部系統的巨函式，30+ 個閉包可變狀態
- **檔案**：`src/main.js:91-750`（約 660 行）
- **證據**：函式體內直接 `let` 宣告的頂層可變狀態變數約 **35 個**（seed/game/aiState、VCR 錄影 `vcrCurrent`/`vcrLast`/`replay`、決策面板旗標 `attackDecidingSince`/`slowEaseFrom`、鏡頭/打擊感 `hitStopUntil`/`slowUntil`/`shake`/`fovPunchUntil`、控制輪替 `controlledId`/`switchKey`、UI 開關 `showHints`/`freeMove` 等），全部活在同一個函式作用域裡，彼此透過閉包直接互相讀寫。
- **影響**：這個函式同時管「開局建隊→VCR 錄影/回放→情蒐播放→每幀決策面板（進攻/攔網/發球）→打擊感/鏡頭特效→計分板/播報→局終落檔」六種職責，任何一處修改都有機會踩到不相干的旗標；main.js 本身無法被單元測試涵蓋（DOM/three.js 綁死），只能靠手動試玩驗證，回歸成本高。
- **修法**：抽出至少三塊獨立模組（各自持有自己的狀態、暴露窄介面）：① VCR/情蒐回放管理（`vcrCurrent`/`vcrLast`/`replay`/`tapeClips` 相關的 ~80 行）② 決策面板流程（攻擊/防守/發球三段 if-else，~100 行）③ 打擊感與鏡頭特效（`hitStop`/`slow`/`shake`/`fovPunch`，~30 行）。stage 7 收尾前拆一次，之後的平衡調參才不會每次都要通讀 660 行。

### H3. 死碼／未接線功能：`sim/ai.js` 的「喊球」機制完全沒有任何輸入路徑呼叫
- **檔案**：`src/sim/ai.js:44-53`（`aiState.calledFlight`）、`ai.js:56-150`（`aiCollectIntents(game, aiState, excludeIds, callerId)` 第 4 參數、`applyPlayerCall`）
- **問題**：這是一套完整實作且有專屬測試的功能（`tests/judgment.test.mjs:54`「玩家喊球：搶下本 flight 鎖定…」、`:68`「喊球只對自己半場的來球有效」），但全專案**只有測試會傳第 4 個參數**。實際呼叫點：
  - `src/main.js:578`：`aiCollectIntents(game, aiState, [controlledId])`——只給 3 個參數
  - `src/career/scoutTape.js:27`：`aiCollectIntents(g, ai)`——只給 2 個
  - `src/input/matchControls.js` 全檔沒有任何 `call`/`Call` 相關程式碼
  `callerId` 永遠是 `null`，`applyPlayerCall` 第一行 `if (!callerId ...) return;` 必定提前返回。這段程式碼在讀 `ai.js` 時看起來像是活的機制（有狀態、有測試、有詳盡註解），容易誤導後續維護者以為它已經是遊戲的一部分。
- **修法**：若「喊球」是刻意保留給未來（例如全隊輪控模式下搶球）的地基，請在 `ai.js` 頂部加一行「尚未接 UI，見 main.js TODO」的註解降低誤導；若確認不再需要，建議連同 `judgment.test.mjs` 的兩個喊球測試一併移除，避免技術債繼續累積測試維護成本。

### H4. 幾何球員零合併/零 Instancing，draw call 數與 arena.js 的效能紀律不一致
- **檔案**：`src/render/geoCharacter.js:63-121`（`createGeoCharacter`）
- **問題**：`arena.js` 對觀眾席明確寫了「單一 InstancedMesh（1 draw call）」的效能約定（`arena.js:3`），但球員做法完全相反：每個 `geoCharacter` 由 hips/torso/head/hair + 雙臂（upperArm/forearm/hand ×2）+ 雙腿（thigh/shin/shoe ×2）共 **16 個獨立 `THREE.Mesh`** 組成（材質/幾何有快取共用，但仍是各自獨立的 draw call）。場上常態 12 人＋自由人換人後最多同時 14 人在場，粗估單這部分就有 **≥220 draw calls**，疊加看台（16 個靜態 mesh）、廣告板（6 個）、14 個頭上標籤 sprite、球網/球場/球，在已知手機僅 37fps 的前提下這是值得抓的一塊。
- **修法**：軀幹相關的非關節部件（hips/torso/head/hair，4 個 mesh）沒有獨立關節旋轉需求，可先合併成單一 `BufferGeometry`（用 `mergeGeometries` 或手動頂點合併），每人省 3 個 draw call、14 人省約 42 個；四肢因為要走關節旋轉較難合併，可評估 skinned mesh 或先跑一次真機 profiling（Chrome DevTools / `mcp__chrome-devtools__performance_start_trace`）確認 draw call 真的是瓶頸再決定要不要動關節部分。

---

## MEDIUM

### M1. 事件監聽器完全沒有 dispose／teardown，目前不炸只是因為兩條現行路徑剛好都繞掉了它
- **檔案**：`src/main.js`（`runMatch()` 內 `window.addEventListener` 於 259/276/346/361 行，`document.addEventListener('visibilitychange', ...)` 於 414 行）、`src/input/matchControls.js:41-64,121-156`（keydown/keyup/blur/pointerdown/pointermove/pointerup/pointercancel 共 7 個）、`src/ui/sfx.js:18`（`window.addEventListener('pointerdown', ensure)`）
- **現況確認**：目前**沒有活著的 bug**——因為 (a) 快速比賽重開（`main.js:276-304`）是在同一個 `runMatch` 閉包裡就地重設狀態，不會再呼叫一次 `runMatch`；(b) 生涯賽末返回是 `window.location.assign(...)`（`main.js:285`）整頁重載，瀏覽器會回收所有監聽器與 rAF。全專案唯一會呼叫 `removeEventListener` 的檔案是 `src/ui/zonePanel.js:66-67`——其餘所有 `createXxx()` 工廠函式都沒有回傳 dispose 方法。
- **風險**：這是一個**沒有寫進任何程式碼的隱性不變式**（「career 返回一定整頁重載」），純靠目前的導航方式維持安全。Stage 7 收尾常見的下一步就是「拿掉生涯返回的整頁重載改成 SPA 式切換，體感比較順」——一旦有人做這個看起來無害的體驗優化，`runMatch` 會被第二次呼叫，疊出第二個 rAF 迴圈＋第二組鍵盤/指標監聽器，模擬速度加倍、輸入重複觸發，而且很難從畫面直接看出成因。
- **修法**：現在就讓 `runMatch`／`createMatchControls`／`createSfx` 回傳一個 `dispose()`，把各自的 `addEventListener` 用具名函式存起來以便 `removeEventListener`；不用馬上接線使用，但先把「防呆」寫進程式碼結構，之後改導航方式才不會踩雷。

### M2. 每幀 DOM 寫入/物件配置沒有變更判斷，疊加在已經吃緊的手機幀預算上
- **檔案**：`src/ui/scoreboard.js:120`（`lineEl.textContent = ...` 每幀無條件執行，對照同檔 `renderBubble` 在 87 行有做 `text === lastBubbleText && kind === lastBubbleKind` 的 diff）、`src/ui/commentary.js:88-116`（`line()` 每幀配置新的 `{text, kind}` 物件，呼叫點 `main.js:740`）、`src/input/matchControls.js:516-527`（`uiState()` 每幀 `{...joystick}`/`{...charge}` 展開配置，呼叫點 `main.js:742`）
- **修法**：`scoreboard.js` 的比分行加一個 `if (text !== lastLine)` 判斷再寫 `textContent`；`commentary.line()`／`matchControls.uiState()` 可比照 `renderBubble` 的模式，只在真的變化時才配置新物件、否則回傳上一次的參考。單一改動效益小，但三處疊加在 60Hz 迴圈裡是持續的 GC 壓力。

### M3. 單一 736.82 kB JS bundle，無 code splitting
- **證據**：`npm run build` 輸出警告：`dist/assets/index-CUl29uA2.js  736.82 kB │ gzip: 203.91 kB`，vite 明確提示「Some chunks are larger than 500 kB」。
- **問題**：three.js＋幾何球員系統＋整套生涯/情蒐/事件系統在每一個入口（含 `?quick=1`、`?mode=bench`）都同步打包載入，首次可互動時間（尤其行動網路／低階機）會被這個單一大 bundle 拖慢。
- **修法**：用動態 `import()` 把 `src/career/*` 與 `src/ui/careerScreen.js` 延後到真的進入生涯模式時才載入（`?quick=1`/`bench` 路徑完全用不到這批程式碼）；長期可評估把 three.js 拆進獨立 chunk。

---

## LOW（測試缺口，功能本身目前看起來正常，但沒有自動化保護網）

### L1. 自由操控模式（`freeMove`）零測試覆蓋
- **檔案**：`src/input/matchControls.js:247`（`!freeMove && ...` 關掉自動接球/舉球走位）、`:258`（cover 走位同樣被 `freeMove` 隱含排除的條件路徑）、`:498`（`chooseBlock` 在 `freeMove` 時直接 no-op）、`src/main.js:202-226`（🎮 按鈕與 `localStorage` 持久化）
- **確認**：`grep -rln "freeMove|setFreeMove|vd-control" tests/` 無結果——這是 Sawmah 07-21 拍板的熟手模式，會關掉「歸你的球自動走位」這條 Phase 1 的操作主軸邏輯分支，卻沒有任何測試釘住「開啟後自動走位確實不介入」或「保底出手仍正常」。建議至少補一個行為級測試：`freeMove=true` 時，球到落點附近但不走位（走位向量維持 0）、但緩衝出手（`queuedAction`）仍能成立。

### L2. LIBERO_SWAP × VCR 回放的交互零測試
- **檔案**：`tests/libero.test.mjs`（通篇無 `vcr`/`replay`/`structuredClone` 字樣）、`src/main.js:336-345`（`startReplay`：`structuredClone(rec.snapshot)` 後用錄好的 `intents` 重新 `stepGame`）
- **風險說明**：由於整體是決定論重演（`game-determinism.test.mjs` 已驗證同 intent 序列可重現），機制上大機率沒問題，但目前完全沒有測試斷言「快照含自由人替換狀態、回放尾段又剛好跨過一次替換」時最終畫面/事件與原始那球一致——這是任務明確點名的組合，建議至少補一個整合測試：跑一場帶自由人的比賽到出現 `LIBERO_SWAP` 附近的一球、錄影、重演，比對 `replay.state` 關鍵欄位（`liberos`、`match.rotations`）與原始 tick-by-tick 記錄一致。

### L3. 賽末 Player-only 寫入路徑與 C2 同源但獨立存在
- **檔案**：`src/main.js:697-701`（`feintsUsedThisMatch > 0` 時單獨 `savePlayer`，未查回傳，且與後面 706 行的 `saveCareer` 是兩次獨立、可能中間失敗的寫入）
- 已併入 C2 的整體修法（查回傳值/改用 `saveBoth`），此處單獨列出只是提醒這是同一問題在同一函式裡的第三個發生點，修的時候一次改完不要漏。

---

## 附錄：驗證基線

```
npm test   → tests 159, pass 159, fail 0（duration 1762ms）
npm run build → 成功；dist/assets/index-*.js 736.82 kB（gzip 203.91 kB），
                vite 提示 chunk 過大建議 code splitting（見 M3）
```

單一最具體的效能證據：`tests/scouting.test.mjs` 內「情蒐錄影帶：決定論預生成 ≤3 卷」一項測試本身耗時 **732.1ms**（`npm test` 原始輸出），對應 C1——這段邏輯在真實手機（已知 37fps）上於開賽當下同步執行，是本次審查中最值得優先處理的一項。
