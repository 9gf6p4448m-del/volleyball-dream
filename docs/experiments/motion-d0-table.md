# D0 動作文獻對照表（寫實球員卷 2B 動工前交付物）

> **狀態**：D0 交付，待使用者逐條裁定。裁定結果寫進 `docs/kickoffs/real-player-stage2-match.md`「修訂紀錄」後，才凍結成 2B 驗收（該檔 §四、`02 §2.1`）。
> **只量不改**：本卷沒有動任何 `src/`（`git diff ac41969..HEAD -- src/` 為空）。
> **數字從哪來**：`node tools/motion-d0-measure.mjs`——用真實的 `createGeoCharacter`＋`createGeoAnimator` 驅動序列，讀關節**世界座標**，依各文獻自己的角度定義計算；沒有拿 `POSES` 的弧度欄位直接比。第三節的表格與附錄 A、B 是腳本以 `--write-table` 寫入的「產生區塊」，`--check` 驗證表中每個數字與重跑逐字一致（第八節）。
> **適用對象**：幾何人與寫實人共用 `geoAnimator`（Q4-3），本表數字對兩者相同；寫實人另有腿部接地 IK（`realPlayer.js`），本表量的是 IK 前的骨架。
> **研究筆記**：原文逐位元保存於 `docs/experiments/motion-research-biomech.md`（sha1 `27110850…`，與 scratchpad 原檔相同）；筆記中經核對發現的錯誤列在附錄 D，**請以本表為準**。

## 一、摘要

- **7 個技術、52 列**：低手接球 19、高手舉球 6、扣球 11、吊球 4、攔網 2、發球 9（跳發 4、飄球 4、一般 1）、魚躍 1。
- **可用數字比對 41 列**（角度 40、助跑重心下降 1）：角度列**超出「平均 ± max(1 SD, 10°)」30 列**、範圍內 10 列；重心下降只有文獻的約 28%（非角度，容差待使用者訂）。
- **其餘 11 列**：定性 6（文獻只有文字描述）、查無 1（遊戲自訂的「一般發球」）、現有骨架表達不了 4（肩最大外旋，屬 2C）。
- **衝突清單 3 條**（第四節：超出範圍且有裁定出處）：全是吊球擊球幀（姿勢由使用者帳號的 commit 加入）。另列**潛在衝突 2 條**（攔網、魚躍：有明確試玩裁定，但文獻只有定性）。
- **核實**：表中每個文獻數字都重新打開原文核對過（✅ 或 ⚠️ 標明限制），**表內沒有未核實的文獻數字**。研究筆記裡有 1 項原文查無（「cocking 期外旋約 90°」）、4 項本表未採用也未開原文（附錄 D）。
- **最重要的三件事**（第二節細說）：
  1. 07-28 的左右手鏡像修正只移了關節位置、沒有翻轉 y／z 旋轉符號 → 25 個姿勢的「肩內收／外展」與「骨盆／胸椎轉向」語意反了。量得的後果：**低手接球雙腕相距 0.764 m（比肩寬 0.45 m 還寬），不是併攏的平台**；**扣球轉體方向和真人相反**（引臂時擊球側肩在前 17.8°，文獻是在後 75°）。
  2. 扣球、吊球、發球的**擊球臂是「伸直、正前上方」**（肩外展約 177°、肘屈 0°～7°、水平內收約 86°），文獻是「側上方、肘還彎 34°～50°」。
  3. 研究筆記有 4 處錯誤會誤導後續驗收，其中「肩外旋約 90°」已寫進開卷文件 §五的 2C 凍結草案，**原文其實是 158°～164°**（附錄 D）。

## 二、量測中的發現（不是文獻數字，但影響怎麼裁定）

### 發現 1：鏡像修正讓 25 個姿勢的 y／z 旋轉語意反轉

- **事實**：扣球姿勢 `spikeWind/spikeUnlock/spikeHit/spikeFollow`（含 `pelvisY/chestY`）寫於 `1fd5da6`（2026-07-28 14:13）；8 分鐘後 `b1ae67d`（14:21，「07-28 Sawmah 試玩：他是做左手扣球，排球比較多是右撇子」）把右側關節從 +X 移到 −X，**該 commit 只改 `geoCharacter.js` 的位置，沒改 `geoAnimator.js`**。左右鏡像需要「位置取反＋y、z 旋轉取反」，只做前者＝所有非零的肩 z（內收↔外展）與骨盆／胸椎 y（轉向）語意反轉；x 旋轉（屈伸、肘、腕、脊椎前後彎）不受影響。
- **影響範圍**（機械清點：現行 `POSES` 中肩 z 或 `pelvisY/chestY` 非零、且在 `b1ae67d` 前就存在、之後未改）：`bumpReady bumpHit setReach setPush spikeWind spikeUnlock spikeHit spikeFollow windup approachBack approachDrive landDeep landRise diveReach diveSprawl divePush serveReady floatWind floatPush gasp dejected waveUp waveSide blockLoad windupHesitant`（25 個）。修正後才新增的 `transitionWait gaspHeavy tipReach tipHit tipFollow` 不在此列；攔網 `blockUp/blockPunch/blockTouch` 的 z 已在 07-30 於修正後重新裁定為 0，不受影響。
- **量得的後果**（第三節表格）：
  - 低手接球觸球幀雙腕相距 **0.764 m**（`bump.contact.span`），肩寬 0.450 m——雙臂往外張，不是教學描述的「掌根併攏成平台」。修正前（右側在 +X 時）同一組 z 的語意是往內收。
  - 扣球引臂（`spike-wind`）：肩線對網 **197.8°**、髖線 **194.9°**。依定義 D-shline（180°＝與網平行、小於 180＝擊球側在後），197.8° 表示擊球側（右）肩在**前** 17.8°；文獻 105° 表示擊球側肩在**後** 75°（180−105）。揮臂到擊球：遊戲肩線 197.8°→170.0°＝擊球側肩**往後**轉 27.8°；文獻 105°→137°＝往**前**轉 32°——**鞭打的轉體方向相反**。
  - 高手舉球雙手相距 0.152 m（裝填）／0.116 m（出手），目前是靠攏的，外觀與舉球手型相符（同一組 z 在修正前語意相反；修正前實際長相本卷未量）。
- **裁定題**：這不是「文獻 vs 裁定」的衝突——使用者 07-28 的裁定是「要右撇子」，修正只做了一半。建議 2B 先把這 25 個姿勢的 z／y 語意改正（逐一確認意圖，不是一律取反；例如舉球現況反而合理），再做文獻校準；**魚躍三個姿勢屬試玩裁定過的外觀**（07-23 裁定時同一組 z 的語意是內收），改正前需使用者確認。

### 發現 2：低手接球的「蹲」幾乎只靠膝，髖不屈

腿部由 `crouch` 換算：髖 `−crouch×1.1`、膝 `+crouch×2.2`（`geoAnimator.js:660-692`，07-22 至今未改、無試玩裁定）。量得起始幀膝角 144.2°（文獻 134.8±7.5，範圍內），但大腿前擺只有 13.9°（文獻 46.3±6.4）——真人是屁股往後坐、大腿前傾、小腿近乎直立；遊戲是大腿近乎直立、小腿往後倒。改這兩個係數會同時影響所有下蹲動作，且連動寫實人 A10（`docs/real-player-stage1-acceptance.md:38`：寫實人 IK 須保住幾何人蹲深）。

### 發現 3：發球的「擊球姿勢」晚於 sim 的擊球

