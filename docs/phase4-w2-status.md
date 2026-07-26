# Phase 4 W2 結案快照 — 身高創角＋成長曲線＋儀式演出層

> 2026-07-26。工單＝Claude.ai 規劃會議生成之 W2 實作工單；憲法＝`phase4-decisions-RESOLVED.md`。
> 基準 `main@43dc171`（W1 結案 423 測綠）→ 本週結案 **439 測綠（+16，只增不減）**。
> 驗證：全套 node:test＋vite build＋治具三錨點 n=150＋**Playwright 對 preview 的 UI 實跑全鏈**
> （創角面談→志願登記→建檔；收束→畢業儀式→邀請→身高儀式演出→跨帶評語→入學→開幕；
> 第 2 屆決賽前 teach-jump 轉授版），全程 **0 console error/warning**。

## 1. 拍板執行紀錄（全數落地，無改動）

| 拍板 | 執行 | 落點 |
|------|------|------|
| 隊長交接＝阿哲 | 換血後無 captain→A1 授旗（`ensureCaptain`）；儀式鏈內大山交、阿哲接兩句 | `graduation.js`／`events.js graduationCeremonyLines` |
| canon ①保底轉授 | teach-jump／rematch-won/lost 帶 `elderId:'A3'`＋`altLines` 轉授版（阿哲開口、跳發照學、id/effect 不變）；`resolveEventsForRoster` 於 careerScreen 兩個 fireEvents 呼叫點接線 | `events.js`／`careerScreen.js` |
| 新生 trust 20→10 | `FRESHMAN_TRUST=10` 顯式寫入（創隊班底維持 20） | `lineup.js`／`careerStore.js` |
| A1 輸入 140–220 clamp | `clampHeightCm` 軟提示後夾限、垃圾輸入回 188 預設；UI 教練「先按 Ncm 記」 | `heightGrowth.js`／`careerScreen.js` |
| A2 映射表（區帶重疊） | 五帶並列雙建議照表；邊界 165/175/183/192 落上緣帶 | `heightAdvice.js ADVICE_BANDS` |
| A3 不偷看種子 | 建議只吃當下 cm；成長預留句恆在；屆間跨帶＝`bandShiftLines` 教練動態評語 | `heightAdvice.js` |
| A4 三段式話術 | 誠實判定→培育邏輯（縫隙 3 句式）→志願確認；志願回覆 primary／secondary／違背（「用球說服我」）三分支×五位置全覆蓋 | `heightAdvice.js` |
| B1 反比幅度帶 | ≤165＝5–12／(165,185)＝3–8／≥185＝1–4；第一次成長保底 ≥1cm、第 1→2 屆偏多（60%）；≥185 帶 total=1 時第二次可為 0（儀式走「身體停下來了」定格變體＝誠實敘事） | `heightGrowth.js growthBandOf/buildHeightPlan` |
| B2 timeline 設計 | 單一事實源＝`height.timeline`（公尺、公分精度）、`current`＝末項快取、隱藏欄位 `height.plan`（公分×3）創角瞬間由 career.seed 子種子預生成；advanceSeason 單次 RMW 揭曉＋push | `heightGrowth.js`／`careerStore.js` |
| B3 平衡 | 誠實映射不動（reach=height×1.31 沿用）；**主錨改 175 且無需調斜率即達 W8 帶**（§4）；heights 體檢結論見 §5 | `tools/balance-sim.mjs`（VD_HEIGHT 臂） |
| B4 儀式演出框架 | 底座＋首發消費者上線（§3）；範圍鎖定＝只此一消費者 | `ritualStage.js`／`heightRitual.js` |
| 志願欄位 | `save.player.aspiration`（提案原案，未微調）；一律 OH 出道（currentRole 恆 outside） | `careerState.js createCareerPlayer` |

## 2. 交付總表

