# 即時 highlight 重播 批3 — 實作回報（2026-08-27）

驗收＝`acceptance-netduel-batch3.md` HR-1~HR-8（含使用者兩次追記：HR-6 改用
replayDirector 電影腳本、不套回憶感濾鏡）。基準 HEAD=19984a5／2181 綠 →
本批 **2204 綠、0 紅**（+23 新增、−3 批1 廢止路徑的測試，見 §5）。

## 1. 做了什麼（一句話）

網口對決得分與關鍵分重扣得分，在死球窗自動播一段**慢動作重播＋得分方式字卡**，
運鏡直接重用結算典藏牆的導播腳本（`buildDirectorScript`）；網口對決原本的
「得分後現場鏡頭演出」整條廢止。

## 2. 改了哪些檔

| 檔案 | 內容 |
|------|------|
| `src/ui/highlightReplay.js`（新增，103 行） | 判定層純函式：`planHighlightReplay`（觸發／全短版／字卡單一出口）、`isHeavySpikeKill`、兩個【試玩必調】時長常數 |
| `src/app/matchLoop.js:997-1101` | `startHighlightReplay`／`endHighlightReplay`／`runHighlightFrame` 三支（起播、收尾、逐幀） |
| `src/app/matchLoop.js:1181` | `runReplayFrame` 開頭分派：highlight 走導播腳本，手動 🎬／情蒐帶那條**一格不動** |
| `src/app/matchLoop.js:2251-2296` | SCORE 分支改接：netduel 不再進 `fireSignatureBeat`，改餵 `planHighlightReplay` |
| `src/app/matchLoop.js:902,944-961` | 跳過通道三條（點畫面／R 鍵／🎬 鈕）＋局末 set_over 讓位 |
| `src/render/replayDirector.js:141-156` | 新增 `tAtStep`（`stepAtExact` 的反函式；純新增，既有行為零改動） |
| `src/ui/pointBanner.js:88-96,155-160` | `show(info, { holdMs })`——字卡壽命可綁重播長度（預設值＝原本的 1600/1150，既有呼叫端零改動） |
| `src/ui/signatureBeats.js:12-15,93-101,105-115,130-132` | 死碼清除：`SIG_FULL_MS.netduel` 移除、`planSignatureBeat` 的 `mine` 參數移除 |
| `src/render/cameraRig.js:61,171-183` | 死碼清除：`sigBeat.kind === 'netduel'` 構圖分支整段移除 |
| `tests/highlight-replay.test.mjs`（新增） | 26 條 |
| `tests/signature-beats.test.mjs:165-173` | 批1 三條廢止路徑測試移除（見 §5） |

`src/sim/` **零檔案**（HR-8，`git diff --stat -- src/sim/` 空）。

## 3. 設計取捨（為什麼是這個形狀）

### 3-1 尾段起點＝「決定性一拍」與「時長上限」取較晚者

導播腳本在決定性一拍之後是 `SLOW_SPEED`＝0.35 倍慢動作。開工前用 48 顆真球實測
（一次性探針，跑完即刪）：「決定性一拍→落地」在演出時間軸上佔 **2.4–7.2 秒**
（中位 5.3；**攔網收尾的球 2.5–3.5 秒**）。

⇒ 若尾段純粹按「最後 N 毫秒」切，全版 2.5 秒只看得到球的最後 0.9 秒飛行，
**扣不到那一下攔網**——正是這批要修的「不明所以」。故起點取
`max(決定性一拍的 t, 1 − tailMs/totalMs)`：

- 全版 `HIGHLIGHT_FULL_MS = 3500`：網口對決（攔網收尾）整段吃得下＝看得見那一擋；
  扣球長飛行則從中途截入，仍終於落點鏡。
- 短版 `HIGHLIGHT_SHORT_MS = 1400`：只給落地前那一下（拍板 1「不逗留、不放大挫折」）。

