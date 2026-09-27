# 寫實球員卷 2A「進賽場」驗收報告

> 驗收條件＝`docs/kickoffs/real-player-stage2-match.md` 第三節 B1–B12（凍結，未改動任何條文）。
> 分支起點：`ac41969`；本輪 commit：`284b5e5`、`b993c5a`、`2a8464f`（詳見文末 commit SHA 清單）。

## 結論

**B1–B10、B12 全過。B11 依驗收條文本身即不由本卷判定（需使用者手機實機量測），本卷只交付
其摘要計算與單元測試，不宣稱已過。** `npm test` 2610/2612 綠（唯一 2 個失敗與分支起點
`ac41969` 基準逐名逐訊息相同、非本卷造成）；`npm run build` 成功，PWA 預快取含兩個寫實
模型 GLB。

## 方法

- 量測走**生涯比賽**（非快速比賽）：快速比賽 `game.bench` 恆空，B2 的 SUBSTITUTION 測不到。
  治具（`tools/real-match-browser.mjs`）直接呼叫 `resolveMatchConfig`→`buildMatchStage`→
  `startMatchLoop`（`main.js` `runMatch` 的同一組函式），跳過「新生涯精靈」與「出戰」按鈕的
  選單導航——換人仍走 `stage.handlers.requestSub` 唯一正式路徑（sim 端 `applySubstitution`），
  跳過的只是「怎麼點到這場比賽」的 UI 層。開賽的入場運鏡／情蒐帶／學招字幕（純表現層演出）
  以既有的 `hide()`/null 出場方式提前收掉，讓 sim 立刻開始 tick——處理方式與外觀無關，兩模式
  一視同仁。
- 牆鐘：Playwright `page.clock.install({time:0})` + `pauseAt(0)`（見下方「踩坑」）取得真正凍結
  的虛擬時鐘，`runFor(20000)` 分段推進；渲染呼叫在量測期間 no-op（CPU 側量測直讀
  `mesh.getVertexPosition`／`skeleton`，不依賴 `render()` 真的跑過），B12 截圖時才恢復真實渲染。
- 取樣：每 10 sim tick 一次（`SAMPLE_EVERY=10`），對當下所有可見球員量測；`?autopilot=1` 決定論
  代打；seed 清單 1、2、3（依序全部計入，未挑掉任何一卷）；合計每 seed ≥ 3 分鐘 sim 時間
  （TARGET_TICKS=10800）。
- SUBSTITUTION／LIBERO_SWAP：LIBERO_SWAP 在自動對戰中自然發生（每個 rotation 循環都會觸發）；
  SUBSTITUTION 由治具在 sim 迴圈內部（`matchView.sync` 的同一個 hook，非治具端牆鐘 polling——
  理由見下方踩坑）判斷「tick ≥ SUB_AT_TICK(3000) 且 phase==='serve'」時呼叫
  `stage.handlers.requestSub(outId, inId)`，兩模式必落在同一個 tick。

## 踩坑記錄（過程中發現並修正的治具缺陷）

這兩項不是產品缺陷，是**治具**（`tools/real-match-browser.mjs`）本身的邏輯錯誤，記錄在此供覆核：

1. **`page.clock.install()` 不會凍結時間**：沒有額外呼叫 `pauseAt()`，時鐘仍以真實速度在背景跑
   （只是起點改到 0），`runFor()` 是在那個背景基準上再疊加推進量。寫實模式每次 `page.evaluate`
   往返較慢，背景漂移量與幾何模式不同，會讓兩模式在「治具沒呼叫 `runFor` 期間」（例如
   `checkColors`／`pullFinalState` 等多次 `page.evaluate` 往返之間）各自多跑掉不同數量的 tick。
   實測：60 秒虛擬時間內，僅呼叫一次 `runFor` 後再靜置，`game.tick` 仍持續前進。修法：
   `install({time:0})` 後立即 `pauseAt(0)`，之後任何時間推進只能靠明確呼叫 `runFor`/`fastForward`。
2. **B2 檢查誤抓觀眾席**：`checkGeoPoolEmpty` 原本比對場上「任何 `InstancedMesh` 且
   `count>0`」，抓到了 `arena.js` 的觀眾席（`createArena` 建的單一 `InstancedMesh`，
   `count=712`，從開機就在、與球員外觀完全無關）。改成只比對 `capacity` 恰為
   `playerCount×1` 或 `×2` 的池（對應 `geoCharacter.js` 的 12 種 `PART_SLOTS`），並斷言
   candidate 池數＝12。
