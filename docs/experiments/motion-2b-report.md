# 寫實球員卷 2B 動作文獻校準 · 驗收報告

> 驗收條文：`docs/kickoffs/real-player-stage2-match.md`「### 2B 驗收（2026-09-27 凍結）」E1–E9（本卷未改動該檔任何一字）。
> 分支 `feat/motion-d0`，基準 `f4ccbec`。使用者裁定「1甲 2.甲 3.乙 4.甲」。證據檔全在 `docs/experiments/motion-2b-evidence/`。
> 量法凍結：動手改 src 前寫下 `motion-2b-evidence/acceptance-2b-drivers.md`（末段「量法修改紀錄」兩條，原因與鑑別力均記在該檔）。

## 結論

| 條 | 狀態 | 一句話 |
|---|---|---|
| E1 鏡像還原 | **過** | 25 姿勢：17 個純還原（全部 ≤3.34°）、8 個例外（依據逐條驗證成立）；低手觸球雙腕 0.136 m、扣球引臂肩線 107.6° |
| E2 文獻範圍 | **(a) 未全過：37／40**；(b) 過 | 做不到 3 列，理由與數字見下「E2 做不到的 3 列」；重心下降 0.2368 m |
| E3 時序不變 | 過 | 29 鍵 dur／hit／airDur／jump 與 677516f 差異 0；hitLeadTicks 區塊逐字相同；geo-animator 50／50 綠 |
| E4 全序列回歸 | 過 | 86 條驅動、4786 幀（非滯空 3248）：最大膝角 175.62°、最小膝前距 +0.0172 m、最大肘有號角 180.00°、最低鞋底 −0.0250 m |
| E5 寫實人回歸 | 過 | 第一階段治具 A1–A6、A8–A12 全 true（A7 依 E5 排除）；IK 後大腿偏離 12.49° → 3.73° |
| E6 起跳不掉手 | 過 | 過渡窗最小權重 1.0000、腕高最大逐幀變化 0.0270 m（修前權重 0、0.86 m） |
| E7 並排對照 | 已交付，待使用者判定 | 8 組（7 技術＋扣球引臂）× 桌機／直式，幾何＋寫實；參考照片只在本機 |
| E8 測試與建置 | 過 | 失敗清單與基準逐項相同（A23a、A23b）；`npm run build` exit 0 |
| E9 鑑別力 | 過 | 8 個突變全紅在行為斷言上；還原後 sha1 全相符；D0 自我檢查 24／24 |

## E2 做不到的 3 列（停手回報，未自行豁免、未改任何檢查）

1. **`set.push.elflex.fast`（40±10）與 `set.push.elflex.quick`（70±10）互斥**：同一幀（`set-push`）、同一量值（右肘 3D 肘屈），區間 [30,50] 與 [60,80] 不相交，任何實作最多只能過其中一列。D0 已註明「遊戲所有舉球共用一支動畫，要對哪一型請你選」，但裁定「1甲 2.甲 3.乙 4.甲」沒有涵蓋這題。本卷暫取 **fast／seven 型**（現況 40.1°）——這是可逆選擇，待裁定。可選：甲＝維持 fast（40°）；乙＝改 quick（70°，fast 列改紅）；丙＝依 sim 的舉球型態分兩支動畫（需另開工單，涉 matchLoop 傳型態給表現層）。
2. **`bump.end.trunk`（20.02±11.31，現況 4.3）、`bump.end.uarm`（85.66±10.82，現況 9.2）**：D0 的 `bump-end` 幀是「bump 最後一 tick」，該幀動作層權重固定＝(1/60)÷RELEASE(0.2)＝**0.083**（`geoAnimator.js` RELEASE 漸出），畫面 92% 是待命底層。在「bump 0.5 s 結束」不變的前提下，只有兩種辦法讓最後一幀是隨揮姿勢：(i) 最後一幀瞬間回待命（一幀掉手，與 E6 同類瑕疵，不可取）；(ii) 讓 bump 撐住／延長可見尾段。本卷已照工單在時長內補上隨揮關鍵幀（`bumpFollow`，at 0.75／1，姿勢本身對準文獻收勢），但該幀權重仍只有 0.083。
   - 量化方案（副本實測，未進本分支）：bump 加 `sustain: 0.2`（dur／hit 不動，可見尾段多 0.2 s 撐住再淡出）→ `bump.end` 六列全部範圍內（頭 −5.7、軀幹 13.1、上臂 88.8、肘 173.0、大腿 19.9、膝 160.1），40 列只剩 quick 一列。代價：既有測試「§3 無 sustain 的序列行為完全不變——bump 應仍在 dur 0.5s 後結束」轉紅（它守的正是 bump 0.5 s 結束），需使用者同意改動該測試與延長可見尾段。

其餘 37 列全部「範圍內」；改前 30 列超出（D0 表）。

## 各條證據

### E1（`node tools/motion-2b-e1-mirror.mjs --d0-json motion-2b-evidence/d0-after.json --restore-only-json motion-2b-evidence/d0-restore-only.json` → exit 0，報告 `e1-after.json`）
- 探針：`tools/motion-2b-e1-mirror.mjs`＋`tools/motion-2b-lib.mjs`，以 `git show 1fd5da6` 原文最小插樁（尾端附加 `export { POSES, SEQUENCES }`、改寫 three import）經 data: URL 載入，**不寫任何檔**；舊版與新版走同一條插樁路徑。
- 健全性：舊版肩 z 與 pelvisY/chestY 皆 0 的 `land`、`nodNeutral`、`nodDown`，另加一個只有 x 旋轉的非對稱合成姿勢 `__sanityX`——意圖 vs 基準 f4ccbec 全部 0.00°（門檻 0.5°）。反向：z／pelvisY 非零且未還原的合成姿勢偏離 86.82°（探針看得出鏡像錯）。
- 改前紅燈（基準 f4ccbec 同一探針）：24／25 姿勢超出 5°（最大 43.10°），`bump.contact.span` 0.764 m、`spike.wind.shline` 197.8°。
- 「純還原版」（git archive 副本，8 個例外姿勢只做鏡像還原＋胸椎前後傾補償、不做文獻校準）：25 姿勢全部 ≤3.34°（意圖可達）；其 D0 輸出 `d0-restore-only.json` 有 22 列超出——即 E2 例外的依據。
- ec8efc7（鏡像修正後 25 分鐘）替部分姿勢加了胸椎前後傾 spineUp，手臂世界方向因此偏離意圖。bumpHit、floatWind、blockLoad 以肩 x 補償回意圖（bumpHit 取 −1.16：意圖差 3.34°，並保住既有測試「觸球幀 < −1.15」）。

25 姿勢逐一（六向量＝右上臂／左上臂／右前臂／左前臂／肩線／髖線，與意圖夾角°）：