| 區塊 | 內容 | 落點 |
|------|------|------|
| 成長曲線資料層 | 幅度帶／預生成／揭曉（冪等、舊檔缺鍵 no-op 容錯）；`createCareerPlayer(name, {heightCm, aspiration, seed})`（不帶 opts＝188 舊路徑相容） | `career/heightGrowth.js`（新）／`careerState.js` |
| 建議與話術層 | A2 映射＋A4 三段式＋跨帶評語，純函式可測 | `career/heightAdvice.js`（新） |
| 創角 UI | 名字＋身高輸入→教練面談（dialogPlay）→志願登記 overlay（★建議/☆次選徽章、全位置自由選、「再想想」中止不動舊檔）→建檔 | `careerScreen.js renderHome` |
| advanceSeason | 揭曉併入單次 RMW；回傳合約擴為 `{ok, graduates, freshmen, heightReveal}`（truthy 相容）；**屆間鏈改揭曉後重載 player 再訓練**（閉包舊物件直接 savePlayer 會蓋掉新身高——實作時抓到的陷阱） | `careerStore.js`／`careerScreen.js nextSeasonBtn` |
| 儀式演出框架 | `createRitualStage`（暗場聚光＋光池＋單人幾何球員獨立小場景，recruitPortrait 範式）＋`tween` rAF 補間 Promise；把手＝`setHeight/setSpot/setPose`（W3+ 接畢業/來投/結算用同一底座） | `render/ritualStage.js`（新） |
| 「你長高了」儀式 | 暗場→聚光亮起→身高尺（140–220 直尺＋金標記線）→數字滾動＋模型即時長高（root 縮放補間）＋攔網觸及/扣球點刻度同步爬升→公分差彈出→點擊離場；reduced-motion 定格、WebGL 失敗退化純數字不炸流程 | `ui/heightRitual.js`（新） |
| W1 遺留三項 | 隊長交接／canon 轉授／trust=10（§1） | 同上 |
| 治具 | `VD_HEIGHT` 錨點臂＋「決賽帶（真實連勝踏進決賽）」正式輸出＋B 隊換人樣本量測 | `tools/balance-sim.mjs` |

## 3. 演出框架介面說明（W3 接入畢業／來投所需）

```js
import { createRitualStage, tween } from '../render/ritualStage.js';
const stage = createRitualStage({ playerId, teamId, role, heightM, width, height });
// stage.el          → 塞進任何 overlay 的 DOM 節點（自帶 renderer/canvas）
// stage.setSpot(t)  → 聚光 0..1（暗場→亮起的節奏由消費者驅動）
// stage.setHeight(m)→ 即時改身高（root 縮放）——配 tween() 做「鏡頭前長給你看」
// stage.setPose(p)  → 換姿勢（recruitPortrait 的 ROLE_POSES 語彙）
// stage.dispose()   → 關閉即釋放 GL context（多次連開不撞 context 上限）
await tween(durMs, (t) => {...});  // rAF 補間 Promise；durMs<=0＝直接定格（reduced-motion）
```
消費者範式見 `ui/heightRitual.js`（演出序列＝async/await 串 tween；點擊離場前 doneArmed 防搶點）。
畢業儀式升級／來投開箱接入＝W3+ 逐個做（範圍鎖定拍板）。

## 4. 平衡治具三錨點數據（n=150；A2=AI 代打基準、W7 全關基準臂）

| 錨點 | group-1/2/3 | qf/sf/final | 決賽帶 | 奪冠 |
|------|------------|-------------|--------|------|
| **150** | 78%／57%／50% | 27%／30%／5% | **8%** | **0%** |
| **175（主錨）** | 91%／71%／64% | 50%／43%／17% | **23%** | **7%** |
| **195** | 87%／79%／67% | 58%／63%／18% | **37%** | **6%** |
| 188（舊基準參照 n=50） | 90%／76%／68% | 60%／54%／16% | 30% | — |

- **主校準錨點 175 達標 W8 帶（決賽帶 20%／奪冠 5-7%）→ 23%／7%——誠實映射（reach=height×1.31）
  下無需動斜率、無個別身高鉗制**。188 從「基準」變「明顯優勢」（決賽帶 30%）＝拍板要的真實。
- 150 邊界：可完賽、單場勝率不歸零不歸百（78%~5%）；奪冠 0/150＝矮個 AI 基準打不到頂＝
  設計功能非缺陷（L 之路 W3 兜底）；真人操作＋志願 L 的路在 W3 開。
- 195 邊界：強＝誠實獎勵（決賽帶 37%）、奪冠不爆表（6%＝與 175 同帶——決賽對天鷹
  （heights 均值 193）高度優勢被拉平，「強在路上、不送頂點」）。
- 單調性成立：決賽帶 8% → 23% → 37%。

## 5. heights 分佈體檢（檢查項結論：**不動，如實回報**）

七隊六槽身高均值：青嵐 184.0／白浪 185.3／北原 186.0／曜石 189.7／鐵霧 189.8／天鷹 193.0／
黑松 194.2（MB 最高 201）。對照台灣高中現實（主力 170–185、MB 偏高）**整體偏高約 5cm、
弱隊偏高最明顯**——確實帶著「圍著 188 建成」的痕跡；但主錨 175 在現行分佈下已直接落 W8 帶，
且七隊設定是「全國強豪」戲劇框架（黑松 201 牆＝招牌敘事）。裁定：**本週不動**（動了反而要
重調斜率、破壞剛驗證的錨點）；若 Sawmah 試玩體感「對面全是巨人」失真，W3 再議降 3–5cm 檔。
我方 STARTER_DEFS（1.72–1.96）同框架、同不動。

