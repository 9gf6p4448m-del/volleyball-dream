# Phase 4.6 結案快照 — 回放引擎輪（重演舞台＋典藏牆＋導播）

> 2026-07-28 結案。工單＝`docs/kickoffs/phase4_6-prompt.md`（Claude.ai 規劃會議產出、
> Sawmah 逐題拍板）。基準 main@45c37d2（574 測綠）→ 結案 **593 測綠（+19、只增不減）**、
> `vite build` 綠。憲法＝`phase4-decisions-RESOLVED.md` 全程沿用；
> **sim 純核心整輪零 diff（`git diff 45c37d2..HEAD -- src/sim/` 空）**、零 sim 數值參數改動。
> 驗證＝node:test 全套＋Playwright 對 dev 實跑（重演舞台三段構圖實渲染、跳過定格、
> 退化文字卡、dispose 無殘留、三段 FPS），console 0 錯誤 0 警告。
>
> **本輪最大變數已翻牌：§3-0 容量探針把四槽案逼到停手回報，Sawmah 當場裁定改錄製格式。**
> 詳見 §1——這條裁定改寫了整輪的資料層，也順手解掉一個既存的存檔寫爆隱患。

## 0. 交付總表（工單 §1 順序）

| # | 區塊 | 狀態 | 落點 |
|---|------|------|------|
| 1 | §3-0 容量探針 | ✅（觸發停手回報→裁定） | `tools/replay-size-probe.mjs`（新）；數據見 §1 |
| 2 | 錄製格式 v2（裁定後新增工項） | ✅ | `src/app/rallyTape.js`（新）＋matchLoop 接線 |
| 3 | §2 重演舞台 | ✅ | `src/render/replayStage.js`（新） |
| 4 | §4 導播腳本 | ✅ | `src/render/replayDirector.js`（新） |
| 5 | §3 典藏資料層四槽 | ✅ | `careerStore.vaultOf/recordVaultRally/loadRallyVault`＋matchLoop 錄製掛點 |
| 6 | §5 入口卡 | ✅ | `src/ui/replayVault.js`（新）＋careerScreen 結算流程 |
| 7 | §6 小白事件二示意圖 | ✅ | `src/ui/chaseDiagram.js`（新）＋n2Arc 三版宣告＋dialogPlay `diagram` 通道 |
| 8 | §7 準度可讀性半件 | ✅（砍一項，見 §8） | `signatureBeats.timingVerdict`＋matchLoop 字卡 |

新測試檔：`tests/rally-tape.test.mjs`（7）、`tests/replay-director.test.mjs`（6）、
`tests/replay-vault.test.mjs`（3）；更新：`n2-arc`（+1）、`signature-beats`（+1）、
`finale`（典藏 roundtrip 改四槽語意＋舊存檔讀成空牆，+1）。

## 1. §3-0 容量探針（硬要求；本輪的轉折點）

`tools/replay-size-probe.mjs`，樣本 479 顆球（12 場單局）：

| 指標 | 實測 |
|------|------|
| 單筆 `finalRally`（舊格式） | p10 728KB／**p50 1,127KB**／p90 1,921KB／p99 3,712KB／max 5,862KB |
| 組成 | 快照 8–14KB，**Intent 流佔 99%**（12 人 × 每 tick × move/aim/gaze 全精度浮點） |
| 回合長度 | p50 614 ticks／p90 1,034／max 3,056 |
| 四槽總量預估 | p50×4＝**4.4MB**／p90×4＝7.5MB／max×4＝22.9MB |

**判定：超出安全預算**（localStorage 約 5MB/origin、多數瀏覽器以 UTF-16 計費，
且**三個存檔槽共用同一份額度**）。依工單 §3-0 停手回報，附帶量了各條路的代價
（純量測、零行為改動）：稀疏化 ×0.61／＋座標量化 ×0.33／**只錄玩家 Intent ×0.10**。

**07-28 Sawmah 裁定：改錄製格式（只錄玩家 Intent，AI 重演時重算）。**

