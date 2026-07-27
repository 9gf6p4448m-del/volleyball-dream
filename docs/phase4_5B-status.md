# Phase 4.5B 結案快照 — 演出輪（招牌演出＋diegetic 介面＋儀式 B＋＋huddle 3D）

> 2026-07-27 結案。工單＝4.5B implementation prompt（Claude.ai 規劃會議產出、Sawmah 逐題拍板）。
> 基準 main@42bc5ff（546 測綠）→ 結案 **568 測綠（+22，只增不減）**、vite build 綠。
> 憲法＝`phase4-decisions-RESOLVED.md` 全程沿用；**sim 純核心整輪零 diff（git diff 實證）**、
> 零 sim 數值參數改動。驗證＝node:test 全套＋Playwright 對 dev/preview 實跑
> （S/L diegetic 全鏈、bo3 局間 huddle 過場全鏈、beatStage 七變體實渲染、sig 三構圖），
> 全程 console 0 錯誤 0 警告。
> **⏳ 唯一未關驗收＝§10-1 真機 60 FPS 復測（需 Sawmah 手機）**，見 §9。

> 編號規則：表格「區塊」欄的 §N＝**工單章節號**；內文「見 §N 節」＝**本檔節次**。
> 外部代號（追加條 B／拍板 2a/2b／憲法 Qn／W4 §8-8／B-5 等）沿快照系列慣例，
> 定義在工單與 `phase4-decisions-RESOLVED.md`／W 系列快照，本檔不重抄。

## 0. 交付總表（工單 §1 順序）

| # | 區塊 | 狀態 | 落點 |
|---|------|------|------|
| 1 | §2 演出地基：四鏡位模板＋獨立 rAF 演出時鐘＋頻率框架 | ✅ | `cameraRig.beatShot`／`ui/presentation.js`（新）／`render/beatStage.js`（新）／careerStore seenSignature |
| 2 | §3 招牌演出 OH/MB/OPP | ✅ | `ui/signatureBeats.js`（新）＋matchLoop 接線＋rig 'sig' 三構圖 |
| 3 | §4 diegetic 介面 S/L | ✅ | `render/diegeticUi.js`（新）／`ui/diegeticItems.js`（新）／rig 'sset'／`?panel=classic` 退路 |
| 4 | §5 儀式 B＋ | ✅ | careerScreen 結算開場序列／careerFinale 兩段遞進／heightRitual 刻痕；來投開箱 diff＝0 |
| 5 | §6 四個專屬 beat＋模板消費 | ✅ | rivalArc/n2Arc/positionEvents camera 宣告＋beatStage confess/BEAT_POSES/thud |
| 6 | §7 huddle 3D 圍攏過場 | ✅ | matchLoop showSetBreak 序列＋matchView.setBreakHuddle（凍結相容） |
| 7 | §8 骨架細版＋小件 | ✅（砍 1 小件） | geoAnimator blockLoad/windupHesitant＋matchView 魚躍塵土 |
| 8 | §9 4.5A 追修窗 | 未動用 | 試玩回饋尚未進來——窗保留，見本檔 §8 節 |

## 1. §2 演出地基——介面文件（Phase 5 劇情輪直接吃）

### 1-1 四鏡位模板（`cameraRig.js`）

`beatShot(name, opts) → { cam, look, fov, lighting } | null`（純函式、plain object）。
舞台空間約定：網帶 z=0、對方 z=-1.4 面向鏡頭、玩家 z=+1.4 背對鏡頭。

| 模板 | opts | 語意 |
|------|------|------|
| `confront` | `angle:'level'│'up'│'down'` | 對峙：平視（鏡子）／仰角（牆）／俯視（他量你） |
| `exit` | — | 離場：定機位、主體走離（dusk 剪影＋隊伍餘影） |
| `rimlight-solo` | — | 單人邊光（rim 燈光預設） |
| `stands` | — | 看台遠景（止步旁觀／頒獎台） |

### 1-2 劇情 beat 舞台（`render/beatStage.js`，ritualStage 範式）

