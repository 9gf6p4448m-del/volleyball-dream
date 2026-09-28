# 寫實蒙皮修正：最終驗收回報（2026-09-29，驗收修訂 R7／R8／R9 之後）

> 驗收依據：`docs/kickoffs/real-skin-acceptance.md`，含 R1–R9，本卷未修改。
> 量尺、判定腳本、baseline 都未修改，包括 `real-skin-penetration-v2`、`real-skin-torso-drag`、`real-skin-arm-follow`、`real-skin-r7-judge`、凍結集合、`ruler-v2/R3/frozen-rerun`、`R3/R4/f-base`、`R7/s1-base`。
> 實作 commit：feat/real-skin **54e8d574**。它的權重和候選 H7（e669a59a）逐位元相同，只拿掉了沒用到的半轉骨，骨表 20→18。
> 證據：`docs/experiments/real-skin-evidence/step5/final/`（下稱 `final/`）。S10 對照圖在 `step5/compare/`。

## 結論

**S1–S9、S11、S13 在 20k 與 5k 全過**，各條依 R7／R8／R9 判定。S12 待主對話另派對抗審查，本報告 §五 列出 src diff。S10 待使用者看截圖。

**畫面上有一個量尺沒抓到的問題，先請使用者看。**
- 在接球預備（K4b）與扣球引臂（K1a），上臂內側會出現膚色的薄片：從腋下連到上臂，貼著軀幹。
  - K4b 見 `step5/compare/5-待命接球-K4b.png` 右圖，兩臂內側都有。
  - K1a 見 `1b-…左臂胸口近拍-正前.png` 右圖，左胸腋下是一道深色凹陷，這就是 R9 放寬的那塊。
- 原因是夾角輔助骨：上臂內側有一半的皮綁在它上面，手臂往前下方伸時，這塊內側皮留在胸側。
- S13 量的是軀幹骨權重；這塊皮綁的是輔助骨，不算軀幹骨，所以 S13 讀不到它。
- 這是 S10 要判斷的事，我沒有修。

## 各條結果（指令都在 repo 根目錄，HEAD 54e8d574）