順帶記錄一個**既存隱患**（本輪順手解掉）：現行單槽的冠軍點就已經是 p50 1.1MB，
一旦存進去，之後每次生涯存檔的 RMW 都要把這包重寫一次——額度一滿就是整份存檔
寫入失敗。改格式後單筆降到 **80KB**（實跑真實形狀的卷，511 步），四槽 ≈0.3MB、
三存檔槽全滿 ≈1MB。

## 2. 錄製格式 v2（`src/app/rallyTape.js`）——介面文件（Phase 5 要吃）

```
tape = { v:2, snapshot, ai, steps:[{ p?:Intent[], c?:controlledId, a?:aiPatch }] }
```

- `createRallyRecorder()` → `{ begin(game, aiState), step(game, aiState, controlledId, playerIntents), end(), reset() }`
- `createRallyPlayer(tape)` → `{ state, step()→events, fastForward(n), index, done, lastIntents }`
- `isPlayableTape(tape)`：缺快照/零步數＝不可播（UI 據此決定入口出不出現）

**決定論的三個支點**（缺一就不逐格一致，測試逐項背書）：

1. **aiState 快照**——AI 協調層的跨 tick 記憶（flightPlan／claim／攻擊手指派）
2. **每 tick 的 controlledId**——AI 不代打受控者；漏了它 AI 會多產一份 Intent
3. **aiState 玩家欄位 patch**（`digBias`／`attackerId`＋`attackKind`／`counterRead`）
   ——這些是玩家透過協調層下的指令，**走的不是 Intent 管線**，不錄就重演不出來

錄製點必須在 `aiCollectIntents` **之前**（那一步會演進 aiState，重演端是「先套 patch
再 collect」，順序對齊才一致）。舊格式卷（情蒐帶：現場生成、不落存檔）由同一個
重演器相容播放，播放路徑共用。

**實跑抓到的邊界**（已修＋測試）：發球前的等哨時間也在錄——玩家在發球面板前發呆
五分鐘，那一卷會長成 2.7MB／20000 步。改為**每 60 tick 重照一次快照並丟掉舊步**
（`PRESERVE_KEEP`）：一顆球的戲從發球佈陣的最後一秒開始，不從玩家放下手機那一刻開始。

## 3. §2 重演舞台（`src/render/replayStage.js`）

- **模組重用範圍（本輪最大工程判斷）**：`matchView`（十二人＋姿勢路由）／`ballView`／
  `court`（場地線＋網＋觸網漣漪）／`cameraRig` **全部直接吃主賽場模組**，只有燈光另配。
  理由：重演的人必須和比賽中的人是同一批像素，否則「這是我打的那顆球」的說服力就沒了。
  另建的只有：舞台外殼（renderer/canvas/scene，ritualStage/beatStage 範式）＋暗場燈光。
- **場館＝不做**（拍板）：暗場＋光池，人與球是唯一亮點。地板用 **W4 三館制的
  `setFloorPalette` 換色把手**改暗（不另建材質）——常規館的橘色木地板在聚光下會亮成
  一整片，把「暗場」吃掉（實跑截圖校正：spot 900→430、hemisphere 0.34→0.28）。
- **播放控制**：直接消費 4.5B 演出時鐘（`createBeatTimeline`／`driveTimeline`）——
  牆鐘 rAF、apply 絕對式；播放／暫停／跳過齊備。`stepAtExact` 回浮點：整數部分推 sim、
  小數部分當插值 alpha（慢動作下才不會走成階梯）。
- **重演零 sim 寫入**：吃重演器自己的 state 副本，不進 Intent/rand 路徑、不碰存檔。
- **退化路徑**：WebGL 失敗／reduced-motion → 不建舞台，改文字紀錄卡
  （誰發球→誰舉→誰扣→結果，`narrateTape`）。實跑驗過。
- dispose 紀律：離開即拆，實跑驗證 canvas 數回到 1（主遊戲那一個），無殘留。

### 3-1 兩處實跑校正（截圖驅動）

1. **sig 構圖撞人**：sig 三構圖是為「賽中死球窗、位置已分散」調的，重演任意時刻套用
   會把鏡頭插進別人後腦。解法＝舞台層**沿視線後退**（`cam.pullback`，sig 2.6m／
   line 1.2m）——構圖不變、只是站遠一點看；比為重演另開一套鏡位常數乾淨
   （**cameraRig 的賽中手感一格不動**）。
