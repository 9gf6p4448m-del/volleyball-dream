# 國外聯賽卷 — 開卷卷宗（2026-08-27）

> ★★ 拍板紀錄（2026-08-27 Sawmah，一輪七題全照建議）★★
>
> 開卷依據 ＝ 使用者未試玩即裁定「多年迴圈後段結構性單調」（第 2、3 年後無新內容：
>   傳承/情報網一次性、對手恆八隊、事件只剩年度重逢句），原掛帳門檻「試玩回報單調
>   才開」由使用者直接解除。
> 題 1 入口時機 ＝ **成就門檻制**：國內拿過「年度前二名次」（含奪冠）後，次年季末
>   轉隊窗多出海外 offer。前二而非只限奪冠＝讓無冠存檔也到得了。
> 題 2 規模 ＝ **精簡聯賽 4 隊**：賽制完全沿用現有國內引擎（只換隊伍資料與強度），
>   不做新賽制。
> 題 3 強度 ＝ **只調數值不加機制**：海外隊 attrs 高於國內強權、戰術使用率拉滿，
>   押線判定與 sim 機制零改動（sim-hash 必須不動）。
> 題 4 幣別 ＝ **顯示美金＋括號約合台幣；內部 salary 欄位一律台幣萬單座標系**，
>   匯率定死常數（提案 1:31），不做浮動匯率。防「同名不同義」（02 §6.1-2）。
> 題 5 敘事 ＝ **簡子嵐條件重逢**：她的出海條件成立且主角也出海 → 同場一次性事件；
>   條件不成立就純敘事句，不硬造新角色。王勝翔線終身一次已用畢、不動。
> 題 6 年限謝幕 ＝ **10 年硬上限不變、含海外年**；謝幕卡加海外段落（幾年/戰績/
>   最終隊）；可回國——海外期間每年季末同一轉隊窗可接國內 offer，trust 重置同
>   轉隊代價。
> 題 7 里程碑事件掛帳項 ＝ **不合卷**：海外本身就是後段內容，不夠治單調再另開小卷。

## 一、現況地基（2026-08-27 盤點，HEAD=9d1a03f，主對話親讀＋Explore 地圖）

- **id 解析是全域慣例**：`proTeamById` 在 careerState 68/509/843/931/1026、chapter 202、
  corpEvents 104、careerScreen 216/932/1036/2178/2508/3511/3706、careerStore 268/778/805/
  865/948/1075、devSeed 193 共 20+ 消費點被當「id→隊定義」解析器用（分母已 grep 數過）。
  ⇒ **核心架構決策：把海外 4 隊併進 proTeams.js 的 BY_ID**（id 解析全域通用，上述消費點
  零改動自動支援海外）；`PRO_TEAMS` 陣列消費點（proRounds/proOffersFor/proTable 建列）
  維持純國內 8 隊不動。
- **薪水同座標系**：內部 `career.contract.salary` 一律台幣萬；`proBaseSalaryFor`／
  `proRenewalSalaryFor` 內部依 `team.league==='foreign'` 分派到海外表——呼叫端
  （careerStore 824/975、careerScreen 3526/3577）零改動、不可能混座標（題 4 的機械落實）。
- **賽程檔按章複製**（proSchedule.js 檔頭明文慣例＋收斂掛帳）⇒ 新 `foreignSchedule.js`
  複製 proSchedule.js 換 FOREIGN_TEAMS；round 標記 `'foreign'`；季後賽 round 沿用
  `'semi'`/`'final'` ⇒ `proFinishOf`（careerStore:61-70，按 round 判定）與四態封存
  **零改動**直接適用海外季。
- **seasonConcluded**（careerState:147-172）pro 分支 filter `round==='pro'` ⇒ 海外季
  要併入同一顆判斷式（filter 加 `'foreign'`，兩標記不會同季共存）——單一定義不旁生。
- **growProSchedule 接線**＝careerStore.saveCareer 唯一匯合點（careerStore:200-211）
  ⇒ 海外分支在同一點依 `isForeignTeam(proId)` 切到 `growForeignSchedule`。
