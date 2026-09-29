# R12 量尺方交付：量尺改讀畫面實際畫出的一般 Mesh、重驗 R3–R11、正式驗收 HEAD 9f176360

> 依據：`docs/kickoffs/real-skin-acceptance.md` 修訂紀錄 R12–R14，未修改驗收文件。
> - 受測版本：feat/real-skin HEAD **9f176360**，CPU DQS 蒙皮加 SDF 碰撞修正寫進一般 Mesh（實作 commit 72c7d791；寫實模式預設面數 5k）。
> - 本輪只動量尺，src 未改動。

## 結論

- **量尺改讀完成**。舊錨點（SkinnedMesh）在新工具下的輸出與先前提交的輸出，除雜湊行外逐位元相同，R3–R11 的鑑別結論都沒變。新路徑的攻擊突變全部停止或判紅，包括 S12 審查追加的「擋掉 `.sdf.glb`」，node 與瀏覽器兩端都驗過。
- **HEAD 9f176360 正式驗收**：
  - 20k、5k 都過：S1、S2、S3、S5、S6、S7、S8、S9、S11、S13；S4 只量 20k，過。
  - **S14 紅**（20k、5k 各 9 幀不過）。依 R13／R14 不在這裡簽准，交給 S10 由使用者在比賽鏡頭下判定。

## 一、改讀法（工具）

| 檔案 | 改動 |
|---|---|
| `tools/real-skin-penetration-v2.mjs` | `isRenderedMode`、`assertRenderedMesh`、`assertMeshBody`、`assertSameSkinning`，細節見表後 |
| `tools/real-skin-torso-drag.mjs`、`real-skin-armpit-web.mjs` | 權重讀 `setup.G`（新：綁定幾何；舊：畫面 SkinnedMesh 幾何），骨架讀 `real.p.skeleton` |
| `tools/real-skin-measure-rendered.mjs`（新檔） | S1／S4 用。驗收規定 `real-skin-measure.mjs` 與 lib 相對 2da331f 不得改動，所以另開這支驅動，詳見表後 |
| `tools/real-skin-r7-judge.mjs` | 加入 R9 的 S2 判定；S2／S3 現況檔預設改為 `R12/baseline/before-*` |
| `tools/real-player-browser.mjs`（S6） | 頁內 `installRulerRead`，詳見表後 |
| `tools/real-match-browser.mjs`（S7） | 讀法與斷言，詳見表後 |

**`tools/real-skin-penetration-v2.mjs`**
- `isRenderedMode`：判斷受測網格是 SkinnedMesh（舊錨點）還是一般 Mesh。
- `assertRenderedMesh`，在載入時、每一組遊戲參數、每一幀都檢查：
  - 網格是一般 Mesh；`renderedPositions()` 就是 `mesh.geometry.attributes.position.array` 本身。
  - `bindGeometry` 是量尺載入的那一份 asset.geometry，index 是同一物件。
  - 屬性只有 color、normal、position；沒有 morph；`matrixWorld` 是單位矩陣。
  - `skinStats().collide === true`（S12 審查 MEDIUM 追加）。
- `assertMeshBody`：沒有子物件、可見、沒有渲染 hook、網格沒有父層、`rig.root` 底下沒有其他可畫物件。
- `assertSameSkinning`：遊戲參數受測者照抄量尺受測者的姿勢後，在根座標下逐點位置相同（容差 1e-5 m），用來擋「依參數分岔」。
- S12 MEDIUM 另一半：`loadSetup` 要求 `weightsSource === 'baked'`、`sdfSource === 'baked'`，而且 `collide` 存在。
- P1 直接讀畫面陣列。舊 SkinnedMesh 路徑的邏輯不變。

**`tools/real-skin-measure-rendered.mjs`**
- 同一份 lib 計算函式、同一個順序，只把 P1 換成畫面陣列；先走 `loadSetup` 做全部斷言。
- 在 8720597 上和 `R7/s1-base` 的 keys／weights／sole／region 逐值相同（`baseline/mr-vs-measure.txt`）。

**`tools/real-player-browser.mjs`（S6）**
- 新模式讀畫面陣列乘 `matrixWorld`。
- 預覽頁沒有對外暴露 bindGeometry、skeleton、updateSkin，所以在頁內用同一個模組重建。重建後斷言每位球員的 index 逐值相同，並做一般 Mesh 的各項斷言。
- A2(c)：改用同模組重建一名同參數球員，擺回綁定姿勢後呼叫 updateSkin 再量。**這是超出字面的讀法。**
- 頁面 console 出現 `[real-skin]` 警告就記為錯誤（S12 MEDIUM）。