| 條 | 指令 | 關鍵數字（20k；5k） | 判定 |
|---|---|---|---|
| S1（R7） | `node tools/real-skin-measure.mjs --faces=<f> --variants=base --json=final/m-<f>.json`，再跑 `node tools/real-skin-r7-judge.mjs --faces=<f> --s1=final/m-<f>.json --pen=final/pen-<f>.json --txt=final/judge-<f>.txt` | 拉伸 >2× 數／P99：K1a 183/4.44、K1b 170/4.59、K2a 57/2.51、K2b 191/4.05、K3a 5/1.60、K3b 0/1.57、K4a 0/1.25、K4b 34/2.22、K4c 99/3.05。5k：K1a 63/4.62、K1b 45/5.28、K2b 61/4.84、K4c 33/3.59，其餘更小。都在現況之下，P99 ≤6.0 | 過（9 幀×2） |
| S2（R9） | `node tools/real-skin-penetration-v2.mjs --faces=<f> --baseline=docs/experiments/real-skin-evidence/ruler-v2/R3/frozen-rerun/before-<f>.json` | (i) K1a 右 4/1.3、左 38/3.6（上限 40／4.0）；5k 右 0、左 3/3.1（上限 5／3.5）。其餘幀量尺列「退步」只有 K1a 左一項，其他 16 項都 ≤ 現況。(ii) K3a、K3b、K4a 兩臂 0。(iii) K4b 右 1/0.0、K4c 右 2/0.6，左都是 0；5k 都是 0 | 過 |
| S3（R7） | judge | K4a 右 19/1.1（現況 375/8.2）、左 0；5k 右 8/1.3（現況 89/7.8）。K4b、K4c 兩臂 0 | 過 |
| S4 | measure 20k | 最大扭跳 K1a 5.18°、K2b 4.55°（≤6.0）、K1b 2.12°（≤4.31）。蒙皮總扭轉 K1a −53.91、K1b −26.99、K2b −47.33，現況 −54.94、−28.04、−48.37，差 ≤1.05°。關節扭轉總和 −77.35、−51.98、−71.49，與現況相同 | 過 |
| S5 | `git diff 55cc61b -- src/render/geoAnimator.js src/render/geoCharacter.js src/sim`；`node tools/motion-d0-measure.mjs`（跑完 `git checkout -- docs/experiments/motion-d0-measure.json`）；`node tools/motion-2b-check.mjs --d0-json final/s5-d0-after.json --out final/s5-check-after.json` | diff 0 bytes；E2(a) 39/39 範圍內；`{"e2b":true,"e3":true,"e4":true,"e6":true,"all":true}`，exit 0 | 過 |
| S6 | `A7_SKIP_TESTS=1 A7_SKIP_BUILD=1 REPORT_NAME=… node tools/real-skin-with-vite.mjs --port=5193 -- node tools/real-player-browser.mjs` | A1–A6、A8–A12 全 true（A8 有拍截圖，見 `final/s6-shots/`）。A2(d) 手臂 7.95°；A2(a) 0.001 m；A2(e) 0.116／0.115 m。exit 1 只因為 A7 被刻意略過，A7 不屬於 S6 | 過 |
| S7 | `REPORT_NAME=… node tools/real-skin-with-vite.mjs --port=5194 -- node tools/real-match-browser.mjs`；B1 另跑 `final/b1/b1-ui-check.mjs`；B10 跑 `npm run build` | B2–B9、B12、H1 全 true。B5 三個 seed 的 `b5PlateOk` 都是 true（背號 ≤0.06 m，樣本 15764／15316／16380）。B1：UI 預設幾何→點擊變寫實→localStorage＝real→重整仍寫實→快速比賽 appearance＝real，pass。B10：build 在 41.3 s 完成，`dist/sw.js` 預快取含兩個 `.weights.glb`；npm test 見 S9。B11 依條文由使用者手機量測 | 過（B11 除外，本來就不由本卷判） |
| S8 | measure 表頭；`node tools/real-skin-loadtime.mjs` | 熱擴散求解只在 `tools/bake-real-skin-weights.mjs`，20k 與 5k 烘焙檔都在。鞋底 IK 影響頂點 523（5k 125），不變。載入耗時中位數：20k 21.7 ms、5k 7.4 ms；改前為 39.8、11.8 ms。兩次在不同時間、不同機器負載下量，只供參考 | 過 |
| S9 | `node tools/npm-test-with-provenance.mjs final/npm-after.txt`；`node tools/sim-hash-probe.mjs` | tests 2613、pass 2613、fail 0（開工時 2613）。來源紀錄 head 54e8d574、工作區乾淨。sim 雜湊合計 0a948ad2b9895d49，與基準相同 | 過 |
| S11 | `node tools/real-skin-torso-drag.mjs --faces=<f> --baseline=docs/experiments/real-skin-evidence/ruler-v2/R3/R4/f-base-<f>.json` | 9 幀全過。例如 K1a 82 點／7.5 cm，上限 168／8.5；5k K4b 23 點／6.4 cm，上限 55／7.4 | 過 |
| S13 | `node tools/real-skin-arm-follow.mjs --faces=<f>` | 右 0.471、左 0.371；5k 右 0.462、左 0.317（門檻 ≤0.50） | 過（右臂只差門檻 0.029） |

## S10 對照截圖（`step5/compare/`）

- 工具：`step5/compare/tool/compare-page.html`、`compare-shots.mjs`、`compose.py`。
  - 兩邊走同一條真實路徑：`lib.makeReal`，也就是 createRealPlayer 加 geoAnimator 逐幀驅動，再 groundLegs。
  - 左圖在拋棄式工作樹 8720597 拍，右圖在最終版拍。20k，不加標色。
  - 原圖在 `raw/`，拍攝參數在 `manifest-*.json`。
- 並排圖共 8 張：
  - 1 扣球引臂 K1a；1b、1c 是左臂胸口近拍（正前、左前）；
  - 2 揮臂 K1b；
  - 3 發球起手 K2b；
  - 4、4b 跑步擺臂（後擺、前擺）；
  - 5 待命接球 K4b。

## 五、src diff（`git diff 9c66afe 54e8d574 -- src`，只動 src/render/realPlayer.js，+129／−4；供 S12 審查）

