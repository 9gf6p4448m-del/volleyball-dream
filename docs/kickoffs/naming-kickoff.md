# 命名工程 Kickoff（已拍板，可直接開工）

> 2026-07-25 Sawmah 拍板完成。接手 session 讀本檔＋`docs/phase3-w7-status.md` 即可動工。
> 慣例照舊：試玩需求直接 commit＋push＋deploy:pages；改 sim 必跑 npm test（現 389 綠）。

## 拍板結果

1. **方向 C：意象字號系統**——對手每隊一個意象字族、全員名字從隊魂延伸；
   我方是創隊雜牌軍，名字**不必**統一字族（各有來歷），既有暱稱（大山、阿哲…）保留。
2. **我方校名＝遊隼高中**——意象：地表最速生物、俯衝（＝扣球）、獵手對獵手。
   決賽敘事線：「天鷹統治天空的高度，我們統治天空的速度」。
3. **王牌稱號：要**——七隊王牌＋我方隊長各一個輕稱號（播報偶爾喊，雜兵不加）。

## 硬性約束

- **台灣用語鐵則**（Sawmah 07-25 糾正「咱」）：全繁體＋避中國慣用語
  （咱/立馬/視頻/質量→品質/水平→水準/信息/默認/屏幕/網絡）。台味語感加分。
  順手改掉程式註解兩處「質量」（matchControls.js CHARGE_MS 註解、game.js TOUCH power 註解）。
- **存檔相容**：我方 STARTER_DEFS 的 `name`（大山、阿哲…）**不改**（玩家已熟＋
  存檔存的是 name）——命名工程對我方＝**補 fullName 欄**＋潤 persona。
  招募生名（小磐/阿霜/阿鷹/小嵐…RECRUIT_DEFS）已是意象系雛形，保留為「入隊後的
  隊內暱稱」；對手名單裡同一人用全名（例：曜石第二人全名帶石部、挖來後隊裡叫小磐）。
- 名字是「預設稿」：ensureStarterRoster 不覆蓋已改名（既有機制不動）。

## 範圍（全專案 34 處 TODO(naming)＋以下）

1. **我方遊隼高中**：STARTER_DEFS 六人補 fullName＋persona 潤稿；隊長大山＝
   稱號一個（「沉默高牆」方向可沿 persona）；「A 隊」語感處全面改「遊隼」
   （careerScreen/commentary teamLabel「我方」可保留、隊名顯示處補）。
2. **對手 7 隊具名化**：opponents.js 每隊加 squad 六人名（槽序 S/OH/MB/OPP/OH/MB，
   對齊 heights）＋自由人名＋`ace: { slot, name, title }`；careerState.js
   buildOpponentTeam 改吃具名（棄「隊名+N號」）；buildLibero('B', …) 吃具名。
   字族：北原工商=穩定字（正/恆/定/律）、白浪=水部（濤/洄/潛/泓）、曜石=石部
   （曜/磐/礪/巖——王牌名帶「曜」，persona 已埋「阿曜」）、青嵐水產=風字
   （嵐/颯/迴）、鐵霧工業=冷字（霜/凜/冽/鋒）、黑松實業=木部（松/柏/樺/森）、
   天鷹學園=飛禽（鷹/翎/雕/翔）。王牌位置依隊風格（曜石=MB、鐵霧=發球手、
   天鷹=OH、白浪=自由人、青嵐=S、黑松=MB、北原=S）。
   **一致性**：招募對象（RECRUIT_CONDS 各隊招牌/第二人）＝名單裡同一人——
   對手 squad 的該員全名要與 RECRUIT_DEFS 暱稱呼應（挖角敘事才成立）。
3. **events.js speaker 具名化**：「隊長（MB）」→大山、「二傳（S）」→阿哲、
   各校角色（北原工商・隊長等）→對應具名＋稱號；EXPEL_LINES/SEASON_OPENERS/
   OFFSEASON_TRAINING_LINES 潤稿。
4. **W7 台詞批潤稿**（全部掛 TODO(naming) 的）：體力播報三句（commentary）、
   暫停教練圈＋選項鈕文案（matchLoop/matchStage）、回場鈕「🔥 回到場上」、
   低體力教練建議、舊隊情結 D1 對話模板＋D3 播報句、氣勢滿檔字卡、
   「往前一步就能攔網」提示、換人敘事兩句、入隊宣言（recruitPortrait JOIN_LINES
   依 role 分池）、學招預告教練台詞。潤稿原則：意象收斂、台味自然、熱血不中二。
5. **表現層一致**：LED 廣告板（arena.js「排球夢/SAWMAH SPORTS/NIGHT MATCH」）
   可加「遊隼」元素（選配）；隊友卡顯示 fullName。
6. **測試**：名單一致性測試（squad 六人名非空且唯一、ace slot 有效、
   RECRUIT_DEFS 對應隊存在）；既有測試若斷言 speaker 字串要同步。

## 建議交付順序

資料層（roster fullName＋opponents squad＋buildOpponentTeam 接線＋一致性測試）
→ speaker/台詞潤稿批 → 表現層（隊友卡 fullName/LED 選配）→ 全套測試＋
瀏覽器實測（對手名字上標籤/播報/入隊卡）→ commit＋deploy → 命名總表回填本檔
（Sawmah 過目逐個否決制——名字他不喜歡的再改）。

## 已知現況錨點

- 我方：阿哲S(2年)/大山MB(3年,隊長)/阿烈OPP(2年)/小飛OH(1年)/阿岩MB(2年)/
  小守L(1年)＋主角A2(玩家自取名，不動)
- 招募生現名：阿鷹(sky-hawk OH)/小磐(obsidian-2 MB)/阿霜(iron-mist-2 OH)/
  小嵐(gale-shore S)——其餘 RECRUIT_DEFS 條目開工時讀 recruitment.js 全表
- buildOpponentTeam 在 careerState.js:185；opponents.js 全檔已讀過無驚喜
