# 網口對決＋接球微回饋卷（2026-08-27 開卷）

開卷背景:使用者試玩國外聯賽時提出「扣球與攔網方出現手部特寫動畫視窗」與「接球更多動畫」
兩個方向;主對話探勘表現層後提三案,使用者拍板「甲丙都要」。目標=「做大作遊戲,要好玩」。
承 foreign-league 卷(基準 HEAD=0e59d91、`npm test` 2160 綠)。

## 拍板紀錄(2026-08-27,四題+一題委裁)

1. **甲播放方**(委裁,使用者指示「要好玩、大作感」):**我方全版、對面短版**——
   我方 tool 得分/蓋死對面播 SIG_FULL 全版;被對面蓋死播 SHORT_BEAT 短版
   (看見自己怎麼輸的=可讀性+戲劇性,但不逗留、不放大挫折)。
2. **甲鏡距**:中距半身構圖(推到網口上緣、兩人半身對峙入鏡);幾何積木人在此距離
   成立,試玩嫌不夠近再逼近。**不做**手部大特寫(露餡風險)。
3. **丙3 判定來源**:sim 接球 TOUCH 事件補 `perfect` 唯讀欄位(外露既有 t≥0.95
   判定,零行為改動;顯示真值不近似)。
4. **丙2 改案**:魚躍三段姿既已存在(geoAnimator diveReach→diveSprawl→divePush),
   改成「魚躍成功救起後接一段短慢動作」(重用重扣定格後 delta×0.35 同路)。

## 範圍憲章

- **sim 行為零改動**:唯一 sim diff=丙3 的 TOUCH 事件加 `perfect` 欄位(純資料外露,
  不碰任何數值邏輯);其餘全在 render/ui/matchLoop 表現層。
- 甲=第五道簽名演出(既有 OH/MB/OPP/line 範式:純函式判定+matchLoop 狀態機+
  cameraRig sig 構圖),**不走 replayDirector**(它只服務結算典藏牆)。
- 甲觸發判定=表現層膠水:BLOCK_TOUCH(攔網方)+ 後續 DEAD_BALL.reason 拼接——
  reason='OUT' 且最後觸球=攔網方→打手出界(攻方得分);reason='BALL_IN' 落攻方
  半場→攔網蓋死(守方得分)。沿用「主角視角條款」:武裝於 BLOCK_TOUCH,起鏡只認
  SCORE,TOUCH/SERVE 解除。
- 頻率經濟照舊:入 seenSignature「敘事第一次」計數(第一次全版、之後短版),與既有
  四道演出共用仲裁(同拍多道武裝時的優先序沿既有機制,不另發明)。
- 丙1 hit-stop:重用 matchLoop 既有 delta=0 定格機制,觸發=重扣被救起瞬間
  (重扣判定沿既有「重扣定格」同門檻,零新數字);時長為【試玩必調】常數。
- 部署策略(書面裁定,承 foreign 卷教訓 3):**兩批全落地+覆審過才部署**,
  不單獨部署中間態。

## 批次

- 批 1(甲):網口對決簽名演出。凍結檔 `acceptance-netduel-batch1.md`。
- 批 2(丙1/2/3):接球微回饋三件。凍結檔 `acceptance-netduel-batch2.md`。

## 結案回填(2026-08-27)

- 批1=f1b3e2e(2169 綠)、批2=5157dec(2181 綠;含主對話覆核修正:重扣門檻 0.7 收斂
  到 receiveJuice.HEAVY_SPIKE_POWER_MIN 單一來源,消滅 matchLoop 行內第二份)。
- 對抗覆審(fresh code-reviewer,冷讀 0e59d91..HEAD):零 CRITICAL/HIGH、1 MEDIUM
  (hitStop/slowUntil 寫入者 Math.max 不對稱,掉幀補跑批次可反向蓋短)→ 6146578 修畢,
  修後 2181 綠。
- 驗收對照:凍結點 56c848c 起兩份 acceptance 檔零改動(git diff 實測);ND-1~6、
  NJ-1~6 逐條證據見 netduel-batch{1,2}-report.md 與測試檔頭突變紀錄。

## 批3 結案回填(2026-08-27,試玩回饋開批)

- 試玩回饋「得分後現場鏡頭不明所以」→ 批3 改成即時 highlight 重播(7b50aa5):
  網口對決得分+關鍵分重扣,自動用既有 tape player 慢動作重播,運鏡重用 replayDirector
  電影腳本(使用者兩次追記:精彩回顧風格運鏡、但不帶回憶感濾鏡),字卡標明得分方式,
  可跳過。批1 的 netduel 現場鏡頭演出廢止(3 條測試搬家至 highlight-replay.test.mjs
  且更嚴,oh/mb/opp/line 零改動)。
- 覆審一輪 1 HIGH(局末重播被結算幕布同幀蓋住,近局點必現)→ settleIfOver 頂部
  讓位修復(3b6e6d9),prevPhase 邊緣偵測保證幕布延後不弄丟;二輪覆審親跑突變
  (2 紅/還原 2206 綠)裁定「真的修好」。
- 凍結檔=acceptance-netduel-batch3.md(HR-1~8+兩條使用者追記);測試 2181→2206 綠。

## 掛帳

- 甲的鏡距/時長、丙1 hit-stop 時長=提案值,試玩即改。
- 手部高模/2D cut-in 風格(方案乙)明確不做,除非未來美術方向轉向。