| 位置（54e8d574） | 改動 | 理由 |
|---|---|---|
| :58、:66、:70 | BONES 末尾加 `rArmAux`、`lArmAux`，父骨＝spineUpper；`AUX` 表對應到肩 | 肩部輔助骨（R2）。加在末尾，原 16 骨的索引不變 |
| :141 | `computeSkinWeights` 遇到沒有骨段的骨就跳過 | 輔助骨不參與舊的自動權重（讀不到烘焙檔時的後備路徑） |
| :241–304 | `WEIGHTS_FORMAT`、`positionHash`、`loadBakedWeights`：fetch `<glb>.weights.glb`；格式、骨名、頂點數、位置雜湊、骨索引任一不符 → console.warn，退回 computeSkinWeights | S8：熱擴散只在 tools/ 求解，src 只讀烘焙檔。量尺（node）與瀏覽器讀同一個檔 |
| :306–325 | 幾何讀取拆成 `loadRealGeometry` | 烘焙器重用同一份縮放、貼地、法線 |
| :328–347 | `loadRealPlayerAsset` 改成「烘焙權重 ?? computeSkinWeights」；回傳加 `weightsSource` | 同上。部位上色與接縫拆分用烘焙檔內存的現行主骨 |
| :443、:463 | `computeBind`：輔助骨的位置與綁定旋轉照抄對應的肩 | 不移肩、不平移 |
| :515–517 | `createRealPlayer`：每側建一個 Object3D，掛在 joints.spineUpper | 輔助骨實體。掛在骨架上，不是 mesh 子物件 |
| :480–487 | 常數 TWIST_SHARE 0.5、AUX_MIN 30°、AUX_SOFT 5° | 扭轉分段；夾角輔助骨 |
| :636–645 `splitTwist` | 把 spineUpper 的 Euler y 移一半到 spine，再反解 spineUpper，使胸節世界朝向不變；同一幀重入不重套 | 使用者裁定的扭轉分段（S4），總扭轉不變 |
| :647–664 `updateAux` | 輔助骨＝C·q_shoulder；C 把上臂方向在胸節框架內的外展角軟性夾到 ≥30° | 輔助骨逐幀驅動，只讀肩的旋轉 |
| :667、:676 | `retargetArms` 開頭呼叫 splitTwist，每側外展後呼叫 updateAux（仍由 groundLegs 開頭既有的呼叫點進入） | 接線 |

- 沒有依參數分岔，沒有 mesh 子物件，沒改可見性或渲染 hook，沒有 onBeforeCompile、morph 或自訂著色器，也沒有在 createRealPlayer 之後換 geometry。
- 另有工具與資料，都在同一個 commit：`tools/bake-real-skin-weights.mjs`（同指令重跑逐位元相同）、`public/models/real/player_{20k,5k}.weights.glb`。

## 分支

- `feat/real-skin`：54e8d574 是實作，其後一個 commit 是本報告與證據。
- `feat/real-skin-wip2`、`feat/real-skin-wip3` 只保留歷史，不需合併。
- 沒有 push、沒有部署。拋棄式工作樹 8720597 已移除，它的 node_modules junction 用 rmdir 拆掉。

---

# （前一輪）步驟⑤停手回報（2026-09-29，驗收修訂 R7／R8 之後）

> 依據：驗收修訂 R7（c075fb7）、R8（8edaa6a）。量尺、判定腳本、baseline 未修改：
> `tools/real-skin-r7-judge.mjs`、`tools/real-skin-arm-follow.mjs`、`ruler-v2/R7/s1-base-*.json`。
> 證據在 `docs/experiments/real-skin-evidence/step5/`（下稱 `step5/`）。
> 候選 H7＝分支 `feat/real-skin-wip3` e669a59a，是在 feat/real-skin ef5d98d 上帶入候選 H 的檔案，再把手臂熱擴散常數 c 由 1 改為 0.7。

## 結論（先讀這段）

主對話交辦的子任務「5k K1b P99 ≤6.0」**已修好**：候選 H7 的 5k K1b 從 6.14 降到 5.28。
但 **S2(i) K1a 左臂退步仍在**，而且這一條 R7／R8 都沒有改。它在候選 H 就已經紅（上一輪報告 §一、§三 3.3），上次派工沒有提到。
我試了兩種修法，兩次都更差，所以依規則停手。因此**沒有**整理乾淨 commit 到 feat/real-skin，**沒有**補跑 S7、S9、S8 載入耗時、S6 A8 截圖，也**沒有**拍 S10 對照圖。

### H7 在正式量尺上的結果（20k；5k）