| 姿勢 | 處置 | 六向量（現況） | 基準 f4ccbec 最大 |
|---|---|---|---|
| bumpReady | 例外 | 8.90 / 8.90 / 11.73 / 11.73 / 0.00 / 0.00 | 28.96 |
| bumpHit | 還原 | 3.34 / 3.34 / 3.34 / 3.34 / 0.00 / 0.00 | 28.08 |
| setReach | 例外 | 35.85 / 35.85 / 51.69 / 51.69 / 0.00 / 0.00 | 35.85 |
| setPush | 例外 | 30.33 / 30.33 / 32.84 / 32.84 / 0.00 / 0.00 | 30.33 |
| spikeWind | 例外 | 34.17 / 28.78 / 55.77 / 16.57 / 54.62 / 8.02 | 35.68 |
| spikeUnlock | 例外 | 18.48 / 50.58 / 27.41 / 45.39 / 51.35 / 19.48 | 43.10 |
| spikeHit | 例外 | 74.38 / 46.27 / 54.60 / 56.56 / 53.23 / 29.79 | 19.97 |
| spikeFollow | 例外 | 38.96 / 0.00 / 34.03 / 0.00 / 0.00 / 0.00 | 38.75 |
| windup | 還原 | 全 0.00 | 40.11 |
| approachBack | 還原 | 全 0.00 | 22.92 |
| approachDrive | 還原 | 全 0.00 | 25.21 |
| landDeep | 還原 | 全 0.00 | 22.92 |
| landRise | 還原 | 全 0.00 | 16.04 |
| diveReach | 還原 | 全 0.00 | 34.38 |
| diveSprawl | 還原 | 全 0.00 | 29.79 |
| divePush | 還原 | 全 0.00 | 38.96 |
| serveReady | 還原 | 全 0.00 | 11.46 |
| floatWind | 還原（含胸椎補償） | 全 0.00 | 18.96 |
| floatPush | 例外 | 45.84 / 3.40 / 62.82 / 3.40 / 0.00 / 0.00 | 17.53 |
| gasp | 還原 | 全 0.00 | 13.75 |
| dejected | 還原 | 全 0.00 | 4.58 |
| waveUp | 還原 | 全 0.00 | 40.11 |
| waveSide | 還原 | 全 0.00 | 34.38 |
| blockLoad | 還原（含胸椎補償） | 全 0.00 | 18.50 |
| windupHesitant | 還原 | 全 0.00 | 34.38 |

例外逐條（還原後量值取自純還原版 D0，現況取自 `d0-after.json`）：

| 姿勢 | 依據 | 還原後 → 現況 |
|---|---|---|
| bumpReady | E2：`bump.start.head`／`uarm`／`elbow` | 頭 17.8→6.3、上臂 25.8→16.6、肘 180→158.8（文獻 7.23±10、9.06±10、158.83±11.59）|
| setReach | E2 `set.load.elflex`＋教學描述 https://www.koachvolleyball.com/guides/overhead-setting-the-setter-s-technique（hands a few centimeters apart、拇指食指成三角、額頭上方） | 肘屈 57.3→100.3；還原雙腕相距 0.748 m（肘屈 100° 時仍 0.60 m），保留靠攏 0.297 m |
| setPush | E2 `set.push.elflex.fast`＋同上來源 | 肘屈 14.3→40.1；還原雙腕 0.748 m，保留 0.152 m |
| spikeWind | E2 `spike.wind.shline`、`spike.wind.sep` | 肩線 162.2→107.6、分離 2.9→49.5（105±10、52±10）；轉體方向還原後已正確，只是加大幅度——胸椎轉動帶著雙臂轉，手臂世界方向因此偏離 |
| spikeUnlock | Zahálka 2017 https://pmc.ncbi.nlm.nih.gov/articles/PMC5548173/（肩線角由最大後擺 105° 單調增到擊球 137°） | 還原值肩線 167.5°，夾在校準後引臂 107.6° 與擊球 136.8° 之間會先超轉再轉回；改為 116.1° |
| spikeHit | E2 `spike.hit.abd／elflex／hadd／shline／hipline／sep` | 外展 177.5→132.5、肘屈 4.6→34.4、水平內收 93.9→29.1、肩線 190→136.8、髖線 186.9→157.1、分離 −3.1→20.3 |
| spikeFollow | 教學描述 https://www.improveyourvolley.com/spiking-in-volleyball.html（spiking arm coming down across your body；原註解本意亦為「跨體收回往左髖」） | 只保留擊球臂跨體；非擊球臂、骨盆已還原（0.00°） |
| floatPush | E2 `servefloat.hit.abd／elflex／hadd` | 外展 176.6→132.1、肘屈 0→49.8、水平內收 95.4→30.2；非擊球臂已還原（3.40°） |

另兩條直接量：`bump.contact.span` 0.1362 m（≤0.20）、`spike.wind.shline` 107.61°（<180）。

### E2（`node tools/motion-d0-measure.mjs`，D0 腳本未改一字；輸出另存 `d0-after.json`，repo 內 `motion-d0-measure.json` 以 git 還原保持 D0 交付狀態）

