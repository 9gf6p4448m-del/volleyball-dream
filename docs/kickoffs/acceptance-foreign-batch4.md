# 國外聯賽卷 批 4 驗收（動手前凍結，2026-08-27）

基準：HEAD=45c37ed、`npm test` 2140 全綠。範圍＝敘事層：新 foreignEvents.js＋
proEvents.js（proClosingLines 出海條件句）＋消費端接線（同 proWang 慣例掛點）。

- F4-1 `npm test` 全綠（既有 2140 條零紅）。
- F4-2 簡子嵐海外重逢：條件＝海外聯賽場（matchEntry.round==='foreign'）首次觸發
  且大學名冊封存含 fullName '簡子嵐'（proClosingLines 同款判準）；career/season
  events 旗標一生一次（重播守衛）；名冊無她→不觸發任何新事件、不造新角色。
- F4-3 接線掛點與資料流同 proWang 慣例（同一消費點、同一已播旗標機制）；
  非海外場（round!=='foreign'）恆空陣列。
- F4-4 proClosingLines：玩家已出海（seasons 含海外季或現隊海外——判準吃封存/現況，
  不另立旗標）→首句換出海版文案（不再「遠得像傳說」）；未出海輸出與改動前逐字
  相同（零漂移錨定斷言）；簡子嵐傳聞句條件照舊。
- F4-5 王勝翔線海外零觸發：海外場（round==='foreign'）餵進 proWang 事件函式恆空
  （既有 round!=='pro' 守衛，驗一條防回歸）。
- F4-6 每道新守衛（重逢旗標一次性、名冊判準、round 判準）刪除突變恰紅一條，
  紀錄寫測試檔頭（真的做過才寫）。

文案屬提案；凍結的是上述性質。