`createBeatStage({ template, opts }) → { el, dispose }`；WebGL 失敗＝throw，呼叫端退化純對話卡。
**語意化 opts（career 層只宣告語意、幾何在表現層收斂）**：
`playerHeightM/rivalHeightM`（confront 身高）、`formation:'trio'`（三人並排變體）、
`heightM/role/subjectId/teamId`（單人模板主體）、`pose:'wipe'│'fist'│'knee'`（專屬姿勢）、
`sink`（下沉 m，跪姿用）、`lighting:'confess'`（覆蓋模板燈光——坦白光帶）、`sound:'thud'`
（WebAudio 合成悶響，零音檔）。

### 1-3 事件宣告（dialogPlay schema）

事件級 `e.camera`/`e.cameraOpts`；**line 級 `line.cam`/`line.camOpts` 優先**（段落內換鏡位
——幕三坦白/馬振羽句同一事件不同鏡）。無宣告＝純對話卡；reduced-motion＝一律純卡。

### 1-4 演出時鐘（`ui/presentation.js`）

- `createBeatTimeline(steps)`：steps=[{dur, apply(t)}]，**apply 必須絕對式**；
  `finish()`＝跳過＝每步定格 t=1，與播完終態逐值一致（測試背書）。
- `driveTimeline(tl, {onDone})`：牆鐘 rAF 驅動（sim 凍結相容——tour 既有範式）；回 `{stop, skip}`。
- 消費者：生涯結算開場（§5）、huddle 過場（§7）。

### 1-5 頻率框架（拍板 2a）

`signatureMode({pref, seen, keyPoint})` → off／full／short（≤1.5s＝`SHORT_BEAT_MS`）。
決定論：關鍵分（`isSetPoint`——局點判定含 deuce，賽點⊂局點）恆 full；敘事第一次 full；其餘 short。
「首次」計數：`careerStore.loadSeenSignatures/markSignatureSeen` →
`save.career.presentation.seenSignature`（career 自由區慣例；舊存檔無此欄＝未看過）。
開關：生涯主選單 🎬 鈕（localStorage `vd-presentation` 全域鍵）；
**off 不吃真值資訊**：🎭/封到/我來！/pointBanner 等字卡通道不經此框架（§6 核對見下）。

## 2. §3 招牌演出

- 純函式核心 `ui/signatureBeats.js`：武裝（成因）→ 對手救起/SERVE 解除 → **只在我方 SCORE 起鏡**
  ＝追加條 B 主角視角條款的機械化（測試背書：rally 中任何事件不得起鏡；SERVE 必清演出窗）。
- 成因偵測：OH＝sim `BLOCK_DECEIVED`（spikerId=玩家）；MB＝搶快 commit＋`BLOCK_TOUCH`；
  OPP＝要球喊聲後本人 spike（callLive 旗標）。
- 鏡位（rig 'sig' 模式）：OH 近網隔網特寫被騙攔網手／MB 網帶上方俯視對面攻擊手
  （OH 俯衝/L 貼地/MB 靜止三角）／OPP 低機位框 OPP+S **專屬擊掌**（highfive pose 重用）。
- 慢動作＝重用既有 slowUntil 機構（0.35×＋FOV 收緊）；full 時長 oh/mb/opp＝
  2600/2400/2600ms、short 一律 1500ms（SHORT_BEAT_MS）。

## 3. §4 diegetic 介面（拍板 2b：取代舊面板）

- **S「全場等你的一秒」**：分配窗＝rig 'sset' 掃場（自 S 視線回望自家半場）＋熱點錨在
  隊友模型投影（光圈亮起、點模型＝分配；二次球錨自己）；高 trust 者 wave 揮手＋喊聲。
- **B-5 L「暗號手勢」**：☝️封直線/✌️封斜線/✊收吊球 錨在自己背後腰位；建議◎＋1 秒自動
  照建議（A2 節奏資產原地不動）；選定＝前排 MB nod 點頭確認。
- 指令路徑與舊面板**逐字同一條**（pickSet/pickDig 共用 handler）；真值保留：一傳品質標題、
  猶豫標註、B-6 markText。攻擊/MB/發球面板不動。
