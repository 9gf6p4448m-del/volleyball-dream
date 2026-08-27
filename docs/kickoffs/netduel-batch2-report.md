# 接球微回饋 批2 實作報告（2026-08-27）

驗收依據：`acceptance-netduel-batch2.md` NJ-1~NJ-6。結論：**全過**。

## 改了哪些檔

- `src/sim/game.js:920-926`——TOUCH 事件加 `perfect` 唯讀欄位（僅 `isReceiveLike`
  即 receive/dive 才帶這個鍵）。唯一新增行：
  `...(isReceiveLike ? { perfect: receivePerfectMul(rawT) !== 1 } : {}),`
  零數值邏輯改動，`receivePerfectMul` 本體、門檻 0.95 一字未動。
- `src/ui/receiveJuice.js`（新檔）——丙1/丙2 純判定層：
  - `HEAVY_SPIKE_POWER_MIN = 0.7`（沿用 matchLoop 既有重扣門檻，單一來源）
  - `isHeavySpikeDig(prevTouch, event)`：上一次觸球是對方重扣＋這一次是我方非
    扣球觸球（跨隊）＝true
  - `isDiveSaveTouch(event)`：`TOUCH && kind==='dive'`＝true（撲空無 TOUCH 事件，
    天然只獎成功，見 geoAnimator.js/matchView.js 既有設計）
- `src/app/matchLoop.js`：
  - `:76` 匯入 `isHeavySpikeDig`/`isDiveSaveTouch`
  - `:79-84`（約）新增三個【試玩必調】時長常數：`DIG_HIT_STOP_MS=90`、
    `DIVE_SAVE_SLOWMO_MS=300`、`PERFECT_GLOW_MS=260`
  - state init 加 `ballGlowUntil: 0`
  - frameEvents 迴圈頂端加 `const prevTouchForDig = s.lastTouch;`（在既有
    `s.lastTouch = e` 覆寫之前存快照）
  - 既有 if/else-if 鏈之前插入三段獨立 `if`（丙1 hit-stop、丙2 慢動作、丙3 發光
    時窗），全用 `Math.max` 避免蓋掉同拍已由其他分支（神救球等）給出的更大值
  - ballView.sync 呼叫加第 5 參數 `ballGlow`（依 `ballGlowUntil` 算好的 0..1 強度）
- `src/render/ballView.js`：mesh 材質加 `emissive`/`emissiveIntensity`；`sync()`
  加 `glow=0` 參數，逐幀寫 `emissiveIntensity = glow * 1.6`
- `src/ui/sfx.js`：新增 `perfectChime()`（雙泛音疊層音）；`onEvents` 的 TOUCH
  分支改讀 `e.perfect`（移除原本重複硬抄的 `power>=0.95`），疊在基底音效之上，
  並擴大涵蓋 dive（原本只有 `kind==='receive'` 才響）
- `tests/receive-juice.test.mjs`（新檔）——12 個測試，含 NJ-6 兩項突變的執行紀錄
  （檔頭）

## npm test 末尾統計

```
ℹ tests 2181
ℹ suites 0
ℹ pass 2181
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 47658.2008
```
基準 2169 綠 + 新增 12 個 = 2181，零紅。

## NJ-6 兩項突變（真的執行過，非紙上談兵）

**①perfect 抄死 0.95 字面**：
1. 暫改 `receivePerfectMul` 門檻 `0.95→0.80`（模擬「真相來源改了」）。
2. 暫改呼叫端 `perfect: receivePerfectMul(rawT) !== 1` → `perfect: rawT >= 0.95`
   （模擬「call site 脫離單一來源、抄死舊字面」）。
3. 重跑 `tests/receive-juice.test.mjs`：測試「perfect 欄位單一來源」在
   `timing=0.9` 斷言變紅——
   `AssertionError: timing=0.9：perfect 應為 true（receivePerfectMul 同一來源），實際 false`
4. 兩處改動皆已還原（`git diff` 確認 game.js 只剩單一欄位外露那行）。

**②丙1 拿掉重扣限定**：
1. 暫時註解掉 `receiveJuice.js` 的
   `if ((prevTouch.power ?? 1) < HEAVY_SPIKE_POWER_MIN) return false;`
2. 重跑測試：「丙1 isHeavySpikeDig：輕吊（power < 門檻）不觸發」變紅——
   `AssertionError: Expected values to be strictly equal: true !== false`
3. 已還原（`isHeavySpikeDig` 逐字恢復原樣）。

## git diff --stat

```
 src/app/matchLoop.js   | 38 +++++++++++++++++++++++++++++++++++++-
 src/render/ballView.js |  9 ++++++++-
 src/sim/game.js        |  4 ++++
 src/ui/sfx.js          | 26 ++++++++++++++++++++++++--
 4 files changed, 73 insertions(+), 4 deletions(-)
 （+ 新檔 src/ui/receiveJuice.js、tests/receive-juice.test.mjs，git status 顯示為 ??）
```

`src/sim/` 僅 `game.js` 一檔改動（`git diff --stat -- src/sim/` → `1 file changed,
4 insertions(+)`），逐行對應 NJ-4：4 行新增皆為註解＋單一欄位外露表達式，無任何
數值邏輯行變動。

## 逐條驗收

- NJ-1：過（見上方 npm test 統計）。
- NJ-2：過。`isHeavySpikeDig` 沿用既有 0.7 門檻，`matchLoop.js` 新增
  `if (isHeavySpikeDig(prevTouchForDig, e)) { s.hitStopUntil = Math.max(...); s.shake = Math.max(...); }`，
  每次觸球至多觸發一次（隨 TOUCH 事件驅動，一次觸球一個事件）。
- NJ-3：過。`isDiveSaveTouch` 只認 `TOUCH && kind==='dive'`，撲空天生無 TOUCH
  事件、不會誤播。
- NJ-4：過。`perfect` 欄位單一來源＝`receivePerfectMul(rawT)`，sim 既有測試
  （`mechanics.test.mjs` 的 `receivePerfectMul(0.95)===TUNING.PERFECT_RECV_ACC`、
  `determinism.test.mjs`/`game-determinism.test.mjs` 的決定論測試）全綠不受影響。
- NJ-5：過（見上方 diff）。
- NJ-6：過，見上方兩項突變紀錄。

## 疑義／未做部分

無。三件微回饋（丙1/丙2/丙3）均已按憲章落地在既有通道上，未新增任何獨立的
時間縮放或音效判定門檻；三個時長常數已標【試玩必調】，等待實測後調整。
