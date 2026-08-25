# 驗收凍結 — 成人/企業章 批 1（純函式與資料層，零 UI 接線）

> 凍結時點：2026-08-25，落點 main@0a884da（本檔 commit 即凍結，改動照 02 §2.1 程序）。
> 卷宗＝`docs/kickoffs/corporate-chapter-kickoff.md`。每條都要能答「什麼實作會讓它變紅」。

## A1-1 章節狀態機認得企業章
- `CHAPTER.CORPORATE === 'corporate'`；`normalizeChapter({chapter:{id:'corporate',enteredAtSeason:8}})`
  回 `{id:'corporate', enteredAtSeason:8}`（不被回退成高中——漏加 KNOWN 就紅）。
- 未知值（`'pro'`、亂字串）仍回退高中（既有回退測試不得紅）。

## A1-2 enterCorporate 純函式
- 從大學章區塊呼叫 → 回 `{...原鍵, chapter:{id:'corporate', enteredAtSeason:<傳入值>}}`，
  不改傳入物件（純函式）。
- 冪等：已是企業章再呼叫 → 原樣回傳，`enteredAtSeason` 與其餘鍵（school、finaleSettled）
  不被覆寫（覆寫就紅）。

## A1-3 年限＝1（階段一拍板題 3）
- `CHAPTER_SEASONS.corporate === 1`；`chapterCompleted({id:'corporate',enteredAtSeason:8}, 8) === true`
  且 `(…, 7) === false`（用全域屆數 8 進章當例）。

## A1-4 corporations.js 八隊資料表
- 匯出 8 隊；每隊欄位集合 ⊇ universities.js 同構欄位
  {id, kit{jersey,shorts,trim,libero}, name, tier, level, attrBias, roleBias, trustBias,
  heights(6), squad(6), libero, ace{slot,name,title}, ai}——逐隊機械檢查（缺欄就紅）。
- `corporationById('不存在')` 回 null/undefined 不炸。
- 王勝翔＝某強豪階隊伍的 `ace.name`（找不到就紅——伏筆 events.js:502 的兌現）。
- 8 個 id 互異、8 套 kit 主色（jersey）互異（撞色就紅）。

## A1-5 buildCorpMembers
- 對全部 8 隊：回傳名冊長度與欄位形狀同 `buildUniMembers` 輸出（逐欄位鍵集合比對）；
  heights 帶入該隊表值；決定論（同隊兩次呼叫結果 deepEqual）。

## A1-6 corpSchedule
- `buildCorpSchedule({corpId, seed})`：玩家隊 7 場（8 隊單循環）、每場 `round === 'corp'`、
  對手涵蓋其餘 7 隊各一次（少一隊/重複就紅）；決定論（同 seed 兩次 deepEqual）。
- `corpTable`：8 隊名次表、勝點制 3/2/1/0（bo3：2-0/2-1/1-2/0-2）——造一組已知結果
  斷言積分逐值（算法寫錯就紅）。
- 高中 `schedule.js` 與大學 `uniSchedule.js` 零改動（git diff 不得含這兩檔）。

## A1-7 邀約集合（uniRank → 隊階）
- 純函式 `corpOffersFor(uniRank)`：rank 1–2 → 三階全開；3–6 → 中堅＋保底；
  7 以上與壞值（0/null）→ 只保底（★階梯數字屬提案，試玩可改；凍結的是「單調：
  名次越好集合只增不減」與「任何輸入非空」兩條性質——違反其一就紅）。

## A1-8 高中 advanceSeason 守衛擴充
- `careerState.advanceSeason` 對含 `round:'corp'` 賽程的 career no-op 原樣回傳
  （比照 `'league'` 守衛 careerState.js:197；漏擋＝高中賽程蓋進企業章就紅）。

## A1-9 全套與基準
- `npm test` 全綠、測試數只增不減；`tools/sim-hash-baseline.json` 的
  `34772c06e02243fd` 不動（本批不碰 src/sim/）。

## 改前紅
- 新測試在 0a884da worktree 上跑須紅；紅因若僅是 import 不到新檔（旁枝），
  依大二卷慣例以壞版自證補行為級紅（至少一條：改壞 corpSchedule 勝點表後對應斷言紅）。