| ID | 文獻 | 容許 | 改前 | 改前判定 | 改後 | 改後判定 |
|---|---|---|---|---|---|---|
| `bump.start.head` | 7.23 | ±10 | 17.8 | 超出 | 6.3 | 範圍內 |
| `bump.start.trunk` | 28.46 | ±10 | 22.8 | 範圍內 | 22.8 | 範圍內 |
| `bump.start.uarm` | 9.06 | ±10 | 16.6 | 範圍內 | 16.6 | 範圍內 |
| `bump.start.elbow` | 158.83 | ±11.59 | 180 | 超出 | 158.8 | 範圍內 |
| `bump.start.thigh` | 46.29 | ±10 | 13.9 | 超出 | 42.5 | 範圍內 |
| `bump.start.knee` | 134.82 | ±10 | 144.2 | 範圍內 | 137.5 | 範圍內 |
| `bump.contact.head` | 2.19 | ±10 | -4.6 | 範圍內 | -4.6 | 範圍內 |
| `bump.contact.trunk` | 19.84 | ±10.19 | 12.1 | 範圍內 | 12.1 | 範圍內 |
| `bump.contact.uarm` | 50.71 | ±10 | 56.1 | 範圍內 | 53.9 | 範圍內 |
| `bump.contact.elbow` | 172.44 | ±10 | 180 | 範圍內 | 180 | 範圍內 |
| `bump.contact.thigh` | 30.68 | ±10 | 6.3 | 超出 | 28.3 | 範圍內 |
| `bump.contact.knee` | 147.38 | ±10.61 | 159.4 | 超出 | 151.7 | 範圍內 |
| `bump.end.head` | -6.5 | ±10.03 | 3.8 | 超出 | 1.9 | 範圍內 |
| `bump.end.trunk` | 20.02 | ±11.31 | 5.1 | 超出 | 4.3 | **超出** |
| `bump.end.uarm` | 85.66 | ±10.82 | 3.4 | 超出 | 9.2 | **超出** |
| `bump.end.elbow` | 170.22 | ±10 | 161.6 | 範圍內 | 161 | 範圍內 |
| `bump.end.thigh` | 18.76 | ±10 | 2.3 | 超出 | 13.3 | 範圍內 |
| `bump.end.knee` | 158.91 | ±11.19 | 167.4 | 範圍內 | 166.7 | 範圍內 |
| `set.load.elflex` | 100 | ±10 | 57.3 | 超出 | 100.3 | 範圍內 |
| `set.push.elflex.fast` | 40 | ±10 | 14.3 | 超出 | 40.1 | 範圍內 |
| `set.push.elflex.quick` | 70 | ±10 | 14.3 | 超出 | 40.1 | **超出** |
| `set.push.shflex` | 150 | ±10 | 151.3 | 範圍內 | 151.3 | 範圍內 |
| `spike.wind.shline` | 105 | ±10 | 197.8 | 超出 | 107.6 | 範圍內 |
| `spike.wind.hipline` | 157 | ±10 | 194.9 | 超出 | 157.1 | 範圍內 |
| `spike.wind.sep` | 52 | ±10 | -2.9 | 超出 | 49.5 | 範圍內 |
| `spike.hit.abd` | 130 | ±10 | 177.5 | 超出 | 132.5 | 範圍內 |
| `spike.hit.elflex` | 34 | ±10 | 4.6 | 超出 | 34.4 | 範圍內 |
| `spike.hit.hadd` | 29 | ±14 | 86.1 | 超出 | 29.1 | 範圍內 |
| `spike.hit.shline` | 137 | ±10 | 170 | 超出 | 136.8 | 範圍內 |
| `spike.hit.hipline` | 157 | ±10 | 173.1 | 超出 | 157.1 | 範圍內 |
| `spike.hit.sep` | 20 | ±10 | 3.1 | 超出 | 20.3 | 範圍內 |
| `tip.hit.abd` | 122 | ±10 | 177.3 | 超出 | 122.7 | 範圍內 |
| `tip.hit.elflex` | 43 | ±12 | 6.9 | 超出 | 43 | 範圍內 |
| `tip.hit.hadd` | 43 | ±15 | 85.9 | 超出 | 43.9 | 範圍內 |
| `servejump.hit.abd` | 129 | ±11 | 177.5 | 超出 | 132.5 | 範圍內 |
| `servejump.hit.elflex` | 48 | ±26 | 4.6 | 超出 | 34.4 | 範圍內 |
| `servejump.hit.hadd` | 23 | ±24 | 86.1 | 超出 | 29.1 | 範圍內 |
| `servefloat.hit.abd` | 133 | ±11 | 176.5 | 超出 | 132.1 | 範圍內 |
| `servefloat.hit.elflex` | 50 | ±17 | 0 | 超出 | 49.8 | 範圍內 |
| `servefloat.hit.hadd` | 30 | ±16 | 85.1 | 超出 | 30.2 | 範圍內 |

E2(b)：`node tools/motion-2b-check.mjs --only e2b` 讀 D0 JSON `approach.primary.drop`：改前 0.0668 m → 改後 **0.2368 m** ∈ [0.20, 0.30]。

### E3 / E4 / E6（`node tools/motion-2b-check.mjs --d0-json motion-2b-evidence/d0-after.json --out check-after.json` → exit 0）
- E3：677516f 29 鍵四欄差異 0 處、無新增鍵；hitLeadTicks 斷言區塊逐字相同；`tests/geo-animator.test.mjs` 50／50。
- E4：驅動＝每個 SEQUENCES 鍵冷觸發＋比賽鏈（接、舉、扣、吊、三種發球、兩種攔網、助跑 2.55／4.5 m/s），右手與左手探針各一。改前（`check-before-174ba07.json`，行為＝基準）86 組全紅，待命站姿鞋底已 −0.0586 m、最深 −0.2392 m；改後 0 失敗。
- E6：改前過渡幀權重 0、腕高單幀 0.8597 m；改後窗內最小權重 1.0000、最大逐幀 0.0270 m（右手／左手 × 三條鏈）。窗外 windup 冷觸發的 0.08 s 漸入仍有單幀 0.458 m——屬 windup 自身漸入，非 E6 條文的過渡，列為範圍外發現（見下）。

### E5（第一階段治具 `tools/real-player-browser.mjs`，於 628bccd 的本機 clone 上跑，dev server 127.0.0.1:5205；報告 `e5-real-player-report-628bccd.json`）
pass：A1、A2（ab／c／d／e／f／g）、A3、A4、A5、A6、A8、A9、A9footAir、A10、A11、A12 全 true；A7 false（E5 明定不適用：geoAnimator 本卷依 Q4-3 修改；測試與建置另由 E8 驗）。數字：A10 下沉比 1.00（bump 0.089／spike 0.18／block 0.18 m 與 geo 人相同）、A9 最低 0.000 m、A12 最大單幀跳變 0.048 m（≤0.05）、A2(d) IK 後大腿偏離 3.726°（第一階段 11.94–12.49°）、A2(e) 0.116 m。

