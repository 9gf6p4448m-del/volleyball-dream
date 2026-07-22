# Phase 3 W1 — 技術債清償與存檔 Schema v2（狀態快照）

> 2026-07-22/23 執行。基準：Phase 2 結案 commit 3b84adb（`docs/phase2-final-status.md`）。
> 勘誤：W1 任務書寫「86 個既有測試」為過時數字——Phase 2 結案實際為 **160 測綠**，
> 本週結束為 **173 測綠**（+6 拆分契約、+7 schema v2）。

## 任務 1 — main.js runMatch 拆分 ✅

### 拆分後模組結構

```
main.js（787→150 行：入口路由＋三段編排的薄膠水）
 └─ runMatch(ctx, careerCtx)
     ├─ 賽前準備 src/app/matchConfig.js   resolveMatchConfig()／resolveTechGates()
     │   （純函式：種子優先序/短局夾限/生涯建隊/自由人/情蒐帶預生成/技術閘門——node 可測）
     ├─ 賽前準備 src/app/matchStage.js    buildMatchStage()
     │   （three.js 視圖＋DOM UI 集中建置；stage.handlers＝迴圈唯一注入點）
     ├─ 回合迴圈 src/app/matchLoop.js     startMatchLoop()
     │   （顯式 loop state 物件 `s`；rAF 幀流程拆為 updateDecisions/stepSim/
     │     applyEvents/updateAssistAndPoses/settleIfOver/updateDiveButton）
     └─ 賽末收束 src/app/matchCareer.js   markMatchStarted()／settleCareerMatch()／careerReturnUrl()
         （開賽 pending 標記＋局終結果落檔＋返回網址——store 可注入，node 可測）
```

三段之間只以 `config → gates → stage → loop` 資料介面銜接；唯一後綁定點是
`stage.handlers`（回放/魚躍按鈕的行為由迴圈開機時填入），無隱式共用可變狀態。

### 驗收證據

| 驗收項 | 結果 |
|---|---|
| 既有測試 | 173 全綠（含新增 6 條介面契約測試 `tests/app-match.test.mjs`） |
| 固定種子重演 | seed 777／4242 拆分前後**事件流 SHA-256 逐位元一致**（見下） |
| 單一函式 ≤200 行 | 最大函式 `updateDecisions` 90 行（原 runMatch 660 行） |

**決定論 A/B 治具**：`?autopilot=1`（保留為常設治具）——零輸入＋只代發球
（唯一會等輸入的環節），發球決策鎖 `game.tick` 不碰牆鐘；sim 只有 spike 讀取
gaze 欺敵、發球不讀，故鏡頭牆鐘不污染事件流。量測 URL
`?quick=1&seed=N&points=5&autopilot=1`，雜湊對象＝`{events, score, winner, finalTick}`。

| 種子 | 拆分前（3b84adb＋治具） | 拆分後（f5b3929） |
|---|---|---|
| 777 | `7880eaa4c704…`（B 勝 5:3，4090 tick） | **同雜湊** |
| 4242 | `6a77ea433bc0…`（B 勝 5:2） | **同雜湊** |
| 777 同建置重跑 | 兩趟一致（治具穩定性對照組） | — |

生涯模式接線另以瀏覽器實測：出戰→賽前劇情對話→情蒐帶 3 卷播放、
`pendingMatch` 落檔、鐵霧建隊正確。

## 任務 2 — geoCharacter InstancedMesh ✅

**改法**：每種幾何一個 InstancedMesh 池（10 池，全場 14 名球員共用），關節階層降級
為不可見 Object3D 骨架、逐幀寫 matrixWorld 進池；`geoAnimator` 零改動；膚/髮/隊色/
自由人異色改 instanceColor（白基底乘色，同 arena 觀眾席手法）。池停用 frustumCulled
（單一 base geometry 的包圍球抓不到全場跨距會誤剔）→ triangles 98,034→123,472
（+26%，低面數幾何 GPU 負擔輕；換 CPU 提交開銷大降——手機瓶頸正是 draw calls）。