`serve`／`serveJump`／`serveFloat` 沒有 `hit` 欄位，在 sim 的 `SERVE` 事件（球已離手，`src/sim/game.js:1098`、`:1151`）當下才從引臂開始播：擊球關鍵幀比真正擊球晚 0.36 s（一般）／0.34 s（跳發）／0.225 s（飄球）。這是時序，屬 Q4-2 不改的範圍，只記錄。本表的「發球擊球幀」取的是姿勢的擊球關鍵幀。

### 範圍外發現（與 D0 無關、未處理）

扣球起跳 `windup` 播完自動接 `spikeHold` 的那一幀，動作層權重歸 0（`geoAnimator.js:592-597` 的接續分支不產生姿勢），實測右肩 x 從 −2.50 → −0.12 → −2.50：**每次扣球起跳都有一幀手臂掉回待命**。

## 三、對照表

<!-- d0:table:begin（本區塊由 tools/motion-d0-measure.mjs --write-table 產生，勿手改） -->
量測來源：`src/render/geoAnimator.js` sha1 `26a1409bdb863401eaecb71d194a7b726980a1d0`、`src/render/geoCharacter.js` sha1 `ae337501c0533e68350625e660f1c8b64f0c8efe`；探針球員 D0Probe（右手、身高 1.85 m）。

共 52 列：有數字可比 41 列（角度 40＋重心下降 1），其中**超出「平均 ± max(1 SD, 10°)」30 列**；定性 6 列、查無 1 列、骨架表達不了（2C）4 列。

### 對照表

讀法：「定義」代號（D-…）見下方〈角度／量測定義〉、「來源」代號見〈文獻來源與核實〉、「試玩裁定」代號（R-…）見〈試玩裁定出處〉、「遊戲幀」見〈遊戲幀定義〉。差值＝現況−文獻平均；判定用「平均 ± max(1 SD, 10°)」。