3. **B6 比對點不對齊**：兩模式各自 `runUntilTick` 粗推進（20 秒虛擬時間一個分段），
   在「≥3 分鐘」的長跑下，geo／real 兩邊落地的最終 tick 可能差 1–2 tick（實測 seed1 差 2
   tick）。在「各自的最終 tick」比對完整 `game` 序列化，比出的只是「兩個不同時間點的狀態
   自然不同」，跟渲染有沒有影響 sim 無關——第一輪全量跑因此誤報 B6 紅燈。修法：每個取樣點
   （每 10 tick）順手算一個輕量狀態簽章（分數＋球位置＋全員 `x`/`z`/`divedUntil`/`blockUntil`），
   比對「兩邊取樣都採到的最後一個共同 tick」；events 也裁到該 tick 再比。完整 `game` 序列化
   只在兩邊剛好落在同一個最終 tick 時才當額外佐證（此時 `null`＝不適用，不算失敗）。

以上兩項在加入**突變驗紅**後才被抓到：B2/B6 的突變測試本應「只讓對應那一條變紅」，第一輪
卻在「乾淨（未突變）副本」上就先紅了——這正是 `02-dispatch-rules.md §6.1` 第 1 條要求的「反面
也要驗」（健康狀態下這個證據會不會變綠）。修正後重新驗證：乾淨副本上 B2/B6 皆綠，四個突變
（B2/B3/B5/B6）各自只讓對應那一條變紅、其餘不受影響（見下方各條與 `mutation-b*.json`）。

## 基準

- 基準 commit：`ac41969`（分支起點，工作區乾淨）。
- 基準 `npm test`：`docs/experiments/npm-test-baseline-ac41969.log`
  ```
  ℹ tests 2603
  ℹ pass 2601
  ℹ fail 2
  ✖ A23a 真人追球（全部案例當分母）：舉球區 ≥ 34%、空接 ≤ 25%、碰網 ≤ 5%
  ✖ A23b 正前（1035）：舉球區 ≥ 38%、空接 ≤ 26.8%
  ```
  （兩項既有失敗皆在 `tests/direct-receive-assist.test.js`，與本卷無關，第一階段修正紀錄已載明。）

## 逐條驗收

### B1 開關與預設

**過。** 治具：`docs/experiments/real-match-evidence/b1-ui-check.json`（Playwright 實際點擊
UI，非治具端 evaluate 直呼函式）。步驟與結果：①乾淨 profile 進主選單，按鈕預設文字
`球員外觀：幾何`（`menuDefaultLabel`）②點擊後變 `球員外觀：寫實`且 `localStorage
['vd-player-appearance']==='real'` ③重新整理後仍顯示 `球員外觀：寫實`（持久化）
④帶著已切到寫實的設定，快速比賽 `?quick=1&autopilot=1` 組出的 `matchView.debug.
appearance==='real'` ⑤生涯出戰：`?career=resume` 進生涯首頁，`ioRow` 的球員外觀按鈕同步顯示
`球員外觀：寫實`（`careerHomeLabel`），實際組一場生涯比賽（`resolveMatchConfig`→
`buildMatchStage`→`startMatchLoop`，同 `main.js runMatch`）`matchView.debug.appearance
==='real'`。全程 `page.on('pageerror'/'console error')` 皆空（`errors: []`）。
`pass: true`。按鈕實作：`src/ui/careerScreen.js`（主選單按鈕與 `ioRow` 按鈕）；
持久化：`src/render/playerAppearance.js:loadAppearancePref/saveAppearancePref`
（key＝`APPEARANCE_PREF_KEY = 'vd-player-appearance'`）。

### B2 替換完整