### draw calls／FPS 前後對照

| 條件 | 改前 | 改後 |
|---|---|---|
| 桌機 rally（`?quick=1&seed=777&points=25&autopilot=1`，載入+8s） | calls **123** | calls **48**（死球特效高峰 62）|
| 桌機 FPS（同上） | 165（vsync 頂） | 165（vsync 頂，無退步） |
| 手機模擬 rally（4× CPU 節流、844×390、dpr 3、mobile+touch+landscape） | calls **198**、**55 FPS**、p95 幀時 24.3ms、最差 30.4ms | calls **79-81**、**82-87 FPS**（兩次量測）、p95 幀時 ~18.1ms |

（歷史記錄的「213/225 draw calls」是局終/慶祝畫面的數字——鏡頭與特效狀態不同，
本表一律用同條件同時點對照。）

### 手機 60 FPS 硬底線——如實聲明

- **模擬量測**（chrome-devtools CPU 4× 節流＋手機視窗，近似中階手機）：改前平均
  55 FPS **不及格**；改後平均 82-87 FPS、超出 60 預算的幀約 10%（p95 18.1ms＝
  60Hz 手機上偶發掉一個 vsync）——大幅越線
- **真機實測無法由本環境執行**（Sawmah 的手機不在迴路內；先前該機截圖曾見 37 FPS）。
  部署已上線，**請 Sawmah 真機開一場看左上 FPS 角標回報**——這是本項驗收的最後一哩，
  不以模擬數據冒充真機達標

## 任務 3 — bundle 分割 ✅

| 項目 | 改前 | 改後 |
|---|---|---|
| JS chunk | 單一 `index` **736.27 KB**（gzip 203.92）| `three` 611.90（gzip 156.36）＋`ui`(含 career) 54.37（gzip 20.37）＋`index`(render/app/input) 51.93（gzip 20.83）＋`sim` 27.40（gzip 10.71）|
| PWA 預快取 | 12 entries／770.00 KiB | 15 entries／779.57 KiB（+1.2%，涵蓋全部 chunk） |
| 首屏（SW 清除後 localhost） | DCL 98ms／load 264ms | DCL 103ms／load 274ms（雜訊範圍） |
| 離線 | — | SW cache 實測含全部 6 個 JS chunk（generateSW 預快取機制不變） |

動機＝快取粒度：高頻部署下改 UI/邏輯不再讓玩家重抓 611KB 的 three。全部 chunk
仍是首屏靜態 import＋vite modulepreload（實測 preload link 就位），無載入瀑布。
`soldier.glb` 維持僅 `?mode=bench` 按需載入不預快取。

## 任務 4 — 存檔 Schema v2 ✅

### 完整結構（`src/career/schema.js`，含欄位註解）

```js
{
  schemaVersion: 2,
  player: { ... },   // 主角——沿用既有 serializePlayer 格式（sim/player.js 定義）
  roster: {          // W2 填入。依 kickoff 拍板：名冊上限 10、隊友自動成長
    capacity: 10,
    members: [],     // { id, name, origin(來源隊|'starter'), role, attributes,
  },                 //   growth(成長曲線), dna(原隊參數 DNA 標記) }
  recruitment: {     // W4 填入。依拍板：每隊 1 名招牌球員、條件跨賽季累積
    progress: {},    // progress[opponentId] ＝ 條件進度（跨賽季不清零）
    recruited: [],   // 已入隊球員 id
  },
  lineup: {          // W3 填入（啟用 FIVB 7.7 驗證器）
    starters: null,  // 6 人輪轉序；null＝未排（沿用預設陣容）
    libero: null,    // 自由人 id
    rotationStart: 0,// 輪轉起點（0-5）
  },
  season: {          // W5 接賽季輪迴。現行生涯資料歸戶於此
    index: 1,        // 賽季序號（線性多賽季遞增）
    seed, playerName, schedule, results,
    growthPoints,    // 未分配成長點（W5 輪迴時裁決 carryover）
    scouting: {},    // 宿敵記憶（per 對手 id；跨賽季累積）
    pendingMatch?,   // 棄賽標記（選填鍵；完賽即刪）
  },
  career: {},        // Phase 4 預留——本週不定內容
  story: {},         // Phase 4 預留——本週不定內容
}
```