- `?panel=classic`＝matchStage 不建 diegetic → 全走舊面板（實測通過；非玩家可見選項）。

### 3-1 decision latency（硬性驗收數據）

量測法：`latencyStats`（窗開→指令送出 ms；窗外殘留點擊不記樣本）＋機械 bot 同判準
（偵測到目標即刻 tap；量的是系統側就緒耗時，人因項＝Sawmah 試玩終裁）：

| 介面 | S | L |
|------|---|---|
| diegetic | **23ms** | **21ms** |
| classic 面板 | 30ms | —（同幀出現，結構同 S） |

系統側持平（差異在輪詢抖動內）；結構論證：tap 數同為 1、熱點 58px ≥ 面板鈕。
**未達標砍規格條款仍掛著**：若 Sawmah 試玩體感劣於面板，砍演出規格、不回退雙面板並存。

## 4. §5 儀式 B＋

1. **生涯結算＝全遊戲唯一上限規格**：開場暗場→主角 ritualStage 聚光→三屆戰績/數據/招募/
   典藏逐張點亮（對標 tour「逐盞亮」語彙）；演出時鐘驅動、恆可跳過、reduced-motion/WebGL 失敗定格。
2. **畢業第 3 屆主角版＝三年遞進**：`finaleRitualSegments` 帶 `heightStartM`（timeline 首項＝
   一年級身高）＝兩段逐位聚光——先「三年前走進體育館的你」（矮的模型＋新台詞兩句）再現在的你；
   同一套架構零新機制；無成長＝單段（舊測試零改動）。第 1、2 屆送學長維持現狀。
3. **身高儀式刻痕**：尺上留歷屆刻痕＋「N屆」標（timeline 資料源）；兼幕三長高變體
   「比對三年前的尺」視覺。
4. **來投開箱 diff＝0**（git 實證）。

## 5. §6 專屬 beat＋模板消費（4.5A 劇情演出需求全接）

| 需求 | 交付 |
|------|------|
| 幕三坦白燈光帶（專屬#1） | ACT3_CONFESS/CLOSE/GROWN 段 line 級 `lighting:'confess'`（場館燈滅、兩人光帶） |
| 幕二斷句 beat（專屬#2） | 勝版 rimlight-solo＋`pose:'wipe'` 擦汗；敗版 `pose:'fist'` 握拳盯手心 |
| 幕一隔網注視（專屬#3） | ACT1_PRE confront：牆版 `down` 俯視（他量你）/鏡子版 `level` 平視 |
| 小白膝蓋著地（專屬#4） | 「膝蓋碰得到地」句 knee 姿勢＋sink＋WebAudio thud（零音檔維持） |
| 幕一賽後轉身離場 | exit 模板（隊伍剪影） |
| 幕三賽前對峙 | confront（鏡 level/牆 up；首遇版 level＝4.5A 裁量 6 矩陣紀律沿用） |
| 馬振羽一句 | rimlight-solo（隊伍末端邊光；三處同句同宣告） |
| 止步旁觀三幕＋頒獎台 | stands（事件級宣告） |
| 三人版轉位並排 | confront `formation:'trio'`（不新增第五模板） |

**明確不做（照工單）**：小白事件二位置示意（回放引擎已落 4.6）。

## 6. §7 huddle 3D 圍攏過場

- 3D 段 ≤4s：三人稱聚攏（0.55）→鏡頭進圈（W8 圈內鏡位重用）→定格為卡片背景；
  首次 3.8s／之後 2s（presentation seen 'huddle3d'）；恆可點擊跳過；off/reduced-motion＝直接卡片。
- **比分/教練指示/存檔離開全留 DOM**（3D 不吞退出權——憲法 Q8）。
- 工程解：`matchView.setBreakHuddle(team, w)`＝外部進度直接定圍圈權重（牆鐘演出時鐘）
  ——**解掉 W4 §8-8「sim 凍結下 tick 制圍圈管線不可用」遺留**；暫停圍圈 tick 路徑零改動。
- Playwright bo3 實跑全鏈：聚攏→huddle 鏡位→▶第2局→續局歸位（serve/setIndex 2/旗標全清）。

