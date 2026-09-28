# R3 量尺交付：凍結集合＋量法 (f) 軀幹拖動——證據

> 規格：`../R3-criteria-frozen.md`（25ad442，逐字照做、未修改）。驗收總檔：`docs/kickoffs/real-skin-acceptance.md` 修訂紀錄 R3。
> 全部正式實跑都在 src 未改動的 8720597 拋棄式工作樹（detached；`git status -- src public` 乾淨，只多出未追蹤的 tools/ 量尺檔）；HEAD 參考在本分支（src 9c66afe）。

## 一、被穿入表面凍結

- 產生：`node tools/real-skin-freeze-sets.mjs --out=tools/real-skin-frozen-sets.json`（8720597，live 模式＝現行規則即時計算）。
  **整檔 sha256 `9a8a840b55ebcc78112ac8e2854818b5038d59474eb8e1182aa845edfbeb2478`**；同指令另開行程再產生一次，逐位元相同。

| | 20k | 5k |
|---|---|---|
| S_b 三角形（`lib.bindRegions().torsoTris`） | 5226（指紋 d6d98a384bc6） | 1218（51795153f668） |
| S_b 頂點與 8720597 主骨 | 2741：pelvis 1481、spine 802、spineUpper 350；非軀幹 108（rHip 26、lHip 31、rShoulder 21、lShoulder 30） | 669：pelvis 375、spine 188、spineUpper 84；非軀幹 22（rHip 5、lHip 3、rShoulder 4、lShoulder 10） |
| S_e 三角形／主骨頂點數 | 6154（a04194c4e319）／3165 | 1511（e1d1e6cb8b60）／800 |
| 手臂頂點 右／左（含部位） | 1093（0d964abdccf5）／1056（395e81b110ca） | 267（d289f9558735）／261（c2907d5124d0） |
| 綁定頂點數＝glb 原頂點數、三角形數、綁定位置雜湊 | 10002、20000、b6188e21f28d3c6a | 2502、5000、921125f1306103b2 |

集合指紋（前 12 碼）與 dbf4ee9 `before-*.txt` 表頭的「集合指紋」逐一相同。

- 每欄完整性 sha256：Sb、Se、armR、armL、SbVerts（排序後 Int32 ID）；armRPart、armLPart、SbMainBone、SbNormal、SeVerts（該欄 JSON 字串）。
- 量尺（`tools/real-skin-penetration-v2.mjs` 的 `loadSetup`）預設讀凍結檔。完整性、三角形數、綁定位置雜湊任一不符，就報錯停止。開口邊由凍結三角形在當前索引上重算。`loadSetup(faces, { live: true })` 只供產生凍結檔。
- **驗收 2（改壞→報錯）**：見 `tamper.md`。改一個 S_b 三角形 ID→`20k.Sb sha256 不符`；改一個綁定法線分量→`20k.SbNormal sha256 不符`；三角形數 −1→`三角形 20000 ≠ 19999`；綁定位置雜湊改成 0→`綁定位置不同`。四者都 exit 1；未改壞的對照 exit 0。

## 二、凍結版重跑 before 與 verify（驗收 3）

在 8720597 上用凍結版執行下列指令（`<dir>`＝暫存目錄）：
`node tools/real-skin-penetration-v2.mjs --faces=<f> --json=<dir>/before-<f>.json --txt=<dir>/before-<f>.txt`，
`node tools/real-skin-penetration-v2-verify.mjs --faces=<f> --out=<dir> --label=SRC-8720597 --only=V0,V1,V2,V3,V4,V6 --cli=<dir>/before-<f>.json --oldref=<repo>/docs/experiments/real-skin-evidence --oldprefix=before`

- `git show dbf4ee9:docs/experiments/real-skin-evidence/ruler-v2/before-<f>.<txt|json> | diff - <dir>/…`，四檔的差異都只有下列兩處：
  - txt 第 3 行（輸入雜湊）：`real-skin-penetration-v2.mjs 48486173ac2e` 改為 `bb278a710140`，並加上 `、real-skin-frozen-sets.json 9a8a840b55eb`；
  - json `hashes` 同樣兩處（`10c10,11`）。
  其餘逐位元相同。重跑產物放在 `frozen-rerun/`。
- verify：`git show dbf4ee9:… | cmp - <dir>/…` 共 10 檔逐位元相同，包括 `verify-V0V1V2V3V4V6-{20k,5k}.{txt,json}` 與 `v4-{K1a,K1b,K4b}-{20k,5k}.png`。sha256 與 `../v5-determinism.md` 表中第 1 次的值相同（例如 20k txt `b22fc077…`、5k json `e8ac2902…`）。

## 三、量法 (f) 軀幹拖動（驗收 4）

`node tools/real-skin-torso-drag.mjs --faces=<f> [--variant=base|heat|heatUpper] [--baseline=f-base-<f>.json] --json=… --txt=…`

- 「點數／最大往內位移 cm」，上限＝現況＋30 點、現況＋1.0 cm（四捨五入到 mm 後比較）。
- 「現況」＝8720597 的 base 變體；heat 與 heatUpper 也在 8720597 的 src 上跑。

20k（計入 2633、不計 108）：