| ID | 技術・階段（遊戲幀） | 變數 | 定義 | 文獻值 | 來源 | 核實 | 現況 | 差值 | 容許 | 判定 | 試玩裁定 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `bump.start.head` | 低手接球・起始（準備期末、最大屈）（`bump-start`） | 頭傾角 | D-head | 7.23±5.52；HS 組；LS 組 3.87±1.96 | RH1987 | ✅ 已核實 | 17.8° | +10.6 | ±10 | **超出** | R-none-prep |
| `bump.start.trunk` | 低手接球・起始（準備期末、最大屈）（`bump-start`） | 軀幹前傾 | D-trunk | 28.46±6.91；HS 組；LS 組 15.15±4.26 | RH1987 | ✅ 已核實 | 22.8° | -5.7 | ±10 | 範圍內 | R-none-prep |
| `bump.start.uarm` | 低手接球・起始（準備期末、最大屈）（`bump-start`） | 上臂前擺 | D-uarm | 9.06±6.15；HS 組；LS 組 10.21±5.19 | RH1987 | ✅ 已核實 | 16.6° | +7.5 | ±10 | 範圍內 | R-none-prep |
| `bump.start.elbow` | 低手接球・起始（準備期末、最大屈）（`bump-start`） | 肘角 | D-elbow | 158.83±11.59；HS 組；LS 組 151.34±7.76 | RH1987 | ✅ 已核實 | 180.0° | +21.2 | ±11.59 | **超出** | R-none-prep |
| `bump.start.thigh` | 低手接球・起始（準備期末、最大屈）（`bump-start`） | 大腿前擺 | D-thigh | 46.29±6.42；HS 組；LS 組 46.56±4.55 | RH1987 | ✅ 已核實 | 13.9° | -32.4 | ±10 | **超出** | R-none-prep |
| `bump.start.knee` | 低手接球・起始（準備期末、最大屈）（`bump-start`） | 膝角 | D-knee | 134.82±7.48；HS 組；LS 組 125.61±10.40 | RH1987 | ✅ 已核實 | 144.2° | +9.4 | ±10 | 範圍內 | R-none-prep |
| `bump.contact.head` | 低手接球・觸球（`bump-contact`） | 頭傾角 | D-head | 2.19±4.91；HS 組；LS 組 -2.46±3.67 | RH1987 | ✅ 已核實 | -4.6° | -6.8 | ±10 | 範圍內 | R-none-prep |
| `bump.contact.trunk` | 低手接球・觸球（`bump-contact`） | 軀幹前傾 | D-trunk | 19.84±10.19；HS 組；LS 組 8.75±4.66 | RH1987 | ✅ 已核實 | 12.1° | -7.7 | ±10.19 | 範圍內 | R-none-prep |
| `bump.contact.uarm` | 低手接球・觸球（`bump-contact`） | 上臂前擺 | D-uarm | 50.71±6.13；HS 組；LS 組 58.03±7.89 | RH1987 | ✅ 已核實 | 56.1° | +5.4 | ±10 | 範圍內 | R-none-prep |
| `bump.contact.elbow` | 低手接球・觸球（`bump-contact`） | 肘角 | D-elbow | 172.44±5.08；HS 組；LS 組 161.29±7.46 | RH1987 | ✅ 已核實 | 180.0° | +7.6 | ±10 | 範圍內 | R-none-prep |
| `bump.contact.thigh` | 低手接球・觸球（`bump-contact`） | 大腿前擺 | D-thigh | 30.68±9.28；HS 組；LS 組 31.56±4.23 | RH1987 | ✅ 已核實 | 6.3° | -24.4 | ±10 | **超出** | R-none-prep |
| `bump.contact.knee` | 低手接球・觸球（`bump-contact`） | 膝角 | D-knee | 147.38±10.61；HS 組；LS 組 143.18±11.74 | RH1987 | ✅ 已核實 | 159.4° | +12.0 | ±10.61 | **超出** | R-none-prep |
| `bump.end.head` | 低手接球・收勢（隨揮末）（`bump-end`） | 頭傾角 | D-head | -6.50±10.03；HS 組；LS 組 -10.12±5.3 | RH1987 | ✅ 已核實 | 3.8° | +10.3 | ±10.03 | **超出** | R-none-prep |
| `bump.end.trunk` | 低手接球・收勢（隨揮末）（`bump-end`） | 軀幹前傾 | D-trunk | 20.02±11.31；HS 組；LS 組 4.41±6.28 | RH1987 | ✅ 已核實 | 5.1° | -14.9 | ±11.31 | **超出** | R-none-prep |
| `bump.end.uarm` | 低手接球・收勢（隨揮末）（`bump-end`） | 上臂前擺 | D-uarm | 85.66±10.82；HS 組；LS 組 95.86±11.43 | RH1987 | ✅ 已核實 | 3.4° | -82.3 | ±10.82 | **超出** | R-none-prep |
| `bump.end.elbow` | 低手接球・收勢（隨揮末）（`bump-end`） | 肘角 | D-elbow | 170.22±6.39；HS 組；LS 組 166.62±9.25 | RH1987 | ✅ 已核實 | 161.6° | -8.6 | ±10 | 範圍內 | R-none-prep |
| `bump.end.thigh` | 低手接球・收勢（隨揮末）（`bump-end`） | 大腿前擺 | D-thigh | 18.76±7.19；HS 組；LS 組 22.84±7.03 | RH1987 | ✅ 已核實 | 2.3° | -16.5 | ±10 | **超出** | R-none-prep |
| `bump.end.knee` | 低手接球・收勢（隨揮末）（`bump-end`） | 膝角 | D-knee | 158.91±11.19；HS 組；LS 組 154.31±13.89 | RH1987 | ✅ 已核實 | 167.4° | +8.5 | ±11.19 | 範圍內 | R-none-prep |
| `bump.contact.span` | 低手接球・觸球（`bump-contact`） | 雙腕間距（平台） | D-span | 雙手掌根併攏成平台（≈0）；見「量測中的發現 1」 | JVA | 定性（無數字） | 763.8 mm | — | — | — | R-none-prep |
| `set.load.elflex` | 高手舉球・裝填（最大肘屈）（`set-load`） | 肘屈 | D-elflex | 100（無 SD）；fast／seven／quick 皆「約 100°」 | LZ2026 | ⚠️ 已核實（原文約值、n=1） | 57.3° | -42.7 | ±10 | **超出** | R-none-prep |
| `set.push.elflex.fast` | 高手舉球・出手收勢（`set-push`） | 肘屈（fast／seven 型） | D-elflex | 40（無 SD）；遊戲所有舉球共用一支動畫 | LZ2026 | ⚠️ 已核實（原文約值、n=1） | 14.3° | -25.7 | ±10 | **超出** | R-none-prep |
| `set.push.elflex.quick` | 高手舉球・出手收勢（`set-push`） | 肘屈（quick 型） | D-elflex | 70（無 SD）；同上 | LZ2026 | ⚠️ 已核實（原文約值、n=1） | 14.3° | -55.7 | ±10 | **超出** | R-none-prep |
| `set.push.shflex` | 高手舉球・出手收勢（`set-push`） | 肩屈（pipe 型） | D-shflex | 150（無 SD）；原文僅 pipe 給收勢肩屈 | LZ2026 | ⚠️ 已核實（原文約值、n=1） | 151.3° | +1.3 | ±10 | 範圍內 | R-none-prep |
| `set.load.wrist` | 高手舉球・裝填（拉球期）（`set-load`） | 腕 | D-wrist | 拉球期腕背伸（手往後倒）；幾何人看不見腕角 | OZ2019 | 定性（無數字） | -24.1° | — | — | — | R-none-prep |
| `set.push.wrist` | 高手舉球・出手（推球期）（`set-push`） | 腕 | D-wrist | 推球期腕屈肌釋放（手往前推）；同上 | OZ2019 | 定性（無數字） | 22.9° | — | — | — | R-none-prep |
| `spike.wind.shline` | 扣球・最大後擺（`spike-wind`） | 肩線對網角 | D-shline | 105（無 SD）；RA 組；GA 未給；絕對角假設 root 正對網，可靠度低於髖肩分離 | ZH2017 | ✅ 已核實 | 197.8° | +92.8 | ±10 | **超出** | R-none-spike |
| `spike.wind.hipline` | 扣球・最大後擺（`spike-wind`） | 髖線對網角 | D-hipline | 157（無 SD）；RA 組；絕對角假設 root 正對網 | ZH2017 | ✅ 已核實 | 194.9° | +37.9 | ±10 | **超出** | R-none-spike |
| `spike.wind.sep` | 扣球・最大後擺（`spike-wind`） | 髖肩分離 | D-sep | 52（無 SD）；157−105（RA） | ZH2017 | ⚠️ 推導值（由已核實數字換算） | -2.9° | -54.9 | ±10 | **超出** | R-none-spike |
| `spike.wind.er` | 扣球・最大後擺（cocking 末） | 肩最大外旋 | D-2C | 160±10；斜線扣；直線扣 163±10 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | —（無此自由度） | — | — | —（2C） | R-none-spike |
| `spike.hit.abd` | 扣球・擊球（`spike-hit`） | 肩外展 | D-abd | 130±8；斜線扣；直線扣 133±7 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 177.5° | +47.5 | ±10 | **超出** | R-none-spike |
| `spike.hit.elflex` | 扣球・擊球（`spike-hit`） | 肘屈 | D-elflex | 34±10；斜線與直線扣同為 34±10 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 4.6° | -29.4 | ±10 | **超出** | R-none-spike |
| `spike.hit.hadd` | 扣球・擊球（`spike-hit`） | 肩水平內收 | D-hadd | 29±14；斜線扣；直線扣 33±15 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 86.1° | +57.1 | ±14 | **超出** | R-none-spike |
| `spike.hit.shline` | 扣球・擊球（`spike-hit`） | 肩線對網角 | D-shline | 137（無 SD）；RA 組；GA 150；絕對角假設 root 正對網 | ZH2017 | ✅ 已核實 | 170.0° | +33.0 | ±10 | **超出** | R-none-spike |
| `spike.hit.hipline` | 扣球・擊球（`spike-hit`） | 髖線對網角 | D-hipline | 157（無 SD）；RA 組；GA 164；絕對角假設 root 正對網 | ZH2017 | ✅ 已核實 | 173.1° | +16.1 | ±10 | **超出** | R-none-spike |
| `spike.hit.sep` | 扣球・擊球（`spike-hit`） | 髖肩分離 | D-sep | 20（無 SD）；157−137（RA）；GA 164−150=14 | ZH2017 | ⚠️ 推導值（由已核實數字換算） | 3.1° | -16.9 | ±10 | **超出** | R-none-spike |
| `spike.approach.comdrop` | 扣球・助跑最低點（`approach-low`） | 重心下降／身高 | D-comdrop | 12.7%；原文「約 0.25 m」÷ 平均身高 1.966 m | ZH2017 | ⚠️ 推導值（由已核實數字換算） | 3.6% | -9.1 | — | —（非角度，容差待訂） | R-none-approach |
| `tip.hit.abd` | 吊球・擊球（`tip-hit`） | 肩外展 | D-abd | 122±9；roll shot（遊戲註解自稱 Tip／Roll Shot） | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 177.3° | +55.3 | ±10 | **超出** | R-tip |
| `tip.hit.elflex` | 吊球・擊球（`tip-hit`） | 肘屈 | D-elflex | 43±12 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 6.9° | -36.1 | ±12 | **超出** | R-tip |
| `tip.hit.hadd` | 吊球・擊球（`tip-hit`） | 肩水平內收 | D-hadd | 43±15 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 85.9° | +42.9 | ±15 | **超出** | R-tip |
| `tip.wind.er` | 吊球・最大後擺 | 肩最大外旋 | D-2C | 129±32；tip 序列自 spikeWind 起手 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | —（無此自由度） | — | — | —（2C） | R-tip |
| `block.top.elflex` | 攔網・最高點（`block-top`） | 肘屈（手臂打直） | D-elflex | 手臂盡量打直伸過網（≈0）；FK2014 只有質心量，無角度 | BLOCKREF | 定性（無數字） | 0.0° | — | — | — | R-block |
| `block.top.span` | 攔網・最高點（`block-top`） | 雙腕間距 | D-span | 虎口對齊肩寬；肩寬＝肩關節距 0.450 m | BLOCKREF | 定性（無數字） | 450.0 mm | — | — | — | R-block |
| `servejump.hit.abd` | 發球・跳發・擊球（`servejump-hit`） | 肩外展 | D-abd | 129±11；n=5 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 177.5° | +48.5 | ±11 | **超出** | R-none-serve |
| `servejump.hit.elflex` | 發球・跳發・擊球（`servejump-hit`） | 肘屈 | D-elflex | 48±26；n=5 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 4.6° | -43.4 | ±26 | **超出** | R-none-serve |
| `servejump.hit.hadd` | 發球・跳發・擊球（`servejump-hit`） | 肩水平內收 | D-hadd | 23±24；n=5 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 86.1° | +63.1 | ±24 | **超出** | R-none-serve |
| `servejump.wind.er` | 發球・跳發・引臂末（cocking） | 肩最大外旋 | D-2C | 164±11；n=5 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | —（無此自由度） | — | — | —（2C） | R-none-serve |
| `servefloat.hit.abd` | 發球・飄球・擊球（`servefloat-hit`） | 肩外展 | D-abd | 133±11；n=14；原文未寫站立或跳飄（稱 traditional float serve）；遊戲飄球為站立 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 176.5° | +43.5 | ±11 | **超出** | R-none-serve |
| `servefloat.hit.elflex` | 發球・飄球・擊球（`servefloat-hit`） | 肘屈 | D-elflex | 50±17；n=14 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 0.0° | -50.0 | ±17 | **超出** | R-none-serve |
| `servefloat.hit.hadd` | 發球・飄球・擊球（`servefloat-hit`） | 肩水平內收 | D-hadd | 30±16；n=14 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | 85.1° | +55.1 | ±16 | **超出** | R-none-serve |
| `servefloat.wind.er` | 發球・飄球・引臂末（cocking） | 肩最大外旋 | D-2C | 158±12；n=14 | RS2010 | ⚠️ 數字已核實；定義依同團隊文獻推定 | —（無此自由度） | — | — | —（2C） | R-none-serve |
| `serve.hit.none` | 發球・一般（穩定）・擊球（`serve-hit`） | — | — | 查無對應文獻（遊戲自訂的「穩定」發球，跳 0.3 m）；現況值見 JSON frames.serve-hit | — | 查無 | — | — | — | — | R-none-serve |
| `dive.none` | 魚躍・撲出／觸球／著地 | — | — | 查無數字。定性：sprawl＝快速降到地面、平台伸到球下（IYV）；pancake＝手掌貼地（LEB2025）；經典 dive 背弓撐接；軀幹前傾由 matchView DIVE_TILT 驅動、不在 animator 內，本表不量 | IYV、LEB2025 | 定性（無數字） | — | — | — | — | R-dive |