| 條 | 指令 | 結果 | 判定 |
|---|---|---|---|
| S1（R7） | `node tools/real-skin-measure.mjs --faces=<f> --variants=base --json=…`，再跑 `node tools/real-skin-r7-judge.mjs --faces=<f> --s1=… --pen=…` | 20k、5k 各 9 幀全過。5k K1b 45 個／P99 5.28（現況 74／31.76，上限 6.0） | 過 |
| S2(i) | `node tools/real-skin-penetration-v2.mjs --faces=<f> --baseline=…/R3/frozen-rerun/before-<f>.json` | 退步 1 項：**K1a 左 38 點／3.6 cm**，現況 6／1.4；5k **3 點／3.1 cm**，現況 0／0.0 | **不過** |
| S2(ii)(iii) | 同上 | K3a、K3b、K4a、K4b、K4c 全過 | 過 |
| S3（R7） | judge | 過 | 過 |
| S4 | measure 20k | 最大扭跳：K1a 5.18°、K1b 2.12°、K2b 4.55°。蒙皮總扭轉與現況差 1.03／1.05／1.04°。關節扭轉總和與現況相同 | 過 |
| S11 | `node tools/real-skin-torso-drag.mjs --faces=<f> --baseline=…/R4/f-base-<f>.json` | 9 幀全過 | 過 |
| S13 | `node tools/real-skin-arm-follow.mjs --faces=<f>` | 右 0.471、左 0.371；5k 右 0.462、左 0.317（門檻 ≤0.50） | 過（右臂餘裕 0.029） |
| S8 鞋底 | measure 表頭 | 523（5k 125），不變 | 過 |

- S5、S6 沒有在 H7 上重跑。S5 不動 geo 與 sim，在任何候選上都不變；S6 在候選 H 上 A1–A6、A9–A12 全過，H7 只改了手臂權重的熱擴散常數。
- 完整輸出：`step5/candH7/`（pen、f、m、s13、judge）。

### S2(i) K1a 左臂：兩次修法與結果

- **問題**（`step5/k1a-left-diag-20k.txt`）：
  - K1a 是引臂，左肩 x 旋轉 −1.90 rad，約舉起 109°。
  - 穿入點都在上臂內側 t 0.4–0.6。這些頂點帶 0.3–0.45 的 spine／spineUpper 權重，其餘給 lArmAux（舉高時等於上臂）。
  - 舉臂約 110° 時，軀幹和上臂兩個變換做線性混合，會塌到弦中點附近，所以陷進胸口 3.6 cm。
  - 現況的權重在 t 0.5 沒有軀幹權重，所以不會穿入。
- **修法 1**：上臂 t∈[0.3,0.5]（或 [0.2,0.6]）的軀幹權重依 smoothstep 改給半轉骨 ArmHalf（`HALF_T`）。
  - 結果：K1a 左 20k 20 點／4.4 cm，仍然退步。
  - 還連帶讓 S1 多幀、S2(ii)(iii) 多幀轉紅：K1b P99 11.57；K3a／K4a 手臂垂下時上臂又穿入。原因是手臂下垂時，把上臂留在胸外的正是這一份軀幹權重。
- **修法 2**：同一份軀幹權重改給夾角輔助骨 ArmAux（`HALF_BONE: 'ArmAux'`）。
  - 結果：K1a 左 20k 14 點／5.7 cm，最深值反而增加；S1 六幀轉紅，K1b P99 13.61。
- 兩次紀錄：`step5/variants.log`。
- 衝突點：上臂內側那份軀幹權重同時在回答兩個相反的要求——手臂垂下時要它把皮撐在胸外（S2(ii)(iii)），舉高時又不能有它（S2(i) K1a）。LBS 的固定權重做不到依姿勢切換。
- 可能方向（未實作，供裁定）：
  - 甲：再加一根依姿勢驅動的輔助骨，垂下時等於軀幹、舉高時等於上臂。這會是第 3 種肩部輔助骨，需確認仍在 R2 的許可範圍內。
  - 乙：S2(i) 對 K1a 改成有上限的「不比現況差」，比照 R7 對 S1 的做法。

---

# （前一輪）步驟④第二輪停手回報（2026-09-29）

> 驗收檔：`docs/kickoffs/real-skin-acceptance.md`（S1–S12、修訂 R1–R6，本輪未修改）。量尺用 R6 定稿版
> （`tools/real-skin-penetration-v2.mjs`、`tools/real-skin-torso-drag.mjs`，未修改）；baseline 用 repo 內 8720597 產生的
> `ruler-v2/R3/frozen-rerun/before-{20k,5k}.json`（S2(i)）與 `ruler-v2/R3/R4/f-base-{20k,5k}.json`（S11）。
> 前一輪停手回報（K4b 舊量尺誤判）見 `git show 2f9c2a0:docs/experiments/real-skin-fix-report.md`。
> 證據一律在 `docs/experiments/real-skin-evidence/step4/`（下稱 `step4/`）。