兩者都是【試玩必調】。慢動作倍率吃導播腳本的 `SLOW_SPEED`，不另立第二份數字。

### 3-2 「只重用運鏡、不帶回憶感後製」怎麼保證

結算頁的暗場光池／霧／地板換色／HemisphereLight／SpotLight **全部住在
`replayStage.js` 自己的 scene 層**，導播腳本回傳的只有
`{shots, segments, skipTo, totalSteps, totalMs, touches, dead}`，`cam` 欄位只有
`mode/anchorId/sig/pullback/slow`。比賽內重播只碰 `stage.rig`＋`ctx.camera`＋既有
`matchView/ballView`，**不 import `replayStage`、不動任何場景／材質／光源**
⇒ 現場原樣渲染。這一點由測試逐欄位釘死（不是看原始碼字串，是拿真球的腳本驗）。

### 3-3 字卡走 pointBanner，不新造 DOM

`pointBanner` 已有 show/hide 與死球節拍動畫，只補一個 `holdMs` 選項讓壽命跟著
重播長度；跳過時 `endHighlightReplay` 直接 `hide()`，不等計時器。
`floatText` 不適合——它是 fire-and-forget、沒有 hide。

### 3-4 一個實作中發現的衝突（已修）

局末那一分也會播 highlight，而那一刻 `game.phase` 已經是 `set_over`（局終畫面被
重播延後）。原本 set_over 的 `pointerdown` 通道會把「點畫面跳過重播」那一下一起
吃掉 ⇒ 直接重開一局／跳進結算面板。加了 `if (s.replay) return;` 讓位
（`matchLoop.js:902`），並補測試釘住。

## 4. HR-7 突變實測（真的做過，各只改一行、跑完還原）

| 突變 | 改法 | 結果 |
|------|------|------|
| ①拿掉 keyPoint 限定 | `highlightReplay.js:87` `} else if (keyPoint && isHeavySpikeKill(...))` → `} else if (isHeavySpikeKill(...))`（另跑等價形式 `false \|\| isHeavySpikeKill(...)`） | 單跑本檔 **2 紅**：「HR-2b 重扣直接得分＋關鍵分＝播；★非關鍵分＝不播★」與「吊球不算重扣」的非關鍵分那條。還原後 26 綠 |
| ②對面得分改播全版 | `highlightReplay.js:92` `const mode = mine ? 'full' : 'short';` → `const mode = 'full';` | 單跑本檔 **2 紅**：「★HR-3★ 全短版」與「★HR-3★ 短版真的比全版短、兩者皆 >0」。還原後 26 綠 |

## 5. 批1 測試的改動（逐條，以及為什麼不是降標）

`tests/signature-beats.test.mjs` 移除三條，原地留註解說明搬去哪。三條守的都是
**批3 依 HR-2 明令廢止的那條路徑**，不是行為被放寬：

1. `planSignatureBeat：netduel 對面得手（mine=false）恆短版` — `mine` 參數已移除
   （只有 netduel 用它，留著就是恆真死參數）。它守的「對面得手恆短版」**沒有消失**，
   搬到 `★HR-3★ 全短版` 那條，且**更嚴**：另外釘住「短版真的比全版短且兩者皆 >0」
   與「對面的關鍵分重扣同樣短版」（原本只驗 netduel 一種）。
2. `planSignatureBeat：netduel 我方得手＝走既有頻率經濟` — `SIG_FULL_MS.netduel`
   已移除，且 HR-3／任務書明寫「seenSignature 頻率經濟對重播不適用」。
   新檔另有一條反向釘死「同一種得分連播兩次不縮水」。
3. `sigKey：netduel 自成一鍵` — netduel 不再進 seenSignature，這條守的是一個
   不存在的頻率經濟鍵；留著＝綠燈保護一個沒有的功能。

