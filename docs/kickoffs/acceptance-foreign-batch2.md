# 國外聯賽卷 批 2 驗收（動手前凍結，2026-08-27）

基準：HEAD=93ec54d、`npm test` 2082 全綠。範圍＝迴圈接線：careerStore.js／
careerState.js（seasonConcluded）／proSchedule.js（僅 F2-14 對稱前綴）／devSeed.js／
main.js（devforeign 消費）。不碰 careerScreen.js（批 3）。首約恆國內已定
（enterPro 恆拒海外 id，批 1 覆審拍板）——本批不放寬。

- F2-1 `npm test` 全綠（既有 2082 條零紅）。
- F2-2 seasonConcluded：海外季（round==='foreign'）循環未滿→false；循環＋玩家季後賽
  全有結果→true；國內季行為不變。壞版實測＝filter 漏併 'foreign'→海外季落到高中
  分支誤判（此測必紅）。
- F2-3 saveCareer 匯合點：海外季寫入結果後 growForeignSchedule 長季後賽（循環滿→semi、
  semi 勝→final、敗不長）；國內季仍走 growProSchedule（依 isForeignTeamId(career.pro)
  分流）。
- F2-4 advanceSeason 海外季：結算先於推進守衛照舊（proTeamById 解析已涵蓋海外，
  批 1 覆審記入的 268 行語意在此兌現＝解析成功即放行）；重建賽程＝buildForeignSchedule
  恰 6 場；proFinaleSettled 重置＋proGrowthPending 同一次 RMW；滿十年
  （chapterCompleted）含海外年恆擋推進。
- F2-5 settleProFinale 海外季：proRank 取自 foreignTable（∈1..4）；proFinish 四態
  沿用 proFinishOf；封存列 pro=海外 id、salary 照合約；865 行守衛對海外 id 放行
  （解析已涵蓋）。backfillProMultiyear（1075）對海外 id 不炸不誤補。
- F2-6 foreignUnlocked(save)：國內職業季封存曾 proRank≤2 或 proFinish==='champion'
  →true；無成就→false；成就只出現在海外季封存→不計（門檻認國內證明）。
- F2-7 proTransferOffers：未解鎖＝與改動前集合逐值相同（零海外）；解鎖且在國內＝
  原國內集合＋海外 4 隊；在海外＝其餘海外 3 隊＋國內全階（proOffersFor(1) 語意，
  提案）；排除現隊恆成立。壞版實測＝解鎖守衛拿掉→未解鎖存檔冒出海外 offer（必紅）。
- F2-8 transferPro 海外互轉：offer 守衛與 proTransferOffers **同一來源函式**（不得
  各算各的）；members=buildForeignMembers／schedule=buildForeignSchedule／salary 經
  league 分派＝foreignRenewalSalaryFor；trust 重置＋proRankTrustBonus；守衛全綁 prev
  讀值；國內→海外→國內來回各一條鏈測（回國後 schedule 恰 pro-r1..r7、薪水回國內表）。
- F2-9 ?devforeign=<海外隊id>：走正式鏈＝devpro 同款先入國內職業（固定母隊）→
  合成國內職業季前二/冠軍成就→settleProFinale→transferPro 入海外；落地
  career.pro=海外 id、schedule 恰 foreign-r1..r6、contract.salary=海外表值；
  壞 id／國內 id 回 null 不啟動；與 devpro/devcorp/devuni 優先序文件化。
- F2-10 逐值重演：同 RMW 鏈（含海外季結算→推進→轉隊）重演兩次，localStorage
  序列化字串全等。
- F2-11 既有 pro/multiyear 全部測試零紅（國內零漂移機械證據）。
- F2-12 每道新守衛刪除突變恰紅一條，紀錄寫測試檔頭（可重現格式：刪哪行→哪條紅），
  「壞版必紅」至少實測 F2-2 與 F2-7 兩條。
- F2-13 屆間三選一在海外季照常運作（proGrowthPending 鏈一條測：海外季末三選一
  可選、傳承 clamp 90 護欄不因海外隊友 cap 90 而失真——傳承對象是名冊成員，斷言
  加成後仍 ≤90）。
- F2-14 growProSchedule 對稱前綴（批 1 覆審 MEDIUM）：semiEntry 查找加 id 前綴檢查
  （pro-semi）；既有國內季後賽測試零紅。

數值（回國全階開放、母隊選擇）屬提案；凍結的是上述性質。

---
【追記 2026-08-27（主對話裁定，02 §2.1 例外：字面錯到任何正確實作都過不了）】
F2-12「每道新守衛刪除突變恰紅一條」的「恰一條」只對葉節點守衛成立（實測③④恰 1 紅）；
前置閘（seasonConcluded 併 foreign／saveCareer 分流／transferPro toForeign）被刪除時
下游測試必然連帶紅（19~25 條），要湊「恰一條」唯有 mock 掉前置閘＝違反 02 §6.1 第 3 條。
裁定：前置閘以「≥1 紅且紅因可歸因」為準、葉守衛維持恰一紅；此修正不提高任何壞實作的
通過機率（紅得更多、不是更少）。原凍結其餘條文不動。