## 一、結論

**沒有任何一版同時通過 S1–S11，停手回報。** 最佳的「手臂確實跟著手臂走」候選 H（分支 `feat/real-skin-wip2` f32d163）：

- **過**：S2(ii)、S2(iii)、S4、S5、S6（A1–A6、A9–A12；A8 未拍照）、S11，20k 與 5k 皆同。
- **沒過**：
  - **S1**：20k 6 幀、5k 6 幀超標（最差 20k K1a >2× 223 個／P99 5.16，門檻 ≤30／≤2.5）；
  - **S2(i)**：K1a 左臂退步（20k 31/4.0 cm > 現況 6/1.4；5k 3/2.3 > 0/0.0），其餘 17 項 ≤ 現況；
  - **S3**：K4a 右手（20k 22 點／1.1 cm、5k 8 點／1.3 cm，門檻 ≤10／≤1.0）。
- **沒跑**：S7（2A）、S9（npm test／sim-hash），因為沒有可交付的版本；S8 只查了鞋底 IK 頂點（523，不變）與烘焙檔存在，載入耗時沒量。
- **S12**：無可交付 diff；WIP 的 src 改動逐處列在 §五，供之後審查。

另一版 L（9f44005，手臂熱擴散常數 c=0.03）在量尺上 S1、S2、S3、S11 全綠，但那是**假綠**：
上臂中段（t=0.5）的軀幹權重平均 0.85、肘 0.59（`step4/follow-LH.txt`），手臂皮沒跟著手臂走——正是使用者說的「手臂黏在身上」。
截圖 `step4/cand-L-9f44005/s6-shots/side-spike-land-deepest.png` 看得到上臂皮留在軀幹旁、前臂從鼓起的袖口垂出。
它另外 S4 蒙皮總扭轉差 7°（K1a −48.2° vs 現況 −54.9°，門檻 2°）、第一階段 A2(a)(e) 紅（腕群偏移 0.118／0.143 m > 0.05；手離腕 0.164／0.177 m > 0.15）。
**已棄用**：feat/real-skin 上沒有保留（見 §六 分支）。

根因是兩組驗收條件互相衝突（§三）。依規則沒有第三次硬試，也沒有放寬任何條件。

## 二、各條結果（候選 H；指令皆在 feat/real-skin-wip2 f32d163 的 repo 根目錄執行）

