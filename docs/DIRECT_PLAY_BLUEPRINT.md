# 排球夢：直接操作與真實觸球藍圖

決策日期：2026-09-24。來源：Sawmah 本次規劃與實作授權。
回退基準：`e9f5164040608170e6c0806562a3c08eae5167b8`；分支 `checkpoint/direct-play-baseline-e9f5164`。

## 作品方向

以真實的自己，靠練習、讀球與團隊合作，從高中打到職業。單人生涯優先，正式比賽維持六對六、一人固定位置；手機雙拇指優先，PC 鍵鼠同語意。沿用既有夜賽與幾何球員美術，不重寫生涯內容。

第三人稱直接操作取代新模式中的選單式攻防。走位、助跑、身高、起跳、出手和身體接觸決定球路。新手輔助只提供資訊，不瞬移、不放大隱形觸球區、不保底救球。正式比賽即時運作，慢動作只用於訓練與回放。

Free Ball: Volleyball 官方可證實的是單人角色、第三人稱及位置分工；本作保留六對六與生涯身分。舊白皮書中的慢動作倍率及物理公式不是已查證競品規格。來源：https://store.steampowered.com/app/5009750/Free_Ball_Volleyball/

## 操作與位置

- 左拇指移動；右拇指先瞄準，再起跳與出手；出手按下開始動作，不代表當下擊中。觸球區短滑可修正朝向。
- 獨立起跳；receive/spike/tip/set/block/dive 在出手前選定，按住期間不偷換動作。力量來自助跑、身體與揮擊速度，不按鍵直接指定成功。
- 入門顯示落點預測；標準保留球影和必要線索；進階關閉額外預測。三者共用碰撞規則。
- 五位置依序：主攻（接發轉攻/讀攔網）、舉球（分配/節奏）、自由人（預判/平台角度/魚躍）、攔中（讀攻/封網）、接應（右翼/後排/困難球）。先完整主攻閉環，再逐一驗收其餘位置。
- 身高/臂展影響實際碰撞範圍，彈跳/疲勞影響動作，信任影響隊友分配，技術解鎖動作而非必中。AI與人遵守同一物理；AI不讀私人瞄準輸入，只讀已呈現的身體與球路。

### 2026-09-24 操作補充：滑動選扣球

使用者確認舊沙盒的四向手勢是新模式必備操作：扣球準備時上滑選單手吊球、下滑選直線重扣、左／右滑選斜線。這項新決策擴充下方原階段1的指令契約：`shotType?` 為 `LINE`、`CROSS_LEFT`、`CROSS_RIGHT`、`TIP`。按下開始準備，觸球窗口前可選線，窗口開始後鎖定；無論選何種球路，球仍須碰到可見的手臂或手掌。斜線由滑動改變身體朝向與接觸法線產生，吊球由同一隻手較小的推送弧產生；不依選項直接把球傳送到預設落點。舊 `freeballControls.js` 的手勢分類可作操作參照，沙盒的保底救球與指定落點公式不可移入新解算。

### 2026-09-24 操作補充：滑動調整接球平台（direct-v4）

使用者裁定：接球拆成兩層。「接到球」靠走位與 direct-v3 的小幅迎球轉身（±35°，不放大碰撞體、不加衝量）；「接到哪」靠墊球準備期在出手鈕上滑動，選擇平台角度——上滑高球到位、下滑低平安全球、左／右滑平台偏左／右，不滑則平台正對身體。四向離散，和扣球同一套手勢；觸球窗口開始即鎖定。平台角度寫進共享姿勢，球仍依前臂實際法線反彈，不傳送到指定落點、不保底。入門與標準模式顯示平台朝向線與接球時機提示（出手鈕外圈收縮），進階不顯示，提示不改判定。訓練新增「接球方向練習」：地上標目標區，只顯示結果。指令契約新增 `passType?`：`HIGH`、`LOW`、`LEFT`、`RIGHT`、`NEUTRAL`。競品參照：Free Ball: Volleyball 用鏡頭瞄準＋抓時機，玩家普遍反映缺乏時機與落點提示（Steam 討論區），本作以觸控手勢與資訊提示補足。驗收條件見 `docs/kickoffs/direct-v4-receive-swipe-acceptance.md`。