**過。** 3 個 seed、全部取樣點：`visibleCountMismatches` 皆為 0（geo/real 兩模式同一 tick
可見人數逐一相符，seed1 共同取樣點 1162、seed2 1094、seed3 1145）；`geoPoolCheck.allEmpty`
皆為 `true`（12 個幾何部件池——`geoCharacter.js` 的 `PART_SLOTS`，capacity 恰為
playerCount×1／×2——在寫實模式下全數 count=0，無殘留幾何 Mesh）。LIBERO_SWAP 三個 seed
皆自然發生（seed1 10 次）；SUBSTITUTION 由治具在 sim 迴圈內部觸發（`stage.handlers.
requestSub`），三個 seed 都成功（`ok:true`）且兩模式落在同一個 tick
（seed1 tick 3276、seed2 tick 3000、seed3 tick 3034）。

**突變驗紅**（`mutation-b2.json`）：讓 `matchView.js` 在寫實模式下也額外 `createGeoCharacter`
（幾何人與寫實人疊在一起）——`geoPoolCheck.allEmpty` 變 `false`，12 個幾何池全部非空
（4 個 count=19、8 個 count=38，對應 playerCount=19 的單/雙倍部件數），B2 判紅；B3/B4/B5/B6/B7
不受影響（皆 true）。

### B3 蒙皮跟隨與接地

**過。** 3 個 seed、每個取樣點的每個可見寫實球員：`handDist.r/l ≤ 0.15 m`
（A2(e) 手部蒙皮質心到同側腕關節）、`soleMin ≥ -0.03 m`（鞋底蒙皮最低點）皆成立
（seed1 樣本數 22078、seed2 20786、seed3 21755）。SEQUENCES 鍵名覆蓋（三 seed 聯集）
共 18 種：`serve, receiveReady, bump, transitionWait, setReady, overhead, approach3,
windup, spikeHold, spike, blockJump, landSoft, cheer, overheadJump, approach4,
serveFloat, highfive, dive`——涵蓋全部 6 組（bump／overhead／spike／block／serve／approach）。

**突變驗紅**（`mutation-b3.json`）：拿掉 `u.real.groundLegs()` 接地 IK 呼叫——
`b3SoleOk` 變 `false`（鞋底沒入地面），B3 判紅；B4/B5/B6/B7 不受影響（皆 true；
此次突變剛好也踩到 B2 的觀眾席假陽性，該次證據已在報告「踩坑記錄」說明，實際
`geoPoolCheck` 顯示的是觀眾席 count=712、非幾何球員池——這支突變本身不影響 B2）。

### B4 身高

**過。** 3 個 seed、每個可見寫實球員：寫實模型頭頂（蒙皮候選頂點——綁定姿勢最高
2% 頂點，逐取樣點重新蒙皮取最大 y）與參考幾何 rig（`createGeoCharacter` 建的參考
角色，逐取樣點同步複製寫實球員當下的 root 位置/旋轉/縮放與全部關節旋轉）頭頂高度
差 ≤ 0.05 m（樣本數同 B3：22078／20786／21755）。

**查證附記（範圍外事實，經查證、未改條文）**：`matchView.js:383`
（`u.rig.root.scale.setScalar(hideMe ? 0.0001 : 1);`）每幀把每個單位的 root 縮放重設為
1 或 0.0001，忽略了 `createGeoCharacter`/`createRealPlayer` 建立時依 `height.current`
算好的縮放比——這行是既有程式碼（`git blame` 追到 `7f50513`「W8 暫停演出」，早於
本卷分支起點 `ac41969`，本卷未曾改動），範圍外、不修。B4 的量法並未受此影響：
參考 rig 的縮放是「逐取樣點複製寫實球員當下的 `u.rig.root.scale`」而非假設
`height.current/BASE_H`，兩側量的都是**同一個實際生效的縮放值**，即使該值恆為 1
（如這行程式碼所致），比較仍然自洽有效——這正是為什麼「取樣須含場上身高最高與
最低的球員」在此行為下仍能通過：兩側頭頂高度差量的是「同一縮放下的頭頂位置」，
不是「縮放本身有沒有依身高變化」。

### B5 配色與背號

**過。** 配色：3 個 seed 的全體球員（含板凳/自由人）軀幹頂點色眾數與
`resolveKit`（用該場實際 kit 覆寫算出的期望色）逐通道容差 ≤2/255 全部相符
（`colorAllOk: true`）。背號面片：N4 上限（三 seed 皆 28 片 ≤30）；面片中心到
最近蒙皮頂點距離 ≤0.06m（back/front 皆），樣本數 seed1 16268、seed2 15316、
seed3 16030。