| 條 | 指令 | 關鍵數字（20k；5k） | 判定 |
|---|---|---|---|
| S1 (a) | `node tools/real-skin-measure.mjs [--faces=5k] --variants=base --json=…` | >2× 數／P99：K1a 223/5.16；K1b 195/5.36；K2a 76/2.84；K2b 219/4.66；K4b 58/2.47；K4c 127/3.43；K3a 6/1.73、K3b 3/1.69、K4a 0/1.31。5k：K1a 69/5.34、K1b 58/6.14、K2a 22/3.31、K2b 68/5.55、K4b 17/2.91、K4c 41/4.12。現況 20k 105–364／9.2–31.0 | **不過**（20k、5k 各 6 幀） |
| S2(i) | `node tools/real-skin-penetration-v2.mjs --faces=<f> --baseline=docs/experiments/real-skin-evidence/ruler-v2/R3/frozen-rerun/before-<f>.json` | 退步 1 項：K1a 左 31/4.0 > 6/1.4；5k K1a 左 3/2.3 > 0/0.0 | **不過** |
| S2(ii) | 同上 | K3a、K3b 兩臂 0/0.0；K4a 右 2/0.2、左 0/0.0（5k 全 0） | 過 |
| S2(iii) | 同上 | K4b 右 5/0.6、左 0；K4c 右 4/1.4、左 1/0.1（5k K4c 左 1/0.1，其餘 0） | 過 |
| S3 (e) | 同上 | K4a 右 **22/1.1**（5k **8/1.3**）、左 0；K4b、K4c 兩臂 0 | **不過**（K4a 右） |
| S4 (c) | 同 S1（20k） | 最大扭跳：K1a 5.2°、K2b 4.5°（≤6.0）；K1b 2.1°（≤4.3）。蒙皮總扭轉 K1a −53.9／K1b −27.0／K2b −47.3（現況 −54.9／−28.0／−48.4，差 ≤1.1°）。關節扭轉總和 −77.35／−51.98／−71.49，與現況相同 | 過 |
| S5 | `git diff 55cc61b -- src/render/geoAnimator.js src/render/geoCharacter.js src/sim`；`node tools/motion-d0-measure.mjs`（跑完 `git checkout -- docs/experiments/motion-d0-measure.json`）；`node tools/motion-2b-check.mjs --d0-json <d0 輸出> --out …` | diff 0 bytes；E2(a) 39／39 範圍內（第 40 列 set.push.elflex.quick 已依 a4c1d33 移出）；E2(b) 0.2394 m；E3 29 鍵差異 0、geo-animator 50／50；E4 86 條 4830 幀；E6 OK；exit 0 | 過（`step4/s5/`；在 9f44005 上跑，幾何與動作檔在任何候選都沒改） |
| S6 | `A7_SKIP_TESTS=1 A7_SKIP_BUILD=1 SKIP_SHOTS=1 REPORT_NAME=… node tools/real-skin-with-vite.mjs --port=5192 -- node tools/real-player-browser.mjs` | A1–A6、A9–A12 全 true；A2(d) 手臂 7.95°；A2(a) 腕群偏移 0.001 m、腕位移 0.871 m；A2(e) 手離腕 0.116／0.115 m | 過（A8 未拍，A7 不在 S6） |
| S7 | — | 沒跑 | 未驗證 |
| S8 | measure 表頭 | 鞋底 IK 非零影響 523（5k 125），與現況相同；`public/models/real/player_{20k,5k}.weights.glb` 存在；求解器只在 tools/。載入耗時未量 | 部分 |
| S9 | — | 沒跑 | 未驗證 |
| S11 (f) | `node tools/real-skin-torso-drag.mjs --faces=<f> --baseline=docs/experiments/real-skin-evidence/ruler-v2/R3/R4/f-base-<f>.json` | 9 幀全過，例 K1a 82 點／7.5 cm（上限 168／8.5）、K4b 74／8.1（上限 107／9.1）；5k 同樣全過 | 過 |

完整輸出：`step4/candH/`（`pen-*`、`f-*`、`m-*`、`s6-report.json`）。候選 L 的正式輸出：`step4/cand-L-9f44005/`。

## 三、做不到的原因（附數字）

### 3.1 S1 與 S11 衝突（手臂要真的跟著走時）

- S1 的門檻取自診斷報告的「純熱擴散」實驗：20k 最差 K1b 27 個、P99 2.09。純熱擴散的腋下過渡**有一半落在軀幹皮上**。
- S11（R3 新增、R4 改定義）正是禁止軀幹皮被手臂帶走：純熱擴散 K1a 1628 點／13.5 cm，上限 168／8.5（`ruler-v2/R3/R4/f-heat-20k.txt`）。
- 軀幹側不動時，舉臂約 110° 的轉動只能全部在手臂側消化。
- 實測（20k；S1 取自 `step4/variants.log`，軀幹權重取自 `step4/follow-LH.txt`）。快速評估治具在候選 H 上與正式量尺逐項相同，例如 K1a 223/5.16、K1a 左 31/4.0。

| 手臂側熱擴散常數 c（軀幹側固定） | S1 K1a >2×／P99 | 上臂 t=0.5 軀幹權重（平均） | 肘（t=1.0） | S11 |
|---|---|---|---|---|
| 1（標準 bone heat，候選 H） | 223／5.16 | 0.28 | 0.02 | 綠 |
| 0.3 | 111／3.15 | 0.47（5k，無手部邊界時量） | 0.10（同左） | 綠 |
| 0.1 | 34／2.35 | 未量 | 未量 | 綠 |
| 0.03（手沿用現行權重） | 15／1.94 | 0.85（候選 L） | 0.59（候選 L） | 綠 |
| 0.03、手也熱擴散（候選 L 的權重，但軀幹骨間 c=6） | 12／1.86 | 0.85 | 0.59 | 綠 |
| 參考：純熱擴散（診斷報告） | 最差幀 K1b 27／2.09 | 未量 | 未量 | **紅**（K1a 1628／13.5） |