本次真實動作參照：[USA Volleyball 接球平台](https://usavolleyball.org/resource/5-keys-to-better-passing/)、[USA Volleyball 攔網步法](https://usavolleyball.org/resource/10-keys-to-middle-blocking/)、[USA Volleyball 安全落地](https://usavolleyball.org/resource/six-keys-to-lowering-your-risk-of-a-knee-injury/)、[Volleyball World 舉球教學](https://en.volleyballworld.com/blogs/how-to-set-in-volleyball-like-a-pro)及[FIVB 教練手冊](https://www.fivb.com/wp-content/uploads/2024/03/FIVB_Coach_Manual_EN.pdf)。具體畫面檢查為：接球前降低重心並定住平台；起跳收腿、落地屈髖膝；攔網雙手展開；吊球單手小幅推送。完整三／四步助跑、扣球肩髖分離、側向交叉步、魚躍翻滾與回位仍需逐項擴充及實機試玩，不能只憑目前剪影宣稱動作全真。

## 技術與相容性

`src/sim/` 零 Three.js、固定 60Hz、種子亂數。階段1原版為 direct-v1；滑動球種與碰撞步態改變回放結果後升為 direct-v2，舊版匯出明確拒絕，不能套新解算假裝重播一致。legacy 解算、存檔和 VCR 不改語意。直接操作目前獨立單機入口 `?mode=direct`，不得進既有連線房間，也不切換生涯預設。

碰撞採全身球體/膠囊體，手掌與前臂可施加主動擊球效果；不做逐指/三角網格物理。共享程序姿勢同時供模擬與畫面使用。球與移動肢段的相對連續碰撞必須涵蓋旋轉中途，不能只比較tick終點。碰到後依相對速度/法線反彈，不把球保送至指定落點；揮空不改球，被動身體仍可碰球。同人多部位/跨tick接觸合併episode，觸球規則與物理解算分離。

### 階段1介面（動工前凍結）

- `createDirectGame({seed=1,height=1.75})` 建立版本化狀態；`stepDirectGame(state, commands)` 每次推進 1/60 秒。
- 指令 `{tick,sequence,move:{x,z},aim:{x,z},action,feedKind?}`；action 為 null/jump/receive/spike/tip/set/block/dive/feed，feed只用於訓練，不移動玩家。
- `getDirectPose(state)` 回傳 `{id,part,a,b,radius,active}` 膠囊清單，a/b為世界座標；畫面直接呈現這些肢段。
- 狀態含 `simulationVersion,tick,player,ball,events,stats`；玩家含位置/速度/身高/動作階段，球含現在/前次位置/速度/半徑/active。
- `snapshotDirectGame`、`restoreDirectGame`、`replayDirectTape`、`serializeDirectState` 負責新模式回放；未知版本拒絕。既有VCR保持原路徑。
- `createDirectControls(...)` 綁定DOM；`sample(tick)` 產生當tick持續方向與一次性事件；`reset/dispose` 清理輸入。不同渲染幀率不得重複edge事件。

## 階段與檢查點

0. 保存規格、回退基準及既有測試；不納入使用者未追蹤的 AGENTS.md。
1. 一人一球訓練場：手機/鍵鼠、共享身體姿勢、固定餵球、碰撞、回放、診斷。先完成獨立可驗證版本。
2. 主攻完整一球：接發→隊友舉球→進攻→攔防→再防守→自然死球；禁止強制三拍/救球保底。
3. 正式六對六一局：輪轉/計分/AI/手機教學；真機效能與完整一局驗收。
4. 五位置與生涯：能力/技術/疲勞/信任/賽後統計逐一接入；通過後才切換新生涯預設。
5. 聲音/鏡頭/動作/觀眾/關鍵球演出與回放教練，不改比賽判定、不遮球。

每個檢查點必須可退回前一可玩提交。階段1未驗收不得宣稱階段2–5已交付。Claude Code 接觸核心、Codex 輸入與畫面，以介面凍結及隔離工作樹協作；整合入口由單一人負責。

### 引擎決策

本輪沿用 Three.js/PWA，使用者另授權按需調度 Astra。先驗證直接操作與六對六；換 Unity 不能代替操作/接觸設計。觸發評估的條件為：在指定手機與固定畫質下，六對六仍超出本節效能門檻，且profiling確認已排除可修正的演出/配置成本；或有可重現、無法以既有Web能力排除的輸入/平台限制。屆時只移植同一個訓練場做Unity對照原型，沿用同一份輸入/碰撞案例及效能量測，再決定是否承擔生涯/介面/存檔/回放/測試和PWA發行流程的移植成本。未達觸發條件不全面換引擎。

## 驗收（動工前凍結）

核心：無接觸/揮空不改球速；碰到與擦過可區分；高速球、手掃靜球、旋轉中途接觸不穿透；頭腿被動碰撞；雙臂/跨tick不重複加力；早晚/角度/身高/起跳改變結果；feed不移動玩家；同種子同tick指令回放逐值相同；未知版本拒絕。

輸入：兩指同時移動/瞄準；press/hold/release無重複；相同timestamp順序固定；切動作不改正在按住的動作；pointercancel/blur/背景切換清空；dispose後無反應；鍵鼠/觸控同指令。

畫面：實際瀏覽器1280×720、844×390、390×844截圖；人形/球/網可讀，控制不溢出、不遮主角觸球區，手腳位置與碰撞體一致。截圖必須實際打開看。記錄frame time、sim time、積欠與draw calls。

指令：`node --test tests/direct-physics*.test.js tests/direct-input.test.js`；`npm test`；`npm run build`；`node tools/direct-play-browser.mjs`（新增瀏覽器治具，使用現有可用Playwright runtime）。舊測試不得改門檻以配合新模式。

真機：2026-09-24 使用者指定 iPhone 14 Pro，Safari，過往以加到主畫面的PWA遊玩。iOS/Safari版本、實際viewport與畫質由實機匯出紀錄補齊；預設沿用high，不自动降規。完整六對六連續10分鐘，目標60FPS、p95 frame time≤16.7ms、無持續積欠。桌面手機尺寸模擬不是手機效能證據。不得以跳過碰撞、變動dt或自動降畫質通過。玩家能說明失誤並刻意重現好球是獨立體感驗收。

交接附提交、範圍、命令與實際输出、回放/截圖、未解項。部署附版本時間與PWA更新方式。新增多人、海外章節、更換引擎不在本輪。
