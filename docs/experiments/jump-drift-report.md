# 跳躍前飄卷報告（feat/jump-drift，起點 dcd6609）

**結論：停在驗收條件衝突，未宣告完成。** J2 與 J3、J7 與 J3 在正式比賽的真實資料上**與實作無關地**互相矛盾
（改前資料推出的下界：183 筆扣球／後排攻擊中 72 筆任何實作都過不了 J2+J3、21 筆過不了 J7+J3，合計 77 筆）；
J8 在 direct 模式下「跳發」不存在、且該模式畫面＝sim 膠囊本身，不走 matchView。依派工第 4 點停手回報，
未改任何驗收條件。已交付：量測治具、改前基準、可行性下界工具、一版 WIP 實作（未驗收，見 §4）。

## 1. 我對任務的複述（3 行）
1. 只改渲染層：滯空期間 root 沿前進方向平滑飄到 sim 擊球點（扣球／後排攻擊／跳發；跳舉 ≤0.15 m；攔網恆 0），root 離網 ≥0.15 m。
2. 落地緩衝先停在前方，之後約 0.4 s 平滑併回 sim 位置；AI 與玩家操控都要生效；src/sim/** 一行不動、reachAssist 參數不動。
3. 先寫走真實 matchView/animator 鏈路的量測治具、在改前程式碼跑基準，再實作並逐條跑 J1–J9。

## 2. 量法（tools/jump-drift-measure.mjs）
- 開正式生涯比賽（resolveMatchConfig→buildMatchStage→startMatchLoop，同 tools/real-match-browser.mjs），Playwright 虛擬時鐘、no-op 渲染；包一層 `matchView.sync` 只讀結果。
- root＝`u.rig.root.position`；sim＝`a.px+(a.x−a.px)·alpha`（sync 自己的插值）；滯空＝`animator.probe().jumpY>0`（改前就有）；擊球點 H＝TOUCH 那一幀 sim 球 x/z；手＝慣用手腕世界座標。
- 場次：種子 1,2,3（新生涯第一場，對手 jumpServeRate＝0，整場沒有跳發）＋ 1,2,3 對 iron-mist（jumpServeRate 0.45）收跳發樣本。
- 改前基準是在 `git worktree add --detach … dcd6609` 的獨立副本上起 dev server（127.0.0.1:5232）跑的；前 3 場與先前在本工作樹（當時未改 src）跑的一次逐值相同（tick/episode 數一致）。
- J2 字面判準：d_sim＝|H−P0|（P0＝起跳幀 sim 位置）、u＝(H−P0)/|H−P0|、d_render＝(root_hit−root_0)·u。另列參考量 d_simS＝|H−S|（S＝擊球幀 sim 位置＝sim 到位停下的點）。
- J3：起跳幀→落地幀逐幀 root 水平步長與沿 u 增量（畫面幀，治具 rAF 16 ms＝60fps）。

指令：
```
npx vite --host 127.0.0.1 --port 5232 --strictPort        # 在 dcd6609 副本
JD_BASE_URL=http://127.0.0.1:5232 PLAYWRIGHT_MODULE=<playwright> node tools/jump-drift-measure.mjs --label before
node tools/jump-drift-feasibility.mjs <measure-before-raw.json>
```
（raw 檔 70 MB 未入 repo，可用上面指令決定論重產。）

## 3. 改前基準（docs/experiments/jump-drift-evidence/measure-before.json）

| 類別 | 筆數 | d_sim p50 / max | d_render p50（ratio min） | J2 不過 | 手球落差 p50 / max | J3 單幀最大步長 |
|---|---|---|---|---|---|---|
| 扣球（前排） | 166（6 場） | 1.487 / 2.077 m | 0.725 m（−0.09） | 166/166 | 0.993 / 1.501 m | 0.150 m |
| 後排攻擊 | 17（5 場） | 1.541 / 1.624 m | 1.042 m（0.53） | 17/17 | 0.846 / 0.976 m | 0.103 m |
| 跳發 | 31（3 場） | sim 擊球點＝腳下（game.js performServe `ball=actor`），d_sim＝0 | — | — | — | 0.187 m |
| 跳舉 | 37 | 0.685 m | 0.199 m | — | 0.658 m | 0.105 m |
| 攔網 | 417 | — | — | — | — | 0.085 m |

- J4 基準（扣球＋後排，n=183）：中位數 **0.980 m**、最大 **1.501 m**。
- 改前 d_render 不是 ≈0：sim 在畫面起跳那一刻多半還在跑（P0 離擊球點 ~1.5 m，sim 到位點 S 離擊球點 ~1.0 m），root 跟著 sim 跑＋reachAssist 根位移。J2 在改前 183/183 全紅（探針會紅）。
- J1 基準：`node tools/sim-hash-probe.mjs` → 「✅ 行為逐值相同（合計 0a948ad2b9895d49 ＝ 基準）」；`npm test` → tests 2613 / pass 2613 / fail 0。

## 4. 為什麼停：條件衝突（與實作無關的下界）

`node tools/jump-drift-feasibility.mjs <raw>` → `{"n":183,"infeasibleJ2vsJ3":72,"infeasibleJ7vsJ3":21,"either":77}`

1. **J2 × J3**：三速扣球由 matchLoop 在「距擊球 ≤24 tick」起跳（TAKEOFF_LEAD_TICKS），起跳→擊球 p50 23 tick；
   此時 sim 攻擊手還在以約 3.3 m/s 跑，P0 離擊球點 p50 1.49 m。J2 要 root 在 23 幀內走 ≥0.8×1.49＝1.19 m，
   J3 限每幀 ≤0.05 m（＝3 m/s）最多 1.15 m。root 位移含 reachAssist 也不會變多（J3 量的就是 root 總位移）。
   → 72/183 筆連「每幀都跑滿 0.05」都到不了。
2. **J7 × J3**：sim 攻擊手擊球後立刻往後場退（實測約 3–4 m/s），畫面上人還要在空中 ~0.3 s；J3 不准空中倒退，
   於是落地時 root 與 sim 差 ≈ 前飄距離＋sim 後退距離（最多 1.8 m）。J7 要落地後 0.5 s 內併回且每幀 ≤0.05 m（最多約 1.5 m）。
   → 21/183 筆無解。
3. **J2 跳發**：sim 的發球擊球點就在發球者腳下，d_sim＝0，「≥0.8·d_sim」恆真，對跳發沒有鑑別力（§6.1 第 6 條恆真）。
4. **J8**：`?mode=direct` 走 `src/app/directPractice.js:349` `view.sync(getDirectPose(state…))`＋`directPlayerView.js`（註解明寫「每個可見肢體就是 sim 膠囊」），不經 matchView；直接操作的起跳是 directGame 物理拋體（助跑速度帶進空中），要改只能改 sim 或讓畫面與碰撞體分離。另外 direct 模式**沒有玩家發球**（`direct-v8-rules-plan.md` 表：「發球（玩家）不存在；跳發之後再議」），「跳發 ≥3 筆」恆假。

需要使用者裁定的選項（建議先表態 A）：
- **A（建議）**：J3 速度上限改以 sim 助跑速度為準（例如每幀 ≤0.07 m≈4.2 m/s，真人扣球助跑水平速度 3–4 m/s），J7 併回期間步長同樣放寬到 0.07；J2 跳發改驗「名目前飄距離＋不過網」；J8 改驗「正式比賽的玩家操控者（A2）」或整條移出本卷。
- B：J2 的 d_sim 改為「到位點 S→擊球點」且只從 sim 停下那一幀起算；仍需放寬 J3 或接受部分樣本不過。
- C：維持條件，改 matchLoop 起跳時機（提早起跳、拉長滯空）——動到扣球節奏與 J9 既有條件，不建議。

## 5. WIP 實作（已 commit，**未驗收**）
- `src/render/jumpDrift.js`（新）：純函式；滯空 root 自己往擊球點飛（≤2.9 m/s、只准朝網、離網 ≥0.2 m），落地停 0.08 s 後 0.38 s 併回；攔網／歡呼／站發恆 0；跳舉 ≤0.12 m；sim 瞬移（>0.5 m）即作廢。
- `src/render/matchView.js`：`stepJumpDrift` 接在 `animator.update` 之後；擊球點估計＝球沿重力拋物線降到身高×1.62 的位置（改前實測觸球高度 p50 1.622×身高），只給最近的滯空攻擊手；飄過的位置餵給塵土／夠球／root／頭上標籤，玩家光圈仍標 sim 位置；外露除錯欄位 `u.jumpDrift`、`u.reachOff`。
- `src/render/geoAnimator.js`：`probe()` 多回 airT/airDur（唯讀）。
- `tests/jump-drift.test.mjs`：6 條純函式單測綠。
- 冒煙量測（種子 1、前 7000 tick，非正式）：扣球 d_render p50 0.72→1.08 m、手球落差 p50 0.96→0.74 m；但已知問題：
  ① reachAssist 根位移在空中變化快，root 單幀仍有 0.07–0.10 m；② 擊球後 sim 後退使落地偏移達 ~2 m，J7 不過；
  ③ 誘餌／跳舉因 sim 在空中照跑，偏移達 1.2–3 m（J6 跳舉不過）。這些要等條件裁定後再調。
- 未跑：全量 after 量測、npm test 全套（只跑了相關 5 檔 124 條＋新增 6 條，全綠）、J9 回歸。

## 6. 範圍外發現（只列不修）
- 改前 root 在空中就會倒退：sim 攻擊手擊球後立刻回防、root 跟著 sim 走，畫面上是「空中往後飄」（J3 改前 166/166 扣球不過：單幀步長最大 0.150 m、沿前進方向最大倒退 0.117 m／幀）。
- 預設新生涯第一場的對手 jumpServeRate＝0，整場沒有任何跳發（只在 iron-mist 等隊出現）。
- 精華重演用同一個 `matchView.sync` 餵複製狀態，會讓逐人狀態（本卷的前飄、既有的 lastDived 等）被重演幀打斷；本實作以「sim 單幀瞬移 >0.5 m 即作廢」防護。