（候選 L 本身＝9f44005，軀幹骨間 c=1，正式量尺：K1a >2× 3 個、P99 1.45，`step4/cand-L-9f44005/m-20k.txt`。）

- 只有把手臂皮大半綁在軀幹上（c≤0.03），S1 才過；那就是「手臂黏在身上」。
- 讓軀幹側在 S11 預算內幫忙也沒用：軀幹頂點給半轉骨權重、位移預算 2 cm，K1a 的 S11 就到 291 點（紅），S1 仍是 210／5.17（`variants.log` 的 `H_c1_torsohalf_D002`）。
- 半轉骨（R2 的「肩部輔助骨」）放在手臂側的過渡帶（二次 Bernstein），S1 反而 240／6.06（`H_c1_half`）。它能減少弦中點塌陷，但減不了「110° 要在幾公分內轉完」的梯度。

### 3.2 S3 K4a 右手與 S6 A2(a)(e) 衝突

- 穿進短褲的是**手本身**（候選 H：手→臀腿 22 點，最深 1.1 cm）。步驟③（9c66afe）的手就已經 18 點／1.0 cm（`ruler-v2/head-src9c66afe-20k.txt` 的 (e) 分區）。
- A2(a)(e) 要求手跟腕關節剛性同動。所以手的位置只由關節決定，也就是動畫，加上已裁定的外展 8°。
- 能讓手離開大腿的只有兩條路：
  - 讓手變成非剛性。候選 L 就是這樣，A2(a) 偏移 0.118 m，門檻 0.05，紅；
  - 加大外展，或加一個腕部重定向。兩者都不在使用者裁定的範圍內，沒有做。

### 3.3 S2(i) K1a 左臂（沒窮盡）

- 手與上臂都照實跟著走的版本，K1a（引臂、左臂高舉）左臂都比現況多穿入：20k 15–41 點。
- 穿入點是腋後側的上臂頂點（帶約 0.4 的軀幹權重），高舉時被線性蒙皮拉進軀幹。
- 半轉骨沒解掉（38/3.4）。這條我沒有窮盡；照規則停手，沒有做第三次嘗試。

## 四、試過而有效的部分（留給下一輪）

- **肩部輔助骨 r/lArmAux（夾角版）**：
  - 構造：跟上臂同轉，但上臂離胸側矢狀面的外展角低於 30° 時軟性夾到 ≥30°。上臂內側皮部分綁在它上面。
  - 效果：S2 的站、跑、接球從現況 20k K4a 422/9.4、K4b 167/10.2 降到 0–5 點、≤1.4 cm。候選 H 的 S2(ii)(iii) 全過，靠的就是它。
  - 手臂舉高時它等於上臂，不影響高舉幀。
- **胸椎扭轉分段**（TWIST_SHARE 0.5，胸節世界朝向不變）加上軀幹骨間熱擴散（c=6）：S4 全過。
- **Dirichlet 版 bone heat**：
  - 做法：小腿中段以下、手、軀幹頂點當邊界，四肢側解熱擴散。
  - 效果：S11 維持現況水準；軀幹頂點不帶手臂權重。

## 五、WIP 的 src 改動（`git diff 9c66afe feat/real-skin-wip2 -- src`，只動 src/render/realPlayer.js）

`feat/real-skin-wip2` 上 `src/render/realPlayer.js` 的行號：