### 遊戲幀定義

| 幀 | 序列與時刻 | 怎麼驅動 | 播放時刻 t／dur（t/dur） | 動作層權重 w | root 高（m） |
|---|---|---|---|---|---|
| `bump-start` | receiveReady t=0.30 s | 接球預備 receiveReady 撐住段（兩關鍵幀皆 bumpReady），即 bump 觸發前一幀 | receiveReady 0.3000 s／0.5 s（0.600） | 1 | -0.121 |
| `bump-contact` | bump t=hit×dur | receiveReady 撐 0.30 s 後觸發 bump，停在擊球關鍵幀 bumpHit | bump 0.2250 s／0.5 s（0.450） | 1（預備段交棒 w0=1） | -0.055 |
| `bump-end` | bump t=dur−1 tick | 同上，停在 bump 最後一幀（遊戲無隨揮姿勢：at=1 回 bumpReady，且已在 RELEASE 淡出） | bump 0.4833 s／0.5 s（0.967） | 0.083（(dur−t)/RELEASE） | -0.020 |
| `set-load` | overhead t=0.42×dur | setReady 撐 0.30 s 後觸發 overhead，停在推出前最後一個 setReach 關鍵幀 | overhead 0.2310 s／0.55 s（0.420） | 1（交棒 w0=1） | -0.044 |
| `set-push` | overhead t=hit×dur | 同上，停在擊球關鍵幀 setPush | overhead 0.3080 s／0.55 s（0.560） | 1 | -0.011 |
| `spike-wind` | spikeHold t=0.04 s | windup 起跳（0.1 s）自動接滯空 hold spikeHold，停在 hold 內（姿勢＝spikeWind 引臂） | spikeHold 0.0400 s／0.08 s（0.500） | 1（chain 交棒） | 0.249 |
| `spike-hit` | spike t=hit×dur | windup 後 11 tick 觸發擊球弧 spike（hitInTicks=11，倍率 1），停在擊球關鍵幀 spikeHit | spike 0.1800 s／0.45 s（0.400） | 1（airborne 交棒） | 0.466 |
| `tip-hit` | tip t=hit×dur | windup 後 12 tick 觸發 tip（hitInTicks=10，倍率 1），停在擊球關鍵幀 tipHit | tip 0.1596 s／0.42 s（0.380） | 1（airborne 交棒） | 0.464 |
| `block-top` | blockJump t=0.20 s | 攔網待命 hold 中觸發 blockJump，停在跳躍弧頂（airDur 0.4 的一半；姿勢在 blockPunch→blockUp 的 7.7% 處） | blockJump 0.2000 s／0.5 s（0.400） | 1 | 0.329 |
| `servejump-hit` | serveJump t=0.40×dur | serveReady 持球 hold 中觸發 serveJump，停在 spikeHit 關鍵幀（此序列無 hit 欄位；sim 的擊球＝SERVE 事件在序列 t=0） | serveJump 0.3400 s／0.85 s（0.400） | 1 | 0.512 |
| `servefloat-hit` | serveFloat t=0.45×dur | 同上觸發 serveFloat，停在 floatPush 關鍵幀（sim 擊球在序列 t=0） | serveFloat 0.2250 s／0.5 s（0.450） | 1 | -0.011 |
| `serve-hit` | serve t=0.50×dur | 同上觸發一般發球 serve，停在 spikeHit 關鍵幀（sim 擊球在序列 t=0） | serve 0.3600 s／0.72 s（0.500） | 1 | 0.289 |
| `approach-low` | approach3 內質心最低幀 | 站定 1 s 取站姿質心 → 以速度 v 跑 0.5 s → 觸發 approach3 並持續餵 v，取質心最低幀 | v=2.55：t=0.4000 s（0.533）；v=4.5：t=0.3833 s（0.511） | 步相權重＝runW（隨速度） | — |

助跑重心下降明細：v=2.55 m/s 質心降 0.067 m（3.6% 身高）、骨盆關節降 0.089 m；v=4.5 m/s（跑姿權重飽和）質心降 0.104 m（5.6%）、骨盆降 0.150 m。文獻換算到身高 1.85 m＝0.235 m。

### 角度／量測定義

| 代號 | 定義與關節點 |
|---|---|
| D-head | 頭前傾（矢狀面投影）：頸關節→頭心連線相對鉛直向上；0＝正直，正＝前傾（屈），負＝後仰。點：neck、headC |
| D-trunk | 軀幹前傾（矢狀面投影）：右髖關節→右肩關節連線相對鉛直向上；正＝前傾。點：rHip、rShoulder（原文為身體右側節段端點） |
| D-uarm | 上臂前擺（矢狀面投影）：右肩→右肘連線相對鉛直向下；0＝下垂、90＝前平舉，正＝往前。點：rShoulder、rElbow |
| D-elbow | 肘角（矢狀面投影）：右肩—右肘—右腕三點夾角，180°＝伸直。點：rShoulder、rElbow、rWrist |
| D-thigh | 大腿前擺（矢狀面投影）：右髖→右膝連線相對鉛直向下；正＝往前（髖屈）。點：rHip、rKnee |
| D-knee | 膝角（矢狀面投影）：右髖—右膝—右踝三點夾角，180°＝伸直。點：rHip、rKnee、rAnkle |
| D-span | 雙腕間距：左右腕關節世界座標距離（m）；對照肩寬 = 左右肩關節距離。點：rWrist、lWrist |
| D-elflex | 肘屈（3D）：180° −（右肩—右肘—右腕 3D 夾角）；0＝完全伸直。點：rShoulder、rElbow、rWrist |
| D-abd | 肩外展（ASMI：上臂與軀幹在冠狀面的夾角）：軀幹縱軸 T＝髖中點→肩中點；右向 R＝左肩→右肩對 T 正交化；前向 F＝T×R。上臂 U＝右肩→右肘投影到 span(T,R) 後與 −T 的夾角；0＝垂於體側、90＝側平舉、180＝正上舉。點：rHip、lHip、rShoulder、lShoulder、rElbow |
| D-hadd | 肩水平內收（ASMI 慣用，推定）：U 投影到軀幹橫切面 span(R,F)，自 R（往擊球側外側）量到 F 的角；0＝上臂在冠狀面內、正＝往前。點同 D-abd |
| D-shflex | 肩屈（矢狀面，相對軀幹）：U 投影到 span(T,F) 後自 −T 往 F 量；0＝下垂、90＝前平舉、180＝正上舉。點同 D-abd（原文 IMU 軟體輸出、未給精確定義） |
| D-shline | 肩線對網角（Zahálka）：左右肩關節連線的水平投影與網（世界 X 軸）夾角；180°＝與網平行，<180＝擊球側（右）肩在後。**假設 root 正對網**（比賽中朝向由 matchView facingTarget 決定）。點：rShoulder、lShoulder |
| D-hipline | 髖線對網角：同 D-shline，改用左右髖關節。點：rHip、lHip |
| D-sep | 髖肩分離：髖線角 − 肩線角（正＝肩比髖多轉向後，X-factor 方向）。與 root 朝向無關 |
| D-wrist | 腕：手軸（腕局部 −Y）相對前臂（肘→腕）的彎角，正＝手往前（+Z，朝網）彎、負＝往後倒。幾何人看不見（手掌是以腕為心的球體），寫實人看得見。點：rElbow、rWrist、rHandAx |
| D-comdrop | 助跑重心下降：站定待命（速度 0）質心高 − approach3 期間質心最低高，除以身高（%）。質心＝幾何節段中心 × Dempster 節段質量比（常數未核實，代理量）；另報骨盆關節下降 |
| D-2C | 肩關節最大外旋（上臂繞長軸旋轉）：現有骨架**無此自由度**（2C 的 shoulder.y），不量 |