### E7（`node tools/motion-2b-shots.mjs`，dev server 127.0.0.1:5206）
- 截圖台 `tools/motion-2b-poses.html`：真實 `createGeoCharacter`／`createRealPlayer`＋`createGeoAnimator`，觸發鏈同 D0 `FRAME_DEFS`，拍攝當下記錄播放中的序列與 t（manifest `shots[].seq/t` 全部等於預期序列）。
- repo：`docs/experiments/motion-2b-evidence/` 32 張單張（8 項 × 幾何／寫實 × 桌機／直式）＋16 張「幾何｜寫實」並排＋`manifest.json`（參考照片只記來源 URL、授權、作者、對應技術與階段）。
- 本機（不進 repo）：`C:\Users\shung\AppData\Local\Temp\claude\C--Users-shung\b611e1c3-cb6d-40b3-94b3-ee053003c6ba\scratchpad\motion-2b-sidebyside\` 16 張「真人參考｜幾何｜寫實」三格並排；參考原圖在同層 `motion-ref\`（13 張，Wikimedia Commons 為主）。
- 已知限制：飄球參考照片是帕拉林匹克站立排球選手（規則禁跳所以確定站立，但下肢為義肢）與一張年代較久的黑白照；扣球擊球參考畫面中球未入鏡。
- 使用者判定：待主對話轉交。

### E8
- 基準（f4ccbec，實作前實跑）：tests 2603、pass 2601、fail 2＝A23a、A23b（`npm-test-baseline-f4ccbec-tail.txt`）。
- 中途（fc283bb）：2603／2601／2，失敗清單相同。
- 最終（7d40d0b）：2603／2601／2，失敗清單相同（文末）。
- `npm run build`：exit 0（HEAD 7d40d0b，src 與最終相同）。

### E9（`python e9.py 7d40d0b`，git archive 副本；結果 `e9-result.json`）

| 突變 | 紅在哪 | 還原 sha1 |
|---|---|---|
| 撤銷鏡像修正（25 姿勢肩 z／pelvisY／chestY 回 f4ccbec） | E1 exit 1：17 個還原姿勢回到 16–40° 偏離 | 相符 |
| 低手 bumpReady 肘 −0.36→−0.6496（+16.59°） | `bump.start.elbow` 142.0（158.83±11.59）超出 | 相符 |
| 高手 setReach 肘 −1.75→−2.0118（+15°） | `set.load.elflex` 115.3（100±10）超出 | 相符 |
| 扣球 spikeHit 肘 −0.6→−0.8618（+15°） | `spike.hit.elflex` 49.4（34±10）超出 | 相符 |
| 吊球 tipHit 肘 −0.75→−0.4533（−17°） | `tip.hit.elflex` 26.0（43±12）超出 | 相符 |
| 跳發 spikeHit 肘 −0.6→−0.059（−31°） | `servejump.hit.elflex` 3.4（48±26）超出 | 相符 |
| 飄球 floatPush 肘 −0.87→−0.486（−22°） | `servefloat.hit.elflex` 27.8（50±17）超出 | 相符 |
| 過渡空窗改回（接續那一幀不產生姿勢） | E6：窗內最小權重 0、腕高 0.8163 m | 相符 |

每次突變 D0 自我檢查 24／24；未突變的健康副本 E1、E6 exit 0，D0 超出列只有上述做不到的 3 列。偏移量＝該列容差半寬＋5°，方向取遠離文獻平均的一側。

## 改了什麼（`src/render/geoAnimator.js`，時序欄位零改動）
- 25 姿勢鏡像還原（上表）；肩 z 語意註解補在 POSES 檔頭。
- 下蹲換算：小腿鉛直、大腿前擺角由骨盆下降量反解（D0 發現 2）；擺腿時鞋盒入地則只加該腿膝彎抬腳；root 下降公式不變。
- 助跑下沉：逐步 sin 半波 → 跨制動步平滑包絡（峰值 0.6，序列末回 0 交給 windup）；下沉權重 `min(runW×2,1)`。步相分支左腿正負號錯誤修正（左腳領跨時原本往後擺）。
- 擊球臂：spikeHit／floatPush／tipHit（＋tipReach 中途）照 Reeser 2010；扣球轉體照 Zahálka 2017；新增胸椎側傾欄位 `lean`（spineUpper.z，左手鏡像反號）用在 spikeHit、tipReach、tipHit，保住擊球高度（扣球腕高 1.97→2.08 m、吊球 2.00→1.98 m）。**沒有用 spine.z**：它在比賽中每幀被 reachAssist 絕對指派（`reachAssist.js:254-259`），寫了會被蓋掉。
- 低手：bumpReady 肘彎 −0.36、頭 −0.55；新增隨揮姿勢 bumpFollow（at 0.75／1，時長不動）；舉球肘屈 100°／40°。
- E6：段落自動接續（chain／landSoft）那一幀當場由新段落產生姿勢；landSoft 的 w0＝0，外觀與修前相同。
- 唯讀窺視 `probe()`（治具讀權重與跳躍弧，無行為影響）。

## 範圍外發現（未處理）
- windup 冷觸發（及接在助跑後）的 0.08 s ATTACK 漸入，腕高單幀最多 0.458 m（雙臂 5 幀內甩上頭頂）；不屬 E6 條文，但同屬「手臂瞬移」類，建議另案。
- 下蹲換算以 1.85 m 骨架計算，比賽中 root 下降量不隨身高縮放而腿會縮放：1.65 m 球員蹲下時鞋底約多沉 0.11×下降量（接球預備約 1.3 cm），寫實人有 IK 補，不受影響。
- dev server 啟動時 vite 會寫共用 `node_modules/.vite` 快取（node_modules 為 junction，與其他工作樹共用）。

## 最終 npm test 與 diff

基準（f4ccbec，實作前）摘要：
```
ℹ tests 2603
ℹ suites 0
ℹ pass 2601
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4261711.0639
✖ failing tests:
✖ A23a 真人追球（全部案例當分母）：舉球區 ≥ 34%、空接 ≤ 25%、碰網 ≤ 5% (1.9796ms)
✖ A23b 正前（1035）：舉球區 ≥ 38%、空接 ≤ 26.8% (111741.6551ms)
```
最終（HEAD 7d40d0b，src 與本報告 commit 相同；log 頭記 HEAD）摘要：
```
ℹ tests 2603
ℹ suites 0
ℹ pass 2601
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8623725.0036
✖ failing tests:
✖ A23a 真人追球（全部案例當分母）：舉球區 ≥ 34%、空接 ≤ 25%、碰網 ≤ 5% (29.0993ms)
✖ A23b 正前（1035）：舉球區 ≥ 38%、空接 ≤ 26.8% (236990.3773ms)
```
兩者失敗清單逐項相同（A23a、A23b，既有失敗），通過數 2601＝2601。完整末 12 行在 `motion-2b-evidence/npm-test-baseline-f4ccbec-tail.txt`、`npm-test-final-7d40d0b-tail.txt`。

`git diff --stat f4ccbec..HEAD`（本段寫入前）：
```
 .../motion-2b-evidence/acceptance-2b-drivers.md    |   42 +
 .../motion-2b-evidence/block-desktop-geo-real.png  |  Bin 0 -> 259987 bytes
 .../motion-2b-evidence/block-geo-desktop.png       |  Bin 0 -> 61277 bytes
 .../motion-2b-evidence/block-geo-portrait.png      |  Bin 0 -> 34068 bytes
 .../motion-2b-evidence/block-portrait-geo-real.png |  Bin 0 -> 110947 bytes
 .../motion-2b-evidence/block-real-desktop.png      |  Bin 0 -> 93391 bytes
 .../motion-2b-evidence/block-real-portrait.png     |  Bin 0 -> 52049 bytes
 .../motion-2b-evidence/bump-desktop-geo-real.png   |  Bin 0 -> 316491 bytes
 .../motion-2b-evidence/bump-geo-desktop.png        |  Bin 0 -> 71792 bytes
 .../motion-2b-evidence/bump-geo-portrait.png       |  Bin 0 -> 37512 bytes
 .../motion-2b-evidence/bump-portrait-geo-real.png  |  Bin 0 -> 124953 bytes
 .../motion-2b-evidence/bump-real-desktop.png       |  Bin 0 -> 115558 bytes
 .../motion-2b-evidence/bump-real-portrait.png      |  Bin 0 -> 56322 bytes
 .../motion-2b-evidence/check-after.json            |  996 ++++++
 .../motion-2b-evidence/check-before-174ba07.json   | 2565 +++++++++++++++
 docs/experiments/motion-2b-evidence/d0-after.json  | 3071 +++++++++++++++++
 .../motion-2b-evidence/d0-before-f4ccbec.json      | 3071 +++++++++++++++++
 .../motion-2b-evidence/d0-restore-only.json        | 3071 +++++++++++++++++
 docs/experiments/motion-2b-evidence/e1-after.json  | 1507 +++++++++
 .../e5-real-player-harness-tail.txt                |    2 +
 .../e5-real-player-report-628bccd.json             | 3452 ++++++++++++++++++++
 docs/experiments/motion-2b-evidence/e9-result.json |  140 +
 docs/experiments/motion-2b-evidence/e9-script.py   |  107 +
 docs/experiments/motion-2b-evidence/manifest.json  |  784 +++++
 .../npm-test-baseline-f4ccbec-tail.txt             |   12 +
 .../servefloat-desktop-geo-real.png                |  Bin 0 -> 275490 bytes
 .../motion-2b-evidence/servefloat-geo-desktop.png  |  Bin 0 -> 69394 bytes
 .../motion-2b-evidence/servefloat-geo-portrait.png |  Bin 0 -> 35867 bytes
 .../servefloat-portrait-geo-real.png               |  Bin 0 -> 112644 bytes
 .../motion-2b-evidence/servefloat-real-desktop.png |  Bin 0 -> 101440 bytes
 .../servefloat-real-portrait.png                   |  Bin 0 -> 52936 bytes
 .../servejump-desktop-geo-real.png                 |  Bin 0 -> 273172 bytes
 .../motion-2b-evidence/servejump-geo-desktop.png   |  Bin 0 -> 70743 bytes
 .../motion-2b-evidence/servejump-geo-portrait.png  |  Bin 0 -> 38193 bytes
 .../servejump-portrait-geo-real.png                |  Bin 0 -> 120068 bytes
 .../motion-2b-evidence/servejump-real-desktop.png  |  Bin 0 -> 99052 bytes
 .../motion-2b-evidence/servejump-real-portrait.png |  Bin 0 -> 56944 bytes
 .../motion-2b-evidence/set-desktop-geo-real.png    |  Bin 0 -> 259917 bytes
 .../motion-2b-evidence/set-geo-desktop.png         |  Bin 0 -> 60286 bytes
 .../motion-2b-evidence/set-geo-portrait.png        |  Bin 0 -> 33439 bytes
 .../motion-2b-evidence/set-portrait-geo-real.png   |  Bin 0 -> 114938 bytes
 .../motion-2b-evidence/set-real-desktop.png        |  Bin 0 -> 96777 bytes
 .../motion-2b-evidence/set-real-portrait.png       |  Bin 0 -> 55110 bytes
 .../motion-2b-evidence/spike-desktop-geo-real.png  |  Bin 0 -> 267490 bytes
 .../motion-2b-evidence/spike-geo-desktop.png       |  Bin 0 -> 67401 bytes
 .../motion-2b-evidence/spike-geo-portrait.png      |  Bin 0 -> 37016 bytes
 .../motion-2b-evidence/spike-portrait-geo-real.png |  Bin 0 -> 120350 bytes
 .../motion-2b-evidence/spike-real-desktop.png      |  Bin 0 -> 96293 bytes
 .../motion-2b-evidence/spike-real-portrait.png     |  Bin 0 -> 55784 bytes
 .../spikeWind-desktop-geo-real.png                 |  Bin 0 -> 258086 bytes
 .../motion-2b-evidence/spikeWind-geo-desktop.png   |  Bin 0 -> 66714 bytes
 .../motion-2b-evidence/spikeWind-geo-portrait.png  |  Bin 0 -> 37161 bytes
 .../spikeWind-portrait-geo-real.png                |  Bin 0 -> 120185 bytes
 .../motion-2b-evidence/spikeWind-real-desktop.png  |  Bin 0 -> 91070 bytes
 .../motion-2b-evidence/spikeWind-real-portrait.png |  Bin 0 -> 55232 bytes
 .../motion-2b-evidence/tip-desktop-geo-real.png    |  Bin 0 -> 234676 bytes
 .../motion-2b-evidence/tip-geo-desktop.png         |  Bin 0 -> 58266 bytes
 .../motion-2b-evidence/tip-geo-portrait.png        |  Bin 0 -> 32523 bytes
 .../motion-2b-evidence/tip-portrait-geo-real.png   |  Bin 0 -> 106170 bytes
 .../motion-2b-evidence/tip-real-desktop.png        |  Bin 0 -> 80227 bytes
 .../motion-2b-evidence/tip-real-portrait.png       |  Bin 0 -> 47649 bytes
 docs/experiments/motion-2b-report.md               |  181 +
 src/render/geoAnimator.js                          |  238 +-
 tools/motion-2b-check.mjs                          |  275 ++
 tools/motion-2b-e1-mirror.mjs                      |  179 +
 tools/motion-2b-lib.mjs                            |  107 +
 tools/motion-2b-poses.html                         |  145 +
 tools/motion-2b-shots.mjs                          |  132 +
 68 files changed, 20017 insertions(+), 60 deletions(-)
