# 教學局分步關卡卷 — 封卷狀態（2026-08-13）

> 卷宗＝`docs/kickoffs/tutorial-drill-stage-kickoff.md`（Sawmah 三題全依建議）。
> 本檔＝該卷的權威結案快照。**已上線**：`main@3bc83c8`／`gh-pages 634e6dc`（18:00）／
> `npm test` **1448 綠**／`sim-hash` **2f60f04312b666db 逐值＝基準**（本卷零行為外溢）。

## 一、驗收逐條結果（動手前訂定、全程未動）

| 條 | 標準 | 實測 | 判定 |
|---|---|---|---|
| A1 | 每一步的槽位與發球方逐值等於場景表，零例外 | 980 次採樣，槽位不符 0／發球方不符 0 | ✅ |
| A2 | `tut-block` 第一球對面進攻 ≥90% | **99.9%**（692/693） | ✅ |
| A3 | `tut-handle` 第一球舉得到玩家 ≥80% | **92.6%**（50/54） | ✅ |
| A4 | 重試不吃進度（比分／步數／結算不受重試次數影響） | 純函式測試三條＋反向對照 | ✅ |
| A5 | `ROTATION_FAULT`／`POSITIONAL_FAULT` 恆為 0 | 0 | ✅ |
| A6 | sim-hash 逐值不變、非教學局零擾動 | hash 不變＋「非教學局整段短路」反向測試 | ✅ |

★ **A5 沒有鑑別力，據實記載** ★ 修前修後都是 0——它守的是「本卷不要引入違序」，
不證明修好了什麼。A1–A3 有鑑別力（worktree 簽出 `b171cb8` 跑同一支探針：
A1 槽位不符 313/434、A2 63.1%、A3 **20.0%**，三條全紅）。

## 二、交付內容

| 批 | commit | 內容 |
|---|---|---|
| 1 | `39f1e15` | 分步關卡地基：`restageRotation`（合法重排）＋六步場景表＋無限重試＋提示三級 |
| 2 | `04ca39f` | 攔網地面光圈（只做攔網一步——其餘五步查證後判定不該做） |
| 3 | `256b31a` | 圈在最後一步收起來（落差變成教學的一部分） |
| 4 | `86bae40` | 接發的圈拿掉＋攔網圈改指過網點 |
| 5 | `2eca8f1` | 攔網圈改站直線／斜線中點（post-spike snap 移除） |
| 6 | `f73e7d1` | 開放 `blockAimMidX` 供探針量測產品本身 |
| 7 | `3bc83c8` | 攔網判準改「起跳攔網」 |

量測治具（留在 repo，可重跑）：
`tools/tutorial-stage-probe.mjs`（A1/A2/A3/A5）、`tools/coach-marker-block-probe.mjs`、
`tools/coach-marker-reachability-probe.mjs`、`tools/coach-marker-crossmid-probe.mjs`。

## 三、★ 三個負面／中性結果（不得被後人誤讀為成功）★

> **每個數字的出處都標在條目末**（read-back 指出初版漏標，接手者無從重跑）。
> 三支 `coach-marker-*` 治具共用同一組場景與口徑（150 seeds × 6 次重擺＝897 次真實扣球），
> 數字彼此可比；`tutorial-stage-probe.mjs` 是另一組口徑（A1/A2/A3/A5 專用），不可混用。

1. **攔網圈改準了，但玩家沒有更常攔到球**：誤差 p50 0.984m→**0.573m（−42%）**，
   但落在攔網可及半寬 0.5m 內只從 37.0%→**38.7%（+1.7pp）**、個人攔網率
   7.0%→**7.3%**（N≈900、標準誤 0.85pp ⇒ 統計上分不出來）。
   **中間指標改善 ≠ 結果改善**。
   ▸ 出處：修前基準 `node tools/coach-marker-block-probe.mjs 150 6`；
   修後 `node tools/coach-marker-crossmid-probe.mjs 150 6`（後者 **import 產品本身的
   `blockAimMidX`**（`src/app/matchLoop.js:790`），不自抄公式——這是它與前者的關鍵差別）。
2. **「球一出手 snap 到過網點」被實測否決**：扣球到過網中位數只有 **0.133 秒**
   （p10 0.1 秒），角色速 4.288 m/s（`src/sim/player.js:146-148` 的 `moveSpeed`，
   本局全樣本恆定）只跑得了 0.57m 而要修正近 1m ⇒
   扣掉 200ms 反應只有 **8.5%** 跑得完、300ms 剩 **2.9%**（不扣反應是 60%）。
   ▸ 出處：`node tools/coach-marker-reachability-probe.mjs 150 6`。
3. **位置類線索已到天花板**：`blockSetterTendency`／`setterLeanOf`／`blockCommitRead`
   三支查過皆不適用（解的是「二傳配給誰打」不是「他要打哪條線」）；實測 `hitPoint`
   更差（p50 0.702m）且要多等 1.48 秒。**0.57m 是「攻擊手被認出那一刻」這個
   提前量下的極限**——要再準只能等球出手，而那條路已被第 2 點封死。
   ▸ 出處：`node tools/coach-marker-crossmid-probe.mjs 150 6`（第二部分）。

### ★ 對照臂的能力假設（引用它的數字前必讀）★

「circle」與「oracle」兩支對照臂都是 **PID 控制器**：**零反應時間、全速直線移動、
完全知道目標點**。它們量的是「位置資訊的上限」，**不是人類玩家拿得到的成績**——
第 2 點的 8.5% 才是把人的反應時間算進去之後的數字。

| 對照臂 | 個人攔網率 | 出處 |
|---|---|---|
| circle（舊圈＝攻擊手 x） | 7.0% | `coach-marker-block-probe.mjs` |
| circle_v2（現行＝中點） | 7.3% | `coach-marker-crossmid-probe.mjs` |
| oracle（知道真實過網 x） | 18.1% ／ 21.4% | 前者 `block-probe`、後者 `crossmid-probe` |

★ 兩個 oracle 數字**不可直接相比** ★ 新版 oracle 在扣球前也走 `blockAimMidX` 定位，
控制條件與舊版不同。第四節說的「天花板約 18%」取的是**較保守的那個**。

## 四、設計債與未涵蓋

- **攔網個人成功率的天花板約 18%**（oracle 對照臂）——剩餘難度來自起跳時機窗、
  手高閘、屬性擲骰的複合機率，**不是位置問題**。教學局已改判「起跳」繞開它；
  正式比賽的攔網難度**未動**，要不要調是獨立的難度題。
- **`ui/scoreboard.js` 的 `hintFor()` 未被 classic 詞彙守衛涵蓋**（樣板字串，
  非資料，掃不到）。它自己註記「classic 舊版操作提示」，動它時要自行確認模式分支。
- `tut-block` 的判準走 `obs.blockJumps`（`actor.blockStartTick` 上升緣）而非事件流：
  **因為 sim-hash 把 `ev` 也雜湊**（`tools/sim-hash-probe.mjs:91`），加事件＝基準被
  推移、要拍板。將來若有「起跳攔網」事件的獨立需求，記得那是一次基準重立。

## 五、下一步

真人試玩批 5–7（攔網判準改起跳、圈改中點、最後一步收圈）——**這三批尚未經真人驗證**。