| 位置 | 改動 | 理由 |
|---|---|---|
| :58、:66、:70 | BONES 末尾加 `rArmAux`、`lArmAux`、`rArmHalf`、`lArmHalf`，父骨＝spineUpper；`AUX` 表對應到肩 | 肩部輔助骨（R2）。加在末尾，原 16 骨的索引不變 |
| :141 | `computeSkinWeights` 遇到沒有骨段的骨就跳過 | 輔助骨不參與舊的自動權重（讀不到烘焙檔時的後備路徑） |
| :243–304 | `WEIGHTS_FORMAT`、`positionHash`、`loadBakedWeights`：fetch `<glb>.weights.glb`；格式、骨名、頂點數、位置雜湊、骨索引任一不符 → console.warn，退回 computeSkinWeights | S8：熱擴散只在 tools/ 求解，src 只讀烘焙檔。量尺（node）與瀏覽器讀同一個檔 |
| :306–325 | 幾何讀取拆成 `loadRealGeometry` | 烘焙器重用同一份縮放、貼地、法線 |
| :328–347 | `loadRealPlayerAsset` 改成「烘焙權重 ?? computeSkinWeights」；回傳加 `weightsSource` | 同上。部位上色與接縫拆分仍用烘焙檔內存的現行主骨 |
| :443、:463 | `computeBind`：輔助骨的位置與綁定旋轉照抄對應的肩 | 不移肩、不平移 |
| :515–519 | `createRealPlayer`：每側建兩個 Object3D，掛在 joints.spineUpper | 輔助骨實體。掛在骨架上，不是 mesh 子物件 |
| :480–487 | 常數 TWIST_SHARE 0.5、AUX_MIN 30°、AUX_SOFT 5° | 扭轉分段；夾角輔助骨 |
| :633–647 `splitTwist` | 把 spineUpper 的 Euler y 移一半到 spine，再反解 spineUpper，使胸節世界朝向不變；同一幀重入不重套 | 使用者裁定的扭轉分段（S4），總扭轉不變 |
| :649–672 `updateAux` | 半轉骨＝slerp(I, q·q_bind⁻¹, ½)·q_bind；夾角骨＝C·q_shoulder | 輔助骨逐幀驅動，只讀肩的旋轉 |
| :675、:684 | `retargetArms` 開頭呼叫 splitTwist，每側外展後呼叫 updateAux（呼叫點仍在 groundLegs 開頭，沒有新的呼叫點） | 接線 |

- 以上都沒有依參數分岔、沒有掛 mesh 子物件、沒有改可見性或渲染 hook、沒有 onBeforeCompile、morph 或自訂著色器，也沒有在 createRealPlayer 之後換 geometry。
- 候選 H 的權重沒用到半轉骨（`HALF: false`），但骨頭還在。
- 每幀 CPU 增加兩次四元數運算（扭轉分段），以及每側兩個輔助骨的更新。

另有工具與資料：`tools/bake-real-skin-weights.mjs`（烘焙器，同指令重跑逐位元相同）、`public/models/real/player_{20k,5k}.weights.glb`。

## 六、分支與提交

| 分支 | commit | 內容 |
|---|---|---|
| `feat/real-skin` | 本報告的 commit | 只加報告與 `step4/` 證據；src 仍是步驟③（9c66afe） |
| `feat/real-skin-wip2` | 9f44005 → f32d163 → 713a4f4 | 9f44005＝候選 L（已棄用）；f32d163＝候選 H＋實驗選項；713a4f4＝證據。**未通過驗收，不得合併或部署** |

- 沒有 push、沒有部署、沒有併分支。
- S6 治具會覆寫 `docs/experiments/real-player-evidence/*.png`。候選 L 的截圖已搬到 `step4/cand-L-9f44005/s6-shots/`，原檔以 `git checkout` 還原。
- 快速評估治具在 `step4/harness/`。檔內寫死 scratchpad 路徑，只供參考與重現。

## 七、需要使用者裁定

1. **S1 與 S11 怎麼取捨**（擇一）：
   - 甲：S11 對腋下區放寬，允許軀幹皮在腋下跟手臂走一段（純熱擴散式）。S1 可望過，但軀幹皮在舉臂時會被拉動。
   - 乙：高舉幀（K1a、K1b、K2b，必要時加 K2a、K4b、K4c）的 S1 改成「不比現況差＋上限」。候選 H 相對現況已改善：20k K1a 364→223 個、P99 29.1→5.2。
   - 丙：維持兩條都不放寬，接受 S1 做不到（本卷不上線）。
2. **S3 K4a 右手**（擇一）：
   - 甲：允許寫實專用的腕部微調，或外展略大於 8°（要重看 A2(d) 的 10° 預算，目前用了 7.95°）；
   - 乙：K4a 的手改成「不比現況差」（步驟③ 18/1.0）；
   - 丙：允許手非剛性。這會與第一階段 A2(a)(e) 衝突，不建議。
3. S2(i) K1a 左臂需要再一輪探索。建議在 1、2 裁定後一起做。

## 八、範圍外發現（只列不修）

- 量尺在「手臂皮黏在軀幹上」的權重下仍全綠（候選 L）。S2、S3 只量穿入，S11 只量軀幹被拖，**沒有任何一條量「手臂皮有沒有跟著手臂走」**。
- 這條只能靠 S10 試玩，或另設一條跟隨度指標（例如本輪的 `follow.mjs`：上臂 t≥0.7 的軀幹權重）。加不加由使用者決定。