### 文獻來源與核實

| 代號 | 出處 | URL | 樣本 | 本卷核對了什麼 |
|---|---|---|---|---|
| RH1987 | Ridgway ME, Hamilton N. The Kinematics of Forearm Passing in Low Skilled and High Skilled Volleyball Players. ISBS 1987 論文集 pp.227–236 | https://ojs.ub.uni-konstanz.de/cpa/article/view/2336/2167 | 女性；高技術 HS＝NCAA D-I n=7、低技術 LS＝國中/JV n=7；每人 3 次；16 mm 底片 200 fps、攝影機垂直矢狀面（2D）、身體右側節段端點 | 下載原 PDF（掃描＋OCR 文字層），Table 2（PDF 第 5 頁、印刷頁 231）以頁面影像逐格目視核對；方法段逐字：肘、膝角＝「關節與相鄰關節連線所夾」；頭、軀幹、上臂、大腿＝「相對鉛直、繞各自關節」的傾角。任務單所列 19.8／172／147／50.7 全屬 **HS 組觸球瞬間** |
| LZ2026 | Lanzani V, Brambilla C, Moscatelli N, Scano A. A Protocol for the Biomechanical Evaluation of the Types of Setting Motions in Volleyball Based on Kinematics and Muscle Synergies. Methods Protoc 2026;9(1):6 | https://pmc.ncbi.nlm.nih.gov/articles/PMC12821510/ | **n=1**（女、27 歲、1.60 m、區域 D 級、非職業舉球員）；實驗室**無球**模擬、雙腳不離地、IMU 100 Hz；每種舉球 10 次；只給「約」值，無受試者間 SD | PMC 全文結果段逐字：pipe 收勢肩屈約 150°；quick「雙臂上舉時肘屈約 60°→再屈到約 100°→收勢約 70°」；fast/seven「肘屈約 100° 裝填→收勢約 40°」；肩旋轉峰值約 60° 屬 high back／back-row（對角）、fast 約 50°。原筆記把「快球約 60°」寫成肩的角度＝**錯置**（那是肘） |
| OZ2019 | Ozawa Y, Uchiyama S, Ogawara K, Kanosue K, Yamada H. Biomechanical analysis of volleyball overhead pass. Sports Biomech 2021;20(7):844–857（2019 線上） | https://pubmed.ncbi.nlm.nih.gov/31066350/ | 熟練／非熟練兩組（摘要未給人數）；EMG＋動作 | PubMed 摘要（eutils 取回全文摘要）：觸球期分拉（球降到最低點前）、推兩期；拉期腕呈背伸但腕屈肌活性高於伸肌＝腕的伸張—收縮循環。**無角度數字**；全文未取得 |
| ZH2017 | Zahálka F, Malý T, Malá L, Ejem M, Zawartka M. Kinematic Analysis of Volleyball Attack in the Net Center with Various Types of Take-Off. J Hum Kinet 2017;58:261–271 | https://pmc.ncbi.nlm.nih.gov/articles/PMC5548173/ | 男、捷克頂級聯賽 n=12（身高 196.6±5.6 cm），分一般助跑 RA／goofy 助跑 GA 兩組；3 台 50 fps 攝影機 3D DLT；中間快攻 set No.54；角度與速度多為**平均曲線讀值、無 SD** | PMC 全文逐字＋圖 5 影像：「肩角／髖角」＝**左右肩（髖）連線相對網的水平夾角**（171°≈與網平行），不是肩關節屈曲；最大後擺 RA 肩 105°／髖 157°；擊球 RA 肩 137°／髖 157°、GA 肩 150°／髖 164°；重心自起始下降約 0.25 m；首步約 2.55 m/s；最大垂直速度 RA 2.91、GA 2.96 m/s。**這篇不是 Wagner 2009**（Wagner 只是其參考文獻 24） |
| RS2010 | Reeser JC, Fleisig GS, Bolt B, Ruan M. Upper Limb Biomechanics During the Volleyball Serve and Spike. Sports Health 2010;2(5):368–374（ResearchGate 231215653 同一篇，該站 403） | https://pmc.ncbi.nlm.nih.gov/articles/PMC3445065/ | 女、NCAA D-I n=14（1.78±0.08 m；13 右手 1 左手）；跳發只有 n=5；8 台 240 Hz 3D；每技術 5 次 | PMC 全文 Table 2 逐格核對（擊球瞬間肩外展、肘屈、肩水平內收；最大外旋）。**原筆記「cocking 期外旋約 90°」原文查無**：Table 2 最大外旋為 160±10（斜線扣）、163±10（直線扣）、164±11（跳發）、158±12（飄球）、129±32（吊球）。角度定義原文只寫「as previously described」（引 Dillman 1993 等，未取得），以同團隊 ASMI2022 圖說佐證 |
| ASMI2022 | Diffendaffer AZ, Bagwell MS, Fleisig GS, et al. The Clinician's Guide to Baseball Pitching Biomechanics. Sports Health 2023;15(2):274–281 | https://pmc.ncbi.nlm.nih.gov/articles/PMC9950989/ | （定義來源，非排球數據） | 圖 5 圖說逐字：Shoulder abduction is measured as the angle between the upper arm and trunk in the frontal plane；圖 6：external rotation＝上臂繞長軸旋轉。水平內收的正式定義本卷未取得原文，採 ASMI 慣用「上臂在軀幹橫切面相對肩線的前移角」＝推定 |
| FK2014 | Ficklin T, Lund R, Schipper M. A Comparison of Jump Height, Takeoff Velocities, and Blocking Coverage in the Swing and Traditional Volleyball Blocking Techniques. J Sports Sci Med 2014;13(1):78–83 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3918571/ | 女、NCAA D-I n=9；60 Hz 2D；每法 3 次 | PMC 全文結果段逐字：垂直起跳速度 揮臂式 2.73±0.19、傳統 2.51±0.21 m/s；質心跳高 0.38±0.05／0.32±0.05 m；雙手在網上時間 0.46±0.04／0.40±0.04 s；傳統式助跑時雙手「中立地放在肩前」。**無關節角度** |
| HH2007 | Huang C, Hu L-H. Kinematic Analysis of Volleyball Jump Topspin and Float Serve. XXV ISBS Symposium 2007（Ouro Preto）pp.333–336 | https://ojs.ub.uni-konstanz.de/cpa/article/view/476/416 | 男、國家隊（台灣、委內瑞拉）跳發 n=13（193.3±6.1 cm）、跳飄 n=3；120 Hz 2D；每人 1 次 | PDF 文字層 Table 3 版面錯位，以 pdfminer 座標逐列對齊後核對：垂直起跳速度 跳發 3.3±0.4、跳飄 2.6±0.2 m/s；質心跳高 54.3±9.1／26.7±4.5 cm；擊球高度 303.8±28.2／297.4±32.6 cm（與內文 303.8／297.4 一致） |
| JVA | Junior Volleyball Association. 5 Keys to Forearm Passing in Beach Volleyball | https://jvavolleyball.org/5-keys-to-forearm-passing-in-beach-volleyball/ | 教學文章（定性） | 逐字：extend your arms and put the heels of your hands together presenting a solid platform |
| IYV | The Dig and Dive Volleyball Digging Using The Sprawl And The Extension | https://www.improveyourvolley.com/dig-and-dive-volleyball.html | 教學文章（定性） | 逐字：sprawl＝比跨步更快地降到地面，把防守平台手臂伸到球下方。無數字 |
| LEB2025 | Mark Lebedew. How the Pancake Destroyed Defence（2025-08-01） | https://marklebedew.com/2025/08/01/how-the-pancake-destroyed-defence/ | 教練評論（定性） | 逐字：pancake＝手掌貼地讓球從手上彈起；經典 dive 為「誇張的背弓與撐接」完全離地。無數字 |
| BLOCKREF | 本 repo 內部參考文件（未附外部來源） | docs/blocking-reference.md:64-74 | 內部文件 | 逐字：肩膀鎖緊上聳、手臂盡量打直伸過網；手掌張開、虎口對齊肩寬。**不是文獻**，只作定性 |

