# 債清批驗收凍結（2026-08-26）

範圍＝三筆不需等試玩回饋的既有掛帳，一批清完。無新玩法、零 sim 改動。

## M1 假 DOM 替身收斂（探針卷掛帳）

- 分母（凍結時 grep 實數）：`replaceChildren() { this.children = []; }` 壞版共 **9 檔**——
  admission-wiring / camp-reminder / chapter-wiring / corp-entry-wiring / how-to-play /
  practice-wiring / recruit-alt-path-wiring / replay-vault / tutorial-match。
  另 4 檔（monotony-probe / team-kit-phase2 / uni-finale-batch2 / uni-season-wiring）已是帶參數好版。
- 驗收：修後 `grep -r "replaceChildren() { this.children = \[\]; }" tests/` **0 hits**；
  9 檔一律換成帶參數版（同 uni-season-wiring 實作）。
- 不整併成單一 helper 的理由（記錄）：13 份替身各有漂移（每檔額外方法不同），整併＝
  重構 13 個凍結測試檔的結構，風險大於收益；本批只修「丟參數」這個壞行為。
- 誠實聲明：探針卷已證實此壞行為在真實呼叫（`replaceChildren(card)`）下丟內容；
  其餘 9 檔現無帶參數呼叫，本修是**預防性對齊**，不宣稱修好任何現行紅燈。

## M2 ROLE_ORDER 收斂（uni-year2 卷起掛帳）

- 分母：字面陣列 `['setter','outside','middle','opposite','outside','middle']` 在 src/ 共 **2 處**
  （careerState.js:343、uniTeam.js:26）；naming.test.mjs:18 鏡射屬刻意凍結守衛、**保留不動斷言**。
- 驗收：careerState `export` ROLE_ORDER；uniTeam `UNI_ROLE_ORDER` 改為 re-export 同一參照
  （uniTeam 已 import careerState，無新循環）；修後該字面陣列在 src/ **只剩 1 處**；
  naming.test 斷言原文不動（僅註解可更新「已 export 但鏡射刻意保留」）。

## M3 stands 接線（配色卷 B4 範圍外掛帳）

- 現況：rivalArc.js:378 `camera:'stands'` 無 cameraOpts 通道 → 止步旁觀的天鷹剪影
  （teamId 'B'）恆穿預設紅，不穿 RIVAL_KIT。
- 驗收（新測試檔，兩條皆須**改前紅**）：
  1. `rivalSpectatorEvents` 回傳事件帶 `cameraOpts.opponentKit`＝天鷹 kit（kitFor(opponentById(RIVAL_TEAM_ID))）
  2. `defaultSubjects('stands', { opponentKit })` 的 B 隊 subjects 經 `subjectTeamKit` 取得該 kit；
     A 隊（匿名決賽對手）不吃 opponentKit
- stands 現僅高中章觸發（RIVAL_ACT_MATCH 限 seasonIndex 1–3，kitA 恆 null），
  A 隊剪影維持預設＝正確；於 beatStage 註解點名。

## M4 全套與 sim 不動

- `npm test` 全綠（基準 1781＋本批新增）
- `tools/sim-hash-probe.mjs` 與 `tools/sim-hash-baseline.json` 一致（本批零 sim/ 檔改動）

## M5 範圍檢查

- `git diff --stat` 逐檔對應 M1–M3；無範圍外行。

---
## 結案紀錄（2026-08-26 同日）

- M1：9 檔壞版替身全換帶參數版，grep 壞版 pattern＝0 hits。覆審證實 9 檔被測模組
  均無帶參數 replaceChildren 呼叫（真正呼叫者只在 careerScreen.js:740,1212,1222,1396
  與 replayVault.js:151-167，均不在此 9 檔的 import 圖內）＝預防性對齊成立、零語意反轉。
- M2：單一事實來源落 lineup.SLOT_ROLES（凍結時分母漏數 lineup.js:29，實際 3 處收斂成 1，
  比凍結文更深、不降難度）；import 圖 lineup→careerState→uniTeam→corpTeam 嚴格線性無循環、
  無 TDZ。naming.test 鏡射保留、僅更新註解。
- M3：rivalArc cameraOpts.opponentKit＋beatStage stands B 隊吃 kit。新測 3 條改前紅
  （worktree@e04637c 全紅在行為斷言）修後綠。kit-batch3 凍結測試依本文 M3 改寫
  （「凍結測試被新批行為改變」慣例第四例），trio 斷言逐字未動。
- M4：npm test 1784 全綠；sim-hash 合計 34772c06e02243fd＝基準。
- M5：git diff --stat 16 檔＋新測試檔 1 個，逐檔對應 M1–M3，無範圍外行。
- fresh 對抗覆審（sonnet code-reviewer，冷讀 diff）：APPROVE，0 findings，
  五項必查逐項附路徑證據。
