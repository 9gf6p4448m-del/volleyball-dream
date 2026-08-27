# 網口對決簽名演出 批1 實作回報（2026-08-27）

驗收依據：`acceptance-netduel-batch1.md`（ND-1~ND-6）。結論：**全數通過**。

## 改了哪些檔

- `src/ui/signatureBeats.js`
  - `SIG_FULL_MS` 新增 `netduel: 2600`（:14，提案值，掛帳試玩即改）
  - `planSignatureBeat` 新增可選參數 `mine`（預設 `true`，既有四道行為不變）：
    `mine=false` 恆短版、不受 seen/keyPoint 放大（:91-102）
  - 新增 `netDuelQualify(pending, e)`：DEAD_BALL 定性 tool/stuff/解除（:109-125）
  - 新增 `netDuelFire(pending, e)`：只認 SCORE、team 須等於 qualify 定出的 winner（:127-134）
  - import `otherTeam`, `landedCourtTeam`（讀取，`src/sim/rotation.js` 既有匯出函式，
    sim 本體零改動）
- `src/app/matchLoop.js`
  - import 新增 `netDuelQualify, netDuelFire`（:66-68）
  - state 新增 `lastSpikerId: null`（:412-414，任一隊扣球者，供構圖找雙方）
  - `fireSignatureBeat`：新增 `mine` 計算與傳遞、`markSeen` 改為 `if (mine)`、
    `sigBeat` 帶出 `spikerId`（:449-479）
  - TOUCH-spike 追蹤：無條件記 `s.lastSpikerId`，對面才另記 `s.lastOppSpikerId`
    （:1811-1815，行為對既有 `lastOppSpikerId` 用途零影響）
  - BLOCK_TOUCH 分支：MB 武裝之後加 `netduel` 武裝，`!s.pendingSig` 守門避免蓋過
    更具體的演出（:1958-1969，仲裁風格同既有「line」武裝）
  - DEAD_BALL 分支開頭：`pendingSig.kind==='netduel'` 時呼叫 `netDuelQualify`
    （:1970-1975）
  - SCORE 分支：`pendingSig.kind==='netduel'` 時改用 `netDuelFire`，否則沿用
    `signatureFire`（:2109-2117）
- `src/render/cameraRig.js`
  - `sigBeat` 型別註解補上 `line`/`netduel`/`spikerId`（:61）
  - 新增 `sigBeat.kind === 'netduel'` 構圖：機位取攔網方與扣球方中點側邊、
    齊網頂高（`COURT.NET_HEIGHT ± 0.35`），視線橫跨網面，網必入鏡（:183-193）
- `tests/signature-beats.test.mjs`：新增 9 個測試（武裝形狀、TOUCH/SERVE 解除、
  qualify 的 tool/stuff/解除三態、fire、`mine` 全短版兩態、`sigKey`），檔頭記錄
  ND-6 突變紀錄（:88-93）

## 驗證

`npm test` 末尾：
```
ℹ tests 2169
ℹ pass 2169
ℹ fail 0
```
（開工前基準 2160 綠；本批淨增 9 個測試，全綠、零紅、零跳過）

## ND-6 突變實測（真的做過）

1. 拿掉 `trackSignature` 的 `if (e.type === 'TOUCH') return null;`：
   單跑 `tests/signature-beats.test.mjs` 後
   `網口對決：武裝後球被救起（TOUCH）或新發球（SERVE）＝解除...` 由綠轉紅
   （斷言 `對手救起＝解除` 失敗：`actual { kind:'netduel', ... }` vs `expected null`），
   另有既有的「line」武裝測試連帶紅（同一條共用機制，符合 kickoff 教訓 2 允許連帶紅）。
   還原後重跑轉綠。
2. 把 `netDuelQualify` 改成不論 `reason` 一律回傳 `{ ...pending, outcome:'tool',
   winner: otherTeam(pending.blockerTeam) }`：單跑同檔後
   `netDuelQualify：其餘 reason／落點不在攻方半場的 BALL_IN 一律解除...` 與
   `netDuelQualify：reason=BALL_IN 且落點在攻方半場＝攔網蓋死...` 兩條由綠轉紅
   （`FOUR_HITS` 等非法 reason 也冒充 `tool`；`stuff` 案例被錯判成 `tool`）。
   還原後重跑轉綠。

兩次都只改對應那一行，其餘程式碼未動；改前改後皆已實跑確認紅/綠。

## `git diff --stat`

```
 src/app/matchLoop.js           | 43 +++++++++++++++++---
 src/render/cameraRig.js        | 13 +++++-
 src/ui/signatureBeats.js       | 46 ++++++++++++++++++++--
 tests/signature-beats.test.mjs | 89 +++++++++++++++++++++++++++++++++++++++++-
 4 files changed, 179 insertions(+), 12 deletions(-)
```
`src/sim/` 零檔案（ND-5 通過）。

## 有疑義/做不到的條目（明說）

- ND-4 的鏡頭構圖（`cameraRig.js` 的 `netduel` 分支）**沒有自動化測試**——與既有
  `oh`/`mb`/`opp`/`line` 四道演出的鏡頭構圖同樣缺測試（kickoff 指定的測試範式
  `signature-beats.test.mjs`/`beat-wiring.test.mjs` 都是純資料斷言，不含 three.js
  幾何），本批沿用同一慣例、未新增。鏡位數值（`+3.2`／`COURT.NET_HEIGHT ± 0.35`）
  是本批提案值，kickoff 已明文「鏡距/時長試玩即改」的掛帳範圍，尚未經真人試玩校準。
- MB「早到的人」與網口對決在「受控 MB 乾淨攔死」情境下互斥（`!s.pendingSig` 守門，
  MB 優先）——這是我依照 kickoff「不得同時播兩道」與既有「line」武裝的仲裁風格做的
  設計判斷，凍結檔沒有逐字寫這一條優先序，若試玩後覺得應該反過來（網口對決優先於
  MB），屬可調整項，非驗收條件內容。
- 未 commit、未 push、未 deploy，依指示停在「改完檔案與測試」這一步。