### 試玩裁定出處

| 代號 | 出處 |
|---|---|
| R-none-prep | 無姿勢裁定。僅時序：1310aa5／8aa8b2e（07-28「兩次抬手」→預備段撐住＋交棒，geoAnimator.js:294-299）；姿勢值自 2eebe75（07-22）建立，ec8efc7（07-28）只加 spineUp／wrist 欄位 |
| R-none-spike | 無姿勢裁定。姿勢值出自 1fd5da6（07-28 依「扣球動作重製」工單 §5 撰寫）後未再改；07-30「三段式」為結構／時序裁定（geoAnimator.js:175、docs/kickoffs/phase5-w2-kickoff-v2.md:70,84）；docs/phase4_7-actions-status.md:132 列為「待 Sawmah 試玩」，查無試玩後結論 |
| R-tip | 無試玩紀錄；但這組吊球姿勢是**你本人的帳號**在 09-10 直接加進來的（commit fcd15cb，沒有 Claude 共同作者標記、英文訊息，不是 Claude Code 的產出），所以當作你已經決定過，保守起見視同裁定 |
| R-block | **試玩裁定**：aafd231（07-30）「Sawmah 試玩裁定原窄手型較好看」寬臂案否決、z→0＝雙手在肩正上方（當時以身高 1.75 m 量得跨距 0.426 m；本表探針身高 1.85 m 量得 0.450 m，0.450×1.75/1.85＝0.426，是同一個姿勢）、同輪 FK 實測「肘角 0 全直」；geoAnimator.js:73-84。另 07-27「單人攔網感」：block hold t=0 必須是舉手 blockUp（geoAnimator.js:248-250、docs/phase4_5B-status.md:242-246） |
| R-none-serve | 無姿勢裁定。82f22fb（07-24「Sawmah 回饋」）新增三式分化動畫＝回饋觸發的新功能，未記原話、無角度否決；之後數值未改 |
| R-none-approach | 無姿勢裁定。5518279（07-28「原地左右左右跳舞」）只加 stepW=runW 權重閘門，STEP_CROUCH／approachBack 數值自 def75f0／77a4c30 建立後未改。注意連動：docs/real-player-stage1-acceptance.md:38（A10 寫實人 IK 須保住 geo 蹲深） |
| R-dive | **試玩裁定**：3bcb6e5（07-23「Sawmah 回報動作太奇怪」→前撲 DIVE_LUNGE 1.35 m、前傾 DIVE_TILT 1.2 rad、diveReach／diveSprawl 現值）、451cd70（「像殭屍」→divePush）、c07bae6（「爬起太快」Sawmah 拍板純視覺）；geoAnimator.js:327-331、matchView.js:35-36 |
<!-- d0:table:end -->

## 四、衝突清單（現況超出範圍，且該姿勢有裁定出處）

| # | 列 | 現況 | 文獻 | 裁定出處與原因 | 若照文獻改會怎樣 |
|---|---|---|---|---|---|
| 1 | `tip.hit.abd` 吊球擊球・肩外展 | 177.3° | 122±9（Reeser 2010 roll shot，女 D-I n=14） | R-tip：這組吊球姿勢是**你本人的帳號**在 09-10 直接加進來的（`fcd15cb`，沒有 Claude 共同作者標記；註解寫「單臂高舉過網延伸」，`geoAnimator.js:144-148`），沒有試玩回報紀錄，但當作你已經決定過 | 擊球臂從「正上方伸直」改為「側上方」，要保住擊球高度需同時加軀幹側傾（`spine.z`，目前 POSES 無此欄位，見第七節） |
| 2 | `tip.hit.elflex` 吊球擊球・肘屈 | 6.9° | 43±12 | 同上 | 擊球時肘仍彎約 43°，「伸直高挑」變成「曲肘推送」 |
| 3 | `tip.hit.hadd` 吊球擊球・水平內收 | 85.9° | 43±15 | 同上 | 上臂從正前方移到冠狀面前約 43°（偏側邊） |

附註：Reeser 的 roll shot 是「動作同扣球、力量小的斜線滾吊」，和指尖輕吊（tip／dink）不完全相同；遊戲註解自稱「Tip／Roll Shot」。若你認定遊戲的吊球是指尖輕吊，這三列可改判「查無對應文獻」。

**潛在衝突**（有明確試玩裁定，但文獻只有定性，無法用數字判超出）：

| # | 項目 | 現況 | 文獻（定性） | 裁定出處 | 說明 |
|---|---|---|---|---|---|
| 4 | 攔網最高點手臂寬度與伸直 | 雙腕 450.0 mm＝肩寬、肘屈 0.0° | 虎口對齊肩寬、手臂打直（`docs/blocking-reference.md` §5，內部文件） | R-block：`aafd231`（07-30）寬臂案否決 | **現況與定性描述一致，不需改**。裁定當時記的 0.426 m 是身高 1.75 m 的量值，本表探針身高 1.85 m：0.450×1.75/1.85＝0.426，同一個姿勢。列出只為提醒 2B 若因其他列調整攔網姿勢，寬度與打直受此裁定保護 |
| 5 | 魚躍整套 | 前撲 1.35 m、前傾 1.2 rad、雙臂前伸（且受發現 1 影響：三個魚躍姿勢的肩 z 已變外展） | 查無數字；現代以 sprawl（快速降到地面、平台伸到球下）與 pancake（手掌貼地）為主，經典 dive 是背弓撐接 | R-dive：`3bcb6e5`／`451cd70`／`c07bae6`（07-23「動作太奇怪」「像殭屍」「爬起太快」） | 屬品味題，無客觀標準可驗；照教學描述改就是推翻 07-23 的三次裁定，需你決定方向 |

## 五、超出範圍但沒有裁定出處（2B 可直接依文獻校準，仍請確認文獻取捨）