**`tools/real-match-browser.mjs`（S7）**
- `getV`、`bindPosOf`、`rulerCheck`：每次取樣都做斷言，包括 `skinStats().collide`；結果寫入 `report.rulerRead`。
- `checkColors`：軀幹範圍改用綁定位置選取。第一次跑 S7 5k 時，這裡誤用蒙皮後座標，導致 B5 color 為 false；修正後已重跑。
- `facesStayed20k` 改為 `facesStayedDefault5k`（faces===5000）：R14 把預設值改成 5k，判準「節流下不自動降級、維持預設」本身沒變，**不是放寬**。
- `REALMATCH_FACES=20k` 帶 `&faces=20k`，每個 session 記錄實際面數。
- runSession 的 console 出現 `[real-skin]` 警告就記為錯誤。

**S11 判讀**
- r 依 R4 用受測權重的軀幹三骨、以 LBS 計算；s 改用畫面位置（DQS 加碰撞修正）。
- R4 原意 d≈0 的那群頂點（只帶軀幹三骨權重）：|s−r| 最大 20k 0.76 cm、5k 0.65 cm，超過 2 cm 的點數為 0。若 s 改用 LBS，差為 0.0000 cm（`formal/s11-dqs-vs-lbs-diag.txt`）。
- **判讀：大致符合 R4 原意。** 剩下的只是 DQS 與 LBS 在軀幹骨混合上的差，量級 ≤0.8 cm，碰不到 2 cm 的判準。

## 二、重驗

**舊錨點（SkinnedMesh）**，產物在 `baseline/`、`anchor/`：
- 8720597 用新工具重產 before、f-base、s13-base、s14-base，與已提交的輸出相比，排除雜湊行後差異 0 行。verify V0–V4、V6 與 v4 圖共 10 檔，和 dbf4ee9 逐位元相同。
- heat、heatTorsoOnly、heatNoArm、heatNoLeg、heatUpper、mutRS，以及 L／H／F／H7 的 s13 與 F／H7 的 s14：排除雜湊行後差異同樣 0 行。
- 結論沒變：
  - S11：heat 紅、heatTorsoOnly 綠、突變 r＝s 轉綠。
  - S13（非手臂骨權重）：L 0.909／0.887 紅；F、H7 0.651／0.629 紅；8720597 綠。
  - S14：F 紅，8720597 綠。

**新路徑攻擊突變**：在 HEAD 拋棄式副本上以環境變數切換，src 突變全文見 `mutations/r12-mutations-src.diff`。

| 突變 | penetration-v2／torso-drag（20k、5k） | measure-rendered（5k） |
|---|---|---|
| 依參數分岔：身高≠1.85 關掉碰撞修正 | 停止（同姿勢最大差 2.3／2.9 cm） | 停止 |
| 依參數分岔：自由人改一個頂點 | 停止（1.0 cm） | 停止 |
| 另掛 mesh：掛在骨架根 | 停止 | 停止 |
| 另掛 mesh：網格子物件 | 停止 | 停止 |
| 每幀把 position 換成綁定姿勢 | 停止（renderedPositions≠畫面陣列） | 停止 |
| renderedPositions 回傳副本 | 停止 | 停止 |
| 網格位移、隱藏、加 morph | 停止 | 停止 |
| EVIL2、三角形反轉、權重總和錯 | 停止 | 停止 |
| 擋掉 `.sdf.glb` 讀取（S12 MEDIUM） | 停止：「距離場來源為 none」 | 停止 |
| 擋掉 `.weights.glb` 讀取 | penetration-v2 停止：「權重來源為 computed」 | 未跑 |

- 日誌：`mutations/mutations.log`、`mutations-measure-rendered.log`、`mutations-sdf.log`。
- **瀏覽器端擋掉 `.sdf.glb`（S12 MEDIUM 驗紅，`mutations/browser-nosdf-*`）**：拋棄式副本的 src 已還原為 HEAD，只把 `player_5k.sdf.glb` 移走。
  - S6：停止，exit 1，訊息為「[ruler] 權重來源 baked／距離場來源 none（應皆為 baked）」。
  - S7（SEEDS=1）：`pass.rulerRead=false`，每位寫實球員都報「碰撞修正未啟用」；B2=false，因為 console 警告「[real-skin] 軀幹距離場不採用」被攔下。
  - 第一次嘗試作廢：當時副本的 src 還帶著突變碼（`process.env` 在瀏覽器不存在），寫實模型載入失敗，量到的不是擋 sdf 的情境，已丟棄。
- 對照（未突變 HEAD，改完斷言後短跑）：
  - `formal/s7-short-{5k,20k}`：B2–B7、H1、rulerRead 全 true，各 session 實際面數分別是 5000／20000。
  - `formal/s6-postpatch`：A1–A6、A9–A12 全 true，A8 略過截圖。

## 三、正式驗收 HEAD 9f176360（`formal/`）

