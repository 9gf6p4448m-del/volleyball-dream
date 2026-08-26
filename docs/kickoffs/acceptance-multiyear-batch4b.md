# 多年職業生涯卷 批 4B 驗收凍結（2026-08-27）

> 凍結於實作動手前；要改只有 02 §2.1 一條路。基準＝main fbebaaf。
> 範圍＝屆間三選一成長通道（Sawmah 拍板：①聲望②傳承③情報，各有代價/上限）。
> ★數值與文案屬提案★零 sim 判定改動（oppScouting 是**記帳**，sim 行為逐值不動）。

## F1 屆間 pending 鏈

- advanceSeason（pro 分支）與 transferPro 推進時**同一次 RMW** 設
  `career.proGrowthPending=新季屆數`；enterPro（入章首季）不設。
- renderCareer 職業分支：pending 且未收束時，屆間選擇卡先出（早於出戰入口）；
  選定或跳過→清 pending（RMW）；關頁重開仍 pending（中斷復原，HIGH-1 慣例）。
- 什麼實作會紅：pending 與推進拆兩次寫；跳過不能繼續（死鎖）；重開消失。

## F2 三路效果（性質凍結，數值屬提案）

- ①聲望：玩家 trust.fromSetter +N（提案 N=6），Math.min(100) 封頂；可逐年重選。
- ②傳承：名冊選一位隊友，attrs 每項 +M（提案 M=2）、clamp 既有 ATTR_CAP=90；
  **同一隊友一生一次**（career.proGrowth.mentored 記 id）；全員教過＝該路不再列。
- ③情報：`career.proGrowth.intel=true` 一次性解鎖；已解鎖不再列。
- 跳過：「好好休息」＝只清 pending 零效果。
- 什麼實作會紅：聲望破 100；傳承同人重複吃；intel 可重選。

## F3 對手攻擊分佈記帳（情報路的資料源——真情報，非披外衣）

- 賽後（matchCareer 唯一匯合點）把**對手隊**球員的 game.scoutTally zones 聚合，
  累加進 `career.oppScouting[opponentId].zones`（{line,cross,middle,tip}，同
  mergeScouting 座標系）；settledBefore 防重入（累加器閘，同招募/默契慣例）。
- 所有章節都記（資料層中性）；記帳存在與否不改變 sim 任何行為（sim-hash 不動）。
- 什麼實作會紅：重入灌水；記到自己隊的分佈（§6.1-2 同名不同義）；sim-hash 動。

## F4 情報消費端（布置面板槽①）

- `intel=true` 且該對手 oppScouting 樣本 ≥6：槽①盲注文案換成真實分佈顯示
  （直線/斜線/中間/吊球 計數或比例）＋押線鈕照舊；押線**判定**（applyBlockLean）
  零改動——情報只改顯示不改機率。
- 未解鎖或樣本 <6：現行盲注文案逐字照舊。
- 什麼實作會紅：未解鎖也顯示；樣本不足顯示空分佈；判定被動到。

## F5 選擇卡 wiring

- 三路鈕（不可選的路不顯示或灰化並註明原因）＋跳過鈕；連點單效（冪等）；
  字在對的容器；選完回生涯畫面可出戰。
- 什麼實作會紅：連點雙吃；教完全員後傳承鈕仍可按出錯。

## F6 回歸與鑑別力

- 全套綠（2045 起跳）；sim-hash `34772c06e02243fd` 不動；舊章零擾動。
- F1/F2/F3 各至少一條在無實作樹（本凍結 commit）上行為紅；實跑輸出回填。
