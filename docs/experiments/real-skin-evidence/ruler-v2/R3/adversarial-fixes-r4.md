# R6（第 4 輪覆審後補三項防線、定稿）：突變實跑

所有突變都在拋棄式工作樹上執行：`git worktree add --detach … fcc98bd`（src 9c66afe），套用覆審員的 `r4-mutations-src.diff`，全文存於 `R4/adv-r4-mutations-src.diff`。

- 基準 `<n6>/f-base-*`、`before-*` 是 8720597 上的正式輸出，與本目錄的 `R4/f-base-*`、`frozen-rerun/before-*` 相同。
- 移除工作樹前先確認其中的 node_modules 是複本（`LinkType` 為空）；刪除後，主專案的 node_modules 仍有 262 項。
- 預設門檻（`__BR` 未設＝3）下，base 與 heat 都不停止：8720597 上 heat／heatUpper／heatTorsoOnly／heatNoArm／heatNoLeg 全部跑完（`R4/f-heat*`）；HEAD src 無突變的對照也綠（見下）。

```
### meshcond 20k (f)
$ __MESH=1 __MESHCOND=arg node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
[MESH] createRealPlayer: n0=10002 torsoVertsToRShoulder=3327 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（遊戲參數 身高 1.7：屬性 position）
### meshcond 20k penetration-v2
$ __MESH=1 __MESHCOND=arg node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-meshcond-20k.json
exit=1
[MESH] createRealPlayer: n0=10002 torsoVertsToRShoulder=3327 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（遊戲參數 身高 1.7：屬性 position）
### child 20k (f)
$ __CHILD=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
Error: 畫面網格有子物件 1 個（載入），量尺只量網格本身
### child 20k penetration-v2
$ __CHILD=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-child-20k.json
exit=1
Error: 畫面網格有子物件 1 個（載入），量尺只量網格本身
### br1 20k (f)
$ __BR=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
Error: 凍結集合與白模不相容：手臂頂點 8411 的複製點 11779 主骨非手臂骨卻帶手臂骨權重 0.4859188497066498（被排除的複製點不得受手臂影響）
### br1 20k penetration-v2
$ __BR=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-br1-20k.json
exit=1
Error: 凍結集合與白模不相容：手臂頂點 8411 的複製點 11779 主骨非手臂骨卻帶手臂骨權重 0.4859188497066498（被排除的複製點不得受手臂影響）
### mesh 20k (f)
$ __MESH=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
[MESH] createRealPlayer: n0=10002 torsoVertsToRShoulder=3327 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（載入：屬性 position）
### mesh 20k penetration-v2
$ __MESH=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-mesh-20k.json
exit=1
[MESH] createRealPlayer: n0=10002 torsoVertsToRShoulder=3327 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（載入：屬性 position）
### meshbadw 20k (f)
$ __MESH=badw node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
[MESH] createRealPlayer: n0=10002 torsoVertsToRShoulder=3327 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（載入：屬性 position）
### meshbadw 20k penetration-v2
$ __MESH=badw node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-meshbadw-20k.json
exit=1
[MESH] createRealPlayer: n0=10002 torsoVertsToRShoulder=3327 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（載入：屬性 position）
### evil2 20k (f)
$ EVIL2=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=0
[EVIL2] n0=10002 slots=60000 keptOriginalSlots=10002
- 判定：紅（不過 9 幀）
### evil2 20k penetration-v2
$ EVIL2=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-evil2-20k.json
exit=0
[EVIL2] n0=10002 slots=60000 keptOriginalSlots=10002
- 退步 14 項：K1a右 1056/24.5 > 現況 22/4.0；K1a左 826/44.8 > 現況 6/1.4；K1b右 1060/37.6 > 現況 0/0.0；K1b左 432/17.5 > 現況 259/9.7；K2a右 692/36.0 > 現況 95/8.0；K2a左 617/23.7 > 現況 92/7.1；K2b右 938/32.6 > 現況 1/0.0；K2b左 577/26.5 > 現況 20/2.9；K3a右 129/15.0 > 現況 69/7.3；K3a左 256/15.1 > 現況 162/7.3；K3b左 733/17.3 > 現況 69/4.9；K4b左 252/19.4 > 現況 154/8.9；K4c右 644/30.0 > 現況 90/7.7；K4c左 568/31.1 > 現況 87/7.1
### evil 20k (f)
$ __EVIL=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=0
- 判定：紅（不過 9 幀）
### evil 20k penetration-v2
$ __EVIL=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-evil-20k.json
exit=0
- 退步 8 項：K1a左 80/4.2 > 現況 6/1.4；K2a左 518/12.7 > 現況 92/7.1；K2b左 57/3.1 > 現況 20/2.9；K3a左 152/8.2 > 現況 162/7.3；K3b左 70/4.7 > 現況 69/4.9；K4a左 697/15.2 > 現況 420/8.3；K4b左 354/12.6 > 現況 154/8.9；K4c左 296/11.5 > 現況 87/7.1
### rev 20k (f)
$ __REVERSE=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 9992,9998,10001、凍結時 10,0,1；只容許角序旋轉與對回來源的複製點）
### rev 20k penetration-v2
$ __REVERSE=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-rev-20k.json
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 9992,9998,10001、凍結時 10,0,1；只容許角序旋轉與對回來源的複製點）
### flip 20k (f)
$ __FLIP=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 10,1,0、凍結時 10,0,1；只容許角序旋轉與對回來源的複製點）
### flip 20k penetration-v2
$ __FLIP=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-flip-20k.json
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 10,1,0、凍結時 10,0,1；只容許角序旋轉與對回來源的複製點）
### near 20k (f)
$ EVIL2=1 __NEAR=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
[EVIL2] n0=10002 slots=60000 keptOriginalSlots=10002
[NEAR] nudged x by 1 ulp for dups 10002
Error: 凍結集合與白模不相容：索引被改動（三角形 1：當前 5,9,10002、凍結時 5,9,0；只容許角序旋轉與對回來源的複製點）
### near 20k penetration-v2
$ EVIL2=1 __NEAR=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-near-20k.json
exit=1
[EVIL2] n0=10002 slots=60000 keptOriginalSlots=10002
[NEAR] nudged x by 1 ulp for dups 10002
Error: 凍結集合與白模不相容：索引被改動（三角形 1：當前 5,9,10002、凍結時 5,9,0；只容許角序旋轉與對回來源的複製點）
### addtri 20k (f)
$ __ADDTRI=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
Error: 凍結集合與白模不相容：三角形 20001 ≠ 20000
### addtri 20k penetration-v2
$ __ADDTRI=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-addtri-20k.json
exit=1
Error: 凍結集合與白模不相容：三角形 20001 ≠ 20000
### swap 20k (f)
$ __SWAPTRI=7 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
[SWAPTRI] tri 7 corner0 14 -> 0
Error: 凍結集合與白模不相容：索引被改動（三角形 7：當前 0,15,2、凍結時 14,15,2；只容許角序旋轉與對回來源的複製點）
### swap 20k penetration-v2
$ __SWAPTRI=7 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-swap-20k.json
exit=1
[SWAPTRI] tri 7 corner0 14 -> 0
Error: 凍結集合與白模不相容：索引被改動（三角形 7：當前 0,15,2、凍結時 14,15,2；只容許角序旋轉與對回來源的複製點）
### badw 20k (f)
$ __BADW=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
Error: 權重不合法：頂點 100 權重總和 2（應 1±1e-4）
### badw 20k penetration-v2
$ __BADW=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-badw-20k.json
exit=1
Error: 權重不合法：頂點 100 權重總和 2（應 1±1e-4）
### negw 20k (f)
$ __NEGW=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=1
Error: 權重不合法：頂點 100 第 1 個權重 -0.5 < 0 或非數
### negw 20k penetration-v2
$ __NEGW=1 node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-negw-20k.json
exit=1
Error: 權重不合法：頂點 100 第 1 個權重 -0.5 < 0 或非數
### 對照：HEAD src 無突變 20k (f)
$ node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=0
- 判定：綠（9 幀全過）
### 對照：HEAD src 無突變 20k penetration-v2
$ node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/before-20k.json --json=<n6>/own-head-20k.json
exit=0
- 18 項（9 幀×左右臂）全部 ≤ 現況
### NF2：HEAD 自己的輸出當 S2(i) baseline 20k
$ node tools/real-skin-penetration-v2.mjs --faces=20k --baseline=<n6>/own-head-20k.json
exit=1
Error: --baseline 的 realPlayer.js 雜湊 ecc4cfc175f6 ≠ 8720597 的 b1489d7878dc（現況必須在 8720597 上量）
### 合法 ROT 20k (f)
$ __ROT=1 node tools/real-skin-torso-drag.mjs --faces=20k --baseline=<n6>/f-base-20k.json
exit=0
- 判定：綠（9 幀全過）
### meshcond 5k (f)
$ __MESH=1 __MESHCOND=arg node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
[MESH] createRealPlayer: n0=2502 torsoVertsToRShoulder=824 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（遊戲參數 身高 1.7：屬性 position）
### meshcond 5k penetration-v2
$ __MESH=1 __MESHCOND=arg node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-meshcond-5k.json
exit=1
[MESH] createRealPlayer: n0=2502 torsoVertsToRShoulder=824 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（遊戲參數 身高 1.7：屬性 position）
### child 5k (f)
$ __CHILD=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
Error: 畫面網格有子物件 1 個（載入），量尺只量網格本身
### child 5k penetration-v2
$ __CHILD=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-child-5k.json
exit=1
Error: 畫面網格有子物件 1 個（載入），量尺只量網格本身
### br1 5k (f)
$ __BR=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
Error: 凍結集合與白模不相容：手臂頂點 2170 的複製點 3392 主骨非手臂骨卻帶手臂骨權重 0.3244084417819977（被排除的複製點不得受手臂影響）
### br1 5k penetration-v2
$ __BR=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-br1-5k.json
exit=1
Error: 凍結集合與白模不相容：手臂頂點 2170 的複製點 3392 主骨非手臂骨卻帶手臂骨權重 0.3244084417819977（被排除的複製點不得受手臂影響）
### mesh 5k (f)
$ __MESH=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
[MESH] createRealPlayer: n0=2502 torsoVertsToRShoulder=824 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（載入：屬性 position）
### mesh 5k penetration-v2
$ __MESH=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-mesh-5k.json
exit=1
[MESH] createRealPlayer: n0=2502 torsoVertsToRShoulder=824 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（載入：屬性 position）
### meshbadw 5k (f)
$ __MESH=badw node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
[MESH] createRealPlayer: n0=2502 torsoVertsToRShoulder=824 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（載入：屬性 position）
### meshbadw 5k penetration-v2
$ __MESH=badw node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-meshbadw-5k.json
exit=1
[MESH] createRealPlayer: n0=2502 torsoVertsToRShoulder=824 index all -> dups
Error: 畫面幾何與量尺幾何不是同一份資料（載入：屬性 position）
### evil2 5k (f)
$ EVIL2=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=0
[EVIL2] n0=2502 slots=15000 keptOriginalSlots=2502
- 判定：紅（不過 9 幀）
### evil2 5k penetration-v2
$ EVIL2=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-evil2-5k.json
exit=0
[EVIL2] n0=2502 slots=15000 keptOriginalSlots=2502
- 退步 13 項：K1a右 196/22.8 > 現況 2/4.1；K1a左 116/22.0 > 現況 0/0.0；K1b右 117/22.7 > 現況 0/0.0；K2a右 43/17.7 > 現況 22/7.3；K2a左 86/17.3 > 現況 21/6.5；K2b右 158/26.0 > 現況 0/0.0；K2b左 52/9.5 > 現況 4/2.4；K3a右 7/8.0 > 現況 20/7.7；K3a左 35/7.8 > 現況 41/7.5；K3b左 131/17.5 > 現況 17/5.0；K4b左 33/11.1 > 現況 36/8.1；K4c右 71/20.9 > 現況 20/6.3；K4c左 88/18.0 > 現況 19/6.4
### evil 5k (f)
$ __EVIL=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=0
- 判定：紅（不過 9 幀）
### evil 5k penetration-v2
$ __EVIL=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-evil-5k.json
exit=0
- 退步 8 項：K1a左 24/4.8 > 現況 0/0.0；K2a左 123/14.0 > 現況 21/6.5；K2b左 16/2.9 > 現況 4/2.4；K3a左 38/7.6 > 現況 41/7.5；K3b左 15/5.2 > 現況 17/5.0；K4a左 153/15.4 > 現況 87/7.7；K4b左 87/12.7 > 現況 36/8.1；K4c左 75/12.0 > 現況 19/6.4
### rev 5k (f)
$ __REVERSE=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 2501,2498,2490、凍結時 3,2,4；只容許角序旋轉與對回來源的複製點）
### rev 5k penetration-v2
$ __REVERSE=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-rev-5k.json
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 2501,2498,2490、凍結時 3,2,4；只容許角序旋轉與對回來源的複製點）
### flip 5k (f)
$ __FLIP=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 3,4,2、凍結時 3,2,4；只容許角序旋轉與對回來源的複製點）
### flip 5k penetration-v2
$ __FLIP=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-flip-5k.json
exit=1
Error: 凍結集合與白模不相容：索引被改動（三角形 0：當前 3,4,2、凍結時 3,2,4；只容許角序旋轉與對回來源的複製點）
### near 5k (f)
$ EVIL2=1 __NEAR=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
[EVIL2] n0=2502 slots=15000 keptOriginalSlots=2502
[NEAR] nudged x by 1 ulp for dups 2502
Error: 凍結集合與白模不相容：索引被改動（三角形 1：當前 0,2504,1、凍結時 0,2,1；只容許角序旋轉與對回來源的複製點）
### near 5k penetration-v2
$ EVIL2=1 __NEAR=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-near-5k.json
exit=1
[EVIL2] n0=2502 slots=15000 keptOriginalSlots=2502
[NEAR] nudged x by 1 ulp for dups 2502
Error: 凍結集合與白模不相容：索引被改動（三角形 1：當前 0,2504,1、凍結時 0,2,1；只容許角序旋轉與對回來源的複製點）
### addtri 5k (f)
$ __ADDTRI=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
Error: 凍結集合與白模不相容：三角形 5001 ≠ 5000
### addtri 5k penetration-v2
$ __ADDTRI=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-addtri-5k.json
exit=1
Error: 凍結集合與白模不相容：三角形 5001 ≠ 5000
### swap 5k (f)
$ __SWAPTRI=7 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
[SWAPTRI] tri 7 corner0 14 -> 0
Error: 凍結集合與白模不相容：索引被改動（三角形 7：當前 0,6,24、凍結時 14,6,24；只容許角序旋轉與對回來源的複製點）
### swap 5k penetration-v2
$ __SWAPTRI=7 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-swap-5k.json
exit=1
[SWAPTRI] tri 7 corner0 14 -> 0
Error: 凍結集合與白模不相容：索引被改動（三角形 7：當前 0,6,24、凍結時 14,6,24；只容許角序旋轉與對回來源的複製點）
### badw 5k (f)
$ __BADW=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
Error: 權重不合法：頂點 100 權重總和 1.7403307557106018（應 1±1e-4）
### badw 5k penetration-v2
$ __BADW=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-badw-5k.json
exit=1
Error: 權重不合法：頂點 100 權重總和 1.7403307557106018（應 1±1e-4）
### negw 5k (f)
$ __NEGW=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=1
Error: 權重不合法：頂點 100 第 1 個權重 -0.2403307557106018 < 0 或非數
### negw 5k penetration-v2
$ __NEGW=1 node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-negw-5k.json
exit=1
Error: 權重不合法：頂點 100 第 1 個權重 -0.2403307557106018 < 0 或非數
### 對照：HEAD src 無突變 5k (f)
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=0
- 判定：綠（9 幀全過）
### 對照：HEAD src 無突變 5k penetration-v2
$ node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/before-5k.json --json=<n6>/own-head-5k.json
exit=0
- 18 項（9 幀×左右臂）全部 ≤ 現況
### NF2：HEAD 自己的輸出當 S2(i) baseline 5k
$ node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/own-head-5k.json
exit=1
Error: --baseline 的 realPlayer.js 雜湊 ecc4cfc175f6 ≠ 8720597 的 b1489d7878dc（現況必須在 8720597 上量）
### 合法 ROT 5k (f)
$ __ROT=1 node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/f-base-5k.json
exit=0
- 判定：綠（9 幀全過）
### N3 (f) baseline geoAnimator 雜湊竄改
$ node tools/real-skin-torso-drag.mjs --faces=5k --baseline=<n6>/bad-geo.json
exit=1
Error: --baseline 的輸入雜湊 geoAnimator.js 000000000000 ≠ 本次 250a1f1cb469，不能比較
### NF2 S2(i) baseline 缺 lib 雜湊
$ node tools/real-skin-penetration-v2.mjs --faces=5k --baseline=<n6>/bad-before-missing-lib.json
exit=1
Error: --baseline 的輸入雜湊 real-skin-lib.mjs undefined ≠ 本次 841432f22024，不能比較
```