**設計註記**：任務書把 careerStage 列在 season 欄位，但 Phase 2 已拍板
「careerStage 由 results 衍生、不存欄位」（防狀態不同步）——schema v2 維持衍生，
於此如實記錄偏差與理由。

### 遷移機制（4.2）

- `migrate(save, fromVersion, table)`：鏈式版本分派骨架，缺步驟擲
  `IncompatibleSaveError`；`MIGRATIONS` 表本週刻意為空（v1 無路徑）
- **v1（Phase 2 雙 key）＝不相容**：`createCareerStore` 建構時偵測
  `vd-career-v1`/`vd-career-player-v1` → 清空＋旗標，生涯主選單顯示
  「Phase 2 存檔不相容，已重置」；已有 v2 檔時舊 key 視為殘留靜默清除
- 較新版本（schemaVersion > 2）明確拒收

### 存取層（4.3）

- 單一 key `vd-save`；localStorage 封裝留在 `src/career/careerStore.js`
  （表現層側；`src/sim` 純度測試持續把關零存取）
- API 維持 Phase 2 形狀（loadCareer/savePlayer…）＝W1 過渡刀口最小；
  read-modify-write 保證 W2+ 填入的 roster/lineup/season.index 不被舊路徑蓋掉
- 匯出/匯入改整包 v2 格式；Phase 2 匯出檔（雙物件形）明確拒收；
  壞檔（壞 JSON/缺鍵）讀取一律安全降級 null 不白屏

### 驗收證據

`tests/schema-v2.test.mjs` 7 條：骨架結構／careerView roundtrip 恆等（含
scouting/pendingMatch 選填鍵）／migrate 分派（v1 擲錯、注入表鏈式可走）／
deserializeSave 嚴格驗證／v1 偵測清空兩情境／RMW 不回退／匯出匯入 roundtrip
＋兩類拒收。另 `tests/career.test.mjs` store 段更新為 v2 規格。

## 範圍外確認

名冊/招募/編排/賽季功能邏輯零實作（schema 只有空結構）；`career`/`story`
內容未猜測；sim 核心零改動（決定論測試與純度測試全綠）。

## commit 對照

| 任務 | commit |
|---|---|
| 任務 1 拆分＋autopilot 治具 | f5b3929 |
| 任務 4 schema v2 | 60f7aa5 |
| 任務 2 InstancedMesh | 9d109dd |
| 任務 3 bundle 分割 | 861f4f1 |

## 瀏覽器整合實測（部署前最終輪）

- schema v2 舊檔重置：帶 Phase 2 舊 key 的瀏覽器開生涯 → 「Phase 2 存檔不相容，
  已重置」提示顯示、雙舊 key 清空、繼續生涯鈕消失 ✅
- 新生涯 → `vd-save` 落地 schemaVersion 2、8 頂層鍵齊備、roster.capacity 10、
  season.index 1、career/story 空物件 ✅
- 出戰 → 賽前劇情對話 → 情蒐帶 3 卷 → `season.pendingMatch='group-1'` 寫入 v2 ✅
- 拆分後生涯開賽（鐵霧建隊/劇情/情蒐帶）與快速比賽決定論皆實測 ✅

## 遺留與下一步

- **待 Sawmah**：真機 FPS 回報（上）；W2（名冊具名化）開工指示
- 技術債帳面上仍未清：事件監聽零 dispose（現靠整頁重載擋住，Phase 2 已知項，
  本週範圍外）；決賽平衡終調（W6）