- **低手接球（9 列）**：起始幀肘 180.0°（文獻 HS 158.8±11.6）、大腿 13.9°（46.3±6.4）、頭 17.8°（7.2±5.5）；觸球幀大腿 6.3°（30.7±9.3）、膝 159.4°（147.4±10.6）；收勢幀**沒有隨揮**——上臂 3.4°（文獻 85.7±10.8，真人把手臂擺到接近水平）、軀幹 5.1°（20.0±11.3）、大腿 2.3°（18.8±7.2）、頭 3.8°（−6.5±10.0）。收勢幀遊戲已淡回待命（權重 0.083），若要對上文獻需在 `bump` 的 at=1 前加一個隨揮姿勢（時長不動）。文獻取捨題：用 HS（大學 D-I，本表預設）還是 LS 組。
- **高手舉球（3 列）**：裝填肘屈 57.3°（約 100°）、出手肘屈 14.3°（fast／seven 約 40°、quick 約 70°）。文獻是 **n=1、無球、IMU 約值**，證據力弱；遊戲所有舉球共用一支動畫，要對哪一型請你選。出手肩屈 151.3°（pipe 約 150°）在範圍內。
- **扣球（9 列）**：引臂 3 列＝發現 1 的轉體方向；擊球 6 列——肩外展 177.5°（130±8）、肘屈 4.6°（34±10）、水平內收 86.1°（29±14）、肩線 170.0°（137）、髖線 173.1°（157）、髖肩分離 3.1°（20）。注意 ASMI 的外展是**相對軀幹**：真人擊球時軀幹往非擊球側側傾，所以世界座標下手臂仍接近垂直；遊戲軀幹沒有側傾欄位（見第七節）。肩線／髖線的絕對角另假設 root 正對網（比賽中朝向由 `matchView` 的 facingTarget 決定），**髖肩分離與朝向無關、較可靠**。
- **助跑重心下降（1 列，非角度）**：2.55 m/s 時降 0.067 m（3.6% 身高）、4.5 m/s 時 0.104 m（5.6%）；文獻約 0.25 m（12.7%，換到 1.85 m 身高＝0.235 m）。步相下沉乘了跑姿權重 `runW`，所以隨 `matchView` 餵的速度變。
- **發球（6 列）**：跳發與一般發球共用 `spikeHit`，擊球臂同扣球（外展 177.5°、肘屈 4.6°、水平內收 86.1°；跳發文獻 129±11／48±26／23±24，n=5）；飄球 `floatPush` 肘全直 0.0°（50±17）、外展 176.5°（133±11）、水平內收 85.1°（30±16）。Reeser 的飄球未寫站立或跳飄，遊戲飄球是站立。

## 六、sim 綁定、本卷不改（Q4-2）

數字見附錄 B。摘要：扣球起跳弧峰高 0.489 m、離地約 0.85 s（文獻垂直速度 2.91–2.96 m/s ⇒ 彈道約 0.59–0.60 s、升高 0.43–0.45 m，為推導值）；攔網 0.329 m／0.35 s（文獻傳統 0.32±0.05 m、揮臂式 0.38±0.05 m）；跳發 0.539 m（文獻 54.3±9.1 cm，量級相符）；飄球遊戲為站立零跳（文獻跳飄 26.7±4.5 cm）；助跑首步速度（約 2.55 m/s）、擊球高度（約 3.0 m）由 sim 走位與 `contactY` 決定。另：發球擊球幀晚於 sim 擊球（發現 3）、`hit`／`dur`／`airDur`／`jump` 欄位全屬凍結範圍。

## 七、現有骨架表達不了

| 項目 | 文獻 | 說明 |
|---|---|---|
| 肩最大外旋（上臂繞長軸） | 扣球 160±10（斜線）／163±10（直線）、跳發 164±11、飄球 158±12、吊球 129±32（Reeser 2010，ASMI 定義含肩胛胸廓與軀幹後仰貢獻） | 屬 2C `shoulder.y`。**開卷文件 §五寫的「約 90°（研究筆記）」原文查無，2C 凍結前需更正**（本卷不改該檔） |
| 軀幹側傾 | 間接：ASMI 外展 130° 需軀幹側傾才能兼顧擊球高度 | `spine.z` 關節已存在，但只有 `reachAssist` 寫；`POSES` 沒有此欄位。加欄位算 2B 還是 2C 請裁定 |
| 前臂旋前／旋後 | Reeser：擊球時前臂旋前程度決定斜線或直線（定性） | 已告知不做 |
| 手指、手型（舉球窗口、攔網張掌） | 定性 | 已告知不做 |
| 腕角在幾何人上 | Ozawa：拉球期腕背伸（定性） | 幾何人手掌是以腕為心的球體，看不見腕角；寫實人的骨架直接綁同一組關節，看得見 |
| 肩胛上提（攔網「鎖肩上聳」） | 定性 | 已告知不做 |
| 頸左右轉、踝蹠屈 | — | 2C |

## 八、重跑與一致性檢查

```bash
node tools/motion-d0-measure.mjs            # 自我檢查＋量測，寫 docs/experiments/motion-d0-measure.json
node tools/motion-d0-measure.mjs --check    # 驗證第三節與附錄 A、B 兩段產生區塊與重跑逐字一致（不一致 exit 1）
node tools/motion-d0-measure.mjs --md       # 另把兩段產生區塊印到 stdout
```

- 決定論：固定 1/60 s 步長、無亂數、root 不動；JSON 不含時間戳與本機路徑，重跑逐位元相同。
- 量測限制：不含比賽中的夠球補償（`reachAssist`：rally 中軀幹最多再傾 0.30 rad、胸椎轉 0.28 rad、肩偏 0.55 rad；攔網與魚躍時關閉）、魚躍根旋轉、寫實人腿部 IK；肩線／髖線假設 root 正對網；助跑重心下降隨速度而變（主值取 2.55 m/s）；擊球幀取「擊球關鍵幀」時刻（比賽中 `hitLeadTicks` 取整誤差 ≤0.5 tick，sim 實際觸球比預測早 1–9 tick 時由 `catchUpToHit` 追到同一幀，`geoAnimator.js:531-534`）。

<!-- d0:appendix:begin（本區塊由 tools/motion-d0-measure.mjs --write-table 產生，勿手改） -->
### 附錄 A：量法自我檢查（手動設已知角度，容差 ±1°／±1 mm）

