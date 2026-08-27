# 網口對決簽名演出 批1 驗收(動手前凍結,2026-08-27)

拍板見 net-duel-juice-kickoff.md。基準:HEAD=0e59d91、`npm test` 2160 綠(以開工前
實跑數為準,若不同以實跑回填並註記)。範圍=signatureBeats.js(純函式判定)+
matchLoop.js(arm/track/fire 掛接)+cameraRig.js(net 構圖)+新測試;sim 零 diff。

- ND-1 `npm test` 全綠(既有全部零紅)。
- ND-2 純函式判定(signatureBeats.js 新增,零 DOM/three):
  a. 武裝=BLOCK_TOUCH 事件(記攔網方 team/playerId);
  b. 起鏡只認 SCORE,且須先由 DEAD_BALL 定性:reason='OUT' 且 lastTouch=攔網方
     →tool(攻方得分演出);reason='BALL_IN' 且落點在攻方半場→stuff(攔網方得分
     演出);其餘 DEAD_BALL reason 一律解除不播;
  c. 武裝後出現新 TOUCH(球被救起)或 SERVE→解除(主角視角條款同款);
  d. 我方得分(tool 我方攻/stuff 我方攔)→全版;對面 stuff 蓋死我方→短版;
     對面 tool 得分(打我方攔網手出界)→短版。全短版判定為純函式回傳,不在
     matchLoop 內散寫。
- ND-3 頻率經濟:入 save.career.presentation.seenSignature(新 key),第一次全版、
  之後短版;與既有四道演出同拍衝突時走既有仲裁路徑(不得同時播兩道)。
- ND-4 鏡頭:cameraRig 新增 net 構圖=中距半身(網口上緣、攔網與扣球者半身入鏡,
  網保持在畫面內——rig 鐵則「網在哪不變」不得違反);時長吃 SIG_FULL_MS 新 key
  與 SHORT_BEAT_MS,死球窗到期或 SERVE 即收(既有機制,零新收尾邏輯)。
- ND-5 sim 零 diff:`git diff --stat` 中 src/sim/ 零檔案(本批不含丙3 欄位)。
- ND-6 突變實測 ≥2:①拿掉「TOUCH 解除」→球被救起仍起鏡,行為斷言必紅;
  ②拿掉 DEAD_BALL 定性(reason 不分)→非 tool/stuff 的普通得分也播,必紅。
  各 ≥1 紅可歸因於該突變(前置閘連帶紅可,按 foreign 卷教訓 2),紀錄寫測試檔頭
  (真的做過才寫)。
