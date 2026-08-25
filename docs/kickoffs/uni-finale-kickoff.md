# 大學謝幕卷 kickoff（2026-08-25 開卷）

## 背景事實（開卷前掃描，詳見當日 scratchpad finale-facts）

- U4 末現況＝死路佔位卡：`careerStore.js:183` 的 `chapterCompleted` 守衛讓 `advanceSeason`
  在大四末直接 return false，封存/換血 RMW（187-265）不執行 → **U4 當屆名次與統計不在
  `career.seasons`**（只有 U1→U3 推進留下的 3 筆）。
- 簡子嵐/曾家松送別句（`uniGraduation.js:15-20`）為批 4 預埋，**目前無任何可達路徑**：
  `uniGraduationLines` 只掛在 U1–U3 屆間推進；U4 末走純佔位卡（`careerScreen.js:2629-2647`）。
- ROADMAP 決策 7 已拍板世界觀＝高中→大學→成人/企業→職業；「下一章」是成人/企業聯賽，
  但其定位等該卷開卷再拷問，本卷不寫死。

## 六題拍板（2026-08-25，全照建議）

| # | 題 | 裁定 |
|---|----|------|
| 1 | 範圍 | 只做大學收尾（儀式＋U4 封存＋送別＋下一章入口佔位）；成人/企業章本體另開卷 |
| 2 | 解鎖時機 | U4 聯賽全打完（`seasonConcluded`）才亮謝幕鈕；未打完顯示禁用理由 |
| 3 | U4 封存 | 謝幕觸發時把 U4 名次＋統計正式寫進 `career.seasons`（四年齊全、🏆 計數含 U4） |
| 4 | 儀式形式 | 輕量卡序列（四年回顧→同屆送別→第二章・完），不加互動比賽；畢業紀念賽記入職業卷前構想清單 |
| 5 | 送別範圍 | 同屆畢業生對玩家說（簡/曾具名＋其他同屆三級送別），玩家一句收束自白；學弟不發言 |
| 6 | 入口文案 | 終卡出口＝「下一個舞台・敬請期待」＋回生涯頁；save 補謝幕完成旗標供未來章節讀取；不點名成人/企業 |

## 批次計畫

- **批 1（資料/狀態機）**：U4 季末結算入口（封存＋旗標＋冪等＋未打完不結算）；
  `advanceSeason` 既有擋線行為不變。驗收＝`acceptance-uni-finale-batch1.md`。
- **批 2（儀式 UI）**：謝幕鈕 gating、三段卡序列、送別接線（預埋句轉可達）、終卡出口；
  儀式恰好觸發一次批 1 結算。驗收＝`acceptance-uni-finale-batch2.md`。

文案（回顧措辭、自白句、終卡句）屬提案、試玩後可調；驗收凍結的是「存在＋可達＋資料正確」，
不凍結逐字。

## 流程（沿大二卷可複製流程）

每批：凍結驗收（commit 落點）→實作→改前 worktree 紅驗證（junction node_modules）→
全套 node --test＋sim-hash 34772c06e02243fd 不動→fresh 對抗覆審→修 findings→反駁式送審→
部署→回填結案節。

## 批 1 結案（2026-08-25，main f4ace47）

B1-1~B1-5 全過（`tests/uni-finale-batch1.test.mjs`，fixture 全走真實引擎）。
`settleUniFinale()`＋`uniFinaleSettled()`（`careerStore.js:390-424`），重用 advanceSeason
同一份封存事實來源。改前紅＝69e4265 worktree 行為級證明（U4 末 seasons 卡 3 筆）。
覆審 1 HIGH（缺章節末年守衛，U1–U3 季末會封假結局鎖死旗標）已修（f4ace47，判準
逐字同 advanceSeason:183；修前紅於 98b8c4c worktree、行為斷言）；反駁式送審判
「真的修好」，並掃過旁路：`finaleSettled` 唯一寫入點即本函式，無第二條路。
1716 綠、sim-hash 34772c06e02243fd 同基準。

## 批 2 結案＝全卷關卷（2026-08-25，main 6dfd9f0）

B2-1~B2-5 全過（`tests/uni-finale-batch2.test.mjs`，走真 UI 路徑）。三段卡序列
（回顧→送別→終卡）＋gating（打完才可謝幕）＋簡子嵐/曾家松預埋句轉可達＋終卡
「下一個舞台・敬請期待」（不點名成人/企業）。同屆判定重用 uniSeasonTurnover
（grade>=4），學弟不發言（講者集合斷言）。結算接線＝首次進儀式呼叫
settleUniFinale 恰一次、重看冪等。

**改寫聲明**：`tests/uni-season-wiring.test.mjs:293-346`（大二卷批 4「點一次謝幕鈕
＝佔位卡」）依本卷拍板題 4＋B2-2 改寫為三段序列——「第二章・完」斷言保留（走完
①②③後仍必驗）、「無推進鈕」斷言原樣保留，斷言只多不少（覆審逐條比對確認無變寬）。
測試註解已點名依據。

覆審 0 C/H＋1 MEDIUM（settleUniFinale 回傳值被丟棄，壞存檔時儀式靜默照播、U4
永遠沒封存）已修（6dfd9f0：首次進入且結算失敗→擋下明示；修前紅於 f075441
worktree、行為斷言）；反駁式送審判「真的修好」（真值表四格全對、B2-4 重看不受
影響）。遺留 1 LOW＝失敗文案在 writeSave 理論失敗邊界下寫死「學校資料解不開」
略失準，不影響擋下行為，留待下輪。

1722 綠、sim-hash 34772c06e02243fd 同基準。

★ 大學謝幕卷全卷關卷 ★ 試玩：`?devseed=quarter&devslot=3&devuni=<校id>:4` 打完
大四聯賽→「四年打完了——謝幕」。回顧/自白/終卡文案屬提案，試玩後可調。
掛帳照舊：成人/企業章（下一章本體，含入口定位拷問）、職業卷構想（贊助商球衣）、
stands 接線、careerState.js:335 ROLE_ORDER 收斂、上述 1 LOW。