- **對手強度資料流**：careerState:509 直接回資料表給 careerMatchSetup（不套
  applySeasonRoster）⇒ 併 BY_ID 後海外對手 level 自動生效；**對手側不 clamp、
  隊友側 clamp 85**（proTeam.js attributesFor）⇒ 海外隊友要另訂 clamp（提案 90），
  否則玩家轉入海外隊後隊友 85 對上對手 94+ 結構性挨打。
- **buildProSchedule 空陣列地雷**：併 BY_ID 後拿海外 id 呼叫國內版，`mine=[]` 的
  `reduce` 無初值會 throw ⇒ 國內/海外兩版都要加「me 不在本聯賽 ⇒ 回空」對稱守衛。
- **成就資料**：冠軍＝`career.seasons[i].proFinish==='champion'`（proRank 是循環名次，
  循環第 4 可能爆冷奪冠，兩者都要看）；門檻判準＝國內職業季 `proRank<=2 ||
  proFinish==='champion'`。
- 簡子嵐條件＝`loadUniRoster()` 名冊含 fullName '簡子嵐'（proEvents:107 同款判準）。
- 測試基準：`npm test`（node --test）**2057 全綠**；存檔層決定論＝逐值重演
  （multiyear-pro-batch1.test.mjs:238 序列化全等），世界層＝determinism.test.mjs。

## 二、範圍＝四批

1. **批 1 資料層（零 careerStore/UI）**：`foreignTeams.js`（4 隊＋league 標記＋匯率
   ＋海外薪水表）＋`foreignTeam.js`（建隊，clamp 90）＋`foreignSchedule.js`（雙循環
   6 輪＋全 4 隊季後賽）；proTeams.js 併 BY_ID＋薪水分派；對稱守衛。
   凍結檔 `acceptance-foreign-batch1.md`。
2. **批 2 迴圈接線**：seasonConcluded 併 foreign；saveCareer grow 分支；advanceSeason
   /enterPro/settleProFinale/transferPro 的海外分支；`foreignUnlocked` 門檻；
   proTransferOffers 海外集合（國內解鎖後附海外 4 隊；在海外＝其餘 3 隊＋回國全階
   開放【提案】）；`?devforeign=<隊id>` 治具。凍結檔 `acceptance-foreign-batch2.md`。
3. **批 3 UI 接線（careerScreen）**：續約窗海外邀約區（🌏）；轉隊卡分組＋美金顯示
   （usdOf 括號約合台幣）；季末卡/首約/續約薪水顯示分派；謝幕卡海外段落（🌏 卡片
   ＋海外 X 年小結）。凍結檔 `acceptance-foreign-batch3.md`。
4. **批 4 敘事**：簡子嵐海外重逢一次性事件（round==='foreign' 首戰＋名冊判準＋
   career.events 旗標，接線同 proWang 慣例）；proClosingLines 出海後語句條件更新。
   凍結檔 `acceptance-foreign-batch4.md`。

### 數值提案總表（試玩回饋即改；凍結的是性質不是數字）

- 聯賽名「寰宇超級聯賽」；4 隊＝霸主 2（level 95/94）＋列強 2（92/91）；隊友 clamp 90。
- FOREIGN_BASE_SALARY：霸主 1900／列強 1300（萬台幣）；TWD_PER_USD＝31；
  續約名次係數（rank1..4）[1.35, 1.2, 1.05, 0.95]；季後賽係數同國內形狀。
- 門檻＝國內 proRank≤2 或 proFinish==='champion'（曾經達成即永久解鎖）。
- 回國邀約＝全階開放（海外資歷）。

## 三、工程地雷（承多年卷教訓）

