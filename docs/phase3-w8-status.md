# Phase 3 W8 結案快照 — 命名工程＋賽前對陣＋暫停演出＋體力可讀性

> 2026-07-25～26。無正式 kickoff（W7 結案後的試玩回饋驅動輪），拍板全在對話中即時做成。
> 本檔＝Phase 4 接手權威快照。Commits：dc11e03（命名 kickoff）→ 49054f5（防守鏡位）共 21 筆。
> **C3 難度三選一（懸置兩週）：Sawmah 打完第 1 屆後裁定「維持現狀」——難度題正式關卷。**

## 1. 交付總表

| 區塊 | 內容 | 落點 |
|------|------|------|
| 命名工程 | 我方＝遊隼高中（STARTER_DEFS 補 `fullName`＋隊長 `title`）；七隊 `squad`/`libero`/`ace{slot,name,title}` 具名；RECRUIT_DEFS 補 fullName＝對手名單同一人 | `roster.js`／`opponents.js`／`recruitment.js` |
| 命名 v2 | 對手 49 人全改台灣自然感（常見姓＋真實人名用字；鐵霧字族冷字→鋼鐵字） | 同上（總表在 `kickoffs/naming-kickoff.md` 文末） |
| 挖角除名 | `applyPoaching`：已招募者不再現身原隊、槽位由新設 `reserves`（每隊 2 名）遞補、王牌被挖＝ace 拔除 | `careerState.js` |
| speaker 具名 | 隊長（MB）→大山、二傳（S）→阿哲、各校角色→具名；台詞潤稿批全清（src 內 TODO(naming) 歸零） | `events.js` 等 9 檔 |
| 賽前對陣畫面 | 出戰必經：俯視球場 VS 畫面（對面具名釘站位＋王牌金框稱號＋敵情/情蒐/舊隊情結）＋我方半場 tap 排陣（互換/板凳/自由人/首發球位）；取代舊 ⚙ 先發編排面板 | `careerScreen.js showMatchupScreen` |
| 暫停演出 | 第一人稱圍圈看戰術板：`huddleLayout`（幾何單一事實源）＋`huddleProps`（教練幾何人＋CanvasTexture 戰術板＋板凳燈）＋cameraRig `'huddle'` 模式 | `render/huddle*.js`／`cameraRig.js` |
| 播報隊色 | beat 帶 team → line() 轉 ally/enemy；泡泡染我方青／敵方暖，中性敘事維持白 | `commentary.js`／`scoreboard.js` |
| 體力可讀性 | 標籤雙方 <50% 黃 <25% 紅；死球間隙迷你條（雙方全員、三段色）；⚙ 面板死球窗即可開（無板凳＝唯讀儀表板） | `matchView.js`／`subPanel.js` |
| 氣勢 | 逐檔死球恢復加成（每檔 +0.002）；連得進度三點（門檻視覺化） | `game.js momentumRecovBonus`／`scoreboard.js` |
| 對手暫停 | `aiTimeoutBoost` 情境決定論（體力低 calm／否則 fire）＋選擇公開（戰術板＋播報＋散圈浮字） | `ai.js`／`matchLoop.js` |
| 防守鏡位 | 距離實測穩定；高度 2.9m→2.45m（原高於網頂＝俯視）、INSET→1（正後方）；參數進 CAMERA_TUNING＋`__phase1.cameraTuning` 即時調參 | `cameraRig.js` |

## 2. 結構要點（Phase 4 接手必讀）

- **命名資料流**：`opponents.squad[i]` ↔ `careerState.buildOpponentTeam` 槽序（S/OH/MB/OPP/OH/MB）＝同一套；
  招募生 `RECRUIT_DEFS.fullName` 必須與來源隊 squad/libero **逐字相同**（`tests/naming.test.mjs` 靜態把關）。
  加隊或改名單一律先跑該測試。
- **`applyPoaching` 是 def 的純函式轉換**：`careerMatchSetup` 與對陣畫面各呼叫一次（同一語意兩處消費），
  原參數檔不可變。新增「對手換人」（Phase 4）時要走同一條轉換，勿另闢路徑。
- **圍圈幾何鐵三角**（四輪迭代教訓）：距離（貼身 R0.95）、朝向（站定轉向教練）、視角（主角恆佔 slot 0＝
  固定構圖）——缺一就破功。改圈型只動 `huddleLayout.js`。
- **顯示哲學（Sawmah 定稿）**：**狀態誠實呈現、平衡手段藏幕後**。體力顯示雙方全對稱（含 <25% 紅），
  對手的 `heavyExempt` 效果豁免留在 sim 不反映於顯示；反之戰術行動（暫停選項）一律公開。
- **資訊時機原則**：資訊要落在「要用它的前一刻」——對手暫停選項改在散圈回場浮字（原在喊暫停當下播報，
  玩家正在讀自己的面板＝必然錯過）。
- **氣勢仍是防雪球設計**：推檔需連得 3+、對手 1 分即收檔（不對稱）；只動散佈與恢復，不碰能力值。

## 3. 平衡數據（治具 n=150，臂＝體力＋自動管理＋氣勢）

| 版本 | 決賽帶 | 奪冠 | 逆轉率 | 體力（終場均值/單場最低） |
|------|--------|------|--------|--------------------------|
| W7 結案基準 | 20% | 7% | 12% | 0.71／0.10 |
| ＋氣勢逐檔恢復 | 20% | 7% | 12% | 0.72／**0.15** |
| ＋對手暫停選項（現行） | 20% | **5%** | 13% | 0.72／0.15 |

- 氣勢恢復＝零漂移（只緩解疲勞谷底，機制目的達成）
- 對手暫停選項＝奪冠 −2pp（唯一淨變難項）；決賽帶與逆轉率不動
- **C3 裁定：維持現狀**（真人第 1 屆體感 OK）——難度旋鈕若日後要回收，優先序＝對手暫停 fire 選項

## 4. 測試

401 綠（W7 結案 382 → +19）。新增檔：`naming.test.mjs`（8 條：squad 唯一/ace 槽位/全域不撞名/
招募對應/建隊實吃 squad/我方 fullName/挖角除名/careerMatchSetup 接線）；
`momentum.test.mjs` +1（逐檔恢復）；`timeout.test.mjs` +2（AI 選項情境與決定論、B 側 fire 方向）；
`commentary.test.mjs` +1（隊色 ally/enemy/中性）。

專項檢查（scratchpad 腳本，未入庫）：情蒐＋賽末教技巧全鏈 21 項全過；體力恢復涵蓋範圍實測
（死球雙方全隊：場上 +0.5%／板凳 +2.5%；暫停與「穩住」＝喊的那隊全隊含板凳，對手 0）。

## 5. 已知債務／懸念

- **真機 FPS** 承 W1 仍未正式量測（本輪瀏覽器實測恆 165FPS，但非真機）
- 對手換人／板凳＝Phase 4（現以 A4 慢耗「鏡頭外輪換」敘事頂著）
- 命名總表待 Sawmah 逐個否決（目前零否決）
- feat 條件數值複核、爆接對鐵霧實測（W6 遺留）
- 氣勢影響 AI 行為（發球保守度/快攻配比）＝拍板明定不做，Phase 4 可重議