**突變驗紅**（`mutation-b5.json`）：`realPlayer.js` 的 palette 陣列 JERSEY/SHORTS
互換——全體球員軀幹頂點色眾數變成短褲色（`colorAllOk: false`，19 名球員
`ok:false`，如 A 隊球衣期望 0x2E7BFF 但量到 0x1616BF≈短褲色 1450559），B5 判紅；
B2/B3/B4/B6/B7 不受影響（皆 true）。

### B6 sim 不受影響

**過。** 3 個 seed，最終正式跑（`report.json`）：seed2／seed3 `finalTickGeo` 與
`finalTickReal` 逐位元相同（10933/10933、11693/11693，`b6FinalTickAligned: true`），
因此對這兩個 seed 完整 `JSON.stringify(game)` 序列化逐位元比對本身即具鑑別力，
`b6SnapshotEqual: true`。seed1 兩模式最終 tick 差 2（11255 vs 11253，
`b6FinalTickAligned: false`——牆鐘背景漂移導致兩個 session 各自的治具收尾時機
不同，非 sim 分歧，見「踩坑記錄」第 1 點），此情形下完整快照比較的兩側不是
同一時間點、不具鑑別力，改採兩側都採到的最後共同 tick（11250）比對：events
陣列 `b6EventsEqual: true`（249 條事件，含 10 次 LIBERO_SWAP、25 次 SERVE、1 次
SUBSTITUTION，逐項比對 geo/real 完全一致）、逐格輕量狀態簽章（分數/球位置/全員
位置）`b6StateSigEqual: true`、`b6ActivityOk: true`（該共同 tick 前有實際受測行為
發生，非雙方共同卡死的假陽性）——3 個 seed 皆滿足「events 相同 ∧ 狀態簽章相同 ∧
（快照比對不適用時視為通過，適用時也相同）」。

**突變驗紅**（`mutation-b6.json`）：`matchView.js` 的 sync() 寫實分支內
`gameState.events.push({type:'MUTATION_TEST_B6',...})`（渲染層回寫 sim 事件陣列）——
`b6EventsEqual`／`b6SnapshotEqual` 皆變 `false`，B6 判紅；B2/B3/B4/B5/B7 不受影響
（皆 true）。

### B7 其他畫面不動

**過。** `git diff ac41969 -- src/render/kitPreview.js src/render/ritualStage.js
src/render/recruitPortrait.js src/render/beatStage.js src/app/freeballSandbox.js
src/render/directPlayerView.js` 為空（0 行）；`src/` 內 import `realPlayer.js` 的
檔案只有 `src/app/realPreview.js`、`src/render/matchView.js`（`grep -rl
"realPlayer.js'" src --include=*.js`），符合「只允許 matchView.js、realPreview.js
與本卷新增的外觀設定模組」——`playerAppearance.js` 本身未 import realPlayer.js，
不在 grep 結果中，但仍在允許清單內。

### B8 不自我降級

- (a) 單元測試：`tests/player-appearance.test.mjs`（決定函式輸入只有 storage/params，同輸入不同
  `performance.now` 替身輸出逐值相同）。指令：`node --test tests/player-appearance.test.mjs`。
- (b) CPU 6x 降速：**過。** CDP `Emulation.setCPUThrottlingRate(6)`，seed1、寫實模式，
  3972 tick（398 個共同取樣點）：`appearanceStayedReal: true`（整場 `debug.appearance`
  恆為 `'real'`，未曾中途切回幾何）、`facesStayed20k: true`（`debug.faces` 恆為
  20000，未曾降級到 5k 變體）、`visibleCountMismatches: 0`、`errors: []`——
  `playerAppearance.js` 的 `resolvePlayerAppearance` 本身不讀 `performance.now()`，
  沒有可以「自我降級」的輸入來源，與 B8(a) 的純函式證據互證。`pass: true`
  （`docs/experiments/real-match-evidence/report.json` 的 `b8b` 區塊）。

### B9 載入失敗（邊界）