```

## 裁定後重驗（2026-09-27，使用者裁定兩題皆甲，修訂紀錄 a4c1d33）

- 舉球肘角維持 fast（40±10），`set.push.elflex.quick` 自 E2(a) 移出，E2(a) 改為 39 列；程式不改。
- 低手收勢：`bump` 加 `sustain: 0.2`（dur 0.5／hit 0.45 不動），commit **85c4e25**。

在 85c4e25 的 git archive 副本上重跑。repo 內 `motion-d0-measure.json` 保持 D0 基準、未覆蓋；改後輸出另存 `motion-2b-evidence/d0-after-85c4e25.json`。

| 條 | 結果 |
|---|---|
| E2(a) | **39／39 範圍內**；bump.end：頭 −5.7、軀幹 13.1、上臂 88.8、肘 173.0、大腿 19.9、膝 160.1 |
| E2(b) | 0.2368 m |
| E1 | PASS（例外表不變；span 0.1362 m、shline 107.61°） |
| E3 | 29 鍵差異 0；hitLeadTicks 區塊逐字相同；geo-animator 50／50 |
| E4 | 86 條驅動、4830 幀全過；最低鞋底 −0.0250 m |
| E5 | 85c4e25 本機 clone、埠 5205：A1–A6、A8–A12 全 true（`e5-real-player-report-85c4e25.json`） |
| E6 | 過（窗內最小權重 1.0000、最大逐幀 0.0270 m） |
| E8 | npm test 2603／2601／2＝A23a、A23b，與基準逐項相同（`npm-test-85c4e25-tail.txt`）；`npm run build` exit 0 |

修改後的測試有鑑別力：新測試配 864524d 的舊 animator（無 sustain）時，紅在行為斷言「bump 在 dur 0.5s 後應仍在尾段保持（sustain 0.2）」；以備份還原後 sha1 相符（95d804d9…），轉綠。

測試改動（使用者本條明確同意），改前／改後逐字 diff：

```diff
diff --git a/tests/geo-animator.test.mjs b/tests/geo-animator.test.mjs
index 2fb8c5f..8545e9b 100644
--- a/tests/geo-animator.test.mjs
+++ b/tests/geo-animator.test.mjs
@@ -253,13 +253,17 @@ test('§3 sustain 有界：預備撐完仍會鬆手回待命（不得永遠卡
   assert.ok(anim.isIdle(), '沒等到球的二傳應在撐住期滿後回待命');
 });
 