| 幀 | 現況 8720597 | 上限 | heat（正式） | heatUpper keepBelowY 0.45（參考） | HEAD 9c66afe 外展 8°（參考） | 突變 r＝s 下的 heat |
|---|---|---|---|---|---|---|
| K1a | 459／11.5 | 489／12.5 | 1885／18.7 | 1885／18.7 | 459／11.5 | 0／0.0 |
| K1b | 251／9.3 | 281／10.3 | 1209／14.0 | 1209／14.0 | 251／9.3 | 0／0.0 |
| K2a | 57／5.1 | 87／6.1 | 1080／8.4 | 1081／8.4 | 57／5.1 | 0／0.0 |
| K2b | 378／10.7 | 408／11.7 | 1598／17.6 | 1598／17.6 | 378／10.7 | 0／0.0 |
| K3a | 76／6.4 | 106／7.4 | 808／8.4 | 808／8.4 | 76／6.4 | 0／0.0 |
| K3b | 71／6.5 | 101／7.5 | 783／7.9 | 783／7.9 | 71／6.5 | 0／0.0 |
| K4a | 20／2.8 | 50／3.8 | 500／5.5 | 500／5.5 | 20／2.8 | 0／0.0 |
| K4b | 120／8.1 | 150／9.1 | 1294／10.1 | 1294／10.1 | 120／8.1 | 0／0.0 |
| K4c | 140／5.3 | 170／6.3 | 1274／9.2 | 1274／9.2 | 140／5.3 | 0／0.0 |

5k（計入 647、不計 22）：

| 幀 | 現況 8720597 | 上限 | heat（正式） | heatUpper（參考） | HEAD 9c66afe（參考） | 突變 r＝s 下的 heat |
|---|---|---|---|---|---|---|
| K1a | 116／13.3 | 146／14.3 | 478／17.6 | 478／17.6 | 116／13.3 | 0／0.0 |
| K1b | 66／9.2 | 96／10.2 | 302／13.1 | 302／13.1 | 66／9.2 | 0／0.0 |
| K2a | 17／4.7 | 47／5.7 | 258／8.5 | 258／8.5 | 17／4.7 | 0／0.0 |
| K2b | 97／12.0 | 127／13.0 | 387／16.4 | 387／16.4 | 97／12.0 | 0／0.0 |
| K3a | 22／5.9 | 52／6.9 | 226／7.0 | 226／7.0 | 22／5.9 | 0／0.0 |
| K3b | 21／6.0 | 51／7.0 | 209／7.3 | 209／7.3 | 21／6.0 | 0／0.0 |
| K4a | 5／2.6 | 35／3.6 | 153／5.5 | 153／5.5 | 5／2.6 | 0／0.0 |
| K4b | 37／6.4 | 67／7.4 | 336／7.8 | 336／7.8 | 37／6.4 | 0／0.0 |
| K4c | 34／4.3 | 64／5.3 | 323／9.3 | 323／9.3 | 34／4.3 | 0／0.0 |

- **現況綠**：`f-baseGate-{20k,5k}.txt` 判定「綠（9 幀全過）」。構造上一定是綠的。
- **正式熱擴散候選紅**：`f-heat-{20k,5k}.txt` 判定「紅（不過 9 幀）」，而且每一幀的點數與位移兩項都不過。
  參考值 heatUpper 也是紅（`f-heatUpper-*`），HEAD 9c66afe 綠（`f-head9c66afe-*`）。
- **突變 r＝s 被抓到**：突變放在拋棄式工作樹的 `tools-mutR3/` 副本，唯一改動是 `real-skin-torso-drag.mjs:42` 的剛性參考改用蒙皮後位置。
  現況基準也用同一份突變工具重產（`f-mutRS-base-*`）。在這個條件下 heat 變成「綠（9 幀全過）」（`f-mutRS-heat-*`，每幀 0／0.0），鑑別的兩面失效，也就是突變被抓到。副本跑完已刪除。
- 決定性：base 20k／5k 另開行程重跑，txt 與 json 都逐位元相同。
- HEAD 9c66afe 與現況數字完全相同（到 1e-6 m），這是真的量到了，不是沒量到。探針顯示：K4a／K4b 外展 8° 讓 162 個 S_b 頂點移動，最多 1.3 cm；但這些頂點沒有一個越過 2 cm，也沒有改變最大值。K1a 手臂高舉，淡出後外展為 0，頂點不動。
- 紅燈來源（診斷探針，未落檔）：heat 20k 各幀 >2 cm 的頂點，依熱擴散權重歸類。
  - 手臂骨權重 ≥0.05：K1a 1469、K3a 623、K4a 455、K4c 1070。
  - 腿骨權重 ≥0.05（而非手臂）：K1a 416、K3a 185、K4a 45、K4c 204。
  - 只有軀幹骨：0。
  結論：紅燈主要來自「軀幹皮跟著手臂走」，也就是 S11 要堵的漏洞；另有一部分來自骨盆皮跟著大腿走，(f) 不區分這兩種。

## 四、超出規格字面的讀法（另行回報）

1. **手臂頂點也凍結**（規格已註明「超出派工字面」）。
2. **主軀幹骨的讀法**依規格第二節：主骨不是 pelvis、spine、spineUpper 的 S_b 頂點不計，數量照列。
3. 凍結檔多存 **S_b 每頂點的主骨名**（不只軀幹骨序號）與**完整 Float32 綁定法線**（不四捨五入）。完整性雜湊涵蓋每一欄，不只集合 ID。
4. **綁定位置雜湊的範圍**：只算前 `verts` 個頂點。8720597 的綁定頂點數等於 glb 原頂點數（無接縫拆分複製點，產生器有斷言檢查）。實作若換權重，使 `splitBridges` 多出複製點，它們只會接在尾端，所以仍相容；少於凍結頂點數則報錯。
5. `--baseline` 另外檢查兩份的凍結檔雜湊相同，不同就報錯。
