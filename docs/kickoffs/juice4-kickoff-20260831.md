# 大作感四卷 kickoff＋驗收凍結（2026-08-31）

開卷基準：main `c4bbef5`（2396 綠、sim-hash 基準同 `7dedc192` 世代）。
範圍＝Sawmah 08-31 裁定全包五件：J1 里程碑當下演出／J2 賽點視覺／J3 奪冠煙火／
J4 觀眾人浪／J5 播報員開場白。池底件（照片模式、擦地員/擦汗、聯盟全榜）明列**不做**。

## 鐵則（全卷）

- 純演出層：`src/sim/` 零檔案改動；sim-hash 逐值同基準（`node tools/sim-hash-probe.mjs` 通過）。
- 所有演出常數（秒數、幅度、色值）標【試玩必調】。
- 演出永不致死：try/catch 自我停用不擋比賽／開機（沿 crowdAnim、bootLogo 慣例）。
- 全螢幕演出一律可跳過（沿 celebration/mvpShow 跳過範式）。

## J1 里程碑當下演出

現況：王朝/老兵之年等 proMilestones 事件走賽前對話卡（careerScreen fireEvents 管道），
達成瞬間無演出、只默默進獎盃房。
目標：每個里程碑在**它自然發生的那個時點**（賽前事件→事件觸發當下；奪冠型→該場慶祝鏈）
加全螢幕演出卡（沿 championBanner/mvpCard 骨架、theme tokens，不寫死 hex）。
驗收：①同一里程碑演出恰一次（存檔重進不重播），純函式測試蓋「該不該演」判定
②練習/教學/連線不演 ③可跳過，跳過與播畢殊途同歸 ④演出不阻塞原對話卡/結算流程。

## J2 賽點視覺

目標：`keyPointOf(game)` 為真的 rally（賽點，局點之會終場子集）期間——
①scorebug 局點徽章加呼吸燈動畫（賽點才呼吸，普通局點不呼吸）
②LED 廣告板跑馬燈切警示色（makeMarqueeTexture 加色參數＋arena 新把手），死球後若
不再是賽點要還原。
驗收：①賽點判定沿用既有 `keyPointOf`，不另立判準 ②純函式測試蓋「賽點真/假 → 徽章
class 與 marquee 色」雙向（賽點紅、非賽點還原原色）③教學局不觸發。

## J3 奪冠煙火

目標：championTitle 成立的 startCelebration 鏈加煙火（升空＋炸開，決定論偽亂數沿
confetti 範式；另建 createFireworks.js 或 confetti 加 pattern，實作自選）。
驗收：①冠軍慶祝窗內煙火啟動、endCelebration 後停且資源釋放 ②非冠軍勝場不放
③純函式/結構測試蓋啟停時機 ④崩潰自我停用（不致死）。

## J4 觀眾人浪

目標：暫停（TIMEOUT／timeoutHuddleTeam）與局間（set_break）窗播人浪：
`crowdWaveAt(elapsedMs)` 純函式（按座位相位遞延的波），createCrowdAnim 加
onTimeout/onSetBreak 觸發窗（同 onScore 模式，複用 restore）。
驗收：①純函式測試：窗內 amp 隨相位遞延、窗外恆 0、播畢座位還原 base
②rally 進行中不播 ③與既有 onScore 反應互不打架（同幀只一種生效，規則寫進註解與測試）。

## J5 播報員開場白

目標：一般賽 lineupIntro 窗插開場播報字幕（決定論句池抽選，含對手名/戰績等變數，
沿 interviewCard 句池慣例；顯示複用 nameplate 節奏或輕量字幕）。
驗收：①句池抽選純函式測試：同 seed 同句、變數正確代入 ②限 lineupIntro 窗、
教學局不播 ③可跳過、不延長既有 intro 總時長超過 1 個 phase 的既有節奏。

## 全卷收尾驗收（機械判定）

1. `npm test` 全綠（≥2396＋本卷新增，貼實跑輸出）。
2. `node tools/sim-hash-probe.mjs` 通過（逐值同基準），`git diff --stat c4bbef5..HEAD -- src/sim/` 零檔案。
3. R5 三件套：實跑、每件挑一個最相關邊界實測（J1 重進存檔、J2 deuce 連續賽點、
   J3 非冠軍勝場、J4 窗外、J5 教學局）、`git diff --stat` 逐檔對應需求。
4. 部署 `npm run deploy:pages`（predeploy 含 build），附 `git log origin/gh-pages -1` 時戳。