1. 凍結檔「壞版必紅」要當場實測且探針存檔（多年卷教訓 1）。
2. 每道守衛做刪除突變、恰紅一條；測試目標要落在被測守衛真的被觸及的路徑（教訓 2）。
3. 顯示層新功能別巢進方向相反的既有閘（教訓 3——oppFocus 事故）。
4. 快照取在呼叫之前（教訓 4）。
5. worktree 鑑別力驗證後用 rm -rf .git/worktrees/<name>＋prune 收尾（OneDrive 鎖）。
6. 海外隊數值全屬提案，試玩回饋即改；判定層零改動由 sim-hash 逐值不動背書。
7. **批 1 覆審記入**（2026-08-27）：①CRITICAL 已修＝首約恆國內（devProRequest／
   enterPro 各一道守衛＋tests/foreign-batch1-review.test.mjs，突變實測各恰 1 紅）；
   「守衛語意 vs 解析語意」同源呼叫點 careerStore 268/865/1075（advanceSeason／
   settleProFinale／backfill）＝批 2 接線時本來就要改成支援海外，批 2 驗收須逐點
   蓋到。②MEDIUM 掛帳＝growProSchedule 找 semiEntry 只按 round 不查 id 前綴
   （海外版有查、國內版沒有）——批 2 動 careerStore 接線時順修對稱（加 pro- 前綴
   檢查），凍結檔列明。
8. **批 2 覆審記入（2026-08-27）**：①HIGH＝批 2 單獨部署會讓真人經未改的續約窗轉入
   海外後季末永久卡死（careerScreen proGames 只認 round==='pro'、settleProFinale 唯一
   呼叫點掛在其上）——**書面裁定：批 2 不單獨部署**，批 3 開工即接（F3-10 端到端
   收束為批 3 凍結條）。②三條一行修已當批落地（careerState:233 章節守衛併 foreign／
   advanceToForeign isForeignTeamId 閘／growProSchedule 決賽冪等 pro-final 前綴），
   突變實測各恰 1 紅。③兩題設計裁定留給使用者（收尾時問）：海外「傳承」恆無效
   （海外隊友建隊即 90 封頂、mentor clamp 90 ⇒ +2 恆 no-op 但燒掉一生一次；另
   mentored 記槽位 id 不綁隊，跨隊轉隊會誤判已傳承——此屬多年卷既有債）；回國時
   海外 4 隊名次直接餵國內 8 隊係數表（海外墊底=國內第 4 待遇）。

## 四、結案回填（2026-08-27）

四批全上線：批 1 `93ec54d`（資料層＋覆審 CRITICAL 修＝首約恆國內）、批 2 `f619a3f`
（迴圈接線＋覆審三修）、批 3 `45c37ed`（UI 接線＋HIGH 兌現＋文案零漂移修）、批 4
`7352eee`（敘事層）。收尾送審 APPROVE：前三批覆審修經對抗式重驗全數「真的修好」。
`npm test` 2057→2147 全綠。試玩入口 `?devforeign=<海外隊id>`（aurora-orion／
solar-toro／azure-albatross／schwarzwald-ritter）。

**使用者裁定結果（2026-08-27 Sawmah，兩題同輪）**：題 1＝甲案（無可受益隊友時傳承
灰掉標示「本隊無可傳授」，判準吃「有無屬性 <90 的未教隊友」非隊伍 league，已落地
＋行為測試＋突變恰 1 紅）；題 2＝維持現狀（海外歷練回國按海外名次直入國內係數表，
零改動）。mentored 記槽位不綁隊＝多年卷既有債，照舊掛帳。原題目留檔如下——

**待使用者裁定（批 2 覆審遺留兩題，數值/設計）【已裁定，見上】**：
1. 海外「傳承」恆無效：海外隊友建隊即 90 封頂＋mentor clamp 90 ⇒ +2 恆 no-op 但
   仍燒掉一生一次。選項＝甲：海外季 mentor 選項灰掉標示無效／乙：mentor clamp 海外
   放寬到 92／丙：維持現狀。附帶既有債（多年卷起）：mentored 記槽位 id 不綁隊，
   跨隊轉隊會誤判「已傳承過」。
2. 回國名次座標系：海外 4 隊名次直接餵國內 8 隊續約係數與 trust 加成（海外墊底＝
   國內第 4 待遇）。選項＝甲：維持（海外資歷本來就值錢）／乙：回國名次打折換算／
   丙：改吃 proFinish。

**掛帳（承前）**：海外強度/薪水數值全屬提案試玩即改；宿敵多年變體、後段年份里程碑
事件照舊掛帳。