-test('§3 無 sustain 的序列行為完全不變（既有動作零影響）', () => {
+// 2026-09-27 使用者裁定（2B 低手收勢，選甲）：bump 加尾段保持 sustain 0.2（dur／hit 不動），
+// 本測試改為反映新的結束時刻＝dur 0.5＋sustain 0.2＝0.7s（見 docs/kickoffs/real-player-stage2-match.md 修訂紀錄）
+test('§3 bump 尾段保持有界：dur 0.5s 後仍撐住隨揮、dur＋sustain 0.7s 後結束', () => {
   const rig = mkRig();
   const anim = createGeoAnimator(rig);
-  anim.trigger('bump'); // dur 0.5、無 sustain
+  anim.trigger('bump'); // dur 0.5、sustain 0.2
   anim.update(0.5, 0);
   anim.update(0.01, 0);
-  assert.ok(anim.isIdle(), 'bump 應仍在 dur 0.5s 後結束（total===dur）');
+  assert.ok(!anim.isIdle(), 'bump 在 dur 0.5s 後應仍在尾段保持（sustain 0.2）');
+  anim.update(0.2, 0);
+  assert.ok(anim.isIdle(), 'bump 應在 dur＋sustain 0.7s 後結束');
 });
 
 // Phase 5 W1 §2 助跑三步節奏 ＋ §1b 慣用手（07-28 kickoff：表現層＋步序，戰術層不做）
```

## E7 日本男排參考版（使用者指示「以日本男排為主，石川祐希的動作很漂亮」）

- 三格並排圖（真人｜幾何｜寫實，只在本機）：`C:\Users\shung\AppData\Local\Temp\claude\C--Users-shung\b611e1c3-cb6d-40b3-94b3-ee053003c6ba\scratchpad\motion-2b-sidebyside-jp\`
- repo 內的遊戲截圖與 manifest（只記來源 URL、選手與對應關係）：`motion-2b-evidence/jp/`
- 遊戲鏡頭依參考照的視角調整（方位角記在 manifest `composites[].cam`）。
- 參考照：石川祐希 4 張（引臂＝他的跳發引臂、扣球擊球 2 張、跳發）、關田誠大 3 張（低手接發、舉球 2 張）、日本隊 5 號攔網 1 張。飄球、吊球找不到日本隊合格照片，只附幾何與寫實兩格。
- 與石川的差距清單：`docs/experiments/motion-2b-ishikawa-gap.md`（只列清單，未改 animator）。

## 第三輪：石川差距 a～g ＋「看起來不自然」診斷與改善（使用者裁定 a14d3ef「1.全做 2.不像 看起來不自然」）

最終程式 commit **e6b1899**。src 改動：`src/render/geoAnimator.js`，以及 `src/render/geoCharacter.js`（新增腳關節）。

### 一、石川差距 a～g

| 項 | 做法 | 改前 → 改後（D0 腳本同幀量：`d0-after-85c4e25.json` → `d0-after-natural.json`） | 狀態 |
|---|---|---|---|
| a 空中屈膝收腿 | 新 POSES 欄位 `airTuck`，只作用在跳躍弧 > 0 的幀，隨離地高度 12 cm 內漸入 | 扣球擊球幀膝角 168.4° → 121.6° | 做了 |
| b 擊球抬頭 | spikeHit neck −0.05 → −0.9 | 頭前傾 32.4° → 0.1° | 做了 |
| c 擊球臂更豎直 | 側傾 lean −0.25 → −0.4，擊球臂重搜；肩 x 保持 ≤ −2.5，即既有測試「大幅擺動」的下限 | 外展 130.9、水平內收 23.2（皆在文獻範圍）；腕高 2.56 → 2.60 m | 做了 |
| d 引臂反弓 | spikeWind spineUp −0.34 → −0.5 | 軀幹後仰 31.9° → 33.7° | 做了 |
| e 接發前傾 | bumpHit spine 0.32 → 0.55，肩 x 同步補償，保 E1 手臂世界方向 | 觸球軀幹 12.1° → 21.4°（文獻 19.84±10.19） | 做了 |
| f 接發前後腳 | 新 POSES 欄位 `stagger`：後腳＝非慣用側，髖後擺 0.25 rad | 見下方「f 的曲折」 | 做了（需腳關節） |
| g 引臂非擊球手降低 | spikeWind lSh x −2.55 → −1.9；**E1 例外依據更新**：spikeWind 例外加來源 URL（石川引臂照 vbm.link/21613）與使用者本條裁定 | 左腕 2.37 → 2.24 m。此幀 root 離地 0.25 m，左腕相對頭心仍高 0.38 m | 做了；還可再降，由使用者看 GIF 決定 |

**f 的曲折（據實記錄）**：
- 第一版在沒有踝關節的骨架上，用 `liftKnee`（找最小可行膝彎）讓後腳不入地。
- 自然度探針隨即量到它的解不連續：接發第 41 幀、助跑多處膝角單幀跳 36–48°。
- 沒有腳關節時，「後腳在身後又貼地」在幾何上不可能連續做到：大腿一後擺，鞋尖就先入地，膝彎加多少都要先經過一段更深的入地。
- 最後改為給幾何人加腳關節（成因 ① 的修法），f 才乾淨落地。

### 二、「不自然」成因診斷（逐項附證據）

量測工具：`tools/motion-2b-natural-probe.mjs`，數字在 `natural-probe-before.json`／`natural-probe-after.json`。另有 scratchpad 探針 t8／t9／t10／t12／t13 的逐幀列印，數字已抄進下表。

| # | 成因 | 證據（量得的數字） | 證據來源 |
|---|---|---|---|
| ① | **沒有踝關節**：鞋盒跟著小腿轉，後擺腿鞋尖必入地，補救的膝彎解不連續 | 改前待命鞋底 −0.059 m、深蹲 −0.24 m；2B 版（liftKnee）助跑膝角單幀跳 46.3–48.2°；接發 stagger 單幀 41° | `check-before-174ba07.json`；t8／t10 逐幀 |
| ② | **助跑步相 ↔ 一般跑動分支硬切** | 助跑結束那一幀左膝 20.2° → 44.5°、鞋底 −0.056 m | t9 逐幀 |
| ③ | **關鍵影格間線性內插**（速度在影格瞬間換檔） | M1 最大角速度跳變：扣球 258.4（改前）／44.4（2B）°/幀²；跳發 59.2／59.0 | M1 |
| ④ | **冷觸發從待命底層漸入**：持球→跳發時手臂先掉回待命再抬起；hold 切換瞬間套滿權重 | M6 跳發腕單幀 0.648 m（三版都有）；E6 窗外 windup 漸入 0.458 m | M6、E6 |
| ⑤ | **撐住時全身完全靜止** | M3 最長全靜止：2B 版接發預備 13 幀、持球 19 幀 | M3 |
| ⑥ | **全身同一幀起動、同一幀到位**（無近端領先、遠端跟隨） | M2 各段起動幀差多為 0 | M2 |
| ⑦ | **腳底滑動**（助跑步幅與位移不鎖定） | M5 踩地腳最大滑速：扣球助跑 16.5（改前）／22.8（2B）m/s | M5 |
| ⑧ | 寫實人蒙皮：雙臂高舉時腋下拉伸（第一階段紀錄最長 0.31 m） | 第一階段 F5 | `docs/real-player-stage1-acceptance.md` |
| ⑨ | 上一輪 E7 是靜態單幀，看不到動態 | 本輪改做逐幀 GIF | — |

### 三、改善（本輪做了的）

| 針對 | 做法 | 改善後（e6b1899） |
|---|---|---|
| ① | geoCharacter 加 `rFoot`／`lFoot`（膝下 0.44 m，零旋轉時與原鞋盒掛點位置等價）。animator 以解析式 `groundKnee` 求最小膝彎（踝不入地、連續），`footAngle` 依離地高度限制鞋子淨傾角 | 助跑膝角單幀跳變 46–48° → **14.8°**（2.55 m/s）；E4 最低鞋底 −0.0250 m |
| ② | 分支切換時只內插「擺腿量」0.15 s，下蹲量每幀用當下值 | 切換幀不再跳；E4 過 |
| ③ | 關鍵影格間改 C1 Hermite 曲線：影格值不變，D0 在影格時刻量的角度不受影響。擊球影格用單側切線，保住鞭打順序測試。曲線過衝夾在解剖限制內（肘不過伸、下蹲非負）。crouch 維持線性，保寫實人 A12 root 連續 | M1 扣球 44.4 → 25.0、跳發 59.0 → 26.9 °/幀² |
| ④ | 冷觸發與 hold 切換時，上半身從上一幀實際輸出平滑過渡 0.08 s。腿除外，由 ① 負責。windup 除外：時長被 E3 鎖在 0.1 s，從助跑後擺過渡反而更遠，實測 0.73 m/幀 | 跳發腕單幀 0.648 → 0.617 m |
| ⑤ | 動作層撐住時加呼吸（胸椎 ±1.4°、肩 ±1.1°） | M3 13／19 → **0** 幀 |
| ⑥ | 每段依關節做兩端固定的時間彎曲：骨盆 0.7、肩與胸 0.9、肘 1.15、腕與頭 1.35 | 影格時刻姿勢不變；鞭打順序測試仍綠 |
| 寫實人副作用 | 骨盆轉體時髖做反向扭轉（歐拉順序 YXZ），腿與膝仍朝前 | 寫實人 A2(d) 膝內外翻 0.126 → 0.000 m |

### 四、還沒解決的成因（據實）

- **⑦ 腳底滑動**：助跑中仍有 12.7 m/s 的踩地腳滑速（改前 16.5、2B 22.8）。要腳鎖定 IK，屬另案。
- **windup 起跳甩臂**：單幀 0.479 m 未改善。windup 時長 0.1 s 受 E3 鎖定，雙臂得在 6 幀內從後擺甩到頭上。
- **跳發起手**：單幀仍 0.617 m。hold 在 serve 觸發當幀被 matchView 清掉，過渡只 0.08 s（受 E6 窗限制）。
- **接發**：M6 0.084 → 0.127 m 略增，是 stagger 後腳移動帶來的。
- **⑧ 寫實人腋下拉伸**：本輪未處理。

### 五、給使用者判定的動態素材

- 本機（含石川參考靜圖）：`C:\Users\shung\AppData\Local\Temp\claude\C--Users-shung\b611e1c3-cb6d-40b3-94b3-ee053003c6ba\scratchpad\motion-2b-natural\` 的 `spike-ref.gif`、`bump-ref.gif`、`servejump-ref.gif`。
  - 欄：真人參考｜改前 f4ccbec｜2B 現況 8bda3f6｜本輪 e6b1899。
  - 列：幾何（上）、寫實（下）；直式、30 fps。
  - 扣球參考欄上下兩張：引臂（石川跳發引臂照）＋擊球。
- repo：`docs/experiments/motion-2b-evidence/natural/`，三張不含參考照的 GIF＋`manifest.json`（只記來源 URL 與對應關係）。
- 工具：`tools/motion-2b-anim.html`（三版共用 API 的逐 tick 截圖台）、`tools/motion-2b-gif.mjs`、`tools/motion-2b-gif-compose.py`。

### 六、本輪驗收重跑（e6b1899）

| 條 | 結果 |
|---|---|
| E2(a) | 39／39（`d0-after-natural.json`，副本上跑，repo 內 D0 基準未覆蓋） |
| E2(b) | 0.2394 m |
| E1 | PASS（spikeWind 例外依據已更新為「E2 列＋石川照片 URL」） |
| E3 | 29 鍵差異 0；geo-animator 50／50 |
| E4 | 86 驅動、4830 幀；最大膝角 177.39°、最大肘 180.00°、最低鞋底 −0.0250 m（改用腳關節上的鞋盒 8 角點） |
| E5 | e6b1899 本機 clone：A1–A6、A8–A12 全 true（`e5-real-player-report-e6b1899.json`）；膝內外翻 ≈0、root 單幀 0.0484 m |
| E6 | 過（窗內最小權重 1.0000） |
| E8 | npm test 2603／2601／2＝A23a、A23b，與基準逐項相同（`npm-test-e6b1899-tail.txt`）；`npm run build` exit 0 |

E8 過程中出現過一次基準外失敗，已歸因：
- 第一次全套（e6b1899，與 GIF 截圖、3 個 dev server 同時跑）多一條 `tests/pro-batch4c-wiring.test.mjs` W2「F2-1 非時機軸」失敗。這是任務說明點名的已知 CPU 敏感測試，用 `performance.now()` 忙等 35 ms。
- 該檔單獨連跑 5 次：9／9 × 5 全綠。
- 該檔只 import `src/sim/game.js`、`src/input/matchControls.js`、`src/career/careerState.js`，與本卷改動的兩個 render 檔無關。
- 關掉所有 dev server 後重跑全套：與基準逐項相同。未加 retry、sleep。

E4 工具的改動：`tools/motion-2b-check.mjs` 的鞋盒角點，有 `rFoot` 時改從腳關節算（鞋盒掛點跟著移過去），否則沿用膝局部的舊掛點。量的是同一個鞋盒（BoxGeometry 0.13×0.09×0.26），判定式未改。

## 七、魚躍 A 併入（2026-09-27，DA1–DA3）

依據：`docs/kickoffs/real-player-stage2-match.md` 修訂紀錄「使用者選魚躍方案 A」。方案 A
（sprawl 滑撲）原實作在分支 `feat/dive-proposals`（commit ecda0a5 程式、d2297fc 文件），
基於 f4ccbec，早於本分支（`feat/motion-d0`）2B 對 `geoAnimator.js` 的腿部/下蹲引擎重寫
（`src/render/geoAnimator.js` f4ccbec..HEAD +401 行：`squatAngle`/`groundKnee`/`footAngle`
解析式下蹲與腳底保護、`geoCharacter.js` 新增 `rFoot`/`lFoot` 腳關節、`blendKeys` 由兩點線性
內插改成四點 Hermite C1 連續曲線），不能直接 merge，改為手動移植：

- **姿勢與序列**：`diveA_step`／`diveA_reach`／`diveA_slide`／`diveA_push`／`diveA_rise` 五個
  姿勢數值逐字照搬進 `src/render/geoAnimator.js` 的 `POSES`；`SEQUENCES.dive` 的 `keys` 換成
  方案 A 的 8 個關鍵幀（`dur`/`jump`/`land` 不動，逐值同 677516f）。舊 `diveReach`／
  `diveSprawl`／`divePush` 三個姿勢保留（不再被 `dive` 播放，但 `tools/motion-2b-e1-mirror.mjs`
  的 E1 鏡像清單仍引用，不清除以免弄壞該治具）。
- **新增腿部欄位**（`rHipX`/`lHipX`/`rKneeX`/`lKneeX`/`rHipZ`/`lHipZ`，只有 `diveA_*` 姿勢
  宣告、其餘姿勢缺欄位＝0）併入 `blendKeys` 的 Hermite 曲線（鏡像規則同 `armKeyFor`：
  HipX/KneeX 對調左右來源、HipZ 另外反號），疊加在既有腿部計算（`groundKnee`/`footAngle`
  之前）。warp 指數初值沿用既有量級（0.85/1.1）在 DA2 治具的 G 條（貼地段軀幹 ≤0.08 m）
  以 0.007 m 之差落敗（Hermite 端點切線取自鄰近影格，`diveA_slide` 兩個相鄰同值關鍵幀的
  「停留」段因此不是純平——曲線在停留段末端已帶有朝下一姿勢的切線速度，提早越過門檻）；
  改為 1.3/1.3/1.1（同「近端領先、遠端跟隨」原則但方向相反——腿部緊接一段靜止 hold 後
  再變化，用高於 1 的 warp 讓速度在 hold 剛結束時仍接近 0，抑制切線造成的提前越界）後
  DA2 全過。此為僅有的一處數值調整，理由：keyframe 端點值不受 warp 影響（u=0/1 時 Hermite
  基底函式恆回端點值，與 warp 無關），只改變影格之間的曲線形狀，不影響 D0/DA 任何一條
  已凍結的門檻或姿勢定義本身。
- **root 曲線與接地補償**：`src/render/diveStyles.js`（新檔，來源同 commit，只保留方案 A：
  拿掉 B/C 兩支提案、`?dive=` 切換、divelab 預覽頁與 legacy 對照）；`matchView.js` 撲救期間
  一律走 `diveRootPose(p)`（不再需要 URL 參數）、撲出方向鎖定為「出手瞬間人→球」水平方向
  （不再追著飛走的球轉身）、接地補償只在魚躍窗內生效。
- **DA1（世界座標比對）**：`node tools/dive-proposal-check.mjs` 的判定（DA2，見下）在
  keyframe 端點上與 `feat/dive-proposals` 的 `?dive=a` 逐值相同（Hermite 曲線在 u=0/1 恆回
  端點值，同既有 armKeyFor 鏡像機制的數學保證）。但**非 keyframe 幀**與**待命底層姿勢
  （bumpReady 的下蹲量）**因 2B 引擎重寫而有系統性落差：右手探針全序列 45 幀逐關節世界
  座標比對，最差落在 k=32（p≈0.76，`diveA_push`→`diveA_rise` 過渡）的 lKnee，差 0.307 m；
  多數幀落在 0.09–0.20 m 量級，遠超過 0.02 m 門檻。歸因（見量測腳本
  `tools/_da1-dump.mjs`，比對後已刪除、未提交）：
  1. `bumpReady` 的 `crouch:0.2` 在舊引擎換算成 `-crouch*1.1=-0.22 rad`，在新引擎換算成
     `-squatAngle(crouch*0.55)=-0.68 rad`（`squatAngle` 是 2B 為了讓鞋底不入地而改的解析式
     反解，非本次改動）——待命底層本身就不是同一個姿勢，`diveA_rise`（`crouch:0.3`）與
     `bumpReady` 兩端也有相同量級落差。
  2. `blendKeys` 從兩點線性內插改成四點 Hermite 曲線（2B 自然度），非 keyframe 幀的中間
     姿勢形狀本來就不會與舊版線性內插逐值相同。
  這兩項都是 2B 已凍結驗收（E1–E9）涵蓋、且早於本卷併入的既有改動，不是本次移植引入的
  誤差；本卷唯一可控的驗證管道是 DA2（移植後的方案 A 幾何治具本身自洽）與 E4（全序列回歸，
  同一套腿部引擎下不反折/不入地）。
- **DA2**：`node tools/dive-proposal-check.mjs`（已移植，只保留方案 A 判定，B/C 與 legacy
  對照已刪除）——左右手 F1/F2/F3/G/H 全 PASS（見下方指令與輸出）。
- **DA3**：`dur`/`hit`/`airDur`/`jump` 與 677516f 相同（`tools/motion-2b-check.mjs --only e3`
  OK，29 鍵差異 0）；E2(a) 39/39；E4 OK；E5 A1–A6/A8–A12 全 true；E8 npm test
  2603/2601/2（A23a/A23b，與基準逐項相同）、`npm run build` 成功。
- **E7**：改為實機試玩判定（DA1 修訂紀錄），部署後另行請使用者手機試玩，結果待補。