2. **跳過的定格不等於播完的終態**：rig 的過場插值與三人稱跟隨是時間積分的，
   只呼叫一次 apply 會停在半路。解法＝大跳時多跑幾拍讓鏡頭收斂（演出時鐘契約）。
   修後跳過定格＝貼地落點特寫，與播完一致。

另兩處語意修正：**特寫段收掉頭上標籤**（`matchView.setTagsVisible`，預設 true＝賽中
零改變——回放是記憶不是 HUD）；**「你·」前綴與足下光圈標的是卷裡錄的玩家本人**，
不是鏡頭錨點（導播會把鏡頭錨到各種人身上，錨點跟著標「你」會把別人認成自己）。

## 4. §4 導播（`src/render/replayDirector.js`，純函式、node 可測）

`buildDirectorScript(tape)` → `{ shots:[{step, cam}], segments, skipTo, totalSteps, totalMs, touches, dead }`

| 段 | 鏡位 | 實作 |
|---|------|------|
| 發球 | 發球員背後中景 | rig `third` 錨發球員 |
| 飛行／接發 | 跟球廣角 | rig `third` 錨**下一個碰到球的人**（導播預知未來＝決定論腳本的特權） |
| 舉球 | 半場回望 | rig `sset` |
| 決定性一拍 | sig 三構圖依攻擊者位置（oh/mb/opp）＋慢動作 0.35× | rig `sig`，錨對面隊＝隔網看他 |
| 落點收尾 | 貼地低機位 | rig `sig` kind `line`（重用第四道招牌演出「邊線是我的」構圖） |

- **不新增第五模板**（沿 4.5B 矩陣紀律）；鏡位語彙全取自既有資產。
- **決定論**：切鏡點由 Intent 流的事件型別驅動（SERVE／TOUCH／BLOCK_TOUCH／DEAD_BALL），
  不吃時間隨機、不吃牆鐘抖動；測試背書＝同一卷兩次建腳本 `deepEqual`。
- **切鏡粒度裁量**：只有「最後一次攻擊性觸球」給特寫＋慢動作，之前的攻擊不給
  ——一顆球只有一個高潮（4.5B 砍「rally 終結鏡頭」時就立過的鏡頭噪音規矩）。
- 開場快帶：發球前保留 ≤90 步（1.5s）以 2.5× 播出，更早的直接快轉不計時。
  實測腳本（AI 對打樣本）：8 顆鏡頭、總長 12.2s。

## 5. §3 典藏牆四槽（資料層）

- 結構：`save.career.finalRally = { champion, rival:{ 屆數: 卷 } }`；
  `vaultOf()` 正規化，**舊存檔的單筆格式一律讀成空牆**（不寫回退相容層，但不報錯——憲法縫隙 4）。
- **上限恆為 4 筆、屆數即 key、永不覆寫**（同屆重打不覆蓋既有記憶）。
- 錄製掛點：`entry.opponentId === 'sky-hawk'` 即寫該屆槽（沿 4.5A `nationalLadderFor`
  的天鷹逐屆掛點：第 1 屆決賽／第 2 屆準決賽／第 3 屆決賽），**勝敗皆錄**；
  champion 維持「決賽勝利」語意不變。零新增 sim 事件型別。

## 6. §5 入口卡（`src/ui/replayVault.js`）

- 四格並排、空槽不出現、**四槽全空＝整張卡不出現**（顯示哲學：不給玩家看空欄）。
- 標籤：「冠軍點」「第 1 屆・決賽／敗」。點一格 → 重演 overlay（播放／暫停／跳過／關閉）
  → 關閉即回結算流程原位，**不自動插播**（拍板）。
- **§5-3 靜幀方案裁量＝純文字格（膠捲標籤樣式），不做離屏縮圖**。理由：四格各跑一次
  離屏渲染＝要建四次十二人場景，與 §2「離開典藏牆即拆」的 dispose 紀律直接打架，
  低階手機上是明確的記憶體風險；收益只是四張小靜圖。工單授權二選一，取此。

