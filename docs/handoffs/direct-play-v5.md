# 直接操作：direct-v5（2026-09-25）

## 接手順序

先讀本檔，再看三份凍結驗收條件（各含檔尾修訂紀錄）：
- `docs/kickoffs/direct-v5-forward-absorb-acceptance.md`（A18，往前吸收）
- `docs/kickoffs/direct-v5-hold-release-acceptance.md`（A19，已退場）
- `docs/kickoffs/direct-v5-press-receive-acceptance.md`（A21，按下即出手＋點擊停留測試）
- `docs/kickoffs/direct-auto-face-acceptance.md`（A20，接球自動轉身；修訂紀錄記載定案為半自動）

前一版是 [direct-v4](direct-play-receive-platform-v4.md)（`91d7d93`）。

## 這一版改了什麼

1. **往前跑著墊球不再把球推進網**（模擬核心，升版為 `direct-v5`，v4 錄影會被拒絕）
   - 主動墊球觸球時，接觸面速度扣掉身體「實際」往網子方向（−z）的位移速度，也就是 `player.moveVz`，由 `directGame.js` 每個 substep 記錄。
   - 橫移、後退照舊傳到球上。
   - 扣球、被動觸球不吸收。
   - 往前移動中觸球：碰網 83% → 0%，舉球區 1% → 89%。
2. **觸控墊球維持「按下即出手」**（A21）
   - 曾試「按住預選、放開出手」（A19），真機試玩球都起不來：點擊停留時間變成延遲，停 6 tick 只剩 5/11 起球。已依使用者裁定退場。
   - 按下後左右滑選平台方向，按鈕上方顯示「◀ 偏左／正前／偏右 ▶」。
   - 點擊停留 0／3／6／9 tick 起球 11／11／11／10（/11），由 `--pass` 治具把關。
3. **接球自動轉身，固定半自動**（使用者試玩三種後選定；只改送進模擬的朝向指令）
   - 選墊球且球在場上時，朝向轉向舉球區 (0, 1.6)，相對正對球網最多 45°。
   - 已追到球底下的 33 種情境：不轉身救回 13，半自動救回 25（全自動 29，已退場）。
   - 半自動只有約 34% 的按鍵時機救得回來，不是保證接到。

## 審查紀錄

共三輪 fresh opus 對抗審查：
- 第 1 輪：A18 兩個 MEDIUM（邊界上用意圖速度會把球往後推、吸收範圍沒被測試釘住），已修。
- 第 2 輪：A18 兩條確認修好；A19 兩個 HIGH（方向標籤蓋掉時機圈、金色預演沒帶方向），已修。
- 第 3 輪：四條全部「真的修好」，無新的 CRITICAL／HIGH。另依建議修了兩處：自動轉身時的金色預演朝向，以及 lostpointercapture 只認按鈕本身。

## 驗證方式

與 [direct-v4](direct-play-receive-platform-v4.md) 相同：`npm test`、`npm run build`、`npm run preview`，再跑 `tools/direct-play-browser.mjs` 的預設、`--assist`、`--motion`、`--pass`。`--pass` 另外涵蓋 A19g 的原生觸控按住放開，以及 A20e 的三種轉身模式。

## 已知限制

- 斜前快跑接球約 35–43% 落在身後（z > 3），和吸收無關，尚未查。
- 搖桿或朝向區收到 pointercancel 時，會連帶取消按住中的墊球（沿用全域 reset，刻意未改）。
- 按住時的方向標籤在直式畫面會稍微蓋到動作選單。
- 自動轉身的目標固定在舉球區中心；接球方向練習的左右目標不影響轉身。
- 證據來自桌面 Chromium 模擬手機尺寸，不是實體手機；iOS WebKit 的 pointer 事件順序未驗證。
