# 驗收凍結 — 單調治療探針卷 批 1（唯一批）

> 凍結時點：2026-08-26，落點 main@92e1b20。改動照 02 §2.1。
> 卷宗＝`docs/kickoffs/monotony-probe-kickoff.md`。

## M1 資料
- corporations.js 八隊 scoutRead 逐值：強豪二隊 0.85、中堅三隊 0.55、保底三隊 0.25
  （★值屬提案試玩可調；凍結的是「三檔梯度存在且強≥中≥弱」性質＋當前逐值★）。
- 檔頭「刻意不設」裁定註解更新為本卷拍板，留修訂紀錄（不得留兩份矛盾裁定）。

## M2 球探建檔語意（careerMatchSetup）
- corp 對手：無個別 scouting 紀錄時，scoutRead 參數仍成立——read＝表值、
  zones＝全生涯聚合（造含高中/大學 scouting 紀錄的存檔，斷言 zones 逐鍵＝各對手加總）。
- 聚合空（零紀錄新檔/治具）→ 沿 sim 樣本<6 防線自然不讀（直測 scoutBlockMul 對
  total<6 回 1；setup 層不得偽造樣本）。
- 高中/大學路徑行為不變：高中對手仍走個別 seen 閘（未交手＝不讀）；大學對手無欄照舊
  全不讀（既有測試零紅）。

## M3 賽前盯線句（fake DOM 真路徑）
- corp 對手＋聚合中某線佔比>0.35：對陣卡顯示盯線句且**點名具體線路**（直線/斜線/
  中路/吊球）。
- 聚合無任何線>0.35：盯線句不得出現（不嚇唬沒有慣性的玩家）。

## M4 賽後甩開句
- corp 場打完、本場（該對手 scouting 紀錄）落在賽前被盯線的佔比<0.15 且本場樣本≥6
  → 賽後路徑顯示甩開句；佔比未達或樣本不足 → 不顯示（兩態對照）。

## M5 層級隔離
- `git diff` 不含 `src/sim/**` 與 `corpSchedule.js`/`uniSchedule.js`/`schedule.js`；
  sim-hash `34772c06e02243fd` 不動。

## M6 全套
- `npm test` 全綠、只增不減。

## 改前紅
- 新測試在 92e1b20 worktree 上跑須紅；至少一條行為級：M2 的「corp setup 帶 scoutRead
  參數」在改前必紅（seen 恆 undefined ⇒ 參數恆 undefined）。