## 7. §6 小白事件二位置示意（`src/ui/chaseDiagram.js`）

- 靜態俯視半場圖、**SVG 手繪規格、零圖檔資產**（沿零模型檔／零音檔路線）；
  固定構圖不讀真實座標（沒有座標可讀——觸發源是賽末統計 `lbChase`/`lbWho`，
  不是那顆球的快照）。
- **讓出的區域＝空白亮區**（不是紅色警示，是「沒有人」）＋對手球落點打在亮區內；
  起點→撲救路徑（虛線）→落地點。
- 三版共用同一張圖：`court`（主體＝小白）／`mentor`（主體＝你）／
  `sideline`（場邊保底版改標多點落地痕——他數落地的球）。
- 通道：dialogPlay 新增 **line 級 `diagram` 宣告**（與既有 `cam`/`camOpts` 同層級）；
  靜圖無動畫，**reduced-motion 下照給**（它本來就不動）。

## 8. §7 準度可讀性半件（第二順位）

- 交付：①咬線得手時加半格資訊「🎯 甜蜜區——咬線 N cm」②出界時成因**歸給時機
  而非運氣**（「放太晚——手型跑掉了」／「早了半拍——還沒到最高點」／
  「時機是對的——線壓過頭了」）。**走既有字卡通道，不新增通道；零 sim diff。**
- 判準：`timingVerdict(t, TUNING)` 與 sim 的 `timingQualityMul` **同一組門檻**
  （顯示真值不是安慰話）。吃 Intent 的 `timing` 原值——TOUCH 事件的 `power` 已被
  超蓄夾到 0.85，分不出「放太晚」與「甜蜜區」（測試背書）。
- **砍項紀錄：「被救起」的字卡不做。** 出界那條已把「成因歸時機」講完；被救起要出卡
  的頻率會逼近每球一張，與 4.5B「字卡減量／鏡頭噪音」拍板衝突。工單授權砍項，記錄在此。

## 9. 驗收清單逐條（工單 §9）

1. ✅ **§3-0 探針數據落快照**（§1）；超出預算 → 已依條款停手回報 → Sawmah 裁定改格式。
2. ✅ `npm test` **593／0 fail**（574＋19、只增不減）；`vite build` 綠。新測項涵蓋：
   重演逐格一致（Intent 流＋事件流＋終態，且同卷兩次一致）、**導播決定論**
   （腳本 `deepEqual`）、四槽讀寫／永不覆寫／空槽行為、入口卡空資料不出現、
   舊存檔讀成空牆、等哨截斷、v2 容量守門（單筆 <200KB）。
3. ✅ **決定論不破**：重演層零 sim 寫入（架構論證＋「原始 game 不被重演器碰到」測試）；
   既有決定論測試全綠。
4. ✅ **sim 純核心**：`git diff 45c37d2..HEAD -- src/sim/`＝**空**；零 sim 參數改動。
5. ⏳ **真機三段 FPS**：本機（桌機 165Hz 螢幕、Chrome）實測
   **進重演前 166／重演中 162／退出後 166**，重演中掉幀 <3%、退出後完全回復
   （dispose 無殘留）。**真機那一份仍待 Sawmah 手機**——非閘門。
   35FPS 懸案定位線索：重演舞台**不是**病灶候選（第二套 renderer 全開仍近乎滿幀）。
6. ✅ **憲法 Q7 關卷紀錄**：五位置（OH/S/MB/OPP/L）版本級全開含 L；縫隙 2「L 設計先行」
   護欄已履行（4.5B diegetic 暗號手勢＝L 玩法實體）。後續手感/平衡調整走滾動追修，
   **不再是任何一輪的結案閘門**。
7. ✅ **平衡帶不校準**；觸發條件寫進滾動清單（§11）。
8. ✅ 退化路徑實測：reduced-motion → 文字紀錄卡（實跑取到卡片全文），console 0 錯誤。
9. ✅ `tests/naming.test.mjs` 綠（新增字卡文案含在全套內）。
10. ✅ 本快照＋commit＋`npm run deploy:pages`。