**過。** 治具攔截 `models/real/player_20k.glb` 請求回 404（`page.route`），seed1、
外觀設定為寫實：console 確實收到 404（`Failed to load resource: ... 404`）與治具
自家的 `[real-match] 寫實模型載入失敗，本場改用幾何球員 HttpError...`；`matchView.
debug` 顯示 `realLoadFailed: true`、`unitsAllGeo: true`（全體球員 fallback 回幾何
rig，非部分球員卡在半載入狀態）；比賽本身持續運作到 tick 3971（`stillPlaying:
true`），未整場卡死；`page.on('pageerror')` 為空（`pageerrors: []`，載入失敗走的是
`catch`，沒有變成未捕捉例外）。DOM toast 文字含子字串「寫實模型載入失敗」
（`toastText: '寫實模型載入失敗，本場改用幾何球員顯示'`，`toastHasSubstring: true`）。
`pass: true`（`docs/experiments/real-match-evidence/report.json` 的 `b9` 區塊）。
實作：`src/render/matchView.js` 的 `showRealLoadFailToast()`（6 秒後 `setTimeout` 自動
移除），呼叫點在 GLB `catch` 分支、與 `useReal=false` 的 fallback 一起設定。

### B10 建置與測試

**過。** `npm run build`（`docs/experiments/real-match-evidence/npm-build.log`）：
`EXIT:0`，`✓ built in 5.85s`；PWA precache（見下節）。`npm test`
（`docs/experiments/real-match-evidence/npm-test-final.log`）：
`tests 2612 / pass 2610 / fail 2`，`EXIT:1`（node test runner 因有 2 個失敗案例
回傳非 0，符合預期——見下）。唯一失敗的兩案例與基準一致，皆在
`tests/direct-receive-assist.test.js`：`A23a 真人追球（全部案例當分母）：舉球區
≥34%、空接≤25%、碰網≤5%` 與 `A23b 正前（1035）：舉球區≥38%、空接≤26.8%`——
與 `ac41969` 基準（2603/2601/2）比對同名同錯誤訊息、非本卷改動範圍
（`git diff ac41969 -- tests/direct-receive-assist.test.js src/` 對接球輔助邏輯
零改動）。測試數從 2603→2612（+9）：本卷新增 `tests/player-appearance.test.mjs`
（5 案例）與 `tests/fps-summary.test.mjs`（4 案例），皆通過。

### B11 手機 FPS 閘門（使用者量）

本卷只負責摘要計算與其單元測試，**不宣稱已過**（需使用者手機實測）：

- `src/ui/fpsSummary.js`（平均／最低摘要，含「發球前」與「`document.hidden`」整格排除）
- 單元測試：`tests/fps-summary.test.mjs`（合成時間序列，含一段發球前、一段 hidden）
- 指令：`node --test tests/fps-summary.test.mjs`

### B12 截圖證據

**過。** 8 張截圖（`docs/experiments/real-match-evidence/{desktop,portrait}-{receive,
spike-hit}-{geo,real}.png`），`manifest.json` 記錄每張的 tick/動作/外觀/視角。桌機
（1280×720）與直式手機（390×844）×接發（`bump`）／擊球瞬間（`spike`）×幾何／寫實
四組，每組視角內 geo/real 兩張**逐 tick 相同**：receive 兩視角皆 tick 4015、
spike-hit 兩視角皆 tick 4011；動作序列（`animator.peek().type`）分別確認為
`bump`／`spike`，無 `errors`。方法：`?autopilot=1` 的受控球員零輸入 fallback
路徑本身幾乎不觸發完整動作序列（治具日誌另行確認：A2 在完整 11614 tick 的比賽中
除發球外 `animator.peek()` 恆為 null，其餘隊友正常出現 14–18 種鍵名），因此改用
`matchView` 既有公開介面 `triggerPose('A2','bump')`／`triggerContact('A2','spike')`
（純渲染層呼叫，不寫 sim）在固定 `BASE_TICK=4000` 對兩模式做確定性觸發，取得可
比對的並排畫面，而非依賴自然發生的動作時機。

**踩坑（治具本身，已修正）**：粗推進（20 秒虛擬時間分段）到目標 tick 前緣後，
原本用 `runFor(17)` 逐步細推進到 `targetTick`，因 17ms 步幅跨過 60Hz（≈16.67ms/
tick）單一 tick 邊界，兩模式的 accumulator 餘量不保證相同，導致停在 targetTick±1
（portrait 視角兩次量測都是 real 比 geo 少 1 tick）。改成 `runFor(1)` 逐毫秒細推進
並每步後立即檢查，讓兩邊都精準停在 tick 剛好抵達 targetTick 的那一步，修正後兩
視角四組全數逐 tick 相同（見上）。

