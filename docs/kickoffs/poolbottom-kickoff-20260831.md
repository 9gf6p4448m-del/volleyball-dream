# 池底卷 kickoff＋驗收凍結（2026-08-31）

開卷基準：main `3ccbd3a`（2438 綠、sim-hash `7dedc192cd2ba84d`）。
範圍＝Sawmah 08-31 四題全裁（照建議）：P1 照片模式（暫停＋重播雙入口）／P2 完整擦地員／
P3 聯盟全員數據埋點（榜 UI 下卷）／P4 局點 vs 賽點分兩級。

## 鐵則（全卷，同大作感四卷）

- `src/sim/` 零檔案改動；sim-hash 逐值同基準（不得 `--write`）。
- 演出/UI 常數標【試玩必調】；崩潰自我停用不致死；觸控優先（Sawmah 永遠用手機試玩）。

## P1 照片模式

**裁定映射（如實記錄）**：遊戲無「暫停選單」（⏱ 為排球暫停非遊戲 pause），裁定的
「暫停入口」映射為＝比賽按鈕列新增 📷 鈕（點下即凍結進照片模式，等效暫停）；
「重播入口」＝重播窗內 📷 鈕。
規格：進入後 sim 凍結（`s.photoMode` 旗標，frameStep 比照 `s.replay` 短路）；相機複用
`src/input/cameraControls.js` OrbitControls（單指環繞、雙指縮放原生支援），退出還原
腳本相機；一鈕隱藏/還原 HUD（新建批次 toggle）；快門＝當幀 render 後同步
`canvas.toBlob` 下載/分享（不改 renderer 設定，不常駐 preserveDrawingBuffer）。
驗收：①進入→sim 不前進（tick 凍結測試）②退出→比賽從凍結點繼續、相機/HUD 完整還原
③快門產出非空 blob（結構測試）④教學局與連線賽不提供入口 ⑤觸控手勢不與比賽操作打架
（photoMode 中比賽輸入短路）。

## P2 完整擦地員

規格：仿 `src/render/officials.js`（`person()` 程序化人偶）新建 `src/render/moppers.js`：
局間（showSetBreak 窗）與暫停（timeoutHuddleTeam 非 null 窗）小人快步進場、彎腰擦地
來回、退場；步態借 geoAnimator 髖膝交替慣例；`prefers-reduced-motion` 或演出關閉時不出。
驗收：①純函式/結構測試蓋「窗內出現、窗外不在場景」與播畢移除 ②rally 進行中永不在場
③崩潰自我停用 ④教學局不出。

## P3 聯盟全員數據埋點（只埋累積，榜 UI 明列不做）

規格：AI 隊伍無 box score（勘查確認），埋點＝季末 `archiveSeasonSummary`
（careerStore.js:1637）同時寫入 `leagueSeason` 欄位：各隊戰績＋各球員該季估算數據
（決定論：由 OPPONENTS 隊伍評分/位置推導＋種子偽亂數，欄位註明 estimated——遊戲風味
數據非真實模擬）；走 schema 逐鍵回退慣例（`prev?.field ?? default`、不進 TOP_KEYS，
舊檔讀取不炸）；每季壓縮存整數，控制 localStorage 增長（單季 ≤ 約 10KB）。
驗收：①封存後 `loadSeasonArchive()` 帶出 leagueSeason 且同 seed 逐值可重現
②舊存檔（無此欄）載入不炸、正常回落 ③連續封存兩季各自獨立 ④玩家自隊數據用真實
totals 不用估算。

## P4 局點 vs 賽點分兩級

規格：`presentation.js` 新增純函式 `isMatchPointOf(game)`（局點 ∧ `game.series` ∧
拿下此局即達 `setsToWin`；`series` 為 null 的單局賽＝局點即賽點）；scorebug 呼吸與
LED 警示色改為**只有賽點**觸發，普通局點徽章靜態顯示；scoreboard 內部分流
（呼叫端參數不動，series 已可讀）。
驗收：①純函式測試：bestOf 3 第一局局點→不呼吸不變紅；決勝局局點→呼吸＋變紅；
單局賽局點→呼吸＋變紅 ②教學局恆 false 沿舊 ③既有 J2 測試同步更新為兩級語意
（屬細化加嚴，記錄於此）。

## 全卷收尾驗收（機械判定）

1. `npm test` 全綠（≥2438＋新增，貼實跑輸出）。
2. sim-hash probe 通過；`git diff --stat 3ccbd3a..HEAD -- src/sim/` 零檔案。
3. R5 三件套：實跑、每件一個邊界（P1 退出還原、P2 reduced-motion、P3 舊檔回落、
   P4 bestOf1）、`git diff --stat` 逐檔對應需求。
4. 部署 `npm run deploy:pages`，附 `git log origin/gh-pages -1` 時戳。