廢止本身不是靠「刪掉測試」宣稱的，另有兩條**反向**斷言釘死：
`★HR-2★ netduel 的現場鏡頭演出路徑已廢止`（cameraRig 無 netduel 構圖、
`SIG_FULL_MS.netduel === undefined`、`mine` 參數不存在、matchLoop 不再走
`fireSignatureBeat`、`lastSpikerId` 死碼已清）與
`★HR-2★ oh/mb/opp/line 四道現場演出零改動`。

## 6. 測試清單（26 條，`tests/highlight-replay.test.mjs`）

- HR-2 觸發限定 7 條（netduel 不限關鍵分／重扣限關鍵分／吊球不算／非扣殺不播／
  pref=off／定性壞資料不炸）
- HR-3 全短版 3 條
- HR-4 字卡 2 條
- HR-5 可跳過＋安全 6 條（含 **端到端**：真卷＋假 stage 逐幀跑到自己收尾，
  斷言「跑不完＝卡死」與實際播出長度接近尾段常數；起播守門真呼叫）
- HR-6 運鏡 5 條（含 **端到端**：真球的腳本起點含得到決定性一拍、鏡位宣告至少
  切過 2 種、腳本欄位逐欄檢查無後製）
- HR-2 廢止／零改動 2 條、HR-8 1 條

## 7. 掛帳（試玩即改）

- `HIGHLIGHT_FULL_MS = 3500` / `HIGHLIGHT_SHORT_MS = 1400`【試玩必調】。
  嫌長就砍全版；嫌看不到攔網那一下就加。
- 慢動作倍率沿導播腳本 `SLOW_SPEED = 0.35`（改它會同時影響結算典藏牆——
  想只調賽中，要另立常數並在 `runHighlightFrame` 的時間軸上乘）。
- 重播期間**沒有接音效**（既有手動回放同樣是默片）。結算頁的 `replayStage` 有接，
  賽中要不要接是下一個試玩題。
- 字卡圖示 ✋／🧱／💥 為提案值。

## 8. 對抗覆審修補（2026-08-27，1 HIGH）

**【HIGH】局末/賽末的幕布蓋在重播上面**：局末那一分本身就會觸發 highlight
（`keyPointOf` 在近局點恆真 ⇒「決勝分」與「關鍵分重扣」高度重疊，是最常見的收尾
情境不是罕見邊界），而 `s.replay` 在同一幀的 `applyEvents` 裡設、`settleIfOver`
（`matchLoop.js:2580`，由 `:3465` 呼叫）稍後才跑且不看 `s.replay` ⇒
`setOverOverlay` 的全螢幕深色蒙版（`z-index:24, inset:0`）會蓋住整段重播。

修法：`settleIfOver` 頂部 `if (s.replay) return;`（`matchLoop.js:2593`）＋因果註解。
**不會弄丟幕布**：局終轉場靠 `s.prevPhase` 邊緣偵測，而 `prevPhase` 只在本函式內部
更新（三處），早退不更新＝邊緣保留，重播結束（`endHighlightReplay` 清 `s.replay`）
後的下一幀自然觸發，幕布／生涯落檔／典藏牆錄製（`recordVaultRally`）只是延後幾秒。
`set_break` 同函式一併讓位，理由同理。

端到端測試 2 條（`tests/highlight-replay.test.mjs`，用既有真球治具）：
「局末得分：重播期間不得蓋上局終幕布，重播結束後才蓋」（逐幀跑完整段、每幀都呼叫
`settleIfOver` 斷言零幕布，播完後下一幀必須補上、且仍是一次性）與「跳過也一樣」。
突變自證：註解掉那行早退 → 這 2 條紅（皆紅在「起播後同幀呼叫 settleIfOver，幕布就
蓋上來了」），還原後 28 綠。

## 9. 未做／疑義

- 未 commit、未 push、未 deploy（任務書指示）。
- 真機目視未做（node 測試環境無 WebGL）：運鏡構圖好不好看要靠試玩。端到端測試
  只保證「會切、會收尾、長度對」，不保證「好看」。
