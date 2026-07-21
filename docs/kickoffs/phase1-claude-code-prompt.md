# Claude Code 任務指令 — 排球夢 Phase 1 實作

> 貼給 Claude Code 用。完整決策依據見 `docs/kickoffs/phase1-kickoff-RESOLVED.md`，
> 本檔是濃縮的開工指令與硬約束。有衝突以 RESOLVED 檔為準。

---

## 你的任務

實作排球夢 Phase 1 垂直切片：一場能從發球打到 25 分（含 deuce）打完的 6v6 排球，
玩家控主攻手一人、五動作全套、混合視角、11 人回合 AI、視線欺敵原型。

**現在先只做「地基級骨架」**——D1 資料層、D2 比賽狀態機、D3 回合 AI、D4 Intent 管線。
這四項是**同一個決定論骨架**，當一組做，不要分開設計。骨架綠燈（測試過）後才疊 H 區手感。

---

## 不可違反的硬約束

1. **`src/sim/` 零 three.js、零 DOM 依賴**。模擬核心是純 JS。render 層讀 sim 狀態、絕不寫回。
2. **固定步長 60Hz、決定論**。所有模擬邏輯（含 AI 決策）是 `(state, tick) → nextState` 的純函式。
   禁止在 sim 內用 `Math.random()` 無種子、`Date.now()`、`performance.now()` 或任何幀率依賴。
   需要隨機 → 用可種子的 PRNG，種子進 state。
3. **Intent 是模擬核心唯一輸入**。玩家、AI、未來網路封包都產生同型 `Intent`，
   sim 不知道 Intent 來源。這條做錯，Phase 5 多人重寫。
4. **不破壞現有分層**：`sim / render / input / ui / main.js`。main.js 維持 rAF 不鎖幀 + 固定步長累積器。

---

## 骨架四項（依此順序，D3 可與其他平行起跑）

### D1 資料層 v1（`src/sim/`）
- `Player` 結構照 RESOLVED §D1：8 屬性（jump/power/reaction/stamina/speed/control/**serve**/**block**）、
  `height:{current,timeline}`、`naturalRole`+`currentRole` 分離、`trust:{fromSetter:50}` 先進結構不驅動邏輯。
- 身高影響（攔網高度/扣球點/防守範圍）**即時從 `height.current` 推導**，不存衍生欄位。
- `serializePlayer` / `deserializePlayer` 純函式 + **round-trip 測試**（序列化再還原須完全相等）。
- Phase 1 純記憶體，不做存檔 UI。

### D2 比賽狀態機（`src/sim/`）
- rally 生命週期狀態機，**只吐比賽事件**（得分方、輪轉、死球原因、觸球計數），球員怎麼動全歸 D3。
- 規則做齊四條：得分 / 觸球上限 3 / 輪轉換發 / 後排攻擊限制。
- 站位違例等細則標 `// TODO Phase 2`。
- 收尾 **deuce 完整**：25 分且領先 2 分，未達則續打。
- 決定論測試：同輸入同 tick 序 → 同一局結果。

### D3 回合 AI 狀態機（最難，最早開工）
- **雙層**：個體行為狀態機（待命→判來球→移動到位→執行→回位）＋ 球隊協調層（call 球/接發陣型/攔防佈陣/舉球分配）。
- 單機隊友、對手、未來多人補位**共用同一套**。
- **誰接球仲裁**（定死）：責任區 → 呼叫鎖定（call 一發即進不可撤銷窗口、其他人退讓）→ 最近者 tiebreak → 固定 ID 序。
  原則：**寧可搶錯，不可互讓**（球落地沒人動是最醜破綻）。
- AI 決策走固定步長決定論純函式（同硬約束 2）。
- 難度：堪打等級（站得住/接得起/打得過來，正確但不玩心理戰、不打刁鑽落點）。堪打≠弱智：接發不漏、舉球不亂傳。

### D4 Intent 管線（`src/input/` 產生、`src/sim/` 消費）
```js
Intent = {
  playerId,   // 對得上 Player.id
  move: vec2, action: 'serve'|'receive'|'set'|'spike'|'block'|null,
  aim: vec2, gaze: vec2, timing: 0..1, tick,
}
```
- 玩家輸入與 AI 決策都輸出同型 Intent，走同一條管線進 sim。
- 觸控/滑鼠映射：拖曳=aim+timing、點按/放開=action、長按=timing 蓄力（細節可先簡版，H1 再精修）。

---

## 骨架完成的定義（先做到這裡停、給我看）

- [ ] `src/sim/` 可在 node 環境跑（零 three.js/DOM），有決定論測試與序列化 round-trip 測試，全綠。
- [ ] 能用「餵 Intent 序列」的方式驅動一局跑完（先不接畫面），輸出正確比賽事件流與最終比分。
- [ ] 11 個 AI 用同一 Intent 管線；誰接球不互讓（寫一個「連續來球」測試驗證不落空）。
- [ ] 同一組 Intent + 同種子 → 兩次執行結果完全一致（決定論驗證）。

**到這裡先停，回報骨架狀態**。H 區（五動作手感、視角運鏡、欺敵曲線、三線索呈現）等骨架綠燈再開，靠試玩迭代。

---

## H 區參數（骨架後才用，先知道有這些可調常數）
- H3 視線欺敵：`θ_max=45°, deceive_gain=0.7, error_gain=0.5`（騙敵線性、失誤平方），全可調。
- H2 視角切換：銜接 3–5 幀過場、保持羅盤朝向，幀數可調。
- 這些是試玩調參用，**不影響骨架結構**。