| 條 | 指令（在 repo 根目錄） | 關鍵數字 | 判定 |
|---|---|---|---|
| S1（R7） | `node tools/real-skin-measure-rendered.mjs --faces=<f> --json=formal/m-<f>.json`；`node tools/real-skin-r7-judge.mjs --faces=<f> --s1=formal/m-<f>.json --pen=formal/pen-<f>.json --penbase=<baseline/before-<f>.json>` | 20k 最差 K1b 250/5.27、K1a 314/4.99，全靠 (ii)；5k 最差 K1b 66/5.40，全部 ≤6.0 | 過 |
| S2（R9） | `node tools/real-skin-penetration-v2.mjs --faces=<f> --baseline=baseline/before-<f>.json` 加 judge | K1a 20k 右 3/1.4、左 6/0.7；5k 右 0、左 2/0.8；其餘各項都 ≤現況或在門檻內 | 過 |
| S3（R7） | judge | K4a 20k 右 20/1.1、5k 右 8/1.3；K4b、K4c 兩臂 0 | 過 |
| S4（20k） | 讀 `formal/m-20k.json`（`s4-20k.txt`） | 最大扭跳 K1a 5.10、K2b 4.48、K1b 2.15；蒙皮總扭轉差 ≤1.1°；關節扭轉和逐值相同 | 過 |
| S5 | `git diff 55cc61b -- src/render/geoAnimator.js src/render/geoCharacter.js src/sim`；`node tools/motion-d0-measure.mjs`（跑完已還原 json）；`node tools/motion-2b-check.mjs --d0-json formal/s5-d0.json --out formal/s5-check.json` | diff 0 bytes；E2(a) 39 項全在範圍內；`{"e2b":true,"e3":true,"e4":true,"e6":true,"all":true}` | 過 |
| S6 | `A7_SKIP_TESTS=1 A7_SKIP_BUILD=1 node tools/real-skin-with-vite.mjs -- node tools/real-player-browser.mjs` | A1–A6、A8–A12 全 true，A7 刻意略過、不屬於 S6。rendered 讀法，頁面錯誤 0 | 過 |
| S7 | `node tools/real-skin-with-vite.mjs -- node tools/real-match-browser.mjs`（預設 5k）；另跑 `REALMATCH_FACES=20k`（略過截圖、B8b、B9） | 5k：B2–B9、B12、H1、rulerRead 全 true；B8b faces=5000。20k：B2–B7、H1、rulerRead 全 true | 過 |
| B1 | `step5/final/b1/b1-ui-check.mjs` | 預設幾何→點擊變寫實→localStorage=real→重整仍寫實→快速比賽 real | 過 |
| B10 | `npm run build` | 10.2 s；`dist/sw.js` 預快取 20k／5k 的 weights.glb 與 sdf.glb | 過 |
| S8 | measure 的 sole 欄；`node tools/real-skin-loadtime.mjs` | 鞋底非零影響 20k 523、5k 125，和現況相同；熱擴散與 SDF 求解只在 tools/；載入中位數 20k 660 ms、5k 381 ms（多個背景行程同時跑，只供參考） | 過 |
| S9 | `node tools/npm-test-with-provenance.mjs formal/npm-after.txt`；`node tools/sim-hash-probe.mjs` | `ℹ tests 2613`、`ℹ pass 2613`、`ℹ fail 0`；sim 雜湊合計 0a948ad2b9895d49＝基準 | 過 |
| S11 | `node tools/real-skin-torso-drag.mjs --faces=<f> --baseline=baseline/f-base-<f>.json` | 20k、5k 各 9 幀全綠，例如 K1a 67/7.1（上限 168/8.5） | 過 |
| S13（R10／R11） | `node tools/real-skin-arm-follow.mjs --faces=<f>` | 20k 0.468／0.368，5k 0.462／0.313（門檻 ≤0.50） | 過 |
| **S14** | `node tools/real-skin-armpit-web.mjs --faces=<f> --baseline=baseline/s14-base-<f>.json` | 20k、5k 各 9 幀不過，例如 K4b 20k 右 177/6.4（上限 39/6.9）、左 147/5.8 | **紅，不簽准，交 S10** |

**A2(c) 20k 讀數**
- 20k：0.84443 mm，三次相同（`s6-report`、`s6-rerun2`、`s6-rerun3`），另有 postpatch 那次。5k 三次都約 0。門檻是 1 mm。
- 成因（`formal/a2c-bindpose-diag.txt`）：20k 在綁定姿勢時碰撞修正會推一組頂點，hits 1、maxPush 0.844 mm，42 個頂點移動超過 1 µm，最大在頂點 1903，位於右上臂內側貼軀幹處。5k 沒有碰撞。

## 四、檔案

- `baseline/`：8720597 在新讀法下重產的現況。S2／S3／S11／S14 以此為準，S1 仍用 `R7/s1-base`。
- `anchor/`：舊錨點重驗。
- `mutations/`：突變日誌與 src 突變 diff。
- `formal/`：正式驗收產物，包括 S6 截圖、S7 5k 截圖、各項日誌與報告。