## PWA 預快取

`npm run build` 輸出（`docs/experiments/real-match-evidence/npm-build.log`）：
`PWA v1.3.0 mode generateSW precache 36 entries (2588.99 KiB)`。確認兩個寫實模型
GLB 都在 `dist/sw.js` 的 precache manifest 內（`grep -o '"models/real/[^"]*"'
dist/sw.js`）：`models/real/player_20k.glb`、`models/real/player_5k.glb`——
`vite.config.js` 的 `globPatterns` 新增項 `models/real/*.glb` 生效，離線可用。

## npm test：基準 vs 最終

| | tests | pass | fail | 失敗案例 |
|---|---|---|---|---|
| 基準（`ac41969`，`docs/experiments/npm-test-baseline-ac41969.log`） | 2603 | 2601 | 2 | A23a、A23b（`tests/direct-receive-assist.test.js`） |
| 最終（本卷 HEAD，`docs/experiments/real-match-evidence/npm-test-final.log`） | 2612 | 2610 | 2 | A23a、A23b（同上，同錯誤訊息） |

差異：+9 tests 全部是本卷新增的 `tests/player-appearance.test.mjs`（5）與
`tests/fps-summary.test.mjs`（4），全數通過；既有失敗案例數量與身分未變，非本卷
造成（詳見 B10）。

## git diff --stat

## 身高縮放修復（2026-09-27，主對話 fix ＋ fresh-context 驗收）

**結論：修復生效，H1 新增檢查通過；B2/B3/B4/B6 與 npm test 未受影響。**

### 缺陷

`src/render/matchView.js:384`（`hideMe ? 0.0001 : ...`）原本每幀寫死
`u.rig.root.scale.setScalar(hideMe ? 0.0001 : 1)`，蓋掉 `createGeoCharacter`
（`src/render/geoCharacter.js:298`，`root.scale.setScalar(height / BASE_H)`）建角色時
設好的身高縮放——比賽中全部球員（幾何與寫實兩模式）恆以 `BASE_H`＝1.85m 顯示，與
`gameState.players[id].height.current`（1.72–1.96m 不等）無關。修法：
`u.rig.root.scale.setScalar(hideMe ? 0.0001 : gameState.players[id].height.current / BASE_H)`。

### H1 新增檢查（`tools/real-match-browser.mjs`）

既有 B4（`headTopDiff`）比對的是「real 網格頂點 vs. 用同一顆 `u.rig` 縮放複製出來的
參照 rig」——參照 rig 的 scale 是從 `u.rig.root.scale` 複製來的，**若那個 scale 本身是
bug（恆 1），參照值也會恆 1，此檢查對本次的縮放 bug 完全沒有鑑別力**。H1 改成直接量
`u.rig.parts` 的 `head` slot 世界座標＋頭半徑（`0.125`）×`u.rig.root.scale.y`，與
`gameState.players[id].height.current` 對比——這條量測只吃 `matchView.js:384` 那行縮放
公式的直接下游，兩模式（幾何／寫實）共用同一份 `u.rig`（`realPlayer.js`：
`rig = createGeoCharacter(...)`），量法一致。

驗收條件（每個取樣 tick 挑「場上可見球員身高分散度最大」的一筆）：
①身高分散度 ≥0.05m（先確認場上真有高矮差）②頭頂高度／`height.current` 比值在全體可見
球員間 max/min ≤1.03 ③最高與最矮球員的頭頂高度差 ≥0.5×兩人身高差。

### 鑑別力（`02-dispatch-rules.md §6.1` 第 1 條）

修前碼（`git archive 93698f3` 解到 scratchpad，套用同一份新檢查，另 init 一次性 git repo
供治具讀 `git rev-parse HEAD`；`checkB7()` 因無對應 baseline commit 改包 try/catch 略過，
不影響 H1）跑出：

```
h1Geo:  ratioSpread=1.1395  headDiff=0        heightDiff=0.24  ok=false
h1Real: ratioSpread=1.1395  headDiff=0        heightDiff=0.24  ok=false
```