## 10. 裁量點如實記錄

1. **模組重用範圍**（§3）：主賽場四模組直接吃，另建只有舞台外殼與燈光。
2. **靜幀方案**（§6）：純文字格（膠捲標籤），不做離屏縮圖——理由見 §6。
3. **導播切鏡粒度**（§4）：每次擊球即切、錨在下一個觸球者；特寫只給最後一拍。
4. **示意圖繪製方式**（§7）：SVG 程式繪製、零資產、固定構圖。
5. **砍項**（§8）：「被救起」字卡不做。
6. **`pullback` 是新增的表現層欄位**——不是新鏡位模板：構圖仍是既有 sig/sset/third，
   只是舞台把相機沿視線後退。矩陣紀律不破。
7. **重演不顯示比分/HUD**：舞台只有球場與人。回放是記憶，不是轉播。
8. **等哨截斷 60 tick** 是實跑後定的保護值（§2），非工單指定；改動只影響錄製長度，
   不影響重演契約（測試比對真實流的尾段）。

## 11. 滾動試玩清單（4.5B §11 滾動＋本輪新增）

- **優先級 0**：真機 60 FPS 復測（含**進重演舞台**這個新場景組合）；35FPS 懸案仍未定位
  （本輪已排除重演舞台）。
- **平衡帶校準觸發條件（原文照抄，不得回拉舊錨）**：
  > 校準觸發＝Sawmah 完整實玩**三屆**後，體感明確落在「決賽太容易」或「奪冠太難」之一。
  > 體感不成立則不動，**治具數字本身不構成校準理由**。
  （現值 29% 決賽帶／5% 奪冠＝兩筆卡死修復後第一次拿到的真實力帶；舊 23% 摻著
  「球員卡死＝表現折損」。）
- **本輪新增**：
  - 重演舞台的暗場亮度／鏡頭節奏（12s 一顆球會不會太長）／慢動作倍率體感
  - 典藏牆入口卡的四格版面（手機寬度）與「膠捲標籤」夠不夠像回放入口
  - 小白事件二示意圖的可讀性（三版共用一張圖是否成立）
  - §7 兩張字卡的頻率與措辭（出界那張會不會太常出現）
- **4.5B 滾動未銷**：S/L diegetic 手感／招牌演出頻率／劇情 beat 舞台／huddle 節奏／
  生涯結算開場序列（仍未經三屆末存檔實跑）／五局體力體感等。

## 12. 檔案清單

- 新增：`src/app/rallyTape.js`、`src/render/replayStage.js`、`src/render/replayDirector.js`、
  `src/ui/replayVault.js`、`src/ui/chaseDiagram.js`、`tools/replay-size-probe.mjs`；
  tests：`rally-tape`、`replay-director`、`replay-vault`
- 修改：`matchLoop.js`（v2 錄製接線／播放路徑／四槽掛點／§7 字卡）、
  `careerStore.js`（`vaultOf`＋四槽 API）、`careerScreen.js`（入口卡＋`diagram` 通道）、
  `matchView.js`（`setTagsVisible`）、`signatureBeats.js`（`timingVerdict`）、
  `n2Arc.js`（三版 diagram 宣告）；tests：`finale`、`n2-arc`、`signature-beats`
- **未動**：`src/sim/`（零 diff）、`scoutTape.js`（舊格式卷由重演器相容播放）

## 13. 下一步（Phase 5 kickoff）

1. **Sawmah 試玩**：典藏牆入口卡→重演舞台全鏈（需三屆末存檔或注入存檔）＋真機 FPS。
2. **Phase 5 kickoff 討論題**：①攻擊瞄準點／描線機制本體（①區內二段微調／②長按拉條
   ——動 sim 決策面，需重跑平衡治具）②位置開放節奏（Q7 已關卷，轉為手感追修）
   ③多人連線前置——**Intent 唯一輸入＋v2 卷格式已是天然的網路封包雛形**
   （只錄玩家 Intent＋AI 重算＝與連線的「輸入同步」模型同構，本輪順手把地基打了）。
3. 滾動追修：§11 清單。
