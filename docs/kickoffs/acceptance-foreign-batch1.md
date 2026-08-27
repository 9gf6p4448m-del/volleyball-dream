# 國外聯賽卷 批 1 驗收（動手前凍結，2026-08-27）

基準：HEAD=9d1a03f、`npm test` 2057 全綠。範圍＝純資料層：
`src/career/foreignTeams.js`（新）＋`src/career/foreignTeam.js`（新）＋
`src/career/foreignSchedule.js`（新）＋`src/career/proTeams.js`（併 BY_ID＋薪水分派）
＋`src/career/proSchedule.js`（僅加對稱守衛）。不碰 careerStore/careerScreen/main。

## 驗收條件（逐條要能指出「什麼實作會讓它變紅」）

- F1-1 `npm test` 全綠且既有 2057 條零紅（新增測試另計）。
  紅法＝任何既有行為被動到。
- F1-2 FOREIGN_TEAMS 恰 4 隊；每隊欄位鍵集合＝PRO_TEAMS 各隊鍵集合 ∪ {league}，
  且 league==='foreign'；id 在五張表（opponents/universities/corporations/
  PRO_TEAMS/FOREIGN_TEAMS）全域唯一。紅法＝漏欄位、撞 id。
- F1-3 併表後 `proTeamById(海外id)` 回海外定義、`proTeamById(國內id)` 回原定義；
  `PRO_TEAMS` 仍恰 8 隊（陣列消費點不受併表影響）。紅法＝把海外隊塞進 PRO_TEAMS 陣列。
- F1-4 薪水分派：`proBaseSalaryFor(海外隊)`＝海外底薪表值；`proRenewalSalaryFor(海外隊,
  r∈1..4, finish)` 對 r 單調不增、champion 係數＞final、回傳恆正整數。
  紅法＝分派突變（海外隊落回國內表）——**壞版實測**：註解掉 league 分派後此組必紅。
- F1-5 國內薪水逐值不變：國內 8 隊底薪＋（8隊×rank1..8×4 finish）續約矩陣與改動前
  實算值全等（測試寫死改動前跑出的數字，不得改動後才生成）。紅法＝分派改到國內路徑。
- F1-6 buildForeignSchedule：恰 6 場（雙循環＝其餘 3 隊各恰 2 次）、round==='foreign'、
  id foreign-r1..r6、玩家隊不在對手列、同 seed 決定論（deepEqual 重呼叫全等）。
- F1-7 foreignTable：playerRank∈1..4；純函式決定論；只結算玩家已打輪次。
- F1-8 growForeignSchedule：循環 6 場全有結果→長 semi（4 隊全晉級，種子恆含玩家）；
  semi 勝→長 final、semi 敗→不長；已長過／未打完→回**原陣列參考**（冪等）。
  季後賽 round 沿用 'semi'/'final'、match id 用 foreign- 前綴不與 pro- 撞名。
- F1-9 buildForeignMembers：7 人（6 先發＋自由人）、成員鍵集合與 buildProMembers
  逐一相同、attrs 全落 [30,90]、決定論。
- F1-10 對稱守衛：`buildProSchedule({teamId:海外id})` 回 []（不 throw）；
  `proTable({teamId:海外id})` 回空結果物件；foreign 版拿國內 id 同樣回空。
  **壞版實測**：守衛拿掉後海外 id 進 buildProSchedule 必 throw（reduce 無初值）。
- F1-11 每道新守衛做刪除突變恰紅一條對應測試（多年卷教訓 2），突變紀錄寫在
  測試檔頭註解（可重現：註明「刪哪行→哪條紅」）。

數值（1900/1300、31、[1.35,1.2,1.05,0.95]、level 95/94/92/91、clamp 90）屬提案，
凍結的是上述性質。
