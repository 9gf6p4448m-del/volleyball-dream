# R3／R4 修補覆審第 2 輪（N1–N4）：突變實跑

突變都在拋棄式工作樹執行：從 HEAD 0322004（src 9c66afe）用 `git worktree add --detach` 開出。

- src 突變以環境變數切換，全文見 `adv-r2-mutations-src.diff`：
  - `__EVIL`、`__REVERSE`：沿用第 1 輪突變；
  - `EVIL2`：覆審員提供的 `evil2-snippet.js`；
  - `__ROT`：只旋轉角序；
  - `__FLIP`：反轉繞行方向；
  - `__BR`：splitBridges 門檻；
  - `__BADW`／`__NEGW`：權重總和錯、權重為負。
- 基準檔 `<n2>/f-base-*`、`before-*` 是 8720597 上的正式輸出，與本目錄 `R4/f-base-*`、`frozen-rerun/before-*` 相同。
- 工作樹用完即移除。移除前確認其中的 node_modules 是複本而非連結（`LinkType` 為空）；刪除後主專案 node_modules 仍有 262 項。

```
### N1 EVIL2 20k (f)
$ EVIL2=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n2>/f-base-20k.json
exit=0
[EVIL2] n0=10002 slots=60000 keptOriginalSlots=10002
- 判定：紅（不過 9 幀）
### N1 EVIL2 20k penetration-v2 S2(i)
$ EVIL2=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n2>/before-20k.json
exit=0
[EVIL2] n0=10002 slots=60000 keptOriginalSlots=10002
- 退步 14 項：K1a右 1056/24.5 > 現況 22/4.0；K1a左 826/44.8 > 現況 6/1.4；K1b右 1060/37.6 > 現況 0/0.0；K1b左 432/17.5 > 現況 259/9.7；K2a右 692/36.0 > 現況 95/8.0；K2a左 617/23.7 > 現況 92/7.1；K2b右 938/32.6 > 現況 1/0.0；K2b左 577/26.5 > 現況 20/2.9；K3a右 129/15.0 > 現況 69/7.3；K3a左 256/15.1 > 現況 162/7.3；K3b左 733/17.3 > 現況 69/4.9；K4b左 252/19.4 > 現況 154/8.9；K4c右 644/30.0 > 現況 90/7.7；K4c左 568/31.1 > 現況 87/7.1
### 舊突變 EVIL 20k (f)
$ __EVIL=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n2>/f-base-20k.json
exit=0
- 判定：紅（不過 9 幀）
### 舊突變 EVIL 20k penetration-v2 S2(i)
$ __EVIL=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n2>/before-20k.json
exit=0
- 退步 8 項：K1a左 80/4.2 > 現況 6/1.4；K2a左 518/12.7 > 現況 92/7.1；K2b左 57/3.1 > 現況 20/2.9；K3a左 152/8.2 > 現況 162/7.3；K3b左 70/4.7 > 現況 69/4.9；K4a左 697/15.2 > 現況 420/8.3；K4b左 354/12.6 > 現況 154/8.9；K4c左 296/11.5 > 現況 87/7.1
### 舊突變 REVERSE 20k penetration-v2
$ __REVERSE=1 node tools/real-skin-penetration-v2.mjs --faces=20k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 9992,9998,10001、凍結時 10,0,1；只容許角序旋轉與對回來源的複製點）
### 舊突變 REVERSE 20k (f)
$ __REVERSE=1 node tools/real-skin-torso-drag.mjs --faces=20k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 9992,9998,10001、凍結時 10,0,1；只容許角序旋轉與對回來源的複製點）
### 繞行反轉 FLIP 20k penetration-v2
$ __FLIP=1 node tools/real-skin-penetration-v2.mjs --faces=20k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 10,1,0、凍結時 10,0,1；只容許角序旋轉與對回來源的複製點）
### 對照：HEAD src 無突變 20k penetration-v2 S2(i)
$ node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n2>/before-20k.json
exit=0
- 18 項（9 幀×左右臂）全部 ≤ 現況
### 對照：HEAD src 無突變 20k (f)
$ node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n2>/f-base-20k.json
exit=0
- 判定：綠（9 幀全過）
### N2 合法：角序旋轉 ROT 20k (f)
$ __ROT=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n2>/f-base-20k.json
exit=0
- 判定：綠（9 幀全過）
### N2 合法：角序旋轉 ROT 20k penetration-v2 S2(i)
$ __ROT=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n2>/before-20k.json
exit=0
- 18 項（9 幀×左右臂）全部 ≤ 現況
### N2 合法：splitBridges 門檻 1（__BR=1）20k (f)
$ __BR=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n2>/f-base-20k.json
exit=0
- 判定：綠（9 幀全過）
### N2 合法：__BR=1 20k penetration-v2 S2(i)
$ __BR=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n2>/before-20k.json
exit=0
- 退步 3 項：K1a左 8/1.4 > 現況 6/1.4；K2b左 22/2.8 > 現況 20/2.9；K3b左 45/6.7 > 現況 69/4.9
### N1 EVIL2 5k (f)
$ EVIL2=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/f-base-5k.json
exit=0
[EVIL2] n0=2502 slots=15000 keptOriginalSlots=2502
- 判定：紅（不過 9 幀）
### N1 EVIL2 5k penetration-v2 S2(i)
$ EVIL2=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n2>/before-5k.json
exit=0
[EVIL2] n0=2502 slots=15000 keptOriginalSlots=2502
- 退步 13 項：K1a右 196/22.8 > 現況 2/4.1；K1a左 116/22.0 > 現況 0/0.0；K1b右 117/22.7 > 現況 0/0.0；K2a右 43/17.7 > 現況 22/7.3；K2a左 86/17.3 > 現況 21/6.5；K2b右 158/26.0 > 現況 0/0.0；K2b左 52/9.5 > 現況 4/2.4；K3a右 7/8.0 > 現況 20/7.7；K3a左 35/7.8 > 現況 41/7.5；K3b左 131/17.5 > 現況 17/5.0；K4b左 33/11.1 > 現況 36/8.1；K4c右 71/20.9 > 現況 20/6.3；K4c左 88/18.0 > 現況 19/6.4
### 舊突變 EVIL 5k (f)
$ __EVIL=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/f-base-5k.json
exit=0
- 判定：紅（不過 9 幀）
### 舊突變 EVIL 5k penetration-v2 S2(i)
$ __EVIL=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n2>/before-5k.json
exit=0
- 退步 8 項：K1a左 24/4.8 > 現況 0/0.0；K2a左 123/14.0 > 現況 21/6.5；K2b左 16/2.9 > 現況 4/2.4；K3a左 38/7.6 > 現況 41/7.5；K3b左 15/5.2 > 現況 17/5.0；K4a左 153/15.4 > 現況 87/7.7；K4b左 87/12.7 > 現況 36/8.1；K4c左 75/12.0 > 現況 19/6.4
### 舊突變 REVERSE 5k penetration-v2
$ __REVERSE=1 node tools/real-skin-penetration-v2.mjs --faces=5k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 2501,2498,2490、凍結時 3,2,4；只容許角序旋轉與對回來源的複製點）
### 舊突變 REVERSE 5k (f)
$ __REVERSE=1 node tools/real-skin-torso-drag.mjs --faces=5k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 2501,2498,2490、凍結時 3,2,4；只容許角序旋轉與對回來源的複製點）
### 繞行反轉 FLIP 5k penetration-v2
$ __FLIP=1 node tools/real-skin-penetration-v2.mjs --faces=5k
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 3,4,2、凍結時 3,2,4；只容許角序旋轉與對回來源的複製點）
### 對照：HEAD src 無突變 5k penetration-v2 S2(i)
$ node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n2>/before-5k.json
exit=0
- 18 項（9 幀×左右臂）全部 ≤ 現況
### 對照：HEAD src 無突變 5k (f)
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/f-base-5k.json
exit=0
- 判定：綠（9 幀全過）
### N2 合法：角序旋轉 ROT 5k (f)
$ __ROT=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/f-base-5k.json
exit=0
- 判定：綠（9 幀全過）
### N2 合法：角序旋轉 ROT 5k penetration-v2 S2(i)
$ __ROT=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n2>/before-5k.json
exit=0
- 18 項（9 幀×左右臂）全部 ≤ 現況
### N2 合法：splitBridges 門檻 1（__BR=1）5k (f)
$ __BR=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/f-base-5k.json
exit=0
- 判定：綠（9 幀全過）
### N2 合法：__BR=1 5k penetration-v2 S2(i)
$ __BR=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n2>/before-5k.json
exit=0
- 退步 7 項：K1a左 1/1.2 > 現況 0/0.0；K2a左 19/7.0 > 現況 21/6.5；K2b左 5/2.3 > 現況 4/2.4；K3b左 12/6.0 > 現況 17/5.0；K4b左 33/8.2 > 現況 36/8.1；K4c右 20/7.7 > 現況 20/6.3；K4c左 18/6.7 > 現況 19/6.4
### N4 權重合法性
$ __BADW=1 node tools/real-skin-penetration-v2.mjs --faces=5k
exit=1
Error: 權重不合法：頂點 100 權重總和 1.7403307557106018（應 1±1e-4）
### N4 權重合法性
$ __NEGW=1 node tools/real-skin-torso-drag.mjs --faces=5k
exit=1
Error: 權重不合法：頂點 100 第 1 個權重 -0.2403307557106018 < 0 或非數
### N3 baseline 的 geoAnimator.js 雜湊被改
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/bad-geoAnimator.js.json
exit=1
Error: --baseline 的輸入雜湊 geoAnimator.js 000000000000 ≠ 本次 250a1f1cb469，不能比較
### N3 baseline 的 real-skin-lib.mjs 雜湊被改
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/bad-real-skin-lib.mjs.json
exit=1
Error: --baseline 的輸入雜湊 real-skin-lib.mjs 000000000000 ≠ 本次 841432f22024，不能比較
### N3 baseline 的 real-skin-penetration-v2.mjs 雜湊被改
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/bad-real-skin-penetration-v2.mjs.json
exit=1
Error: --baseline 的輸入雜湊 real-skin-penetration-v2.mjs 000000000000 ≠ 本次 8459b78f8bcd，不能比較
### N3 baseline 的 geoCharacter.js 雜湊被改
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n2>/bad-geoCharacter.js.json
exit=1
Error: --baseline 的輸入雜湊 geoCharacter.js 000000000000 ≠ 本次 5a149abadd3e，不能比較
```

## splitBridges 門檻 1 的 S2(i) 退步拆解（診斷）

在突變副本另加 `__NOREPS`，讓 penetration-v2 只量原頂點、不量複製點，用來拆出退步的來源。這只是診斷用的副本，正式工具沒有這個開關。

```
20k：只量原頂點 → 退步 1 項：K3b左 45/6.7 > 現況 69/4.9
5k ：只量原頂點 → 退步 5 項：K2a左 19/7.0 > 現況 21/6.5；K3b左 12/6.0 > 現況 17/5.0；K4b左 33/8.2 > 現況 36/8.1；K4c右 20/7.7 > 現況 20/6.3；K4c左 18/6.7 > 現況 19/6.4
__BR=1 20k: bridgeTris 1385、R.n 12075、改指複製點的角 2073、旋轉三角形 0、原頂點被拆光（由複製點代表）2、有複製點的手臂頂點 132
__BR=1 5k: bridgeTris 690、R.n 3540、改指複製點的角 1038、旋轉三角形 0、原頂點被拆光（由複製點代表）1、有複製點的手臂頂點 74
__ROT 20k/5k: 旋轉三角形 20000／5000、改指複製點的角 0
```