## 7. §8 骨架細版＋小件（第二順位）

- 攔網重量感：block 序列插 blockLoad 蹲載入拍（蹲→蹬→滯空→落地；dur 0.7 實測值不動）。
- 助跑遲疑/果斷：低 trust 快攻＝windupHesitant（抬手一半、跳矮半檔）；門檻同 SET_HESITANT_BELOW。
- 魚躍塵土粒子：落地沿 DEAD_BALL 塵土管線。
- **砍項紀錄：rally 終結鏡頭（切玩家握拳）**——與 §3 招牌演出、FOV punch、慶祝姿勢三者
  語彙重疊＝鏡頭噪音（Sawmah 字卡減量哲學同理外推），砍除；如需另議滾動清單。

## 8. §9 4.5A 追修窗

本輪內建的追修窗**未動用**（4.5A 劇情輪試玩回饋尚未進來）。窗仍開：回饋進來時就地追修
（優先序高於 §8 的量能已自然釋出）。

## 9. 驗收清單逐條（工單 §10）

1. **60 FPS 硬閘門＝⏳唯一未關**：需 Sawmah 真機（冠軍館滿場景＋招牌演出全開＋huddle 過場）。
   降規把手備妥：演出短版化（🎬 off／頻率框架天然短版）→ 粒子 → attendance → 上層看台
   （W4 既有 URL 參數），降規只走 URL 參數。本機 Playwright 全程流暢、console 0 錯誤。
2. ✅ `npm test` 568／0 fail（546＋22 只增不減）；build 綠。新測試：presentation(7)／
   signature-beats(5)／diegetic-items(3)／beat-wiring(6)／finale 遞進(1)。
3. ✅ 決定論三態：演出層零 sim 寫入（成立於架構——presentation 不進 Intent/rand 路徑）；
   既有決定論測試（bo1 零擾動/match-sets/重現性）全綠。
4. ✅ sim 純核心：`git diff 42bc5ff..HEAD -- src/sim/`＝**空**；零 sim 參數改動。
5. ✅ 主角視角條款：起鏡只認 SCORE、SERVE 必清（tests/signature-beats 背書）。
6. ✅ off 真值不落空：🎭晃過攔網（heroCards）／封到了！・時機字卡（MB）／「我來！」＋S 回頭
   ＋pointBanner（OPP）皆在頻率框架之外的獨立通道，off 不觸及（逐項核對）。
7. ✅ latency 數據（§3-1）；試玩終裁條款掛著。
8. ✅ huddle：≤4s/可跳過/按鈕留 DOM/凍結下正常播（實跑）。
9. ✅ 儀式 B＋四項（§4）；來投 diff=0。
10. ✅ naming.test 綠（新增台詞：教練「那時的你，就這麼高」等，全套內含）。
11. ✅ 本快照＋commit＋deploy:pages。

## 10. 裁量點如實記錄

> 本節條目（含 9/10 的未實跑/未做項）＝裁量與範圍紀錄，**不計入驗收閘門**——
> 唯一未關驗收恆為真機 60 FPS（本檔 §9 節第 1 條）。

1. **四鏡位模板的落點**：工單寫「cameraRig.js 擴充」——組成函式（beatShot）確落 cameraRig；
   但劇情事件播在 careerScreen DOM 層、主賽場 rig 不在場，故渲染另建 `beatStage.js`
   （ritualStage 範式獨立小場景）。模板純函式可複用於任何舞台＝工單意圖成立。
2. **快速比賽的「首次」計數**＝session 記憶（無槽可落）；生涯＝store 跨屆持久。
3. **演出偏好＝全域 localStorage 單鍵**（非逐槽）：off 是玩家的裝置級選擇。
4. **MB「滯空等球」**：以得分後俯視慢動作交付（回放性質的一拍）——不回捲 sim 重演
   攔網瞬間（追加條 B：起鏡恆在勝負已定後）。OPP「助跑全程跟拍」同理改為得手後
   低機位擊掌 beat（助跑段＝操作中，恆玩家視角）。