## 6. 對手換人樣本量測（拍板：不調只量測，數據留 W4 多局制再判）

體力臂（VD_STAMINA=1＋身高175，n=150＝900 場）：**B 隊換人 0 人次／有換人場數 0（0%）**
——W1 債務 3 的正式量測確認：對手 costMul 0.6＋heavyExempt 慢耗下，單局 25 分制對手
幾乎不跌破 SUB_BELOW=25% 閾值（A 隊終場均值 0.69、單場最低 0.11＝我方會累但對手不會）。
拍板照辦：**閾值不調**；W4 多局制（體力跨局延續）下自然變多，屆時重測再判。
順帶：體力臂勝率曲線與基準臂幾乎重合（決賽帶 21%／奪冠 5%）＝體力系統對錨點校準零干擾。

## 7. 測試（423 → 439，+16）

新增：`height-growth.test.mjs`（7：clamp 邊界／140-175-220 映射與單調／幅度帶全範圍×多種子
不變式／曲線決定論／揭曉鏈冪等與容錯／store 揭曉整合含 aspiration／三屆快進兩次 timeline
deepEqual）、`height-advice.test.mjs`（5：五帶與邊界／並列雙建議／三段式全帶＋極端輸入／
志願三分支×五位置／跨帶評語）、`canon-guard.test.mjs`（4：守衛資料形狀／兩分支＋effect 不變
＋跳發兩路皆習得／隊長交接與旗標不重複／交接台詞）。
既有更新 1 處：`graduation.test.mjs` 新生 trust 斷言 20→10（拍板規格變更）＋班底仍 20 加驗。

## 8. 驗收清單自查（工單八條）

1. 160／190 建議不同＋話術正確：✅ Playwright 實跑 160（L 建議五句全對）＋測試矩陣覆蓋
   全帶；190 場上攔網體感＝blockReach 誠實推導（190 vs 160 觸及差 +39cm 含跳躍），
   體感留 Sawmah 試玩複驗。
2. 100／300 輸入：✅ 實跑 300→軟提示「先按 220cm 記」＋clamp、不 crash；教練誠實講 220。
3. 志願違背建議：✅ 實跑 160 選 MB→「行，用球說服我——先讓我看到你的攔網時機」；
   存檔 `player.aspiration='middle'` 可見。
4. 過一屆儀式完整演出：✅ 實跑 163→168——暗場聚光／身高尺標記爬升／幾何模型鏡頭前
   長高／攔網觸及 2.72→2.79m・扣球點 2.83→2.89m 刻度同步／+5cm 彈出；跨帶（≤165→165-175）教練
   評語「舉球員那條路，現在的你也搆得到了」如期出現。
5. 同 seed 重開快進三屆兩次：✅ `height-growth.test.mjs` timeline 逐值 deepEqual。
6. 轉授版＋阿哲隊長開場：✅ 實跑第 2 屆決賽前 teach-jump＝阿哲轉授兩句、大山不開口、
   jumpServe=1 入檔；開場訓話 speaker=阿哲；captain 旗標 A1 入檔。
7. `npm test`＝**439 pass / 0 fail**；vite build 綠；治具報告見 §4/§6。
8. commit＋deploy：✅ 本快照隨結案 commit 入庫；`npm run deploy:pages` 已執行（gh-pages 上線，可直接真機試玩）。

## 9. 債務與 W3 依賴回報

1. **儀式演出框架只接了一個消費者**：畢業儀式仍為對話卡形式——W1 債務 7 的「落差感」
   試玩題如今更明顯（新儀式在旁邊對照），W3 接入畢業儀式優先度建議提高。
2. **治具跨屆臂（VD_SEASONS>1）不吃身高揭曉**：治具的 advanceSeason 走純函式路徑、
   不經 store RMW，玩家身高全程停在創角值。單屆錨點校準不受影響；W4 多局制若要跨屆
   平衡結論，需把揭曉鏈鏡像進治具。
3. **150 錨點奪冠 0%**：AI 代打基準下矮個打不到頂。L 玩法（W3 半場設計討論）是這條路
   的兜底，實作前不得自行發揮（縫隙 2 原文）。
4. **heights 分佈偏高 ~5cm**（§5）：本週裁定不動；試玩若失真，W3 降檔重校。
5. **aspiration 只落欄位**：轉位事件（志願優先觸發）＝W3 縫隙 3 輸入。
6. **第 3 屆手寫新生＋阿岩專屬離別**＝W3（拍板排程）；落選案素材在 W1 快照 §4。