| 檢查 | 關節設定（其餘為 0、未經 animator） | 預期 | 量得 | 誤差 | 通過 |
|---|---|---|---|---|---|
| 膝伸直 | rKnee.x=0 | 180.00° | 180.00° | 0.000° | ✅ |
| 膝 90°（2D） | rKnee.x=π/2 | 90.00° | 90.00° | 0.000° | ✅ |
| 膝 90°（3D） | rKnee.x=π/2 | 90.00° | 90.00° | 0.000° | ✅ |
| 大腿前平舉 | rHip.x=−π/2 | 90.00° | 90.00° | 0.000° | ✅ |
| 肘 90°（2D 夾角） | rElbow.x=−π/2 | 90.00° | 90.00° | 0.000° | ✅ |
| 肘屈 90°（3D） | rElbow.x=−π/2 | 90.00° | 90.00° | 0.000° | ✅ |
| 肘屈 34.4°（3D） | rElbow.x=−0.6 | 34.38° | 34.38° | 0.000° | ✅ |
| 上臂前平舉（矢狀面） | rShoulder.x=−π/2 | 90.00° | 90.00° | 0.000° | ✅ |
| 肩屈前平舉（相對軀幹） | rShoulder.x=−π/2 | 90.00° | 90.00° | 0.000° | ✅ |
| 肩屈 150°（相對軀幹） | rShoulder.x=−150° | 150.00° | 150.00° | 0.000° | ✅ |
| 整體前傾 0.5 rad → 軀幹 | root.x=0.5 | 28.65° | 28.65° | 0.000° | ✅ |
| 整體前傾 0.5 rad → 頭 | root.x=0.5 | 28.65° | 28.65° | 0.000° | ✅ |
| 整體前傾 0.5 rad → 大腿（往後） | root.x=0.5 | -28.65° | -28.65° | 0.000° | ✅ |
| 側平舉 → 肩外展 | rShoulder=(0,0,−π/2) | 90.00° | 90.00° | 0.000° | ✅ |
| 側平舉 → 水平內收 | rShoulder=(0,0,−π/2) | 0.00° | 0.00° | 0.000° | ✅ |
| 側平舉前移 30° → 肩外展 | rShoulder=(0,π/6,−π/2) | 90.00° | 90.00° | 0.000° | ✅ |
| 側平舉前移 30° → 水平內收 | rShoulder=(0,π/6,−π/2) | 30.00° | 30.00° | 0.000° | ✅ |
| 正上舉 → 肩外展 | rShoulder=(−π,0,0) | 180.00° | 180.00° | 0.000° | ✅ |
| 骨盆右側後轉 30° → 髖線 | pelvis.y=−π/6 | 150.00° | 150.00° | 0.000° | ✅ |
| 骨盆右側後轉 30° → 肩線 | pelvis.y=−π/6 | 150.00° | 150.00° | 0.000° | ✅ |
| 胸椎再後轉 20° → 肩線 | +spineUpper.y=−π/9 | 130.00° | 130.00° | 0.000° | ✅ |
| 胸椎再後轉 20° → 髖肩分離 | +spineUpper.y=−π/9 | 20.00° | 20.00° | 0.000° | ✅ |
| 零姿勢雙腕間距＝肩寬 | 全關節 0 | 0.4500 m | 0.4500 m | 0.000 mm | ✅ |
| root 上移 0.1 m → 質心上移 | root.y=0.1 | 1.1174 m | 1.1175 m | 0.000 mm | ✅ |

### 附錄 B：sim 綁定項（Q4-2 本卷不改）的文獻值與現況

| 項目 | 文獻值 | 來源 | 現況序列 | 峰值 bodyY（m） | 峰值時刻（s） | bodyY>2 cm 時長（s） |
|---|---|---|---|---|---|---|
| 扣球起跳垂直速度 | RA 2.91、GA 2.96 m/s（無 SD）→ 等效彈道滯空 2v/g＝0.59–0.60 s、質心升高 v²/2g＝0.43–0.45 m（推導） | ZH2017 | windup | 0.489 | 0.450 | 0.850 |
| 扣球助跑首步速度 | 約 2.55 m/s；起跳後水平速度約 1.71 m/s | ZH2017 | （sim 走位） | — | — | — |
| 攔網跳高／滯空 | 傳統 0.32±0.05 m、揮臂式 0.38±0.05 m；垂直速度 2.51±0.21／2.73±0.19 m/s；雙手在網上 0.40±0.04／0.46±0.04 s | FK2014 | blockJump | 0.329 | 0.200 | 0.350 |
| 跳發跳高／擊球高 | 質心跳高 54.3±9.1 cm；垂直速度 3.3±0.4 m/s；擊球高 303.8±28.2 cm | HH2007 | serveJump | 0.539 | 0.417 | 0.817 |
| 跳飄跳高 | 26.7±4.5 cm；2.6±0.2 m/s；擊球高 297.4±32.6 cm（遊戲飄球為站立、零跳） | HH2007 | serveFloat | -0.011 | 0.017 | 0.000 |
| 一般發球跳高 | 查無對應 | — | serve | 0.289 | 0.367 | 0.667 |
| 跳舉跳高 | 查無（本卷未查到量化文獻） | — | overheadJump | 0.302 | 0.350 | 0.567 |
<!-- d0:appendix:end -->

### 附錄 C：量法與一致性檢查的鑑別力（突變驗紅）

自我檢查（附錄 A）是「手動把關節設成已知角度，量出來要對上 ±1°」。為確認它與 `--check` 真的抓得到錯，在暫存副本上各做一種突變（原檔事後以 sha1 比對未變），全部以 exit 1 結束；前三種不寫任何檔：

| 突變 | 紅在哪 | 量得 |
|---|---|---|
| 踝點改用鞋盒中心（前移 0.05 m） | 自我檢查：膝伸直、膝 90°（2D／3D） | 173.52°／96.48°／96.48°（預期 180／90／90） |
| 肩線／髖線定向取反（`atan2(hz, −hx)`） | 自我檢查：髖線、肩線、髖肩分離 4 項 | 210°／210°／230°／−20°（預期 150／150／130／20） |
| 水平內收兩軸對調 | 自我檢查：側平舉、側平舉前移 30° | 90°／60°（預期 0／30） |
| 表中把 `bump.contact.knee` 現況 159.4° 改成 149.4° | `--check`：table 區塊不一致，指出該行表中值與重跑值 | 重跑值 159.4° |

反向（健康時要綠）：未突變的原檔自我檢查 24 項全過（附錄 A），`--check` exit 0。

### 附錄 D：研究筆記的更正對照

| 筆記寫法 | 核對結果 |
|---|---|
| 扣球數字來自「Wagner et al. 2009」（經 PMC5548173 抓取） | PMC5548173 是 **Zahálka et al. 2017**（J Hum Kinet 58:261–271）；Wagner 2009 只是其參考文獻 24。數字（2.55 m/s、0.25 m、2.91／2.96 m/s、105°、137／150°）屬 Zahálka |
| 「最大後擺肩角 105°、擊球肩角 137–150°」 | 是**左右肩連線相對網的水平夾角**（軀幹轉向），不是肩關節屈曲或外展；同一段的 157°／164° 是髖線 |
| 「cocking 期肩外旋約 90°」（ResearchGate 231215653） | 該篇即 Reeser 2010（PMC3445065），**原文查無「90°」**；最大外旋為 158°～164°（吊球 129°）。「2594 °/s」屬實（直線扣的肩內旋角速度 2594±772） |
| 低手接球「軀幹 19.8°、肘 172°、膝 147°、肩屈 50.7°（組別未確認）」 | 全屬 **HS 組（NCAA D-I 女，n=7）觸球瞬間**；「肩屈 50.7°」原文是「上臂相對鉛直」的傾角。筆記正文寫「PDF 為圖片、未取得數字」——PDF 其實有 OCR 文字層，Table 2 已以頁面影像逐格核對 |
| 舉球「肩屈最大約 150°（pipe）、快球肩相關角度與肩旋轉峰值約 60°」 | 150° 屬實但為 **n=1、無球**；「快球約 60°」原文是**肘**屈（雙臂上舉時），肩旋轉峰值約 60° 屬 high back／back-row 舉球，fast 約 50° |
| 攔網（Ficklin 2014）、發球（Huang & Hu 2007）數字 | 屬實（見來源表）；發球 PDF 的 Table 3 文字層錯位，已用版面座標對齊核對 |
| 未採用、未開原文的 4 項 | 肘伸展時間窗 24–32 ms（doi 10.1177/17479541231211679）、跳飄接觸點高 40–60 cm（MacKenzie 2012）、拋球高度 30–60 cm（volleyballmag）、低手接球關節相關係數（ResearchGate 262001997）——本表未使用，也未核實 |
| 定性檢核表（Antigravity 規格書） | 原檔已不存在（該 Antigravity 對話紀錄第 4 步使用者要求移除）；本卷只從對話紀錄讀了第二節動作拆解當定性參考，未引用其任何數字，也未存進 repo |