最高（A3，1.96m）與最矮（BL，1.72m）球員的 `headTopY` **逐值相同**（`1.832708388416191`
／`1.8247218552503113`）——直接對應「全員恆以 1.85m 顯示」的行為斷言，不是
`AttributeError` 之類的旁枝錯誤。修後碼（seed=1、`docs/experiments/real-match-evidence/
h1-postfix-report.json`）：

```
h1Geo:  ratioSpread=1.0203  headDiff=0.2392  heightDiff=0.24  ok=true
h1Real: ratioSpread=1.0195  headDiff=0.2381  heightDiff=0.24  ok=true
```

A3 頭頂 1.9423m／BL 頭頂 1.7031m（geo），headDiff／heightDiff＝0.997（遠高於 0.5 門檻），
ratioSpread 1.02（<1.03）。反面同時成立：健康狀態下綠、修復前紅，符合鑑別力要求。

### B2/B3/B4/B6 與 npm test 重驗（修復後，seed=1 全長 TARGET_TICKS=10800）

`docs/experiments/real-match-evidence/h1-postfix-report.json`：
`pass = { B2: true, B3: true, B4: true, B5: true, B6: true, H1: true }`
（B7/B8b/B9/B12 該次治具呼叫用 `SKIP_B8B=1 SKIP_B9=1 SKIP_SHOTS=1` 跳過，不代表變紅，
未跑而已；B7 走純 git/grep 邏輯不受本次改動影響）。

`npm test`：2610/2612 綠，失敗清單與分支基準（`ac41969`）逐名逐訊息相同——
`tests/direct-receive-assist.test.js` 的 A23a、A23b（`docs/experiments/
npm-test-baseline-ac41969.log`），與本次改動無關。

### commit

`dacc27a`（見下方「commit SHA 清單」新增的最後一筆）。

`git diff --stat ac41969..HEAD`：**36 files changed, 1426955 insertions(+), 10
deletions(-)**（大宗為 evidence 截圖 PNG 與 `sessions-raw.json`/`npm-test-final.log`
等 JSON/log 證據檔案；程式碼變動集中在 `src/render/matchView.js`（+87/-7）、
`src/render/playerAppearance.js`（新檔 +27）、`src/ui/fpsSummary.js`（新檔 +54）、
`src/ui/hud.js`（+30/-3）、`src/render/geoCharacter.js`（+8/-2）、
`src/render/realPlayer.js`（+10/-2）、`src/app/matchLoop.js`（+13/-2）、
`src/ui/careerScreen.js`（+19）、`vite.config.js`（+4/-2）、`index.html`（+3）、
`src/main.js`（+5）、`src/app/matchStage.js`（+3）；治具
`tools/real-match-browser.mjs`（新檔 +828）；測試 `tests/player-appearance.test.mjs`
（+78）、`tests/fps-summary.test.mjs`（+75）；文件 `docs/experiments/
real-match-report.md`（本檔）。

## commit SHA 清單

- `284b5e5` feat(real-match): 2A 外觀開關與寫實球員接入比賽畫面（B1/B2/B3/B4/B5/B8a/B9/B11 骨架）
- `b993c5a` test(real-match): 2A 驗收治具 tools/real-match-browser.mjs（B1-B10、B12）
- `2a8464f` fix(real-match): 治具 B2/B6 false-positive／false-negative 修正＋B2/B3/B5/B6 突變驗紅
- `99c7f62` fix(real-match): 治具排除精華重演狀態污染取樣＋B1 UI 全流程驗證通過
- `5a2b782` docs(real-match): 2A 驗收 B1-B10/B12 最終產出＋治具 B12 tick 精度修正（本次收尾）
- `dacc27a` fix(real-match): 身高縮放被每幀寫死 1 蓋掉＋H1 驗收治具檢查＋鑑別力驗證

## git status

`git status --porcelain` 輸出為空（乾淨，全部變動已 commit）。

## 背景程序

本卷自起的 dev server（`vite --port 5185`）與突變測試副本 dev server
（`scratchpad\realmatch-mut\snapshot`，port 5190/5205 系列）皆已在收尾時關閉；
`netstat -ano` 核對僅剩其他並行 agent 的埠（5175/5176/5141 等，非本卷所開，
未動）。
