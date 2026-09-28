# R3 對抗審查修補（F2–F4）：突變實跑

突變都放在拋棄式工作樹：

- src 突變用 `git worktree add --detach` 開一份 HEAD（src 9c66afe），套上審查方提供的 `adv-realPlayer-mutations.diff`，旗標改讀環境變數；
- 另外兩種突變：splitBridges 門檻改讀 `__BR`；量尺副本加 `__NOIDX`，用來關掉索引對應檢查。

兩類突變跑完都已刪除。F4 的 baseline 檔來自 8720597 的正式輸出。

```
### F2 孤兒化（__EVIL：全部頂點複製接尾端、index 改指複製點、軀幹複製點權重改成 rShoulder）20k 量尺
$ __EVIL=1 node tools/real-skin-penetration-v2.mjs --faces=20k
exit=1
Error: 凍結集合與白模不相容：6517 個凍結頂點已不被任何三角形引用（孤兒，例 1680, 1685, 1686, 1758, 1759）
### F2 同上 20k (f)
$ __EVIL=1 node tools/real-skin-torso-drag.mjs --faces=20k
exit=1
Error: 凍結集合與白模不相容：6517 個凍結頂點已不被任何三角形引用（孤兒，例 1680, 1685, 1686, 1758, 1759）
### F3 三角形順序反轉（__REVERSE）20k 量尺
$ __REVERSE=1 node tools/real-skin-penetration-v2.mjs --faces=20k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0 第 0 角：當前頂點 9992、凍結時 10）
### F3 同上 20k (f)
$ __REVERSE=1 node tools/real-skin-torso-drag.mjs --faces=20k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0 第 0 角：當前頂點 9992、凍結時 10）
### F4 拿 heat 輸出當 baseline 20k
$ node tools/real-skin-torso-drag.mjs --faces=20k --variant=heat --baseline=<r2>/f-heat-20k.json
exit=1
Error: --baseline 必須是現況（variant=base），收到 variant=heat
### F2 孤兒化（__EVIL：全部頂點複製接尾端、index 改指複製點、軀幹複製點權重改成 rShoulder）5k 量尺
$ __EVIL=1 node tools/real-skin-penetration-v2.mjs --faces=5k
exit=1
Error: 凍結集合與白模不相容：1614 個凍結頂點已不被任何三角形引用（孤兒，例 444, 467, 471, 472, 473）
### F2 同上 5k (f)
$ __EVIL=1 node tools/real-skin-torso-drag.mjs --faces=5k
exit=1
Error: 凍結集合與白模不相容：1614 個凍結頂點已不被任何三角形引用（孤兒，例 444, 467, 471, 472, 473）
### F3 三角形順序反轉（__REVERSE）5k 量尺
$ __REVERSE=1 node tools/real-skin-penetration-v2.mjs --faces=5k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0 第 0 角：當前頂點 2501、凍結時 3）
### F3 同上 5k (f)
$ __REVERSE=1 node tools/real-skin-torso-drag.mjs --faces=5k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0 第 0 角：當前頂點 2501、凍結時 3）
### F4 拿 heat 輸出當 baseline 5k
$ node tools/real-skin-torso-drag.mjs --faces=5k --variant=heat --baseline=<r2>/f-heat-5k.json
exit=1
Error: --baseline 必須是現況（variant=base），收到 variant=heat
### F4 拿 HEAD src（9c66afe，variant=base）的輸出當 baseline 5k
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<r2>/f-headsrc-5k.json
exit=1
Error: --baseline 的 realPlayer.js 雜湊 a0cade19577e ≠ 8720597 的 b1489d7878dc（現況必須在 8720597 上量）
### 對照：不設突變旗標（HEAD src 9c66afe）5k 量尺
$ node tools/real-skin-penetration-v2.mjs --faces=5k
exit=0
診斷欄（不影響判定）：開口＝新計入點中最近點落在 S 開口邊的點數／其中最深 cm（舊量法對這些點一律「無法判定」不計）；近½＝該臂 w∈(0.4,0.6) 的頂點數（離門檻近、姿勢微調就可能翻面）。
診斷欄（不影響判定）：開口＝新計入點中最近點落在 S 開口邊的點數／其中最深 cm（舊量法對這些點一律「無法判定」不計）；近½＝該臂 w∈(0.4,0.6) 的頂點數（離門檻近、姿勢微調就可能翻面）。
## 門檻試算（新量法；只供參考，正式判定以驗收檔為準）
### 對照：8720597 現況當 baseline、不設突變旗標 5k (f)
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<r2>/f-base-5k.json
exit=0
- 判定：綠（9 幀全過）
### F3 第二道（突變：關掉索引對應檢查 __NOIDX＋三角形反轉 __REVERSE）20k 量尺
$ __NOIDX=1 __REVERSE=1 node tools/real-skin-penetration-v2.mjs --faces=20k
exit=1
Error: 量尺自我檢查不過，停止：(b) pelvis 地標 w 0.487（應 >0.5）；(e) pelvis 地標 w 0.467（應 >0.5）
### F3 第二道（突變：關掉索引對應檢查 __NOIDX＋三角形反轉 __REVERSE）5k 量尺
$ __NOIDX=1 __REVERSE=1 node tools/real-skin-penetration-v2.mjs --faces=5k
exit=1
Error: 量尺自我檢查不過，停止：(b) pelvis 地標 w 0.310（應 >0.5）；(e) pelvis 地標 w 0.283（應 >0.5）
### 合法接縫拆分不誤殺（突變 splitBridges 門檻 3→2，__BR=2，走真實 splitBridges）
__BR=2 20k: bridgeTris 59、R.n 10086（glb 10002）、改指複製點的角 84（其中 S_b 三角形 22）、內容指紋 S_b ece84ec42422 → 通過
__BR=2 5k: bridgeTris 35、R.n 2553（glb 2502）、改指複製點的角 51（其中 S_b 三角形 16）、內容指紋 S_b 316a9cc3890d → 通過
$ __BR=2 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=…/f-base-20k.json
- 判定：綠（9 幀全過）
$ __BR=2 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=…/f-base-5k.json
- 判定：綠（9 幀全過）
### 對照：同門檻改成 1（每條跨骨三角形都拆）→ 孤兒，停止（見回報殘留風險）
Error: 凍結集合與白模不相容：2 個凍結頂點已不被任何三角形引用（孤兒，例 4087, 6111）
Error: 凍結集合與白模不相容：1 個凍結頂點已不被任何三角形引用（孤兒，例 674）
```