5. **L 手勢＝螢幕錨定手勢字形**（☝️✌️✊ 錨在背後腰位投影）——幾何模型無手指，
   3D 手 prop 不做；「鏡頭帶背後的手」語意由錨位＋字形承擔，體感歸試玩。
6. **latency 量測**＝機械 bot 系統側下限＋結構論證（§3-1）；人因終裁＝試玩。
7. **dusk 亮度**經像素採樣校正（0.3/0.55→0.5/0.9；81→721 lit px）——剪影要「看得見的暗」。
8. **駐留 VM 低幀率下演出等比放慢**（driveTimeline dt 上限 100ms/幀）＝安全設計非 bug；
   真機 60fps 無此事。
9. **生涯結算開場序列未經瀏覽器實跑**（需三屆末存檔）——構件（timeline/ritualStage）
   各自驗訖；列試玩批次優先項。
10. **§6 幕二賽前「bo3 重量感」**（燈光壓暗/聲浪先靜後起）不在工單 §6 四專屬清單內，未做
    ——局點張力燈光（lights.setTension）與 bo3 標記既有；如要專屬版另議。

## 11. 滾動試玩批次清單（W4 §11 滾動＋本輪新增）

- **優先級 0｜本輪硬閘門**：真機 60 FPS 復測（§9-1 場景組合）；未達標依降規序走 URL 參數。
- **優先級 1｜本輪新增**：
  - S/L diegetic 手感與 decision latency 體感（劣於面板＝砍演出規格）
  - 招牌演出三道的頻率體感（full/short 節奏、off 開關）；OPP 擊掌重用 highfive 夠不夠專屬
  - 劇情 beat 舞台（幕一注視/幕三坦白光帶/馬振羽邊光/止步 stands/膝蓋 thud 音量）
  - huddle 3D 過場節奏（3.8s/2s 檔位）；生涯結算開場序列（未實跑項）
  - 身高刻痕/畢業三年遞進的體感
- **優先級 1｜W4 滾動未銷**：五局體力體感／二次球頻率／要球 0.8s 窗／請調語氣／
  L 封線影子可讀性（宿敵 ace 反讀體感）／選檔頁等手機版面
- **優先級 2**：冠軍館燈光秀精緻度／雙人畢業節奏（本體已上線）
- **優先級 3**：heights 巨人體感/190 攔網複驗（沿 W3）

## 12. 檔案清單

- 新增：`src/ui/presentation.js`、`src/ui/signatureBeats.js`、`src/ui/diegeticItems.js`、
  `src/render/beatStage.js`、`src/render/diegeticUi.js`；
  tests：`presentation`、`signature-beats`、`diegetic-items`、`beat-wiring`（4 檔）
- 修改：`cameraRig.js`（beatShot＋sig/sset 模式）、`matchLoop.js`（招牌演出/diegetic/
  huddle 過場/latency/presentation ctx）、`matchStage.js`（diegetic 建構）、`matchView.js`
  （setBreakHuddle＋魚躍塵土）、`geoAnimator.js`（wave/nod/blockLoad/windupHesitant）、
  `careerScreen.js`（dialogPlay camera＋結算開場＋🎬 開關）、`careerStore.js`（seenSignature）、
  `careerFinale.js`（兩段遞進）、`heightRitual.js`（刻痕）、`rivalArc.js`/`n2Arc.js`/
  `positionEvents.js`（camera 宣告）、`heroCards.js` 未動、`recruitment.js` 未動

## 13. 下一步

1. **Sawmah 試玩終審**：本輪全部演出＋4.5A 劇情（追修窗就地消化）＋真機 60 FPS 硬閘門。
2. **4.6 回放引擎**（明確落界）：結算頁 three 重演舞台——完整球場＋六人＋球、Intent 流驅動
   animator、重演鏡頭導播；資料底（`save.career.finalRally`）已在等。連帶：小白事件二位置示意、
   宿敵之戰回放收藏。
3. **Phase 5 位置驗證開放節奏**：Q7 開放閘備料已齊（五位置玩法＋招牌演出＝手感即演出）；
   逐位置經試玩驗證後走教練談話轉位事件解鎖。
