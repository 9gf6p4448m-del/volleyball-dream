# Phase 3 W4 討論引導 — 招募判定（帶去 Claude.ai 產任務書用）

> 2026-07-23 起草。搭配閱讀：`docs/phase3-w3-status.md`（W3 結案快照，§9＝W4 接口現況）、
> `docs/kickoffs/phase3-kickoff.md`（Phase 3 六題拍板）。
> 目的：把 W4 的開放問題列清楚，讓討論直接產出可開工的任務書。

## W3 之後的現況（一段話）

名冊＝具名 7 人（玩家＋5 隊友＋自由人小守）、招募空位 3（capacity 10）；先發編排上線
（5-1 對位強制、trust 跟人、7.7 預檢）；`recruitment: { progress: {}, recruited: [] }`
仍是空殼零讀寫。W4 要讓對手隊的招牌球員可被招入、進名冊、可排先發。

## 已拍板、不重開（討論時直接沿用）

- **招募＝條件制**（勝利招募機率制已否決）：越強的球員條件越苛；條件進度**跨賽季累積**
- 每隊 1 名招牌球員；名冊上限 10（一屆招滿 3 空位）
- DNA 承來源隊：teamId=對手 id、style/tag 承 opponents.js、屬性生成傾向承 level+attrBias
- trust 跟人（`lineup.trust` 以 member id 為鍵）；先發 5-1 對位強制；玩家恆在先發
- 命名工程留 Phase 3 收尾一次性做（W4 新隊員名字先用預設稿）

## 開放問題（要在討論中拍板的）

1. **招募條件長什麼樣？** 候選軸：對該隊的勝場數／對戰中的個人表現（如對他隊拿 N 次
   MVP 級數據）／特定劇情事件（如決賽擊敗天鷹）。每隊招牌球員各設一條？還是同一套
   模板參數化？條件要玩家「看得到進度」嗎（UI 顯示 2/3）？
2. **五隊招牌球員是誰？** 位置配置建議與名冊互補（現缺：第二 OPP、第二 S、第三 OH…）。
   各隊 style 對應的招牌位置：北原 steady→？、白浪 defense→L 或 OH？、曜石 quick→MB？、
   鐵霧 serve→OPP/發球手？、天鷹 power→OPP？——**招來的人要能排進 5-1 對位**，
   位置配置直接決定排陣器的新自由度。
3. **招募入隊的時點**：達成條件即入隊（賽後彈通知）？還是賽季末統一結算（W5 輪迴接口）？
4. **新隊員初始屬性**：承 DNA（level+attrBias）直接生成？年級與成長分檔怎麼給
   （轉學生設定＝幾年級）？trust 初值——W3 拍板要**顯式寫入 `lineup.trust`**（勿依賴
   缺鍵回退 20），給多少？
5. **中途換人／輪轉替補要不要進 W4？** 這是 `cancelFaultPoints`（7.7.2 追溯扣分）的
   真實觸發源（呼叫點已定死在 game.js performServe，見 W3 快照 §3）。若 W4 只做
   「賽前排陣選誰上場」不做賽中換人，7.7 追溯扣分繼續 dormant 到 W5/W6——也完全成立。
6. **排陣器一般化**：名冊 >7 人後，`DEFAULT_STARTERS` 硬編碼要改為動態預設序；
   排陣器要加「板凳區↔先發區」的選人層（誰上場）＋既有「同角色互換」（誰站哪）。
   對位規則此時的體驗：同角色多人競爭同一先發槽＝真實的位置競爭敘事。
7. **驗收閘怎麼設**：招募後平衡會上移（名冊變強）——三臂 balance 治具要加
   「招募臂」對照嗎？決定論閘照舊（quick match 不吃名冊）。

## 技術接口備忘（任務書可直接引用）

- 空位：`openSlots()`＝3；成員形狀＝`{id,name,origin,role,attributes,growth,dna}`＋height/persona
- 招募資料層：`save.recruitment.progress[opponentId]`（條件進度，跨賽季）＋`recruited[]`
- 入隊寫入點：members push＋`lineup.trust` 顯式寫初值；排陣器選人層讀 `openSlots`/members
- 7.7 啟用條件註解在 game.js performServe（搜「cancelFaultPoints」）
- 平衡治具：`tools/balance-sim.mjs`（n≥300、VD_NO_ROSTER/VD_NO_GROWTH 開關）
