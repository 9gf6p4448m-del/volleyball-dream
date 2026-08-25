# 隊伍配色卷 批 3（批 1 遺留三項）— 驗收條件（2026-08-25 凍結，02 §2.1）

> 動手前凍結。凍結時 repo 基準＝main `5a0cfb9`（工作樹乾淨）。
> 範圍拍板（使用者 2026-08-25 三裁定）：
> ① 對陣畫面/賽程表隊色徽章＝**色條/色塊**樣式（非小圓點）
> ② beatStage＝**我方恆穿我方 kit（章節感知）、對手僅在 beat 帶對手脈絡時換裝**
> ③ 觀眾席＝**客隊短邊區塊對所有對手生效**，其餘看台維持各館氛圍盤

## B1 sim-hash 逐值不變＋全套測試綠
`npm test` 全綠（既有 1668＋本批新增），且 `node tools/sim-hash-probe.mjs`
對 repo 基準檔（`tools/sim-hash-baseline.json`，本卷不得改動）逐值相同。
本批為純 UI/渲染層，模擬層不得有任何行為變化。

## B2 對陣畫面色條
- `showMatchupScreen`（`src/ui/careerScreen.js:717`）兩隊名牌各含一條該隊球衣色色條。
- 我方色＝**實際上場的 kit**：高中章＝恆定 `TEAM_KIT.A`；大學章＝校色（與
  `careerState.js:747` `kits.A` 同源，不得另抄一份色值）。
- 對手色＝`kitFor(oppDef)` 的 `jersey`（或 `banner ?? jersey`，實作擇一並在單測釘死）。
- 無 kit 資料的隊：不顯示色條、不炸（單測：`kitFor` 回 null 路徑）。
- 既有語意 tone（enemy 暖/ally 青底，`careerScreen.js:800`）不移除。

## B3 賽程表色塊
- `rowFor`（`src/ui/careerScreen.js:1837-1871`）每列在對手隊名旁加該隊球衣色色塊。
- 色源同 B2 對手規則（同一函式取色，不得兩處各自實作——單測：兩處取色走同一入口）。
- 無 kit 的列回退＝無色塊、不炸。

## B4 beatStage 穿隊色
- 我方 subjects（`teamId:'A'`）恆穿我方 kit，章節感知：高中＝`TEAM_KIT`、
  大學＝校色（同源規則同 B2）。
- 對手 subjects：僅當呼叫端明確傳入對手 kit/隊伍身分時換裝；**未傳＝維持現行
  預設（B 紅）逐值不變**（單測：不傳 kit 時 `createGeoCharacter` 收到的參數與
  現行完全相同）。
- 回報必含 beatStage 全部呼叫點清單、逐點「有無對手脈絡」判定與接線與否；
  零個呼叫點帶得到對手脈絡也算過，但盤點證據（檔案:行號）不得省略。

## B5 觀眾席應援色
- `buildCrowd`（`src/render/arena.js:149-193`）的客隊短邊區塊（`away` 旗標）
  對**所有**對手吃 `kitFor(oppDef)` 的 `banner ?? jersey`（與宿敵橫幅
  `main.js:209` 同回退序），不再限宿敵關鍵戰館。
- 宿敵天鷹關鍵戰館：視覺結果與現行等值（同色）——既有路徑收斂進新路徑時
  以單測釘住「宿敵場景算出的 away 色與現行 awayBanner 色相同」。
- 其餘看台：`spec.crowdColors` 氛圍盤逐值不變（git diff 為證）。
- 結構不變量：仍單一 `THREE.InstancedMesh`（1 draw call）＋決定論 hash 散佈
  （單測：同輸入呼叫兩次，逐 instance 色相同）。
- 無 kit 對手回退＝現行預設 `'#5a7dd8'`（`arena.js:174`），不炸。

## B6 既有畫面與資料不變
- `TEAM_KIT`／`LIBERO_KIT` 逐值不動；存檔 schema（`career/schema.js`）零改動；
  16 隊 kit 色票資料零改動（git diff 為證）。
- 快速比賽（kits=null）：對陣/賽程/觀眾席各回退路徑不炸（既有單測續綠＋B2/B3/B5
  回退單測）。

## B7 瀏覽器層驗證（node 綠不足以放行）
本機 vite 實跑，實際截圖：
1. 生涯對陣畫面：雙方名牌色條可見（我方藍/金＋對手隊色）。
2. 賽程表：多列各自的對手色塊可見且不同隊不同色。
3. 一場**非宿敵**對手的比賽：客隊短邊看台可見該對手應援色。
4. beatStage 場景一張（有對手脈絡者穿隊色；若盤點為零則截「我方穿隊色」場景）。

## 樣式細節屬提案（改樣式不動上述門檻）
色條的粗細/位置/圓角、色塊尺寸、觀眾混色比例＝提案值，使用者看圖回饋即改；
改這些不構成驗收變更。但「有色 vs 無色」「色源走 kitFor 單一入口」屬門檻，不得動。
